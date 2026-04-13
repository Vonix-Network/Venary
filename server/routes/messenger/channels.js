'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../../services/messenger-permissions');

module.exports = function (getNs) {
    const router = express.Router();

    // POST /spaces/:spaceId/channels — Create channel
    router.post('/spaces/:spaceId/channels', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_CHANNELS))
                return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });

            const { name, type, category_id, topic, position } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });

            const channelId = uuidv4();
            const now = new Date().toISOString();
            await db.run(
                `INSERT INTO channels (id, space_id, category_id, name, type, topic, position, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [channelId, req.params.spaceId, category_id || null,
                 name.trim().toLowerCase().replace(/\s+/g, '-'),
                 type || 'text', topic || null, position || 0, now]
            );

            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
            const ns = getNs(); if (ns) ns.to(`space:${req.params.spaceId}`).emit('channel:created', channel);
            res.status(201).json(channel);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create channel' });
        }
    });

    // PUT /channels/:id — Update channel
    router.put('/channels/:id', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_CHANNELS))
                return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });

            const { name, topic, category_id, position, slowmode_seconds, is_nsfw } = req.body;
            await db.run(
                `UPDATE channels SET
                 name = COALESCE(?, name), topic = COALESCE(?, topic),
                 category_id = COALESCE(?, category_id), position = COALESCE(?, position),
                 slowmode_seconds = COALESCE(?, slowmode_seconds), is_nsfw = COALESCE(?, is_nsfw)
                 WHERE id = ?`,
                [name || null, topic || null, category_id || null,
                 position != null ? position : null,
                 slowmode_seconds != null ? slowmode_seconds : null,
                 is_nsfw !== undefined ? (is_nsfw ? 1 : 0) : null,
                 req.params.id]
            );

            const updated = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`space:${channel.space_id}`).emit('channel:updated', updated);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to update channel' });
        }
    });

    // DELETE /channels/:id — Delete channel
    router.delete('/channels/:id', authenticateToken, async (req, res) => {
        try {
            const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
            if (!channel) return res.status(404).json({ error: 'Channel not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
            const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_CHANNELS))
                return res.status(403).json({ error: 'Missing MANAGE_CHANNELS permission' });

            await db.run('DELETE FROM channels WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`space:${channel.space_id}`).emit('channel:deleted', {
                channelId: req.params.id, spaceId: channel.space_id,
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete channel' });
        }
    });

    return router;
};
