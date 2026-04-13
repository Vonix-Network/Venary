const express = require('express');
const logger = require('../logger');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Send friend request
router.post('/request/:id', authenticateToken, async (req, res) => {
    try {
        const friendId = req.params.id;
        if (friendId === req.user.id) {
            return res.status(400).json({ error: 'Cannot friend yourself' });
        }

        const friend = await db.get('SELECT id FROM users WHERE id = ?', [friendId]);
        if (!friend) {
            return res.status(404).json({ error: 'User not found' });
        }

        const existing = await db.get(
            `SELECT * FROM friendships
             WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
            [req.user.id, friendId, friendId, req.user.id]
        );

        if (existing) {
            return res.status(409).json({ error: 'Friendship already exists or pending' });
        }

        const id = uuidv4();
        await db.run(
            `INSERT INTO friendships (id, user_id, friend_id, status, created_at)
             VALUES (?, ?, ?, 'pending', ?)`,
            [id, req.user.id, friendId, new Date().toISOString()]
        );

        res.status(201).json({ message: 'Friend request sent', id });
    } catch (err) {
        logger.error('Friend request error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept friend request
router.post('/accept/:id', authenticateToken, async (req, res) => {
    try {
        const requesterId = req.params.id;

        const friendship = await db.get(
            `SELECT * FROM friendships
             WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
            [requesterId, req.user.id]
        );

        if (!friendship) {
            return res.status(404).json({ error: 'No pending request found' });
        }

        await db.run("UPDATE friendships SET status = 'accepted' WHERE id = ?", [friendship.id]);

        res.json({ message: 'Friend request accepted' });
    } catch (err) {
        logger.error('Accept friend error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Reject / Remove friend
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const otherId = req.params.id;

        const result = await db.run(
            `DELETE FROM friendships
             WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
            [req.user.id, otherId, otherId, req.user.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Friendship not found' });
        }

        res.json({ message: 'Friend removed' });
    } catch (err) {
        logger.error('Remove friend error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// List friends
router.get('/', authenticateToken, async (req, res) => {
    try {
        const friends = await db.all(
            `SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.level, u.status, u.last_seen,
                    f.created_at as friends_since
             FROM friendships f
             JOIN users u ON (
               CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END = u.id
             )
             WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
             ORDER BY u.status DESC, u.username ASC`,
            [req.user.id, req.user.id, req.user.id]
        );

        res.json(friends);
    } catch (err) {
        logger.error('List friends error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// List pending requests
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        const incoming = await db.all(
            `SELECT u.id, u.username, u.display_name, u.avatar, u.level, f.created_at as requested_at
             FROM friendships f
             JOIN users u ON f.user_id = u.id
             WHERE f.friend_id = ? AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [req.user.id]
        );

        const outgoing = await db.all(
            `SELECT u.id, u.username, u.display_name, u.avatar, u.level, f.created_at as requested_at
             FROM friendships f
             JOIN users u ON f.friend_id = u.id
             WHERE f.user_id = ? AND f.status = 'pending'
             ORDER BY f.created_at DESC`,
            [req.user.id]
        );

        res.json({ incoming, outgoing });
    } catch (err) {
        logger.error('List requests error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
