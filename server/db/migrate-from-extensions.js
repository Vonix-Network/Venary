#!/usr/bin/env node
/**
 * Venary — Extension-to-Core Data Migration Script
 *
 * Migrates all data from the old PHPBB-style extension SQLite databases into
 * the unified Venary database (PostgreSQL or SQLite).
 *
 * Safe to run multiple times (fully idempotent via ON CONFLICT DO NOTHING).
 * Produces a detailed report of rows copied per table.
 *
 * Usage:
 *   node server/db/migrate-from-extensions.js
 *   node server/db/migrate-from-extensions.js --dry-run
 *   node server/db/migrate-from-extensions.js --only donations,forum
 *
 * Prerequisites:
 *   - Run after `npm start` has created the unified schema at least once.
 *   - The extension data directories must still exist (extensions/*/data/*.db).
 *   - NEVER run against the production DB without a backup first.
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY    = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',') || null;

if (DRY_RUN) console.log('\n[migrate] DRY RUN — no writes will be committed.\n');

// ── Bootstrap config + unified DB ────────────────────────────────────────────

const Config = require('../config');
if (!Config.isSetupComplete()) {
    console.error('[migrate] Setup is not complete. Run the app once to initialise the DB first.');
    process.exit(1);
}

const ROOT = path.join(__dirname, '..', '..'); // repo root

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Open a SQLite extension DB. Returns null if the file doesn't exist. */
function openExtDb(relPath) {
    const full = path.join(ROOT, relPath);
    if (!fs.existsSync(full)) return null;
    try {
        return new Database(full, { readonly: true, fileMustExist: true });
    } catch (e) {
        console.warn(`[migrate] Could not open ${relPath}: ${e.message}`);
        return null;
    }
}

/** Count rows in a SQLite table. Returns 0 if table doesn't exist. */
function countRows(db, table) {
    try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0;
    } catch { return 0; }
}

/** Returns all rows from a SQLite table, or [] if table doesn't exist. */
function getAllRows(db, table) {
    try {
        return db.prepare(`SELECT * FROM ${table}`).all();
    } catch { return []; }
}

/**
 * Bulk-insert rows into the target (unified) DB.
 * Uses ON CONFLICT DO NOTHING so it's idempotent.
 *
 * @param {object} targetDb  - unified DB connection (better-sqlite3 OR pg-style adapter)
 * @param {string} table     - destination table name
 * @param {object[]} rows    - array of row objects
 * @param {boolean} dryRun
 * @returns {number} inserted count
 */
async function insertBatch(targetDb, table, rows, dryRun) {
    if (!rows.length) return 0;
    const keys    = Object.keys(rows[0]);
    const colList = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

    let inserted = 0;
    for (const row of rows) {
        const values = keys.map(k => {
            const v = row[k];
            // Coerce SQLite integer booleans → proper values
            if (typeof v === 'number' && Number.isInteger(v) && (v === 0 || v === 1)) return v;
            return v ?? null;
        });
        if (!dryRun) {
            try {
                await targetDb.run(sql, values);
                inserted++;
            } catch (err) {
                // Row-level error: log but continue
                console.warn(`  [warn] ${table} row skip: ${err.message.slice(0, 100)}`);
            }
        } else {
            inserted++; // count as would-be-inserted in dry-run
        }
    }
    return inserted;
}

// ── Report tracker ────────────────────────────────────────────────────────────

const report = {};
function track(ext, table, found, inserted) {
    if (!report[ext]) report[ext] = [];
    report[ext].push({ table, found, inserted });
}

// ── Per-extension migration functions ────────────────────────────────────────

async function migrateDonations(targetDb) {
    const extDb = openExtDb('extensions/donations/data/donations.db');
    if (!extDb) { console.log('  donations: no DB found — skipping'); return; }

    const tables = [
        'donation_ranks',
        'donations',
        'user_ranks',
        'rank_conversions',
        'user_crypto_addresses',
        'crypto_payment_intents',
        'anytime_address_txs',
        'user_balances',
        'balance_transactions',
        'user_preferences',
    ];

    // Also migrate guest_donations if it exists (pre-schema rename)
    if (countRows(extDb, 'guest_donations') > 0) tables.push('guest_donations');

    for (const table of tables) {
        const rows = getAllRows(extDb, table);
        if (!rows.length) { track('donations', table, 0, 0); continue; }
        const inserted = await insertBatch(targetDb, table, rows, DRY_RUN);
        track('donations', table, rows.length, inserted);
        console.log(`  donations.${table}: found ${rows.length}, inserted ${inserted}`);
    }

    extDb.close();
}

async function migrateForum(targetDb) {
    const extDb = openExtDb('extensions/forum/data/forum.db');
    if (!extDb) { console.log('  forum: no DB found — skipping'); return; }

    const tables = ['forum_categories', 'forum_threads', 'forum_posts'];

    for (const table of tables) {
        const rows = getAllRows(extDb, table);
        if (!rows.length) { track('forum', table, 0, 0); continue; }
        const inserted = await insertBatch(targetDb, table, rows, DRY_RUN);
        track('forum', table, rows.length, inserted);
        console.log(`  forum.${table}: found ${rows.length}, inserted ${inserted}`);
    }

    extDb.close();
}

async function migrateMinecraft(targetDb) {
    const extDb = openExtDb('extensions/minecraft/data/minecraft.db');
    if (!extDb) { console.log('  minecraft: no DB found — skipping'); return; }

    const tables = ['mc_servers', 'linked_accounts'];

    for (const table of tables) {
        const rows = getAllRows(extDb, table);
        if (!rows.length) { track('minecraft', table, 0, 0); continue; }
        const inserted = await insertBatch(targetDb, table, rows, DRY_RUN);
        track('minecraft', table, rows.length, inserted);
        console.log(`  minecraft.${table}: found ${rows.length}, inserted ${inserted}`);
    }

    extDb.close();
}

