const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in your environment before starting Venary.');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}

function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
            req.user = decoded;
        } catch (err) {
            // Token invalid, continue without user
        }
    }
    next();
}

// Middleware to require non-banned users (blocks banned users from most routes)
async function requireNonBanned(req, res, next) {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const user = await db.get('SELECT banned, banned_until FROM users WHERE id = ?', [req.user.id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if ban expired
        let isBanned = user.banned;
        if (isBanned && user.banned_until && new Date(user.banned_until) < new Date()) {
            await db.run('UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?', [req.user.id]);
            isBanned = 0;
        }

        if (isBanned) {
            return res.status(403).json({ error: 'Your account is banned. Please use the appeal system.' });
        }

        next();
    } catch (err) {
        return res.status(500).json({ error: 'Server error checking ban status' });
    }
}

// Middleware to allow only admin/moderator roles.
// Performs its own DB lookup so it can be used standalone on any route
// that already has authenticateToken applied.
async function requireAdmin(req, res, next) {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    try {
        const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!user || !['admin', 'superadmin', 'moderator'].includes(user.role)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.userRole = user.role;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Server error' });
    }
}

module.exports = { authenticateToken, optionalAuth, requireNonBanned, requireAdmin, JWT_SECRET };
