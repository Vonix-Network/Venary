/* =======================================
   Crypto Donation Support — Balance Manager
   USD-denominated user balance: credit, debit,
   ledger, admin adjustments, display conversion.
   ======================================= */
'use strict';

const { v4: uuidv4 } = require('uuid');
const { InsufficientBalanceError } = require('./errors');
const { convertFromUsd } = require('./exchange');

/**
 * Ensure a user_balances row exists for the given user.
 * @param {string} userId
 * @param {object} extDb
 */
async function _ensureBalance(userId, extDb) {
    await extDb.run(
        `INSERT OR IGNORE INTO user_balances (user_id, usd_balance, updated_at) VALUES (?, 0.0, ?)`,
        [userId, new Date().toISOString()]
    );
}

/**
 * Credit a user's balance.
 * Creates the balance row if it doesn't exist.
 *
 * @param {string} userId
 * @param {number} amountUsd
 * @param {string} source  'stripe_custom'|'crypto_intent'|'anytime_address'|'admin_adjustment'
 * @param {string} description
 * @param {object} extDb
 * @param {string} [referenceId]
 * @param {string} [adminId]
 */
async function credit(userId, amountUsd, source, description, extDb, referenceId = null, adminId = null) {
    if (!userId || amountUsd <= 0) return;
    await _ensureBalance(userId, extDb);

    const now = new Date().toISOString();
    await extDb.run(
        `UPDATE user_balances SET usd_balance = ROUND(usd_balance + ?, 8), updated_at = ? WHERE user_id = ?`,
        [amountUsd, now, userId]
    );

    await extDb.run(
        `INSERT INTO balance_transactions (id, user_id, type, amount_usd, source, description, reference_id, admin_id, created_at)
         VALUES (?, ?, 'credit', ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, amountUsd, source, description, referenceId, adminId, now]
    );
}

/**
 * Debit a user's balance.
 * Throws InsufficientBalanceError if balance is too low.
 *
 * @param {string} userId
 * @param {number} amountUsd
 * @param {string} source
 * @param {string} description
 * @param {object} extDb
 * @param {string} [referenceId]
 * @param {string} [adminId]
 */
async function debit(userId, amountUsd, source, description, extDb, referenceId = null, adminId = null) {
    if (!userId || amountUsd <= 0) return;
    await _ensureBalance(userId, extDb);

    const row = await extDb.get('SELECT usd_balance FROM user_balances WHERE user_id = ?', [userId]);
    const current = row?.usd_balance ?? 0;

    if (current < amountUsd) {
        throw new InsufficientBalanceError(amountUsd, current);
    }

    const now = new Date().toISOString();
    await extDb.run(
        `UPDATE user_balances SET usd_balance = ROUND(usd_balance - ?, 8), updated_at = ? WHERE user_id = ?`,
        [amountUsd, now, userId]
    );

    await extDb.run(
        `INSERT INTO balance_transactions (id, user_id, type, amount_usd, source, description, reference_id, admin_id, created_at)
         VALUES (?, ?, 'debit', ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, amountUsd, source, description, referenceId, adminId, now]
    );
}

/**
 * Get a user's current USD balance.
 * Returns 0 if no balance row exists.
 *
 * @param {string} userId
 * @param {object} extDb
 * @returns {Promise<number>}
 */
async function getBalance(userId, extDb) {
    const row = await extDb.get('SELECT usd_balance FROM user_balances WHERE user_id = ?', [userId]);
    return row?.usd_balance ?? 0;
}

/**
 * Get a user's balance transaction ledger.
 *
 * @param {string} userId
 * @param {number} limit
 * @param {object} extDb
 * @returns {Promise<object[]>}
 */
async function getLedger(userId, limit = 50, extDb) {
    return extDb.all(
        `SELECT * FROM balance_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, limit]
    );
}

/**
 * Admin-initiated balance adjustment (credit or debit).
 * Positive amount = credit, negative = debit.
 * Always creates an audit log entry with admin_id and reason.
 *
 * @param {string} adminId
 * @param {string} userId
 * @param {number} amountUsd  positive = credit, negative = debit
 * @param {string} reason  required
 * @param {object} extDb
 */
async function adminAdjust(adminId, userId, amountUsd, reason, extDb) {
    if (!reason || !reason.trim()) throw new Error('Reason is required for admin balance adjustments');

    if (amountUsd > 0) {
        await credit(userId, amountUsd, 'admin_adjustment', reason, extDb, null, adminId);
    } else if (amountUsd < 0) {
        await debit(userId, Math.abs(amountUsd), 'admin_adjustment', reason, extDb, null, adminId);
    }
}

/**
 * Convert a USD balance amount to a target display currency.
 * Falls back to USD if conversion fails.
 *
 * @param {number} amountUsd
 * @param {string} targetCurrency
 * @param {object} [cachedRates]
 * @returns {Promise<number>}
 */
async function convertForDisplay(amountUsd, targetCurrency, cachedRates) {
    return convertFromUsd(amountUsd, targetCurrency, cachedRates);
}

/**
 * Get or create a user's display currency preference.
 * @param {string} userId
 * @param {object} extDb
 * @returns {Promise<string>}
 */
async function getDisplayCurrency(userId, extDb) {
    const row = await extDb.get('SELECT balance_display_currency FROM user_preferences WHERE user_id = ?', [userId]);
    return row?.balance_display_currency ?? 'usd';
}

/**
 * Set a user's display currency preference.
 * @param {string} userId
 * @param {string} currency
 * @param {object} extDb
 */
async function setDisplayCurrency(userId, currency, extDb) {
    const now = new Date().toISOString();
    await extDb.run(
        `INSERT INTO user_preferences (user_id, balance_display_currency, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET balance_display_currency = excluded.balance_display_currency, updated_at = excluded.updated_at`,
        [userId, currency.toLowerCase(), now]
    );
}

module.exports = {
    credit,
    debit,
    getBalance,
    getLedger,
    adminAdjust,
    convertForDisplay,
    getDisplayCurrency,
    setDisplayCurrency,
};
