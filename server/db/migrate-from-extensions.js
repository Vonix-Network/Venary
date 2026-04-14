#!/usr/bin/env node
/**
 * Venary — Extension-to-Core Data Migration Script
 *
 * Migrates all data from isolated extension databases into the unified
 * Venary database, then optionally cleans up the old extension schemas/files.
 *
 * PostgreSQL: copies rows from ext_* schemas → public schema, then drops
 *             the ext_* schemas.
 * SQLite:     copies rows from data/ext_*.db files → data/venary.db, then
 *             deletes the ext_*.db files.
 *
 * Fully idempotent — uses ON CONFLICT DO NOTHING so re-runs are safe.
 *
 * Usage:
 *   node server/db/migrate-from-extensions.js
 *   node server/db/migrate-from-extensions.js --dry-run
 *   node server/db/migrate-from-extensions.js --only minecraft,donations
 *   node server/db/migrate-from-extensions.js --no-cleanup
 */
'use strict';

const path    = require('path');
const fs      = require('fs');

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const NO_CLEANUP = args.includes('--no-cleanup');
const ONLY       = (args.find(a => a.startsWith('--only=')) || '').split('=')[1]?.split(',') || null;

if (DRY_RUN) console.log('\n[migrate] DRY RUN — no writes will be committed.\n');

// ── Config ────────────────────────────────────────────────────────────────────
const Config = require('../config');
if (!Config.isSetupComplete()) {
    console.error('[migrate] Setup is not complete. Run the app once first.');
    process.exit(1);
}
const dbCfg = Config.getDatabaseConfig();
const IS_PG = (dbCfg.type || 'sqlite').toLowerCase().startsWith('postgres');

// ── Extension → target-table mapping ─────────────────────────────────────────
// Each entry: { extSchema, tables: [ { src, dest } ] }
// 'src' = table name in the extension schema/db
// 'dest' = table name in the unified public schema (usually identical)
const EXT_MAP = {
    minecraft: {
        extSchema: 'ext_minecraft',
        sqliteFile: 'ext_minecraft.db',
        tables: [
            { src: 'mc_servers',      dest: 'mc_servers' },
            { src: 'linked_accounts', dest: 'linked_accounts' },
            { src: 'player_stats',    dest: 'player_stats' },
            { src: 'mc_players',      dest: 'mc_players' },
            { src: 'uptime_history',  dest: 'uptime_history' },
            { src: 'link_codes',      dest: 'link_codes' },
        ],
    },
    donations: {
        extSchema: 'ext_donations',
        sqliteFile: 'ext_donations.db',
        tables: [
            { src: 'donation_ranks',         dest: 'donation_ranks' },
            { src: 'donations',              dest: 'donations' },
            { src: 'user_ranks',             dest: 'user_ranks' },
            { src: 'rank_conversions',       dest: 'rank_conversions' },
            { src: 'user_crypto_addresses',  dest: 'user_crypto_addresses' },
            { src: 'crypto_payment_intents', dest: 'crypto_payment_intents' },
            { src: 'anytime_address_txs',    dest: 'anytime_address_txs' },
            { src: 'user_balances',          dest: 'user_balances' },
            { src: 'balance_transactions',   dest: 'balance_transactions' },
            { src: 'user_preferences',       dest: 'user_preferences' },
            { src: 'admin_wallet_addresses', dest: 'admin_wallet_addresses' },
        ],
    },
    forum: {
        extSchema: 'ext_forum',
        sqliteFile: 'ext_forum.db',
        tables: [
            // Old extension used 'categories'/'threads'/'posts'; unified schema renamed them
            { src: 'categories',      dest: 'forum_categories' },
            { src: 'threads',         dest: 'forum_threads' },
            { src: 'posts',           dest: 'forum_posts' },
            // Also handle if already renamed
            { src: 'forum_categories', dest: 'forum_categories' },
            { src: 'forum_threads',    dest: 'forum_threads' },
            { src: 'forum_posts',      dest: 'forum_posts' },
        ],
    },
    messenger: {
        extSchema: 'ext_messenger',
        sqliteFile: 'ext_messenger.db',
        tables: [
            { src: 'spaces',             dest: 'spaces' },
            { src: 'categories',         dest: 'messenger_categories' },
            { src: 'messenger_categories', dest: 'messenger_categories' },
            { src: 'channels',           dest: 'channels' },
            { src: 'roles',              dest: 'roles' },
            { src: 'members',            dest: 'members' },
            { src: 'member_roles',       dest: 'member_roles' },
            { src: 'channel_messages',   dest: 'channel_messages' },
            { src: 'dm_channels',        dest: 'dm_channels' },
            { src: 'dm_members',         dest: 'dm_members' },
            { src: 'dm_messages',        dest: 'dm_messages' },
            { src: 'read_states',        dest: 'read_states' },
            { src: 'webhooks',           dest: 'webhooks' },
            { src: 'bots',               dest: 'bots' },
            { src: 'bot_installations',  dest: 'bot_installations' },
            { src: 'invites',            dest: 'invites' },
            { src: 'space_bans',         dest: 'space_bans' },
            { src: 'custom_emojis',      dest: 'custom_emojis' },
            { src: 'messenger_settings', dest: 'messenger_settings' },
            { src: 'message_requests',   dest: 'message_requests' },
        ],
    },
    'pterodactyl-panel': {
        extSchema: 'ext_pterodactyl-panel',
        sqliteFile: 'ext_pterodactyl-panel.db',
        tables: [
            { src: 'pterodactyl_settings', dest: 'pterodactyl_settings' },
            { src: 'pterodactyl_access',   dest: 'pterodactyl_access' },
        ],
    },
    images: {
        extSchema: 'ext_images',
        sqliteFile: 'ext_images.db',
        tables: [
            { src: 'image_settings', dest: 'image_settings' },
        ],
    },
};

