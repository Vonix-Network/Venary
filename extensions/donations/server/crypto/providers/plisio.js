/* =======================================
   Plisio Provider
   API docs: https://plisio.net/documentation
   Fee: 0.5% per transaction
   ======================================= */
'use strict';

const crypto   = require('crypto');
const BASE_URL = 'https://plisio.net/api/v1';

// Plisio uses uppercase currency codes (e.g. 'BTC', 'SOL', 'LTC').

async function _get(path, params, Config) {
    const apiKey = Config.get('donations.crypto.plisio_api_key', '');
    const qs = new URLSearchParams({ ...params, api_key: apiKey }).toString();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(`${BASE_URL}${path}?${qs}`, { signal: ctrl.signal });
        const json = await res.json().catch(() => ({}));
        if (json.status !== 'success') throw new Error(json.message || `Plisio error`);
        return json.data;
    } finally {
        clearTimeout(t);
    }
}

function isConfigured(Config) {
    return !!(Config.get('donations.crypto.plisio_api_key'));
}

/**
 * getSupportedCurrencies — fetches supported coins from Plisio.
 * Returns lowercase ticker strings.
 */
async function getSupportedCurrencies(Config) {
    try {
        // Plisio exposes a list of supported cryptocurrencies via the currencies endpoint
        const data = await _get('/currencies/ETH', {}, Config); // any valid currency works as trigger
        // The response includes psys_cid list; fall through to static list on any shape mismatch
        if (Array.isArray(data)) {
            return data.map(c => (c.psys_cid || c).toLowerCase()).filter(Boolean).sort();
        }
        throw new Error('unexpected shape');
    } catch {
        // Plisio's confirmed supported list as of 2024
        return ['btc', 'eth', 'ltc', 'doge', 'bch', 'xmr', 'sol', 'bnb', 'usdt', 'usdc', 'dash', 'trx'];
    }
}

async function createPayment({ amount_usd, coin, order_id, notify_url, success_url, cancel_url, description }, Config) {
    const currency = coin.toUpperCase(); // Plisio uses uppercase tickers

    const data = await _get('/invoices/new', {
        currency,
        amount:         amount_usd,
        order_number:   order_id,
        order_name:     description || 'Venary Server Donation',
        callback_url:   notify_url,
        success_url,
        fail_url:       cancel_url,
        source_currency:'USD',
        source_amount:  amount_usd,
        type:           'invoice',
    }, Config);

    return {
        provider_payment_id: data.txn_id,
        checkout_url:        data.invoice_url,
        address:             data.wallet_hash,
        coin,
    };
}

/**
 * verifyWebhook — Plisio sends JSON with a verify_hash field.
 * Verify: HMAC-SHA1 of sorted JSON (keys sorted, excluding verify_hash) using api_key.
 */
function verifyWebhook(rawBody, headers, Config) {
    const apiKey = Config.get('donations.crypto.plisio_api_key', '');
    const ipnKey = Config.get('donations.crypto.plisio_ipn_key', '');
    const secret = ipnKey || apiKey;

    let parsed;
    try { parsed = JSON.parse(rawBody.toString()); } catch { throw new Error('Plisio: invalid JSON body'); }

    if (!secret) {
        throw new Error('Plisio: IPN secret not configured — refusing to process unverified webhook');
    }
    const { verify_hash, ...rest } = parsed;
    const sorted = JSON.stringify(Object.fromEntries(Object.entries(rest).sort()));
    const expected = crypto.createHmac('sha1', secret).update(sorted).digest('hex');
    // Timing-safe comparison to prevent HMAC oracle attacks
    try {
        if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(verify_hash || '', 'hex'))) {
            throw new Error('Plisio: invalid verify_hash');
        }
    } catch (e) {
        if (e.message === 'Plisio: invalid verify_hash') throw e;
        throw new Error('Plisio: invalid verify_hash'); // length mismatch = tampered
    }

    return {
        provider_payment_id: parsed.txn_id,
        order_id:            parsed.order_number,
        status:              parsed.status,
        is_confirmed:        ['completed', 'mismatch'].includes(parsed.status), // mismatch = underpaid but confirmed
        amount_received:     parseFloat(parsed.amount || 0),
        coin:                (parsed.currency || '').toLowerCase(),
    };
}

async function getDashboardData(Config) {
    try {
        const data = await _get('/operations', { page: 0, limit: 10 }, Config);
        const ops = Array.isArray(data?.ops) ? data.ops : [];
        return {
            recent_payments: ops.map(op => ({
                id:          op.txn_id,
                coin:        op.currency?.toLowerCase(),
                amount_usd:  op.source_amount,
                status:      op.status,
                provider_id: op.txn_id,
                created_at:  new Date(op.created_at * 1000).toISOString(),
            })),
            balance_info: 'Managed by Plisio — view balance on your dashboard.',
            payout_info:  'Funds forwarded to the payout address set in your Plisio account.',
        };
    } catch {
        return { recent_payments: [], balance_info: 'Unavailable', payout_info: 'Configure API key to view.' };
    }
}

async function pingTest(Config) {
    if (!isConfigured(Config)) return { ok: false, message: 'API key not configured.' };
    const t0 = Date.now();
    try {
        await _get('/currencies/SOL', {}, Config);
        return { ok: true, latency_ms: Date.now() - t0 };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

function getProviderMeta() {
    return { id: 'plisio', name: 'Plisio', fee: '0.5%', color: '#a78bfa' };
}

module.exports = { isConfigured, createPayment, verifyWebhook, getDashboardData, pingTest, getProviderMeta, getSupportedCurrencies };
