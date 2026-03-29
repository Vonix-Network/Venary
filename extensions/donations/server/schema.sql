-- =======================================
-- Donations Extension — Schema
-- Isolated database for donation data.
-- Compatible with PostgreSQL & SQLite.
-- =======================================

-- Donation ranks (tiers)
CREATE TABLE IF NOT EXISTS donation_ranks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price REAL NOT NULL,
    color TEXT DEFAULT '#ffffff',
    icon TEXT DEFAULT '⭐',
    description TEXT,
    perks TEXT,
    luckperms_group TEXT,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Individual donations / transactions
-- user_id and rank_id are nullable to support guest one-time donations (no rank)
CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    rank_id TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'usd',
    payment_type TEXT DEFAULT 'one-time',
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent TEXT,
    stripe_subscription_id TEXT,
    status TEXT DEFAULT 'pending',
    minecraft_uuid TEXT,
    minecraft_username TEXT,
    discord_notified INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (rank_id) REFERENCES donation_ranks(id)
);

-- Active user ranks (current subscription/rank state)
CREATE TABLE IF NOT EXISTS user_ranks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rank_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    stripe_subscription_id TEXT,
    started_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    expires_at TEXT,
    UNIQUE(user_id),
    FOREIGN KEY (rank_id) REFERENCES donation_ranks(id)
);

-- Seed default ranks (Supporter, Patron, Omega, Legend)
INSERT OR IGNORE INTO donation_ranks (id, name, price, color, icon, description, perks, luckperms_group, sort_order)
VALUES
    ('rank_supporter',  'Supporter', 4.99,  '#22c55e', '⭐', 'Show your support!',              '["Colored name in-game","Supporter tag on website","Access to /hat"]',                                                   'supporter',  1),
    ('rank_patron',     'Patron',    9.99,  '#06b6d4', '⭐', 'Patron-level perks and cosmetics.','["All Supporter perks","Custom join message","2 /sethome slots","Priority queue"]',                                     'patron',     2),
    ('rank_omega',      'Omega',     14.99, '#eab308', '⭐', 'Premium experience upgrade.',      '["All Patron perks","Particle effects","5 /sethome slots","Nickname colors","Exclusive channels"]',                     'omega',      3),
    ('rank_legend',     'Legend',    19.99, '#f97316', '⭐', 'The ultimate rank.',               '["All Omega perks","Custom prefix","Unlimited /sethome","Priority support","Exclusive cosmetics","Legend badge on site"]','legend',     4);

-- Rank conversion log
CREATE TABLE IF NOT EXISTS rank_conversions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    from_rank_id TEXT,
    to_rank_id TEXT NOT NULL,
    days_remaining INTEGER DEFAULT 0,
    converted_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_stripe ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_user_ranks_user ON user_ranks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ranks_active ON user_ranks(active);
CREATE INDEX IF NOT EXISTS idx_rank_conversions_user ON rank_conversions(user_id);

-- =======================================
-- Crypto Donation Support — Additional Tables
-- =======================================

-- HD wallet derivation index per user (one row per user, both chains)
CREATE TABLE IF NOT EXISTS user_crypto_addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    derivation_index INTEGER NOT NULL,
    sol_address TEXT,
    ltc_address TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Payment intents for crypto checkout (rank or custom amount)
CREATE TABLE IF NOT EXISTS crypto_payment_intents (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    rank_id TEXT,
    coin TEXT NOT NULL,
    sol_address TEXT,
    ltc_address TEXT,
    amount_usd REAL NOT NULL,
    locked_crypto_amount REAL NOT NULL,
    locked_exchange_rate REAL NOT NULL,
    tolerance_pct REAL DEFAULT 5.0,
    status TEXT DEFAULT 'pending',
    tx_hash TEXT,
    confirmed_amount_crypto REAL,
    confirmations INTEGER DEFAULT 0,
    minecraft_username TEXT,
    expires_at TEXT NOT NULL,
    detected_at TEXT,
    confirmed_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Deduplication log for anytime address transactions
CREATE TABLE IF NOT EXISTS anytime_address_txs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    coin TEXT NOT NULL,
    crypto_amount REAL NOT NULL,
    usd_amount REAL NOT NULL,
    exchange_rate REAL NOT NULL,
    status TEXT DEFAULT 'credited',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- User USD balances (stored with 8dp precision)
CREATE TABLE IF NOT EXISTS user_balances (
    user_id TEXT PRIMARY KEY,
    usd_balance REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Balance transaction ledger (credits and debits)
CREATE TABLE IF NOT EXISTS balance_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    source TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    admin_id TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- User display preferences (balance currency)
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    balance_display_currency TEXT DEFAULT 'usd',
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Crypto table indices
CREATE INDEX IF NOT EXISTS idx_crypto_intents_status ON crypto_payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_coin ON crypto_payment_intents(coin);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_user ON crypto_payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_expires ON crypto_payment_intents(expires_at);
CREATE INDEX IF NOT EXISTS idx_anytime_txs_user ON anytime_address_txs(user_id);
CREATE INDEX IF NOT EXISTS idx_anytime_txs_hash ON anytime_address_txs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_balance_txs_user ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_crypto_addr_user ON user_crypto_addresses(user_id);
