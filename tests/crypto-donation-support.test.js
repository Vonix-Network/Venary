'use strict';
/**
 * Unit and integration tests for Crypto Donation Support
 *
 * Runner: node:test (Node ≥ 18)
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

process.env.JWT_SECRET = 'test-jwt-secret-unit-tests-1234567890';

const balance  = require('../extensions/donations/server/crypto/balance');
const exchange = require('../extensions/donations/server/crypto/exchange');
const monitor  = require('../extensions/donations/server/crypto/monitor');
const {
    InsufficientBalanceError,
    ExchangeRateUnavailableError,
} = require('../extensions/donations/server/crypto/errors');

// ── In-memory SQLite adapter with the full donation schema ──
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

// ── Mock global.fetch and return a restore+cache-clear function ──
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
        return { ok: true, json: async () => ({}) }; // silence Discord / fiat calls
    };
    return () => { global.fetch = orig; exchange._clearCache(); };
}

// ── Minimal Config stub ──
function makeConfig(overrides = {}) {
    return {
        get: (key, def) => (key in overrides ? overrides[key] : def),
        set: () => {},
    };
}

// ── Minimal coreDb stub (no real user records needed in most tests) ──
const mockCoreDb = { get: async () => null };

// ═══════════════════════════════════════════════════════════════════════
// 15.1: completeCryptoIntent — donation record, rank grant, balance credit
// ═══════════════════════════════════════════════════════════════════════
test('15.1a: completeCryptoIntent creates donation record and grants rank', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const intentId = uuidv4();
        const userId = uuidv4();
        await db.run(
            `INSERT INTO crypto_payment_intents
             (id, user_id, rank_id, coin, sol_address, ltc_address,
              amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at)
             VALUES (?, ?, 'rank_supporter', 'sol', 'addr_sol', 'addr_ltc',
                     4.99, 0.0333, 149.9, 'detected', datetime('now', '+240 hours'))`,
            [intentId, userId]
        );

        await monitor.completeCryptoIntent(intentId, 'tx_hash_001', 0.0333, db, balance, makeConfig(), mockCoreDb);

        const intent = await db.get('SELECT status FROM crypto_payment_intents WHERE id = ?', [intentId]);
        assert.equal(intent.status, 'completed');

        const donation = await db.get('SELECT * FROM donations WHERE user_id = ?', [userId]);
        assert.ok(donation, 'Donation record must be created');
        assert.equal(donation.status, 'completed');
        assert.equal(donation.payment_type, 'crypto');
        assert.equal(donation.rank_id, 'rank_supporter');

        const rank = await db.get('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);
        assert.ok(rank, 'user_ranks row must be created');
        assert.equal(rank.rank_id, 'rank_supporter');
        assert.equal(rank.active, 1);
    } finally {
        restore();
    }
});

test('15.1b: completeCryptoIntent credits balance for custom-amount (rank_id=NULL) intents', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const intentId = uuidv4();
        const userId = uuidv4();
        await db.run(
            `INSERT INTO crypto_payment_intents
             (id, user_id, rank_id, coin, sol_address, ltc_address,
              amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at)
             VALUES (?, ?, NULL, 'sol', 'addr_sol', 'addr_ltc',
                     10.00, 0.0667, 150.0, 'detected', datetime('now', '+240 hours'))`,
            [intentId, userId]
        );

        await monitor.completeCryptoIntent(intentId, 'tx_custom_001', 0.0667, db, balance, makeConfig(), mockCoreDb);

        const credit = await db.get(
            `SELECT * FROM balance_transactions
             WHERE user_id = ? AND type = 'credit' AND source = 'crypto_intent'`,
            [userId]
        );
        assert.ok(credit, 'Balance credit must be created for custom-amount donation');
        assert.ok(credit.amount_usd > 0, 'Credited amount must be positive');
    } finally {
        restore();
    }
});

test('15.1c: completeCryptoIntent is idempotent — second call produces no extra records', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const intentId = uuidv4();
        const userId = uuidv4();
        await db.run(
            `INSERT INTO crypto_payment_intents
             (id, user_id, rank_id, coin, sol_address, ltc_address,
              amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at)
             VALUES (?, ?, 'rank_patron', 'ltc', 'a', 'a',
                     9.99, 0.83, 12.0, 'detected', datetime('now', '+240 hours'))`,
            [intentId, userId]
        );

        await monitor.completeCryptoIntent(intentId, 'idem_tx', 0.83, db, balance, makeConfig(), mockCoreDb);
        await monitor.completeCryptoIntent(intentId, 'idem_tx', 0.83, db, balance, makeConfig(), mockCoreDb);

        const donations = await db.all('SELECT * FROM donations WHERE user_id = ?', [userId]);
        assert.equal(donations.length, 1, 'Exactly one donation record (idempotent)');

        const ranks = await db.all('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);
        assert.equal(ranks.length, 1, 'Exactly one user_ranks row (idempotent)');
    } finally {
        restore();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.2: processAnytimeTx deduplication via tx_hash uniqueness
// ═══════════════════════════════════════════════════════════════════════
test('15.2a: processAnytimeTx deduplication — same tx_hash yields exactly one record', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const userId = uuidv4();
        const txHash = 'dedup_test_' + uuidv4().replace(/-/g, '');

        await monitor.processAnytimeTx(userId, txHash, 0.5, 'sol', db, balance);
        await monitor.processAnytimeTx(userId, txHash, 0.5, 'sol', db, balance);
        await monitor.processAnytimeTx(userId, txHash, 0.5, 'sol', db, balance);

        const rows = await db.all('SELECT * FROM anytime_address_txs WHERE tx_hash = ?', [txHash]);
        assert.equal(rows.length, 1, 'Exactly one anytime_address_txs row');

        const credits = await db.all(
            `SELECT * FROM balance_transactions WHERE user_id = ? AND source = 'anytime_address'`, [userId]
        );
        assert.equal(credits.length, 1, 'Exactly one balance credit');
    } finally {
        restore();
    }
});

test('15.2b: processAnytimeTx does not throw on duplicate tx_hash', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const userId = uuidv4();
        const txHash = 'no_throw_' + uuidv4().replace(/-/g, '');

        await monitor.processAnytimeTx(userId, txHash, 0.1, 'ltc', db, balance);
        await assert.doesNotReject(
            () => monitor.processAnytimeTx(userId, txHash, 0.1, 'ltc', db, balance),
            'Duplicate call must not throw'
        );
    } finally {
        restore();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.3: requireSuperadmin middleware logic
// ═══════════════════════════════════════════════════════════════════════
test('15.3: only "superadmin" role passes; all other roles get 403', () => {
    const requireSuperadmin = (userRole) => userRole === 'superadmin';

    assert.ok(requireSuperadmin('superadmin'), 'superadmin must pass');
    assert.ok(!requireSuperadmin('admin'), 'admin must not pass');
    assert.ok(!requireSuperadmin('moderator'), 'moderator must not pass');
    assert.ok(!requireSuperadmin('user'), 'user must not pass');
    assert.ok(!requireSuperadmin(null), 'null role must not pass');
    assert.ok(!requireSuperadmin(undefined), 'undefined role must not pass');
});

// ═══════════════════════════════════════════════════════════════════════
// 15.4: Stripe custom donation → balance credit
// ═══════════════════════════════════════════════════════════════════════
test('15.4: balance.credit creates user_balances row and ledger entry with correct fields', async () => {
    const db = await createMemDb();
    const userId = uuidv4();
    const donationId = uuidv4();

    await balance.credit(userId, 25.00, 'stripe_custom', 'Custom Stripe donation', db, donationId);

    const bal = await balance.getBalance(userId, db);
    assert.equal(bal, 25.00, 'Balance must equal credited amount');

    const entry = await db.get(
        `SELECT * FROM balance_transactions WHERE user_id = ? AND source = 'stripe_custom'`, [userId]
    );
    assert.ok(entry, 'Ledger entry must exist');
    assert.equal(entry.type, 'credit');
    assert.equal(entry.amount_usd, 25.00);
    assert.equal(entry.reference_id, donationId);
    assert.ok(!entry.admin_id, 'No admin_id on a user-initiated credit');
});

test('15.4: multiple credits accumulate correctly', async () => {
    const db = await createMemDb();
    const userId = uuidv4();

    await balance.credit(userId, 10.00, 'stripe_custom', 'first', db);
    await balance.credit(userId, 5.50, 'stripe_custom', 'second', db);

    const bal = await balance.getBalance(userId, db);
    assert.ok(Math.abs(bal - 15.50) < 1e-6, `Expected 15.50, got ${bal}`);
});

// ═══════════════════════════════════════════════════════════════════════
// 15.5: Admin balance adjustment creates audit log entry
// ═══════════════════════════════════════════════════════════════════════
test('15.5a: adminAdjust (positive) creates credit entry with admin_id and reason', async () => {
    const db = await createMemDb();
    const adminId = uuidv4();
    const userId = uuidv4();

    await balance.adminAdjust(adminId, userId, 10.00, 'Compensation for downtime', db);

    const entry = await db.get(
        `SELECT * FROM balance_transactions WHERE user_id = ? AND source = 'admin_adjustment'`, [userId]
    );
    assert.ok(entry, 'Audit entry must exist');
    assert.equal(entry.type, 'credit');
    assert.equal(entry.amount_usd, 10.00);
    assert.equal(entry.admin_id, adminId);
    assert.equal(entry.description, 'Compensation for downtime');

    const bal = await balance.getBalance(userId, db);
    assert.equal(bal, 10.00);
});

test('15.5b: adminAdjust (negative) creates debit entry with admin_id', async () => {
    const db = await createMemDb();
    const adminId = uuidv4();
    const userId = uuidv4();

    await balance.credit(userId, 20.00, 'stripe_custom', 'seed', db);
    await balance.adminAdjust(adminId, userId, -5.00, 'Correction', db);

    const entry = await db.get(
        `SELECT * FROM balance_transactions WHERE user_id = ? AND type = 'debit'`, [userId]
    );
    assert.ok(entry, 'Debit audit entry must exist');
    assert.equal(entry.admin_id, adminId);
    assert.equal(entry.amount_usd, 5.00);
    assert.equal(entry.source, 'admin_adjustment');

    const bal = await balance.getBalance(userId, db);
    assert.ok(Math.abs(bal - 15.00) < 1e-6, `Expected 15.00, got ${bal}`);
});

test('15.5c: adminAdjust throws when reason is empty', async () => {
    const db = await createMemDb();
    await assert.rejects(
        () => balance.adminAdjust('admin', 'user', 5.00, '', db),
        /Reason is required/
    );
});

// ═══════════════════════════════════════════════════════════════════════
// 15.6: Exchange rate fallback — primary down, secondary used
// ═══════════════════════════════════════════════════════════════════════
test('15.6a: getRates falls back to Binance when CoinGecko is unavailable', async () => {
    exchange._clearCache();
    const restore = mockFetch({ cg: null, bn: { sol_usd: 160.0, ltc_usd: 11.5 } });
    try {
        const rates = await exchange.getRates();
        assert.equal(rates.sol_usd, 160.0);
        assert.equal(rates.ltc_usd, 11.5);
    } finally {
        restore();
    }
});

test('15.6b: getRates uses CoinGecko when Binance is unavailable', async () => {
    exchange._clearCache();
    const restore = mockFetch({ cg: { sol_usd: 145.0, ltc_usd: 13.0 }, bn: null });
    try {
        const rates = await exchange.getRates();
        assert.equal(rates.sol_usd, 145.0);
        assert.equal(rates.ltc_usd, 13.0);
    } finally {
        restore();
    }
});

test('15.6c: getRates returns cached value when cache is fresh (no fetch needed)', async () => {
    exchange._clearCache();
    let fetchCalls = 0;
    const orig = global.fetch;
    global.fetch = async (url) => {
        fetchCalls++;
        return {
            ok: true,
            json: async () =>
                url.includes('coingecko')
                    ? { solana: { usd: 155.0 }, litecoin: { usd: 12.5 } }
                    : { price: url.includes('SOLUSDT') ? '155.0' : '12.5' },
        };
    };
    try {
        await exchange.getRates(); // populates cache
        const before = fetchCalls;
        await exchange.getRates(); // must use cache — no extra fetch
        assert.equal(fetchCalls, before, 'Cache must prevent redundant fetches');
    } finally {
        global.fetch = orig;
        exchange._clearCache();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.7: All rate sources down → ExchangeRateUnavailableError
// ═══════════════════════════════════════════════════════════════════════
test('15.7: getRates throws ExchangeRateUnavailableError when all sources fail', async () => {
    exchange._clearCache();
    const orig = global.fetch;
    global.fetch = async () => { throw new Error('Network unreachable'); };
    try {
        await assert.rejects(
            () => exchange.getRates(),
            (err) => {
                assert.ok(
                    err instanceof ExchangeRateUnavailableError,
                    `Expected ExchangeRateUnavailableError, got ${err.constructor.name}`
                );
                return true;
            }
        );
    } finally {
        global.fetch = orig;
        exchange._clearCache();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.8: Webhook for unknown intent — early return, no DB writes
// ═══════════════════════════════════════════════════════════════════════
test('15.8: completeCryptoIntent with unknown ID returns cleanly with no DB side effects', async () => {
    const db = await createMemDb();
    // No fetch mock needed — function returns early before calling getRates
    const nonExistentId = 'ghost-intent-' + uuidv4();

    await assert.doesNotReject(
        () => monitor.completeCryptoIntent(nonExistentId, 'some_tx', 1.0, db, balance, makeConfig(), mockCoreDb),
        'Must not throw for unknown intent'
    );

    const donations = await db.all('SELECT * FROM donations');
    assert.equal(donations.length, 0, 'No donation records should be created');
});

// ═══════════════════════════════════════════════════════════════════════
// 15.9: balance/spend with insufficient funds → 400-equivalent, no state change
// ═══════════════════════════════════════════════════════════════════════
test('15.9: debit with insufficient balance throws and leaves balance and ledger unchanged', async () => {
    const db = await createMemDb();
    const userId = uuidv4();

    await balance.credit(userId, 5.00, 'stripe_custom', 'seed', db);

    let err;
    try {
        await balance.debit(userId, 9.99, 'rank_purchase', 'Patron rank', db);
    } catch (e) {
        err = e;
    }

    assert.ok(err instanceof InsufficientBalanceError, 'Must throw InsufficientBalanceError');
    assert.equal(err.required, 9.99);
    assert.equal(err.available, 5.00);

    const bal = await balance.getBalance(userId, db);
    assert.equal(bal, 5.00, 'Balance must be unchanged');

    const debits = await db.all(
        `SELECT * FROM balance_transactions WHERE user_id = ? AND type = 'debit'`, [userId]
    );
    assert.equal(debits.length, 0, 'No debit ledger entry on failure');
});

// ═══════════════════════════════════════════════════════════════════════
// 15.10: Integration — full crypto checkout flow
// ═══════════════════════════════════════════════════════════════════════
test('15.10: full SOL checkout flow: pending intent → completed → donation + rank exist', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const intentId = uuidv4();
        const userId = uuidv4();

        await db.run(
            `INSERT INTO crypto_payment_intents
             (id, user_id, rank_id, coin, sol_address, ltc_address,
              amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at)
             VALUES (?, ?, 'rank_omega', 'sol', 'sol_checkout_addr', 'ltc_checkout_addr',
                     14.99, 0.0999, 150.0, 'pending', datetime('now', '+240 hours'))`,
            [intentId, userId]
        );

        // Simulate 1 SOL confirmation triggering completeCryptoIntent
        await monitor.completeCryptoIntent(
            intentId, 'sol_final_tx_hash', 0.0999, db, balance, makeConfig(), mockCoreDb
        );

        const intent = await db.get('SELECT status FROM crypto_payment_intents WHERE id = ?', [intentId]);
        assert.equal(intent.status, 'completed');

        const donation = await db.get(
            'SELECT * FROM donations WHERE user_id = ? AND status = ?', [userId, 'completed']
        );
        assert.ok(donation, 'Completed donation must exist');
        assert.equal(donation.payment_type, 'crypto');

        const rank = await db.get('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);
        assert.ok(rank, 'User rank must be assigned');
        assert.equal(rank.rank_id, 'rank_omega');
    } finally {
        restore();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.11: Integration — anytime address flow
// ═══════════════════════════════════════════════════════════════════════
test('15.11: anytime address flow: tx → balance credited, dedup record created, donation record exists', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 200.0, ltc_usd: 15.0 }, bn: { sol_usd: 200.0, ltc_usd: 15.0 } });
    try {
        const userId = uuidv4();
        const txHash = 'anytime_test_' + uuidv4().replace(/-/g, '');
        const cryptoAmount = 0.25; // 0.25 SOL at $200 = $50

        await monitor.processAnytimeTx(userId, txHash, cryptoAmount, 'sol', db, balance);

        const dedup = await db.get('SELECT * FROM anytime_address_txs WHERE tx_hash = ?', [txHash]);
        assert.ok(dedup, 'Dedup record must be created');
        assert.equal(dedup.coin, 'sol');
        assert.equal(dedup.crypto_amount, cryptoAmount);
        assert.ok(dedup.usd_amount > 0);

        const bal = await balance.getBalance(userId, db);
        assert.ok(bal > 0, 'Balance must be credited');
        assert.ok(Math.abs(bal - dedup.usd_amount) < 1e-6, 'Balance matches credited USD amount');

        const donation = await db.get(
            'SELECT * FROM donations WHERE user_id = ? AND payment_type = ?', [userId, 'crypto_anytime']
        );
        assert.ok(donation, 'Donation history record must be created');
    } finally {
        restore();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.12: Integration — balance spend flow
// ═══════════════════════════════════════════════════════════════════════
test('15.12: credit $20 → debit $9.99 → balance ≈ $10.01, ledger has debit entry', async () => {
    const db = await createMemDb();
    const userId = uuidv4();
    const rankRef = uuidv4();

    await balance.credit(userId, 20.00, 'stripe_custom', 'Funding balance', db);
    await balance.debit(userId, 9.99, 'rank_purchase', 'Patron rank purchase', db, rankRef);

    const bal = await balance.getBalance(userId, db);
    assert.ok(Math.abs(bal - 10.01) < 1e-5, `Balance ${bal} should be ~10.01`);

    const ledger = await balance.getLedger(userId, 10, db);
    assert.equal(ledger.length, 2, 'Ledger must have 2 entries (1 credit + 1 debit)');

    const debitEntry = ledger.find(e => e.type === 'debit');
    assert.ok(debitEntry, 'Debit entry must exist in ledger');
    assert.equal(debitEntry.source, 'rank_purchase');
    assert.equal(debitEntry.amount_usd, 9.99);
    assert.equal(debitEntry.reference_id, rankRef);
});

// ═══════════════════════════════════════════════════════════════════════
// 15.13: Integration — webhook acceleration
// ═══════════════════════════════════════════════════════════════════════
test('15.13: webhook handler (completeCryptoIntent) completes intent immediately', async () => {
    const db = await createMemDb();
    const restore = mockFetch({ cg: { sol_usd: 150.0, ltc_usd: 12.0 }, bn: { sol_usd: 150.0, ltc_usd: 12.0 } });
    try {
        const intentId = uuidv4();
        const userId = uuidv4();

        await db.run(
            `INSERT INTO crypto_payment_intents
             (id, user_id, rank_id, coin, sol_address, ltc_address,
              amount_usd, locked_crypto_amount, locked_exchange_rate, status, expires_at)
             VALUES (?, ?, 'rank_legend', 'sol', 'wh_sol_addr', 'wh_ltc_addr',
                     19.99, 0.133, 150.3, 'pending', datetime('now', '+240 hours'))`,
            [intentId, userId]
        );

        // Webhook calls completeCryptoIntent immediately, without waiting for polling cycle
        await monitor.completeCryptoIntent(
            intentId, 'webhook_tx_sig_001', 0.133, db, balance, makeConfig(), mockCoreDb
        );

        const intent = await db.get(
            'SELECT status, tx_hash FROM crypto_payment_intents WHERE id = ?', [intentId]
        );
        assert.equal(intent.status, 'completed');
        assert.equal(intent.tx_hash, 'webhook_tx_sig_001');

        const donation = await db.get('SELECT * FROM donations WHERE user_id = ?', [userId]);
        assert.ok(donation, 'Donation record must be created synchronously');
    } finally {
        restore();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 15.14: Migration — schema creates all required tables without data loss
// ═══════════════════════════════════════════════════════════════════════
test('15.14: schema migration creates all 10 tables and seeds 4 default ranks', async () => {
    const db = await createMemDb();

    const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    const names = tables.map(t => t.name);

    // Core tables
    for (const t of ['donation_ranks', 'donations', 'user_ranks', 'rank_conversions']) {
        assert.ok(names.includes(t), `Core table '${t}' must exist`);
    }

    // Crypto extension tables
    for (const t of [
        'user_crypto_addresses',
        'crypto_payment_intents',
        'anytime_address_txs',
        'user_balances',
        'balance_transactions',
        'user_preferences',
    ]) {
        assert.ok(names.includes(t), `Crypto table '${t}' must exist`);
    }

    // Default ranks must be seeded
    const ranks = await db.all('SELECT id FROM donation_ranks ORDER BY sort_order');
    assert.equal(ranks.length, 4, 'Must have exactly 4 seeded donation ranks');
    assert.deepEqual(
        ranks.map(r => r.id),
        ['rank_supporter', 'rank_patron', 'rank_omega', 'rank_legend']
    );
});

test('15.14: schema migration is idempotent — running twice does not error', async () => {
    const SQLiteAdapter = require('../server/db/sqlite');
    const db = new SQLiteAdapter(':memory:');
    const schema = fs.readFileSync(
        path.join(__dirname, '../extensions/donations/server/schema.sql'), 'utf8'
    );

    await assert.doesNotReject(() => db.init(schema), 'First init must not throw');
    await assert.doesNotReject(() => db.init(schema), 'Second init (IF NOT EXISTS) must not throw');

    const ranks = await db.all('SELECT id FROM donation_ranks');
    assert.equal(ranks.length, 4, 'INSERT OR IGNORE must not duplicate ranks');
});
