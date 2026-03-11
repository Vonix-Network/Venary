const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const Config = require('../config');
const { authenticateToken } = require('../middleware/auth');

function safeParseJSON(val) {
    try { return JSON.parse(val); } catch { return []; }
}

// Helper: recalculate level from XP against configured thresholds
function calcLevel(xp) {
    const thresholds = Config.get('levelThresholds', [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000]);
    let level = 1;
    for (let i = 0; i < thresholds.length; i++) {
        if (xp >= thresholds[i]) level = i + 1;
    }
    return level;
}

// Search users
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const users = await db.all(
            `SELECT id, username, display_name, avatar, bio, level, status
             FROM users
             WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?
             LIMIT 20`,
            [`%${q}%`, `%${q}%`, req.user.id]
        );

        res.json(users);
    } catch (err) {
        console.error('Search users error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user profile by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const user = await db.get(
            `SELECT id, username, display_name, avatar, bio, gaming_tags, level, xp,
                    games_played, achievements, status, created_at, last_seen, skin_animation
             FROM users WHERE id = ?`,
            [req.params.id]
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.gaming_tags = safeParseJSON(user.gaming_tags);
        user.skin_animation = safeParseJSON(user.skin_animation);

        // Check friendship status
        const friendship = await db.get(
            `SELECT * FROM friendships
             WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
            [req.user.id, req.params.id, req.params.id, req.user.id]
        );

        user.friendship_status = friendship ? friendship.status : 'none';
        user.friendship_direction = friendship ? (friendship.user_id === req.user.id ? 'sent' : 'received') : null;

        // Get post count
        const postCount = await db.get('SELECT COUNT(*) as count FROM posts WHERE user_id = ?', [req.params.id]);
        user.post_count = postCount.count;

        // Get friend count
        const friendCount = await db.get(
            `SELECT COUNT(*) as count FROM friendships
             WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'`,
            [req.params.id, req.params.id]
        );
        user.friend_count = friendCount.count;

        // Fetch Minecraft data if extension is loaded
        const extLoader = require('../extension-loader');
        const mcExt = extLoader.extensions.get('minecraft');
        user.total_xp = user.xp;
        user.minecraft_xp = 0;
        if (mcExt && mcExt.enabled && mcExt.db) {
            try {
                const link = await mcExt.db.get('SELECT minecraft_xp, minecraft_username, minecraft_uuid FROM linked_accounts WHERE user_id = ?', [user.id]);
                if (link) {
                    user.minecraft_xp = link.minecraft_xp || 0;
                    user.total_xp = user.xp + user.minecraft_xp;
                    user.minecraft_username = link.minecraft_username;
                    user.minecraft_uuid = link.minecraft_uuid;
                }
            } catch (e) { /* ignore */ }
        }

        // Fetch donation rank if extension is loaded
        const donExt = extLoader.extensions.get('donations');
        if (donExt && donExt.enabled && donExt.db) {
            try {
                const ur = await donExt.db.get(
                    `SELECT r.name, r.color, r.icon FROM user_ranks ur
                     LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                     WHERE ur.user_id = ? AND ur.active = 1`, [user.id]);
                if (ur) user.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon };
            } catch (e) { /* ignore */ }
        }

        res.json(user);
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { display_name, bio, gaming_tags, avatar, skin_animation } = req.body;
        const maxBioLength = Config.get('maxBioLength', 300);

        const updates = [];
        const values = [];

        if (display_name !== undefined) {
            if (display_name.length > 64) {
                return res.status(400).json({ error: 'Display name too long (max 64 characters)' });
            }
            updates.push('display_name = ?');
            values.push(display_name);
        }
        if (bio !== undefined) {
            if (bio.length > maxBioLength) {
                return res.status(400).json({ error: `Bio too long (max ${maxBioLength} characters)` });
            }
            updates.push('bio = ?');
            values.push(bio);
        }
        if (gaming_tags !== undefined) {
            updates.push('gaming_tags = ?');
            values.push(JSON.stringify(gaming_tags));
        }
        if (skin_animation !== undefined) {
            updates.push('skin_animation = ?');
            values.push(JSON.stringify(skin_animation));
        }
        if (avatar !== undefined) {
            updates.push('avatar = ?');
            values.push(avatar);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.user.id);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);

        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        user.gaming_tags = safeParseJSON(user.gaming_tags);
        user.skin_animation = safeParseJSON(user.skin_animation);

        res.json({
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar: user.avatar,
            bio: user.bio,
            gaming_tags: user.gaming_tags,
            level: user.level,
            xp: user.xp,
            games_played: user.games_played,
            achievements: user.achievements,
            status: user.status
        });
    } catch (err) {
        console.error('Update profile error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
