const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Admin middleware — passes admin, superadmin, and moderator
async function requireAdmin(req, res, next) {
    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (!user || !['admin', 'superadmin', 'moderator'].includes(user.role)) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    req.userRole = user.role;
    next();
}

/** Middleware: superadmin-only actions (e.g. extension permission management) */
async function requireSuperAdmin(req, res, next) {
    const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (!user || user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Superadmin access required' });
    }
    req.userRole = user.role;
    next();
}

// Get admin stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const totalUsers = (await db.get('SELECT COUNT(*) as count FROM users')).count;
        const onlineUsers = (await db.get("SELECT COUNT(*) as count FROM users WHERE status = 'online'")).count;
        const totalPosts = (await db.get('SELECT COUNT(*) as count FROM posts')).count;
        const pendingReports = (await db.get("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'")).count;
        const bannedUsers = (await db.get('SELECT COUNT(*) as count FROM users WHERE banned = 1')).count;
        const totalMessages = (await db.get('SELECT COUNT(*) as count FROM messages')).count;

        res.json({
            total_users: totalUsers,
            online_users: onlineUsers,
            total_posts: totalPosts,
            pending_reports: pendingReports,
            banned_users: bannedUsers,
            total_messages: totalMessages
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const offset = (page - 1) * limit;

        const search = req.query.search || '';
        const roleFilter = req.query.role || 'all';
        const sort = req.query.sort || 'created_at';
        const order = req.query.order === 'asc' ? 'ASC' : 'DESC';

        const validSortColumns = ['username', 'email', 'role', 'status', 'level', 'created_at'];
        const sortColumn = validSortColumns.includes(sort) ? sort : 'created_at';

        let query = `SELECT id, username, display_name, email, avatar, role, banned, ban_reason, banned_until,
                            level, xp, status, created_at, last_seen
                     FROM users WHERE 1=1`;
        const params = [];

        if (search) {
            query += ` AND (username LIKE ? OR email LIKE ? OR display_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (roleFilter !== 'all') {
            query += ` AND role = ?`;
            params.push(roleFilter);
        }

        query += ` ORDER BY ${sortColumn} ${order} LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const users = await db.all(query, params);

        res.json(users);
    } catch (err) {
        console.error('Admin get users error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Ban user
router.post('/users/:id/ban', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { reason, duration } = req.body;
        const targetUser = await db.get('SELECT role FROM users WHERE id = ?', [req.params.id]);

        if (!targetUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Only admins/superadmins can ban moderators; superadmins cannot be banned via web
        if (targetUser.role === 'superadmin') {
            return res.status(403).json({ error: 'Cannot ban a superadmin' });
        }
        if (targetUser.role === 'admin') {
            return res.status(403).json({ error: 'Cannot ban an admin' });
        }
        if (targetUser.role === 'moderator' && !['admin', 'superadmin'].includes(req.userRole)) {
            return res.status(403).json({ error: 'Only admins can ban moderators' });
        }

        let bannedUntil = null;
        if (duration && duration !== 'permanent') {
            const minutes = parseInt(duration);
            if (!isNaN(minutes)) {
                bannedUntil = new Date(Date.now() + minutes * 60000).toISOString();
            }
        }

        await db.run(
            'UPDATE users SET banned = 1, ban_reason = ?, banned_until = ?, status = ? WHERE id = ?',
            [reason || 'No reason provided', bannedUntil, 'offline', req.params.id]
        );

        res.json({ message: bannedUntil ? 'User suspended' : 'User banned' });
    } catch (err) {
        console.error('Ban user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unban user
router.post('/users/:id/unban', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [req.params.id]);
        res.json({ message: 'User unbanned' });
    } catch (err) {
        console.error('Unban user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete user
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const targetUser = await db.get('SELECT role FROM users WHERE id = ?', [req.params.id]);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        
        // Only admins can delete moderators/admins
        if (targetUser.role === 'admin' || (targetUser.role === 'moderator' && req.userRole !== 'admin')) {
            return res.status(403).json({ error: 'Cannot delete this user' });
        }

        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Change user role
router.post('/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'moderator', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // Only admins can promote to admin
        if (role === 'admin' && req.userRole !== 'admin') {
            return res.status(403).json({ error: 'Only admins can promote to admin' });
        }

        await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        res.json({ message: 'Role updated' });
    } catch (err) {
        console.error('Change role error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get reports
router.get('/reports', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const reports = await db.all(
            `SELECT r.*,
                reporter.username as reporter_username,
                reported.username as reported_username
             FROM reports r
             LEFT JOIN users reporter ON r.reporter_id = reporter.id
             LEFT JOIN users reported ON r.reported_user_id = reported.id
             ORDER BY
                CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
                r.created_at DESC
             LIMIT 100`
        );

        res.json(reports);
    } catch (err) {
        console.error('Get reports error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Resolve report
router.post('/reports/:id/resolve', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { note } = req.body;
        await db.run(
            `UPDATE reports SET status = 'resolved', admin_note = ?, resolved_by = ?, resolved_at = ?
             WHERE id = ?`,
            [note || '', req.user.id, new Date().toISOString(), req.params.id]
        );

        res.json({ message: 'Report resolved' });
    } catch (err) {
        console.error('Resolve report error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// FEED POSTS MODERATION
// ==========================================
router.get('/posts', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const posts = await db.all(
            `SELECT p.*, u.username, u.display_name,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count
             FROM posts p
             LEFT JOIN users u ON p.user_id = u.id
             ORDER BY p.created_at DESC
             LIMIT 100`
        );
        res.json(posts);
    } catch (err) {
        console.error('Get mod posts error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/posts/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
        await db.run('DELETE FROM likes WHERE post_id = ?', [req.params.id]);
        await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Post deleted' });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==========================================
// SETTINGS — full read/write
// ==========================================
const Config = require('../config');

// GET /api/admin/settings — return full grouped config
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const cfg = Config.load() || {};
        res.json({
            general: {
                siteName: cfg.siteName || 'Venary',
                siteTagline: cfg.siteTagline || '',
                siteDescription: cfg.siteDescription || '',
                logoUrl: cfg.logoUrl || '',
                faviconUrl: cfg.faviconUrl || '',
                footerText: cfg.footerText || ''
            },
            appearance: {
                primaryColor: cfg.primaryColor || '#00d4ff',
                accentColor: cfg.accentColor || '#7b2fff',
                darkMode: cfg.darkMode !== false
            },
            community: {
                registrationOpen: cfg.registrationOpen !== false,
                requireEmailVerification: !!cfg.requireEmailVerification,
                maxUsernameLength: cfg.maxUsernameLength || 32,
                maxBioLength: cfg.maxBioLength || 300
            },
            gamification: {
                xpPerPost: cfg.xpPerPost ?? 10,
                xpPerComment: cfg.xpPerComment ?? 5,
                xpPerLike: cfg.xpPerLike ?? 1,
                levelThresholds: cfg.levelThresholds || [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000]
            },
            maintenance: {
                maintenanceMode: !!cfg.maintenanceMode,
                maintenanceMessage: cfg.maintenanceMessage || 'We\'ll be right back!'
            },
            smtp: {
                enabled: !!(cfg.smtp && cfg.smtp.enabled),
                host: (cfg.smtp && cfg.smtp.host) || '',
                port: (cfg.smtp && cfg.smtp.port) || 587,
                secure: !!(cfg.smtp && cfg.smtp.secure),
                user: (cfg.smtp && cfg.smtp.user) || '',
                pass: (cfg.smtp && cfg.smtp.pass) ? '••••••••' : '',  // masked
                from: (cfg.smtp && cfg.smtp.from) || '',
                rejectUnauthorized: (cfg.smtp && cfg.smtp.rejectUnauthorized) !== false
            },
            notifications: {
                welcomeEmail: (cfg.notifications && cfg.notifications.welcomeEmail) !== false,
                notifyFriendRequests: (cfg.notifications && cfg.notifications.notifyFriendRequests) !== false,
                notifyMessages: !!(cfg.notifications && cfg.notifications.notifyMessages),
                notifyComments: (cfg.notifications && cfg.notifications.notifyComments) !== false,
                digestEnabled: !!(cfg.notifications && cfg.notifications.digestEnabled)
            },
            database: {
                type: (cfg.database || {}).type || 'sqlite'
            },
            discord: {
                webhookUrl: (cfg.discord && cfg.discord.webhookUrl) || '',
                botToken: (cfg.discord && cfg.discord.botToken) ? '••••••••' : '',
                guildId: (cfg.discord && cfg.discord.guildId) || '',
                uptimeRolePing: (cfg.discord && cfg.discord.uptimeRolePing) || '',
                uptimeStrikeThreshold: (cfg.discord && cfg.discord.uptimeStrikeThreshold) || 5
            }
        });
    } catch (err) {
        console.error('Get settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/settings — bulk update (any subset of settings)
router.post('/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Only admin (not moderator) can change settings
        const requester = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!requester || requester.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can change settings' });
        }

        const allowed = [
            'siteName', 'siteTagline', 'siteDescription', 'logoUrl', 'faviconUrl', 'footerText',
            'primaryColor', 'accentColor', 'darkMode',
            'registrationOpen', 'requireEmailVerification', 'maxUsernameLength', 'maxBioLength',
            'xpPerPost', 'xpPerComment', 'xpPerLike', 'levelThresholds',
            'maintenanceMode', 'maintenanceMessage'
        ];

        const updates = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        // Handle nested smtp object
        if (req.body.smtp && typeof req.body.smtp === 'object') {
            const smtpIn = req.body.smtp;
            const current = Config.get('smtp', {});
            updates.smtp = {
                enabled: !!smtpIn.enabled,
                host: smtpIn.host !== undefined ? smtpIn.host : current.host || '',
                port: parseInt(smtpIn.port) || 587,
                secure: !!smtpIn.secure,
                user: smtpIn.user !== undefined ? smtpIn.user : current.user || '',
                from: smtpIn.from !== undefined ? smtpIn.from : current.from || '',
                rejectUnauthorized: smtpIn.rejectUnauthorized !== false
            };
            // Only update password if a real value is provided (not the masked placeholder)
            if (smtpIn.pass && smtpIn.pass !== '••••••••') {
                updates.smtp.pass = smtpIn.pass;
            } else {
                updates.smtp.pass = current.pass || '';
            }
        }

        // Handle nested notifications object
        if (req.body.notifications && typeof req.body.notifications === 'object') {
            updates.notifications = {
                welcomeEmail: !!req.body.notifications.welcomeEmail,
                notifyFriendRequests: !!req.body.notifications.notifyFriendRequests,
                notifyMessages: !!req.body.notifications.notifyMessages,
                notifyComments: !!req.body.notifications.notifyComments,
                digestEnabled: !!req.body.notifications.digestEnabled
            };
        }

        // Handle nested discord object
        if (req.body.discord && typeof req.body.discord === 'object') {
            const current = Config.get('discord', {});
            updates.discord = {
                webhookUrl: req.body.discord.webhookUrl !== undefined ? req.body.discord.webhookUrl : current.webhookUrl || '',
                uptimeRolePing: req.body.discord.uptimeRolePing !== undefined ? req.body.discord.uptimeRolePing : current.uptimeRolePing || '',
                uptimeStrikeThreshold: parseInt(req.body.discord.uptimeStrikeThreshold) || 5,
                guildId: req.body.discord.guildId !== undefined ? req.body.discord.guildId : current.guildId || ''
            };
            if (req.body.discord.botToken && req.body.discord.botToken !== '••••••••') {
                updates.discord.botToken = req.body.discord.botToken;
            } else {
                updates.discord.botToken = current.botToken || '';
            }
        }

        // Validate colour format
        const colorRe = /^#[0-9a-fA-F]{6}$/;
        if (updates.primaryColor && !colorRe.test(updates.primaryColor)) {
            return res.status(400).json({ error: 'Invalid primaryColor format (use #rrggbb)' });
        }
        if (updates.accentColor && !colorRe.test(updates.accentColor)) {
            return res.status(400).json({ error: 'Invalid accentColor format (use #rrggbb)' });
        }

        // Validate numbers
        if (updates.xpPerPost !== undefined) updates.xpPerPost = parseInt(updates.xpPerPost) || 10;
        if (updates.xpPerComment !== undefined) updates.xpPerComment = parseInt(updates.xpPerComment) || 5;
        if (updates.xpPerLike !== undefined) updates.xpPerLike = parseInt(updates.xpPerLike) || 1;

        Config.update(updates);

        res.json({ message: 'Settings updated', settings: Config.getPublicSettings() });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/admin/settings/test-email
router.post('/settings/test-email', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { to } = req.body;
        if (!to) return res.status(400).json({ error: 'Recipient email is required' });
        const Mailer = require('../mail');
        await Mailer.sendTest(to);
        res.json({ message: `Test email sent to ${to}` });
    } catch (err) {
        console.error('Test email error:', err);
        res.status(500).json({ error: err.message || 'Failed to send test email' });
    }
});

module.exports = router;
