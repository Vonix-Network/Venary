'use strict';
const express = require('express');
const db = require('../../db');
const { authenticateToken } = require('../../middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../../services/messenger-permissions');

module.exports = function (getNs) {
    const router = express.Router();

    // GET /spaces/:spaceId/members
    router.get('/spaces/:spaceId/members', authenticateToken, async (req, res) => {
        try {
            const members = await db.all('SELECT m.* FROM members m WHERE m.space_id = ?', [req.params.spaceId]);

            const formatted = await Promise.all(members.map(async m => {
                const roleRows = await db.all(
                    `SELECT r.id, r.name, r.color FROM roles r JOIN member_roles mr ON mr.role_id = r.id WHERE mr.member_id = ?`,
                    [m.id]
                );
                return { ...m, roles: roleRows };
            }));

            res.json(formatted);
        } catch (err) {
            console.error('[Messenger] fetch members error:', err);
            res.status(500).json({ error: 'Failed to fetch members' });
        }
    });

    // PUT /members/:id — Update nickname
    router.put('/members/:id', authenticateToken, async (req, res) => {
        try {
            const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.id]);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const space  = await db.get('SELECT * FROM spaces WHERE id = ?', [member.space_id]);
            const perms  = await computePermissions(db, member.space_id, req.user.id, space.owner_id);
            const isSelf = member.user_id === req.user.id;

            if (!isSelf && !hasPermission(perms, Permissions.MANAGE_SPACE))
                return res.status(403).json({ error: 'Cannot modify another member\'s nickname' });

            const { nickname } = req.body;
            await db.run('UPDATE members SET nickname = ? WHERE id = ?', [nickname || null, req.params.id]);

            const ns = getNs(); if (ns) ns.to(`space:${member.space_id}`).emit('member:updated', {
                memberId: req.params.id, userId: member.user_id, nickname: nickname || null,
            });
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to update member' });
        }
    });

    // POST /spaces/:spaceId/kick/:userId
    router.post('/spaces/:spaceId/kick/:userId', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.KICK_MEMBERS))
                return res.status(403).json({ error: 'Missing KICK_MEMBERS permission' });
            if (req.params.userId === space.owner_id)
                return res.status(400).json({ error: 'Cannot kick the space owner' });

            await db.run('DELETE FROM members WHERE space_id = ? AND user_id = ?', [req.params.spaceId, req.params.userId]);
            await db.run('UPDATE spaces SET member_count = MAX(0, member_count - 1) WHERE id = ?', [req.params.spaceId]);

            const ns = getNs();
            if (ns) {
                ns.to(`user:${req.params.userId}`).emit('member:kicked', { spaceId: req.params.spaceId });
                ns.to(`space:${req.params.spaceId}`).emit('member:left', { spaceId: req.params.spaceId, userId: req.params.userId });
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to kick member' });
        }
    });

    // POST /spaces/:spaceId/ban/:userId
    router.post('/spaces/:spaceId/ban/:userId', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.BAN_MEMBERS))
                return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });
            if (req.params.userId === space.owner_id)
                return res.status(400).json({ error: 'Cannot ban the space owner' });

            const { reason } = req.body;
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO space_bans (space_id, user_id, reason, banned_by, banned_at) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(space_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by, banned_at = EXCLUDED.banned_at`,
                [req.params.spaceId, req.params.userId, reason || null, req.user.id, now]
            );
            await db.run('DELETE FROM members WHERE space_id = ? AND user_id = ?', [req.params.spaceId, req.params.userId]);
            await db.run('UPDATE spaces SET member_count = MAX(0, member_count - 1) WHERE id = ?', [req.params.spaceId]);

            const ns = getNs();
            if (ns) {
                ns.to(`user:${req.params.userId}`).emit('member:banned', { spaceId: req.params.spaceId, reason: reason || null });
                ns.to(`space:${req.params.spaceId}`).emit('member:left', { spaceId: req.params.spaceId, userId: req.params.userId });
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to ban member' });
        }
    });

    // DELETE /spaces/:spaceId/ban/:userId
    router.delete('/spaces/:spaceId/ban/:userId', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.BAN_MEMBERS))
                return res.status(403).json({ error: 'Missing BAN_MEMBERS permission' });

            await db.run('DELETE FROM space_bans WHERE space_id = ? AND user_id = ?', [req.params.spaceId, req.params.userId]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to unban member' });
        }
    });

    return router;
};
