-- =======================================
-- Minecraft Extension — Schema
-- Isolated database for all MC data.
-- Compatible with PostgreSQL & SQLite.
-- =======================================

-- Managed Minecraft servers
CREATE TABLE IF NOT EXISTS mc_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    port INTEGER DEFAULT 25565,
    description TEXT,
    icon TEXT,
    version TEXT,
    modpack_name TEXT,
    curseforge_url TEXT,
    modrinth_url TEXT,
    bluemap_url TEXT,
    api_key TEXT UNIQUE NOT NULL,
    hide_port INTEGER DEFAULT 0,
    is_bedrock INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Links platform users to Minecraft accounts
CREATE TABLE IF NOT EXISTS linked_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    minecraft_uuid TEXT NOT NULL UNIQUE,
    minecraft_username TEXT NOT NULL,
    linked_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Per-player, per-server stat tracking
-- One row per (player_uuid, server_id, stat_key) combination
CREATE TABLE IF NOT EXISTS player_stats (
    id TEXT PRIMARY KEY,
    player_uuid TEXT NOT NULL,
    server_id TEXT NOT NULL,
    stat_key TEXT NOT NULL,
    stat_value BIGINT DEFAULT 0,
    last_synced_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (server_id) REFERENCES mc_servers(id),
    UNIQUE(player_uuid, server_id, stat_key)
);

-- Player profiles (tracks usernames, last seen, etc.)
CREATE TABLE IF NOT EXISTS mc_players (
    id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    linked_user_id TEXT,
    last_synced_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Uptime / player history (7 day rolling window)
CREATE TABLE IF NOT EXISTS uptime_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    online INTEGER DEFAULT 0,
    players_online INTEGER DEFAULT 0,
    players_max INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    checked_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (server_id) REFERENCES mc_servers(id)
);

-- Temporary link codes (expire after 5 min)
CREATE TABLE IF NOT EXISTS link_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    minecraft_uuid TEXT NOT NULL,
    minecraft_username TEXT NOT NULL,
    server_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_linked_user ON linked_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_linked_uuid ON linked_accounts(minecraft_uuid);
CREATE INDEX IF NOT EXISTS idx_player_stats_uuid ON player_stats(player_uuid);
CREATE INDEX IF NOT EXISTS idx_player_stats_server ON player_stats(server_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_key ON player_stats(stat_key);
CREATE INDEX IF NOT EXISTS idx_player_stats_lookup ON player_stats(player_uuid, server_id, stat_key);
CREATE INDEX IF NOT EXISTS idx_player_stats_leaderboard ON player_stats(stat_key, stat_value);
CREATE INDEX IF NOT EXISTS idx_mc_players_uuid ON mc_players(uuid);
CREATE INDEX IF NOT EXISTS idx_uptime_server ON uptime_history(server_id);
CREATE INDEX IF NOT EXISTS idx_uptime_checked ON uptime_history(checked_at);
CREATE INDEX IF NOT EXISTS idx_link_codes_code ON link_codes(code);
