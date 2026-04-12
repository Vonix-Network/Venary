-- =============================================
-- Venary Messenger — Database Schema
-- =============================================

-- Spaces (Discord "Servers")
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
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

-- Categories (channel groups)
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Channels
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
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Roles
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

-- Members (user <-> space relationship)
CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    nickname TEXT,
    joined_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    UNIQUE(space_id, user_id),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Member roles (many-to-many)
CREATE TABLE IF NOT EXISTS member_roles (
    member_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    PRIMARY KEY (member_id, role_id),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- Channel messages
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
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- DM channels
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
    FOREIGN KEY (dm_channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE
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
    FOREIGN KEY (dm_channel_id) REFERENCES dm_channels(id) ON DELETE CASCADE
);

-- Read state tracking
CREATE TABLE IF NOT EXISTS read_states (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    last_read_message_id TEXT,
    mention_count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, channel_id)
);

-- Webhooks
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
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- Bots
CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    description TEXT,
    owner_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    permissions TEXT DEFAULT '{}',
    is_public INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS bot_installations (
    bot_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    installed_by TEXT NOT NULL,
    permissions TEXT DEFAULT '{}',
    installed_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    PRIMARY KEY (bot_id, space_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Invites
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
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Bans
CREATE TABLE IF NOT EXISTS space_bans (
    space_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT,
    banned_by TEXT NOT NULL,
    banned_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    PRIMARY KEY (space_id, user_id),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Custom emojis
CREATE TABLE IF NOT EXISTS custom_emojis (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_ch_msg_channel  ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_ch_msg_created  ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ch_msg_author   ON channel_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_members_space   ON members(space_id);
CREATE INDEX IF NOT EXISTS idx_members_user    ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_space  ON channels(space_id);
CREATE INDEX IF NOT EXISTS idx_dm_msg_channel  ON dm_messages(dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_read_state_user ON read_states(user_id);
