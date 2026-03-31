/* =======================================
   Manual HD Wallet Provider
   Delegates to the existing intent/polling system.
   ⚠ Experimental — for testing only.
   ======================================= */
'use strict';

/**
 * isConfigured — true when at least one chain seed is stored.
 * @param {object} Config
 */
function isConfigured(Config) {
    return !!(Config.get('donations.crypto.solana_seed_encrypted') || Config.get('donations.crypto.litecoin_seed_encrypted'));
}

/**
 * createPayment — not used directly; the manual flow is handled inline by
 * the /crypto/intent route's existing code path. This is a no-op placeholder
 * that signals the intent route to continue with the manual flow.
 */
async function createPayment() {
    throw new Error('Manual provider: createPayment should not be called — the intent route handles this directly.');
}

/**
 * verifyWebhook — no-op. The monitor polling loop handles confirmation for manual mode.
 */
function verifyWebhook() {
    throw new Error('Manual provider does not accept webhooks — the polling monitor confirms payments.');
}

/**
 * getDashboardData — reads recent intents directly from the extension DB.
 * @param {object} Config
 * @param {object} extDb
 */
async function getDashboardData(Config, extDb) {
    const rows = await extDb.all(
        `SELECT id, coin, amount_usd, status, confirmed_amount_crypto, provider_payment_id, created_at, completed_at
         FROM crypto_payment_intents
         WHERE provider = 'manual' OR provider IS NULL
         ORDER BY created_at DESC LIMIT 25`
    );
    return {
        recent_payments: rows.map(r => ({
            id:          r.id,
            coin:        r.coin,
            amount_usd:  r.amount_usd,
            status:      r.status,
            provider_id: r.id, // for manual, provider_id is the internal intent id
            created_at:  r.created_at,
        })),
        balance_info: null,
        payout_info:  'Self-custodial — funds go directly to your derived HD wallet addresses.',
    };
}

/**
 * pingTest — returns whether the seed is configured.
 * @param {object} Config
 */
async function pingTest(Config) {
    const ok = isConfigured(Config);
    return { ok, message: ok ? 'Seed phrase is configured.' : 'No seed phrase configured. Set one in Crypto Settings.' };
}

function getProviderMeta() {
    return { id: 'manual', name: 'Manual HD Wallet', fee: '0%', color: '#ef4444' };
}

module.exports = { isConfigured, createPayment, verifyWebhook, getDashboardData, pingTest, getProviderMeta };
