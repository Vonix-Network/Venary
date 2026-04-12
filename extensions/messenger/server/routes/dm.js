/* =======================================
   Messenger — DM Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const mainDb = require('../../../../server/db');

const SETTING_DEFAULTS = {
    allow_dms: 'everyone',
    message_requests: 1,
    auto_accept_requests: 0
};

async function getTargetSettings(db, userId) {
    const s = await db.get('SELECT allow_dms, message_requests, auto_accept_requests FROM messenger_settings WHERE user_id = ?', [userId]);
    return Object.assign({}, SETTING_DEFAULTS, s || {});
}

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /dm — Open or get a 1:1 DM channel with a user
    router.post('/dm', authenticateToken, async (req, res) => {
        try {
            const { target_user_id } = req.body;
            if (!target_user_id) return res.status(400).json({ error: 'target_user_id required' });
            if (target_user_id === req.user.id) return res.status(400).json({ error: 'Cannot DM yourself' });

            // Verify target user exists
            const targetUser = await mainDb.get('SELECT id FROM users WHERE id = ?', [target_user_id]);
            if (!targetUser) return res.status(404).json({ error: 'User not found' });

            // Check if DM already exists between these two users
            const existing = await db.get(
                `SELECT dc.* FROM dm_channels dc
                 JOIN dm_members dm1 ON dm1.dm_channel_id = dc.id AND dm1.user_id = ?
                 JOIN dm_members dm2 ON dm2.dm_channel_id = dc.id AND dm2.user_id = ?
                 WHERE dc.type = 'dm'`,
                [req.user.id, target_user_id]
            );

            if (existing) return res.json(existing);

            // Load target user's messenger settings
            const settings = await getTargetSettings(db, target_user_id);

            // Check allow_dms policy
            if (settings.allow_dms === 'nobody') {
                return res.status(403).json({ error: 'This user is not accepting direct messages.' });
            }

            // Check friendship status
            const friendship = await mainDb.get(
                `SELECT status FROM friendships
                 WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
                 AND status = 'accepted'`,
                [req.user.id, target_user_id, target_user_id, req.user.id]
            );
            const areFriends = !!friendship;

            if (settings.allow_dms === 'friends' && !areFriends) {
                return res.status(403).json({ error: 'This user only accepts messages from friends.' });
            }

            // If message requests are enabled and they're not friends, create a request instead
            if (settings.message_requests && !areFriends && !settings.auto_accept_requests) {
                // Check for an existing pending request
                const existingReq = await db.get(
                    `SELECT * FROM message_requests WHERE from_user_id = ? AND to_user_id = ?`,
                    [req.user.id, target_user_id]
                );

                if (existingReq) {
                    if (existingReq.status === 'accepted') {
                        // Request was accepted — DM channel should exist
                        if (existingReq.dm_channel_id) {
                            const dmChannel = await db.get('SELECT * FROM dm_channels WHERE id = ?', [existingReq.dm_channel_id]);
                            if (dmChannel) return res.json(dmChannel);
                        }
                    } else if (existingReq.status === 'declined') {
                        return res.status(403).json({ error: 'Your message request was declined.' });
                    } else {
                        return res.status(202).json({ message_request: true, request_id: existingReq.id });
                    }
                }

                // Create a new message request
                const reqId = uuidv4();
                await db.run(
                    `INSERT INTO message_requests (id, from_user_id, to_user_id, status, created_at, updated_at)
                     VALUES (?, ?, ?, 'pending', ?, ?)`,
                    [reqId, req.user.id, target_user_id, new Date().toISOString(), new Date().toISOString()]
                );

                // Notify target via socket
                if (ns) {
                    ns.to(`user:${target_user_id}`).emit('dm:message_request', { request_id: reqId, from_user_id: req.user.id });
                }

                return res.status(202).json({ message_request: true, request_id: reqId });
            }

            // Create DM directly
            const dmId = uuidv4();
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO dm_channels (id, type, created_at) VALUES (?, 'dm', ?)`,
                [dmId, now]
            );
            await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, req.user.id]);
            await db.run('INSERT INTO dm_members (dm_channel_id, user_id) VALUES (?, ?)', [dmId, target_user_id]);

            const dmChannel = await db.get('SELECT * FROM dm_channels WHERE id = ?', [dmId]);
            res.status(201).json(dmChannel);
        } catch (err) {
            console.error('Open DM error:', err);
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

    // GET /dm — List all DM channels for the current user, enriched with partner info
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

            const enriched = await Promise.all(dms.map(async dm => {
                const memberIds = dm.member_ids ? dm.member_ids.split(',') : [];
                const result = { ...dm, member_ids: memberIds };

                if (dm.type === 'dm') {
                    // Find the partner (the other user)
                    const partnerId = memberIds.find(id => id !== req.user.id);
                    if (partnerId) {
                        const partner = await mainDb.get(
                            'SELECT id, username, display_name, avatar, status FROM users WHERE id = ?',
                            [partnerId]
                        );
                        if (partner) {
                            result.partner_id           = partner.id;
                            result.partner_username     = partner.username;
                            result.partner_display_name = partner.display_name;
                            result.partner_avatar       = partner.avatar;
                            result.partner_status       = partner.status || 'offline';
                        }
                    }
                }

                return result;
            }));

            res.json(enriched);
        } catch (err) {
            console.error('Fetch DMs error:', err);
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
            const search = req.query.search ? req.query.search.trim() : null;

            let query = `SELECT * FROM dm_messages WHERE dm_channel_id = ? AND deleted = 0`;
            const params = [req.params.channelId];

            if (search) {
                query += ` AND content LIKE ?`;
                params.push(`%${search}%`);
            }

            if (before) {
                query += ` AND created_at < (SELECT created_at FROM dm_messages WHERE id = ?)`;
                params.push(before);
            }

            query += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);

            const messages = await db.all(query, params);
            const reversed = messages.reverse();

            // Enrich with sender info from main DB (deduplicated lookups)
            const userCache = {};
            const enriched = await Promise.all(reversed.map(async msg => {
                if (!userCache[msg.author_id]) {
                    userCache[msg.author_id] = await mainDb.get(
                        'SELECT username, display_name, avatar FROM users WHERE id = ?',
                        [msg.author_id]
                    ) || {};
                }
                const u = userCache[msg.author_id];
                return {
                    ...msg,
                    sender_username:     u.username     || null,
                    sender_display_name: u.display_name || null,
                    sender_avatar:       u.avatar       || null
                };
            }));

            res.json(enriched);
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

            // Attach sender info so clients can render immediately without a lookup
            const sender = await mainDb.get(
                'SELECT username, display_name, avatar FROM users WHERE id = ?',
                [req.user.id]
            ) || {};
            const enrichedMsg = {
                ...message,
                sender_username:     sender.username     || null,
                sender_display_name: sender.display_name || null,
                sender_avatar:       sender.avatar       || null
            };

            if (ns) {
                // Emit to all DM members
                const members = await db.all(
                    'SELECT user_id FROM dm_members WHERE dm_channel_id = ?',
                    [req.params.channelId]
                );
                members.forEach(m => {
                    ns.to(`user:${m.user_id}`).emit('dm:message', enrichedMsg);
                });
            }

            res.status(201).json(enrichedMsg);
        } catch (err) {
            res.status(500).json({ error: 'Failed to send DM' });
        }
    });

    return router;
};
