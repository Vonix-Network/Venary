const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const Config = require('../config');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const extensionLoader = require('../extension-loader');
const Mailer = require('../mail');

function safeParseJSON(val) {
    try { return JSON.parse(val); } catch { return []; }
}

// Attach donation rank info to a user object (if donations extension is loaded)
async function enrichWithDonationRank(userObj) {
    try {
        const donationsDb = extensionLoader.getExtensionDb('donations');
        if (!donationsDb) return userObj;
        const ur = await donationsDb.get(
            `SELECT ur.expires_at, r.name, r.color, r.icon FROM user_ranks ur
             LEFT JOIN donation_ranks r ON ur.rank_id = r.id
             WHERE ur.user_id = ? AND ur.active = 1`, [userObj.id]);
        if (ur) {
            userObj.donation_rank = { name: ur.name, color: ur.color, icon: ur.icon, expires_at: ur.expires_at };
        }
    } catch { /* extension not loaded */ }
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

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
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

        const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' });

        // Link any completed guest donations that used this email address
        try {
            const extLoader = require('../extension-loader');
            const extDb = extLoader.getExtensionDb('donations');
            if (extDb) {
                const guestLink = require('../../extensions/donations/server/guest-link');
                await guestLink.linkByEmail(id, email, extDb);
            }
        } catch { /* donations extension may not be active */ }

        res.status(201).json({
            token,
            user: { id, username, display_name: display_name || username, email }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check if user is banned
        if (user.banned) {
            // Check if suspension has expired
            if (user.banned_until && new Date(user.banned_until) < new Date()) {
                await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [user.id]);
                user.banned = 0;
            } else {
                let msg = 'Your account has been banned.';
                if (user.banned_until) {
                    const expiry = new Date(user.banned_until).toLocaleString();
                    msg = `Your account is suspended until ${expiry}.`;
                }
                if (user.ban_reason) msg += ` Reason: ${user.ban_reason}`;
                return res.status(403).json({ error: msg });
            }
        }

        // Update last seen
        await db.run("UPDATE users SET last_seen = ?, status = ? WHERE id = ?", [new Date().toISOString(), 'online', user.id]);

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

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
            status: 'online'
        };
        await enrichWithDonationRank(userObj);

        res.json({ token, user: userObj });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Try both exact DB dialects (NOCASE is SQLite, ILIKE is Postgres, but we can do exact match or lower logic)
        // Venary seems to use straight SELECT queries, so let's stick to standard parameter
        const users = await db.all('SELECT * FROM users');
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        
        if (!user) {
            // Send 200 to prevent email enumeration
            return res.status(200).json({ success: true });
        }

        // Generate a token tied to the user's password hash so it invalidates on reset
        const secret = JWT_SECRET + user.password;
        const token = jwt.sign({ id: user.id }, secret, { expiresIn: '1h' });

        const resetLink = `${req.protocol}://${req.get('host')}/#/reset-password?token=${token}&id=${user.id}`;

        await Mailer.notifyPasswordReset(user.email, resetLink);
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { id, token, newPassword } = req.body;
        if (!id || !token || !newPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
        if (!user) {
            return res.status(400).json({ error: 'Invalid reset link' });
        }

        const secret = JWT_SECRET + user.password;
        try {
            jwt.verify(token, secret);
        } catch (err) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        await db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Reset password error:', err);
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
            created_at: user.created_at
        };
        await enrichWithDonationRank(userObj);
        res.json(userObj);
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
