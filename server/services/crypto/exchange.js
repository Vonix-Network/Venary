/* =======================================
   Crypto Donation Support — Exchange Rates
   Dual-source rate fetching (CoinGecko + Binance),
   60s cache, median selection, rate locking.
   ======================================= */
'use strict';

const { ExchangeRateUnavailableError } = require('./errors');

// ── Module-level rate cache ──
let _cache = null; // { sol_usd, ltc_usd, fetched_at }
const CACHE_TTL_MS = 60 * 1000;       // 60 seconds — fresh cache
const STALE_MAX_MS = 5 * 60 * 1000;  // 5 minutes — max stale tolerance
const DIVERGENCE_THRESHOLD = 0.02;   // 2% divergence triggers warning

/**
 * Fetch SOL/USD and LTC/USD from CoinGecko.
 * @returns {Promise<{ sol_usd: number, ltc_usd: number }>}
 */
async function _fetchCoinGecko() {
    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=solana,litecoin&vs_currencies=usd';
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = await res.json();
    const sol = data?.solana?.usd;
    const ltc = data?.litecoin?.usd;
    if (!sol || !ltc) throw new Error('CoinGecko: missing rate fields');
    return { sol_usd: sol, ltc_usd: ltc };
}

/**
 * Fetch SOL/USD and LTC/USD from Binance.
 * @returns {Promise<{ sol_usd: number, ltc_usd: number }>}
 */
async function _fetchBinance() {
    const [solRes, ltcRes] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', { signal: AbortSignal.timeout(5000) }),
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT', { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!solRes.ok || !ltcRes.ok) throw new Error(`Binance HTTP error`);
    const [solData, ltcData] = await Promise.all([solRes.json(), ltcRes.json()]);
    const sol = parseFloat(solData?.price);
    const ltc = parseFloat(ltcData?.price);
    if (!sol || !ltc || isNaN(sol) || isNaN(ltc)) throw new Error('Binance: missing rate fields');
    return { sol_usd: sol, ltc_usd: ltc };
}

/**
 * Compute median of an array of numbers.
 * @param {number[]} values
 * @returns {number}
 */
function _median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Check if two rates diverge by more than DIVERGENCE_THRESHOLD.
 * @param {number} a
 * @param {number} b
 * @returns {boolean}
 */
function _diverges(a, b) {
    return Math.abs(a - b) / Math.max(a, b) > DIVERGENCE_THRESHOLD;
}

/**
 * Fetch current SOL/USD and LTC/USD rates.
 * - Returns cached value if age < 60s
 * - Falls back to stale cache (up to 5 min) if all sources fail
 * - Throws ExchangeRateUnavailableError if cache is >5 min stale and all sources fail
 *
 * @returns {Promise<{ sol_usd: number, ltc_usd: number, fetched_at: number }>}
 */
async function getRates() {
    const now = Date.now();

    // Return fresh cache
    if (_cache && (now - _cache.fetched_at) < CACHE_TTL_MS) {
        return _cache;
    }

    // Try both sources
    let cgRates = null, bnRates = null, cgErr = null, bnErr = null;

    try { cgRates = await _fetchCoinGecko(); } catch (e) { cgErr = e; }
    try { bnRates = await _fetchBinance(); } catch (e) { bnErr = e; }

    if (cgRates && bnRates) {
        // Both succeeded — check divergence and use median
        const solDiverges = _diverges(cgRates.sol_usd, bnRates.sol_usd);
        const ltcDiverges = _diverges(cgRates.ltc_usd, bnRates.ltc_usd);

        if (solDiverges || ltcDiverges) {
            console.warn('[Donations/Crypto] ⚠️  Exchange rate divergence detected — using median');
        }

        _cache = {
            sol_usd: _median([cgRates.sol_usd, bnRates.sol_usd]),
            ltc_usd: _median([cgRates.ltc_usd, bnRates.ltc_usd]),
            fetched_at: now,
        };
        return _cache;
    }

    if (cgRates) {
        console.warn('[Donations/Crypto] ⚠️  Binance unavailable, using CoinGecko only:', bnErr?.message);
        _cache = { ...cgRates, fetched_at: now };
        return _cache;
    }

    if (bnRates) {
        console.warn('[Donations/Crypto] ⚠️  CoinGecko unavailable, using Binance only:', cgErr?.message);
        _cache = { ...bnRates, fetched_at: now };
        return _cache;
    }

    // All sources failed — try stale cache
    if (_cache && (now - _cache.fetched_at) < STALE_MAX_MS) {
        console.warn('[Donations/Crypto] ⚠️  All rate sources failed, using stale cache');
        return _cache;
    }

    throw new ExchangeRateUnavailableError(
        `All exchange rate sources unavailable. CoinGecko: ${cgErr?.message}. Binance: ${bnErr?.message}`
    );
}

/**
 * Lock a USD amount to a specific crypto amount at the current rate.
 * The locked amount is stored on the payment intent and never changes.
 *
 * @param {number} usd_amount
 * @param {'sol'|'ltc'} coin
 * @returns {Promise<{ crypto_amount: number, rate_used: number }>}
 */
async function lockRate(usd_amount, coin) {
    const rates = await getRates();
    const rate = coin === 'sol' ? rates.sol_usd : rates.ltc_usd;
    // 8 decimal places of precision
    const crypto_amount = Math.round((usd_amount / rate) * 1e8) / 1e8;
    return { crypto_amount, rate_used: rate };
}

/**
 * Get the current display rate for a given coin (for balance display conversion).
 * @param {'sol'|'ltc'|'eur'|'gbp'|string} coin
 * @returns {Promise<number>} rate relative to USD
 */
async function getDisplayRate(coin) {
    const c = coin.toLowerCase();
    if (c === 'usd') return 1;

    if (c === 'sol' || c === 'ltc') {
        const rates = await getRates();
        return c === 'sol' ? rates.sol_usd : rates.ltc_usd;
    }

    // For fiat currencies (EUR, GBP etc.) — fetch from exchangerate-api (free tier)
    try {
        const res = await fetch(
            `https://open.er-api.com/v6/latest/USD`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (res.ok) {
            const data = await res.json();
            const rate = data?.rates?.[c.toUpperCase()];
            if (rate) return rate;
        }
    } catch { /* fall through to 1 */ }

    return 1; // fallback: treat as USD
}

/**
 * Convert a USD amount to a target display currency.
 * @param {number} amountUsd
 * @param {string} targetCurrency
 * @param {{ sol_usd?: number, ltc_usd?: number }} [cachedRates]
 * @returns {Promise<number>}
 */
async function convertFromUsd(amountUsd, targetCurrency, cachedRates) {
    const c = targetCurrency.toLowerCase();
    if (c === 'usd') return amountUsd;

    try {
        if ((c === 'sol' || c === 'ltc') && cachedRates) {
            const rate = c === 'sol' ? cachedRates.sol_usd : cachedRates.ltc_usd;
            if (rate) return Math.round((amountUsd / rate) * 1e8) / 1e8;
        }
        const rate = await getDisplayRate(c);
        if (c === 'sol' || c === 'ltc') {
            return Math.round((amountUsd / rate) * 1e8) / 1e8;
        }
        return Math.round(amountUsd * rate * 100) / 100;
    } catch {
        return amountUsd; // fallback to USD
    }
}

/** Expose cache for testing */
function _clearCache() { _cache = null; }

module.exports = { getRates, lockRate, getDisplayRate, convertFromUsd, _clearCache };
