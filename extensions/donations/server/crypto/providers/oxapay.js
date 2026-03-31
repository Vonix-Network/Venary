/* =======================================
   Oxapay Provider
   API docs: https://docs.oxapay.com
   Fee: 0.4% per transaction
   ======================================= */
'use strict';

const crypto   = require('crypto');
const BASE_URL = 'https://api.oxapay.com';

/** Map internal coin codes to Oxapay currency codes. */
const COIN_MAP = { sol: 'SOL', ltc: 'LTC' };

async function _post(path, body, Config) {
    const merchantKey = Config.get('donations.crypto.oxapay_merchant_key', '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${merchantKey}` },
            body:    JSON.stringify({ merchant: merchantKey, ...body }),
            signal:  ctrl.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (json.result !== 'success') throw new Error(json.message || `Oxapay error (result: ${json.result})`);
        return json;
    } finally {
        clearTimeout(t);
    }
}

function isConfigured(Config) {
    return !!(Config.get('donations.crypto.oxapay_merchant_key'));
}

async function createPayment({ amount_usd, coin, order_id, notify_url, success_url, description }, Config) {
    const currency = COIN_MAP[coin];
    if (!currency) throw new Error(`Oxapay: unsupported coin ${coin}`);

    const data = await _post('/merchants/request', {
        amount:      amount_usd,
        currency:    'USD',
        payCurrency: currency,
        lifeTime:    240, // 240 minutes
        feePaidByPayer: 0,
        underPaidCover: 5,
        callbackUrl:  notify_url,
        returnUrl:    success_url,
        description:  description || 'Venary Server Donation',
        orderId:      order_id,
    }, Config);

    return {
        provider_payment_id: data.trackId,
        checkout_url:        data.payLink,
        address:             data.address,
        coin,
    };
}

/**
 * verifyWebhook — HMAC-SHA512 of JSON body (excluding hmac field) using the API key.
 */
function verifyWebhook(rawBody, headers, Config) {
    const apiKey = Config.get('donations.crypto.oxapay_api_key', '');

    let parsed;
    try { parsed = JSON.parse(rawBody.toString()); } catch { throw new Error('Oxapay: invalid JSON body'); }

    if (apiKey) {
        const { hmac: receivedHmac, ...rest } = parsed;
        const sortedStr = JSON.stringify(Object.fromEntries(Object.entries(rest).sort()));
        const expected = crypto.createHmac('sha512', apiKey).update(sortedStr).digest('hex');
        if (expected !== receivedHmac) {
            throw new Error('Oxapay: invalid HMAC signature');
        }
    }

    return {
        provider_payment_id: parsed.trackId,
        order_id:            parsed.orderId,
        status:              parsed.status,
        is_confirmed:        parsed.status === 'Paid',
        amount_received:     parseFloat(parsed.payAmount || 0),
        coin:                (parsed.payCurrency || '').toLowerCase(),
    };
}

async function getDashboardData(Config) {
    try {
        const data = await _post('/merchants/transactions', { size: 10 }, Config);
        const txs = Array.isArray(data.data) ? data.data : [];
        return {
            recent_payments: txs.map(tx => ({
                id:          tx.trackId,
                coin:        tx.payCurrency?.toLowerCase(),
                amount_usd:  tx.amount,
                status:      tx.status,
                provider_id: tx.trackId,
                created_at:  new Date(tx.date * 1000).toISOString(),
            })),
            balance_info: 'Managed by Oxapay — view balance on your merchant dashboard.',
            payout_info:  'Funds forwarded to your linked payout wallet.',
        };
    } catch {
        return { recent_payments: [], balance_info: 'Unavailable', payout_info: 'Configure merchant key to view.' };
    }
}

async function pingTest(Config) {
    if (!isConfigured(Config)) return { ok: false, message: 'Merchant key not configured.' };
    const t0 = Date.now();
    try {
        await _post('/merchants/transactions', { size: 1 }, Config);
        return { ok: true, latency_ms: Date.now() - t0 };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

function getProviderMeta() {
    return { id: 'oxapay', name: 'Oxapay', fee: '0.4%', color: '#fb923c' };
}

module.exports = { isConfigured, createPayment, verifyWebhook, getDashboardData, pingTest, getProviderMeta };
