# Dynamic.md — Venary Live Application & Messenger Upgrade Plan

> **Purpose**: This document serves as the comprehensive implementation blueprint for converting Venary from a request-response application into a fully real-time "Live Application" powered by Socket.IO, and for building a Discord/Slack-style Messenger extension with servers, channels, bots, webhooks, roles, and a dedicated `/messenger/` layout.

---

## Table of Contents

1. [Current Architecture Analysis](#1-current-architecture-analysis)
2. [Phase 1 — Live Application (Real-Time Everything)](#2-phase-1--live-application-real-time-everything)
3. [Phase 2 — Messenger Extension (Discord-Like)](#3-phase-2--messenger-extension-discord-like)
4. [Database Schema](#4-database-schema)
5. [File-by-File Implementation Checklist](#5-file-by-file-implementation-checklist)
6. [Security Considerations](#6-security-considerations)
7. [Testing Strategy](#7-testing-strategy)

---

## 1. Current Architecture Analysis

### What Already Exists (Socket.IO)

| Component | File | Current Capability |
|---|---|---|
| **Server Socket** | `server/socket.js` | Auth middleware, `onlineUsers` map, DM send/receive, typing indicators, read receipts, presence broadcast to friends |
| **Client Socket** | `public/js/socket-client.js` | Simple event emitter wrapping `io()`, connects with JWT token, handles `new_message`, `message_sent`, `user_typing`, `presence_update`, `messages_read` |
| **Notifications** | `server/routes/notifications.js` | `createNotification()` already emits `io.to('user:${userId}').emit('new_notification')` — but the client polls `/api/notifications/counts` instead of listening |
| **Chat Page** | `public/js/pages/chat.js` | 1:1 DM only, listens for `new_message` and `user_typing` via SocketClient |

### What's Missing for "Live Application"

- **Feed**: Posts, likes, comments are all REST-only. No Socket.IO events emitted when someone creates a post, likes, or comments.
- **Friends**: Friend requests accepted/rejected don't push updates.
- **Notifications**: Client polls `/counts` on an interval rather than reacting to socket pushes.
- **Profile**: Profile updates (avatar, bio) don't broadcast to viewers.
- **Admin/Mod**: Admin actions (bans, role changes) don't propagate in real-time.
- **Extension Events**: Extensions have no standard way to emit socket events (only the Pterodactyl console has a custom namespace).

### What's Missing for "Messenger"

- Everything. The current chat is a simple 1:1 DM panel embedded inside the main app layout. There are no servers, channels, roles, bots, webhooks, voice indicators, or any group functionality.

---

## 2. Phase 1 — Live Application (Real-Time Everything)

### 2.1 Architecture: Event Bus Pattern

Create a centralized **server-side event bus** that all routes can import to emit events. The socket layer subscribes to this bus and fans out to the correct rooms.

#### New File: `server/events.js`

```js
// Centralized event emitter for the entire application
const EventEmitter = require('events');

class VenaryEventBus extends EventEmitter {}

const eventBus = new VenaryEventBus();
eventBus.setMaxListeners(50);

module.exports = eventBus;
```

#### Updated: `server/socket.js`

Subscribe to `eventBus` events and relay them to the correct Socket.IO rooms:

```js
const eventBus = require('./events');

function initializeSocket(io) {
    // ... existing auth middleware and connection handler ...

    // ── Global Event Subscriptions ──────────────────────────────
    eventBus.on('post:created',    (post)    => io.emit('feed:new_post', post));
    eventBus.on('post:deleted',    (data)    => io.emit('feed:post_deleted', data));
    eventBus.on('post:updated',    (data)    => io.emit('feed:post_updated', data));
    eventBus.on('post:liked',      (data)    => io.emit('feed:post_liked', data));
    eventBus.on('post:unliked',    (data)    => io.emit('feed:post_unliked', data));
    eventBus.on('comment:created', (data)    => io.emit('feed:new_comment', data));
    eventBus.on('comment:deleted', (data)    => io.emit('feed:comment_deleted', data));

    eventBus.on('friend:request',  (data)    => io.to(`user:${data.to}`).emit('friend:request', data));
    eventBus.on('friend:accepted', (data)    => {
        io.to(`user:${data.userId}`).emit('friend:accepted', data);
        io.to(`user:${data.friendId}`).emit('friend:accepted', data);
    });
    eventBus.on('friend:removed',  (data)    => {
        io.to(`user:${data.userId}`).emit('friend:removed', data);
        io.to(`user:${data.friendId}`).emit('friend:removed', data);
    });

    eventBus.on('notification:created', (data) => {
        io.to(`user:${data.userId}`).emit('notification:new', data);
    });

    eventBus.on('user:updated',    (data)    => io.emit('user:updated', data));
    eventBus.on('user:banned',     (data)    => io.to(`user:${data.userId}`).emit('user:banned', data));
    eventBus.on('user:role_changed', (data)  => io.to(`user:${data.userId}`).emit('user:role_changed', data));
}
```

### 2.2 Route-by-Route Emission Points

Each existing REST route needs exactly **one line added** after the successful DB write to emit the event.

#### `server/routes/posts.js`

| Endpoint | Event to Emit | Payload |
|---|---|---|
| `POST /` (create post) | `eventBus.emit('post:created', post)` | The full post object with user info |
| `DELETE /:id` | `eventBus.emit('post:deleted', { postId })` | Just the post ID |
| `PUT /:id` | `eventBus.emit('post:updated', { postId, content, image })` | Updated fields |
| `POST /:id/like` (liked) | `eventBus.emit('post:liked', { postId, userId, likeCount })` | Post ID + new count |
| `POST /:id/like` (unliked) | `eventBus.emit('post:unliked', { postId, userId, likeCount })` | Post ID + new count |
| `POST /:id/comments` | `eventBus.emit('comment:created', { postId, comment })` | Post ID + full comment object |
| `DELETE /comments/:commentId` | `eventBus.emit('comment:deleted', { postId, commentId })` | Both IDs |

#### `server/routes/friends.js`

| Endpoint | Event to Emit |
|---|---|
| `POST /request/:id` | `eventBus.emit('friend:request', { from: req.user.id, to: friendId })` |
| `POST /accept/:id` | `eventBus.emit('friend:accepted', { userId: requesterId, friendId: req.user.id })` |
| `DELETE /:id` | `eventBus.emit('friend:removed', { userId: req.user.id, friendId: otherId })` |

#### `server/routes/notifications.js`

| Change | Detail |
|---|---|
| `createNotification()` | Already emits `new_notification` via socket — upgrade to also emit via eventBus with full payload for richer client handling |

#### `server/routes/admin.js`

| Endpoint | Event to Emit |
|---|---|
| Ban user | `eventBus.emit('user:banned', { userId, reason })` |
| Unban user | `eventBus.emit('user:unbanned', { userId })` |
| Change role | `eventBus.emit('user:role_changed', { userId, newRole })` |

#### `server/routes/users.js`

| Endpoint | Event to Emit |
|---|---|
| `PUT /profile` | `eventBus.emit('user:updated', { userId, fields })` |

### 2.3 Client-Side: `SocketClient` Upgrade

#### Updated: `public/js/socket-client.js`

Add listeners for all new event types. The client doesn't need to know about the event bus — it just listens to socket events:

```js
// Feed events
this.socket.on('feed:new_post',      (d) => this.emit('feed:new_post', d));
this.socket.on('feed:post_deleted',  (d) => this.emit('feed:post_deleted', d));
this.socket.on('feed:post_updated',  (d) => this.emit('feed:post_updated', d));
this.socket.on('feed:post_liked',    (d) => this.emit('feed:post_liked', d));
this.socket.on('feed:post_unliked',  (d) => this.emit('feed:post_unliked', d));
this.socket.on('feed:new_comment',   (d) => this.emit('feed:new_comment', d));
this.socket.on('feed:comment_deleted', (d) => this.emit('feed:comment_deleted', d));

// Friend events
this.socket.on('friend:request',     (d) => this.emit('friend:request', d));
this.socket.on('friend:accepted',    (d) => this.emit('friend:accepted', d));
this.socket.on('friend:removed',     (d) => this.emit('friend:removed', d));

// Notification push (replaces polling)
this.socket.on('notification:new',   (d) => this.emit('notification:new', d));

// User/admin events
this.socket.on('user:updated',       (d) => this.emit('user:updated', d));
this.socket.on('user:banned',        (d) => this.emit('user:banned', d));
this.socket.on('user:role_changed',  (d) => this.emit('user:role_changed', d));
```

### 2.4 Page-by-Page Live Wiring

#### `public/js/pages/feed.js`

| Event | Handler |
|---|---|
| `feed:new_post` | Prepend new post card to feed DOM (if visible and not own post already rendered) |
| `feed:post_deleted` | Remove post card from DOM by ID |
| `feed:post_updated` | Update content text in-place |
| `feed:post_liked` / `feed:post_unliked` | Update like count badge + toggle heart icon state |
| `feed:new_comment` | Increment comment count badge; if comments panel is open for that post, append comment |
| `feed:comment_deleted` | Remove comment from DOM; decrement count |

#### `public/js/pages/friends.js`

| Event | Handler |
|---|---|
| `friend:request` | Show toast + add entry to pending requests list |
| `friend:accepted` | Move user from "pending" to "friends" list, show toast |
| `friend:removed` | Remove user from friends list |
| `presence_update` | Already handled — update status dot color |

#### `public/js/app.js` (Global Notification Badge)

| Event | Handler |
|---|---|
| `notification:new` | Increment badge counter, show toast, prepend to dropdown if open |
| Remove `setInterval` polling for `/api/notifications/counts` | Replace with socket-driven updates entirely |

#### `public/js/pages/profile.js`

| Event | Handler |
|---|---|
| `user:updated` | If viewing that user's profile, refresh their displayed bio/avatar/display_name |

### 2.5 Extension Event Bridge

Allow extensions to emit events through the same bus.

#### Updated: `server/extension-loader.js`

Pass `eventBus` into extension route factories:

```js
// In _mountExtension():
if (typeof routeFactory === 'function') {
    router = routeFactory(ext.db, { eventBus: require('./events'), io: app.get('io') });
}
```

Extensions can then do:
```js
module.exports = function(db, { eventBus }) {
    router.post('/donate', async (req, res) => {
        // ... process donation ...
        eventBus.emit('donation:completed', { userId, amount, rankName });
    });
    return router;
};
```

---

## 3. Phase 2 — Messenger Extension (Discord-Like)

### 3.1 Overview

The Messenger is built as a **Venary Extension** (`extensions/messenger/`) with:
- Its own isolated database (`ext_messenger.db`)
- Its own Socket.IO namespace (`/messenger`)
- Its own full-page layout at `/messenger/` route (breaks out of the standard sidebar layout)
- Can be enabled/disabled via the Admin Extensions panel like any other extension

### 3.2 Core Concepts

| Discord Term | Venary Messenger Equivalent | Description |
|---|---|---|
| **Server** | **Space** | A community container with its own channels, roles, members |
| **Channel** | **Channel** | Text/voice/announcement channels within a Space |
| **Category** | **Category** | Groups of channels for organization |
| **Role** | **Role** | Permission groups with color and hierarchy |
| **Bot** | **Bot** | Automated user accounts with bot flag |
| **Webhook** | **Webhook** | HTTP endpoint that posts messages into a channel |
| **DM** | **DM** | 1:1 direct messages (migrated from core chat) |
| **Group DM** | **Group DM** | Multi-user private conversations |
| **Thread** | **Thread** | Sub-conversation spawned from a message |

### 3.3 Extension Manifest

```json
{
    "id": "messenger",
    "name": "Venary Messenger",
    "version": "1.0.0",
    "description": "Discord-like messaging platform with servers, channels, bots, webhooks, roles, threads, and rich media.",
    "author": "Venary",
    "enabled": true,
    "nav": [
        {
            "label": "Messenger",
            "icon": "message-square",
            "route": "/messenger",
            "position": 2
        }
    ],
    "routes": {
        "prefix": "/api/ext/messenger",
        "file": "server/routes.js"
    },
    "pages": [
        {
            "route": "/messenger",
            "file": "public/pages/messenger.js",
            "global": "MessengerPage"
        }
    ],
    "css": [
        "public/css/messenger.css"
    ]
}
```

### 3.4 Database Schema (`extensions/messenger/server/schema.sql`)

```sql
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
    type TEXT DEFAULT 'text',           -- text, voice, announcement, forum, stage
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
    permissions TEXT DEFAULT '{}',       -- JSON bitfield map
    position INTEGER DEFAULT 0,         -- higher = more authority
    is_default INTEGER DEFAULT 0,       -- @everyone equivalent
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
    type TEXT DEFAULT 'default',        -- default, system, bot, webhook, reply, thread_starter
    reply_to_id TEXT,                   -- for replies
    thread_id TEXT,                     -- if this message spawned a thread, points to thread channel
    attachments TEXT DEFAULT '[]',      -- JSON array of {url, filename, size, type}
    embeds TEXT DEFAULT '[]',           -- JSON array of rich embed objects
    reactions TEXT DEFAULT '{}',        -- JSON map { emoji: [userId, ...] }
    pinned INTEGER DEFAULT 0,
    edited_at TEXT,
    deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
);

-- DMs (replacing core messages table for messenger users)
CREATE TABLE IF NOT EXISTS dm_channels (
    id TEXT PRIMARY KEY,
    type TEXT DEFAULT 'dm',             -- dm, group_dm
    name TEXT,                          -- for group DMs
    icon TEXT,                          -- for group DMs
    owner_id TEXT,                      -- for group DMs
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
    channel_id TEXT NOT NULL,           -- can be channel or dm_channel
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
    token TEXT UNIQUE NOT NULL,        -- secret token for posting
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
    token TEXT UNIQUE NOT NULL,         -- bot auth token
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
    max_uses INTEGER DEFAULT 0,         -- 0 = unlimited
    uses INTEGER DEFAULT 0,
    max_age INTEGER DEFAULT 0,          -- seconds, 0 = never expires
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

-- Emojis (custom per-space)
CREATE TABLE IF NOT EXISTS custom_emojis (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Threads (stored as special channels)
-- Threads are channels with type='thread' and a parent_channel_id + parent_message_id

-- Indices
CREATE INDEX IF NOT EXISTS idx_ch_msg_channel ON channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_ch_msg_created ON channel_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_ch_msg_author ON channel_messages(author_id);
CREATE INDEX IF NOT EXISTS idx_members_space ON members(space_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_channels_space ON channels(space_id);
CREATE INDEX IF NOT EXISTS idx_dm_msg_channel ON dm_messages(dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_read_state_user ON read_states(user_id);
```

### 3.5 Permissions System

Modeled after Discord's bitfield permissions:

```js
const Permissions = {
    VIEW_CHANNEL:        1n << 0n,
    SEND_MESSAGES:       1n << 1n,
    EMBED_LINKS:         1n << 2n,
    ATTACH_FILES:        1n << 3n,
    ADD_REACTIONS:       1n << 4n,
    USE_EXTERNAL_EMOJI:  1n << 5n,
    MENTION_EVERYONE:    1n << 6n,
    MANAGE_MESSAGES:     1n << 7n,   // delete others' messages, pin
    READ_MESSAGE_HISTORY:1n << 8n,
    SEND_TTS:            1n << 9n,
    MANAGE_CHANNELS:     1n << 10n,
    MANAGE_ROLES:        1n << 11n,
    MANAGE_WEBHOOKS:     1n << 12n,
    MANAGE_EMOJIS:       1n << 13n,
    KICK_MEMBERS:        1n << 14n,
    BAN_MEMBERS:         1n << 15n,
    MANAGE_SPACE:        1n << 16n,  // edit space name/icon/etc
    ADMINISTRATOR:       1n << 17n,  // bypasses all
    CREATE_INVITES:      1n << 18n,
    MANAGE_THREADS:      1n << 19n,
    CREATE_THREADS:      1n << 20n,
};
```

### 3.6 Socket.IO Namespace: `/messenger`

The messenger uses its own Socket.IO namespace to keep traffic isolated from the main app socket.

```js
// In routes.js, exported as attachConsoleNamespace (already supported by extension-loader)
function attachMessengerNamespace(io) {
    const ns = io.of('/messenger');

    ns.use(authenticateSocket); // same JWT auth

    ns.on('connection', (socket) => {
        const userId = socket.user.id;

        // Join personal room
        socket.join(`user:${userId}`);

        // Join all spaces the user is a member of
        socket.on('subscribe_spaces', async () => {
            const memberships = await db.all('SELECT space_id FROM members WHERE user_id = ?', [userId]);
            memberships.forEach(m => socket.join(`space:${m.space_id}`));
        });

        // Join specific channel room for active viewing
        socket.on('join_channel', (channelId) => {
            socket.join(`channel:${channelId}`);
        });

        socket.on('leave_channel', (channelId) => {
            socket.leave(`channel:${channelId}`);
        });

        // Send message in channel
        socket.on('channel:send_message', async (data) => {
            // Validate permissions, save to DB, then:
            ns.to(`channel:${data.channelId}`).emit('channel:message', message);
            // Update read states, trigger @mention notifications, etc.
        });

        // Typing indicator per channel
        socket.on('channel:typing', (data) => {
            socket.to(`channel:${data.channelId}`).emit('channel:typing', {
                userId, username: socket.user.username, channelId: data.channelId
            });
        });

        // Message reactions
        socket.on('channel:react', async (data) => {
            // Save reaction, then:
            ns.to(`channel:${data.channelId}`).emit('channel:reaction_update', reactionData);
        });

        // DM send
        socket.on('dm:send_message', async (data) => {
            // Save to dm_messages table, then emit to all DM members
        });

        // Presence
        socket.on('disconnect', () => {
            // Update presence across spaces
        });
    });
}
```

### 3.7 REST API Routes (`/api/ext/messenger/`)

#### Spaces
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/spaces` | Create a new Space |
| `GET` | `/spaces` | List user's Spaces |
| `GET` | `/spaces/:id` | Get Space details (channels, roles, members) |
| `PUT` | `/spaces/:id` | Update Space settings |
| `DELETE` | `/spaces/:id` | Delete Space (owner only) |
| `POST` | `/spaces/:id/join` | Join via invite code |
| `POST` | `/spaces/:id/leave` | Leave a Space |

#### Channels
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/spaces/:id/channels` | Create channel |
| `PUT` | `/channels/:id` | Update channel |
| `DELETE` | `/channels/:id` | Delete channel |
| `GET` | `/channels/:id/messages` | Get message history (paginated) |
| `POST` | `/channels/:id/messages` | Send message (REST fallback) |
| `PUT` | `/messages/:id` | Edit message |
| `DELETE` | `/messages/:id` | Delete message |
| `POST` | `/messages/:id/pin` | Pin/unpin message |
| `POST` | `/channels/:id/messages/:msgId/reactions/:emoji` | Add reaction |
| `DELETE` | `/channels/:id/messages/:msgId/reactions/:emoji` | Remove reaction |

#### Roles
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/spaces/:id/roles` | Create role |
| `PUT` | `/roles/:id` | Update role (name, color, permissions, position) |
| `DELETE` | `/roles/:id` | Delete role |
| `POST` | `/members/:memberId/roles/:roleId` | Assign role |
| `DELETE` | `/members/:memberId/roles/:roleId` | Remove role |

#### Members
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/spaces/:id/members` | List members with roles |
| `PUT` | `/members/:id` | Update nickname |
| `POST` | `/spaces/:id/kick/:userId` | Kick member |
| `POST` | `/spaces/:id/ban/:userId` | Ban member |
| `DELETE` | `/spaces/:id/ban/:userId` | Unban member |

#### Invites
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/spaces/:id/invites` | Create invite |
| `GET` | `/spaces/:id/invites` | List active invites |
| `DELETE` | `/invites/:code` | Revoke invite |
| `GET` | `/invites/:code` | Get invite info (public) |

#### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/channels/:id/webhooks` | Create webhook |
| `GET` | `/channels/:id/webhooks` | List webhooks |
| `DELETE` | `/webhooks/:id` | Delete webhook |
| `POST` | `/webhooks/:id/:token` | Execute webhook (send message, no auth required) |

#### Bots
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bots` | Create bot application |
| `GET` | `/bots` | List user's bots |
| `PUT` | `/bots/:id` | Update bot |
| `DELETE` | `/bots/:id` | Delete bot |
| `POST` | `/bots/:id/token/reset` | Regenerate bot token |
| `POST` | `/spaces/:id/bots/:botId` | Install bot to space |
| `DELETE` | `/spaces/:id/bots/:botId` | Remove bot from space |

#### DMs
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/dm` | Open/get DM channel with user |
| `POST` | `/dm/group` | Create group DM |
| `GET` | `/dm` | List DM channels |
| `GET` | `/dm/:channelId/messages` | Get DM messages |

#### Threads
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/messages/:id/threads` | Create thread from message |
| `GET` | `/channels/:id/threads` | List active threads |

### 3.8 Frontend Layout (`/messenger/` route)

The messenger page breaks out of the standard Venary sidebar layout and renders its own **three-panel Discord-like layout**:

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────┬─────────────┬────────────────────────┬─────────────┐ │
│ │    │ # general    │  Message Area          │ Member List │ │
│ │ S  │ # announcements│                     │             │ │
│ │ p  │ # gaming     │  ┌─────────────────┐  │ 🟢 Admin    │ │
│ │ a  │              │  │ User: Hello!     │  │ 🟢 User2   │ │
│ │ c  │ VOICE        │  │ User2: Hey!      │  │ 🔴 User3   │ │
│ │ e  │ 🔊 Lounge    │  │ Bot: Welcome!    │  │             │ │
│ │    │              │  └─────────────────┘  │             │ │
│ │ L  │              │                        │             │ │
│ │ i  │              │  ┌──────────────────┐  │             │ │
│ │ s  │              │  │ Type a message...│  │             │ │
│ │ t  │              │  └──────────────────┘  │             │ │
│ └────┴─────────────┴────────────────────────┴─────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Panel 1 — Space Sidebar (60px)**: Vertical strip of Space icons + DM button + user settings  
**Panel 2 — Channel List (~240px)**: Channel categories and channels, contextual to active space  
**Panel 3 — Message Area (flex)**: Chat messages, input area, thread sidebar  
**Panel 4 — Member List (~240px, toggleable)**: Online/offline members grouped by role  

### 3.9 File Structure

```
extensions/messenger/
├── manifest.json
├── server/
│   ├── schema.sql
│   ├── routes.js              # Main route factory
│   ├── routes/
│   │   ├── spaces.js
│   │   ├── channels.js
│   │   ├── messages.js
│   │   ├── roles.js
│   │   ├── members.js
│   │   ├── invites.js
│   │   ├── webhooks.js
│   │   ├── bots.js
│   │   └── dm.js
│   ├── socket.js              # /messenger namespace handler
│   ├── permissions.js         # Bitfield permission calculator
│   └── discord.js             # Optional: bridge to external Discord
├── public/
│   ├── css/
│   │   └── messenger.css      # Full Discord-like layout styles
│   ├── pages/
│   │   └── messenger.js       # Main SPA page
│   └── components/
│       ├── space-list.js
│       ├── channel-list.js
│       ├── message-area.js
│       ├── member-list.js
│       ├── space-settings.js
│       ├── user-settings.js
│       └── thread-panel.js
```

---

## 4. Database Schema Summary

### Core DB Changes (Phase 1)
**None required.** Phase 1 only adds event emissions to existing routes. The existing schema supports everything needed.

### Extension DB (Phase 2 — `ext_messenger`)
See Section 3.4 for the full schema. Key tables:
- `spaces`, `categories`, `channels`, `roles`, `members`, `member_roles`
- `channel_messages`, `dm_channels`, `dm_members`, `dm_messages`
- `read_states`, `webhooks`, `bots`, `bot_installations`
- `invites`, `space_bans`, `custom_emojis`

---

## 5. File-by-File Implementation Checklist

### Phase 1: Live Application

- [ ] **`server/events.js`** — [NEW] Create centralized EventEmitter bus
- [ ] **`server/socket.js`** — [MODIFY] Subscribe to eventBus events, relay to socket rooms
- [ ] **`server/routes/posts.js`** — [MODIFY] Add `eventBus.emit()` calls after every mutation
- [ ] **`server/routes/friends.js`** — [MODIFY] Add `eventBus.emit()` calls
- [ ] **`server/routes/notifications.js`** — [MODIFY] Upgrade `createNotification()` to emit richer payloads
- [ ] **`server/routes/admin.js`** — [MODIFY] Add `eventBus.emit()` for ban/unban/role changes
- [ ] **`server/routes/users.js`** — [MODIFY] Add `eventBus.emit()` for profile updates
- [ ] **`server/extension-loader.js`** — [MODIFY] Pass eventBus to extension route factories
- [ ] **`public/js/socket-client.js`** — [MODIFY] Add listeners for all new event types
- [ ] **`public/js/pages/feed.js`** — [MODIFY] Wire up live feed updates (new posts, likes, comments)
- [ ] **`public/js/pages/friends.js`** — [MODIFY] Wire up live friend request/accept/remove
- [ ] **`public/js/app.js`** — [MODIFY] Replace notification polling with socket push, wire global event listeners
- [ ] **`public/js/pages/profile.js`** — [MODIFY] Listen for `user:updated` events when viewing profiles

### Phase 2: Messenger Extension

- [ ] **`extensions/messenger/manifest.json`** — [NEW] Extension manifest
- [ ] **`extensions/messenger/server/schema.sql`** — [NEW] Full messenger schema
- [ ] **`extensions/messenger/server/permissions.js`** — [NEW] Bitfield permission system
- [ ] **`extensions/messenger/server/routes.js`** — [NEW] Route factory + namespace attachment
- [ ] **`extensions/messenger/server/routes/spaces.js`** — [NEW] CRUD for Spaces
- [ ] **`extensions/messenger/server/routes/channels.js`** — [NEW] CRUD for Channels + messages
- [ ] **`extensions/messenger/server/routes/messages.js`** — [NEW] Message operations (edit, delete, pin, react)
- [ ] **`extensions/messenger/server/routes/roles.js`** — [NEW] Role CRUD + assignment
- [ ] **`extensions/messenger/server/routes/members.js`** — [NEW] Member management (kick, ban, nickname)
- [ ] **`extensions/messenger/server/routes/invites.js`** — [NEW] Invite generation + redemption
- [ ] **`extensions/messenger/server/routes/webhooks.js`** — [NEW] Webhook CRUD + execution
- [ ] **`extensions/messenger/server/routes/bots.js`** — [NEW] Bot application management
- [ ] **`extensions/messenger/server/routes/dm.js`** — [NEW] DM + Group DM channels
- [ ] **`extensions/messenger/server/socket.js`** — [NEW] Real-time message relay, typing, presence
- [ ] **`extensions/messenger/public/css/messenger.css`** — [NEW] Full Discord-like layout CSS
- [ ] **`extensions/messenger/public/pages/messenger.js`** — [NEW] Main SPA page with panel rendering
- [ ] **`extensions/messenger/public/components/space-list.js`** — [NEW] Vertical space icon strip
- [ ] **`extensions/messenger/public/components/channel-list.js`** — [NEW] Channel/category sidebar
- [ ] **`extensions/messenger/public/components/message-area.js`** — [NEW] Chat area with virtual scroll
- [ ] **`extensions/messenger/public/components/member-list.js`** — [NEW] Role-grouped member list
- [ ] **`extensions/messenger/public/components/space-settings.js`** — [NEW] Space administration modal
- [ ] **`extensions/messenger/public/components/thread-panel.js`** — [NEW] Thread side panel

---

## 6. Security Considerations

| Concern | Mitigation |
|---|---|
| **Socket auth** | Already using JWT verification in socket middleware. Messenger namespace reuses the same pattern. |
| **Permission checks** | Every socket event and REST endpoint must validate the user's computed permissions for the target space/channel using the role hierarchy resolver. |
| **Rate limiting** | Add per-user rate limits on message sending (e.g., 5 messages/5 seconds) both on socket events and REST endpoints. |
| **Webhook tokens** | Generated via `crypto.randomBytes(32).toString('hex')`. Webhook execution endpoint (`POST /webhooks/:id/:token`) requires no auth but validates the token. |
| **Bot tokens** | Same generation as webhooks. Bots authenticate via `Authorization: Bot <token>` header. |
| **XSS in messages** | All message content must be HTML-escaped on render. Embeds and attachments should be sanitized. |
| **File uploads** | Limit file sizes (8MB default, configurable). Validate MIME types. Store via the existing image extension or a dedicated CDN path. |
| **Invite abuse** | Rate limit invite creation. Support max_uses and expiry. |
| **Admin escalation** | Space owner always has full permissions. Platform admins can moderate any space. |

---

## 7. Testing Strategy

### Phase 1
1. Open two browser windows logged in as different users.
2. **Feed**: User A creates a post → verify it appears in User B's feed instantly.
3. **Likes**: User B likes the post → verify the like count updates on User A's screen.
4. **Comments**: User A comments → verify it appears for User B without refresh.
5. **Friends**: User A sends friend request → verify notification + request list update for User B.
6. **Notifications**: Verify badge counts update via socket push without any polling.
7. **Profile**: User A updates their avatar → verify it updates on User B's view of their profile.

### Phase 2
1. Create a Space, verify it appears in the space list.
2. Create channels within the space.
3. Open the space in two windows — send a message in one, verify it appears instantly in the other.
4. Test role creation and permission enforcement (user without SEND_MESSAGES cannot type).
5. Create a webhook, POST to it externally, verify the message appears in the channel.
6. Create a bot, install it in a space, send a message as the bot via its token.
7. Test DMs and group DMs.
8. Test thread creation and replies.
9. Test invite flow: create invite → share code → second user joins.
10. Test kick/ban flow: ban a user → verify they're ejected.

---

## Implementation Priority

**Phase 1 (Live App)** should be done first since it establishes the event bus infrastructure that the Messenger extension will also use. Estimated scope:
- Phase 1: ~2-3 sessions (event bus + route emissions + client wiring)
- Phase 2: ~8-12 sessions (full messenger extension from schema to UI)

The Messenger is the largest feature Venary has ever built. It's recommended to build it incrementally:
1. Schema + Space/Channel CRUD + basic message sending
2. Socket.IO namespace + real-time messages
3. Roles + permissions
4. DMs + Group DMs (migrate from core chat)
5. Webhooks + Bots
6. Threads + Reactions + Pins
7. UI polish + mobile responsive
