/* =======================================
   Venary — Database Layer
   Unified async interface supporting both
   PostgreSQL (production) and SQLite (dev).

   Initialized from config by server/index.js:
     const db = require('./db');
     await db.init({ type: 'sqlite' });

   Usage:
     const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
   ======================================= */
const fs = require('fs');
const path = require('path');
const { createAdapter } = require('./factory');

let adapter = null;
let initialized = false;

const db = {
    /**
     * Initialize the database adapter and run schema migrations.
     * @param {Object} [config] - { type, connectionString, sqlitePath }
     */
    async init(config = {}) {
        if (initialized) return;

        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

        const type = config.type || process.env.DB_TYPE || 'sqlite';
        const connectionString = config.connectionString || process.env.DATABASE_URL || null;
        const sqlitePath = config.sqlitePath || process.env.SQLITE_PATH || undefined;

        adapter = createAdapter({ type, connectionString, sqlitePath });

        if (type === 'postgres' || type === 'postgresql') {
            console.log('  🐘 Using PostgreSQL database');
        } else {
            const relPath = path.relative(process.cwd(), adapter.dbPath || 'data/venary.db');
            console.log('  📦 Using SQLite database: ' + relPath);
        }

        await adapter.init(schemaSql);
        initialized = true;

        // Run column migrations for existing databases
        await db._runMigrations();

        // Migrate existing JSON data if present
        await db._migrateFromJSON();
    },

    /** Get the raw adapter type ('postgres' or 'sqlite'). */
    get type() {
        return adapter ? adapter.type : null;
    },

    async get(sql, params = []) {
        return adapter.get(sql, params);
    },

    async all(sql, params = []) {
        return adapter.all(sql, params);
    },

    async run(sql, params = []) {
        return adapter.run(sql, params);
    },

    async close() {
        if (adapter) await adapter.close();
    },

    /**
     * Safely add new columns to existing databases.
     */
    async _runMigrations() {
        const migrations = [
            "ALTER TABLE users ADD COLUMN skin_animation TEXT DEFAULT '{}'"
        ];
        for (const sql of migrations) {
            try { await adapter.run(sql); } catch (e) { /* column already exists */ }
        }
    },

    /**
     * One-time migration from the old JSON-based data store.
     */
    async _migrateFromJSON() {
        const jsonPath = path.join(__dirname, '..', '..', 'data', 'venary.json');
        if (!fs.existsSync(jsonPath)) return;

        const existing = await db.get('SELECT COUNT(*) as count FROM users');
        if (existing && existing.count > 0) return;

        console.log('  🔄 Migrating data from venary.json ...');

        let data;
        try {
            data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        } catch { return; }

        // Users
        for (const u of (data.users || [])) {
            await db.run(
                `INSERT INTO users (id, username, email, password, display_name, avatar, bio, gaming_tags,
                    level, xp, games_played, achievements, role, status, banned, ban_reason, last_seen, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [u.id, u.username, u.email, u.password, u.display_name || null, u.avatar || null, u.bio || null,
                typeof u.gaming_tags === 'string' ? u.gaming_tags : JSON.stringify(u.gaming_tags || []),
                u.level || 1, u.xp || 0, u.games_played || 0, u.achievements || 0,
                u.role || 'user', u.status || 'offline', u.banned ? 1 : 0, u.ban_reason || null,
                u.last_seen || null, u.created_at || new Date().toISOString()]
            );
        }

        // Friendships
        for (const f of (data.friendships || [])) {
            await db.run(
                `INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES (?, ?, ?, ?, ?)`,
                [f.id, f.user_id, f.friend_id, f.status, f.created_at || new Date().toISOString()]
            );
        }

        // Messages
        for (const m of (data.messages || [])) {
            await db.run(
                `INSERT INTO messages (id, sender_id, receiver_id, content, read, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [m.id, m.sender_id, m.receiver_id, m.content, m.read || 0, m.created_at || new Date().toISOString()]
            );
        }

        // Posts
        for (const p of (data.posts || [])) {
            await db.run(
                `INSERT INTO posts (id, user_id, content, image, post_type, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
                [p.id, p.user_id, p.content, p.image || null, p.post_type || 'text', p.created_at || new Date().toISOString()]
            );
        }

        // Comments
        for (const c of (data.comments || [])) {
            await db.run(
                `INSERT INTO comments (id, post_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
                [c.id, c.post_id, c.user_id, c.content, c.created_at || new Date().toISOString()]
            );
        }

        // Likes
        for (const l of (data.likes || [])) {
            await db.run(
                `INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
                [l.id, l.post_id, l.user_id, l.created_at || new Date().toISOString()]
            );
        }

        // Reports
        for (const r of (data.reports || [])) {
            await db.run(
                `INSERT INTO reports (id, reporter_id, reported_user_id, reason, status, admin_note, resolved_by, resolved_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [r.id, r.reporter_id, r.reported_user_id, r.reason, r.status || 'pending',
                r.admin_note || null, r.resolved_by || null, r.resolved_at || null, r.created_at || new Date().toISOString()]
            );
        }

        const backupPath = jsonPath.replace('.json', '.json.bak');
        fs.renameSync(jsonPath, backupPath);
        console.log('  ✅ JSON data migrated successfully! (old file renamed to venary.json.bak)');
    }
};

module.exports = db;
