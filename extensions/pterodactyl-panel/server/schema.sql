-- =======================================
-- Pterodactyl Panel Extension — Schema
-- Isolated database for all Pterodactyl data.
-- Compatible with PostgreSQL & SQLite.
-- =======================================
-- NOTE (PostgreSQL): After deploying, run these CREATE TABLE statements
-- against the ext_pterodactyl-panel database (not the core Venary DB).
-- Example: psql -d ext_pterodactyl-panel -f schema.sql

-- Extension configuration (base_url, api_key, server_id)
CREATE TABLE IF NOT EXISTS pterodactyl_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- Users granted access to the Pterodactyl panel widget
-- NOTE: user_id references users.id in the core Venary database.
-- Cross-database foreign keys cannot be enforced at the DB level;
-- referential integrity is maintained in application logic.
CREATE TABLE IF NOT EXISTS pterodactyl_access (
    user_id    TEXT PRIMARY KEY,
    granted_at TEXT
);
