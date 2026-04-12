/* =======================================
   Messenger — Settings & Message Requests
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const mainDb = require('../../../../server/db');

const DEFAULTS = {
    allow_dms: 'everyone',
    message_requests: 1,
    auto_accept_requests: 0,
    show_online_status: 1,
    show_read_receipts: 1,
    allow_friend_requests: 1,
    dm_notifications: 'all',
    notification_sounds: 1,
    notification_previews: 1,
    compact_mode: 0,
    emoji_size: 'medium',
    link_previews: 1,
    developer_mode: 0
};

module.exports = function (db, ns) {
    const router = express.Router();

    // ── Helper: get or create settings row ──────────────────────
    async function getSettings(userId) {
        let s = await db.get('SELECT * FROM messenger_settings WHERE user_id = ?', [userId]);
        if (!s) {
            await db.run(
                `INSERT OR IGNORE INTO messenger_settings (user_id) VALUES (?)`,
                [userId]
            );
            s = await db.get('SELECT * FROM messenger_settings WHERE user_id = ?', [userId]);
        }
        // Merge with defaults in case new columns were added
        return Object.assign({}, DEFAULTS, s);
    }

    // GET /settings — fetch current user's messenger settings
    router.get('/settings', authenticateToken, async (req, res) => {
        try {
            res.json(await getSettings(req.user.id));
        } catch (err) {
            console.error('Get messenger settings error:', err);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    // PUT /settings — update current user's messenger settings
    router.put('/settings', authenticateToken, async (req, res) => {
        const allowed = Object.keys(DEFAULTS);
        const updates = [];
        const values = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }

        if (updates.length === 0) return res.status(400).json({ error: 'No valid fields provided' });

        try {
            // Upsert
            await db.run(
                `INSERT OR IGNORE INTO messenger_settings (user_id) VALUES (?)`,
                [req.user.id]
            );
            updates.push('updated_at = ?');
            values.push(new Date().toISOString());
            values.push(req.user.id);
            await db.run(
                `UPDATE messenger_settings SET ${updates.join(', ')} WHERE user_id = ?`,
                values
            );
            res.json(await getSettings(req.user.id));
        } catch (err) {
            console.error('Update messenger settings error:', err);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // ── Message Requests ─────────────────────────────────────────

    // GET /requests — list pending incoming message requests
    router.get('/requests', authenticateToken, async (req, res) => {
        try {
            const requests = await db.all(
                `SELECT * FROM message_requests WHERE to_user_id = ? AND status = 'pending'
                 ORDER BY created_at DESC`,
                [req.user.id]
            );

            // Enrich with sender info
            const enriched = await Promise.all(requests.map(async r => {
                const sender = await mainDb.get(
                    'SELECT id, username, display_name, avatar, status FROM users WHERE id = ?',
                    [r.from_user_id]
                );
                return { ...r, sender };
            }));

            res.json(enriched);
        } catch (err) {
            console.error('Get message requests error:', err);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    });

    // GET /requests/sent — list sent requests
    router.get('/requests/sent', authenticateToken, async (req, res) => {
        try {
            const requests = await db.all(
                `SELECT * FROM message_requests WHERE from_user_id = ? AND status = 'pending'
                 ORDER BY created_at DESC`,
                [req.user.id]
            );
            res.json(requests);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch sent requests' });
        }
    });

    // POST /requests/:id/accept — accept a message request
    router.post('/requests/:id/accept', authenticateToken, async (req, res) => {
        try {
            const request = await db.get(
                `SELECT * FROM message_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
                [req.params.id, req.user.id]
            );
            if (!request) return res.status(404).json({ error: 'Request not found' });

            const now = new Date().toISOString();

            // Create the actual DM channel if not already created
            let dmId = request.dm_channel_id;
            if (!dmId) {
                dmId = uuidv4();
                await db.run(
                    `INSERT INTO dm_channels (id, type, created_at) VALUES (?, 'dm', ?)`,
                    [dmId, now]
                );
                await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, request.from_user_id]);
                await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, req.user.id]);
            }

            await db.run(
                `UPDATE message_requests SET status = 'accepted', dm_channel_id = ?, updated_at = ? WHERE id = ?`,
                [dmId, now, request.id]
            );

            // Notify requester via socket
            if (ns) {
                ns.to(`user:${request.from_user_id}`).emit('dm:request_accepted', { request_id: request.id, dm_channel_id: dmId });
            }

            const dmChannel = await db.get('SELECT * FROM dm_channels WHERE id = ?', [dmId]);
            res.json({ request_id: request.id, dm_channel: dmChannel });
        } catch (err) {
            console.error('Accept request error:', err);
            res.status(500).json({ error: 'Failed to accept request' });
        }
    });

    // POST /requests/:id/decline — decline a message request
    router.post('/requests/:id/decline', authenticateToken, async (req, res) => {
        try {
            const request = await db.get(
                `SELECT * FROM message_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
                [req.params.id, req.user.id]
            );
            if (!request) return res.status(404).json({ error: 'Request not found' });

            await db.run(
                `UPDATE message_requests SET status = 'declined', updated_at = ? WHERE id = ?`,
                [new Date().toISOString(), request.id]
            );

            // Notify requester
            if (ns) {
                ns.to(`user:${request.from_user_id}`).emit('dm:request_declined', { request_id: request.id });
            }

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to decline request' });
        }
    });

    // DELETE /requests/:id — cancel a sent request
    router.delete('/requests/:id', authenticateToken, async (req, res) => {
        try {
            await db.run(
                `DELETE FROM message_requests WHERE id = ? AND from_user_id = ?`,
                [req.params.id, req.user.id]
            );
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to cancel request' });
        }
    });

    // Expose getSettings for use in dm.js
    router.getSettings = getSettings;

    return router;
};
