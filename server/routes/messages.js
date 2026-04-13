const express = require('express');
const logger = require('../logger');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get conversations list
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const conversations = await db.all(
      `SELECT
                u.id, u.username, u.display_name, u.avatar, u.status, u.last_seen,
                m.content as last_message,
                m.created_at as last_message_time,
                m.sender_id as last_sender_id,
                (SELECT COUNT(*) FROM messages
                 WHERE sender_id = u.id AND receiver_id = ? AND read = 0) as unread_count
             FROM users u
             INNER JOIN (
                SELECT
                  CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END as other_id,
                  MAX(created_at) as max_time
                FROM messages
                WHERE sender_id = ? OR receiver_id = ?
                GROUP BY other_id
             ) conv ON u.id = conv.other_id
             INNER JOIN messages m ON (
                ((m.sender_id = ? AND m.receiver_id = u.id) OR (m.sender_id = u.id AND m.receiver_id = ?))
                AND m.created_at = conv.max_time
             )
             ORDER BY conv.max_time DESC`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    res.json(conversations);
  } catch (err) {
    logger.error('Get conversations error:', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

// Get messages with a specific user
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { before } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);

    let query = `
          SELECT m.*,
            su.username as sender_username, su.display_name as sender_display_name, su.avatar as sender_avatar
          FROM messages m
          JOIN users su ON m.sender_id = su.id
          WHERE ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))
        `;
    const params = [req.user.id, userId, userId, req.user.id];

    if (before) {
      query += ' AND m.created_at < ?';
      params.push(before);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const messages = await db.all(query, params);

    // Mark messages as read
    await db.run(
      `UPDATE messages SET read = 1
             WHERE sender_id = ? AND receiver_id = ? AND read = 0`,
      [userId, req.user.id]
    );

    res.json(messages.reverse());
  } catch (err) {
    logger.error('Get messages error:', { err: err.message, stack: err.stack });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