const report = {};

// ══════════════════════════════════════════════════════════════════════════════
// PostgreSQL path
// ══════════════════════════════════════════════════════════════════════════════

async function migratePostgres() {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: dbCfg.connectionString });

    const query = (sql, params) => pool.query(sql, params);

    // Check schema exists helper
    async function schemaExists(schema) {
        const r = await query(
            `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
            [schema]
        );
        return r.rowCount > 0;
    }

    // Check table exists in schema
    async function tableExists(schema, table) {
        const r = await query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schema, table]
        );
        return r.rowCount > 0;
    }

    // Get columns of a table
    async function getColumns(schema, table) {
        const r = await query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [schema, table]
        );
        return r.rows.map(row => row.column_name);
    }

    const extsToRun = ONLY
        ? Object.fromEntries(Object.entries(EXT_MAP).filter(([k]) => ONLY.includes(k)))
        : EXT_MAP;

    for (const [extName, def] of Object.entries(extsToRun)) {
        const srcSchema = def.extSchema;
        console.log(`\n── ${extName} (schema: ${srcSchema}) ──────────────────────`);

        if (!(await schemaExists(srcSchema))) {
            console.log(`  · schema "${srcSchema}" does not exist — skipping`);
            continue;
        }

        if (!report[extName]) report[extName] = [];
        const seen = new Set(); // deduplicate dest tables

        for (const { src, dest } of def.tables) {
            if (seen.has(dest)) continue; // skip duplicate dest mappings

            if (!(await tableExists(srcSchema, src))) continue;
            if (!(await tableExists('public', dest))) {
                console.log(`  ⚠  public.${dest} missing — run app once to apply schema, then retry`);
                continue;
            }

            // Get columns that exist in BOTH src and dest
            const srcCols  = await getColumns(srcSchema, src);
            const destCols = await getColumns('public', dest);
            const cols = srcCols.filter(c => destCols.includes(c));

            if (cols.length === 0) {
                console.log(`  ⚠  ${src} → ${dest}: no matching columns`);
                continue;
            }

            const colList = cols.map(c => `"${c}"`).join(', ');
            const sql = `
                INSERT INTO public."${dest}" (${colList})
                SELECT ${colList} FROM "${srcSchema}"."${src}"
                ON CONFLICT DO NOTHING
            `;

            // Count source rows
            const countR = await query(`SELECT COUNT(*) AS n FROM "${srcSchema}"."${src}"`);
            const found = parseInt(countR.rows[0].n, 10);

            if (found === 0) {
                console.log(`  ·  ${src} → ${dest}: 0 rows`);
                report[extName].push({ table: dest, found: 0, inserted: 0 });
                seen.add(dest);
                continue;
            }

            let inserted = 0;
            if (!DRY_RUN) {
                const r = await query(sql);
                inserted = r.rowCount;
            } else {
                inserted = found; // dry-run: pretend all would be inserted
            }

            console.log(`  ✓  ${src} → ${dest}: ${found} found, ${inserted} inserted`);
            report[extName].push({ table: dest, found, inserted });
            seen.add(dest);
        }

        // Drop the ext schema after successful migration (unless --no-cleanup or --dry-run)
        if (!DRY_RUN && !NO_CLEANUP) {
            try {
                await query(`DROP SCHEMA IF EXISTS "${srcSchema}" CASCADE`);
                console.log(`  🗑  Schema "${srcSchema}" dropped`);
            } catch (e) {
                console.warn(`  ⚠  Could not drop schema "${srcSchema}": ${e.message}`);
            }
        }
    }

    await pool.end();
}

// ══════════════════════════════════════════════════════════════════════════════
// SQLite path
// ══════════════════════════════════════════════════════════════════════════════

function migrateSqlite() {
    const Database = require('better-sqlite3');
    const DATA_DIR  = path.join(__dirname, '..', '..', 'data');
    const mainPath  = dbCfg.sqlitePath || path.join(DATA_DIR, 'venary.db');

    // Apply schema first (CREATE TABLE IF NOT EXISTS is idempotent)
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    const mainDb    = new Database(mainPath);
    mainDb.exec(schemaSql);
    console.log('  ✓  Schema applied to ' + path.basename(mainPath));

    const extsToRun = ONLY
        ? Object.fromEntries(Object.entries(EXT_MAP).filter(([k]) => ONLY.includes(k)))
        : EXT_MAP;

    for (const [extName, def] of Object.entries(extsToRun)) {
        const srcPath = path.join(DATA_DIR, def.sqliteFile);
        console.log(`\n── ${extName} (${def.sqliteFile}) ──────────────────────`);

        if (!fs.existsSync(srcPath)) {
            console.log(`  · file not found — skipping`);
            continue;
        }

        const srcDb = new Database(srcPath, { readonly: true });
        if (!report[extName]) report[extName] = [];
        const seen = new Set();

        for (const { src, dest } of def.tables) {
            if (seen.has(dest)) continue;

            // Check src table exists
            const srcExists = !!srcDb.prepare(
                `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
            ).get(src);
            if (!srcExists) continue;

            const destExists = !!mainDb.prepare(
                `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`
            ).get(dest);
            if (!destExists) {
                console.log(`  ⚠  ${dest} missing in main DB`);
                continue;
            }

            const rows = srcDb.prepare(`SELECT * FROM "${src}"`).all();
            if (rows.length === 0) {
                report[extName].push({ table: dest, found: 0, inserted: 0 });
                seen.add(dest);
                console.log(`  ·  ${src} → ${dest}: 0 rows`);
                continue;
            }

            const cols = Object.keys(rows[0]);
            const stmt = mainDb.prepare(
                `INSERT OR IGNORE INTO "${dest}" (${cols.map(c=>`"${c}"`).join(', ')})
                 VALUES (${cols.map(() => '?').join(', ')})`
            );

            let inserted = 0;
            if (!DRY_RUN) {
                const tx = mainDb.transaction((items) => {
                    for (const row of items) {
                        try { stmt.run(Object.values(row)); inserted++; } catch {}
                    }
                });
                tx(rows);
            } else {
                inserted = rows.length;
            }

            console.log(`  ✓  ${src} → ${dest}: ${rows.length} found, ${inserted} inserted`);
            report[extName].push({ table: dest, found: rows.length, inserted });
            seen.add(dest);
        }

        srcDb.close();

        // Delete ext_*.db file (unless --no-cleanup or --dry-run)
        if (!DRY_RUN && !NO_CLEANUP) {
            try {
                fs.unlinkSync(srcPath);
                [srcPath + '-shm', srcPath + '-wal'].forEach(f => {
                    if (fs.existsSync(f)) fs.unlinkSync(f);
                });
                console.log(`  🗑  ${def.sqliteFile} deleted`);
            } catch (e) {
                console.warn(`  ⚠  Could not delete ${def.sqliteFile}: ${e.message}`);
            }
        }
    }

    mainDb.close();
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║      Venary — Extension-to-Core Data Migration       ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log(`\n  Target: ${IS_PG ? 'PostgreSQL (ext_* schemas → public)' : 'SQLite (ext_*.db → venary.db)'}`);
    if (DRY_RUN)    console.log('  Mode:   DRY RUN (no writes)');
    if (NO_CLEANUP) console.log('  Cleanup: DISABLED');
    if (ONLY)       console.log(`  Only:   ${ONLY.join(', ')}`);
    console.log('');

    if (IS_PG) {
        await migratePostgres();
    } else {
        migrateSqlite();
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                  Migration Summary                   ║');
    console.log('╠══════════════════════════════════════════════════════╣');

    let totalFound = 0, totalInserted = 0;
    for (const [ext, entries] of Object.entries(report)) {
        for (const { table, found, inserted } of entries) {
            if (found === 0) continue;
            const status = DRY_RUN ? '~' : (inserted === found ? '✓' : inserted > 0 ? '~' : '–');
            console.log(`║  ${status}  ${(ext + '.' + table).padEnd(40)} ${String(found).padStart(5)} → ${String(inserted).padStart(5)}  ║`);
            totalFound    += found;
            totalInserted += inserted;
        }
    }

    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  TOTAL  ${String(totalFound).padStart(6)} rows found, ${String(totalInserted).padStart(6)} inserted${DRY_RUN ? ' (dry)' : '      '} ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (!DRY_RUN && !NO_CLEANUP) {
        console.log('Cleanup complete — old extension databases removed.\n');
    } else if (DRY_RUN) {
        console.log('Dry run complete. Re-run without --dry-run to apply.\n');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('\n[migrate] Fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
});
