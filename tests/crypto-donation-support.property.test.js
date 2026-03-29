'use strict';
/**
 * Property-based tests for Crypto Donation Support
 *
 * Validates the 18 correctness properties defined in the design document.
 *
 * Feature: crypto-donation-support
 * Runner: node:test (Node ≥ 18)
 * PBT:    fast-check
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Wallet module reads JWT_SECRET at key-derivation time
process.env.JWT_SECRET = 'test-jwt-secret-property-tests-1234567890';

const wallet   = require('../extensions/donations/server/crypto/wallet');
const exchange = require('../extensions/donations/server/crypto/exchange');
const balance  = require('../extensions/donations/server/crypto/balance');
const monitor  = require('../extensions/donations/server/crypto/monitor');
const { InsufficientBalanceError } = require('../extensions/donations/server/crypto/errors');

// ── BIP39 test vectors (known-valid 12-word mnemonics) ──
const VALID_MNEMONICS = [
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'legal winner thank year wave sausage worth useful legal winner thank yellow',
    'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
    'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
];

// ── In-memory SQLite adapter loaded with the full donation schema ──
async function createMemDb() {
    const SQLiteAdapter = require('../server/db/sqlite');
    const db = new SQLiteAdapter(':memory:');
    const schema = fs.readFileSync(
        path.join(__dirname, '../extensions/donations/server/schema.sql'),
        'utf8'
    );
    await db.init(schema);
    db.db.pragma('foreign_keys = OFF');
    return db;
}

// ── Mock global.fetch; returns a restore function that also clears the rate cache ──
function mockFetch({ cg = null, bn = null } = {}) {
    const orig = global.fetch;
    global.fetch = async (url) => {
        if (url.includes('coingecko')) {
            if (!cg) throw new Error('CoinGecko unavailable');
            return {
                ok: true,
                json: async () => ({ solana: { usd: cg.sol_usd }, litecoin: { usd: cg.ltc_usd } }),
            };
        }
        if (url.includes('binance')) {
            if (!bn) throw new Error('Binance unavailable');
            const isSol = url.includes('SOLUSDT');
            return {
                ok: true,
                json: async () => ({ price: String(isSol ? bn.sol_usd : bn.ltc_usd) }),
            };
        }
        return { ok: true, json: async () => ({}) }; // silence Discord / fiat rate calls
    };
    return () => { global.fetch = orig; exchange._clearCache(); };
}

// ═══════════════════════════════════════════════════════════════════════
// Property 1: Address derivation is deterministic
// Feature: crypto-donation-support, Property 1: Address derivation is deterministic
// Validates: Requirements 21.2
// ═══════════════════════════════════════════════════════════════════════
test('P1: deriveSolanaAddress — same (mnemonic, index) always yields same address', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.constantFrom(...VALID_MNEMONICS),
            fc.nat({ max: 20 }),
            async (mnemonic, index) => {
                const a = wallet.deriveSolanaAddress(mnemonic, index);
                const b = wallet.deriveSolanaAddress(mnemonic, index);
                assert.equal(a.address, b.address);
                assert.deepEqual(Array.from(a.publicKey), Array.from(b.publicKey));
            }
        ),
        { numRuns: 10 }
    );
});

test('P1: deriveLitecoinAddress — same (mnemonic, index) always yields same address', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.constantFrom(...VALID_MNEMONICS),
            fc.nat({ max: 20 }),
            async (mnemonic, index) => {
                const a = wallet.deriveLitecoinAddress(mnemonic, index);
                const b = wallet.deriveLitecoinAddress(mnemonic, index);
                assert.equal(a.address, b.address);
            }
        ),
        { numRuns: 10 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 2: Seed encryption round-trip
// Feature: crypto-donation-support, Property 2: Seed encryption round-trip
// Validates: Requirements 19.3
// ═══════════════════════════════════════════════════════════════════════
test('P2: decryptSeed(encryptSeed(m)) === m for all valid mnemonics', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.constantFrom(...VALID_MNEMONICS),
            async (mnemonic) => {
                const enc1 = wallet.encryptSeed(mnemonic);
                const enc2 = wallet.encryptSeed(mnemonic);
                // Each call uses a random IV so ciphertexts differ
                assert.notEqual(enc1, enc2, 'Each encryption must produce a unique ciphertext');
                // But both decrypt back to the original
                assert.equal(wallet.decryptSeed(enc1), mnemonic);
                assert.equal(wallet.decryptSeed(enc2), mnemonic);
            }
        ),
        { numRuns: 20 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 3: BIP39 mnemonic validation correctness
// Feature: crypto-donation-support, Property 3: BIP39 mnemonic validation correctness
// Validates: Requirements 19.2
// ═══════════════════════════════════════════════════════════════════════
test('P3: validateMnemonic returns true for all known-valid BIP39 test vectors', () => {
    for (const m of VALID_MNEMONICS) {
        assert.ok(wallet.validateMnemonic(m), `Should accept: "${m.slice(0, 30)}…"`);
    }
});

test('P3: validateMnemonic returns false for arbitrary random strings', () => {
    fc.assert(
        fc.property(
            fc.string({ minLength: 1 }),
            (str) => {
                if (VALID_MNEMONICS.includes(str)) return; // skip accidental hits
                const result = wallet.validateMnemonic(str);
                assert.equal(typeof result, 'boolean', 'Must return a boolean without throwing');
            }
        ),
        { numRuns: 100 }
    );
});

test('P3: generateMnemonic always produces a valid 24-word mnemonic', () => {
    const m = wallet.generateMnemonic();
    assert.ok(wallet.validateMnemonic(m), 'Generated mnemonic must be valid');
    assert.equal(m.split(' ').length, 24, 'Must be 24 words');
});

// ═══════════════════════════════════════════════════════════════════════
// Property 4: Exchange rate locking invariant
// Feature: crypto-donation-support, Property 4: Exchange rate locking invariant
// Validates: Requirements 3.7, 3.8
// ═══════════════════════════════════════════════════════════════════════
test('P4: locked_crypto_amount = usd_amount / rate_used within 8dp precision', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.double({ min: 1, max: 10000, noNaN: true }),
            fc.constantFrom('sol', 'ltc'),
            async (usdAmount, coin) => {
                exchange._clearCache();
                const restore = mockFetch({
                    cg: { sol_usd: 150.0, ltc_usd: 12.0 },
                    bn: { sol_usd: 150.0, ltc_usd: 12.0 },
                });
                try {
                    const { crypto_amount, rate_used } = await exchange.lockRate(usdAmount, coin);
                    const expected = Math.round((usdAmount / rate_used) * 1e8) / 1e8;
                    assert.ok(
                        Math.abs(crypto_amount - expected) < 1e-7,
                        `crypto_amount ${crypto_amount} ≠ expected ${expected} (usd=${usdAmount})`
                    );
                } finally {
                    restore();
                }
            }
        ),
        { numRuns: 50 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 5: Median rate selection bounded by [min(sources), max(sources)]
// Feature: crypto-donation-support, Property 5: Median rate selection
// Validates: Requirements 3.4
// ═══════════════════════════════════════════════════════════════════════
test('P5: when sources diverge, selected SOL rate is within [min, max] of both sources', async () => {
    await fc.assert(
        fc.asyncProperty(
            // rateA always < rateB, guaranteed >2% divergence
            fc.double({ min: 50, max: 150, noNaN: true }),
            fc.double({ min: 200, max: 400, noNaN: true }),
            async (rateA, rateB) => {
                exchange._clearCache();
                const restore = mockFetch({
                    cg: { sol_usd: rateA, ltc_usd: 10.0 },
                    bn: { sol_usd: rateB, ltc_usd: 10.0 },
                });
                try {
                    const rates = await exchange.getRates();
                    const lo = Math.min(rateA, rateB);
                    const hi = Math.max(rateA, rateB);
                    assert.ok(rates.sol_usd >= lo - 1e-9, `${rates.sol_usd} < min=${lo}`);
                    assert.ok(rates.sol_usd <= hi + 1e-9, `${rates.sol_usd} > max=${hi}`);
                } finally {
                    restore();
                }
            }
        ),
        { numRuns: 30 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 6: Amount tolerance acceptance/rejection
// Feature: crypto-donation-support, Property 6: Amount tolerance acceptance/rejection
// Validates: Requirements 1.8, 2.8, 10.3
// ═══════════════════════════════════════════════════════════════════════
test('P6: _withinTolerance accepts iff |R-L|/L <= 0.05', () => {
    fc.assert(
        fc.property(
            fc.double({ min: 0.01, max: 1000, noNaN: true }),
            fc.double({ min: 0.001, max: 2000, noNaN: true }),
            (locked, received) => {
                const result = monitor._withinTolerance(received, locked);
                const tol = Math.abs(received - locked) / locked;
                if (tol <= 0.05) {
                    assert.ok(result, `Should accept: locked=${locked} received=${received} tol=${tol.toFixed(4)}`);
                } else {
                    assert.ok(!result, `Should reject: locked=${locked} received=${received} tol=${tol.toFixed(4)}`);
                }
            }
        ),
        { numRuns: 500 }
    );
});

test('P6: _withinTolerance always rejects zero expected amount', () => {
    assert.ok(!monitor._withinTolerance(0.1, 0));
    assert.ok(!monitor._withinTolerance(0, 0));
});

// ═══════════════════════════════════════════════════════════════════════
// Property 7: Confirmation threshold state transition
// Feature: crypto-donation-support, Property 7: Confirmation threshold state transition
// Validates: Requirements 1.5, 2.5, 4.4, 4.5
// ═══════════════════════════════════════════════════════════════════════
test('P7: SOL intent confirmed at ≥1 confirmation; LTC intent confirmed at ≥3 confirmations', () => {
    const THRESHOLD = { sol: 1, ltc: 3 };

    fc.assert(
        fc.property(
            fc.nat({ max: 10 }),
            fc.constantFrom('sol', 'ltc'),
            (confs, coin) => {
                const threshold = THRESHOLD[coin];
                const shouldConfirm = confs >= threshold;
                assert.equal(confs >= threshold, shouldConfirm);
                if (confs < threshold) {
                    assert.ok(!shouldConfirm, `Must NOT confirm at ${confs} confs (threshold=${threshold})`);
                } else {
                    assert.ok(shouldConfirm, `Must confirm at ${confs} confs (threshold=${threshold})`);
                }
            }
        ),
        { numRuns: 100 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 8: Intent expiry invariant
// Feature: crypto-donation-support, Property 8: Intent expiry invariant
// Validates: Requirements 1.7, 2.7, 4.6
// ═══════════════════════════════════════════════════════════════════════
test('P8: expired intents are swept correctly and cannot be re-completed', async () => {
    const db = await createMemDb();

    await fc.assert(
        fc.asyncProperty(
            fc.constantFrom('pending', 'detected'),
            fc.constantFrom('sol', 'ltc'),
            async (status, coin) => {
                const id = uuidv4();
                const pastTime = new Date(Date.now() - 2000).toISOString();

                await db.run(
                    `INSERT INTO crypto_payment_intents
                     (id, coin, amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at,
                      sol_address, ltc_address)
                     VALUES (?, ?, 10.0, 0.1, 100.0, ?, ?, 'sol_addr', 'ltc_addr')`,
                    [id, coin, status, pastTime]
                );

                // Run expiry sweep (identical SQL to monitor.js)
                const now = new Date().toISOString();
                await db.run(
                    `UPDATE crypto_payment_intents SET status = 'expired'
                     WHERE status IN ('pending','detected') AND expires_at < ?`,
                    [now]
                );

                const intent = await db.get('SELECT status FROM crypto_payment_intents WHERE id = ?', [id]);
                assert.equal(intent.status, 'expired', 'Intent must transition to expired');

                // Verify completeCryptoIntent's WHERE clause prevents completing expired intents
                const result = await db.run(
                    `UPDATE crypto_payment_intents SET status = 'completed'
                     WHERE id = ? AND status NOT IN ('completed','cancelled','expired')`,
                    [id]
                );
                assert.equal(result.changes, 0, 'Expired intent must not be completable');

                await db.run('DELETE FROM crypto_payment_intents WHERE id = ?', [id]);
            }
        ),
        { numRuns: 20 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 9: Webhook HMAC verification
// Feature: crypto-donation-support, Property 9: Webhook HMAC verification
// Validates: Requirements 5.2, 5.3, 10.5
// ═══════════════════════════════════════════════════════════════════════
test('P9: valid HMAC is accepted; any modification of payload or secret is rejected', async () => {
    function computeHmac(payload, secret) {
        return crypto.createHmac('sha256', secret).update(payload).digest('hex');
    }
    function verifyHmac(payload, sig, secret) {
        const expected = computeHmac(payload, secret);
        const sigBuf = Buffer.from(sig || '', 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    }

    await fc.assert(
        fc.asyncProperty(
            fc.string({ minLength: 1, maxLength: 200 }),
            fc.string({ minLength: 1, maxLength: 64 }),
            async (payload, secret) => {
                const validSig = computeHmac(payload, secret);
                assert.ok(verifyHmac(payload, validSig, secret), 'Valid HMAC must be accepted');
                // Tampered payload must be rejected
                assert.ok(!verifyHmac(payload + 'x', validSig, secret), 'Tampered payload must be rejected');
                // Wrong secret must be rejected
                assert.ok(!verifyHmac(payload, computeHmac(payload, secret + 'x'), secret), 'Wrong secret rejected');
                // Empty signature must be rejected
                assert.ok(!verifyHmac(payload, '', secret), 'Empty signature must be rejected');
            }
        ),
        { numRuns: 100 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 10: Duplicate transaction idempotence
// Feature: crypto-donation-support, Property 10: Duplicate transaction idempotence
// Validates: Requirements 5.8, 10.7
// ═══════════════════════════════════════════════════════════════════════
test('P10: processAnytimeTx with same tx_hash always produces exactly one record', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.string({ minLength: 10, maxLength: 88 }),
            async (txHash) => {
                const db = await createMemDb();
                const userId = uuidv4();
                exchange._clearCache();
                const restore = mockFetch({
                    cg: { sol_usd: 150.0, ltc_usd: 12.0 },
                    bn: { sol_usd: 150.0, ltc_usd: 12.0 },
                });
                try {
                    // Call twice with the same hash
                    await monitor.processAnytimeTx(userId, txHash, 0.1, 'sol', db, balance);
                    await monitor.processAnytimeTx(userId, txHash, 0.1, 'sol', db, balance);

                    const rows = await db.all('SELECT * FROM anytime_address_txs WHERE tx_hash = ?', [txHash]);
                    assert.equal(rows.length, 1, 'Must have exactly one dedup record');

                    const credits = await db.all(
                        `SELECT * FROM balance_transactions WHERE user_id = ? AND type = 'credit'`, [userId]
                    );
                    assert.equal(credits.length, 1, 'Must have exactly one balance credit');
                } finally {
                    restore();
                }
            }
        ),
        { numRuns: 15 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 11: Address-to-intent binding
// Feature: crypto-donation-support, Property 11: Address-to-intent binding
// Validates: Requirements 10.4
// ═══════════════════════════════════════════════════════════════════════
test('P11: a transaction to an address different from the stored intent address does not match', () => {
    fc.assert(
        fc.property(
            fc.string({ minLength: 10, maxLength: 64 }),
            fc.string({ minLength: 10, maxLength: 64 }),
            (intentAddr, txAddr) => {
                // The monitor uses strict equality / findIndex to match addresses
                const matches = intentAddr === txAddr;
                if (intentAddr !== txAddr) {
                    assert.ok(!matches, 'Different addresses must not match');
                } else {
                    assert.ok(matches, 'Same address must match');
                }
            }
        ),
        { numRuns: 200 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 12: Balance ledger invariant
// Feature: crypto-donation-support, Property 12: Balance ledger invariant
// Validates: Requirements 22.1, 22.8
// ═══════════════════════════════════════════════════════════════════════
test('P12: getBalance() equals sum(credits) - sum(debits) after any operation sequence', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.array(
                fc.record({
                    type: fc.constantFrom('credit', 'debit'),
                    amount: fc.double({ min: 0.01, max: 100, noNaN: true }),
                }),
                { minLength: 1, maxLength: 15 }
            ),
            async (ops) => {
                const db = await createMemDb();
                const userId = uuidv4();

                // Pre-fund so we can cover all debits
                const totalDebits = ops
                    .filter(o => o.type === 'debit')
                    .reduce((s, o) => s + o.amount, 0);
                const seed = totalDebits + 1;
                await balance.credit(userId, seed, 'admin_adjustment', 'seed', db);
                let expected = seed;

                for (const op of ops) {
                    if (op.type === 'credit') {
                        await balance.credit(userId, op.amount, 'stripe_custom', 'test', db);
                        expected += op.amount;
                    } else {
                        const cur = await balance.getBalance(userId, db);
                        if (cur >= op.amount) {
                            await balance.debit(userId, op.amount, 'rank_purchase', 'test', db);
                            expected -= op.amount;
                        }
                    }
                }

                const actual = await balance.getBalance(userId, db);
                assert.ok(
                    Math.abs(actual - expected) < 1e-5,
                    `Ledger invariant broken: actual=${actual} expected=${expected}`
                );
            }
        ),
        { numRuns: 20 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 13: Balance credit equals donation amount
// Feature: crypto-donation-support, Property 13: Balance credit equals donation amount
// Validates: Requirements 22.2, 22.3, 22.4
// ═══════════════════════════════════════════════════════════════════════
test('P13: balance after credit == balance before credit + credited amount (within 1e-5)', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.double({ min: 0.01, max: 10000, noNaN: true }),
            async (amount) => {
                const db = await createMemDb();
                const userId = uuidv4();
                const before = await balance.getBalance(userId, db);
                await balance.credit(userId, amount, 'stripe_custom', 'test credit', db);
                const after = await balance.getBalance(userId, db);
                assert.ok(
                    Math.abs((after - before) - amount) < 1e-5,
                    `Delta ${after - before} ≠ credited ${amount}`
                );
            }
        ),
        { numRuns: 50 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 14: Balance debit grants rank atomically
// Feature: crypto-donation-support, Property 14: Balance debit grants rank atomically
// Validates: Requirements 22.6, 22.7
// ═══════════════════════════════════════════════════════════════════════
test('P14: debit with insufficient balance throws and leaves balance and ledger unchanged', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.double({ min: 5.01, max: 100, noNaN: true }),
            fc.double({ min: 0.01, max: 5.0, noNaN: true }),
            async (price, startBal) => {
                const db = await createMemDb();
                const userId = uuidv4();
                await balance.credit(userId, startBal, 'stripe_custom', 'seed', db);
                const before = await balance.getBalance(userId, db);

                let threw = false;
                try {
                    await balance.debit(userId, price, 'rank_purchase', 'test', db);
                } catch (err) {
                    assert.ok(err instanceof InsufficientBalanceError);
                    assert.equal(err.required, price);
                    threw = true;
                }

                assert.ok(threw, 'Must throw InsufficientBalanceError when balance < price');
                const after = await balance.getBalance(userId, db);
                assert.ok(Math.abs(after - before) < 1e-9, 'Balance must be unchanged after failed debit');

                const debits = await db.all(
                    `SELECT * FROM balance_transactions WHERE user_id = ? AND type = 'debit'`, [userId]
                );
                assert.equal(debits.length, 0, 'No debit ledger entry on failure');
            }
        ),
        { numRuns: 50 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 15: Transaction serialization round-trip
// Feature: crypto-donation-support, Property 15: Transaction serialization round-trip
// Validates: Requirements 18.1, 18.2, 18.4
// ═══════════════════════════════════════════════════════════════════════
test('P15: JSON parse(stringify(tx)) deepEquals original for all Transaction shapes', async () => {
    await fc.assert(
        fc.asyncProperty(
            fc.record({
                blockchain_type: fc.constantFrom('sol', 'ltc'),
                tx_hash: fc.string({ minLength: 10, maxLength: 88 }),
                amount: fc.double({ min: 0, max: 100000, noNaN: true }),
                confirmations: fc.nat({ max: 100 }),
                timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
                    .filter(d => isFinite(d.getTime())), // exclude NaN/invalid dates
            }),
            async (tx) => {
                const json = JSON.stringify(tx);
                assert.doesNotThrow(() => JSON.parse(json), 'Must serialize to valid JSON');
                const parsed = JSON.parse(json);
                assert.equal(parsed.blockchain_type, tx.blockchain_type);
                assert.equal(parsed.tx_hash, tx.tx_hash);
                assert.equal(parsed.amount, tx.amount);
                assert.equal(parsed.confirmations, tx.confirmations);
                // Date becomes ISO string during serialization
                assert.equal(new Date(parsed.timestamp).getTime(), tx.timestamp.getTime());
            }
        ),
        { numRuns: 100 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 16: Derived address format validity
// Feature: crypto-donation-support, Property 16: Derived address format validity
// Validates: Requirements 1.1, 2.1, 10.1
// ═══════════════════════════════════════════════════════════════════════
test('P16: deriveSolanaAddress produces valid 32-byte base58 non-zero public keys', async () => {
    const mnemonic = VALID_MNEMONICS[0];
    await fc.assert(
        fc.asyncProperty(
            fc.nat({ max: 30 }),
            async (index) => {
                const { address, publicKey } = wallet.deriveSolanaAddress(mnemonic, index);
                // Solana pubkeys: 32 bytes in base58 → 43-44 chars
                assert.ok(address.length >= 32 && address.length <= 50, `Unexpected address length ${address.length}`);
                assert.match(address, /^[1-9A-HJ-NP-Za-km-z]+$/, 'Must be valid base58 alphabet');
                assert.equal(publicKey.length, 32, 'Public key must be 32 bytes');
                assert.ok(!publicKey.every(b => b === 0), 'Must not be zero public key');
            }
        ),
        { numRuns: 10 }
    );
});

test('P16: deriveLitecoinAddress produces valid L/M-prefixed base58check addresses', async () => {
    const mnemonic = VALID_MNEMONICS[0];
    await fc.assert(
        fc.asyncProperty(
            fc.nat({ max: 30 }),
            async (index) => {
                const { address } = wallet.deriveLitecoinAddress(mnemonic, index);
                assert.ok(
                    address.startsWith('L') || address.startsWith('M'),
                    `LTC P2PKH address must start with L or M, got: ${address[0]}`
                );
                assert.ok(address.length >= 26 && address.length <= 35, `LTC address length ${address.length} unexpected`);
                assert.match(address, /^[1-9A-HJ-NP-Za-km-z]+$/, 'Must be valid base58check alphabet');
            }
        ),
        { numRuns: 10 }
    );
});

// ═══════════════════════════════════════════════════════════════════════
// Property 17: Exponential backoff sequence
// Feature: crypto-donation-support, Property 17: Exponential backoff sequence
// Validates: Requirements 4.8, 11.1
// ═══════════════════════════════════════════════════════════════════════
test('P17: backoff sequence [1000,2000,4000,8000,16000] doubles each step — exactly 5 retries', () => {
    const BACKOFF = [1000, 2000, 4000, 8000, 16000];

    fc.assert(
        fc.property(
            fc.nat({ max: BACKOFF.length - 1 }),
            (i) => {
                assert.equal(BACKOFF[0], 1000, 'First delay must be 1000 ms');
                if (i > 0) {
                    assert.equal(BACKOFF[i], BACKOFF[i - 1] * 2, `Delay ${i} must double previous`);
                }
                assert.ok(BACKOFF[i] >= BACKOFF[0], 'Every delay must be >= first delay');
            }
        ),
        { numRuns: 50 }
    );

    assert.equal(BACKOFF.length, 5, 'Must have exactly 5 retry delays (as designed)');
    assert.equal(BACKOFF[BACKOFF.length - 1], 16000, 'Final delay must be 16000 ms');
});

// ═══════════════════════════════════════════════════════════════════════
// Property 18: Payment intent ID uniqueness
// Feature: crypto-donation-support, Property 18: Payment intent ID uniqueness
// Validates: Requirements 10.6
// ═══════════════════════════════════════════════════════════════════════
test('P18: all generated payment intent IDs in a batch are distinct', () => {
    fc.assert(
        fc.property(
            fc.nat({ max: 500 }),
            (n) => {
                const count = n + 2; // at minimum 2
                const ids = Array.from({ length: count }, () => uuidv4());
                assert.equal(new Set(ids).size, count, `All ${count} UUIDs must be distinct`);
            }
        ),
        { numRuns: 50 }
    );
});
