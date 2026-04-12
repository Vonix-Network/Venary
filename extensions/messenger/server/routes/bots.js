/* =======================================
   Messenger — Bots Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../permissions');

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /bots — Create bot application
    router.post('/bots', authenticateToken, async (req, res) => {
        try {
            const { name, description, avatar, is_public } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });

            const botId = uuidv4();
            const token = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO bots (id, name, description, avatar, owner_id, token, is_public, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [botId, name, description || null, avatar || null,
                 req.user.id, token, is_public ? 1 : 0, now]
            );

            const bot = await db.get('SELECT * FROM bots WHERE id = ?', [botId]);
            res.status(201).json(bot);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create bot' });
        }
    });

    // GET /bots — List user's bots
    router.get('/bots', authenticateToken, async (req, res) => {
        try {
            const bots = await db.all(
                'SELECT * FROM bots WHERE owner_id = ? ORDER BY created_at DESC',
                [req.user.id]
            );
            res.json(bots);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch bots' });
        }
    });

    // PUT /bots/:id — Update bot
    router.put('/bots/:id', authenticateToken, async (req, res) => {
        try {
            const bot = await db.get('SELECT * FROM bots WHERE id = ?', [req.params.id]);
            if (!bot) return res.status(404).json({ error: 'Bot not found' });
            if (bot.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your bot' });

            const { name, description, avatar, is_public } = req.body;
            await db.run(
                `UPDATE bots SET
                 name = COALESCE(?, name), description = COALESCE(?, description),
                 avatar = COALESCE(?, avatar), is_public = COALESCE(?, is_public)
                 WHERE id = ?`,
                [name || null, description || null, avatar || null,
                 is_public !== undefined ? (is_public ? 1 : 0) : null, req.params.id]
            );

            const updated = await db.get('SELECT * FROM bots WHERE id = ?', [req.params.id]);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to update bot' });
        }
    });

    // DELETE /bots/:id — Delete bot
    router.delete('/bots/:id', authenticateToken, async (req, res) => {
        try {
            const bot = await db.get('SELECT * FROM bots WHERE id = ?', [req.params.id]);
            if (!bot) return res.status(404).json({ error: 'Bot not found' });
            if (bot.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your bot' });

            await db.run('DELETE FROM bots WHERE id = ?', [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete bot' });
        }
    });

    // POST /bots/:id/token/reset — Regenerate bot token
    router.post('/bots/:id/token/reset', authenticateToken, async (req, res) => {
        try {
            const bot = await db.get('SELECT * FROM bots WHERE id = ?', [req.params.id]);
            if (!bot) return res.status(404).json({ error: 'Bot not found' });
            if (bot.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your bot' });

            const newToken = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
            await db.run('UPDATE bots SET token = ? WHERE id = ?', [newToken, req.params.id]);

            res.json({ token: newToken });
        } catch (err) {
            res.status(500).json({ error: 'Failed to reset token' });
        }
    });

    // POST /spaces/:spaceId/bots/:botId — Install bot to space
    router.post('/spaces/:spaceId/bots/:botId', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_SPACE)) {
                return res.status(403).json({ error: 'Missing MANAGE_SPACE permission' });
            }

            const bot = await db.get('SELECT * FROM bots WHERE id = ? AND (owner_id = ? OR is_public = 1)',
                [req.params.botId, req.user.id]);
            if (!bot) return res.status(404).json({ error: 'Bot not found or not accessible' });

            const now = new Date().toISOString();
            await db.run(
                `INSERT INTO bot_installations (bot_id, space_id, installed_by, installed_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(bot_id, space_id) DO UPDATE SET installed_by = EXCLUDED.installed_by, installed_at = EXCLUDED.installed_at`,
                [req.params.botId, req.params.spaceId, req.user.id, now]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to install bot' });
        }
    });

    // DELETE /spaces/:spaceId/bots/:botId — Remove bot from space
    router.delete('/spaces/:spaceId/bots/:botId', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_SPACE)) {
                return res.status(403).json({ error: 'Missing MANAGE_SPACE permission' });
            }

            await db.run(
                'DELETE FROM bot_installations WHERE bot_id = ? AND space_id = ?',
                [req.params.botId, req.params.spaceId]
            );

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to remove bot' });
        }
    });

    return router;
};
