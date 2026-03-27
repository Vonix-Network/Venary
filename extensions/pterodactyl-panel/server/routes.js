/* =======================================
   Pterodactyl Panel Extension - API Routes
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

    /** @type {PterodactylClient|null} */
    let pteroClient = null;

    /**
     * Load settings from DB and (re)create the PterodactylClient.
     * Returns null if base_url or api_key are not yet configured.
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
                serverId: '',
            });
        }
        return pteroClient;
    }

    // ── Middleware ────────────────────────────────────────────────────────────

    /** Accepts admin, superadmin, moderator roles. */
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

    /** Only superadmin may toggle Panel_Access. */
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

    /** Checks pterodactyl_access table for the requesting user. */
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
        } catch (err) {
            console.error('[Pterodactyl] access/me error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /access/users — list all users with panel access (admin+)
    router.get('/access/users', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT user_id, granted_at FROM pterodactyl_access');
            res.json(rows);
        } catch (err) {
            console.error('[Pterodactyl] access/users error:', err.message);
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
                'INSERT INTO pterodactyl_access (user_id, granted_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING',
                [userId, new Date().toISOString()]
            );
            res.json({ granted: true, user_id: userId });
        } catch (err) {
            console.error('[Pterodactyl] Grant access error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE /access/:userId — revoke panel access (superadmin only)
    router.delete('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM pterodactyl_access WHERE user_id = ?', [req.params.userId]);
            res.json({ granted: false, user_id: req.params.userId });
        } catch (err) {
            console.error('[Pterodactyl] Revoke access error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ── Server list ───────────────────────────────────────────────────────────

    // GET /servers — list all servers for the API key owner
    // Pterodactyl API: GET /api/client
    router.get('/servers', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured. Save Base URL and API Key first.' });

            const result = await client._request('GET', '/api/client');
            if (result.statusCode === 401 || result.statusCode === 403) {
                return res.status(502).json({ error: 'Pterodactyl API rejected the key. Use a Client API key (not Application key).', statusCode: result.statusCode });
            }
            if (result.statusCode !== 200) {
                const detail = (result.body && result.body.errors && result.body.errors[0] && result.body.errors[0].detail) || (result.body && result.body.message) || JSON.stringify(result.body);
                return res.status(502).json({ error: 'Pterodactyl returned HTTP ' + result.statusCode, detail, hint: 'Base URL should be https://panel.example.com with no trailing path' });
            }

            const servers = (result.body.data || []).map(s => ({
                id: s.attributes.identifier,
                uuid: s.attributes.uuid,
                name: s.attributes.name,
                description: s.attributes.description || '',
                node: s.attributes.node || '',
            }));
            res.json(servers);
        } catch (err) {
            console.error('[Pterodactyl] GET servers error:', err.message);
            res.status(502).json({ error: err.message || 'Failed to reach Pterodactyl API. Check the Base URL.' });
        }
    });

    // GET /server-info?server={id} — static server details: IP, node, limits
    // Pterodactyl API: GET /api/client/servers/{server}
    router.get('/server-info', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const serverId = req.query.server;
            if (!serverId) return res.status(400).json({ error: 'server query param required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const result = await client._request('GET', '/api/client/servers/' + serverId);
            if (result.statusCode !== 200) return res.status(502).json({ error: 'Failed to fetch server info' });

            const a = result.body.attributes || {};
            const alloc = a.relationships && a.relationships.allocations && a.relationships.allocations.data && a.relationships.allocations.data[0];
            const allocAttr = alloc && alloc.attributes;

            res.json({
                name: a.name || '',
                description: a.description || '',
                node: a.node || '',
                ip: allocAttr ? (allocAttr.ip_alias || allocAttr.ip || '') : '',
                port: allocAttr ? allocAttr.port : null,
                limits: {
                    memory: a.limits && a.limits.memory,   // MB
                    cpu: a.limits && a.limits.cpu,         // %
                    disk: a.limits && a.limits.disk,       // MB
                },
                is_suspended: !!a.is_suspended,
                is_installing: !!a.is_installing,
            });
        } catch (err) {
            console.error('[Pterodactyl] server-info error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // GET /resources?server={id} — live resource snapshot (REST fallback)
    // Pterodactyl API: GET /api/client/servers/{server}/resources
    router.get('/resources', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const serverId = req.query.server;
            if (!serverId) return res.status(400).json({ error: 'server query param required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const result = await client._request('GET', '/api/client/servers/' + serverId + '/resources');
            if (result.statusCode !== 200) return res.status(502).json({ error: 'Failed to fetch resources' });

            const a = result.body.attributes || {};
            res.json({
                state: a.current_state || 'offline',
                resources: a.resources || {},
            });
        } catch (err) {
            console.error('[Pterodactyl] resources error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // ── Settings endpoints ────────────────────────────────────────────────────

    // GET /settings — returns base_url only (NEVER api_key)
    router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const rows = await extDb.all("SELECT key, value FROM pterodactyl_settings WHERE key != 'api_key'");
            const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
            res.json({ base_url: settings.base_url || '' });
        } catch (err) {
            console.error('[Pterodactyl] GET settings error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /settings — save base_url and optionally api_key
    router.post('/settings', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { base_url, api_key } = req.body;
            if (!base_url || !base_url.trim()) {
                return res.status(400).json({ error: 'base_url is required' });
            }

            await extDb.run(
                "INSERT INTO pterodactyl_settings (key, value) VALUES ('base_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [base_url.trim()]
            );

            if (api_key && api_key.trim()) {
                await extDb.run(
                    "INSERT INTO pterodactyl_settings (key, value) VALUES ('api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    [api_key.trim()]
                );
                pteroClient = null;
                // Clear all active console streams so they reconnect with new credentials
                consoleStreams.clear();
            }

            // Also store a placeholder server_id so the old validation doesn't break
            await extDb.run(
                "INSERT INTO pterodactyl_settings (key, value) VALUES ('server_id', '_dynamic') ON CONFLICT(key) DO NOTHING"
            );

            res.json({ ok: true, base_url: base_url.trim() });
        } catch (err) {
            console.error('[Pterodactyl] POST settings error:', err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ── Server status ─────────────────────────────────────────────────────────

    // GET /status?server={identifier} — current server state + resources
    // Pterodactyl API: GET /api/client/servers/{server}/resources
    router.get('/status', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const serverId = req.query.server;
            if (!serverId) return res.status(400).json({ error: 'server query param required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            client.serverId = serverId;
            const result = await client.getServerStatus();
            res.json(result);
        } catch (err) {
            console.error('[Pterodactyl] status error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // ── Power action ──────────────────────────────────────────────────────────

    // POST /command — send a console command to a server
    // Pterodactyl API: POST /api/client/servers/{server}/command  { command }
    // Returns 204 No Content on success.
    router.post('/command', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const { command, server: serverId } = req.body;
            if (!command || !command.trim()) return res.status(400).json({ error: 'command is required' });
            if (!serverId) return res.status(400).json({ error: 'server is required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            const result = await client._request('POST', '/api/client/servers/' + serverId + '/command', { command: command.trim() });

            if (result.statusCode === 204 || result.statusCode === 200) {
                return res.json({ ok: true });
            }
            const detail = (result.body && result.body.errors && result.body.errors[0] && result.body.errors[0].detail) || '';
            res.status(502).json({ error: 'Pterodactyl API returned an error', detail });
        } catch (err) {
            console.error('[Pterodactyl] command error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // POST /power — send power signal to a server
    // Pterodactyl API: POST /api/client/servers/{server}/power  { signal: start|stop|kill|restart }
    // Returns 204 No Content on success.
    router.post('/power', authenticateToken, requirePanelAccess, async (req, res) => {
        try {
            const { action, server: serverId } = req.body;
            const VALID = ['start', 'stop', 'kill', 'restart'];
            if (!action || !VALID.includes(action)) {
                return res.status(400).json({ error: 'action must be one of: ' + VALID.join(', ') });
            }
            if (!serverId) return res.status(400).json({ error: 'server is required' });

            const client = await getClient();
            if (!client) return res.status(503).json({ error: 'Extension not configured' });

            client.serverId = serverId;
            const result = await client.sendPowerAction(action);

            // 204 = success (no body), 400 = conflict (e.g. already running), 4xx/5xx = error
            if (result.statusCode === 204 || result.statusCode === 200) {
                return res.json({ ok: true, action });
            }
            const detail = (result.body && result.body.errors && result.body.errors[0] && result.body.errors[0].detail) || '';
            res.status(502).json({ error: 'Pterodactyl API returned an error', detail });
        } catch (err) {
            console.error('[Pterodactyl] power error:', err.message);
            res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
        }
    });

    // ── Socket.IO console namespace ───────────────────────────────────────────

    /**
     * Per-server console stream manager.
     * Maintains one Pterodactyl WS connection per server identifier,
     * proxies output to all connected Socket.IO clients in that server's room.
     */
    const consoleStreams = new Map(); // serverId -> { client, started, buffer[] }

    /**
     * Get or create a console stream for a server.
     * @param {string} serverId
     * @param {import('socket.io').Namespace} ns
     */
    async function ensureConsoleStream(serverId, ns) {
        if (consoleStreams.has(serverId)) return;

        const rows = await extDb.all('SELECT key, value FROM pterodactyl_settings');
        const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
        if (!cfg.base_url || !cfg.api_key) {
            console.error('[Pterodactyl] Cannot start stream: settings not configured');
            return;
        }

        const streamClient = new PterodactylClient({
            baseUrl: cfg.base_url,
            apiKey: cfg.api_key,
            serverId,
        });

        const stream = { client: streamClient, buffer: [] };
        consoleStreams.set(serverId, stream);

        console.log('[Pterodactyl] Starting console stream for server:', serverId);

        streamClient.connectConsole(
            (line) => {
                stream.buffer.push(line);
                if (stream.buffer.length > 500) stream.buffer.shift();
                ns.to('server:' + serverId).emit('console:line', { line, timestamp: new Date().toISOString() });
            },
            (state) => {
                ns.to('server:' + serverId).emit('status:update', { state });
            },
            (msg) => {
                console.error('[Pterodactyl] Console stream error for', serverId, ':', msg);
                if (stream._statsPoll) { clearInterval(stream._statsPoll); stream._statsPoll = null; }
                if (stream._playerPoll) { clearInterval(stream._playerPoll); stream._playerPoll = null; }
                consoleStreams.delete(serverId);
                ns.to('server:' + serverId).emit('console:error', { message: msg });
            },
            (stats) => {
                ns.to('server:' + serverId).emit('stats:update', stats);
            }
        ).catch((err) => {
            console.error('[Pterodactyl] connectConsole threw for', serverId, ':', err.message);
            if (stream._statsPoll) { clearInterval(stream._statsPoll); stream._statsPoll = null; }
            if (stream._playerPoll) { clearInterval(stream._playerPoll); stream._playerPoll = null; }
            consoleStreams.delete(serverId);
        });

        // Poll REST /resources every 3s as the primary stats source.
        // Pterodactyl's WS 'stats' event is unreliable without a daemon subscription.
        stream._statsPoll = setInterval(async () => {
            try {
                const result = await streamClient._request('GET', '/api/client/servers/' + serverId + '/resources');
                if (result.statusCode !== 200) return;
                const attrs = result.body && result.body.attributes;
                if (!attrs) return;
                const state = attrs.current_state;
                if (state) ns.to('server:' + serverId).emit('status:update', { state });
                if (attrs.resources) ns.to('server:' + serverId).emit('stats:update', attrs.resources);
            } catch { /* ignore — WS error handler will clean up */ }
        }, 3000);

        // Poll player count every 15s using the server's allocation IP/port.
        // Uses the Minecraft pinger if available — no console pollution.
        stream._playerPoll = setInterval(async () => {
            try {
                // Get server allocation to find IP:port
                const infoResult = await streamClient._request('GET', '/api/client/servers/' + serverId);
                if (infoResult.statusCode !== 200) return;
                const a = infoResult.body && infoResult.body.attributes;
                if (!a) return;
                const alloc = a.relationships && a.relationships.allocations &&
                    a.relationships.allocations.data && a.relationships.allocations.data[0];
                if (!alloc) return;
                const ip = alloc.attributes.ip_alias || alloc.attributes.ip;
                const port = alloc.attributes.port;
                if (!ip || !port) return;

                // Use Minecraft pinger if available
                try {
                    const { smartPing } = require('../../minecraft/server/pinger');
                    const ping = await smartPing(ip, port, false);
                    if (ping && ping.players) {
                        ns.to('server:' + serverId).emit('players:update', {
                            online: ping.players.online || 0,
                            max: ping.players.max || 0,
                        });
                    }
                } catch { /* pinger not available or not a MC server — skip */ }
            } catch { /* ignore */ }
        }, 15000);
    }

    /**
     * Attach the /pterodactyl-console Socket.IO namespace.
     * Called once by the extension loader after mounting routes.
     * @param {import('socket.io').Server} io
     */
    function attachConsoleNamespace(io) {
        const ns = io.of('/pterodactyl-console');

        // Auth + panel access guard on every socket connection
        ns.use(async (socket, next) => {
            try {
                const token = (socket.handshake.auth && socket.handshake.auth.token)
                    || (socket.handshake.query && socket.handshake.query.token);
                if (!token) {
                    console.error('[Pterodactyl] Socket rejected: no token');
                    return next(new Error('Authentication required'));
                }

                let decoded;
                try {
                    decoded = jwt.verify(token, JWT_SECRET);
                } catch (e) {
                    console.error('[Pterodactyl] Socket rejected: invalid token -', e.message);
                    return next(new Error('Invalid token'));
                }

                const row = await extDb.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [decoded.id]);
                if (!row) {
                    console.error('[Pterodactyl] Socket rejected: no panel access for user', decoded.id);
                    return next(new Error('Panel access denied'));
                }

                socket.user = decoded;
                next();
            } catch (err) {
                console.error('[Pterodactyl] Socket middleware error:', err.message);
                next(new Error('Server error'));
            }
        });

        ns.on('connection', async (socket) => {
            // server id can come from query param or auth object
            const serverId = (socket.handshake.query && socket.handshake.query.server)
                || (socket.handshake.auth && socket.handshake.auth.server);

            console.log('[Pterodactyl] Socket connected. User:', socket.user && socket.user.id, 'Server:', serverId, 'Query:', JSON.stringify(socket.handshake.query), 'Auth keys:', Object.keys(socket.handshake.auth || {}));

            if (!serverId) {
                console.error('[Pterodactyl] Disconnecting: no server param');
                socket.emit('console:error', { message: 'No server specified' });
                socket.disconnect();
                return;
            }

            // Join the room for this server
            socket.join('server:' + serverId);

            // If stream already exists, send buffered history immediately
            const existingStream = consoleStreams.get(serverId);
            if (existingStream && existingStream.buffer.length > 0) {
                console.log('[Pterodactyl] Sending', existingStream.buffer.length, 'buffered lines to new client');
                socket.emit('history', { lines: [...existingStream.buffer] });
            }

            // Start the Pterodactyl WS stream if not already running for this server
            if (!consoleStreams.has(serverId)) {
                console.log('[Pterodactyl] No existing stream, starting new one for:', serverId);
                await ensureConsoleStream(serverId, ns);
                // Give the WS 2s to receive the initial log burst from 'send logs',
                // then flush whatever was buffered as history to this socket
                setTimeout(() => {
                    const s = consoleStreams.get(serverId);
                    if (s && s.buffer.length > 0 && socket.connected) {
                        socket.emit('history', { lines: [...s.buffer] });
                    }
                }, 2000);
            }

            socket.on('disconnect', (reason) => {
                console.log('[Pterodactyl] Client disconnected from console for server:', serverId, 'reason:', reason);
            });
        });
    }

    router.attachConsoleNamespace = attachConsoleNamespace;

    return router;
};
