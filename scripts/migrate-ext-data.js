#!/usr/bin/env node
/**
 * scripts/migrate-ext-data.js
 *
 * One-time migration: copies data from isolated extension SQLite databases
 * (data/ext_*.db) into the main venary.db after the unified schema has been applied.
 *
 * Run ONCE after upgrading to the built-in feature system:
 *   node scripts/migrate-ext-data.js
 *
 * The script is idempotent — it skips rows that already exist (INSERT OR IGNORE).
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR  = path.join(__dirname, '..', 'data');
const SCHEMA_PATH = path.join(__dirname, '..', 'server', 'db', 'schema.sql');
const MAIN_DB   = path.join(DATA_DIR, 'venary.db');

// ── helpers ──────────────────────────────────────────────────────────────────

function openExt(name) {
    const p = path.join(DATA_DIR, `ext_${name}.db`);
    if (!fs.existsSync(p)) return null;
    return new Database(p, { readonly: true });
}

function tableExists(db, name) {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

let migrated = 0;
let skipped  = 0;

function copyRows(src, dest, srcTable, destTable, transform) {
    if (!tableExists(src, srcTable)) { console.log(`  ⚠  src table "${srcTable}" missing — skipped`); return; }
    if (!tableExists(dest, destTable)) { console.log(`  ⚠  dest table "${destTable}" missing — run the server first to apply schema, then re-run this script`); return; }

    const rows = src.prepare(`SELECT * FROM ${srcTable}`).all();
    if (rows.length === 0) { console.log(`  ·  ${srcTable} → ${destTable}: 0 rows (empty)`); return; }

    const mapped = transform ? rows.map(transform) : rows;
    const cols   = Object.keys(mapped[0]);
    const stmt   = dest.prepare(
        `INSERT OR IGNORE INTO ${destTable} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
    );

    const insert = dest.transaction((items) => {
        let n = 0;
        for (const row of items) { stmt.run(Object.values(row)); n++; }
        return n;
    });

    const n = insert(mapped);
    migrated += n;
    skipped  += rows.length - n;
    console.log(`  ✓  ${srcTable} → ${destTable}: ${n} inserted, ${rows.length - n} already existed`);
}

// ── main ─────────────────────────────────────────────────────────────────────

const main = new Database(MAIN_DB);

// Ensure the schema is applied (CREATE TABLE IF NOT EXISTS is safe to re-run).
console.log('\n[1/5] Applying schema to venary.db …');
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
// SQLite's exec handles multi-statement SQL
main.exec(schema);
console.log('  ✓  Schema up-to-date');

// ── Minecraft ────────────────────────────────────────────────────────────────
console.log('\n[2/5] Migrating Minecraft data …');
const mc = openExt('minecraft');
if (!mc) {
    console.log('  ·  ext_minecraft.db not found — skipped');
} else {
    copyRows(mc, main, 'mc_servers',     'mc_servers',     null);
    copyRows(mc, main, 'linked_accounts','linked_accounts', null);
    copyRows(mc, main, 'player_stats',   'player_stats',    null);
    copyRows(mc, main, 'mc_players',     'mc_players',      null);
    copyRows(mc, main, 'uptime_history', 'uptime_history',  null);
    copyRows(mc, main, 'link_codes',     'link_codes',      null);
    mc.close();
}

// ── Donations ────────────────────────────────────────────────────────────────
console.log('\n[3/5] Migrating Donations data …');
const don = openExt('donations');
if (!don) {
    console.log('  ·  ext_donations.db not found — skipped');
} else {
    copyRows(don, main, 'donation_ranks',        'donation_ranks',        null);
    copyRows(don, main, 'donations',             'donations',             null);
    copyRows(don, main, 'user_ranks',            'user_ranks',            null);
    copyRows(don, main, 'rank_conversions',      'rank_conversions',      null);
    copyRows(don, main, 'user_crypto_addresses', 'user_crypto_addresses', null);
    copyRows(don, main, 'crypto_payment_intents','crypto_payment_intents',null);
    copyRows(don, main, 'anytime_address_txs',   'anytime_address_txs',   null);
    copyRows(don, main, 'user_balances',         'user_balances',         null);
    copyRows(don, main, 'balance_transactions',  'balance_transactions',  null);
    copyRows(don, main, 'user_preferences',      'user_preferences',      null);
    copyRows(don, main, 'admin_wallet_addresses','admin_wallet_addresses', null);
    don.close();
}

// ── Forum ────────────────────────────────────────────────────────────────────
console.log('\n[4/5] Migrating Forum data …');
const forum = openExt('forum');
if (!forum) {
    console.log('  ·  ext_forum.db not found — skipped');
} else {
    // Old table names → new unified names
    copyRows(forum, main, 'categories', 'forum_categories', null);
    copyRows(forum, main, 'threads',    'forum_threads',    null);
    copyRows(forum, main, 'posts',      'forum_posts',      null);
    forum.close();
}

// ── Messenger ────────────────────────────────────────────────────────────────
console.log('\n[5/5] Migrating Messenger data …');
const msg = openExt('messenger');
if (!msg) {
    console.log('  ·  ext_messenger.db not found — skipped');
} else {
    copyRows(msg, main, 'spaces',           'spaces',           null);
    copyRows(msg, main, 'categories',       'messenger_categories', null);
    copyRows(msg, main, 'channels',         'channels',         null);
    copyRows(msg, main, 'roles',            'roles',            null);
    copyRows(msg, main, 'members',          'members',          null);
    copyRows(msg, main, 'member_roles',     'member_roles',     null);
    copyRows(msg, main, 'channel_messages', 'channel_messages', null);
    copyRows(msg, main, 'dm_channels',      'dm_channels',      null);
    copyRows(msg, main, 'dm_members',       'dm_members',       null);
    copyRows(msg, main, 'dm_messages',      'dm_messages',      null);
    copyRows(msg, main, 'read_states',      'read_states',      null);
    copyRows(msg, main, 'webhooks',         'webhooks',         null);
    copyRows(msg, main, 'bots',             'bots',             null);
    copyRows(msg, main, 'bot_installations','bot_installations', null);
    copyRows(msg, main, 'invites',          'invites',          null);
    copyRows(msg, main, 'space_bans',       'space_bans',       null);
    copyRows(msg, main, 'custom_emojis',    'custom_emojis',    null);
    copyRows(msg, main, 'messenger_settings','messenger_settings',null);
    copyRows(msg, main, 'message_requests', 'message_requests', null);
    msg.close();
}

main.close();

console.log(`\n✅  Migration complete — ${migrated} rows inserted, ${skipped} already existed / skipped\n`);
