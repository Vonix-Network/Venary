const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const Config = require('../config');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const logger = require('../logger');
const Mailer = require('../mail');

function safeParseJSON(val) {
    try { return JSON.parse(val); } catch { return []; }
}

// Attach donation rank info to a user object (queries unified DB directly)
async function enrichWithDonationRank(userObj) {
    try {
        const ur = await db.get(
            `SELECT ur.expires_at, r.name, r.color, r.icon FROM user_ranks ur
             LEFT JOIN donation_ranks r ON ur.rank_id = r.id
             WHERE ur.user_id = ? AND ur.active = 1
             AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
            [userObj.id, new Date().toISOString()]
        );
        if (ur) {
            userObj.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon, expires_at: ur.expires_at };
        }
    } catch { /* donations tables may not exist yet */ }
    return userObj;
}

// Register
router.post('/register', async (req, res) => {
    try {
        // Check registration is open
        if (!Config.get('registrationOpen', true)) {
            return res.status(403).json({ error: 'Registration is currently closed.' });
        }

        const { username, email, password, display_name } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email, and password are required' });
        }

        const maxUsernameLength = Config.get('maxUsernameLength', 32);
        if (username.length < 3 || username.length > maxUsernameLength) {
            return res.status(400).json({ error: `Username must be 3–${maxUsernameLength} characters` });
        }

        // Only allow alphanumeric, underscores, and hyphens
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            return res.status(400).json({ error: 'Username may only contain letters, numbers, underscores, and hyphens' });
        }

        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters and contain a letter and a number' });
        }

        // Check existing user
        const existing = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);
        const id = uuidv4();
        const now = new Date().toISOString();

        await db.run(
            `INSERT INTO users (id, username, email, password, display_name, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, username, email, hashedPassword, display_name || username, now]
        );

        const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '2h' });

        // Link any completed guest donations that used this email address
        try {
            const guestLink = require('../services/guest-link');
            await guestLink.linkByEmail(id, email);
        } catch { /* donations tables may not exist yet */ }

        res.status(201).json({
            token,
            user: { id, username, display_name: display_name || username, email }
        });
    } catch (err) {
        logger.error('Register error', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const ip = req.ip || req.socket?.remoteAddress;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
        if (!user) {
            logger.security('login_failed', { reason: 'user_not_found', username, ip });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            logger.security('login_failed', { reason: 'wrong_password', userId: user.id, username: user.username, ip });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user is banned
        let isBanned = user.banned;
        let banExpired = false;
        if (isBanned && user.banned_until && new Date(user.banned_until) < new Date()) {
            // Ban has expired, auto-unban
            await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [user.id]);
            isBanned = 0;
            banExpired = true;
        }

        // If still banned, log security event but allow login with restricted flag
        if (isBanned) {
            logger.security('login_banned_user', { userId: user.id, username: user.username, ip, banned_until: user.banned_until });
        }

        // Update last seen
        await db.run("UPDATE users SET last_seen = ?, status = ? WHERE id = ?", [new Date().toISOString(), 'online', user.id]);

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });

        logger.security('login_success', { userId: user.id, username: user.username, ip });

        const userObj = {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            gaming_tags: safeParseJSON(user.gaming_tags),
            level: user.level,
            xp: user.xp,
            role: user.role,
            status: 'online',
            banned: isBanned ? 1 : 0,
            ban_reason: isBanned ? user.ban_reason : null,
            banned_until: isBanned ? user.banned_until : null
        };
        await enrichWithDonationRank(userObj);

        res.json({ token, user: userObj });
    } catch (err) {
        logger.error('Login error', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const ip = req.ip || req.socket?.remoteAddress;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const user = await db.get('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)', [email]);

        if (!user) {
            // Return 200 regardless to prevent email enumeration
            return res.status(200).json({ success: true });
        }

        // Generate a cryptographically random token, store it in DB with 1h expiry
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes
        await db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
        await db.run(
            'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
            [token, user.id, expiresAt]
        );

        logger.security('password_reset_requested', { userId: user.id, ip });

        const resetLink = `${req.protocol}://${req.get('host')}/#/reset-password?token=${token}&id=${user.id}`;

        await Mailer.notifyPasswordReset(user.email, resetLink);
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('Forgot password error', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { id, token, newPassword } = req.body;
        const ip = req.ip || req.socket?.remoteAddress;
        if (!id || !token || !newPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must be at least 8 characters and contain a letter and a number' });
        }

        const record = await db.get(
            'SELECT * FROM password_reset_tokens WHERE token = ? AND user_id = ?',
            [token, id]
        );
        if (!record || record.expires_at < Date.now()) {
            logger.security('password_reset_invalid_token', { userId: id, ip });
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
        await db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [id]);

        logger.security('password_reset_success', { userId: id, ip });
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('Reset password error', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if ban has expired
        let isBanned = user.banned;
        if (isBanned && user.banned_until && new Date(user.banned_until) < new Date()) {
            await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [user.id]);
            isBanned = 0;
        }

        const userObj = {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            email: user.email,
            avatar: user.avatar,
            bio: user.bio,
            gaming_tags: safeParseJSON(user.gaming_tags),
            level: user.level,
            xp: user.xp,
            games_played: user.games_played,
            achievements: user.achievements,
            role: user.role,
            status: user.status,
            created_at: user.created_at,
            banned: isBanned ? 1 : 0,
            ban_reason: isBanned ? user.ban_reason : null,
            banned_until: isBanned ? user.banned_until : null
        };
        await enrichWithDonationRank(userObj);
        res.json(userObj);
    } catch (err) {
        logger.error('Get me error', { err: err.message, stack: err.stack });
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
