const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');

const COOLDOWN_DAYS = 7;

// Helper to get user's active/pending appeal
async function getUserActiveAppeal(userId) {
    return await db.get(
        `SELECT * FROM ban_appeals 
         WHERE user_id = ? AND status IN ('submitted', 'under_review')
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
}

// Helper to get latest resolved appeal (for cooldown check)
async function getLatestResolvedAppeal(userId) {
    return await db.get(
        `SELECT * FROM ban_appeals 
         WHERE user_id = ? AND status = 'declined' AND cooldown_until IS NOT NULL
         ORDER BY reviewed_at DESC LIMIT 1`,
        [userId]
    );
}

// Helper to check if user is currently banned
async function isUserBanned(userId) {
    const user = await db.get('SELECT banned, banned_until FROM users WHERE id = ?', [userId]);
    if (!user) return false;

    // Check if ban expired
    if (user.banned && user.banned_until && new Date(user.banned_until) < new Date()) {
        await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [userId]);
        return false;
    }

    return user.banned === 1;
}

// Get current user's appeal status (for banned users)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Verify user is banned
        const banned = await isUserBanned(userId);
        if (!banned) {
            return res.status(400).json({ error: 'You are not currently banned' });
        }

        // Get active appeal
        const activeAppeal = await getUserActiveAppeal(userId);

        // Get latest declined appeal for cooldown info
        const latestDeclined = await getLatestResolvedAppeal(userId);

        // Get user's ban info
        const user = await db.get('SELECT ban_reason, banned_until FROM users WHERE id = ?', [userId]);

        res.json({
            banned: true,
            ban_reason: user.ban_reason,
            banned_until: user.banned_until,
            active_appeal: activeAppeal || null,
            cooldown_info: latestDeclined ? {
                can_appeal_after: latestDeclined.cooldown_until,
                days_remaining: Math.max(0, Math.ceil((new Date(latestDeclined.cooldown_until) - new Date()) / (1000 * 60 * 60 * 24)))
            } : null
        });
    } catch (err) {
        logger.error('Get my appeal error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Submit a new appeal (for banned users)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { appeal_message } = req.body;

        // Verify user is banned
        const banned = await isUserBanned(userId);
        if (!banned) {
            return res.status(400).json({ error: 'You are not currently banned' });
        }

        // Validate message
        if (!appeal_message || appeal_message.trim().length < 50) {
            return res.status(400).json({ error: 'Appeal message must be at least 50 characters' });
        }

        // Check for active appeal
        const activeAppeal = await getUserActiveAppeal(userId);
        if (activeAppeal) {
            return res.status(409).json({ error: 'You already have an active appeal pending review' });
        }

        // Check cooldown period
        const latestDeclined = await getLatestResolvedAppeal(userId);
        if (latestDeclined && latestDeclined.cooldown_until) {
            const cooldownDate = new Date(latestDeclined.cooldown_until);
            if (cooldownDate > new Date()) {
                const daysRemaining = Math.ceil((cooldownDate - new Date()) / (1000 * 60 * 60 * 24));
                return res.status(429).json({
                    error: `You must wait ${daysRemaining} day(s) before submitting a new appeal`,
                    cooldown_until: latestDeclined.cooldown_until
                });
            }
        }

        // Get user's ban reason
        const user = await db.get('SELECT ban_reason FROM users WHERE id = ?', [userId]);

        // Create appeal
        const appealId = uuidv4();
        const now = new Date().toISOString();

        await db.run(
            `INSERT INTO ban_appeals (id, user_id, ban_reason_display, appeal_message, status, previous_appeal_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [appealId, userId, user.ban_reason || 'No reason provided', appeal_message.trim(), 'submitted', latestDeclined?.id || null, now]
        );

        // Log to audit
        await db.run(
            'INSERT INTO admin_audit_log (actor_id, action, target_id, detail) VALUES (?, ?, ?, ?)',
            [userId, 'submit_appeal', appealId, 'User submitted ban appeal']
        );

        logger.info('Ban appeal submitted', { userId, appealId });

        res.status(201).json({
            id: appealId,
            status: 'submitted',
            message: 'Your appeal has been submitted and will be reviewed by our moderation team.'
        });
    } catch (err) {
        logger.error('Submit appeal error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's appeal history
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const appeals = await db.all(
            `SELECT id, status, decline_reason, reviewed_at, created_at
             FROM ban_appeals 
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json(appeals);
    } catch (err) {
        logger.error('Get appeal history error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// ===========================================
// Admin Routes
// ===========================================

// Helper to check if user is admin/moderator
async function requireAdminAuth(req, res, next) {
    try {
        const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!user || !['admin', 'superadmin', 'moderator'].includes(user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.userRole = user.role;
        next();
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
}

// List all appeals (admin)
router.get('/admin/appeals', authenticateToken, requireAdminAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const offset = (page - 1) * limit;

        const statusFilter = req.query.status || 'all';
        const search = req.query.search || '';

        let query = `
            SELECT 
                ba.id,
                ba.user_id,
                ba.ban_reason_display,
                ba.appeal_message,
                ba.status,
                ba.decline_reason,
                ba.reviewed_by,
                ba.reviewed_at,
                ba.cooldown_until,
                ba.created_at,
                u.username,
                u.display_name,
                u.avatar
            FROM ban_appeals ba
            JOIN users u ON ba.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (statusFilter !== 'all') {
            query += ` AND ba.status = ?`;
            params.push(statusFilter);
        }

        if (search) {
            query += ` AND (u.username LIKE ? OR u.display_name LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY 
            CASE ba.status 
                WHEN 'submitted' THEN 1 
                WHEN 'under_review' THEN 2 
                ELSE 3 
            END,
            ba.created_at DESC
            LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const appeals = await db.all(query, params);

        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) as count FROM ban_appeals ba JOIN users u ON ba.user_id = u.id WHERE 1=1`;
        const countParams = [];

        if (statusFilter !== 'all') {
            countQuery += ` AND ba.status = ?`;
            countParams.push(statusFilter);
        }
        if (search) {
            countQuery += ` AND (u.username LIKE ? OR u.display_name LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }

        const { count } = await db.get(countQuery, countParams);

        res.json({
            appeals,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (err) {
        logger.error('Admin get appeals error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get appeal statistics (admin) — must be defined BEFORE /:id to avoid shadowing
router.get('/admin/appeals/stats', authenticateToken, requireAdminAuth, async (req, res) => {
    try {
        const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
        const stats = await db.get(`
            SELECT
                COUNT(CASE WHEN status = 'submitted' THEN 1 END) as pending,
                COUNT(CASE WHEN status = 'under_review' THEN 1 END) as under_review,
                COUNT(CASE WHEN status = 'approved' AND reviewed_at >= ? THEN 1 END) as approved_today,
                COUNT(CASE WHEN status = 'declined' AND reviewed_at >= ? THEN 1 END) as declined_today,
                COUNT(CASE WHEN status = 'approved' THEN 1 END) as total_approved,
                COUNT(CASE WHEN status = 'declined' THEN 1 END) as total_declined
            FROM ban_appeals
        `, [todayStr, todayStr]);

        res.json(stats);
    } catch (err) {
        logger.error('Get appeal stats error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single appeal details (admin)
router.get('/admin/appeals/:id', authenticateToken, requireAdminAuth, async (req, res) => {
    try {
        const appeal = await db.get(
            `SELECT 
                ba.*,
                u.username,
                u.display_name,
                u.avatar,
                u.email,
                u.banned_until as user_banned_until,
                reviewer.username as reviewer_username
            FROM ban_appeals ba
            JOIN users u ON ba.user_id = u.id
            LEFT JOIN users reviewer ON ba.reviewed_by = reviewer.id
            WHERE ba.id = ?`,
            [req.params.id]
        );

        if (!appeal) {
            return res.status(404).json({ error: 'Appeal not found' });
        }

        // Get user's ban history
        const banHistory = await db.all(
            `SELECT 
                aal.action,
                aal.detail,
                aal.created_at,
                actor.username as actor_username
            FROM admin_audit_log aal
            LEFT JOIN users actor ON aal.actor_id = actor.id
            WHERE aal.target_id = ? AND aal.action IN ('ban_user', 'suspend_user', 'unban_user')
            ORDER BY aal.created_at DESC
            LIMIT 10`,
            [appeal.user_id]
        );

        // Get previous appeals
        const previousAppeals = await db.all(
            `SELECT id, status, decline_reason, reviewed_at, created_at
             FROM ban_appeals
             WHERE user_id = ? AND id != ?
             ORDER BY created_at DESC
             LIMIT 5`,
            [appeal.user_id, appeal.id]
        );

        res.json({
            ...appeal,
            ban_history: banHistory,
            previous_appeals: previousAppeals
        });
    } catch (err) {
        logger.error('Admin get appeal error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Review appeal - approve or decline (admin)
router.post('/admin/appeals/:id/review', authenticateToken, requireAdminAuth, async (req, res) => {
    try {
        const { action, decline_reason, admin_note } = req.body;
        const appealId = req.params.id;
        const adminId = req.user.id;

        // Validate action
        if (!['approve', 'decline'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action. Must be approve or decline' });
        }

        // Get appeal
        const appeal = await db.get('SELECT * FROM ban_appeals WHERE id = ?', [appealId]);
        if (!appeal) {
            return res.status(404).json({ error: 'Appeal not found' });
        }

        // Check if already reviewed
        if (appeal.status !== 'submitted' && appeal.status !== 'under_review') {
            return res.status(409).json({ error: `Appeal has already been ${appeal.status}` });
        }

        const now = new Date().toISOString();

        if (action === 'approve') {
            // Unban the user
            await db.run(
                'UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?',
                [appeal.user_id]
            );

            // Update appeal status
            await db.run(
                `UPDATE ban_appeals 
                 SET status = 'approved', reviewed_by = ?, reviewed_at = ? 
                 WHERE id = ?`,
                [adminId, now, appealId]
            );

            // Log to audit
            await db.run(
                'INSERT INTO admin_audit_log (actor_id, action, target_id, detail) VALUES (?, ?, ?, ?)',
                [adminId, 'approve_appeal', appealId, admin_note || 'Appeal approved, user unbanned']
            );

            // TODO: Send notification to user

            logger.info('Ban appeal approved', { appealId, adminId, userId: appeal.user_id });

            res.json({
                message: 'Appeal approved and user has been unbanned',
                status: 'approved'
            });

        } else {
            // Decline the appeal
            if (!decline_reason || decline_reason.trim().length < 10) {
                return res.status(400).json({ error: 'Decline reason must be at least 10 characters' });
            }

            // Calculate cooldown period (7 days from now)
            const cooldownDate = new Date();
            cooldownDate.setDate(cooldownDate.getDate() + COOLDOWN_DAYS);
            const cooldownUntil = cooldownDate.toISOString();

            // Update appeal status
            await db.run(
                `UPDATE ban_appeals 
                 SET status = 'declined', 
                     decline_reason = ?, 
                     reviewed_by = ?, 
                     reviewed_at = ?,
                     cooldown_until = ?
                 WHERE id = ?`,
                [decline_reason.trim(), adminId, now, cooldownUntil, appealId]
            );

            // Log to audit
            await db.run(
                'INSERT INTO admin_audit_log (actor_id, action, target_id, detail) VALUES (?, ?, ?, ?)',
                [adminId, 'decline_appeal', appealId, decline_reason]
            );

            // TODO: Send notification to user

            logger.info('Ban appeal declined', { appealId, adminId, userId: appeal.user_id });

            res.json({
                message: 'Appeal declined',
                status: 'declined',
                cooldown_until: cooldownUntil
            });
        }
    } catch (err) {
        logger.error('Review appeal error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Update appeal status to 'under_review' (admin - when they start reviewing)
router.post('/admin/appeals/:id/start-review', authenticateToken, requireAdminAuth, async (req, res) => {
    try {
        const appealId = req.params.id;
        const adminId = req.user.id;

        const appeal = await db.get('SELECT * FROM ban_appeals WHERE id = ?', [appealId]);
        if (!appeal) {
            return res.status(404).json({ error: 'Appeal not found' });
        }

        if (appeal.status !== 'submitted') {
            return res.status(409).json({ error: 'Can only start review on submitted appeals' });
        }

        await db.run(
            'UPDATE ban_appeals SET status = ? WHERE id = ?',
            ['under_review', appealId]
        );

        await db.run(
            'INSERT INTO admin_audit_log (actor_id, action, target_id) VALUES (?, ?, ?)',
            [adminId, 'start_review', appealId]
        );

        res.json({ message: 'Review started', status: 'under_review' });
    } catch (err) {
        logger.error('Start review error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
