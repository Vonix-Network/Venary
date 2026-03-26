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
CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rank_id TEXT NOT NULL,
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
