/* =======================================
   Pterodactyl Panel Extension — API Routes
   Factory pattern: receives ext db instance.
   ======================================= */
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const PterodactylClient = require('./pterodactyl-client');

/**
 * @param {object} extDb - Extension's isolated database instance
 * @returns {express.Router}
 */
module.exports = function (extDb) {
    const router = express.Router();
    const coreDb = require('../../../server/db');
    const { authenticateToken, JWT_SECRET } = require('../../../server/middleware/auth');
    const jwt = require('jsonwebtoken');

    // ── Singleton PterodactylClient instance ─────────────────────────────────
    /** @type {PterodactylClient|null} */
    let pteroClient = null;
    let consoleStarted = false;

    /**
     * Load settings from DB and (re)create the PterodactylClient.
     * Returns null if settings are incomplete.
     * @returns {Promise<PterodactylClient|null>}
     */
    async function getClient() {
        const rows = await extDb.all('SELECT key, value FROM pterodactyl_settings');
        const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
        if (!cfg.base_url || !cfg.api_key || !cfg.server_id) return null;
        if (!pteroClient ||
            pteroClient.baseUrl !== cfg.base_url.replace(/\/$/, '') ||
            pteroClient.serverId !== cfg.server_id) {
            pteroClient = new PterodactylClient({
                baseUrl: cfg.base_url,
                apiKey: cfg.api_key,
                serverId: cfg.server_id,
            });
        }
        return pteroClient;
    }

    // ── Middleware ────────────────────────────────────────────────────────────

    /**
     * Accepts admin, superadmin, moderator roles.
     */
    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id])
            .then(u => {
                if (!u || !['admin', 'superadmin', 'moderator'].includes(u.role)) {
                    return res.status(403).json({ error: 'Admin access required' });
                }
                req.userRole = u.role;
                next();
            })
            .catch(() => res.status(500).json({ error: 'Server error' }));
    }

    /**
     * Only superadmin may toggle Panel_Access.
     */
    function requireSuperadmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id])
            .then(u => {
                if (!u || u.role !== 'superadmin') {
                    return res.status(403).json({ error: 'Superadmin access required' });
                }
                next();
            })
            .catch(() => res.status(500).json({ error: 'Server error' }));
    }

    /**
     * Checks pterodactyl_access table for the requesting user.
     */
    function requirePanelAccess(req, res, next) {
        extDb.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [req.user.id])
            .then(row => {
                if (!row) return res.status(403).json({ error: 'Panel access denied' });
                next();
            })
            .catch(() => res.status(500).json({ error: 'Server error' }));
    }

    // ── Access endpoints ──────────────────────────────────────────────────────

    // GET /access/me — check own panel access (used by client nav gating)
    router.get('/access/me', authenticateToken, async (req, res) => {
        try {
            const row = await extDb.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [req.user.id]);
            res.json({ granted: !!row });
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /access/users — list all users with their access state (admin+)
    router.get('/access/users', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT user_id, granted_at FROM pterodactyl_access');
            res.json(rows);
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /access/:userId — grant panel access (superadmin only)
    router.post('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const { userId } = req.params;
            const user = await coreDb.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            await extDb.run(
                'INSERT OR IGNORE INTO pterodactyl_access (user_id, granted_at) VALUES (?, ?)',
                [userId, new Date().toISOString()]
            );
            res.json({ granted: true, user_id: userId });
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE /access/:userId — revoke panel access (superadmin only)
    router.delete('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM pterodactyl_access WHERE user_id = ?', [req.params.userId]);
            res.json({ granted: false, user_id: req.params.userId });
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ── Settings endpoints ────────────────────────────────────────────────────

    // GET /settings — returns base_url and server_id only (NEVER api_key)
    router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT key, value FROM pterodactyl_settings WHERE key != ?', ['api_key']);
            const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
            res.json({ base_url: settings.base_url || '', server_id: settings.server_id || '' });
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /settings — save base_url, api_key, server_id
    router.post('/settings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { base_url, api_key, server_id } = req.body;
            if (!base_url || !base_url.trim()) return res.status(400).json({ error: 'base_url is required' });
            if (!server_id || !server_id.trim()) return res.status(400).json({ error: 'server_id is required' });

            // Upsert base_url and server_id always
            await extDb.run(
                'INSERT INTO pterodactyl_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                ['base_url', base_url.trim()]
            );
            await extDb.run(
                'INSERT INTO pterodactyl_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                ['server_id', server_id.trim()]
            );

            // Only update api_key if a new value was provided
            if (api_key && api_key.trim()) {
                await extDb.run(
                    'INSERT INTO pterodactyl_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
                    ['api_key', api_key.trim()]
                );
                // Invalidate cached client so it picks up new key
                pteroClient = null;
                consoleStarted = false;
            }

            // Response MUST NOT include api_key
            res.json({ ok: true, base_url: base_url.trim(), server_id: server_id.trim() });
        } catch {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ── Server status endpoint ────────────────────────────────────────────────

    // GET /status — current server state
    router.get('/status', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const result = await client.getServerStatus();
            res.json(result);
        } catch (err) {
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // ── Power action endpoint ─────────────────────────────────────────────────

    // POST /power — send power action
    router.post('/power', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const { action } = req.body;
            const VALID = ['start', 'stop', 'kill', 'restart'];
            if (!action || !VALID.includes(action)) {
                return res.status(400).json({ error: `action must be one of: ${VALID.join(', ')}` });
            }

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const result = await client.sendPowerAction(action);
            if (result.statusCode >= 400) {
                return res.status(502).json({ error: 'Pterodactyl API returned an error', detail: result.body?.errors?.[0]?.detail || '' });
            }
            res.json({ ok: true, action });
        } catch (err) {
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // ── Socket.IO console namespace ───────────────────────────────────────────

    /**
     * Attach the /pterodactyl-console Socket.IO namespace.
     * Called once when the extension is loaded.
     * @param {import('socket.io').Server} io
     */
    function attachConsoleNamespace(io) {
        const ns = io.of('/pterodactyl-console');

        // Auth + access guard on every socket connection
        ns.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth?.token || socket.handshake.query?.token;
                if (!token) return next(new Error('Authentication required'));

                let decoded;
                try {
                    decoded = jwt.verify(token, JWT_SECRET);
                } catch {
                    return next(new Error('Invalid token'));
                }

                const row = await extDb.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [decoded.id]);
                if (!row) return next(new Error('Panel access denied'));

                socket.user = decoded;
                next();
            } catch {
                next(new Error('Server error'));
            }
        });

        ns.on('connection', async (socket) => {
            // Flush console history to newly connected client
            const client = await getClient();
            if (client && client.consoleBuffer.length > 0) {
                socket.emit('history', { lines: [...client.consoleBuffer] });
            }

            // Start the Pterodactyl WS stream if not already running
            if (client && !consoleStarted) {
                consoleStarted = true;
                client.connectConsole(
                    (line) => ns.emit('console:line', { line, timestamp: new Date().toISOString() }),
                    (state) => ns.emit('status:update', { state }),
                    (msg) => {
                        consoleStarted = false;
                        ns.emit('console:error', { message: msg });
                    }
                ).catch(() => { consoleStarted = false; });
            }
        });
    }

    // Expose attach function so extension-loader or server/index.js can wire it up
    router.attachConsoleNamespace = attachConsoleNamespace;

    return router;
};
