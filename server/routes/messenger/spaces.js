'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { Permissions, DEFAULT_PERMISSIONS, computePermissions, hasPermission, serializePerms } = require('../../services/messenger-permissions');

module.exports = function (getNs) {
    const router = express.Router();

    // POST / — Create Space
    router.post('/', authenticateToken, async (req, res) => {
        try {
            const { name, description, is_public } = req.body;
            if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

            const spaceId    = uuidv4();
            const ownerId    = req.user.id;
            const inviteCode = uuidv4().slice(0, 8);
            const now        = new Date().toISOString();

            await db.run(
                `INSERT INTO spaces (id, name, description, owner_id, invite_code, is_public, member_count, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
                [spaceId, name.trim(), description || null, ownerId, inviteCode, is_public ? 1 : 0, now]
            );

            // Create default @everyone role
            const everyoneId = uuidv4();
            await db.run(
                `INSERT INTO roles (id, space_id, name, color, permissions, position, is_default, created_at)
                 VALUES (?, ?, '@everyone', '#99aab5', ?, 0, 1, ?)`,
                [everyoneId, spaceId, serializePerms(DEFAULT_PERMISSIONS), now]
            );

            // Default Text Channels category + #general channel
            const categoryId = uuidv4();
            await db.run(
                `INSERT INTO categories (id, space_id, name, position, created_at) VALUES (?, ?, 'Text Channels', 0, ?)`,
                [categoryId, spaceId, now]
            );
            const generalId = uuidv4();
            await db.run(
                `INSERT INTO channels (id, space_id, category_id, name, type, position, created_at)
                 VALUES (?, ?, ?, 'general', 'text', 0, ?)`,
                [generalId, spaceId, categoryId, now]
            );

            // Add owner as member
            await db.run(
                `INSERT INTO members (id, space_id, user_id, joined_at) VALUES (?, ?, ?, ?)`,
                [uuidv4(), spaceId, ownerId, now]
            );

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [spaceId]);
            const ns = getNs(); if (ns) ns.to(`user:${ownerId}`).emit('space:created', space);
            res.status(201).json(space);
        } catch (err) {
            console.error('[Messenger] Create space error:', err);
            res.status(500).json({ error: 'Failed to create space' });
        }
    });

    // GET / — List spaces the user is a member of
    router.get('/', authenticateToken, async (req, res) => {
        try {
            const spaces = await db.all(
                `SELECT s.* FROM spaces s
                 JOIN members m ON m.space_id = s.id
                 WHERE m.user_id = ?
                 ORDER BY s.created_at ASC`,
                [req.user.id]
            );
            res.json(spaces);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch spaces' });
        }
    });

    // GET /:id — Space details (channels, roles, members)
    router.get('/:id', authenticateToken, async (req, res) => {
        try {
            const space  = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const member = await db.get(
                'SELECT * FROM members WHERE space_id = ? AND user_id = ?',
                [req.params.id, req.user.id]
            );
            if (!member) return res.status(403).json({ error: 'Not a member of this space' });

            const [categories, channels, roles, members] = await Promise.all([
                db.all('SELECT * FROM categories WHERE space_id = ? ORDER BY position', [req.params.id]),
                db.all('SELECT * FROM channels WHERE space_id = ? ORDER BY position',   [req.params.id]),
                db.all('SELECT * FROM roles WHERE space_id = ? ORDER BY position DESC', [req.params.id]),
                db.all('SELECT * FROM members WHERE space_id = ?',                      [req.params.id]),
            ]);

            res.json({ ...space, categories, channels, roles, members });
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch space' });
        }
    });

    // PUT /:id — Update space settings
    router.put('/:id', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_SPACE))
                return res.status(403).json({ error: 'Missing MANAGE_SPACE permission' });

            const { name, description, icon, banner, is_public } = req.body;
            await db.run(
                `UPDATE spaces SET name = COALESCE(?, name), description = COALESCE(?, description),
                 icon = COALESCE(?, icon), banner = COALESCE(?, banner),
                 is_public = COALESCE(?, is_public) WHERE id = ?`,
                [name || null, description || null, icon || null, banner || null,
                 is_public !== undefined ? (is_public ? 1 : 0) : null, req.params.id]
            );

            const updated = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`space:${req.params.id}`).emit('space:updated', updated);
            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to update space' });
        }
    });

    // DELETE /:id — Delete space (owner only)
    router.delete('/:id', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
            if (!space) return res.status(404).json({ error: 'Space not found' });
            if (space.owner_id !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this space' });

            await db.run('DELETE FROM spaces WHERE id = ?', [req.params.id]);
            const ns = getNs(); if (ns) ns.to(`space:${req.params.id}`).emit('space:deleted', { spaceId: req.params.id });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete space' });
        }
    });

    // POST /:id/join — Join via invite code
    router.post('/:id/join', authenticateToken, async (req, res) => {
        try {
            const { invite_code } = req.body;
            const space = await db.get(
                'SELECT * FROM spaces WHERE id = ? AND (is_public = 1 OR invite_code = ?)',
                [req.params.id, invite_code || '']
            );
            if (!space) return res.status(404).json({ error: 'Space not found or invalid invite' });

            const ban = await db.get('SELECT 1 FROM space_bans WHERE space_id = ? AND user_id = ?', [req.params.id, req.user.id]);
            if (ban) return res.status(403).json({ error: 'You are banned from this space' });

            const existing = await db.get('SELECT 1 FROM members WHERE space_id = ? AND user_id = ?', [req.params.id, req.user.id]);
            if (existing) return res.json({ message: 'Already a member' });

            const now = new Date().toISOString();
            await db.run('INSERT INTO members (id, space_id, user_id, joined_at) VALUES (?, ?, ?, ?)', [uuidv4(), req.params.id, req.user.id, now]);
            await db.run('UPDATE spaces SET member_count = member_count + 1 WHERE id = ?', [req.params.id]);

            const ns = getNs();
            if (ns) ns.to(`space:${req.params.id}`).emit('member:joined', { spaceId: req.params.id, userId: req.user.id });
            res.json({ message: 'Joined space', spaceId: req.params.id });
        } catch (err) {
            res.status(500).json({ error: 'Failed to join space' });
        }
    });

    // POST /:id/leave — Leave space
    router.post('/:id/leave', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.id]);
            if (!space) return res.status(404).json({ error: 'Space not found' });
            if (space.owner_id === req.user.id) return res.status(400).json({ error: 'Owner cannot leave; transfer or delete the space' });

            await db.run('DELETE FROM members WHERE space_id = ? AND user_id = ?', [req.params.id, req.user.id]);
            await db.run('UPDATE spaces SET member_count = MAX(0, member_count - 1) WHERE id = ?', [req.params.id]);

            const ns = getNs();
            if (ns) ns.to(`space:${req.params.id}`).emit('member:left', { spaceId: req.params.id, userId: req.user.id });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to leave space' });
        }
    });

    // GET /public/browse — Browse public spaces
    router.get('/public/browse', async (req, res) => {
        try {
            const spaces = await db.all(
                'SELECT id, name, description, icon, member_count, created_at FROM spaces WHERE is_public = 1 ORDER BY member_count DESC LIMIT 50'
            );
            res.json(spaces);
        } catch (err) {
            res.status(500).json({ error: 'Failed to browse spaces' });
        }
    });

    return router;
};
