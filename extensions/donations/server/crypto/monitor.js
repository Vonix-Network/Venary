/* =======================================
   Crypto Donation Support — Blockchain Monitor
   Polls Solana + Litecoin for payment intent
   confirmations and anytime address deposits.
   ======================================= */
'use strict';

const { v4: uuidv4 } = require('uuid');
const { DuplicateTransactionError } = require('./errors');
const exchange = require('./exchange');

// ── Polling intervals ──
const SOL_INTENT_INTERVAL_MS   = 5  * 1000;   // 5s
const LTC_INTENT_INTERVAL_MS   = 10 * 1000;   // 10s
const ANYTIME_INTERVAL_MS      = 3  * 60 * 1000; // 3 min

// ── Confirmation thresholds ──
const SOL_CONFIRMATIONS = 1;
const LTC_CONFIRMATIONS = 3;

// ── Amount tolerance ──
const TOLERANCE = 0.05; // ±5%

// ── Exponential backoff delays (ms) ──
const BACKOFF = [1000, 2000, 4000, 8000, 16000];

// ── Interval handles (for test teardown) ──
let _intervals = [];

// ── Lazy-load Solana web3 ──
let _solanaWeb3;
function getSolanaWeb3() {
    if (!_solanaWeb3) _solanaWeb3 = require('@solana/web3.js');
    return _solanaWeb3;
}

/**
 * Retry a function with exponential backoff.
 * Skips the cycle (returns null) after max retries.
 * @param {Function} fn
 * @param {string} label  for logging
 * @returns {Promise<any|null>}
 */
async function _withBackoff(fn, label) {
    for (let i = 0; i < BACKOFF.length; i++) {
        try {
            return await fn();
        } catch (err) {
            console.error(`[Donations/Crypto] ❌ RPC failure (attempt ${i + 1}/${BACKOFF.length}) [${label}]: ${err.message}`);
            if (i < BACKOFF.length - 1) {
                await new Promise(r => setTimeout(r, BACKOFF[i]));
            }
        }
    }
    console.error(`[Donations/Crypto] ❌ Skipping cycle after ${BACKOFF.length} failures [${label}]`);
    return null;
}

/**
 * Check if a received amount is within ±5% tolerance of the expected amount.
 * @param {number} received
 * @param {number} expected
 * @returns {boolean}
 */
function _withinTolerance(received, expected) {
    if (expected === 0) return false;
    return Math.abs(received - expected) / expected <= TOLERANCE;
}

// ══════════════════════════════════════════════════════
// SOLANA INTENT POLLING
// ══════════════════════════════════════════════════════

/**
 * Poll Solana RPC for pending payment intents.
 * @param {object} extDb
 * @param {object} balanceMgr
 * @param {object} Config
 * @param {object} coreDb
 */
async function pollSolanaIntents(extDb, balanceMgr, Config, coreDb) {
    const now = new Date().toISOString();

    // Expire stale intents first
    await extDb.run(
        `UPDATE crypto_payment_intents SET status = 'expired'
         WHERE coin = 'sol' AND status IN ('pending','detected') AND expires_at < ?`,
        [now]
    );

    const intents = await extDb.all(
        `SELECT * FROM crypto_payment_intents
         WHERE coin = 'sol' AND status IN ('pending','detected') AND expires_at > ?`,
        [now]
    );
    if (!intents.length) return;

    const rpcUrl = Config.get('donations.crypto.solana_rpc_primary', 'https://api.mainnet-beta.solana.com');
    const { Connection, PublicKey } = getSolanaWeb3();

    for (const intent of intents) {
        await _withBackoff(async () => {
            const connection = new Connection(rpcUrl, 'confirmed');
            const pubkey = new PublicKey(intent.sol_address);

            const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 10 });
            if (!sigs.length) return;

            for (const sigInfo of sigs) {
                const tx = await connection.getTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0,
                });
                if (!tx) continue;

                // Calculate lamports received at this address
                const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
                const addrIndex = accountKeys.findIndex(k => k.toString() === intent.sol_address);
                if (addrIndex === -1) continue;

                const pre  = tx.meta?.preBalances?.[addrIndex]  ?? 0;
                const post = tx.meta?.postBalances?.[addrIndex] ?? 0;
                const receivedLamports = post - pre;
                if (receivedLamports <= 0) continue;

                const receivedSol = receivedLamports / 1e9;
                const confirmations = sigInfo.confirmationStatus === 'finalized' ? 32
                    : sigInfo.confirmationStatus === 'confirmed' ? 1 : 0;

                if (!_withinTolerance(receivedSol, intent.locked_crypto_amount)) {
                    console.warn(`[Donations/Crypto] ⚠️  SOL amount mismatch on intent ${intent.id}: expected ${intent.locked_crypto_amount}, got ${receivedSol}`);
                    continue;
                }

                // Update to detected
                if (intent.status === 'pending') {
                    await extDb.run(
                        `UPDATE crypto_payment_intents SET status = 'detected', tx_hash = ?, detected_at = ?, confirmations = ? WHERE id = ?`,
                        [sigInfo.signature, new Date().toISOString(), confirmations, intent.id]
                    );
                }

                // Complete if confirmed
                if (confirmations >= SOL_CONFIRMATIONS) {
                    await completeCryptoIntent(intent.id, sigInfo.signature, receivedSol, extDb, balanceMgr, Config, coreDb);
                } else {
                    await extDb.run(
                        `UPDATE crypto_payment_intents SET confirmations = ? WHERE id = ?`,
                        [confirmations, intent.id]
                    );
                }
                break; // found matching tx
            }
        }, `sol-intent-${intent.id}`);
    }
}

