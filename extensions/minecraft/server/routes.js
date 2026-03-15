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

            let isLinked = false;
            let userUuid = null;

            if (req.user) {
                const linked = await extDb.get('SELECT * FROM linked_accounts WHERE user_id = ?', [req.user.id]);
                isLinked = !!linked;
                userUuid = linked ? linked.minecraft_uuid : null;
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

    // Stat metadata for formatting on the frontend
    const STAT_CATEGORIES = {
        core: ['deaths', 'mob_kills', 'player_kills', 'play_time', 'total_world_time'],
        movement: ['walk_one_cm', 'sprint_one_cm', 'crouch_one_cm', 'climb_one_cm', 'fly_one_cm', 'swim_one_cm', 'fall_one_cm', 'walk_on_water_one_cm', 'walk_under_water_one_cm', 'horse_one_cm', 'boat_one_cm', 'minecart_one_cm', 'aviate_one_cm', 'pig_one_cm', 'strider_one_cm'],
        combat: ['damage_dealt', 'damage_taken', 'damage_blocked_by_shield', 'damage_absorbed', 'damage_resisted', 'damage_dealt_absorbed', 'damage_dealt_resisted'],
        progression: ['total_blocks_mined', 'total_items_crafted', 'total_items_used', 'total_items_broken', 'total_items_picked_up', 'total_items_dropped', 'total_entities_killed', 'total_killed_by', 'animals_bred', 'fish_caught', 'raid_win', 'raid_trigger', 'traded_with_villager', 'enchant_item'],
        interactions: ['jump', 'drop', 'open_chest', 'open_enderchest', 'open_shulker_box', 'play_noteblock', 'interact_with_crafting_table', 'interact_with_furnace', 'interact_with_blast_furnace', 'interact_with_smoker', 'interact_with_anvil', 'interact_with_brewingstand', 'interact_with_beacon', 'interact_with_smithing_table', 'interact_with_grindstone', 'interact_with_stonecutter', 'interact_with_loom', 'interact_with_cartography_table', 'sleep_in_bed', 'leave_game', 'time_since_death', 'time_since_rest']
    };
    const ALL_TRACKED_STATS = Object.values(STAT_CATEGORIES).flat();

    // GET /leaderboard/debug — raw DB diagnostic (admin, dev use)
    router.get('/leaderboard/debug', async (req, res) => {
        try {
            const totalRows = await extDb.get('SELECT COUNT(*) as cnt FROM player_stats');
            const keys = await extDb.all('SELECT stat_key, COUNT(*) as cnt FROM player_stats GROUP BY stat_key ORDER BY cnt DESC LIMIT 30');
            const servers = await extDb.all('SELECT id, name FROM mc_servers');
            res.json({ totalRows: totalRows ? totalRows.cnt : 0, distinctStatKeys: keys, servers });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /leaderboard/meta — returns stat categories and server list for UI
    router.get('/leaderboard/meta', async (req, res) => {
        try {
            const servers = await extDb.all('SELECT id, name FROM mc_servers ORDER BY sort_order ASC, name ASC');
            res.json({ categories: STAT_CATEGORIES, servers });
        } catch (err) {
            console.error('[MC] Leaderboard meta error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /leaderboard — stats-based leaderboard with server/stat filtering
    // ?stat=deaths&server_id=<id>&category=core&limit=50&offset=0
    // When server_id is omitted or "all", sums across all servers
    router.get('/leaderboard', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = parseInt(req.query.offset) || 0;
            const stat = req.query.stat || 'play_time';
            const serverId = req.query.server_id;
            const category = req.query.category;

            // Validate stat key
            if (!ALL_TRACKED_STATS.includes(stat)) {
                return res.status(400).json({ error: 'Invalid stat key', valid: ALL_TRACKED_STATS });
            }

            let rows;
            if (serverId && serverId !== 'all') {
                // Per-server leaderboard
                rows = await extDb.all(
                    `SELECT ps.player_uuid, ps.stat_value, mp.username
                     FROM player_stats ps
                     LEFT JOIN mc_players mp ON mp.uuid = ps.player_uuid
                     WHERE ps.stat_key = ? AND ps.server_id = ?
                     ORDER BY ps.stat_value DESC
                     LIMIT ? OFFSET ?`,
                    [stat, serverId, limit, offset]
                );
            } else {
                // All servers — sum stat values across servers
                rows = await extDb.all(
                    `SELECT ps.player_uuid, SUM(ps.stat_value) as stat_value, mp.username
                     FROM player_stats ps
                     LEFT JOIN mc_players mp ON mp.uuid = ps.player_uuid
                     WHERE ps.stat_key = ?
                     GROUP BY ps.player_uuid, mp.username
                     ORDER BY stat_value DESC
                     LIMIT ? OFFSET ?`,
                    [stat, limit, offset]
                );
            }

            // Get total count for pagination
            let totalRow;
            if (serverId && serverId !== 'all') {
                totalRow = await extDb.get(
                    'SELECT COUNT(DISTINCT player_uuid) as total FROM player_stats WHERE stat_key = ? AND server_id = ?',
                    [stat, serverId]
                );
            } else {
                totalRow = await extDb.get(
                    'SELECT COUNT(DISTINCT player_uuid) as total FROM player_stats WHERE stat_key = ?',
                    [stat]
                );
            }

            // Build linked accounts map for display
            const linkedMap = {};
            const linked = await extDb.all('SELECT minecraft_uuid, minecraft_username, user_id FROM linked_accounts');
            linked.forEach(l => { linkedMap[l.minecraft_uuid] = l; });

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            const entries = rows.map((row, i) => {
                const link = linkedMap[row.player_uuid];
                // row.username comes from mc_players via LEFT JOIN — could be null or a raw UUID
                // if it's a raw UUID (stored as fallback when mod sent no username), treat it as missing
                const rawUsername = row.username && !uuidRegex.test(row.username) ? row.username : null;
                const safeUsername = link
                    ? (link.minecraft_username || rawUsername)
                    : (rawUsername || (row.player_uuid ? row.player_uuid.replace(/-/g, '').slice(0, 8) + '...' : '???'));
                return {
                    rank: offset + i + 1,
                    player_uuid: row.player_uuid,
                    username: safeUsername,
                    minecraft_username: safeUsername,
                    stat_value: parseInt(row.stat_value) || 0,
                    is_registered: !!link
                };
            });

            res.json({
                stat,
                server_id: serverId || 'all',
                total: totalRow ? totalRow.total : 0,
                limit,
                offset,
                entries
            });
        } catch (err) {
            console.error('[MC] Leaderboard error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /account/:userId — get MC link info + top stats for a user (public)
    router.get('/account/:userId', async (req, res) => {
        try {
            const link = await extDb.get('SELECT minecraft_uuid, minecraft_username FROM linked_accounts WHERE user_id = ?', [req.params.userId]);
            if (!link) return res.json({ linked: false });

            // Get top stats across all servers
            const topStats = await extDb.all(
                `SELECT stat_key, SUM(stat_value) as total
                 FROM player_stats WHERE player_uuid = ?
                 GROUP BY stat_key ORDER BY total DESC LIMIT 10`,
                [link.minecraft_uuid]
            );

            res.json({ linked: true, ...link, top_stats: topStats });
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

            // Check if this UUID exists as an unregistered mc_player
            const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [entry.minecraft_uuid]);

            // Create link
            await extDb.run(
                'INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                [uuidv4(), req.user.id, entry.minecraft_uuid, entry.minecraft_username]
            );

            // Update mc_players to mark as linked (prevents duplicate "unlinked" entry on leaderboard)
            if (existingPlayer) {
                await extDb.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [req.user.id, entry.minecraft_uuid]);
            }

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
            // Reset mc_players.linked_user_id so they appear as unregistered on leaderboard again
            const link = await extDb.get('SELECT minecraft_uuid FROM linked_accounts WHERE user_id = ?', [req.user.id]);
            if (link) {
                await extDb.run('UPDATE mc_players SET linked_user_id = NULL WHERE uuid = ?', [link.minecraft_uuid]);
            }
            await extDb.run('DELETE FROM linked_accounts WHERE user_id = ?', [req.user.id]);
            res.json({ message: 'Minecraft account unlinked' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /verify — check if player UUID is registered (called by VonixCore on join)
    // ?uuid=<uuid>&username=<username>
    router.get('/verify', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { uuid, username } = req.query;
            if (!uuid) return res.status(400).json({ error: 'uuid required' });

            const formattedUuid = formatUUID(uuid);

            // Look up linked account by UUID
            const link = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [formattedUuid]);

            if (!link) {
                return res.json({ verified: false, registered: false, message: 'Not registered on this platform.' });
            }

            // Get platform user
            const user = await coreDb.get('SELECT id, username, role, level FROM users WHERE id = ?', [link.user_id]);
            if (!user) {
                return res.json({ verified: false, registered: false, message: 'Platform account not found.' });
            }

            // Get donation rank if donations extension loaded
            let donationRankId = null;
            let totalDonated = 0;
            try {
                const extLoader = require('../../../server/extension-loader');
                const donExt = extLoader.extensions.get('donations');
                if (donExt && donExt.enabled && donExt.db) {
                    const ur = await donExt.db.get(
                        `SELECT r.id, r.name, r.color FROM user_ranks ur
                         LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                         WHERE ur.user_id = ? AND ur.active = 1`, [user.id]);
                    if (ur) donationRankId = ur.id;
                    const donated = await donExt.db.get('SELECT SUM(amount) as total FROM donations WHERE user_id = ? AND status = ?', [user.id, 'completed']);
                    if (donated) totalDonated = donated.total || 0;
                }
            } catch (e) { /* ignore if donations ext not loaded */ }

            res.json({
                verified: true,
                registered: true,
                user: {
                    id: user.id,
                    username: user.username,
                    minecraft_username: link.minecraft_username,
                    minecraft_uuid: link.minecraft_uuid,
                    role: user.role,
                    total_donated: totalDonated,
                    donation_rank_id: donationRankId
                }
            });
        } catch (err) {
            console.error('[MC] Verify error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

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
                    level: user.level,
                    total_donated: 0,
                    donation_rank_id: null
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

    // POST /minecraft/register-direct — register new platform account with detailed info from in-game
    router.post('/minecraft/register-direct', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { minecraft_username, minecraft_uuid, password, email, display_name, username: platformUsername } = req.body;
            
            if (!minecraft_uuid || !password) return res.status(400).json({ error: 'minecraft_uuid and password required' });
            if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

            const uuid = formatUUID(minecraft_uuid);
            const mcUsername = minecraft_username || uuid;
            
            // Use provided platform username or fallback to MC username
            const finalUsername = platformUsername || mcUsername;
            const finalEmail = email || `${finalUsername.toLowerCase()}@mc.local`;
            const finalDisplayName = display_name || finalUsername;

            // Check if already linked
            const existingLink = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
            if (existingLink) {
                return res.status(409).json({ error: 'This Minecraft account is already registered. Use /login <password>.' });
            }

            // Check if username is taken on the platform
            const existingUser = await coreDb.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [finalUsername]);
            if (existingUser) {
                return res.status(409).json({ error: 'Username already taken on the platform. Choose another one.' });
            }

            // Check if email is taken
            const existingEmail = await coreDb.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [finalEmail]);
            if (existingEmail) {
                return res.status(409).json({ error: 'Email already taken on the platform. Choose another one.' });
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
                [userId, finalUsername, finalEmail, hashedPassword, finalDisplayName, now]
            );

            // Auto-link Minecraft account
            await extDb.run(
                'INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                [uuidv4(), userId, uuid, mcUsername]
            );

            // Also ensure they exist in mc_players for leaderboard
            const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
            if (existingPlayer) {
                await extDb.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [userId, uuid]);
            } else {
                await extDb.run(
                    'INSERT INTO mc_players (id, uuid, username, linked_user_id) VALUES (?, ?, ?, ?)',
                    [uuidv4(), uuid, mcUsername, userId]
                );
            }

            const token = jwt.sign({ id: userId, username: finalUsername }, JWT_SECRET, { expiresIn: '7d' });

            res.status(201).json({
                success: true,
                token,
                user: {
                    id: userId,
                    username: finalUsername,
                    minecraft_username: mcUsername,
                    minecraft_uuid: uuid,
                    role: 'member',
                    level: 1,
                    total_donated: 0,
                    donation_rank_id: null
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

    // POST /sync/stats — bulk stats sync from a Minecraft server
    router.post('/sync/stats', async (req, res) => {
        try {
            const server = await validateApiKey(req);
            if (!server) return res.status(403).json({ error: 'Invalid API key' });

            const { players } = req.body;
            if (!players || !Array.isArray(players) || players.length === 0) {
                return res.status(400).json({ error: 'No players to sync' });
            }

            let synced = 0;
            const errors = [];
            const now = new Date().toISOString();

            for (const player of players) {
                try {
                    const uuid = formatUUID(player.uuid);
                    const stats = player.stats || {};

                    // Upsert mc_players profile
                    const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
                    if (existingPlayer) {
                        if (player.username && player.username !== existingPlayer.username) {
                            await extDb.run('UPDATE mc_players SET username = ?, last_synced_at = ? WHERE id = ?',
                                [player.username, now, existingPlayer.id]);
                        } else {
                            await extDb.run('UPDATE mc_players SET last_synced_at = ? WHERE id = ?', [now, existingPlayer.id]);
                        }
                    } else {
                        await extDb.run(
                            'INSERT INTO mc_players (id, uuid, username, last_synced_at) VALUES (?, ?, ?, ?)',
                            [uuidv4(), uuid, player.username || null, now]
                        );
                        // If mod sent no username, fetch it async from Mojang via Ashcon proxy
                        if (!player.username) {
                            const uuidForFetch = uuid;
                            (async () => {
                                try {
                                    const resp = await fetch(`https://api.ashcon.app/mojang/v2/user/${uuidForFetch}`);
                                    if (resp.ok) {
                                        const data = await resp.json();
                                        if (data && data.username) {
                                            await extDb.run('UPDATE mc_players SET username = ? WHERE uuid = ?', [data.username, uuidForFetch]);
                                            console.log(`[MC] Repaired username for ${uuidForFetch}: ${data.username}`);
                                        }
                                    }
                                } catch (e) { /* non-fatal */ }
                            })();
                        }
                    }

                    // Update linked_accounts username if changed
                    const link = await extDb.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
                    if (link && player.username && player.username !== link.minecraft_username) {
                        await extDb.run('UPDATE linked_accounts SET minecraft_username = ? WHERE id = ?', [player.username, link.id]);
                    }

                    // Upsert each stat value
                    for (let [statKey, statValue] of Object.entries(stats)) {
                        if (typeof statValue !== 'number' || statValue < 0) continue;

                        // Normalize stat key — strip minecraft: and minecraft.custom: prefixes
                        // e.g. "minecraft.custom:minecraft.deaths" -> "deaths"
                        //      "minecraft:deaths" -> "deaths"
                        statKey = statKey
                            .replace(/^minecraft\.custom:minecraft\./, '')
                            .replace(/^minecraft\.custom:/, '')
                            .replace(/^minecraft:minecraft\./, '')
                            .replace(/^minecraft:/, '')
                            .replace(/^minecraft\./, '');

                        const existing = await extDb.get(
                            'SELECT id, stat_value FROM player_stats WHERE player_uuid = ? AND server_id = ? AND stat_key = ?',
                            [uuid, server.id, statKey]
                        );

                        if (existing) {
                            // Always take the latest value from the mod (it reads directly from MC stats)
                            await extDb.run(
                                'UPDATE player_stats SET stat_value = ?, last_synced_at = ? WHERE id = ?',
                                [statValue, now, existing.id]
                            );
                        } else {
                            await extDb.run(
                                'INSERT INTO player_stats (id, player_uuid, server_id, stat_key, stat_value, last_synced_at) VALUES (?, ?, ?, ?, ?, ?)',
                                [uuidv4(), uuid, server.id, statKey, statValue, now]
                            );
                        }
                    }

                    synced++;
                    if (synced % 10 === 0 || players.length <= 5) {
                        console.log(`[MC] Stats sync progress: ${synced}/${players.length} players`);
                    }
                } catch (e) {
                    errors.push(player.uuid);
                    console.error('[MC] Sync player error:', e);
                }
            }

            res.json({ success: true, synced, syncedCount: synced, errors });
        } catch (err) {
            console.error('[MC] Stats sync error:', err);
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
            await extDb.run('DELETE FROM player_stats WHERE server_id = ?', [req.params.id]);
            await extDb.run('DELETE FROM link_codes WHERE server_id = ?', [req.params.id]);
            
            // Clean up any potential orphaned foreign keys from deleted extensions (e.g. xpsync)
            try {
                await extDb.run('DELETE FROM server_xp WHERE server_id = ?', [req.params.id]);
            } catch (ignore) { /* Table might not exist, which is fine */ }

            await extDb.run('DELETE FROM mc_servers WHERE id = ?', [req.params.id]);
            res.json({ message: 'Server deleted' });
        } catch (err) {
            console.error('[MC] Delete server error:', err);
            res.status(500).json({ error: 'Server error: ' + err.message });
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

            // Check if this UUID exists as a mc_player
            const existingPlayer = await extDb.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
            const mcUsername = minecraft_username || (existingPlayer ? existingPlayer.username : null) || uuid;

            // Upsert linked_accounts
            const userLink = await extDb.get('SELECT * FROM linked_accounts WHERE user_id = ?', [userId]);
            if (userLink) {
                await extDb.run('UPDATE linked_accounts SET minecraft_uuid = ?, minecraft_username = ? WHERE id = ?',
                    [uuid, mcUsername, userLink.id]);
            } else {
                await extDb.run('INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
                    [uuidv4(), userId, uuid, mcUsername]);
            }

            // Update mc_players to mark as linked
            if (existingPlayer) {
                await extDb.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [userId, uuid]);
            } else {
                // Create mc_players entry
                await extDb.run(
                    'INSERT INTO mc_players (id, uuid, username, linked_user_id) VALUES (?, ?, ?, ?)',
                    [uuidv4(), uuid, mcUsername, userId]
                );
            }

            res.json({ message: 'Minecraft account assigned', minecraft_uuid: uuid, minecraft_username: mcUsername });
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
