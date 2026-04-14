-- =======================================
-- Venary — Database Schema
-- Compatible with PostgreSQL & SQLite
-- =======================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    avatar TEXT,
    bio TEXT,
    gaming_tags TEXT DEFAULT '[]',
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    achievements INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'offline',
    banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    banned_until TEXT,
    last_seen TEXT,
    skin_animation TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (friend_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    post_type TEXT DEFAULT 'text',
    visibility TEXT DEFAULT 'public',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    admin_note TEXT,
    resolved_by TEXT,
    resolved_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (reported_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor_id TEXT,
    reference_id TEXT,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS post_subscriptions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (post_id) REFERENCES posts(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    detail TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- =======================================
-- Ban Appeals Feature
-- =======================================

CREATE TABLE IF NOT EXISTS ban_appeals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ban_reason_display TEXT,
    appeal_message TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
    decline_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    cooldown_until TEXT,
    previous_appeal_id TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (previous_appeal_id) REFERENCES ban_appeals(id)
);

-- Indices for ban appeals
CREATE INDEX IF NOT EXISTS idx_appeals_user ON ban_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON ban_appeals(status);
CREATE INDEX IF NOT EXISTS idx_appeals_created ON ban_appeals(created_at);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON likes(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_post_subs_post ON post_subscriptions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_subs_user ON post_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at);

-- =======================================
-- Images Feature — image host settings
-- =======================================

CREATE TABLE IF NOT EXISTS image_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO image_settings (key, value) VALUES ('allow_direct_upload', '1');
INSERT OR IGNORE INTO image_settings (key, value) VALUES ('storage_type', 'local');
INSERT OR IGNORE INTO image_settings (key, value) VALUES ('external_storage_config', '{}');

-- =======================================
-- Forum Feature
-- Prefixed forum_ to avoid collisions with
-- the core 'posts' and messenger 'categories'
-- tables.
-- =======================================

CREATE TABLE IF NOT EXISTS forum_categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '💬',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS forum_threads (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    title TEXT NOT NULL,
    user_id TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    last_activity TEXT,
    last_post_user_id TEXT,
    media TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (category_id) REFERENCES forum_categories(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (last_post_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS forum_posts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media TEXT,
    is_op INTEGER DEFAULT 0,
    edited_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (thread_id) REFERENCES forum_threads(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_activity ON forum_threads(last_activity);
CREATE INDEX IF NOT EXISTS idx_forum_posts_thread ON forum_posts(thread_id);
CREATE INDEX IF NOT EXISTS idx_forum_posts_user ON forum_posts(user_id);

-- =======================================
-- Donations & Ranks Feature
-- =======================================

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
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (rank_id) REFERENCES donation_ranks(id)
);

CREATE TABLE IF NOT EXISTS user_ranks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    rank_id TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    stripe_subscription_id TEXT,
    started_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    expires_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (rank_id) REFERENCES donation_ranks(id)
);

CREATE TABLE IF NOT EXISTS rank_conversions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    from_rank_id TEXT,
    to_rank_id TEXT NOT NULL,
    days_remaining INTEGER DEFAULT 0,
    converted_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_crypto_addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    derivation_index INTEGER NOT NULL,
    sol_address TEXT,
    ltc_address TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

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
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS anytime_address_txs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    coin TEXT NOT NULL,
    crypto_amount REAL NOT NULL,
    usd_amount REAL NOT NULL,
    exchange_rate REAL NOT NULL,
    status TEXT DEFAULT 'credited',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_balances (
    user_id TEXT PRIMARY KEY,
    usd_balance REAL NOT NULL DEFAULT 0.0,
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS balance_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    source TEXT NOT NULL,
    description TEXT,
    reference_id TEXT,
    admin_id TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    balance_display_currency TEXT DEFAULT 'usd',
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS admin_wallet_addresses (
    id TEXT PRIMARY KEY,
    derivation_index INTEGER NOT NULL UNIQUE,
    sol_address TEXT,
    ltc_address TEXT,
    label TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Seed default donation ranks
INSERT OR IGNORE INTO donation_ranks (id, name, price, color, icon, description, perks, luckperms_group, sort_order)
VALUES
    ('rank_supporter',  'Supporter', 4.99,  '#22c55e', '⭐', 'Show your support!',              '["Colored name in-game","Supporter tag on website","Access to /hat"]',                                                   'supporter',  1),
    ('rank_patron',     'Patron',    9.99,  '#06b6d4', '⭐', 'Patron-level perks and cosmetics.','["All Supporter perks","Custom join message","2 /sethome slots","Priority queue"]',                                     'patron',     2),
    ('rank_omega',      'Omega',     14.99, '#eab308', '⭐', 'Premium experience upgrade.',      '["All Patron perks","Particle effects","5 /sethome slots","Nickname colors","Exclusive channels"]',                     'omega',      3),
    ('rank_legend',     'Legend',    19.99, '#f97316', '⭐', 'The ultimate rank.',               '["All Omega perks","Custom prefix","Unlimited /sethome","Priority support","Exclusive cosmetics","Legend badge on site"]','legend',     4);

CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_stripe ON donations(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_user_ranks_user ON user_ranks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ranks_active ON user_ranks(active);
CREATE INDEX IF NOT EXISTS idx_rank_conversions_user ON rank_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_status ON crypto_payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_coin ON crypto_payment_intents(coin);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_user ON crypto_payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_intents_expires ON crypto_payment_intents(expires_at);
CREATE INDEX IF NOT EXISTS idx_anytime_txs_user ON anytime_address_txs(user_id);
CREATE INDEX IF NOT EXISTS idx_anytime_txs_hash ON anytime_address_txs(tx_hash);
CREATE INDEX IF NOT EXISTS idx_balance_txs_user ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_crypto_addr_user ON user_crypto_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_wallet_addr_idx ON admin_wallet_addresses(derivation_index);

-- =======================================
-- Minecraft Feature
-- =======================================

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

CREATE TABLE IF NOT EXISTS linked_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    minecraft_uuid TEXT NOT NULL UNIQUE,
    minecraft_username TEXT NOT NULL,
    linked_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

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

CREATE TABLE IF NOT EXISTS mc_players (
    id TEXT PRIMARY KEY,
    uuid TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    linked_user_id TEXT,
    last_synced_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

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

CREATE TABLE IF NOT EXISTS link_codes (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    minecraft_uuid TEXT NOT NULL,
    minecraft_username TEXT NOT NULL,
    server_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

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

-- =======================================
-- Messenger Feature
-- messenger_categories prefixed to avoid
-- collision with forum_categories.
-- =======================================

CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    banner TEXT,
    owner_id TEXT NOT NULL,
    invite_code TEXT UNIQUE,
    is_public INTEGER DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messenger_categories (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    topic TEXT,
    type TEXT DEFAULT 'text',
    position INTEGER DEFAULT 0,
    is_nsfw INTEGER DEFAULT 0,
    slowmode_seconds INTEGER DEFAULT 0,
    last_message_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES messenger_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#99aab5',
    permissions TEXT DEFAULT '{}',
    position INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    mentionable INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT,
    joined_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(space_id, user_id),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS member_roles (
    member_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (member_id, role_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS channel_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'default',
    reply_to_id TEXT,
    thread_id TEXT,
    attachments TEXT DEFAULT '[]',
    embeds TEXT DEFAULT '[]',
    reactions TEXT DEFAULT '{}',
    pinned INTEGER DEFAULT 0,
    edited_at TEXT,
    deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    type TEXT DEFAULT 'dm',
    name TEXT,
    icon TEXT,
    owner_id TEXT,
    last_message_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS dm_members (
    dm_channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (dm_channel_id, user_id),
    FOREIGN KEY (dm_channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    dm_channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT,
    type TEXT DEFAULT 'default',
    reply_to_id TEXT,
    attachments TEXT DEFAULT '[]',
    reactions TEXT DEFAULT '{}',
    edited_at TEXT,
    deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (dm_channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS read_states (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    last_read_message_id TEXT,
    mention_count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, channel_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    token TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    description TEXT,
    owner_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    permissions TEXT DEFAULT '{}',
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bot_installations (
    bot_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    installed_by TEXT NOT NULL,
    permissions TEXT DEFAULT '{}',
    installed_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    PRIMARY KEY (bot_id, space_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (installed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    space_id TEXT NOT NULL,
    channel_id TEXT,
    inviter_id TEXT NOT NULL,
    max_uses INTEGER DEFAULT 0,
    uses INTEGER DEFAULT 0,
    max_age INTEGER DEFAULT 0,
    expires_at TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (inviter_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS space_bans (
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    banned_by TEXT NOT NULL,
    banned_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    PRIMARY KEY (space_id, user_id),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (banned_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS custom_emojis (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messenger_settings (
    user_id TEXT PRIMARY KEY,
    allow_dms TEXT DEFAULT 'everyone',
    message_requests INTEGER DEFAULT 1,
    auto_accept_requests INTEGER DEFAULT 0,
    show_online_status INTEGER DEFAULT 1,
    show_read_receipts INTEGER DEFAULT 1,
    allow_friend_requests INTEGER DEFAULT 1,
    dm_notifications TEXT DEFAULT 'all',
    notification_sounds INTEGER DEFAULT 1,
    notification_previews INTEGER DEFAULT 1,
    compact_mode INTEGER DEFAULT 0,
    emoji_size TEXT DEFAULT 'medium',
    link_previews INTEGER DEFAULT 1,
    developer_mode INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS message_requests (
    id TEXT PRIMARY KEY,
    from_user_id TEXT NOT NULL,
    to_user_id TEXT NOT NULL,
    dm_channel_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(from_user_id, to_user_id),
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ch_msg_channel  ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_ch_msg_created  ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ch_msg_author   ON channel_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_members_space   ON members(space_id);
CREATE INDEX IF NOT EXISTS idx_members_user    ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_space  ON channels(space_id);
CREATE INDEX IF NOT EXISTS idx_dm_msg_channel  ON dm_messages(dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_read_state_user ON read_states(user_id);
CREATE INDEX IF NOT EXISTS idx_msg_req_to      ON message_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_msg_req_from    ON message_requests(from_user_id);

-- =======================================
-- Pterodactyl Feature
-- =======================================

CREATE TABLE IF NOT EXISTS pterodactyl_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS pterodactyl_access (
    user_id    TEXT PRIMARY KEY,
    granted_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

