/* =======================================
   Donations — Guest Email Linking
   Called by auth/register to transfer guest donations to the new account.
   ======================================= */
const { v4: uuidv4 } = require('uuid');

/**
 * Link all completed guest donations matching `email` to `userId`.
 * Grants any purchased ranks and credits balance for custom donations.
 * Safe to call multiple times — already-linked rows have user_id set and are skipped.
 *
 * @param {string} userId   - New user's ID
 * @param {string} email    - Email the user registered with
 * @param {object} extDb    - Donations extension DB
 * @returns {Promise<number>} Number of donations linked
 */
async function linkByEmail(userId, email, extDb) {
    if (!email || !userId || !extDb) return 0;

    const donations = await extDb.all(
        "SELECT * FROM donations WHERE guest_email = ? AND user_id IS NULL AND status = 'completed'",
        [email.trim().toLowerCase()]
    );
    if (!donations.length) return 0;

    const balanceMgr = require('./crypto/balance');

    for (const d of donations) {
        // Assign user_id so subsequent calls skip this row
        await extDb.run('UPDATE donations SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, d.id]);

        if (d.rank_id) {
            // Grant rank — stack on top if already active
            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [d.rank_id]);
            if (rank) {
                const expiresAt = d.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const existing  = await extDb.get('SELECT * FROM user_ranks WHERE user_id = ?', [userId]);
                if (existing) {
                    // Stack time if same rank; replace if different
                    let newExpiry = expiresAt;
                    if (existing.rank_id === d.rank_id && existing.expires_at && new Date(existing.expires_at) > new Date()) {
                        newExpiry = new Date(new Date(existing.expires_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                    }
                    await extDb.run(
                        'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                        [d.rank_id, newExpiry, new Date().toISOString(), userId]
                    );
                } else {
                    await extDb.run(
                        'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
                        [uuidv4(), userId, d.rank_id, expiresAt]
                    );
                }
                console.log(`[Donations] Guest link: granted rank ${rank.name} to user ${userId}`);
            }
        } else {
            // Custom donation — credit the amount as balance
            try {
                await balanceMgr.credit(
                    userId,
                    d.amount,
                    'guest_link',
                    `Guest donation linked on registration (ref: ${d.id.slice(0, 8).toUpperCase()})`,
                    extDb,
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
