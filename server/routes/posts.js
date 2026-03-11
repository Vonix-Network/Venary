const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const Config = require('../config');
const { authenticateToken } = require('../middleware/auth');

// Helper: recalculate and update user level from XP
async function updateLevel(userId) {
    const user = await db.get('SELECT xp FROM users WHERE id = ?', [userId]);
    if (!user) return;
    const thresholds = Config.get('levelThresholds', [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000]);
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
        if (user.xp >= thresholds[i]) level = i + 1;
    }
    await db.run('UPDATE users SET level = ? WHERE id = ?', [level, userId]);
}

// Create post
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { content, image, post_type } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const id = uuidv4();
        const now = new Date().toISOString();
        await db.run(
            `INSERT INTO posts (id, user_id, content, image, post_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, req.user.id, content.trim(), image || null, post_type || 'text', now]
        );

        // Add XP for posting — use configured value
        const xpPerPost = Config.get('xpPerPost', 10);
        await db.run('UPDATE users SET xp = xp + ? WHERE id = ?', [xpPerPost, req.user.id]);
        await updateLevel(req.user.id);

        const post = await db.get(
            `SELECT p.*, u.username, u.display_name, u.avatar, u.level,
                0 as like_count, 0 as comment_count, 0 as liked
             FROM posts p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = ?`,
            [id]
        );

        res.status(201).json(post);
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get feed
router.get('/feed', authenticateToken, async (req, res) => {
    try {
        const { before, limit = 20 } = req.query;

        let query = `
          SELECT p.*, u.username, u.display_name, u.avatar, u.level,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
            (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
            (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as liked
          FROM posts p
          JOIN users u ON p.user_id = u.id
        `;
        const params = [req.user.id];

        if (before) {
            query += ' WHERE p.created_at < ?';
            params.push(before);
        }

        query += ' ORDER BY p.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const posts = await db.all(query, params);

        // Enrich posts with donation rank badges
        try {
            const extLoader = require('../extension-loader');
            const donDb = extLoader.getExtensionDb('donations');
            if (donDb) {
                const userIds = [...new Set(posts.map(p => p.user_id))];
                for (const uid of userIds) {
                    const ur = await donDb.get(
                        `SELECT r.name, r.color, r.icon FROM user_ranks ur
                         LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                         WHERE ur.user_id = ? AND ur.active = 1`, [uid]);
                    if (ur) {
                        posts.filter(p => p.user_id === uid).forEach(p => {
                            p.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon };
                        });
                    }
                }
            }
        } catch { /* donations ext not loaded */ }

        res.json(posts);
    } catch (err) {
        console.error('Get feed error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Toggle like
router.post('/:id/like', authenticateToken, async (req, res) => {
    try {
        const postId = req.params.id;

        const post = await db.get('SELECT * FROM posts WHERE id = ?', [postId]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const existing = await db.get('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);

        if (existing) {
            await db.run('DELETE FROM likes WHERE id = ?', [existing.id]);
            // Remove XP from post owner
            const xpPerLike = Config.get('xpPerLike', 1);
            if (post.user_id !== req.user.id) {
                await db.run('UPDATE users SET xp = MAX(0, xp - ?) WHERE id = ?', [xpPerLike, post.user_id]);
                await updateLevel(post.user_id);
            }
            res.json({ liked: false });
        } else {
            const id = uuidv4();
            await db.run('INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)', [id, postId, req.user.id, new Date().toISOString()]);
            // Award XP to post owner (not if liking your own post)
            const xpPerLike = Config.get('xpPerLike', 1);
            if (post.user_id !== req.user.id) {
                await db.run('UPDATE users SET xp = xp + ? WHERE id = ?', [xpPerLike, post.user_id]);
                await updateLevel(post.user_id);
            }
            res.json({ liked: true });
        }
    } catch (err) {
        console.error('Toggle like error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content is required' });
        }

        const postId = req.params.id;
        const post = await db.get('SELECT id FROM posts WHERE id = ?', [postId]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        const id = uuidv4();
        const now = new Date().toISOString();
        await db.run(
            `INSERT INTO comments (id, post_id, user_id, content, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [id, postId, req.user.id, content.trim(), now]
        );

        // Award XP for commenting
        const xpPerComment = Config.get('xpPerComment', 5);
        await db.run('UPDATE users SET xp = xp + ? WHERE id = ?', [xpPerComment, req.user.id]);
        await updateLevel(req.user.id);

        const comment = await db.get(
            `SELECT c.*, u.username, u.display_name, u.avatar, u.level
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.id = ?`,
            [id]
        );

        res.status(201).json(comment);
    } catch (err) {
        console.error('Add comment error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get comments for a post
router.get('/:id/comments', authenticateToken, async (req, res) => {
    try {
        const comments = await db.all(
            `SELECT c.*, u.username, u.display_name, u.avatar, u.level
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC`,
            [req.params.id]
        );

        res.json(comments);
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete post
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found or not authorized' });
        }

        // Delete associated records first (Foreign Key protection)
        await db.run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
        await db.run('DELETE FROM likes WHERE post_id = ?', [req.params.id]);
        
        await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Post deleted' });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
