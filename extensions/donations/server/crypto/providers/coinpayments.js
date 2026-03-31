/* =======================================
   CoinPayments Provider
   API docs: https://www.coinpayments.net/apidoc
   Fee: 0.5% per transaction
   ======================================= */
'use strict';

const crypto  = require('crypto');
const BASE_URL = 'https://www.coinpayments.net/api.php';

/** Map internal coin codes to CoinPayments currency codes. */
const COIN_MAP = { sol: 'SOL', ltc: 'LTC' };

/**
 * Sign a CoinPayments API request with HMAC-SHA512.
 * All parameters are sorted and encoded as a query string, then signed with the private key.
 */
function _sign(params, privateKey) {
    const qs = new URLSearchParams(params).toString();
    return { qs, hmac: crypto.createHmac('sha512', privateKey).update(qs).digest('hex') };
}

async function _call(params, Config) {
    const pub  = Config.get('donations.crypto.coinpayments_public_key', '');
    const priv = Config.get('donations.crypto.coinpayments_private_key', '');
    const body = { ...params, version: '1', key: pub, format: 'json' };
    const { qs, hmac } = _sign(body, priv);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
        const res = await fetch(BASE_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'HMAC': hmac },
            body:    qs,
            signal:  ctrl.signal,
        });
        const json = await res.json().catch(() => ({}));
        if (json.error !== 'ok') throw new Error(json.error || `CoinPayments error`);
        return json.result;
    } finally {
        clearTimeout(t);
    }
}

function isConfigured(Config) {
    return !!(Config.get('donations.crypto.coinpayments_public_key') &&
              Config.get('donations.crypto.coinpayments_private_key') &&
              Config.get('donations.crypto.coinpayments_merchant_id'));
}

async function createPayment({ amount_usd, coin, order_id, notify_url, success_url, cancel_url, description }, Config) {
    const currency2 = COIN_MAP[coin];
    if (!currency2) throw new Error(`CoinPayments: unsupported coin ${coin}`);

    const result = await _call({
        cmd:            'create_transaction',
        amount:         amount_usd,
        currency1:      'USD',
        currency2,
        buyer_email:    'customer@example.com', // CoinPayments requires this but doesn't send email
        item_name:      description || 'Venary Server Donation',
        item_number:    order_id,
        ipn_url:        notify_url,
        success_url,
        cancel_url,
    }, Config);

    return {
        provider_payment_id: result.txn_id,
        checkout_url:        result.checkout_url,
        address:             result.address,
        coin,
    };
}

/**
 * verifyWebhook — validate HMAC-SHA512 from the IPN secret.
 * CoinPayments sends the raw POST body; HMAC is in the HTTP_HMAC header.
 */
function verifyWebhook(rawBody, headers, Config) {
    const secret = Config.get('donations.crypto.coinpayments_ipn_secret', '');
    const merchantId = Config.get('donations.crypto.coinpayments_merchant_id', '');

    if (!secret) {
        throw new Error('CoinPayments: IPN secret not configured — refusing to process unverified webhook');
    }
    const sig = headers['hmac'] || '';
    const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
    // Timing-safe comparison to prevent HMAC oracle attacks
    try {
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
            throw new Error('CoinPayments: invalid IPN signature');
        }
    } catch (e) {
        if (e.message === 'CoinPayments: invalid IPN signature') throw e;
        throw new Error('CoinPayments: invalid IPN signature'); // length mismatch = tampered
    }

    const params = Object.fromEntries(new URLSearchParams(rawBody.toString()));
    if (merchantId && params.merchant !== merchantId) {
        throw new Error('CoinPayments: merchant ID mismatch');
    }

    return {
        provider_payment_id: params.txn_id,
        order_id:            params.item_number,
        status:              params.status_text,
        // status >= 100 or status == 2 means complete in CoinPayments
        is_confirmed:        parseInt(params.status, 10) >= 100 || params.status === '2',
        amount_received:     parseFloat(params.received_amount || 0),
        coin:                (params.currency2 || '').toLowerCase(),
    };
}

async function getDashboardData(Config) {
    const [info, txIds] = await Promise.allSettled([
        _call({ cmd: 'get_basic_info' }, Config),
        _call({ cmd: 'get_tx_ids', limit: 10, newer: 0 }, Config),
    ]);

    let recent = [];
    if (txIds.status === 'fulfilled' && Array.isArray(txIds.value)) {
        const txList = await _call({ cmd: 'get_tx_info_multi', txid: txIds.value.join('|') }, Config).catch(() => ({}));
        recent = Object.values(txList || {}).map(tx => ({
            id:          tx.txn_id,
            coin:        tx.currency2?.toLowerCase(),
            amount_usd:  tx.amounti ? parseFloat(tx.amounti) / 1e8 : 0,
            status:      tx.status_text,
            provider_id: tx.txn_id,
            created_at:  new Date(tx.time_created * 1000).toISOString(),
        }));
    }

    const balStr = info.status === 'fulfilled' && info.value.balances
        ? Object.entries(info.value.balances).map(([k, v]) => `${k}: ${v.balance}`).join(' · ')
        : 'Unavailable';

    return {
        recent_payments: recent,
        balance_info:    balStr,
        payout_info:     'Funds held in your CoinPayments merchant account. Withdraw from the CoinPayments dashboard.',
    };
}

async function pingTest(Config) {
    if (!isConfigured(Config)) return { ok: false, message: 'Public key, private key, or merchant ID not configured.' };
    const t0 = Date.now();
    try {
        await _call({ cmd: 'get_basic_info' }, Config);
        return { ok: true, latency_ms: Date.now() - t0 };
    } catch (err) {
        return { ok: false, message: err.message };
    }
}

function getProviderMeta() {
    return { id: 'coinpayments', name: 'CoinPayments', fee: '0.5%', color: '#22c55e' };
}

module.exports = { isConfigured, createPayment, verifyWebhook, getDashboardData, pingTest, getProviderMeta };
