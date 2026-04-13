const express = require('express');
const logger = require('../logger');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const { getIo } = require('../socket');

// ─── Helper exposed to other routes ─────────────────────────────────────────
// createNotification(userId, type, actorId, referenceId, message)
async function createNotification(userId, type, actorId, referenceId, message) {
    // Don't notify yourself
    if (userId === actorId) return;
    try {
        const notifId = uuidv4();
        await db.run(
            `INSERT INTO notifications (id, user_id, type, actor_id, reference_id, message, read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [notifId, userId, type, actorId, referenceId, message, new Date().toISOString()]
        );

        const io = getIo();
        if (io) {
            io.to(`user:${userId}`).emit('new_notification');
        }
    } catch (err) {
        logger.error('createNotification error:', { err: err.message, stack: err.stack });
    }
}

// ─── GET /api/notifications ──────────────────────────────────────────────────
// Returns recent notifications + unread counts for notifications & chat
router.get('/', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);

        const notifications = await db.all(
            `SELECT n.*, u.username as actor_username, u.display_name as actor_display_name, u.avatar as actor_avatar
             FROM notifications n
             LEFT JOIN users u ON n.actor_id = u.id
             WHERE n.user_id = ?
             ORDER BY n.created_at DESC
             LIMIT ?`,
            [req.user.id, limit]
        );

        const [unreadNotifs] = await db.all(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`,
            [req.user.id]
        );

        const [unreadMessages] = await db.all(
            `SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0`,
            [req.user.id]
        );

        res.json({
            notifications,
            unread_notifications: unreadNotifs?.count || 0,
            unread_messages: unreadMessages?.count || 0
        });
    } catch (err) {
        logger.error('Get notifications error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── GET /api/notifications/counts ──────────────────────────────────────────
// Lightweight polling endpoint: only returns badge counts
router.get('/counts', authenticateToken, async (req, res) => {
    try {
        const [unreadNotifs] = await db.all(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0`,
            [req.user.id]
        );
        const [unreadMessages] = await db.all(
            `SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0`,
            [req.user.id]
        );
        res.json({
            unread_notifications: unreadNotifs?.count || 0,
            unread_messages: unreadMessages?.count || 0
        });
    } catch (err) {
        logger.error('Counts error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── POST /api/notifications/read ───────────────────────────────────────────
// Mark all (or specific) notifications as read
router.post('/read', authenticateToken, async (req, res) => {
    try {
        const { id } = req.body; // optional — omit to mark all
        if (id) {
            await db.run(
                `UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`,
                [id, req.user.id]
            );
        } else {
            await db.run(
                `UPDATE notifications SET read = 1 WHERE user_id = ?`,
                [req.user.id]
            );
        }
        res.json({ ok: true });
    } catch (err) {
        logger.error('Mark read error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── DELETE /api/notifications/:id ──────────────────────────────────────────
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await db.run(
            `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        res.json({ ok: true });
    } catch (err) {
        logger.error('Delete notification error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
module.exports.createNotification = createNotification;
