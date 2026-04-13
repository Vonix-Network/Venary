/**
 * Venary — Pterodactyl Panel Routes
 * Migrated from extensions/pterodactyl-panel/server/routes.js
 *
 * Factory pattern removed. Uses unified db directly.
 * Backward-compat: also mounted at /api/ext/pterodactyl/ in server/index.js
 */
'use strict';

const express     = require('express');
const router      = express.Router();
const jwt         = require('jsonwebtoken');
const db          = require('../db');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');
const { pteroSettings, pteroCommand, pteroPower } = require('../middleware/validate').pterodactyl;
const PterodactylClient = require('../services/pterodactyl-client');

// ── Minecraft pinger integration ──────────────────────────────────────────────
// Lazy-required so pterodactyl routes work even if minecraft feature is disabled.
function tryGetPinger() {
    try { return require('./minecraft').smartPing || require('../services/minecraft/pinger').smartPing; }
    catch { return null; }
}

// ── Client factory ────────────────────────────────────────────────────────────

/** Cached per-server clients for console streaming. */
const consoleStreams = new Map(); // serverId → { client, buffer[], _statsPoll, _playerPoll }

/** Active HTTP client (recreated when settings change). */
let pteroClient = null;

/**
 * Load settings from DB and (re)create the PterodactylClient.
 * Returns null if base_url or api_key are not yet configured.
 */
async function getClient() {
    const rows = await db.all('SELECT key, value FROM pterodactyl_settings');
    const cfg  = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (!cfg.base_url || !cfg.api_key) return null;
    if (!pteroClient || pteroClient.baseUrl !== cfg.base_url.replace(/\/$/, '')) {
        pteroClient = new PterodactylClient({ baseUrl: cfg.base_url, apiKey: cfg.api_key, serverId: '' });
    }
    return pteroClient;
}

