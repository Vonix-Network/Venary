/* =======================================
   Messenger — DM Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /dm — Open or get a 1:1 DM channel with a user
    router.post('/dm', authenticateToken, async (req, res) => {
        try {
            const { target_user_id } = req.body;
            if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
            if (target_user_id === req.user.id) return res.status(400).json({ error: 'Cannot DM yourself' });

            // Check if DM already exists between these two users
            const existing = await db.get(
                `SELECT dc.* FROM dm_channels dc
                 JOIN dm_members dm1 ON dm1.dm_channel_id = dc.id AND dm1.user_id = ?
                 JOIN dm_members dm2 ON dm2.dm_channel_id = dc.id AND dm2.user_id = ?
                 WHERE dc.type = 'dm'`,
                [req.user.id, target_user_id]
            );

            if (existing) return res.json(existing);

            const dmId = uuidv4();
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO dm_channels (id, type, created_at) VALUES (?, 'dm', ?)`,
                [dmId, now]
            );
            await db.run(
                'INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)',
                [dmId, req.user.id]
            );
            await db.run(
                'INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)',
                [dmId, target_user_id]
            );

            const dmChannel = await db.get('SELECT * FROM dm_channels WHERE id = ?', [dmId]);
            res.status(201).json(dmChannel);
        } catch (err) {
            res.status(500).json({ error: 'Failed to open DM' });
        }
    });

    // POST /dm/group — Create group DM
    router.post('/dm/group', authenticateToken, async (req, res) => {
        try {
            const { name, user_ids } = req.body;
            if (!user_ids || !Array.isArray(user_ids) || user_ids.length < 2) {
                return res.status(400).json({ error: 'At least 2 other users required for group DM' });
            }

            const dmId = uuidv4();
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO dm_channels (id, type, name, owner_id, created_at) VALUES (?, 'group_dm', ?, ?, ?)`,
                [dmId, name || null, req.user.id, now]
            );

            const members = [req.user.id, ...user_ids.filter(id => id !== req.user.id)];
            for (const uid of members) {
                await db.run(
                    'INSERT OR IGNORE INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)',
                    [dmId, uid]
                );
            }

            const dmChannel = await db.get('SELECT * FROM dm_channels WHERE id = ?', [dmId]);
            res.status(201).json(dmChannel);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create group DM' });
        }
    });

    // GET /dm — List all DM channels for the current user
    router.get('/dm', authenticateToken, async (req, res) => {
        try {
            const dms = await db.all(
                `SELECT dc.*, GROUP_CONCAT(dm.user_id) as member_ids
                 FROM dm_channels dc
                 JOIN dm_members dm ON dm.dm_channel_id = dc.id
                 WHERE dc.id IN (
                     SELECT dm_channel_id FROM dm_members WHERE user_id = ?
                 )
                 GROUP BY dc.id
                 ORDER BY COALESCE(dc.last_message_at, dc.created_at) DESC`,
                [req.user.id]
            );

            const formatted = dms.map(dm => ({
                ...dm,
                member_ids: dm.member_ids ? dm.member_ids.split(',') : []
            }));

            res.json(formatted);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch DM channels' });
        }
    });

    // GET /dm/:channelId/messages — Get DM message history
    router.get('/dm/:channelId/messages', authenticateToken, async (req, res) => {
        try {
            // Verify membership
            const member = await db.get(
                'SELECT 1 FROM dm_members WHERE dm_channel_id = ? AND user_id = ?',
                [req.params.channelId, req.user.id]
            );
            if (!member) return res.status(403).json({ error: 'Not a member of this DM' });

            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const before = req.query.before;

            let query = `SELECT * FROM dm_messages WHERE dm_channel_id = ? AND deleted = 0`;
            const params = [req.params.channelId];

            if (before) {
                query += ` AND created_at < (SELECT created_at FROM dm_messages WHERE id = ?)`;
                params.push(before);
            }

            query += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);

            const messages = await db.all(query, params);
            res.json(messages.reverse());
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch DM messages' });
        }
    });

    // POST /dm/:channelId/messages — Send DM message (REST fallback)
    router.post('/dm/:channelId/messages', authenticateToken, async (req, res) => {
        try {
            const member = await db.get(
                'SELECT 1 FROM dm_members WHERE dm_channel_id = ? AND user_id = ?',
                [req.params.channelId, req.user.id]
            );
            if (!member) return res.status(403).json({ error: 'Not a member of this DM' });

            const { content, reply_to_id } = req.body;
            if (!content) return res.status(400).json({ error: 'Content required' });

            const msgId = uuidv4();
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO dm_messages (id, dm_channel_id, author_id, content, reply_to_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [msgId, req.params.channelId, req.user.id, content, reply_to_id || null, now]
            );

            await db.run(
                'UPDATE dm_channels SET last_message_at = ? WHERE id = ?',
                [now, req.params.channelId]
            );

            const message = await db.get('SELECT * FROM dm_messages WHERE id = ?', [msgId]);

            if (ns) {
                // Emit to all DM members
                const members = await db.all(
                    'SELECT user_id FROM dm_members WHERE dm_channel_id = ?',
                    [req.params.channelId]
                );
                members.forEach(m => {
                    ns.to(`user:${m.user_id}`).emit('dm:message', message);
                });
            }

            res.status(201).json(message);
        } catch (err) {
            res.status(500).json({ error: 'Failed to send DM' });
        }
    });

    return router;
};
