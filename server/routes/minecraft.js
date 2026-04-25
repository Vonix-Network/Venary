/* =======================================
   Minecraft — API Routes
   Migrated from extensions/minecraft/server/routes.js
   Now uses shared db instead of extDb/coreDb parameters.
   Backward-compat: also mounted at /api/ext/minecraft/ in server/index.js
   ======================================= */
'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto  = require('crypto');
const db      = require('../db');
const { authenticateToken, optionalAuth, JWT_SECRET } = require('../middleware/auth');
const Config  = require('../config');
const { smartPing } = require('../services/minecraft/pinger');

// ── Helpers ──────────────────────────────────────────
function requireAdmin(req, res, next) {
    db.get('SELECT role FROM users WHERE id = ?', [req.user.id]).then(u => {
        if (!u || !['admin', 'superadmin', 'moderator'].includes(u.role)) return res.status(403).json({ error: 'Admin access required' });
        next();
    }).catch(() => res.status(500).json({ error: 'Server error' }));
}

async function validateApiKey(req) {
    const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!key) return null;
    return db.get('SELECT * FROM mc_servers WHERE api_key = ?', [key]);
}

function generateApiKey()  { return 'vmc_' + crypto.randomBytes(24).toString('hex'); }
function generateLinkCode() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function formatUUID(uuid) {
    const clean = uuid.replace(/-/g, '').toLowerCase();
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

// Stat metadata
const STAT_CATEGORIES = {
    core:         ['deaths', 'mob_kills', 'player_kills', 'play_time', 'total_world_time'],
    movement:     ['walk_one_cm', 'sprint_one_cm', 'crouch_one_cm', 'climb_one_cm', 'fly_one_cm', 'swim_one_cm', 'fall_one_cm', 'walk_on_water_one_cm', 'walk_under_water_one_cm', 'horse_one_cm', 'boat_one_cm', 'minecart_one_cm', 'aviate_one_cm', 'pig_one_cm', 'strider_one_cm'],
    combat:       ['damage_dealt', 'damage_taken', 'damage_blocked_by_shield', 'damage_absorbed', 'damage_resisted', 'damage_dealt_absorbed', 'damage_dealt_resisted'],
    progression:  ['total_blocks_mined', 'total_items_crafted', 'total_items_used', 'total_items_broken', 'total_items_picked_up', 'total_items_dropped', 'total_entities_killed', 'total_killed_by', 'animals_bred', 'fish_caught', 'raid_win', 'raid_trigger', 'traded_with_villager', 'enchant_item'],
    interactions: ['jump', 'drop', 'open_chest', 'open_enderchest', 'open_shulker_box', 'play_noteblock', 'interact_with_crafting_table', 'interact_with_furnace', 'interact_with_blast_furnace', 'interact_with_smoker', 'interact_with_anvil', 'interact_with_brewingstand', 'interact_with_beacon', 'interact_with_smithing_table', 'interact_with_grindstone', 'interact_with_stonecutter', 'interact_with_loom', 'interact_with_cartography_table', 'sleep_in_bed', 'leave_game', 'time_since_death', 'time_since_rest']
};
const ALL_TRACKED_STATS = Object.values(STAT_CATEGORIES).flat();

// ══════════════════════════════════════════════════════
// PUBLIC ENDPOINTS
// ══════════════════════════════════════════════════════

router.get('/servers', optionalAuth, async (req, res) => {
    try {
        const servers = await db.all('SELECT * FROM mc_servers ORDER BY sort_order ASC, name ASC');

        let isLinked = false;
        if (req.user) {
            const linked = await db.get('SELECT id FROM linked_accounts WHERE user_id = ?', [req.user.id]);
            isLinked = !!linked;
        }

        const results = servers.map(s => ({
            id: s.id, name: s.name, address: s.address, port: s.port,
            description: s.description, icon: s.icon,
            version: s.version, modpack_name: s.modpack_name,
            curseforge_url: s.curseforge_url, modrinth_url: s.modrinth_url,
            bluemap_url: s.bluemap_url, hide_port: !!s.hide_port, is_bedrock: !!s.is_bedrock,
            user_linked: isLinked
        }));
        res.json(results);
    } catch (err) {
        console.error('[MC] Server list error:', err);
        res.status(500).json({ error: 'Failed to fetch servers' });
    }
});

// Individual server live status (used by frontend for progressive loading)
router.get('/servers/:id/status', async (req, res) => {
    try {
        const server = await db.get('SELECT id, address, port, icon, version, is_bedrock FROM mc_servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const startTime = Date.now();
        const status = await smartPing(server.address, server.port, !!server.is_bedrock);
        if (!status.responseTimeMs) status.responseTimeMs = Date.now() - startTime;
        res.json({
            online: status.online,
            players: status.players,
            motd: status.motd,
            version: status.version || server.version,
            icon: status.icon || server.icon,
            responseTimeMs: status.responseTimeMs
        });
    } catch (err) {
        console.error('[MC] Server status error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/servers/:id', async (req, res) => {
    try {
        const server = await db.get('SELECT * FROM mc_servers WHERE id = ?', [req.params.id]);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const status = await smartPing(server.address, server.port, !!server.is_bedrock);
        res.json({ ...server, hide_port: !!server.hide_port, is_bedrock: !!server.is_bedrock, online: status.online, players: status.players, version: status.version || server.version, motd: status.motd, icon: status.icon || server.icon, responseTimeMs: status.responseTimeMs });
    } catch (err) {
        console.error('[MC] Server detail error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/servers/:id/history/span', async (req, res) => {
    try {
        const row = await db.get(
            'SELECT MIN(checked_at) as oldest, COUNT(*) as total FROM uptime_history WHERE server_id = ?',
            [req.params.id]
        );
        if (!row || !row.oldest) return res.json({ hoursAvailable: 0 });
        const hours = Math.floor((Date.now() - new Date(row.oldest).getTime()) / (1000 * 60 * 60));
        res.json({ hoursAvailable: hours });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/servers/:id/history', async (req, res) => {
    try {
        // Drill-down: raw per-minute records for one specific hour
        if (req.query.hour) {
            const hourStart = new Date(req.query.hour);
            if (isNaN(hourStart.getTime())) return res.status(400).json({ error: 'Invalid hour' });
            const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
            const raw = await db.all(
                'SELECT online, players_online, players_max, response_time_ms, checked_at FROM uptime_history WHERE server_id = ? AND checked_at >= ? AND checked_at < ? ORDER BY checked_at ASC',
                [req.params.id, hourStart.toISOString(), hourEnd.toISOString()]
            );
            return res.json({ records: raw, stats: {} });
        }

        const rangeMap = { '6h': 6, '12h': 12, '24h': 24, '3d': 72, '7d': 168, '10d': 240, '20d': 480, '30d': 720 };
        const hours = rangeMap[req.query.range] || 24;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const raw = await db.all(
            'SELECT online, players_online, players_max, response_time_ms, checked_at FROM uptime_history WHERE server_id = ? AND checked_at > ? ORDER BY checked_at ASC',
            [req.params.id, since]
        );

        // For ranges over 24h, aggregate by hour in JS (keeps chart readable and works on any DB)
        let records = raw;
        if (hours > 24 && raw.length > 0) {
            const buckets = new Map();
            for (const r of raw) {
                const d = new Date(r.checked_at);
                d.setMinutes(0, 0, 0);
                const key = d.toISOString();
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(r);
            }
            records = Array.from(buckets.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, rows]) => {
                    const onlineFrac = rows.filter(r => r.online).length / rows.length;
                    const playerCounts = rows.map(r => r.players_online || 0);
                    const rtRows = rows.filter(r => r.response_time_ms);
                    return {
                        checked_at: key,
                        online: onlineFrac >= 0.5 ? 1 : 0,
                        players_online: Math.max(...playerCounts),
                        players_max: Math.max(...rows.map(r => r.players_max || 0)),
                        response_time_ms: rtRows.length ? Math.round(rtRows.reduce((a, b) => a + b.response_time_ms, 0) / rtRows.length) : null
                    };
                });
        }

        const total = records.length;
        const onlineCount = records.filter(r => r.online).length;
        const playerCounts = records.filter(r => r.players_online != null).map(r => r.players_online);
        res.json({
            records,
            stats: {
                uptimePercentage: total > 0 ? (onlineCount / total) * 100 : 0,
                avgPlayers: playerCounts.length ? Math.round(playerCounts.reduce((a, b) => a + b, 0) / playerCounts.length) : 0,
                peakPlayers: playerCounts.length ? Math.max(...playerCounts) : 0,
                totalChecks: total
            }
        });
    } catch (err) {
        console.error('[MC] History error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/leaderboard/debug', async (req, res) => {
    try {
        const totalRows = await db.get('SELECT COUNT(*) as cnt FROM player_stats');
        const keys = await db.all('SELECT stat_key, COUNT(*) as cnt FROM player_stats GROUP BY stat_key ORDER BY cnt DESC LIMIT 30');
        const servers = await db.all('SELECT id, name FROM mc_servers');
        res.json({ totalRows: totalRows ? totalRows.cnt : 0, distinctStatKeys: keys, servers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/leaderboard/meta', async (req, res) => {
    try {
        const servers = await db.all('SELECT id, name FROM mc_servers ORDER BY sort_order ASC, name ASC');
        res.json({ categories: STAT_CATEGORIES, servers });
    } catch (err) {
        console.error('[MC] Leaderboard meta error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/leaderboard', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const stat = req.query.stat || 'play_time';
        const serverId = req.query.server_id;

        if (!ALL_TRACKED_STATS.includes(stat)) return res.status(400).json({ error: 'Invalid stat key', valid: ALL_TRACKED_STATS });

        let rows, totalRow;
        if (serverId && serverId !== 'all') {
            rows = await db.all(
                `SELECT ps.player_uuid, ps.stat_value, mp.username FROM player_stats ps LEFT JOIN mc_players mp ON mp.uuid = ps.player_uuid WHERE ps.stat_key = ? AND ps.server_id = ? ORDER BY ps.stat_value DESC LIMIT ? OFFSET ?`,
                [stat, serverId, limit, offset]
            );
            totalRow = await db.get('SELECT COUNT(DISTINCT player_uuid) as total FROM player_stats WHERE stat_key = ? AND server_id = ?', [stat, serverId]);
        } else {
            rows = await db.all(
                `SELECT ps.player_uuid, SUM(ps.stat_value) as stat_value, mp.username FROM player_stats ps LEFT JOIN mc_players mp ON mp.uuid = ps.player_uuid WHERE ps.stat_key = ? GROUP BY ps.player_uuid, mp.username ORDER BY stat_value DESC LIMIT ? OFFSET ?`,
                [stat, limit, offset]
            );
            totalRow = await db.get('SELECT COUNT(DISTINCT player_uuid) as total FROM player_stats WHERE stat_key = ?', [stat]);
        }

        const linked = await db.all('SELECT minecraft_uuid, minecraft_username, user_id FROM linked_accounts');
        const linkedMap = {};
        linked.forEach(l => { linkedMap[l.minecraft_uuid] = l; });

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const entries = rows.map((row, i) => {
            const link = linkedMap[row.player_uuid];
            const rawUsername = row.username && !uuidRegex.test(row.username) ? row.username : null;
            const safeUsername = link ? (link.minecraft_username || rawUsername) : (rawUsername || (row.player_uuid ? row.player_uuid.replace(/-/g, '').slice(0, 8) + '...' : '???'));
            return { rank: offset + i + 1, player_uuid: row.player_uuid, username: safeUsername, minecraft_username: safeUsername, stat_value: parseInt(row.stat_value) || 0, is_registered: !!link };
        });

        res.json({ stat, server_id: serverId || 'all', total: totalRow ? totalRow.total : 0, limit, offset, entries });
    } catch (err) {
        console.error('[MC] Leaderboard error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.get('/account/:userId', async (req, res) => {
    try {
        const link = await db.get('SELECT minecraft_uuid, minecraft_username FROM linked_accounts WHERE user_id = ?', [req.params.userId]);
        if (!link) return res.json({ linked: false });
        const topStats = await db.all(`SELECT stat_key, SUM(stat_value) as total FROM player_stats WHERE player_uuid = ? GROUP BY stat_key ORDER BY total DESC LIMIT 10`, [link.minecraft_uuid]);
        res.json({ linked: true, ...link, top_stats: topStats });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════
// AUTHENTICATED ENDPOINTS
// ══════════════════════════════════════════════════════

router.post('/link', authenticateToken, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: 'Link code required' });

        const entry = await db.get('SELECT * FROM link_codes WHERE code = ? AND expires_at > ?', [code.toUpperCase(), new Date().toISOString()]);
        if (!entry) return res.status(400).json({ error: 'Invalid or expired link code' });

        const existing = await db.get('SELECT id FROM linked_accounts WHERE user_id = ?', [req.user.id]);
        if (existing) return res.status(409).json({ error: 'You already have a linked Minecraft account. Unlink first.' });

        const uuidTaken = await db.get('SELECT user_id FROM linked_accounts WHERE minecraft_uuid = ?', [entry.minecraft_uuid]);
        if (uuidTaken) return res.status(409).json({ error: 'This Minecraft account is already linked to another user.' });

        const existingPlayer = await db.get('SELECT * FROM mc_players WHERE uuid = ?', [entry.minecraft_uuid]);

        await db.run('INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
            [uuidv4(), req.user.id, entry.minecraft_uuid, entry.minecraft_username]);

        if (existingPlayer) await db.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [req.user.id, entry.minecraft_uuid]);
        await db.run('DELETE FROM link_codes WHERE id = ?', [entry.id]);

        res.json({ message: 'Minecraft account linked!', minecraft_username: entry.minecraft_username, minecraft_uuid: entry.minecraft_uuid });
    } catch (err) {
        console.error('[MC] Link error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/link', authenticateToken, async (req, res) => {
    try {
        const link = await db.get('SELECT minecraft_uuid FROM linked_accounts WHERE user_id = ?', [req.user.id]);
        if (link) await db.run('UPDATE mc_players SET linked_user_id = NULL WHERE uuid = ?', [link.minecraft_uuid]);
        await db.run('DELETE FROM linked_accounts WHERE user_id = ?', [req.user.id]);
        res.json({ message: 'Minecraft account unlinked' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════
// SERVER API KEY PROTECTED (from MC mod/plugin)
// ══════════════════════════════════════════════════════

router.get('/verify', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { uuid, username } = req.query;
        if (!uuid && !username) return res.status(400).json({ error: 'uuid or username required' });

        let link = null;
        if (uuid) link = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [formatUUID(uuid)]);
        if (!link && username) link = await db.get('SELECT * FROM linked_accounts WHERE LOWER(minecraft_username) = LOWER(?)', [username]);

        if (!link) return res.json({ verified: false, registered: false, message: 'Player not registered' });

        const user = await db.get('SELECT id, username, display_name, role, level, xp FROM users WHERE id = ?', [link.user_id]);
        if (!user) return res.json({ verified: false, registered: false });

        // Donation rank — now in unified DB
        let donationRank = null;
        try {
            const ur = await db.get(
                `SELECT r.name, r.luckperms_group, r.color FROM user_ranks ur
                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                 WHERE ur.user_id = ? AND ur.active = 1 AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
                [user.id, new Date().toISOString()]
            );
            if (ur) donationRank = { name: ur.name, luckperms_group: ur.luckperms_group, color: ur.color };
        } catch { /* table may not exist in older schemas */ }

        res.json({ verified: true, registered: true, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role, level: user.level, minecraft_username: link.minecraft_username, minecraft_uuid: link.minecraft_uuid, donation_rank: donationRank } });
    } catch (err) {
        console.error('[MC] Verify error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/minecraft/login', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { minecraft_uuid, password } = req.body;
        if (!minecraft_uuid || !password) return res.status(400).json({ error: 'minecraft_uuid and password required' });

        const uuid = formatUUID(minecraft_uuid);
        const link = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
        if (!link) return res.status(401).json({ error: 'No account linked to this Minecraft UUID. Use /register first.' });

        const user = await db.get('SELECT * FROM users WHERE id = ?', [link.user_id]);
        if (!user) return res.status(401).json({ error: 'Platform account not found' });

        const bcrypt = require('bcryptjs');
        if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid password' });
        if (user.banned) return res.status(403).json({ error: 'Your account has been banned.' });

        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        await db.run("UPDATE users SET last_seen = ?, status = ? WHERE id = ?", [new Date().toISOString(), 'online', user.id]);

        res.json({ success: true, token, user: { id: user.id, username: user.username, minecraft_username: link.minecraft_username, minecraft_uuid: link.minecraft_uuid, role: user.role, level: user.level, total_donated: 0, donation_rank_id: null } });
    } catch (err) {
        console.error('[MC] Minecraft login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/minecraft/register', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { minecraft_username, minecraft_uuid } = req.body;
        if (!minecraft_uuid) return res.status(400).json({ error: 'minecraft_uuid required' });

        const uuid = formatUUID(minecraft_uuid);
        const username = minecraft_username || uuid;

        const existingLink = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
        if (existingLink) return res.json({ success: true, already_registered: true, code: null });

        await db.run('DELETE FROM link_codes WHERE minecraft_uuid = ?', [uuid]);
        const code = generateLinkCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await db.run('INSERT INTO link_codes (id, code, minecraft_uuid, minecraft_username, server_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), code, uuid, username, server.id, expiresAt]);

        res.json({ success: true, code, expires_in: 600 });
    } catch (err) {
        console.error('[MC] Minecraft register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/minecraft/register-direct', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { minecraft_username, minecraft_uuid, password, email, display_name, username: platformUsername } = req.body;
        if (!minecraft_uuid || !password) return res.status(400).json({ error: 'minecraft_uuid and password required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const uuid = formatUUID(minecraft_uuid);
        const mcUsername = minecraft_username || uuid;
        const finalUsername = platformUsername || mcUsername;
        const finalEmail = email || `${finalUsername.toLowerCase()}@mc.local`;
        const finalDisplayName = display_name || finalUsername;

        const existingLink = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
        if (existingLink) return res.status(409).json({ error: 'This Minecraft account is already registered. Use /login <password>.' });

        const existingUser = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [finalUsername]);
        if (existingUser) return res.status(409).json({ error: 'Username already taken on the platform. Choose another one.' });

        const existingEmail = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [finalEmail]);
        if (existingEmail) return res.status(409).json({ error: 'Email already taken on the platform. Choose another one.' });

        const bcrypt = require('bcryptjs');
        const jwt    = require('jsonwebtoken');
        const hashedPassword = bcrypt.hashSync(password, 10);
        const userId = uuidv4();
        const now    = new Date().toISOString();

        await db.run('INSERT INTO users (id, username, email, password, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, finalUsername, finalEmail, hashedPassword, finalDisplayName, now]);

        await db.run('INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)',
            [uuidv4(), userId, uuid, mcUsername]);

        const existingPlayer = await db.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
        if (existingPlayer) {
            await db.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [userId, uuid]);
        } else {
            await db.run('INSERT INTO mc_players (id, uuid, username, linked_user_id) VALUES (?, ?, ?, ?)', [uuidv4(), uuid, mcUsername, userId]);
        }

        const token = jwt.sign({ id: userId, username: finalUsername }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ success: true, token, user: { id: userId, username: finalUsername, minecraft_username: mcUsername, minecraft_uuid: uuid, role: 'member', level: 1, total_donated: 0, donation_rank_id: null } });
    } catch (err) {
        console.error('[MC] Minecraft register-direct error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/sync/stats', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { players } = req.body;
        if (!players || !Array.isArray(players) || players.length === 0) return res.status(400).json({ error: 'No players to sync' });

        let synced = 0;
        const errors = [];
        const now = new Date().toISOString();

        for (const player of players) {
            try {
                const uuid = formatUUID(player.uuid);
                const stats = player.stats || {};

                const existingPlayer = await db.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
                if (existingPlayer) {
                    if (player.username && player.username !== existingPlayer.username) {
                        await db.run('UPDATE mc_players SET username = ?, last_synced_at = ? WHERE id = ?', [player.username, now, existingPlayer.id]);
                    } else {
                        await db.run('UPDATE mc_players SET last_synced_at = ? WHERE id = ?', [now, existingPlayer.id]);
                    }
                } else {
                    await db.run('INSERT INTO mc_players (id, uuid, username, last_synced_at) VALUES (?, ?, ?, ?)', [uuidv4(), uuid, player.username || null, now]);
                    if (!player.username) {
                        const uuidForFetch = uuid;
                        (async () => {
                            try {
                                const resp = await fetch(`https://api.ashcon.app/mojang/v2/user/${uuidForFetch}`);
                                if (resp.ok) {
                                    const data = await resp.json();
                                    if (data?.username) await db.run('UPDATE mc_players SET username = ? WHERE uuid = ?', [data.username, uuidForFetch]);
                                }
                            } catch { /* non-fatal */ }
                        })();
                    }
                }

                const link = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
                if (link && player.username && player.username !== link.minecraft_username) {
                    await db.run('UPDATE linked_accounts SET minecraft_username = ? WHERE id = ?', [player.username, link.id]);
                }

                for (let [statKey, statValue] of Object.entries(stats)) {
                    if (typeof statValue !== 'number' || statValue < 0) continue;
                    statKey = statKey.replace(/^minecraft\.custom:minecraft\./, '').replace(/^minecraft\.custom:/, '').replace(/^minecraft:minecraft\./, '').replace(/^minecraft:/, '').replace(/^minecraft\./, '');

                    const existing = await db.get('SELECT id, stat_value FROM player_stats WHERE player_uuid = ? AND server_id = ? AND stat_key = ?', [uuid, server.id, statKey]);
                    if (existing) {
                        await db.run('UPDATE player_stats SET stat_value = ?, last_synced_at = ? WHERE id = ?', [statValue, now, existing.id]);
                    } else {
                        await db.run('INSERT INTO player_stats (id, player_uuid, server_id, stat_key, stat_value, last_synced_at) VALUES (?, ?, ?, ?, ?, ?)', [uuidv4(), uuid, server.id, statKey, statValue, now]);
                    }
                }

                synced++;
                if (synced % 10 === 0 || players.length <= 5) console.log(`[MC] Stats sync progress: ${synced}/${players.length} players`);
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

router.post('/link/generate', async (req, res) => {
    try {
        const server = await validateApiKey(req);
        if (!server) return res.status(403).json({ error: 'Invalid API key' });

        const { uuid, username } = req.body;
        if (!uuid || !username) return res.status(400).json({ error: 'uuid and username required' });

        const formattedUuid = formatUUID(uuid);
        await db.run('DELETE FROM link_codes WHERE expires_at < ?', [new Date().toISOString()]);
        await db.run('DELETE FROM link_codes WHERE minecraft_uuid = ?', [formattedUuid]);

        const code = generateLinkCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db.run('INSERT INTO link_codes (id, code, minecraft_uuid, minecraft_username, server_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), code, formattedUuid, username, server.id, expiresAt]);

        res.json({ success: true, code, expiresIn: 300 });
    } catch (err) {
        console.error('[MC] Link generate error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ══════════════════════════════════════════════════════

router.post('/admin/servers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, address, port, description, modpack_name, curseforge_url, modrinth_url, bluemap_url, hide_port, is_bedrock, sort_order } = req.body;
        if (!name || !address) return res.status(400).json({ error: 'Name and address are required' });

        const id = uuidv4();
        const api_key = generateApiKey();
        await db.run(
            `INSERT INTO mc_servers (id, name, address, port, description, modpack_name, curseforge_url, modrinth_url, bluemap_url, api_key, hide_port, is_bedrock, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, address, port || 25565, description || null, modpack_name || null, curseforge_url || null, modrinth_url || null, bluemap_url || null, api_key, hide_port ? 1 : 0, is_bedrock ? 1 : 0, sort_order || 0]
        );

        const server = await db.get('SELECT * FROM mc_servers WHERE id = ?', [id]);
        res.status(201).json(server);
    } catch (err) {
        console.error('[MC] Create server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/admin/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const server = await db.get('SELECT id FROM mc_servers WHERE id = ?', [req.params.id]);
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
        await db.run(`UPDATE mc_servers SET ${updates.join(', ')} WHERE id = ?`, values);
        res.json(await db.get('SELECT * FROM mc_servers WHERE id = ?', [req.params.id]));
    } catch (err) {
        console.error('[MC] Update server error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/admin/servers/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await db.run('DELETE FROM uptime_history WHERE server_id = ?', [req.params.id]);
        await db.run('DELETE FROM player_stats WHERE server_id = ?', [req.params.id]);
        await db.run('DELETE FROM link_codes WHERE server_id = ?', [req.params.id]);
        await db.run('DELETE FROM mc_servers WHERE id = ?', [req.params.id]);
        res.json({ message: 'Server deleted' });
    } catch (err) {
        console.error('[MC] Delete server error:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

router.post('/admin/servers/:id/regenerate-key', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const newKey = generateApiKey();
        await db.run('UPDATE mc_servers SET api_key = ? WHERE id = ?', [newKey, req.params.id]);
        res.json({ api_key: newKey });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/admin/users/:id/minecraft', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { minecraft_uuid, minecraft_username } = req.body;
        if (!minecraft_uuid) return res.status(400).json({ error: 'minecraft_uuid is required' });

        const userId = req.params.id;
        const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const uuid = formatUUID(minecraft_uuid);
        const existing = await db.get('SELECT * FROM linked_accounts WHERE minecraft_uuid = ?', [uuid]);
        if (existing && existing.user_id !== userId) return res.status(409).json({ error: 'This UUID is already linked to another user' });

        const existingPlayer = await db.get('SELECT * FROM mc_players WHERE uuid = ?', [uuid]);
        const mcUsername = minecraft_username || (existingPlayer ? existingPlayer.username : null) || uuid;

        const userLink = await db.get('SELECT * FROM linked_accounts WHERE user_id = ?', [userId]);
        if (userLink) {
            await db.run('UPDATE linked_accounts SET minecraft_uuid = ?, minecraft_username = ? WHERE id = ?', [uuid, mcUsername, userLink.id]);
        } else {
            await db.run('INSERT INTO linked_accounts (id, user_id, minecraft_uuid, minecraft_username) VALUES (?, ?, ?, ?)', [uuidv4(), userId, uuid, mcUsername]);
        }

        if (existingPlayer) {
            await db.run('UPDATE mc_players SET linked_user_id = ? WHERE uuid = ?', [userId, uuid]);
        } else {
            await db.run('INSERT INTO mc_players (id, uuid, username, linked_user_id) VALUES (?, ?, ?, ?)', [uuidv4(), uuid, mcUsername, userId]);
        }

        res.json({ message: 'Minecraft account assigned', minecraft_uuid: uuid, minecraft_username: mcUsername });
    } catch (err) {
        console.error('[MC] Admin assign error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ══════════════════════════════════════════════════════
// BACKGROUND PING CRON
// ══════════════════════════════════════════════════════
const offlineStrikes = new Map();

async function sendDiscordOfflineAlert(server, strikes) {
    const cfg = Config.load() || {};
    const discord = cfg.discord || {};

    const embed = {
        color: 0xff0000, title: '🚨 Server Downtime Alert',
        description: `**${server.name}** has been detected as offline ${strikes} times in a row.`,
        fields: [
            { name: '🔧 Action Required', value: 'Please check the server status and investigate the issue.' },
            { name: '⏰ Detected At', value: new Date().toLocaleString(), inline: true },
            { name: '📊 Consecutive Failures', value: String(strikes), inline: true }
        ],
        footer: { text: 'Venary Network Server Monitor • ' + new Date().toLocaleString() }
    };
    const payload = { embeds: [embed] };

    if (discord.uptimeRolePing && discord.botToken && discord.guildId) {
        try {
            const discordBot = require('../discordBot');
            const success = await discordBot.dmMembersByRole(discord.guildId, discord.uptimeRolePing, payload);
            if (success) return;
        } catch { /* fall through to webhook */ }
    }

    if (discord.webhookUrl) {
        if (discord.uptimeRolePing && !discord.botToken) payload.content = `**Attention:** <@&${discord.uptimeRolePing.replace(/[^0-9]/g, '')}>`;
        try {
            await fetch(discord.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } catch (err) {
            console.error('[MC] Discord webhook alert failed:', err);
        }
    }
}

router._pingAll = async function () {
    try {
        const servers = await db.all('SELECT id, name, address, port, is_bedrock FROM mc_servers');
        for (const s of servers) {
            const status = await smartPing(s.address, s.port, !!s.is_bedrock);
            await db.run(
                'INSERT INTO uptime_history (server_id, online, players_online, players_max, response_time_ms, checked_at) VALUES (?, ?, ?, ?, ?, ?)',
                [s.id, status.online ? 1 : 0, status.players?.online || 0, status.players?.max || 0, status.responseTimeMs || null, new Date().toISOString()]
            );

            if (!status.online) {
                const currentStrikes = (offlineStrikes.get(s.id) || 0) + 1;
                offlineStrikes.set(s.id, currentStrikes);
                const cfg = Config.load() || {};
                const discordCfg = cfg.discord || {};
                const threshold = parseInt(discordCfg.uptimeStrikeThreshold) || 5;
                const repeat    = parseInt(discordCfg.uptimeStrikeRepeat) || 10;
                if (currentStrikes === threshold || (currentStrikes > threshold && (currentStrikes - threshold) % repeat === 0)) {
                    await sendDiscordOfflineAlert(s, currentStrikes);
                }
            } else {
                offlineStrikes.delete(s.id);
            }
        }
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.run('DELETE FROM uptime_history WHERE checked_at < ?', [cutoff]);
    } catch (err) {
        console.error('[MC] Ping cron error:', err);
    }
};

setInterval(() => router._pingAll(), 60 * 1000);
setTimeout(() => router._pingAll(), 5000);

module.exports = router;