async function migratePterodactyl(targetDb) {
    const extDb = openExtDb('extensions/pterodactyl-panel/data/pterodactyl.db');
    if (!extDb) { console.log('  pterodactyl: no DB found — skipping'); return; }

    const tables = ['pterodactyl_settings', 'pterodactyl_access'];

    for (const table of tables) {
        const rows = getAllRows(extDb, table);
        if (!rows.length) { track('pterodactyl', table, 0, 0); continue; }
        const inserted = await insertBatch(targetDb, table, rows, DRY_RUN);
        track('pterodactyl', table, rows.length, inserted);
        console.log(`  pterodactyl.${table}: found ${rows.length}, inserted ${inserted}`);
    }

    extDb.close();
}

async function migrateMessenger(targetDb) {
    // Try common DB file names for messenger
    const candidates = [
        'extensions/messenger/data/messenger.db',
        'extensions/messenger/data/data.db',
    ];
    const extDb = candidates.reduce((acc, p) => acc || openExtDb(p), null);
    if (!extDb) { console.log('  messenger: no DB found — skipping'); return; }

    // Introspect the tables that exist in the messenger DB
    const tableNames = extDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all()
        .map(r => r.name);

    for (const table of tableNames) {
        const rows = getAllRows(extDb, table);
        if (!rows.length) { track('messenger', table, 0, 0); continue; }
        try {
            const inserted = await insertBatch(targetDb, table, rows, DRY_RUN);
            track('messenger', table, rows.length, inserted);
            console.log(`  messenger.${table}: found ${rows.length}, inserted ${inserted}`);
        } catch (err) {
            console.warn(`  messenger.${table}: skipped — ${err.message.slice(0, 120)}`);
        }
    }

    extDb.close();
}

async function migrateImages(targetDb) {
    const extDb = openExtDb('extensions/images/data/images.db');
    if (!extDb) { console.log('  images: no DB found — skipping'); return; }

    const rows = getAllRows(extDb, 'image_settings');
    if (!rows.length) { track('images', 'image_settings', 0, 0); extDb.close(); return; }

    const inserted = await insertBatch(targetDb, 'image_settings', rows, DRY_RUN);
    track('images', 'image_settings', rows.length, inserted);
    console.log(`  images.image_settings: found ${rows.length}, inserted ${inserted}`);

    extDb.close();
}

// ── Core users table backup check ────────────────────────────────────────────
// The core DB (users, posts, etc.) is already in the unified DB.
// This function is a sanity-check — it verifies the unified DB has users
// and warns if the migration might be running against an empty target.

async function checkCoreData(targetDb) {
    try {
        const result = await targetDb.get('SELECT COUNT(*) AS n FROM users');
        const count  = result?.n ?? result?.count ?? 0;
        if (parseInt(count, 10) === 0) {
            console.warn('\n[migrate] WARNING: users table is empty. If you have existing user data,');
            console.warn('           make sure to import your core database before running this script.\n');
        } else {
            console.log(`[migrate] Core DB: ${count} users already present.\n`);
        }
    } catch (err) {
        console.error('[migrate] Could not query users table:', err.message);
        console.error('          Run the app at least once to initialise the schema first.');
        process.exit(1);
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║      Venary — Extension-to-Core Data Migration       ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    // Load and init the unified DB
    const dbConfig = Config.getDatabaseConfig();
    const db = require('../db');
    await db.init(dbConfig);
    console.log(`[migrate] Target DB: ${dbConfig.type === 'postgresql' ? 'PostgreSQL' : 'SQLite (unified)'}\n`);

    await checkCoreData(db);

    const all = {
        donations:    migrateDonations,
        forum:        migrateForum,
        minecraft:    migrateMinecraft,
        pterodactyl:  migratePterodactyl,
        messenger:    migrateMessenger,
        images:       migrateImages,
    };

    const toRun = ONLY ? Object.fromEntries(Object.entries(all).filter(([k]) => ONLY.includes(k))) : all;

    for (const [ext, fn] of Object.entries(toRun)) {
        console.log(`── ${ext} ─────────────────────────────────`);
        await fn(db);
    }

    // ── Summary report ────────────────────────────────────────────────────────

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                  Migration Summary                   ║');
    console.log('╠══════════════════════════════════════════════════════╣');

    let totalFound = 0, totalInserted = 0;
    for (const [ext, entries] of Object.entries(report)) {
        for (const { table, found, inserted } of entries) {
            const status = DRY_RUN ? '(dry)' : (inserted === found ? '✓' : inserted > 0 ? '~' : '–');
            console.log(`║  ${status}  ${ext}.${table.padEnd(35)} ${String(found).padStart(6)} → ${String(inserted).padStart(6)}  ║`);
            totalFound    += found;
            totalInserted += inserted;
        }
    }

    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  TOTAL: ${String(totalFound).padStart(6)} rows found, ${String(totalInserted).padStart(6)} inserted${DRY_RUN ? ' (dry run)' : '       '} ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (DRY_RUN) {
        console.log('No data was written (--dry-run). Re-run without --dry-run to apply.\n');
    } else {
        console.log('Migration complete. You can now disable or delete the extensions/ directory.\n');
    }

    process.exit(0);
}

main().catch(err => {
    console.error('[migrate] Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
});
