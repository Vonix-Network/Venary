/* =======================================
   Messenger — Invites Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const { Permissions, computePermissions, hasPermission } = require('../permissions');

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /spaces/:spaceId/invites — Create invite
    router.post('/spaces/:spaceId/invites', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.CREATE_INVITES)) {
                return res.status(403).json({ error: 'Missing CREATE_INVITES permission' });
            }

            const { channel_id, max_uses, max_age } = req.body;
            const code = uuidv4().slice(0, 8).toUpperCase();
            const now = new Date().toISOString();
            let expiresAt = null;

            if (max_age && max_age > 0) {
                expiresAt = new Date(Date.now() + max_age * 1000).toISOString();
            }

            await db.run(
                `INSERT INTO invites (id, code, space_id, channel_id, inviter_id, max_uses, max_age, expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [uuidv4(), code, req.params.spaceId, channel_id || null,
                 req.user.id, max_uses || 0, max_age || 0, expiresAt, now]
            );

            const invite = await db.get('SELECT * FROM invites WHERE code = ?', [code]);
            res.status(201).json(invite);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create invite' });
        }
    });

    // GET /spaces/:spaceId/invites — List active invites
    router.get('/spaces/:spaceId/invites', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_SPACE)) {
                return res.status(403).json({ error: 'Missing MANAGE_SPACE permission' });
            }

            const invites = await db.all(
                `SELECT * FROM invites WHERE space_id = ?
                 AND (expires_at IS NULL OR expires_at > ?)
                 AND (max_uses = 0 OR uses < max_uses)
                 ORDER BY created_at DESC`,
                [req.params.spaceId, new Date().toISOString()]
            );

            res.json(invites);
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch invites' });
        }
    });

    // GET /invites/:code — Get invite info (public)
    router.get('/invites/:code', async (req, res) => {
        try {
            const invite = await db.get('SELECT * FROM invites WHERE code = ?', [req.params.code]);
            if (!invite) return res.status(404).json({ error: 'Invite not found' });

            if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                return res.status(410).json({ error: 'Invite has expired' });
            }
            if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
                return res.status(410).json({ error: 'Invite has reached its max uses' });
            }

            const space = await db.get(
                'SELECT id, name, description, icon, member_count FROM spaces WHERE id = ?',
                [invite.space_id]
            );

            res.json({ invite, space });
        } catch (err) {
            res.status(500).json({ error: 'Failed to fetch invite' });
        }
    });

    // POST /invites/:code/use — Use invite to join
    router.post('/invites/:code/use', authenticateToken, async (req, res) => {
        try {
            const invite = await db.get('SELECT * FROM invites WHERE code = ?', [req.params.code]);
            if (!invite) return res.status(404).json({ error: 'Invite not found' });

            if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
                return res.status(410).json({ error: 'Invite has expired' });
            }
            if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
                return res.status(410).json({ error: 'Invite has reached its max uses' });
            }

            // Check ban
            const ban = await db.get(
                'SELECT 1 FROM space_bans WHERE space_id = ? AND user_id = ?',
                [invite.space_id, req.user.id]
            );
            if (ban) return res.status(403).json({ error: 'You are banned from this space' });

            const existing = await db.get(
                'SELECT 1 FROM members WHERE space_id = ? AND user_id = ?',
                [invite.space_id, req.user.id]
            );

            if (!existing) {
                const memberId = uuidv4();
                const now = new Date().toISOString();
                await db.run(
                    'INSERT INTO members (id, space_id, user_id, joined_at) VALUES (?, ?, ?, ?)',
                    [memberId, invite.space_id, req.user.id, now]
                );
                await db.run(
                    'UPDATE spaces SET member_count = member_count + 1 WHERE id = ?',
                    [invite.space_id]
                );
                await db.run('UPDATE invites SET uses = uses + 1 WHERE code = ?', [req.params.code]);

                if (ns) {
                    ns.to(`space:${invite.space_id}`).emit('member:joined', {
                        spaceId: invite.space_id, userId: req.user.id
                    });
                }
            }

            res.json({ spaceId: invite.space_id });
        } catch (err) {
            res.status(500).json({ error: 'Failed to use invite' });
        }
    });

    // DELETE /invites/:code — Revoke invite
    router.delete('/invites/:code', authenticateToken, async (req, res) => {
        try {
            const invite = await db.get('SELECT * FROM invites WHERE code = ?', [req.params.code]);
            if (!invite) return res.status(404).json({ error: 'Invite not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [invite.space_id]);
            const perms = await computePermissions(db, invite.space_id, req.user.id, space.owner_id);
            const isOwner = invite.inviter_id === req.user.id;

            if (!isOwner && !hasPermission(perms, Permissions.MANAGE_SPACE)) {
                return res.status(403).json({ error: 'Cannot revoke this invite' });
            }

            await db.run('DELETE FROM invites WHERE code = ?', [req.params.code]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to revoke invite' });
        }
    });

    return router;
};
