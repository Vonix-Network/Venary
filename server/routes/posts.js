const express = require('express');
const logger = require('../logger');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const Config = require('../config');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');

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
        const { content, image, post_type, visibility } = req.body;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content is required' });
        }
        if (content.length > 10000) {
            return res.status(400).json({ error: 'Post content cannot exceed 10,000 characters' });
        }
        if (image !== undefined && image !== null && image !== '' && !/^https?:\/\/.{1,2000}$/i.test(image)) {
            return res.status(400).json({ error: 'Image must be a valid http/https URL' });
        }

        const id = uuidv4();
        const now = new Date().toISOString();
        await db.run(
            `INSERT INTO posts (id, user_id, content, image, post_type, visibility, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.id, content.trim(), image || null, post_type || 'text', visibility || 'public', now]
        );

        // Add XP for posting — use configured value
        const xpPerPost = Config.get('xpPerPost', 10);
        await db.run('UPDATE users SET xp = xp + ? WHERE id = ?', [xpPerPost, req.user.id]);
        await updateLevel(req.user.id);

        // Auto-subscribe the author to their own post
        const existingSub = await db.get(
            `SELECT id FROM post_subscriptions WHERE post_id = ? AND user_id = ?`,
            [id, req.user.id]
        );
        if (!existingSub) {
            await db.run(
                `INSERT INTO post_subscriptions (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
                [uuidv4(), id, req.user.id, now]
            );
        }

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
        logger.error('Create post error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get feed — public for guests (optionalAuth), only public posts shown when unauthenticated
router.get('/feed', optionalAuth, async (req, res) => {
    try {
        const before = req.query.before;
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
        const userId = req.user ? req.user.id : null;

        let query, params;
        if (userId) {
            // Authenticated: show public posts + own posts + friends' posts
            query = `
              SELECT p.*, u.username, u.display_name, u.avatar, u.level, u.role,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as liked,
                (SELECT COUNT(*) FROM post_subscriptions WHERE post_id = p.id AND user_id = ?) as is_subscribed
              FROM posts p
              JOIN users u ON p.user_id = u.id
              WHERE (p.visibility = 'public' OR p.user_id = ? OR EXISTS (
                SELECT 1 FROM friendships f
                WHERE f.status = 'accepted' AND
                ((f.user_id = p.user_id AND f.friend_id = ?) OR (f.friend_id = p.user_id AND f.user_id = ?))
              ))
            `;
            params = [userId, userId, userId, userId, userId];
        } else {
            // Guest: only public posts, no liked/subscribed state
            query = `
              SELECT p.*, u.username, u.display_name, u.avatar, u.level, u.role,
                (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                0 as liked, 0 as is_subscribed
              FROM posts p
              JOIN users u ON p.user_id = u.id
              WHERE p.visibility = 'public'
            `;
            params = [];
        }

        if (before) {
            query += ' AND p.created_at < ?';
            params.push(before);
        }
        query += ' ORDER BY p.created_at DESC LIMIT ?';
        params.push(parseInt(limit));

        const posts = await db.all(query, params);

        // Enrich posts with donation rank badges
        try {
            const userIds = [...new Set(posts.map(p => p.user_id))];
            for (const uid of userIds) {
                const ur = await db.get(
                    `SELECT r.name, r.color, r.icon FROM user_ranks ur
                     LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                     WHERE ur.user_id = ? AND ur.active = 1
                     AND (ur.expires_at IS NULL OR ur.expires_at > ?)`, [uid, new Date().toISOString()]);
                if (ur) {
                    posts.filter(p => p.user_id === uid).forEach(p => {
                        p.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon };
                    });
                }
            }
        } catch { /* donations tables may not exist yet */ }

        res.json(posts);
    } catch (err) {
        logger.error('Get feed error:', { err: err.message, stack: err.stack });
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
                // Notify post owner
                const liker = await db.get('SELECT display_name, username FROM users WHERE id = ?', [req.user.id]);
                const likerName = liker ? (liker.display_name || liker.username) : 'Someone';
                await createNotification(post.user_id, 'like', req.user.id, postId, `${likerName} liked your post.`);
            }
            res.json({ liked: true });
        }
    } catch (err) {
        logger.error('Toggle like error:', { err: err.message, stack: err.stack });
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
        if (content.length > 2000) {
            return res.status(400).json({ error: 'Comment cannot exceed 2,000 characters' });
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

        // Notify all subscribers of this post (except the commenter)
        try {
            const commenter = await db.get('SELECT display_name, username FROM users WHERE id = ?', [req.user.id]);
            const commenterName = commenter ? (commenter.display_name || commenter.username) : 'Someone';
            const subscribers = await db.all(
                `SELECT user_id FROM post_subscriptions WHERE post_id = ? AND user_id != ?`,
                [postId, req.user.id]
            );
            for (const sub of subscribers) {
                await createNotification(sub.user_id, 'comment', req.user.id, postId, `${commenterName} commented on a post you're subscribed to.`);
            }
            // Auto-subscribe the commenter if not already subscribed
            const existingComSub = await db.get(
                `SELECT id FROM post_subscriptions WHERE post_id = ? AND user_id = ?`,
                [postId, req.user.id]
            );
            if (!existingComSub) {
                await db.run(
                    `INSERT INTO post_subscriptions (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
                    [uuidv4(), postId, req.user.id, now]
                );
            }
        } catch (subErr) { logger.error('Sub/notify error:', { err: subErr && subErr.message }); }

        const comment = await db.get(
            `SELECT c.*, u.username, u.display_name, u.avatar, u.level
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.id = ?`,
            [id]
        );

        res.status(201).json(comment);
    } catch (err) {
        logger.error('Add comment error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get comments for a post
// Get comments for a post — public for guests
router.get('/:id/comments', optionalAuth, async (req, res) => {
    try {
        const comments = await db.all(
            `SELECT c.*, u.username, u.display_name, u.avatar, u.level, u.role
             FROM comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.post_id = ?
             ORDER BY c.created_at ASC`,
            [req.params.id]
        );

        // Enrich comments with donation rank badges
        try {
            const userIds = [...new Set(comments.map(c => c.user_id))];
            for (const uid of userIds) {
                const ur = await db.get(
                    `SELECT r.name, r.color, r.icon FROM user_ranks ur
                     LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                     WHERE ur.user_id = ? AND ur.active = 1
                     AND (ur.expires_at IS NULL OR ur.expires_at > ?)`, [uid, new Date().toISOString()]);
                if (ur) {
                    comments.filter(c => c.user_id === uid).forEach(c => {
                        c.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon };
                    });
                }
            }
        } catch { /* donations tables may not exist yet */ }

        res.json(comments);
    } catch (err) {
        logger.error('Get comments error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete post
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Ensure user is author, or an admin/moderator
        if (post.user_id !== req.user.id) {
            const currentUser = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
                return res.status(403).json({ error: 'Not authorized' });
            }
        }

        // Delete associated records first (Foreign Key protection)
        await db.run('DELETE FROM comments WHERE post_id = ?', [req.params.id]);
        await db.run('DELETE FROM likes WHERE post_id = ?', [req.params.id]);
        await db.run('DELETE FROM post_subscriptions WHERE post_id = ?', [req.params.id]);

        await db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
        res.json({ message: 'Post deleted' });
    } catch (err) {
        logger.error('Delete post error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Update post
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { content, image } = req.body;
        if (content !== undefined && content.length > 10000) {
            return res.status(400).json({ error: 'Post content cannot exceed 10,000 characters' });
        }
        if (image !== undefined && image !== null && image !== '' && !/^https?:\/\/.{1,2000}$/i.test(image)) {
            return res.status(400).json({ error: 'Image must be a valid http/https URL' });
        }
        const post = await db.get('SELECT * FROM posts WHERE id = ?', [req.params.id]);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Ensure user is author, or an admin/moderator
        if (post.user_id !== req.user.id) {
            const currentUser = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
                return res.status(403).json({ error: 'Not authorized' });
            }
        }

        await db.run(
            'UPDATE posts SET content = ?, image = ? WHERE id = ?',
            [content, image, req.params.id]
        );
        
        res.json({ message: 'Post updated' });
    } catch (err) {
        logger.error('Update post error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Toggle post subscription
router.post('/:id/subscribe', authenticateToken, async (req, res) => {
    try {
        const postId = req.params.id;
        const post = await db.get('SELECT id FROM posts WHERE id = ?', [postId]);
        if (!post) return res.status(404).json({ error: 'Post not found' });

        const existing = await db.get(
            `SELECT id FROM post_subscriptions WHERE post_id = ? AND user_id = ?`,
            [postId, req.user.id]
        );

        if (existing) {
            await db.run('DELETE FROM post_subscriptions WHERE id = ?', [existing.id]);
            res.json({ subscribed: false });
        } else {
            await db.run(
                `INSERT INTO post_subscriptions (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
                [uuidv4(), postId, req.user.id, new Date().toISOString()]
            );
            res.json({ subscribed: true });
        }
    } catch (err) {
        logger.error('Subscribe toggle error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Report a post
router.post('/:id/report', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const post = await db.get('SELECT user_id FROM posts WHERE id = ?', [req.params.id]);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        await db.run(
            `INSERT INTO reports (id, reporter_id, reported_user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), req.user.id, post.user_id, `Reported Post (${req.params.id})\nReason: ${reason || 'Inappropriate code/behavior'}`, 'pending', new Date().toISOString()]
        );
        res.json({ message: 'Report submitted' });
    } catch (err) {
        logger.error('Report post error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Check subscription state for a post
router.get('/:id/subscribe', authenticateToken, async (req, res) => {
    try {
        const row = await db.get(
            `SELECT id FROM post_subscriptions WHERE post_id = ? AND user_id = ?`,
            [req.params.id, req.user.id]
        );
        res.json({ subscribed: !!row });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a comment
router.delete('/comments/:commentId', authenticateToken, async (req, res) => {
    try {
        const comment = await db.get('SELECT * FROM comments WHERE id = ?', [req.params.commentId]);
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        if (comment.user_id !== req.user.id) {
            const currentUser = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
                return res.status(403).json({ error: 'Not authorized' });
            }
        }

        // Decrement comment count? The feed does a left join and counts the comments, so deleting the row is enough.
        await db.run('DELETE FROM comments WHERE id = ?', [req.params.commentId]);
        res.json({ message: 'Comment deleted' });
    } catch (err) {
        logger.error('Delete comment error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Report a comment
router.post('/comments/:commentId/report', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;
        const comment = await db.get('SELECT user_id, post_id FROM comments WHERE id = ?', [req.params.commentId]);
        if (!comment) return res.status(404).json({ error: 'Comment not found' });
        
        await db.run(
            `INSERT INTO reports (id, reporter_id, reported_user_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), req.user.id, comment.user_id, `Reported Comment (${req.params.commentId}) on Post (${comment.post_id})\nReason: ${reason || 'Inappropriate behavior'}`, 'pending', new Date().toISOString()]
        );
        res.json({ message: 'Report submitted' });
    } catch (err) {
        logger.error('Report comment error:', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
