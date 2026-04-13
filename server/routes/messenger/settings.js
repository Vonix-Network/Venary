'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { authenticateToken } = require('../../middleware/auth');

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
    developer_mode: 0,
};

module.exports = function (getNs) {
    const router = express.Router();

    async function getSettings(userId) {
        let s = await db.get('SELECT * FROM messenger_settings WHERE user_id = ?', [userId]);
        if (!s) {
            await db.run('INSERT OR IGNORE INTO messenger_settings (user_id) VALUES (?)', [userId]);
            s = await db.get('SELECT * FROM messenger_settings WHERE user_id = ?', [userId]);
        }
        return Object.assign({}, DEFAULTS, s);
    }

    // GET /settings
    router.get('/settings', authenticateToken, async (req, res) => {
        try {
            res.json(await getSettings(req.user.id));
        } catch (err) {
            console.error('Get messenger settings error:', err);
            res.status(500).json({ error: 'Failed to fetch settings' });
        }
    });

    // PUT /settings
    router.put('/settings', authenticateToken, async (req, res) => {
        const allowed = Object.keys(DEFAULTS);
        const updates = [];
        const values  = [];

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates.push(`${key} = ?`);
                values.push(req.body[key]);
            }
        }
        if (!updates.length) return res.status(400).json({ error: 'No valid fields provided' });

        try {
            await db.run('INSERT OR IGNORE INTO messenger_settings (user_id) VALUES (?)', [req.user.id]);
            updates.push('updated_at = ?');
            values.push(new Date().toISOString(), req.user.id);
            await db.run(`UPDATE messenger_settings SET ${updates.join(', ')} WHERE user_id = ?`, values);
            res.json(await getSettings(req.user.id));
        } catch (err) {
            console.error('Update messenger settings error:', err);
            res.status(500).json({ error: 'Failed to update settings' });
        }
    });

    // GET /requests — incoming pending requests
    router.get('/requests', authenticateToken, async (req, res) => {
        try {
            const requests = await db.all(
                `SELECT * FROM message_requests WHERE to_user_id = ? AND status = 'pending' ORDER BY created_at DESC`,
                [req.user.id]
            );
            const enriched = await Promise.all(requests.map(async r => {
                const sender = await db.get(
                    'SELECT id, username, display_name, avatar, status FROM users WHERE id = ?', [r.from_user_id]
                );
                return { ...r, sender };
            }));
            res.json(enriched);
        } catch (err) {
            console.error('Get message requests error:', err);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    });

    // GET /requests/sent
    router.get('/requests/sent', authenticateToken, async (req, res) => {
        try {
            const requests = await db.all(
                `SELECT * FROM message_requests WHERE from_user_id = ? AND status = 'pending' ORDER BY created_at DESC`,
                [req.user.id]
            );
            res.json(requests);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch sent requests' });
        }
    });

    // POST /requests/:id/accept
    router.post('/requests/:id/accept', authenticateToken, async (req, res) => {
        try {
            const request = await db.get(
                `SELECT * FROM message_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
                [req.params.id, req.user.id]
            );
            if (!request) return res.status(404).json({ error: 'Request not found' });

            const now  = new Date().toISOString();
            let dmId   = request.dm_channel_id;

            if (!dmId) {
                dmId = uuidv4();
                await db.run(`INSERT INTO dm_channels (id, type, created_at) VALUES (?, 'dm', ?)`, [dmId, now]);
                await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, request.from_user_id]);
                await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, req.user.id]);
            }

            await db.run(
                `UPDATE message_requests SET status = 'accepted', dm_channel_id = ?, updated_at = ? WHERE id = ?`,
                [dmId, now, request.id]
            );

            const ns = getNs();
            if (ns) ns.to(`user:${request.from_user_id}`).emit('dm:request_accepted', { request_id: request.id, dm_channel_id: dmId });

            res.json({ request_id: request.id, dm_channel: await db.get('SELECT * FROM dm_channels WHERE id = ?', [dmId]) });
        } catch (err) {
            console.error('Accept request error:', err);
            res.status(500).json({ error: 'Failed to accept request' });
        }
    });

    // POST /requests/:id/decline
    router.post('/requests/:id/decline', authenticateToken, async (req, res) => {
        try {
            const request = await db.get(
                `SELECT * FROM message_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
                [req.params.id, req.user.id]
            );
            if (!request) return res.status(404).json({ error: 'Request not found' });

            await db.run(`UPDATE message_requests SET status = 'declined', updated_at = ? WHERE id = ?`,
                [new Date().toISOString(), request.id]);

            const ns = getNs();
            if (ns) ns.to(`user:${request.from_user_id}`).emit('dm:request_declined', { request_id: request.id });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to decline request' });
        }
    });

    // DELETE /requests/:id — cancel sent request
    router.delete('/requests/:id', authenticateToken, async (req, res) => {
        try {
            await db.run('DELETE FROM message_requests WHERE id = ? AND from_user_id = ?', [req.params.id, req.user.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to cancel request' });
        }
    });

    return router;
};