// ── Role middleware ───────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
    db.get('SELECT role FROM users WHERE id = ?', [req.user.id])
        .then(u => {
            if (!u || !['admin', 'superadmin', 'moderator'].includes(u.role))
                return res.status(403).json({ error: 'Admin access required' });
            req.userRole = u.role;
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error' }));
}

function requireSuperadmin(req, res, next) {
    db.get('SELECT role FROM users WHERE id = ?', [req.user.id])
        .then(u => {
            if (!u || u.role !== 'superadmin')
                return res.status(403).json({ error: 'Superadmin access required' });
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error' }));
}

function requirePanelAccess(req, res, next) {
    db.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [req.user.id])
        .then(row => {
            if (!row) return res.status(403).json({ error: 'Panel access denied' });
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error' }));
}

// ── Access endpoints ──────────────────────────────────────────────────────────

// GET /access/me
router.get('/access/me', authenticateToken, async (req, res) => {
    try {
        const row = await db.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [req.user.id]);
        res.json({ granted: !!row });
    } catch (err) {
        console.error('[Pterodactyl] access/me error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /access/users
router.get('/access/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await db.all('SELECT user_id, granted_at FROM pterodactyl_access');
        res.json(rows);
    } catch (err) {
        console.error('[Pterodactyl] access/users error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /access/:userId
router.post('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        await db.run(
            'INSERT INTO pterodactyl_access (user_id, granted_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING',
            [userId, new Date().toISOString()]
        );
        res.json({ granted: true, user_id: userId });
    } catch (err) {
        console.error('[Pterodactyl] grant access error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /access/:userId
router.delete('/access/:userId', authenticateToken, requireSuperadmin, async (req, res) => {
    try {
        await db.run('DELETE FROM pterodactyl_access WHERE user_id = ?', [req.params.userId]);
        res.json({ granted: false, user_id: req.params.userId });
    } catch (err) {
        console.error('[Pterodactyl] revoke access error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Server list ───────────────────────────────────────────────────────────────

// GET /servers
router.get('/servers', authenticateToken, requirePanelAccess, async (req, res) => {
    try {
        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured. Save Base URL and API Key first.' });

        const result = await client._request('GET', '/api/client');
        if (result.statusCode === 401 || result.statusCode === 403) {
            return res.status(502).json({ error: 'Pterodactyl API rejected the key. Use a Client API key (not Application key).', statusCode: result.statusCode });
        }
        if (result.statusCode !== 200) {
            const detail = result.body?.errors?.[0]?.detail || result.body?.message || JSON.stringify(result.body);
            return res.status(502).json({ error: 'Pterodactyl returned HTTP ' + result.statusCode, detail, hint: 'Base URL should be https://panel.example.com with no trailing path' });
        }

        const servers = (result.body.data || []).map(s => ({
            id:          s.attributes.identifier,
            uuid:        s.attributes.uuid,
            name:        s.attributes.name,
            description: s.attributes.description || '',
            node:        s.attributes.node || '',
        }));
        res.json(servers);
    } catch (err) {
        console.error('[Pterodactyl] GET servers error:', err.message);
        res.status(502).json({ error: err.message || 'Failed to reach Pterodactyl API. Check the Base URL.' });
    }
});

// GET /server-info?server={id}
router.get('/server-info', authenticateToken, requirePanelAccess, async (req, res) => {
    try {
        const serverId = req.query.server;
        if (!serverId) return res.status(400).json({ error: 'server query param required' });

        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured' });

        const result = await client._request('GET', '/api/client/servers/' + serverId);
        if (result.statusCode !== 200) return res.status(502).json({ error: 'Failed to fetch server info' });

        const a     = result.body.attributes || {};
        const alloc = a.relationships?.allocations?.data?.[0];
        const allocAttr = alloc?.attributes;

        res.json({
            name:         a.name || '',
            description:  a.description || '',
            node:         a.node || '',
            ip:           allocAttr ? (allocAttr.ip_alias || allocAttr.ip || '') : '',
            port:         allocAttr ? allocAttr.port : null,
            limits:       { memory: a.limits?.memory, cpu: a.limits?.cpu, disk: a.limits?.disk },
            is_suspended: !!a.is_suspended,
            is_installing: !!a.is_installing,
        });
    } catch (err) {
        console.error('[Pterodactyl] server-info error:', err.message);
        res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
    }
});

// GET /resources?server={id}
router.get('/resources', authenticateToken, requirePanelAccess, async (req, res) => {
    try {
        const serverId = req.query.server;
        if (!serverId) return res.status(400).json({ error: 'server query param required' });

        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured' });

        const result = await client._request('GET', `/api/client/servers/${serverId}/resources`);
        if (result.statusCode !== 200) return res.status(502).json({ error: 'Failed to fetch resources' });

        const a = result.body.attributes || {};
        res.json({ state: a.current_state || 'offline', resources: a.resources || {} });
    } catch (err) {
        console.error('[Pterodactyl] resources error:', err.message);
        res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
    }
});

// ── Settings ──────────────────────────────────────────────────────────────────

// GET /settings — returns base_url only (NEVER api_key)
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const rows = await db.all("SELECT key, value FROM pterodactyl_settings WHERE key != 'api_key'");
        const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
        res.json({ base_url: settings.base_url || '' });
    } catch (err) {
        console.error('[Pterodactyl] GET settings error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /settings
router.post('/settings', authenticateToken, requireAdmin, pteroSettings, async (req, res) => {
    try {
        const { base_url, api_key } = req.body;

        await db.run(
            "INSERT INTO pterodactyl_settings (key, value) VALUES ('base_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [base_url.trim()]
        );

        if (api_key && api_key.trim()) {
            await db.run(
                "INSERT INTO pterodactyl_settings (key, value) VALUES ('api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [api_key.trim()]
            );
            pteroClient = null;
            consoleStreams.clear(); // force reconnect with new credentials
        }

        // Placeholder so legacy validation doesn't break
        await db.run(
            "INSERT INTO pterodactyl_settings (key, value) VALUES ('server_id', '_dynamic') ON CONFLICT(key) DO NOTHING"
        );

        res.json({ ok: true, base_url: base_url.trim() });
    } catch (err) {
        console.error('[Pterodactyl] POST settings error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ── Status ────────────────────────────────────────────────────────────────────

// GET /status?server={id}
router.get('/status', authenticateToken, requirePanelAccess, async (req, res) => {
    try {
        const serverId = req.query.server;
        if (!serverId) return res.status(400).json({ error: 'server query param required' });

        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured' });

        client.serverId = serverId;
        const result = await client.getServerStatus();
        res.json(result);
    } catch (err) {
        console.error('[Pterodactyl] status error:', err.message);
        res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
    }
});

// ── Power / command ───────────────────────────────────────────────────────────

// POST /command
router.post('/command', authenticateToken, requirePanelAccess, pteroCommand, async (req, res) => {
    try {
        const { command, server: serverId } = req.body;
        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured' });

        const result = await client._request('POST', `/api/client/servers/${serverId}/command`, { command: command.trim() });
        if (result.statusCode === 204 || result.statusCode === 200) return res.json({ ok: true });

        const detail = result.body?.errors?.[0]?.detail || '';
        res.status(502).json({ error: 'Pterodactyl API returned an error', detail });
    } catch (err) {
        console.error('[Pterodactyl] command error:', err.message);
        res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
    }
});

// POST /power
router.post('/power', authenticateToken, requirePanelAccess, pteroPower, async (req, res) => {
    try {
        const { action, server: serverId } = req.body;
        const client = await getClient();
        if (!client) return res.status(503).json({ error: 'Pterodactyl not configured' });

        client.serverId = serverId;
        const result = await client.sendPowerAction(action);

        if (result.statusCode === 204 || result.statusCode === 200) return res.json({ ok: true, action });
        const detail = result.body?.errors?.[0]?.detail || '';
        res.status(502).json({ error: 'Pterodactyl API returned an error', detail });
    } catch (err) {
        console.error('[Pterodactyl] power error:', err.message);
        res.status(502).json({ error: 'Failed to reach Pterodactyl API' });
    }
});

// ── Socket.IO console namespace ───────────────────────────────────────────────

/**
 * Get or create a console stream for a server.
 * Maintains one Pterodactyl WS connection per server identifier.
 */
async function ensureConsoleStream(serverId, ns) {
    if (consoleStreams.has(serverId)) return;

    const rows = await db.all('SELECT key, value FROM pterodactyl_settings');
    const cfg  = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (!cfg.base_url || !cfg.api_key) {
        console.error('[Pterodactyl] Cannot start stream: settings not configured');
        return;
    }

    const streamClient = new PterodactylClient({ baseUrl: cfg.base_url, apiKey: cfg.api_key, serverId });
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
            if (stream._statsPoll)  { clearInterval(stream._statsPoll);  stream._statsPoll  = null; }
            if (stream._playerPoll) { clearInterval(stream._playerPoll); stream._playerPoll = null; }
            consoleStreams.delete(serverId);
            ns.to('server:' + serverId).emit('console:error', { message: msg });
        },
        (stats) => {
            ns.to('server:' + serverId).emit('stats:update', stats);
        }
    ).catch((err) => {
        console.error('[Pterodactyl] connectConsole threw for', serverId, ':', err.message);
        if (stream._statsPoll)  { clearInterval(stream._statsPoll);  stream._statsPoll  = null; }
        if (stream._playerPoll) { clearInterval(stream._playerPoll); stream._playerPoll = null; }
        consoleStreams.delete(serverId);
    });

    // REST poll every 2s — primary stats source
    stream._statsPoll = setInterval(async () => {
        try {
            const result = await streamClient._request('GET', `/api/client/servers/${serverId}/resources`);
            if (result.statusCode !== 200) return;
            const attrs = result.body?.attributes;
            if (!attrs) return;
            if (attrs.current_state) ns.to('server:' + serverId).emit('status:update', { state: attrs.current_state });
            if (attrs.resources)     ns.to('server:' + serverId).emit('stats:update', attrs.resources);
        } catch { /* ignore */ }
    }, 2000);

    // Poll player count every 15s via Minecraft pinger
    stream._playerPoll = setInterval(async () => {
        try {
            const infoResult = await streamClient._request('GET', `/api/client/servers/${serverId}`);
            if (infoResult.statusCode !== 200) return;
            const a     = infoResult.body?.attributes;
            const alloc = a?.relationships?.allocations?.data?.[0];
            if (!alloc) return;
            const ip   = alloc.attributes.ip_alias || alloc.attributes.ip;
            const port = alloc.attributes.port;
            if (!ip || !port) return;

            const smartPing = tryGetPinger();
            if (smartPing) {
                const ping = await smartPing(ip, port, false);
                if (ping?.players) {
                    ns.to('server:' + serverId).emit('players:update', {
                        online: ping.players.online || 0,
                        max:    ping.players.max    || 0,
                    });
                }
            }
        } catch { /* ignore */ }
    }, 15000);
}

/**
 * Attach the /pterodactyl-console Socket.IO namespace.
 * Called once from server/index.js after mounting routes.
 * @param {import('socket.io').Server} io
 */
function attachConsoleNamespace(io) {
    const ns = io.of('/pterodactyl-console');

    // Auth + panel access guard on every socket connection
    ns.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            if (!token) return next(new Error('Authentication required'));

            let decoded;
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (e) {
                return next(new Error('Invalid token'));
            }

            const row = await db.get('SELECT user_id FROM pterodactyl_access WHERE user_id = ?', [decoded.id]);
            if (!row) return next(new Error('Panel access denied'));

            socket.user = decoded;
            next();
        } catch (err) {
            console.error('[Pterodactyl] Socket middleware error:', err.message);
            next(new Error('Server error'));
        }
    });

    ns.on('connection', async (socket) => {
        const serverId = socket.handshake.query?.server || socket.handshake.auth?.server;

        console.log('[Pterodactyl] Socket connected. User:', socket.user?.id, 'Server:', serverId);

        if (!serverId) {
            socket.emit('console:error', { message: 'No server specified' });
            socket.disconnect();
            return;
        }

        socket.join('server:' + serverId);

        // Send buffered history if stream already exists
        const existing = consoleStreams.get(serverId);
        if (existing?.buffer.length > 0) {
            socket.emit('history', { lines: [...existing.buffer] });
        }

        if (!consoleStreams.has(serverId)) {
            await ensureConsoleStream(serverId, ns);
            // Flush initial log burst after 2s
            setTimeout(() => {
                const s = consoleStreams.get(serverId);
                if (s?.buffer.length > 0 && socket.connected) {
                    socket.emit('history', { lines: [...s.buffer] });
                }
            }, 2000);
        }

        socket.on('disconnect', (reason) => {
            console.log('[Pterodactyl] Client disconnected from console for server:', serverId, 'reason:', reason);
        });
    });
}

// Expose for index.js to call after route mounting
router.attachConsoleNamespace = attachConsoleNamespace;

// Backward-compat: also mounted at /api/ext/pterodactyl/ in server/index.js
module.exports = router;
