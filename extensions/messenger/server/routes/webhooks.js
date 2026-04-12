/* =======================================
   Messenger — Webhooks Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../permissions');

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /channels/:channelId/webhooks — Create webhook
    router.post('/channels/:channelId/webhooks', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.channelId]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_WEBHOOKS)) {
                return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
            }

            const { name, avatar } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });

            const webhookId = uuidv4();
            const token = uuidv4().replace(/-/g, '');
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO webhooks (id, space_id, channel_id, name, avatar, token, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [webhookId, channel.space_id, req.params.channelId,
                 name, avatar || null, token, req.user.id, now]
            );

            const webhook = await db.get('SELECT * FROM webhooks WHERE id = ?', [webhookId]);
            res.status(201).json(webhook);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create webhook' });
        }
    });

    // GET /channels/:channelId/webhooks — List webhooks for channel
    router.get('/channels/:channelId/webhooks', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.channelId]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_WEBHOOKS)) {
                return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
            }

            const webhooks = await db.all(
                'SELECT * FROM webhooks WHERE channel_id = ?',
                [req.params.channelId]
            );

            res.json(webhooks);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch webhooks' });
        }
    });

    // DELETE /webhooks/:id — Delete webhook
    router.delete('/webhooks/:id', authenticateToken, async (req, res) => {
        try {
            const webhook = await db.get('SELECT * FROM webhooks WHERE id = ?', [req.params.id]);
            if (!webhook) return res.status(404).json({ error: 'Webhook not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [webhook.space_id]);
            const perms = await computePermissions(db, webhook.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_WEBHOOKS)) {
                return res.status(403).json({ error: 'Missing MANAGE_WEBHOOKS permission' });
            }

            await db.run('DELETE FROM webhooks WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete webhook' });
        }
    });

    // POST /webhooks/:id/:token — Execute webhook (no auth required)
    router.post('/webhooks/:id/:token', async (req, res) => {
        try {
            const webhook = await db.get(
                'SELECT * FROM webhooks WHERE id = ? AND token = ?',
                [req.params.id, req.params.token]
            );
            if (!webhook) return res.status(404).json({ error: 'Invalid webhook' });

            const { content, username, avatar_url, embeds } = req.body;
            if (!content && (!embeds || !embeds.length)) {
                return res.status(400).json({ error: 'Content or embeds required' });
            }

            const msgId = uuidv4();
            const now = new Date().toISOString();
            const authorName = username || webhook.name;

            await db.run(
                `INSERT INTO channel_messages
                 (id, channel_id, author_id, content, type, embeds, created_at)
                 VALUES (?, ?, ?, ?, 'webhook', ?, ?)`,
                [msgId, webhook.channel_id,
                 `webhook:${webhook.id}`,
                 content || null,
                 JSON.stringify(embeds || []), now]
            );

            await db.run(
                'UPDATE channels SET last_message_at = ? WHERE id = ?',
                [now, webhook.channel_id]
            );

            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [msgId]);
            const enriched = { ...message, webhook_name: authorName, webhook_avatar: avatar_url || webhook.avatar };

            if (ns) ns.to(`channel:${webhook.channel_id}`).emit('channel:message', enriched);

            res.status(200).json({ id: msgId });
        } catch (err) {
            res.status(500).json({ error: 'Failed to execute webhook' });
        }
    });

    return router;
};
