/* =======================================
   Venary Extension: Forum — Backend Routes
   Uses its own isolated database (injected).
   Accesses core DB for user lookups.
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const coreDb = require('../../../server/db');
const { authenticateToken } = require('../../../server/middleware/auth');

/**
 * Route factory — receives the extension's isolated DB.
 * @param {Object} extDb - Extension's own database adapter
 * @returns {express.Router}
 */
module.exports = function createForumRoutes(extDb) {
    const router = express.Router();

    // Use core DB for the extension if it has no own DB (fallback)
    const db = extDb || coreDb;

    // Table names: in isolated DB they're 'categories'/'threads'/'posts'
    // (no forum_ prefix since it's a separate database)
    const T = {
        categories: 'categories',
        threads: 'threads',
        posts: 'posts'
    };

    // Helpers
    async function isModOrAdmin(userId) {
        const user = await coreDb.get('SELECT role FROM users WHERE id = ?', [userId]);
        return user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator');
    }

    // ==========================================
    // CATEGORIES
    // ==========================================

    router.get('/categories', async (req, res) => {
        try {
            const categories = await db.all(`SELECT * FROM ${T.categories} ORDER BY sort_order ASC`);

            const result = [];
            for (const cat of categories) {
                const threadCount = (await db.get(
                    `SELECT COUNT(*) as count FROM ${T.threads} WHERE category_id = ?`, [cat.id]
                )).count;

                const postCount = (await db.get(
                    `SELECT COUNT(*) as count FROM ${T.posts} fp
                     JOIN ${T.threads} ft ON fp.thread_id = ft.id
                     WHERE ft.category_id = ?`, [cat.id]
                )).count;

                const lastThread = await db.get(
                    `SELECT * FROM ${T.threads}
                     WHERE category_id = ?
                     ORDER BY last_activity DESC
                     LIMIT 1`, [cat.id]
                );

                let lastUser = null;
                if (lastThread && lastThread.last_post_user_id) {
                    lastUser = await coreDb.get(
                        'SELECT username, display_name FROM users WHERE id = ?',
                        [lastThread.last_post_user_id]
                    );
                }

                result.push({
                    id: cat.id,
                    name: cat.name,
                    description: cat.description,
                    icon: cat.icon || '💬',
                    sort_order: cat.sort_order || 0,
                    thread_count: threadCount,
                    post_count: postCount,
                    last_activity: lastThread ? lastThread.last_activity : null,
                    last_thread_title: lastThread ? lastThread.title : null,
                    last_thread_id: lastThread ? lastThread.id : null,
                    last_user: lastUser || null
                });
            }

            res.json(result);
        } catch (err) {
            console.error('Forum categories error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/categories', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const name = (req.body.name || '').trim();
            const description = (req.body.description || '').trim();
            const icon = req.body.icon || '💬';
            if (!name) return res.status(400).json({ error: 'Category name is required' });

            const sortOrder = (await db.get(`SELECT COUNT(*) as count FROM ${T.categories}`)).count;
            const id = uuidv4();
            const now = new Date().toISOString();

            await db.run(
                `INSERT INTO ${T.categories} (id, name, description, icon, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, name, description, icon, sortOrder, now]
            );

            res.status(201).json({ id, name, description, icon, sort_order: sortOrder, created_at: now });
        } catch (err) {
            console.error('Create category error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.put('/categories/:id', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Admin access required' });
            }
            const cat = await db.get(`SELECT * FROM ${T.categories} WHERE id = ?`, [req.params.id]);
            if (!cat) return res.status(404).json({ error: 'Category not found' });

            const updates = [];
            const values = [];
            if (req.body.name) { updates.push('name = ?'); values.push(req.body.name.trim()); }
            if (req.body.description !== undefined) { updates.push('description = ?'); values.push(req.body.description.trim()); }
            if (req.body.icon) { updates.push('icon = ?'); values.push(req.body.icon); }
            if (req.body.sort_order !== undefined) { updates.push('sort_order = ?'); values.push(req.body.sort_order); }

            if (updates.length > 0) {
                values.push(req.params.id);
                await db.run(`UPDATE ${T.categories} SET ${updates.join(', ')} WHERE id = ?`, values);
            }

            const updated = await db.get(`SELECT * FROM ${T.categories} WHERE id = ?`, [req.params.id]);
            res.json(updated);
        } catch (err) {
            console.error('Update category error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.delete('/categories/:id', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Admin access required' });
            }
            const cat = await db.get(`SELECT * FROM ${T.categories} WHERE id = ?`, [req.params.id]);
            if (!cat) return res.status(404).json({ error: 'Category not found' });

            await db.run(
                `DELETE FROM ${T.posts} WHERE thread_id IN (SELECT id FROM ${T.threads} WHERE category_id = ?)`,
                [req.params.id]
            );
            await db.run(`DELETE FROM ${T.threads} WHERE category_id = ?`, [req.params.id]);
            await db.run(`DELETE FROM ${T.categories} WHERE id = ?`, [req.params.id]);

            res.json({ message: 'Category deleted' });
        } catch (err) {
            console.error('Delete category error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ==========================================
    // THREADS
    // ==========================================

    router.get('/categories/:id/threads', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 25;
            const offset = (page - 1) * limit;

            const total = (await db.get(
                `SELECT COUNT(*) as count FROM ${T.threads} WHERE category_id = ?`, [req.params.id]
            )).count;

            const threads = await db.all(
                `SELECT ft.*,
                    (SELECT COUNT(*) FROM ${T.posts} WHERE thread_id = ft.id) as post_count
                 FROM ${T.threads} ft
                 WHERE ft.category_id = ?
                 ORDER BY ft.pinned DESC, ft.last_activity DESC
                 LIMIT ? OFFSET ?`,
                [req.params.id, limit, offset]
            );

            // Enrich with user info from core DB
            const enriched = [];
            for (const t of threads) {
                const author = await coreDb.get(
                    'SELECT username, display_name, level FROM users WHERE id = ?', [t.user_id]
                );
                let lastPostUser = null;
                if (t.last_post_user_id) {
                    lastPostUser = await coreDb.get(
                        'SELECT display_name, username FROM users WHERE id = ?', [t.last_post_user_id]
                    );
                }
                enriched.push({
                    id: t.id,
                    title: t.title,
                    pinned: !!t.pinned,
                    locked: !!t.locked,
                    user_id: t.user_id,
                    username: author ? author.username : null,
                    display_name: author ? author.display_name : null,
                    level: author ? (author.level || 1) : 1,
                    post_count: t.post_count,
                    view_count: t.view_count || 0,
                    created_at: t.created_at,
                    last_activity: t.last_activity,
                    last_post_user: lastPostUser ? (lastPostUser.display_name || lastPostUser.username) : null
                });
            }

            res.json({ threads: enriched, total, page, pages: Math.ceil(total / limit) });
        } catch (err) {
            console.error('List threads error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/categories/:id/threads', authenticateToken, async (req, res) => {
        try {
            const cat = await db.get(`SELECT * FROM ${T.categories} WHERE id = ?`, [req.params.id]);
            if (!cat) return res.status(404).json({ error: 'Category not found' });

            const title = (req.body.title || '').trim();
            const content = (req.body.content || '').trim();
            const media = req.body.media || null;
            if (!title || title.length < 3) return res.status(400).json({ error: 'Title must be at least 3 characters' });
            if (!content || content.length < 10) return res.status(400).json({ error: 'Content must be at least 10 characters' });

            const now = new Date().toISOString();
            const threadId = uuidv4();
            const postId = uuidv4();

            await db.run(
                `INSERT INTO ${T.threads} (id, category_id, title, user_id, pinned, locked, view_count, last_activity, last_post_user_id, created_at, media)
                 VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
                [threadId, req.params.id, title, req.user.id, now, req.user.id, now, media]
            );

            await db.run(
                `INSERT INTO ${T.posts} (id, thread_id, user_id, content, is_op, created_at, media)
                 VALUES (?, ?, ?, ?, 1, ?, ?)`,
                [postId, threadId, req.user.id, content, now, media]
            );

            // XP reward via core DB
            await coreDb.run('UPDATE users SET xp = xp + 15 WHERE id = ?', [req.user.id]);

            const author = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [req.user.id]);
            res.status(201).json({
                thread: { id: threadId, category_id: req.params.id, title, user_id: req.user.id, created_at: now, media },
                post: { id: postId, thread_id: threadId, content, is_op: true, created_at: now, media },
                username: author ? author.username : null,
                display_name: author ? author.display_name : null
            });
        } catch (err) {
            console.error('Create thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/threads/:id', async (req, res) => {
        try {
            const thread = await db.get(`SELECT * FROM ${T.threads} WHERE id = ?`, [req.params.id]);
            if (!thread) return res.status(404).json({ error: 'Thread not found' });

            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const offset = (page - 1) * limit;

            await db.run(`UPDATE ${T.threads} SET view_count = view_count + 1 WHERE id = ?`, [thread.id]);
            thread.view_count = (thread.view_count || 0) + 1;

            const total = (await db.get(
                `SELECT COUNT(*) as count FROM ${T.posts} WHERE thread_id = ?`, [thread.id]
            )).count;

            const posts = await db.all(
                `SELECT * FROM ${T.posts}
                 WHERE thread_id = ?
                 ORDER BY created_at ASC
                 LIMIT ? OFFSET ?`,
                [thread.id, limit, offset]
            );

            // Enrich posts with user info from core DB
            const enrichedPosts = [];
            for (const p of posts) {
                const user = await coreDb.get(
                    'SELECT username, display_name, avatar, level, role FROM users WHERE id = ?', [p.user_id]
                );
                enrichedPosts.push({
                    id: p.id,
                    content: p.content,
                    media: p.media,
                    is_op: !!p.is_op,
                    user_id: p.user_id,
                    username: user ? user.username : null,
                    display_name: user ? user.display_name : null,
                    avatar: user ? user.avatar : null,
                    level: user ? (user.level || 1) : 1,
                    role: user ? (user.role || 'user') : 'user',
                    created_at: p.created_at,
                    edited_at: p.edited_at || null
                });
            }

            const category = await db.get(`SELECT name FROM ${T.categories} WHERE id = ?`, [thread.category_id]);
            const author = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [thread.user_id]);

            res.json({
                thread: {
                    id: thread.id,
                    title: thread.title,
                    pinned: !!thread.pinned,
                    locked: !!thread.locked,
                    view_count: thread.view_count,
                    user_id: thread.user_id,
                    username: author ? author.username : null,
                    display_name: author ? author.display_name : null,
                    created_at: thread.created_at,
                    category_id: thread.category_id,
                    category_name: category ? category.name : 'Unknown',
                    media: thread.media
                },
                posts: enrichedPosts,
                total,
                page,
                pages: Math.ceil(total / limit)
            });
        } catch (err) {
            console.error('Get thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/threads/:id/posts', authenticateToken, async (req, res) => {
        try {
            const thread = await db.get(`SELECT * FROM ${T.threads} WHERE id = ?`, [req.params.id]);
            if (!thread) return res.status(404).json({ error: 'Thread not found' });
            if (thread.locked && !(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'This thread is locked' });
            }

            const content = (req.body.content || '').trim();
            const media = req.body.media || null;
            if (!content || content.length < 2) return res.status(400).json({ error: 'Reply must be at least 2 characters' });

            const now = new Date().toISOString();
            const postId = uuidv4();

            await db.run(
                `INSERT INTO ${T.posts} (id, thread_id, user_id, content, is_op, created_at, media)
                 VALUES (?, ?, ?, ?, 0, ?, ?)`,
                [postId, thread.id, req.user.id, content, now, media]
            );

            await db.run(
                `UPDATE ${T.threads} SET last_activity = ?, last_post_user_id = ? WHERE id = ?`,
                [now, req.user.id, thread.id]
            );

            await coreDb.run('UPDATE users SET xp = xp + 5 WHERE id = ?', [req.user.id]);

            const author = await coreDb.get('SELECT username, display_name, level, role FROM users WHERE id = ?', [req.user.id]);
            res.status(201).json({
                id: postId,
                content,
                media,
                is_op: false,
                user_id: req.user.id,
                username: author ? author.username : null,
                display_name: author ? author.display_name : null,
                level: author ? (author.level || 1) : 1,
                role: author ? (author.role || 'user') : 'user',
                created_at: now
            });
        } catch (err) {
            console.error('Reply to thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Pin/Unpin
    router.put('/threads/:id/pin', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) return res.status(403).json({ error: 'Moderator access required' });
            const thread = await db.get(`SELECT * FROM ${T.threads} WHERE id = ?`, [req.params.id]);
            if (!thread) return res.status(404).json({ error: 'Thread not found' });
            const newPinned = thread.pinned ? 0 : 1;
            await db.run(`UPDATE ${T.threads} SET pinned = ? WHERE id = ?`, [newPinned, req.params.id]);
            res.json({ pinned: !!newPinned });
        } catch (err) {
            console.error('Pin thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Lock/Unlock
    router.put('/threads/:id/lock', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) return res.status(403).json({ error: 'Moderator access required' });
            const thread = await db.get(`SELECT * FROM ${T.threads} WHERE id = ?`, [req.params.id]);
            if (!thread) return res.status(404).json({ error: 'Thread not found' });
            const newLocked = thread.locked ? 0 : 1;
            await db.run(`UPDATE ${T.threads} SET locked = ? WHERE id = ?`, [newLocked, req.params.id]);
            res.json({ locked: !!newLocked });
        } catch (err) {
            console.error('Lock thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Delete thread
    router.delete('/threads/:id', authenticateToken, async (req, res) => {
        try {
            const thread = await db.get(`SELECT * FROM ${T.threads} WHERE id = ?`, [req.params.id]);
            if (!thread) return res.status(404).json({ error: 'Thread not found' });
            if (thread.user_id !== req.user.id && !(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            await db.run(`DELETE FROM ${T.posts} WHERE thread_id = ?`, [thread.id]);
            await db.run(`DELETE FROM ${T.threads} WHERE id = ?`, [thread.id]);
            res.json({ message: 'Thread deleted' });
        } catch (err) {
            console.error('Delete thread error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Delete post
    router.delete('/posts/:id', authenticateToken, async (req, res) => {
        try {
            const post = await db.get(`SELECT * FROM ${T.posts} WHERE id = ?`, [req.params.id]);
            if (!post) return res.status(404).json({ error: 'Post not found' });
            if (post.user_id !== req.user.id && !(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            if (post.is_op) return res.status(400).json({ error: 'Cannot delete the original post. Delete the thread instead.' });
            await db.run(`DELETE FROM ${T.posts} WHERE id = ?`, [req.params.id]);
            res.json({ message: 'Post deleted' });
        } catch (err) {
            console.error('Delete post error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Edit post
    router.put('/posts/:id', authenticateToken, async (req, res) => {
        try {
            const post = await db.get(`SELECT * FROM ${T.posts} WHERE id = ?`, [req.params.id]);
            if (!post) return res.status(404).json({ error: 'Post not found' });
            if (post.user_id !== req.user.id && !(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            const content = (req.body.content || '').trim();
            if (!content || content.length < 2) return res.status(400).json({ error: 'Content too short' });
            const now = new Date().toISOString();
            await db.run(`UPDATE ${T.posts} SET content = ?, edited_at = ? WHERE id = ?`, [content, now, req.params.id]);
            const updated = await db.get(`SELECT * FROM ${T.posts} WHERE id = ?`, [req.params.id]);
            res.json(updated);
        } catch (err) {
            console.error('Edit post error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Moderation: Get recent threads
    router.get('/mod/threads', authenticateToken, async (req, res) => {
        try {
            if (!(await isModOrAdmin(req.user.id))) {
                return res.status(403).json({ error: 'Moderator access required' });
            }

            const threads = await db.all(
                `SELECT ft.*,
                    (SELECT COUNT(*) FROM posts WHERE thread_id = ft.id) as post_count
                 FROM threads ft
                 ORDER BY ft.created_at DESC
                 LIMIT 50`
            );

            // Enrich with user info
            const enriched = [];
            for (const t of threads) {
                const author = await coreDb.get(
                    'SELECT username, display_name FROM users WHERE id = ?', [t.user_id]
                );
                enriched.push({
                    id: t.id,
                    title: t.title,
                    pinned: !!t.pinned,
                    locked: !!t.locked,
                    user_id: t.user_id,
                    username: author ? (author.display_name || author.username) : 'Unknown',
                    created_at: t.created_at,
                    category_id: t.category_id
                });
            }

            res.json(enriched);
        } catch (err) {
            console.error('Get mod threads error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
};
