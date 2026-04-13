/* =======================================
   Crypto Donation Support — Balance Manager
   Migrated from extensions/donations/server/crypto/balance.js
   Now uses the shared db instead of extDb parameter.
   ======================================= */
'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { InsufficientBalanceError } = require('./errors');
const { convertFromUsd } = require('./exchange');

async function _ensureBalance(userId) {
    await db.run(
        `INSERT OR IGNORE INTO user_balances (user_id, usd_balance, updated_at) VALUES (?, 0.0, ?)`,
        [userId, new Date().toISOString()]
    );
}

async function credit(userId, amountUsd, source, description, referenceId = null, adminId = null) {
    if (!userId || amountUsd <= 0) return;
    await _ensureBalance(userId);

    const now = new Date().toISOString();
    await db.run(
        `UPDATE user_balances SET usd_balance = ROUND(usd_balance + ?, 8), updated_at = ? WHERE user_id = ?`,
        [amountUsd, now, userId]
    );

    await db.run(
        `INSERT INTO balance_transactions (id, user_id, type, amount_usd, source, description, reference_id, admin_id, created_at)
         VALUES (?, ?, 'credit', ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, amountUsd, source, description, referenceId, adminId, now]
    );
}

async function debit(userId, amountUsd, source, description, referenceId = null, adminId = null) {
    if (!userId || amountUsd <= 0) return;
    await _ensureBalance(userId);

    const row = await db.get('SELECT usd_balance FROM user_balances WHERE user_id = ?', [userId]);
    const current = row?.usd_balance ?? 0;

    if (current < amountUsd) {
        throw new InsufficientBalanceError(amountUsd, current);
    }

    const now = new Date().toISOString();
    await db.run(
        `UPDATE user_balances SET usd_balance = ROUND(usd_balance - ?, 8), updated_at = ? WHERE user_id = ?`,
        [amountUsd, now, userId]
    );

    await db.run(
        `INSERT INTO balance_transactions (id, user_id, type, amount_usd, source, description, reference_id, admin_id, created_at)
         VALUES (?, ?, 'debit', ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), userId, amountUsd, source, description, referenceId, adminId, now]
    );
}

async function getBalance(userId) {
    const row = await db.get('SELECT usd_balance FROM user_balances WHERE user_id = ?', [userId]);
    return row?.usd_balance ?? 0;
}

async function getLedger(userId, limit = 50) {
    return db.all(
        `SELECT * FROM balance_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [userId, limit]
    );
}

async function adminAdjust(adminId, userId, amountUsd, reason) {
    if (!reason || !reason.trim()) throw new Error('Reason is required for admin balance adjustments');

    if (amountUsd > 0) {
        await credit(userId, amountUsd, 'admin_adjustment', reason, null, adminId);
    } else if (amountUsd < 0) {
        await debit(userId, Math.abs(amountUsd), 'admin_adjustment', reason, null, adminId);
    }
}

async function convertForDisplay(amountUsd, targetCurrency, cachedRates) {
    return convertFromUsd(amountUsd, targetCurrency, cachedRates);
}

async function getDisplayCurrency(userId) {
    const row = await db.get('SELECT balance_display_currency FROM user_preferences WHERE user_id = ?', [userId]);
    return row?.balance_display_currency ?? 'usd';
}

async function setDisplayCurrency(userId, currency) {
    const now = new Date().toISOString();
    await db.run(
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
