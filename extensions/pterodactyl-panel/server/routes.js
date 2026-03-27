/* =======================================
   Pterodactyl Panel Extension Ã¢â‚¬â€ API Routes
   Factory pattern: receives ext db instance.
   ======================================= */
'use strict';

const express = require('express');
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

    // Ã¢â€â‚¬Ã¢â€â‚¬ Singleton PterodactylClient instance Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        if (!cfg.base_url || !cfg.api_key) return null;
        if (!pteroClient || pteroClient.baseUrl !== cfg.base_url.replace(/\/$/, '')) {
            pteroClient = new PterodactylClient({
                baseUrl: cfg.base_url,
                apiKey: cfg.api_key,
                serverId: cfg.server_id || '',
            });
        }
        return pteroClient;
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬ Middleware Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

    // Ã¢â€â‚¬Ã¢â€â‚¬ Access endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    // GET /access/me Ã¢â‚¬â€ check own panel access (used by client nav gating)
    router.get('/access/me', authenticateToken, async (req, res) => {
        try {
            const row = await extDb.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [req.user.id]);
            res.json({ granted: !!row });
        } catch (err) {
            console.error('[Pterodactyl] access/me error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /access/users Ã¢â‚¬â€ list all users with their access state (admin+)
    router.get('/access/users', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT user_id, granted_at FROM pterodactyl_access');
            res.json(rows);
        } catch (err) {
            console.error('[Pterodactyl] access/users error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /access/:userId Ã¢â‚¬â€ grant panel access (superadmin only)
    router.post('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const { userId } = req.params;
            const user = await coreDb.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            await extDb.run(
                'INSERT INTO pterodactyl_access (user_id, granted_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING',
                [userId, new Date().toISOString()]
            );
            res.json({ granted: true, user_id: userId });
        } catch (err) {
            console.error('[Pterodactyl] Grant access error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE /access/:userId Ã¢â‚¬â€ revoke panel access (superadmin only)
    router.delete('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM pterodactyl_access WHERE user_id = ?', [req.params.userId]);
            res.json({ granted: false, user_id: req.params.userId });
        } catch (err) {
            console.error('[Pterodactyl] Revoke access error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Settings endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    // GET /servers Ã¢â‚¬â€ list servers from Pterodactyl API (admin only, uses stored credentials)
    router.get('/servers', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured. Save Base URL and API Key first.' });

            const result = await client._request('GET', '/api/client/servers');

            if (result.statusCode === 401 || result.statusCode === 403) {
                return res.status(502).json({ error: 'Pterodactyl API rejected the key. Use a Client API key (not Application key).', statusCode: result.statusCode });
            }
            if (result.statusCode !== 200) {
                const detail = (result.body && result.body.errors && result.body.errors[0] && result.body.errors[0].detail) || (result.body && result.body.message) || JSON.stringify(result.body);
                return res.status(502).json({ error: 'Pterodactyl returned HTTP ' + result.statusCode, detail: detail });
            }

            const servers = (result.body && result.body.data || []).map(function(s) { return {
                id: s.attributes && s.attributes.identifier,
                uuid: s.attributes && s.attributes.uuid,
                name: s.attributes && s.attributes.name,
                description: (s.attributes && s.attributes.description) || '',
                status: (s.attributes && s.attributes.status) || 'unknown',
            }; });

            res.json(servers);
        } catch (err) {
            console.error('[Pterodactyl] GET servers error:', err.message);
            res.status(502).json({ error: err.message || 'Failed to reach Pterodactyl API. Check the Base URL is correct and reachable.' });
        }
    });

    // GET /settings Ã¢â‚¬â€ returns base_url and server_id only (NEVER api_key)
    router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT key, value FROM pterodactyl_settings WHERE key != ?', ['api_key']);
            const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
            res.json({ base_url: settings.base_url || '', server_id: settings.server_id || '' });
        } catch (err) {
            console.error('[Pterodactyl] GET settings error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /settings Ã¢â‚¬â€ save base_url, api_key, server_id
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
        } catch (err) {
            console.error('[Pterodactyl] POST settings error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Server status endpoint Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    // GET /status Ã¢â‚¬â€ current server state
    router.get('/status', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const serverId = req.query.server;
            if (!serverId) return res.status(400).json({ error: 'server query param required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            // Temporarily override serverId for this request
            const origId = client.serverId;
            client.serverId = serverId;
            const result = await client.getServerStatus();
            client.serverId = origId;

            res.json(result);
        } catch (err) {
            console.error('[Pterodactyl] status error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Power action endpoint Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

    // POST /power Ã¢â‚¬â€ send power action
    router.post('/power', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const { action, server: serverId } = req.body;
            const VALID = ['start', 'stop', 'kill', 'restart'];
            if (!action || !VALID.includes(action)) {
                return res.status(400).json({ error: `action must be one of: ${VALID.join(', ')}` });
            }
            if (!serverId) return res.status(400).json({ error: 'server is required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const origId = client.serverId;
            client.serverId = serverId;
            const result = await client.sendPowerAction(action);
            client.serverId = origId;

            if (result.statusCode >= 400) {
                return res.status(502).json({ error: 'Pterodactyl API returned an error', detail: result.body?.errors?.[0]?.detail || '' });
            }
            res.json({ ok: true, action });
        } catch (err) {
            console.error('[Pterodactyl] power error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // Ã¢â€â‚¬Ã¢â€â‚¬ Socket.IO console namespace Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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
            const serverId = socket.handshake.query?.server;

            // Flush console history for this server
            const client = await getClient();
            if (client && serverId && client.consoleBuffer.length > 0) {
                socket.emit('history', { lines: [...client.consoleBuffer] });
            }

            // Start the Pterodactyl WS stream if not already running for this server
            if (client && serverId && !consoleStarted) {
                consoleStarted = true;
                const origId = client.serverId;
                client.serverId = serverId;
                client.connectConsole(
                    (line) => ns.emit('console:line', { line, timestamp: new Date().toISOString() }),
                    (state) => ns.emit('status:update', { state }),
                    (msg) => {
                        consoleStarted = false;
                        client.serverId = origId;
                        ns.emit('console:error', { message: msg });
                    }
                ).catch(() => { consoleStarted = false; client.serverId = origId; });
            }
        });
    }

    // Expose attach function so extension-loader or server/index.js can wire it up
    router.attachConsoleNamespace = attachConsoleNamespace;

    return router;
};
