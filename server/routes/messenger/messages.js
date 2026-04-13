'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../../services/messenger-permissions');

module.exports = function (getNs) {
    const router = express.Router();

    // GET /channels/:id/messages
    router.get('/channels/:id/messages', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.VIEW_CHANNEL))
                return res.status(403).json({ error: 'Missing VIEW_CHANNEL permission' });

            const limit  = Math.min(parseInt(req.query.limit) || 50, 100);
            const before = req.query.before;
            const search = req.query.search?.trim() || null;

            let query = `SELECT * FROM channel_messages WHERE channel_id = ? AND deleted = 0`;
            const params = [req.params.id];

            if (search) { query += ` AND content LIKE ?`; params.push(`%${search}%`); }
            if (before) {
                query += ` AND created_at < (SELECT created_at FROM channel_messages WHERE id = ?)`;
                params.push(before);
            }
            query += ` ORDER BY created_at DESC LIMIT ?`;
            params.push(limit);

            const messages = await db.all(query, params);
            res.json(messages.reverse());
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    });

    // POST /channels/:id/messages — REST send
    router.post('/channels/:id/messages', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.SEND_MESSAGES))
                return res.status(403).json({ error: 'Missing SEND_MESSAGES permission' });

            const { content, reply_to_id, attachments } = req.body;
            if (!content && (!attachments || !attachments.length))
                return res.status(400).json({ error: 'Message content or attachments required' });

            const msgId = uuidv4();
            const now   = new Date().toISOString();
            await db.run(
                `INSERT INTO channel_messages
                 (id, channel_id, author_id, content, reply_to_id, attachments, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [msgId, req.params.id, req.user.id, content || null,
                 reply_to_id || null, JSON.stringify(attachments || []), now]
            );
            await db.run('UPDATE channels SET last_message_at = ? WHERE id = ?', [now, req.params.id]);

            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [msgId]);
            const ns = getNs(); if (ns) ns.to(`channel:${req.params.id}`).emit('channel:message', message);
            res.status(201).json(message);
        } catch (err) {
            res.status(500).json({ error: 'Failed to send message' });
        }
    });

    // PUT /messages/:id — Edit message
    router.put('/messages/:id', authenticateToken, async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.id]);
            if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' });
            if (message.author_id !== req.user.id) return res.status(403).json({ error: 'Cannot edit another user\'s message' });

            const { content } = req.body;
            if (!content) return res.status(400).json({ error: 'Content required' });

            const now = new Date().toISOString();
            await db.run('UPDATE channel_messages SET content = ?, edited_at = ? WHERE id = ?', [content, now, req.params.id]);

            const updated = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`channel:${message.channel_id}`).emit('channel:message_edited', updated);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to edit message' });
        }
    });

    // DELETE /messages/:id
    router.delete('/messages/:id', authenticateToken, async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.id]);
            if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' });

            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [message.channel_id]);
            const space   = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms   = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);

            const isAuthor  = message.author_id === req.user.id;
            const canManage = hasPermission(perms, Permissions.MANAGE_MESSAGES);
            if (!isAuthor && !canManage) return res.status(403).json({ error: 'Cannot delete this message' });

            await db.run('UPDATE channel_messages SET deleted = 1 WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`channel:${message.channel_id}`).emit('channel:message_deleted', {
                messageId: req.params.id, channelId: message.channel_id,
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete message' });
        }
    });

    // POST /messages/:id/pin
    router.post('/messages/:id/pin', authenticateToken, async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.id]);
            if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' });

            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [message.channel_id]);
            const space   = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms   = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_MESSAGES))
                return res.status(403).json({ error: 'Missing MANAGE_MESSAGES permission' });

            const newPinned = message.pinned ? 0 : 1;
            await db.run('UPDATE channel_messages SET pinned = ? WHERE id = ?', [newPinned, req.params.id]);

            const event = newPinned ? 'channel:message_pinned' : 'channel:message_unpinned';
            const ns = getNs(); if (ns) ns.to(`channel:${message.channel_id}`).emit(event, { messageId: req.params.id });
            res.json({ pinned: !!newPinned });
        } catch (err) {
            res.status(500).json({ error: 'Failed to pin/unpin message' });
        }
    });

    // POST /channels/:id/messages/:msgId/reactions/:emoji
    router.post('/channels/:id/messages/:msgId/reactions/:emoji', authenticateToken, async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.msgId]);
            if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' });

            const emoji     = decodeURIComponent(req.params.emoji);
            const reactions = JSON.parse(message.reactions || '{}');
            if (!reactions[emoji]) reactions[emoji] = [];
            if (!reactions[emoji].includes(req.user.id)) reactions[emoji].push(req.user.id);

            await db.run('UPDATE channel_messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), req.params.msgId]);
            const ns = getNs(); if (ns) ns.to(`channel:${req.params.id}`).emit('channel:reaction_update', { messageId: req.params.msgId, reactions });
            res.json({ reactions });
        } catch (err) {
            res.status(500).json({ error: 'Failed to add reaction' });
        }
    });

    // DELETE /channels/:id/messages/:msgId/reactions/:emoji
    router.delete('/channels/:id/messages/:msgId/reactions/:emoji', authenticateToken, async (req, res) => {
        try {
            const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [req.params.msgId]);
            if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' });

            const emoji     = decodeURIComponent(req.params.emoji);
            const reactions = JSON.parse(message.reactions || '{}');
            if (reactions[emoji]) {
                reactions[emoji] = reactions[emoji].filter(id => id !== req.user.id);
                if (!reactions[emoji].length) delete reactions[emoji];
            }

            await db.run('UPDATE channel_messages SET reactions = ? WHERE id = ?', [JSON.stringify(reactions), req.params.msgId]);
            const ns = getNs(); if (ns) ns.to(`channel:${req.params.id}`).emit('channel:reaction_update', { messageId: req.params.msgId, reactions });
            res.json({ reactions });
        } catch (err) {
            res.status(500).json({ error: 'Failed to remove reaction' });
        }
    });

    // GET /channels/:id/pins
    router.get('/channels/:id/pins', authenticateToken, async (req, res) => {
        try {
            const messages = await db.all(
                'SELECT * FROM channel_messages WHERE channel_id = ? AND pinned = 1 AND deleted = 0 ORDER BY created_at DESC',
                [req.params.id]
            );
            res.json(messages);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch pinned messages' });
        }
    });

    return router;
};
