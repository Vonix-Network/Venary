/* =======================================
   Minecraft Extension — API Routes
   Factory pattern: receives ext db instance.
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { smartPing } = require('./pinger');

module.exports = function (extDb) {
    const router = express.Router();
    const coreDb = require('../../../server/db');
    const { authenticateToken, optionalAuth } = require('../../../server/middleware/auth');
    const Config = require('../../../server/config');

    // ── Helpers ──────────────────────────────────────────
    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id]).then(u => {
            if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
            next();
        }).catch(() => res.status(500).json({ error: 'Server error' }));
    }

    async function validateApiKey(req) {
        const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        if (!key) return null;
        return extDb.get('SELECT * FROM mc_servers WHERE api_key = ?', [key]);
    }

    function generateApiKey() {
        return 'vmc_' + crypto.randomBytes(24).toString('hex');
    }

    function generateLinkCode() {
        return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 char hex
    }

    function formatUUID(uuid) {
        const clean = uuid.replace(/-/g, '').toLowerCase();
        return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
    }

    // ══════════════════════════════════════════════════════
    // PUBLIC ENDPOINTS (no auth)
    // ══════════════════════════════════════════════════════

    // GET /servers — list all servers with live status
    router.get('/servers', optionalAuth, async (req, res) => {
        try {
            const servers = await extDb.all('SELECT * FROM mc_servers ORDER BY sort_order ASC, name ASC');

            let userXpMap = {};
            let isLinked = false;

            if (req.user) {
                const linked = await extDb.get('SELECT * FROM linked_accounts WHERE user_id = ?', [req.user.id]);
                isLinked = !!linked;

                const userXps = await extDb.all('SELECT server_id, xp FROM server_xp WHERE user_id = ?', [req.user.id]);
                userXps.forEach(row => {
                    userXpMap[row.server_id] = row.xp;
                });
            }

            const results = await Promise.all(servers.map(async s => {
                const status = await smartPing(s.address, s.port, !!s.is_bedrock);
                return {
                    id: s.id, name: s.name, address: s.address, port: s.port,
                    description: s.description, icon: status.icon || s.icon,
                    version: status.version || s.version, modpack_name: s.modpack_name,
                    curseforge_url: s.curseforge_url, modrinth_url: s.modrinth_url,
                    bluemap_url: s.bluemap_url, hide_port: !!s.hide_port,
                    is_bedrock: !!s.is_bedrock,
                    online: status.online,
                    players: status.players,
                    motd: status.motd,
                    responseTimeMs: status.responseTimeMs,
                    user_xp: userXpMap[s.id] || 0,
                    user_linked: isLinked
                };
            }));
            res.json(results);
        } catch (err) {
            console.error('[MC] Server list error:', err);
            res.status(500).json({ error: 'Failed to fetch servers' });
        }
    });

    // GET /servers/:id — single server detail
    router.get('/servers/:id', async (req, res) => {
        try {
            const server = await extDb.get('SELECT * FROM mc_servers WHERE id = ?', [req.params.id]);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const status = await smartPing(server.address, server.port, !!server.is_bedrock);
            res.json({
                ...server, hide_port: !!server.hide_port, is_bedrock: !!server.is_bedrock,
                online: status.online, players: status.players,
                version: status.version || server.version,
                motd: status.motd, icon: status.icon || server.icon,
                responseTimeMs: status.responseTimeMs
            });
        } catch (err) {
            console.error('[MC] Server detail error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /servers/:id/history — uptime & player chart data
    router.get('/servers/:id/history', async (req, res) => {
        try {
            const range = req.query.range || '24h';
            const rangeMap = { '1h': 1, '7h': 7, '24h': 24, '7d': 168 };
            const hours = rangeMap[range] || 24;
            const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

            const records = await extDb.all(
                'SELECT * FROM uptime_history WHERE server_id = ? AND checked_at > ? ORDER BY checked_at ASC',
                [req.params.id, since]
            );

            // Stats
            const total = records.length;
            const onlineCount = records.filter(r => r.online).length;
            const playerCounts = records.filter(r => r.players_online != null).map(r => r.players_online);
            const avgPlayers = playerCounts.length ? Math.round(playerCounts.reduce((a, b) => a + b, 0) / playerCounts.length) : 0;
            const peakPlayers = playerCounts.length ? Math.max(...playerCounts) : 0;

            res.json({
                records,
                stats: {
                    uptimePercentage: total > 0 ? (onlineCount / total) * 100 : 0,
                    avgPlayers, peakPlayers, totalChecks: total
                }
            });
        } catch (err) {
            console.error('[MC] History error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /leaderboard — combined XP leaderboard
    router.get('/leaderboard', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const type = req.query.type || 'xp'; // 'xp' or 'playtime'

            // Registered users with MC accounts
            const linked = await extDb.all('SELECT * FROM linked_accounts');
            const entries = [];

            for (const link of linked) {
                const user = await coreDb.get('SELECT id, username, display_name, avatar, level, xp, role FROM users WHERE id = ?', [link.user_id]);
                if (!user) continue;

                // Get total playtime across servers
                const playtimeRow = await extDb.get('SELECT COALESCE(SUM(playtime_seconds),0) as total FROM server_xp WHERE user_id = ?', [link.user_id]);

                entries.push({
                    id: user.id, username: user.username, display_name: user.display_name,
                    avatar: user.avatar, role: user.role,
                    minecraft_username: link.minecraft_username, minecraft_uuid: link.minecraft_uuid,
                    site_xp: user.xp, minecraft_xp: link.minecraft_xp,
                    total_xp: user.xp + (link.minecraft_xp || 0),
                    level: user.level,
                    playtime_seconds: playtimeRow.total || 0,
                    is_registered: true
                });
            }

            // Unregistered MC players
            const unregistered = await extDb.all('SELECT * FROM mc_players WHERE linked_user_id IS NULL');
            for (const p of unregistered) {
                entries.push({
                    id: 'mc-' + p.id, username: p.username, display_name: p.username,
                    avatar: null, role: null,
                    minecraft_username: p.username, minecraft_uuid: p.uuid,
                    site_xp: 0, minecraft_xp: p.xp,
                    total_xp: p.xp,
                    level: p.level,
                    playtime_seconds: p.playtime_seconds || 0,
                    is_registered: false
                });
            }

            // Sort
            if (type === 'playtime') {
                entries.sort((a, b) => b.playtime_seconds - a.playtime_seconds);
            } else {
                entries.sort((a, b) => b.total_xp - a.total_xp);
            }

            res.json(entries.slice(0, limit));
        } catch (err) {
            console.error('[MC] Leaderboard error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /account/:userId — get MC link info for a user (public)
    router.get('/account/:userId', async (req, res) => {
        try {
            const link = await extDb.get('SELECT minecraft_uuid, minecraft_username, minecraft_xp FROM linked_accounts WHERE user_id = ?', [req.params.userId]);
            if (!link) return res.json({ linked: false });
            res.json({ linked: true, ...link });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // AUTHENTICATED ENDPOINTS (logged-in user)
    // ══════════════════════════════════════════════════════

    // POST /link — user enters link code to connect MC account
    router.post('/link', authenticateToken, async (req, res) => {
        try {
            const { code } = req.body;
            if (!code) return res.status(400).json({ error: 'Link code required' });

            // Find valid code
            const entry = await extDb.get('SELECT * FROM link_codes WHERE code = ? AND expires_at > ?', [code.toUpperCase(), new Date().toISOString()]);
            if (!entry) return res.status(400).json({ error: 'Invalid or expired link code' });

            // Check if user already linked
            const existing = await extDb.get('SELECT id FROM linked_accounts WHERE user_id = ?', [req.user.id]);
            if (existing) return res.status(409).json({ error: 'You already have a linked Minecraft account. Unlink first.' });

            // Check if UUID already linked to another user
            const uuidTaken = await extDb.get('SELECT user_id FROM linked_accounts WHERE minecraft_uuid = ?', [entry.minecraft_uuid]);
            if (uuidTaken) return res.status(409).json({ error: 'This Minecraft account is already linked to another user.' });

            // Create link
            await extDb.run(
                'INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                [uuidv4(), req.user.id, entry.minecraft_uuid, entry.minecraft_username]
            );

            // Delete used code
            await extDb.run('DELETE FROM link_codes WHERE id = ?', [entry.id]);

            res.json({ message: 'Minecraft account linked!', minecraft_username: entry.minecraft_username, minecraft_uuid: entry.minecraft_uuid });
        } catch (err) {
            console.error('[MC] Link error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE /link — unlink MC account
    router.delete('/link', authenticateToken, async (req, res) => {
        try {
            await extDb.run('DELETE FROM linked_accounts WHERE user_id = ?', [req.user.id]);
            res.json({ message: 'Minecraft account unlinked' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // MINECRAFT AUTH ENDPOINTS (called by VonixCore mod)
    // ══════════════════════════════════════════════════════

    // POST /minecraft/login — in-game /login <password>
    router.post('/minecraft/login', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { minecraft_username, minecraft_uuid, password } = req.body;
            if (!minecraft_uuid || !password) return res.status(400).json({ error: 'minecraft_uuid and password required' });

            const uuid = formatUUID(minecraft_uuid);

            // Find linked account
            const link = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (!link) return res.status(401).json({ error: 'No account linked to this Minecraft UUID. Use /register first.' });

            // Get platform user
            const user = await coreDb.get('SELECT * FROM users WHERE id = ?', [link.user_id]);
            if (!user) return res.status(401).json({ error: 'Platform account not found' });

            // Verify password
            const bcrypt = require('bcryptjs');
            const valid = bcrypt.compareSync(password, user.password);
            if (!valid) return res.status(401).json({ error: 'Invalid password' });

            // Check ban
            if (user.banned) return res.status(403).json({ error: 'Your account has been banned.' });

            // Generate JWT
            const jwt = require('jsonwebtoken');
            const { JWT_SECRET } = require('../../../server/middleware/auth');
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

            // Update last seen
            await coreDb.run("UPDATE users SET last_seen = ?, status = ? WHERE id = ?", [new Date().toISOString(), 'online', user.id]);

            res.json({
                success: true,
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    minecraft_username: link.minecraft_username,
                    minecraft_uuid: link.minecraft_uuid,
                    role: user.role,
                    level: user.level
                }
            });
        } catch (err) {
            console.error('[MC] Minecraft login error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /minecraft/register — generate a registration code (code-based flow)
    router.post('/minecraft/register', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { minecraft_username, minecraft_uuid } = req.body;
            if (!minecraft_uuid) return res.status(400).json({ error: 'minecraft_uuid required' });

            const uuid = formatUUID(minecraft_uuid);
            const username = minecraft_username || uuid;

            // Check if already linked
            const existingLink = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (existingLink) {
                return res.json({ success: true, already_registered: true, code: null });
            }

            // Generate link code (reuse existing infrastructure)
            await extDb.run('DELETE FROM link_codes WHERE minecraft_uuid = ?', [uuid]);
            const code = generateLinkCode();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min for registration

            await extDb.run(
                'INSERT INTO link_codes (id, code, minecraft_uuid, minecraft_username, server_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), code, uuid, username, server.id, expiresAt]
            );

            res.json({ success: true, code, expires_in: 600 });
        } catch (err) {
            console.error('[MC] Minecraft register error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /minecraft/register-direct — register new platform account with password from in-game
    router.post('/minecraft/register-direct', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { minecraft_username, minecraft_uuid, password } = req.body;
            if (!minecraft_uuid || !password) return res.status(400).json({ error: 'minecraft_uuid and password required' });
            if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

            const uuid = formatUUID(minecraft_uuid);
            const username = minecraft_username || uuid;

            // Check if already linked
            const existingLink = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (existingLink) {
                return res.status(409).json({ error: 'This Minecraft account is already registered. Use /login <password>.' });
            }

            // Check if username is taken on the platform
            const existingUser = await coreDb.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
            if (existingUser) {
                return res.status(409).json({ error: 'Username already taken on the platform. Register on the website instead.' });
            }

            // Create platform user
            const bcrypt = require('bcryptjs');
            const jwt = require('jsonwebtoken');
            const { JWT_SECRET } = require('../../../server/middleware/auth');

            const hashedPassword = bcrypt.hashSync(password, 10);
            const userId = uuidv4();
            const now = new Date().toISOString();

            await coreDb.run(
                'INSERT INTO users (id, username, email, password, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, username, `${username.toLowerCase()}@mc.local`, hashedPassword, username, now]
            );

            // Auto-link Minecraft account
            await extDb.run(
                'INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                [uuidv4(), userId, uuid, username]
            );

            // Also ensure they exist in mc_players for leaderboard
            const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
            if (existingPlayer) {
                await extDb.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [userId, uuid]);
            }

            const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });

            res.status(201).json({
                success: true,
                token,
                user: {
                    id: userId,
                    username,
                    minecraft_username: username,
                    minecraft_uuid: uuid,
                    role: 'member',
                    level: 1
                }
            });
        } catch (err) {
            console.error('[MC] Minecraft register-direct error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // SERVER API KEY PROTECTED (from MC mod/plugin)
    // ══════════════════════════════════════════════════════

    // POST /sync/xp — bulk XP sync from a Minecraft server
    router.post('/sync/xp', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { players } = req.body;
            if (!players || !Array.isArray(players) || players.length === 0) {
                return res.status(400).json({ error: 'No players to sync' });
            }

            let synced = 0, registered = 0, unregisteredCount = 0;
            const errors = [];

            for (const player of players) {
                try {
                    const uuid = formatUUID(player.uuid);
                    const newXp = player.totalExperience || 0;
                    const newPlaytime = player.playtimeSeconds || 0;

                    // Check if linked to a platform user
                    const link = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);

                    if (link) {
                        // ── Registered user ──
                        registered++;
                        // Update username if changed
                        if (player.username && player.username !== link.minecraft_username) {
                            await extDb.run('UPDATE linked_accounts SET minecraft_username = ? WHERE id = ?', [player.username, link.id]);
                        }

                        // Upsert server_xp (high-water mark)
                        const existing = await extDb.get('SELECT * FROM server_xp WHERE user_id = ? AND server_id = ?', [link.user_id, server.id]);
                        if (existing) {
                            const xpToStore = Math.max(parseInt(existing.xp) || 0, newXp);
                            const ptToStore = Math.max(parseInt(existing.playtime_seconds) || 0, newPlaytime);
                            await extDb.run('UPDATE server_xp SET xp = ?, level = ?, playtime_seconds = ?, last_synced_at = ? WHERE id = ?',
                                [xpToStore, player.level || 0, ptToStore, new Date().toISOString(), existing.id]);
                        } else {
                            await extDb.run('INSERT INTO server_xp (id, user_id, server_id, xp, level, playtime_seconds) VALUES (?, ?, ?, ?, ?, ?)',
                                [uuidv4(), link.user_id, server.id, newXp, player.level || 0, newPlaytime]);
                        }

                        // Recalculate total minecraft XP across all servers for this user
                        const totalRow = await extDb.get('SELECT COALESCE(SUM(xp),0) as total FROM server_xp WHERE user_id = ?', [link.user_id]);
                        const totalMcXp = totalRow.total || 0;
                        await extDb.run('UPDATE linked_accounts SET minecraft_xp = ? WHERE id = ?', [totalMcXp, link.id]);

                    } else {
                        // ── Unregistered player ──
                        unregisteredCount++;
                        const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
                        if (existingPlayer) {
                            const xpToStore = Math.max(parseInt(existingPlayer.xp) || 0, newXp);
                            const ptToStore = Math.max(parseInt(existingPlayer.playtime_seconds) || 0, newPlaytime);
                            await extDb.run('UPDATE mc_players SET username = ?, xp = ?, level = ?, playtime_seconds = ?, last_synced_at = ? WHERE id = ?',
                                [player.username, xpToStore, player.level || 0, ptToStore, new Date().toISOString(), existingPlayer.id]);
                        } else {
                            await extDb.run('INSERT INTO mc_players (id, uuid, username, xp, level, playtime_seconds) VALUES (?, ?, ?, ?, ?, ?)',
                                [uuidv4(), uuid, player.username, newXp, player.level || 0, newPlaytime]);
                        }
                    }
                    synced++;
                } catch (e) {
                    errors.push(player.uuid);
                    console.error('[MC] Sync player error:', e);
                }
            }

            res.json({ success: true, synced, syncedCount: synced, registered, unregistered: unregisteredCount, errors });
        } catch (err) {
            console.error('[MC] XP sync error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /link/generate — MC server generates a link code for a player
    router.post('/link/generate', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { uuid, username } = req.body;
            if (!uuid || !username) return res.status(400).json({ error: 'uuid and username required' });

            const formattedUuid = formatUUID(uuid);

            // Clean expired codes
            await extDb.run('DELETE FROM link_codes WHERE expires_at < ?', [new Date().toISOString()]);

            // Delete any existing code for this UUID
            await extDb.run('DELETE FROM link_codes WHERE minecraft_uuid = ?', [formattedUuid]);

            const code = generateLinkCode();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 min

            await extDb.run(
                'INSERT INTO link_codes (id, code, minecraft_uuid, minecraft_username, server_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
                [uuidv4(), code, formattedUuid, username, server.id, expiresAt]
            );

            res.json({ success: true, code, expiresIn: 300 });
        } catch (err) {
            console.error('[MC] Link generate error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /verify — check if a Minecraft player is registered
    router.get('/verify', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const uuid = req.query.uuid ? formatUUID(req.query.uuid) : null;
            const username = req.query.username;
            if (!uuid && !username) return res.status(400).json({ error: 'uuid or username required' });

            let link = null;
            if (uuid) link = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (!link && username) link = await extDb.get('SELECT * FROM linked_accounts WHERE LOWER(minecraft_username) = LOWER(?)', [username]);

            if (!link) return res.json({ verified: false, registered: false, message: 'Player not registered' });

            const user = await coreDb.get('SELECT id, username, display_name, role, level, xp FROM users WHERE id = ?', [link.user_id]);
            if (!user) return res.json({ verified: false, registered: false });

            res.json({
                verified: true, registered: true,
                user: {
                    id: user.id, username: user.username, display_name: user.display_name,
                    role: user.role, level: user.level,
                    site_xp: user.xp, minecraft_xp: link.minecraft_xp,
                    total_xp: user.xp + (link.minecraft_xp || 0),
                    minecraft_username: link.minecraft_username, minecraft_uuid: link.minecraft_uuid,
                    donation_rank: await (async () => {
                        try {
                            const extLoader = require('../../../server/extension-loader');
                            const donDb = extLoader.getExtensionDb('donations');
                            if (!donDb) return null;
                            const ur = await donDb.get(
                                `SELECT r.name, r.luckperms_group, r.color FROM user_ranks ur
                                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                                 WHERE ur.user_id = ? AND ur.active = 1 AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
                                [user.id, new Date().toISOString()]);
                            return ur ? { name: ur.name, luckperms_group: ur.luckperms_group, color: ur.color } : null;
                        } catch { return null; }
                    })()
                }
            });
        } catch (err) {
            console.error('[MC] Verify error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN ENDPOINTS
    // ══════════════════════════════════════════════════════

    // POST /admin/servers — create server
    router.post('/admin/servers', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name, address, port, description, modpack_name, curseforge_url, modrinth_url, bluemap_url, hide_port, is_bedrock, sort_order } = req.body;
            if (!name || !address) return res.status(400).json({ error: 'Name and address are required' });

            const id = uuidv4();
            const api_key = generateApiKey();
            await extDb.run(
                `INSERT INTO mc_servers (id, name, address, port, description, modpack_name, curseforge_url, modrinth_url, bluemap_url, api_key, hide_port, is_bedrock, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, address, port || 25565, description || null, modpack_name || null,
                    curseforge_url || null, modrinth_url || null, bluemap_url || null,
                    api_key, hide_port ? 1 : 0, is_bedrock ? 1 : 0, sort_order || 0]
            );

            const server = await extDb.get('SELECT * FROM mc_servers WHERE id = ?', [id]);
            res.status(201).json(server);
        } catch (err) {
            console.error('[MC] Create server error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT /admin/servers/:id — update server
    router.put('/admin/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const server = await extDb.get('SELECT id FROM mc_servers WHERE id = ?', [req.params.id]);
            if (!server) return res.status(404).json({ error: 'Server not found' });

            const fields = ['name', 'address', 'port', 'description', 'modpack_name', 'curseforge_url', 'modrinth_url', 'bluemap_url', 'hide_port', 'is_bedrock', 'sort_order'];
            const updates = [], values = [];
            for (const f of fields) {
                if (req.body[f] !== undefined) {
                    updates.push(f + ' = ?');
                    values.push(f === 'hide_port' || f === 'is_bedrock' ? (req.body[f] ? 1 : 0) : req.body[f]);
                }
            }
            if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

            values.push(req.params.id);
            await extDb.run(`UPDATE mc_servers SET ${updates.join(', ')} WHERE id = ?`, values);

            const updated = await extDb.get('SELECT * FROM mc_servers WHERE id = ?', [req.params.id]);
            res.json(updated);
        } catch (err) {
            console.error('[MC] Update server error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // DELETE /admin/servers/:id
    router.delete('/admin/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM uptime_history WHERE server_id = ?', [req.params.id]);
            await extDb.run('DELETE FROM server_xp WHERE server_id = ?', [req.params.id]);
            await extDb.run('DELETE FROM link_codes WHERE server_id = ?', [req.params.id]);
            await extDb.run('DELETE FROM mc_servers WHERE id = ?', [req.params.id]);
            res.json({ message: 'Server deleted' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /admin/servers/:id/regenerate-key
    router.post('/admin/servers/:id/regenerate-key', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const newKey = generateApiKey();
            await extDb.run('UPDATE mc_servers SET api_key = ? WHERE id = ?', [newKey, req.params.id]);
            res.json({ api_key: newKey });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT /admin/users/:id/minecraft — admin assign MC UUID to user
    router.put('/admin/users/:id/minecraft', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { minecraft_uuid, minecraft_username } = req.body;
            if (!minecraft_uuid) return res.status(400).json({ error: 'minecraft_uuid is required' });

            const userId = req.params.id;
            const user = await coreDb.get('SELECT id FROM users WHERE id = ?', [userId]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const uuid = formatUUID(minecraft_uuid);

            // Check if UUID already linked
            const existing = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (existing && existing.user_id !== userId) {
                return res.status(409).json({ error: 'This UUID is already linked to another user' });
            }

            // Upsert
            const userLink = await extDb.get('SELECT * FROM linked_accounts WHERE user_id = ?', [userId]);
            if (userLink) {
                await extDb.run('UPDATE linked_accounts SET minecraft_uuid = ?, minecraft_username = ? WHERE id = ?',
                    [uuid, minecraft_username || uuid, userLink.id]);
            } else {
                await extDb.run('INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                    [uuidv4(), userId, uuid, minecraft_username || uuid]);
            }

            res.json({ message: 'Minecraft account assigned', minecraft_uuid: uuid, minecraft_username: minecraft_username || uuid });
        } catch (err) {
            console.error('[MC] Admin assign error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // BACKGROUND PING CRON (called from cron.js)
    // ══════════════════════════════════════════════════════
    const offlineStrikes = new Map();

    async function sendDiscordOfflineAlert(server, strikes) {
        const cfg = Config.load() || {};
        const discord = cfg.discord || {};
        let content = `🚨 **Server Offline Alert** 🚨\nMinecraft Server \`${server.name}\` (\`${server.address}\`) has been detected offline **${strikes} times in a row**.`;

        // DM Role logic via centralized Bot
        if (discord.uptimeRolePing && discord.botToken && discord.guildId) {
            const discordBot = require('../../../server/discordBot');
            const success = await discordBot.dmMembersByRole(discord.guildId, discord.uptimeRolePing, content);
            if (success) {
                return; // Successfully DMed, skip webhook payload
            } else {
                console.log('[MC] Discord DM failed. Falling back to webhook if possible.');
            }
        }
        // Fallback or Webhook mode
        else if (discord.webhookUrl) {
            if (discord.uptimeRolePing && !discord.botToken) {
                content += `\n**Attention:** <@&${discord.uptimeRolePing.replace(/[^0-9]/g, '')}>`;
            }

            try {
                await fetch(discord.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });
            } catch (err) {
                console.error('[MC] Discord webhook alert failed:', err);
            }
        }
    }

    router._pingAll = async function () {
        try {
            const servers = await extDb.all('SELECT id, address, port, is_bedrock FROM mc_servers');
            for (const s of servers) {
                const status = await smartPing(s.address, s.port, !!s.is_bedrock);
                await extDb.run(
                    'INSERT INTO uptime_history (server_id, online, players_online, players_max, response_time_ms, checked_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [s.id, status.online ? 1 : 0, status.players?.online || 0, status.players?.max || 0,
                    status.responseTimeMs || null, new Date().toISOString()]
                );

                if (!status.online) {
                    const currentStrikes = (offlineStrikes.get(s.id) || 0) + 1;
                    offlineStrikes.set(s.id, currentStrikes);

                    const cfg = Config.load() || {};
                    const threshold = (cfg.discord && cfg.discord.uptimeStrikeThreshold) || 5;

                    if (currentStrikes === threshold) {
                        await sendDiscordOfflineAlert(s, currentStrikes);
                    }
                } else {
                    if (offlineStrikes.has(s.id)) {
                        offlineStrikes.delete(s.id);
                        // Optional: Server recovered alert
                    }
                }
            }
            // Cleanup: delete records older than 7 days
            const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            await extDb.run('DELETE FROM uptime_history WHERE checked_at < ?', [cutoff]);
        } catch (err) {
            console.error('[MC] Ping cron error:', err);
        }
    };

    // Start background pinger (every 60 seconds)
    setInterval(() => router._pingAll(), 60 * 1000);
    // Initial ping after 5 seconds
    setTimeout(() => router._pingAll(), 5000);

    return router;
};
