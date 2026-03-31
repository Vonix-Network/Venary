/* =======================================
   NOWPayments Provider
   REST API — https://nowpayments.io/docs
   Fee: 0.5% per transaction
   ======================================= */
'use strict';

const crypto = require('crypto');
const BASE_URL      = 'https://api.nowpayments.io/v1';
const BASE_SANDBOX  = 'https://api-sandbox.nowpayments.io/v1';

/** Map internal coin codes to NOWPayments currency codes. */
const COIN_MAP = { sol: 'sol', ltc: 'ltc' };

function _base(Config) {
    return Config.get('donations.crypto.nowpayments_sandbox', false) ? BASE_SANDBOX : BASE_URL;
}

function _headers(Config) {
    return {
        'x-api-key': Config.get('donations.crypto.nowpayments_api_key', ''),
        'Content-Type': 'application/json',
    };
}

async function _fetch(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || `NOWPayments HTTP ${res.status}`);
        return json;
    } finally {
        clearTimeout(t);
    }
}

function isConfigured(Config) {
    return !!(Config.get('donations.crypto.nowpayments_api_key'));
}

/**
 * createPayment — create a NOWPayments invoice and return checkout_url + provider_payment_id.
 * @param {{ amount_usd, coin, order_id, notify_url, success_url, cancel_url, description }} opts
 * @param {object} Config
 */
async function createPayment({ amount_usd, coin, order_id, notify_url, success_url, cancel_url, description }, Config) {
    const pay_currency = COIN_MAP[coin];
    if (!pay_currency) throw new Error(`NOWPayments: unsupported coin ${coin}`);

    const body = {
        price_amount:    amount_usd,
        price_currency:  'usd',
        pay_currency,
        order_id,
        order_description: description || 'Venary Server Donation',
        ipn_callback_url: notify_url,
        success_url,
        cancel_url,
        is_fixed_rate: false,
        is_fee_paid_by_user: false,
    };

    const data = await _fetch(`${_base(Config)}/payment`, {
        method:  'POST',
        headers: _headers(Config),
        body:    JSON.stringify(body),
    });

    return {
        provider_payment_id: String(data.payment_id),
        checkout_url:        data.invoice_url || data.pay_address,
        address:             data.pay_address,
        coin,
    };
}

/**
 * verifyWebhook — validate the x-nowpayments-sig HMAC-SHA512 signature.
 * Throws if invalid. Returns parsed payment data.
 * @param {Buffer} rawBody
 * @param {object} headers
 * @param {object} Config
 */
function verifyWebhook(rawBody, headers, Config) {
    const secret = Config.get('donations.crypto.nowpayments_ipn_secret', '');
    if (!secret) {
        throw new Error('NOWPayments: IPN secret not configured — refusing to process unverified webhook');
    }
    const sig = headers['x-nowpayments-sig'] || '';
    let sortedBody;
    try {
        const parsed = JSON.parse(rawBody.toString());
        sortedBody = JSON.stringify(Object.fromEntries(Object.entries(parsed).sort()));
    } catch {
        throw new Error('NOWPayments: invalid JSON body');
    }
    const expected = crypto.createHmac('sha512', secret).update(sortedBody).digest('hex');
    // Timing-safe comparison to prevent HMAC oracle attacks
    try {
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
            throw new Error('NOWPayments: invalid IPN signature');
        }
    } catch (e) {
        if (e.message === 'NOWPayments: invalid IPN signature') throw e;
        throw new Error('NOWPayments: invalid IPN signature'); // length mismatch = tampered
    }
    const data = JSON.parse(rawBody.toString());
    return {
        provider_payment_id: String(data.payment_id),
        order_id:            data.order_id,
        status:              data.payment_status, // 'finished' | 'confirmed' | 'failed' | 'expired' | 'waiting'
        is_confirmed:        ['finished', 'confirmed'].includes(data.payment_status),
        amount_received:     parseFloat(data.actually_paid || 0),
        coin:                data.pay_currency,
    };
}

async function getDashboardData(Config) {
    const [payments, balance] = await Promise.allSettled([
        _fetch(`${_base(Config)}/payment/?limit=10&sortBy=created_at&orderBy=desc`, { headers: _headers(Config) }),
        _fetch(`${_base(Config)}/balance`, { headers: _headers(Config) }),
    ]);

    const recent = payments.status === 'fulfilled'
        ? (payments.value.data || []).map(p => ({
            id:          String(p.payment_id),
            coin:        p.pay_currency,
            amount_usd:  p.price_amount,
            status:      p.payment_status,
            provider_id: String(p.payment_id),
            created_at:  p.created_at,
        }))
        : [];

    const bal = balance.status === 'fulfilled' ? balance.value : null;

    return {
        recent_payments: recent,
        balance_info:    bal ? Object.entries(bal).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ') : 'Unavailable',
        payout_info:     'Auto-converted and paid out to your NOWPayments account wallet.',
    };
}

async function pingTest(Config) {
    if (!isConfigured(Config)) return { ok: false, message: 'API key not configured.' };
    const t0 = Date.now();
    try {
        await _fetch(`${_base(Config)}/currencies`, { headers: _headers(Config) });
        return { ok: true, latency_ms: Date.now() - t0 };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

function getProviderMeta() {
    return { id: 'nowpayments', name: 'NOWPayments', fee: '0.5%', color: '#29b6f6' };
}

module.exports = { isConfigured, createPayment, verifyWebhook, getDashboardData, pingTest, getProviderMeta };