// ══════════════════════════════════════════════════════
// LITECOIN INTENT POLLING
// ══════════════════════════════════════════════════════

/**
 * Poll BlockCypher for pending Litecoin payment intents.
 * @param {object} extDb
 * @param {object} balanceMgr
 * @param {object} Config
 * @param {object} coreDb
 */
async function pollLitecoinIntents(extDb, balanceMgr, Config, coreDb) {
    const now = new Date().toISOString();

    await extDb.run(
        `UPDATE crypto_payment_intents SET status = 'expired'
         WHERE coin = 'ltc' AND status IN ('pending','detected') AND expires_at < ?`,
        [now]
    );

    const intents = await extDb.all(
        `SELECT * FROM crypto_payment_intents
         WHERE coin = 'ltc' AND status IN ('pending','detected') AND expires_at > ?`,
        [now]
    );
    if (!intents.length) return;

    for (const intent of intents) {
        await _withBackoff(async () => {
            const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${intent.ltc_address}/full?limit=5`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) throw new Error(`BlockCypher HTTP ${res.status}`);
            const data = await res.json();

            const txs = data.txs || [];
            for (const tx of txs) {
                // Sum outputs to our address
                const received = (tx.outputs || [])
                    .filter(o => (o.addresses || []).includes(intent.ltc_address))
                    .reduce((sum, o) => sum + (o.value || 0), 0) / 1e8; // satoshis → LTC

                if (received <= 0) continue;
                if (!_withinTolerance(received, intent.locked_crypto_amount)) {
                    console.warn(`[Donations/Crypto] ⚠️  LTC amount mismatch on intent ${intent.id}: expected ${intent.locked_crypto_amount}, got ${received}`);
                    continue;
                }

                const confirmations = tx.confirmations || 0;

                if (intent.status === 'pending') {
                    await extDb.run(
                        `UPDATE crypto_payment_intents SET status = 'detected', tx_hash = ?, detected_at = ?, confirmations = ? WHERE id = ?`,
                        [tx.hash, new Date().toISOString(), confirmations, intent.id]
                    );
                }

                if (confirmations >= LTC_CONFIRMATIONS) {
                    await completeCryptoIntent(intent.id, tx.hash, received, extDb, balanceMgr, Config, coreDb);
                } else {
                    await extDb.run(
                        `UPDATE crypto_payment_intents SET confirmations = ? WHERE id = ?`,
                        [confirmations, intent.id]
                    );
                }
                break;
            }
        }, `ltc-intent-${intent.id}`);
    }
}

// ══════════════════════════════════════════════════════
// ANYTIME ADDRESS POLLING
// ══════════════════════════════════════════════════════

/**
 * Poll all user anytime addresses for new transactions every 3 minutes.
 * @param {object} extDb
 * @param {object} balanceMgr
 * @param {object} Config
 */
async function pollAnytimeAddresses(extDb, balanceMgr, Config) {
    const addresses = await extDb.all('SELECT * FROM user_crypto_addresses');
    if (!addresses.length) return;

    const solEnabled = Config.get('donations.crypto.solana_enabled', false);
    const ltcEnabled = Config.get('donations.crypto.litecoin_enabled', false);

    for (const row of addresses) {
        if (solEnabled && row.sol_address) {
            await _withBackoff(async () => {
                await _checkSolanaAnytime(row.user_id, row.sol_address, extDb, balanceMgr, Config);
            }, `sol-anytime-${row.user_id}`);
        }

        if (ltcEnabled && row.ltc_address) {
            await _withBackoff(async () => {
                await _checkLitecoinAnytime(row.user_id, row.ltc_address, extDb, balanceMgr);
            }, `ltc-anytime-${row.user_id}`);
        }
    }
}

async function _checkSolanaAnytime(userId, address, extDb, balanceMgr, Config) {
    const rpcUrl = Config.get('donations.crypto.solana_rpc_primary', 'https://api.mainnet-beta.solana.com');
    const { Connection, PublicKey } = getSolanaWeb3();
    const connection = new Connection(rpcUrl, 'confirmed');
    const pubkey = new PublicKey(address);

    const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 20 });
    for (const sigInfo of sigs) {
        if (sigInfo.confirmationStatus !== 'confirmed' && sigInfo.confirmationStatus !== 'finalized') continue;

        const existing = await extDb.get('SELECT id FROM anytime_address_txs WHERE tx_hash = ?', [sigInfo.signature]);
        if (existing) continue;

        const tx = await connection.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) continue;

        const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
        const addrIndex = accountKeys.findIndex(k => k.toString() === address);
        if (addrIndex === -1) continue;

        const pre  = tx.meta?.preBalances?.[addrIndex]  ?? 0;
        const post = tx.meta?.postBalances?.[addrIndex] ?? 0;
        const receivedLamports = post - pre;
        if (receivedLamports <= 0) continue;

        const receivedSol = receivedLamports / 1e9;
        await processAnytimeTx(userId, sigInfo.signature, receivedSol, 'sol', extDb, balanceMgr);
    }
}

async function _checkLitecoinAnytime(userId, address, extDb, balanceMgr) {
    const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full?limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`BlockCypher HTTP ${res.status}`);
    const data = await res.json();

    for (const tx of (data.txs || [])) {
        if ((tx.confirmations || 0) < LTC_CONFIRMATIONS) continue;

        const existing = await extDb.get('SELECT id FROM anytime_address_txs WHERE tx_hash = ?', [tx.hash]);
        if (existing) continue;

        const received = (tx.outputs || [])
            .filter(o => (o.addresses || []).includes(address))
            .reduce((sum, o) => sum + (o.value || 0), 0) / 1e8;

        if (received <= 0) continue;
        await processAnytimeTx(userId, tx.hash, received, 'ltc', extDb, balanceMgr);
    }
}

// ══════════════════════════════════════════════════════
// COMPLETE CRYPTO INTENT
// ══════════════════════════════════════════════════════

/**
 * Atomically complete a crypto payment intent.
 * Creates donation record, grants rank or credits balance, sends notifications.
 * Idempotent — safe to call multiple times for the same intent.
 *
 * @param {string} intentId
 * @param {string} txHash
 * @param {number} confirmedAmount
 * @param {object} extDb
 * @param {object} balanceMgr
 * @param {object} Config
 * @param {object} coreDb
 */
async function completeCryptoIntent(intentId, txHash, confirmedAmount, extDb, balanceMgr, Config, coreDb) {
    // Atomic status update — prevents double-processing
    const result = await extDb.run(
        `UPDATE crypto_payment_intents
         SET status = 'completed', tx_hash = ?, confirmed_amount_crypto = ?, confirmed_at = ?, completed_at = ?
         WHERE id = ? AND status NOT IN ('completed','cancelled','expired')`,
        [txHash, confirmedAmount, new Date().toISOString(), new Date().toISOString(), intentId]
    );
    if (!result.changes) return; // already completed or invalid state

    const intent = await extDb.get('SELECT * FROM crypto_payment_intents WHERE id = ?', [intentId]);
    if (!intent) return;

    // Convert crypto amount to USD at current rate for balance crediting
    let usdValue = intent.amount_usd;
    try {
        const rates = await exchange.getRates();
        const rate = intent.coin === 'sol' ? rates.sol_usd : rates.ltc_usd;
        usdValue = Math.round(confirmedAmount * rate * 1e8) / 1e8;
    } catch { /* use locked USD amount as fallback */ }

    // Insert donation record
    const donationId = uuidv4();
    let retries = 0;
    while (retries < 3) {
        try {
            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status,
                  minecraft_username, expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, 'crypto', 'completed', ?, ?, ?)`,
                [
                    donationId,
                    intent.user_id || null,
                    intent.rank_id || null,
                    usdValue,
                    'usd',
                    intent.minecraft_username || null,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    new Date().toISOString(),
                ]
            );
            break;
        } catch (err) {
            retries++;
            if (retries >= 3) {
                console.error(`[Donations/Crypto] ❌ Failed to insert donation record for intent ${intentId}:`, err.message);
                await extDb.run(
                    `UPDATE crypto_payment_intents SET status = 'completed_pending_rank' WHERE id = ?`,
                    [intentId]
                );
                return;
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // Grant rank or credit balance
    if (intent.rank_id && intent.user_id) {
        await _grantRank(intent.user_id, intent.rank_id, extDb);
    } else if (intent.user_id) {
        // Custom amount — credit balance
        await balanceMgr.credit(
            intent.user_id,
            usdValue,
            'crypto_intent',
            `${intent.coin.toUpperCase()} donation`,
            extDb,
            donationId
        );
    }

    // Discord notification
    try {
        const discordWebhookUrl = Config.get('discord_donation_webhook');
        if (discordWebhookUrl) {
            const rank = intent.rank_id
                ? await extDb.get('SELECT name, color, icon FROM donation_ranks WHERE id = ?', [intent.rank_id])
                : null;
            const user = intent.user_id
                ? await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [intent.user_id])
                : null;
            const displayName = user?.display_name || user?.username || intent.minecraft_username || 'Anonymous';
            const coinLabel = intent.coin === 'sol' ? 'Solana (SOL)' : 'Litecoin (LTC)';

            await fetch(discordWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: Config.get('siteName', 'Venary') + ' Donations',
                    embeds: [{
                        title: '💰 New Crypto Donation!',
                        description: `**${displayName}** just donated via ${coinLabel}!`,
                        color: parseInt((rank?.color || '#29b6f6').replace('#', ''), 16),
                        fields: [
                            { name: '💵 Amount', value: `$${usdValue.toFixed(2)} USD`, inline: true },
                            { name: '🔗 Chain', value: coinLabel, inline: true },
                            { name: '👑 Rank', value: rank?.name || 'Balance Credit', inline: true },
                            { name: '🔑 TX Hash', value: `\`${txHash.slice(0, 16)}...\``, inline: false },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                }),
            });
        }
    } catch (err) {
        console.error('[Donations/Crypto] Discord webhook error:', err.message);
    }

    console.log(`[Donations/Crypto] ✅ Intent completed: ${intentId} — user ${intent.user_id || 'guest'} — ${intent.coin} ${confirmedAmount}`);
}

// ══════════════════════════════════════════════════════
// PROCESS ANYTIME TX
// ══════════════════════════════════════════════════════

/**
 * Process a new transaction on a user's anytime address.
 * Idempotent — duplicate tx_hash is silently ignored.
 *
 * @param {string} userId
 * @param {string} txHash
 * @param {number} cryptoAmount
 * @param {'sol'|'ltc'} coin
 * @param {object} extDb
 * @param {object} balanceMgr
 */
async function processAnytimeTx(userId, txHash, cryptoAmount, coin, extDb, balanceMgr) {
    // Convert to USD at current rate
    let usdAmount = 0;
    let exchangeRate = 0;
    try {
        const rates = await exchange.getRates();
        exchangeRate = coin === 'sol' ? rates.sol_usd : rates.ltc_usd;
        usdAmount = Math.round(cryptoAmount * exchangeRate * 1e8) / 1e8;
    } catch (err) {
        console.error('[Donations/Crypto] ❌ Rate fetch failed for anytime tx:', err.message);
        return;
    }

    // Insert dedup record — UNIQUE constraint on tx_hash prevents double-processing
    try {
        await extDb.run(
            `INSERT INTO anytime_address_txs (id, user_id, tx_hash, coin, crypto_amount, usd_amount, exchange_rate)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, txHash, coin, cryptoAmount, usdAmount, exchangeRate]
        );
    } catch (err) {
        if (err.message?.includes('UNIQUE') || err.message?.includes('unique')) {
            // Duplicate — silently skip
            return;
        }
        throw err;
    }

    // Credit balance
    await balanceMgr.credit(
        userId,
        usdAmount,
        'anytime_address',
        `${coin.toUpperCase()} received at anytime address`,
        extDb,
        txHash
    );

    // Insert donation record for history
    await extDb.run(
        `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, created_at, expires_at)
         VALUES (?, ?, NULL, ?, 'usd', 'crypto_anytime', 'completed', ?, ?)`,
        [
            uuidv4(),
            userId,
            usdAmount,
            new Date().toISOString(),
            new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        ]
    );

    console.log(`[Donations/Crypto] ✅ Anytime tx processed: user ${userId} — ${coin} ${cryptoAmount} = $${usdAmount}`);
}

// ══════════════════════════════════════════════════════
// RANK GRANT HELPER
// ══════════════════════════════════════════════════════

async function _grantRank(userId, rankId, extDb) {
    const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [rankId]);
    if (!rank) return;

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const existing = await extDb.get('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);

    if (existing) {
        let newExpiry = expiresAt;
        if (existing.rank_id === rankId && existing.expires_at && new Date(existing.expires_at) > new Date()) {
            newExpiry = new Date(new Date(existing.expires_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
        }
        await extDb.run(
            'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
            [rankId, newExpiry, new Date().toISOString(), userId]
        );
    } else {
        await extDb.run(
            'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
            [uuidv4(), userId, rankId, expiresAt]
        );
    }
}

// ══════════════════════════════════════════════════════
// START MONITORING
// ══════════════════════════════════════════════════════

/**
 * Start all blockchain monitoring intervals.
 * @param {object} extDb
 * @param {object} balanceMgr
 * @param {object} Config
 * @param {object} coreDb
 */
function startMonitoring(extDb, balanceMgr, Config, coreDb) {
    const solEnabled = Config.get('donations.crypto.solana_enabled', false);
    const ltcEnabled = Config.get('donations.crypto.litecoin_enabled', false);

    if (!solEnabled && !ltcEnabled) {
        console.log('[Donations/Crypto] ℹ️  No chains enabled — monitor not started');
        return;
    }

    if (solEnabled) {
        const h1 = setInterval(() => pollSolanaIntents(extDb, balanceMgr, Config, coreDb).catch(e =>
            console.error('[Donations/Crypto] SOL intent poll error:', e.message)
        ), SOL_INTENT_INTERVAL_MS);
        _intervals.push(h1);
    }

    if (ltcEnabled) {
        const h2 = setInterval(() => pollLitecoinIntents(extDb, balanceMgr, Config, coreDb).catch(e =>
            console.error('[Donations/Crypto] LTC intent poll error:', e.message)
        ), LTC_INTENT_INTERVAL_MS);
        _intervals.push(h2);
    }

    const h3 = setInterval(() => pollAnytimeAddresses(extDb, balanceMgr, Config).catch(e =>
        console.error('[Donations/Crypto] Anytime poll error:', e.message)
    ), ANYTIME_INTERVAL_MS);
    _intervals.push(h3);

    // Initial anytime poll after 30s to catch any missed txs on startup
    setTimeout(() => pollAnytimeAddresses(extDb, balanceMgr, Config).catch(() => {}), 30000);

    console.log(`[Donations/Crypto] ✅ Blockchain monitor started (SOL: ${solEnabled}, LTC: ${ltcEnabled})`);
}

/** Stop all intervals (for testing) */
function stopMonitoring() {
    _intervals.forEach(clearInterval);
    _intervals = [];
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    completeCryptoIntent,
    processAnytimeTx,
    pollSolanaIntents,
    pollLitecoinIntents,
    pollAnytimeAddresses,
    _withinTolerance,
    _grantRank,
};
