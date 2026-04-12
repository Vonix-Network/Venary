/* =======================================
   Messenger — Roles Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../../server/middleware/auth');
const { Permissions, computePermissions, hasPermission, serializePerms, deserializePerms } = require('../permissions');

module.exports = function (db, ns) {
    const router = express.Router();

    // POST /spaces/:spaceId/roles — Create role
    router.post('/spaces/:spaceId/roles', authenticateToken, async (req, res) => {
        try {
            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [req.params.spaceId]);
            if (!space) return res.status(404).json({ error: 'Space not found' });

            const perms = await computePermissions(db, req.params.spaceId, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_ROLES)) {
                return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
            }

            const { name, color, permissions, position, mentionable } = req.body;
            if (!name) return res.status(400).json({ error: 'Name is required' });

            const roleId = uuidv4();
            const now = new Date().toISOString();
            const rolePerms = permissions !== undefined ? String(BigInt(permissions)) : '0';

            await db.run(
                `INSERT INTO roles (id, space_id, name, color, permissions, position, mentionable, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [roleId, req.params.spaceId, name, color || '#99aab5',
                 rolePerms, position || 1, mentionable !== false ? 1 : 0, now]
            );

            const role = await db.get('SELECT * FROM roles WHERE id = ?', [roleId]);
            if (ns) ns.to(`space:${req.params.spaceId}`).emit('role:created', role);

            res.status(201).json(role);
        } catch (err) {
            res.status(500).json({ error: 'Failed to create role' });
        }
    });

    // PUT /roles/:id — Update role
    router.put('/roles/:id', authenticateToken, async (req, res) => {
        try {
            const role = await db.get('SELECT * FROM roles WHERE id = ?', [req.params.id]);
            if (!role) return res.status(404).json({ error: 'Role not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [role.space_id]);
            const perms = await computePermissions(db, role.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_ROLES)) {
                return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
            }

            const { name, color, permissions, position, mentionable } = req.body;
            const rolePerms = permissions !== undefined ? String(BigInt(permissions)) : null;

            await db.run(
                `UPDATE roles SET
                 name = COALESCE(?, name), color = COALESCE(?, color),
                 permissions = COALESCE(?, permissions), position = COALESCE(?, position),
                 mentionable = COALESCE(?, mentionable)
                 WHERE id = ?`,
                [name || null, color || null, rolePerms,
                 position != null ? position : null,
                 mentionable !== undefined ? (mentionable ? 1 : 0) : null,
                 req.params.id]
            );

            const updated = await db.get('SELECT * FROM roles WHERE id = ?', [req.params.id]);
            if (ns) ns.to(`space:${role.space_id}`).emit('role:updated', updated);

            res.json(updated);
        } catch (err) {
            res.status(500).json({ error: 'Failed to update role' });
        }
    });

    // DELETE /roles/:id — Delete role
    router.delete('/roles/:id', authenticateToken, async (req, res) => {
        try {
            const role = await db.get('SELECT * FROM roles WHERE id = ?', [req.params.id]);
            if (!role) return res.status(404).json({ error: 'Role not found' });
            if (role.is_default) return res.status(400).json({ error: 'Cannot delete the @everyone role' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [role.space_id]);
            const perms = await computePermissions(db, role.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_ROLES)) {
                return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
            }

            await db.run('DELETE FROM roles WHERE id = ?', [req.params.id]);
            if (ns) ns.to(`space:${role.space_id}`).emit('role:deleted', {
                roleId: req.params.id, spaceId: role.space_id
            });

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to delete role' });
        }
    });

    // POST /members/:memberId/roles/:roleId — Assign role
    router.post('/members/:memberId/roles/:roleId', authenticateToken, async (req, res) => {
        try {
            const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.memberId]);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [member.space_id]);
            const perms = await computePermissions(db, member.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_ROLES)) {
                return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
            }

            const role = await db.get('SELECT * FROM roles WHERE id = ? AND space_id = ?',
                [req.params.roleId, member.space_id]);
            if (!role) return res.status(404).json({ error: 'Role not found in this space' });

            await db.run(
                'INSERT OR IGNORE INTO member_roles (member_id, role_id) VALUES (?, ?)',
                [req.params.memberId, req.params.roleId]
            );

            if (ns) ns.to(`space:${member.space_id}`).emit('member:role_added', {
                memberId: req.params.memberId, roleId: req.params.roleId, userId: member.user_id
            });

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to assign role' });
        }
    });

    // DELETE /members/:memberId/roles/:roleId — Remove role
    router.delete('/members/:memberId/roles/:roleId', authenticateToken, async (req, res) => {
        try {
            const member = await db.get('SELECT * FROM members WHERE id = ?', [req.params.memberId]);
            if (!member) return res.status(404).json({ error: 'Member not found' });

            const space = await db.get('SELECT * FROM spaces WHERE id = ?', [member.space_id]);
            const perms = await computePermissions(db, member.space_id, req.user.id, space.owner_id);
            if (!hasPermission(perms, Permissions.MANAGE_ROLES)) {
                return res.status(403).json({ error: 'Missing MANAGE_ROLES permission' });
            }

            await db.run(
                'DELETE FROM member_roles WHERE member_id = ? AND role_id = ?',
                [req.params.memberId, req.params.roleId]
            );

            if (ns) ns.to(`space:${member.space_id}`).emit('member:role_removed', {
                memberId: req.params.memberId, roleId: req.params.roleId, userId: member.user_id
            });

            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Failed to remove role' });
        }
    });

    return router;
};
