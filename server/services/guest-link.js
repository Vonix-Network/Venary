/* =======================================
   Donations — Guest Email Linking
   Migrated from extensions/donations/server/guest-link.js
   Now uses shared db instead of extDb parameter.
   Called by auth/register to transfer guest donations to the new account.
   ======================================= */
'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const balanceMgr = require('./crypto/balance');

/**
 * Link all completed guest donations matching `email` to `userId`.
 * Grants any purchased ranks and credits balance for custom donations.
 * Safe to call multiple times — already-linked rows have user_id set and are skipped.
 *
 * @param {string} userId   - New user's ID
 * @param {string} email    - Email the user registered with
 * @returns {Promise<number>} Number of donations linked
 */
async function linkByEmail(userId, email) {
    if (!email || !userId) return 0;

    const donations = await db.all(
        "SELECT * FROM donations WHERE guest_email = ? AND user_id IS NULL AND status = 'completed'",
        [email.trim().toLowerCase()]
    );
    if (!donations.length) return 0;

    for (const d of donations) {
        await db.run('UPDATE donations SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, d.id]);

        if (d.rank_id) {
            const rank = await db.get('SELECT * FROM donation_ranks WHERE id = ?', [d.rank_id]);
            if (rank) {
                const expiresAt = d.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const existing  = await db.get('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);
                if (existing) {
                    let newExpiry = expiresAt;
                    if (existing.rank_id === d.rank_id && existing.expires_at && new Date(existing.expires_at) > new Date()) {
                        newExpiry = new Date(new Date(existing.expires_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                    }
                    await db.run(
                        'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                        [d.rank_id, newExpiry, new Date().toISOString(), userId]
                    );
                } else {
                    await db.run(
                        'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
                        [uuidv4(), userId, d.rank_id, expiresAt]
                    );
                }
                console.log(`[Donations] Guest link: granted rank ${rank.name} to user ${userId}`);
            }
        } else {
            try {
                await balanceMgr.credit(
                    userId,
                    d.amount,
                    'guest_link',
                    `Guest donation linked on registration (ref: ${d.id.slice(0, 8).toUpperCase()})`,
                    d.id
                );
                console.log(`[Donations] Guest link: credited $${d.amount} to user ${userId}`);
            } catch (err) {
                console.error(`[Donations] Guest link balance credit error for donation ${d.id}:`, err.message);
            }
        }
    }

    console.log(`[Donations] Guest link: linked ${donations.length} donation(s) to user ${userId} via email ${email}`);
    return donations.length;
}

module.exports = { linkByEmail };
