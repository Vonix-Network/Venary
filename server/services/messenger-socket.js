/**
 * Venary — Messenger Socket.IO Namespace
 * Migrated from extensions/messenger/server/socket.js
 *
 * Handles real-time messaging, typing, reactions, and presence
 * for the /messenger namespace.
 */
'use strict';

const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('../middleware/auth');
const db     = require('../db');

/**
 * Attach the /messenger Socket.IO namespace to the given io instance.
 * @param {import('socket.io').Server} io
 * @returns {import('socket.io').Namespace}
 */
module.exports = function attachMessengerNamespace(io) {
    const ns = io.of('/messenger');

    // ── Auth middleware ───────────────────────────────────────────────────────
    ns.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication required'));
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.user = decoded;
            next();
        } catch {
            next(new Error('Invalid token'));
        }
    });

    ns.on('connection', async (socket) => {
        const userId = socket.user.id;

        // Enrich socket.user with display_name and avatar from unified DB
        try {
            const profile = await db.get(
                'SELECT display_name, avatar FROM users WHERE id = ?', [userId]
            );
            if (profile) {
                socket.user.display_name = profile.display_name;
                socket.user.avatar       = profile.avatar;
            }
        } catch { /* non-fatal */ }
        console.log(`[Messenger] User connected: ${socket.user.username}`);

        // Join personal room
        socket.join(`user:${userId}`);

        // ── Space subscriptions ───────────────────────────────────────────────

        socket.on('subscribe_spaces', async () => {
            try {
                const memberships = await db.all(
                    'SELECT space_id FROM members WHERE user_id = ?', [userId]
                );
                memberships.forEach(m => socket.join(`space:${m.space_id}`));
                socket.emit('spaces_subscribed', { count: memberships.length });
            } catch (err) {
                console.error('[Messenger] subscribe_spaces error:', err);
            }
        });

        // ── Channel presence ──────────────────────────────────────────────────

        socket.on('join_channel', (channelId) => {
            socket.join(`channel:${channelId}`);
            socket.emit('channel_joined', { channelId });
        });

        socket.on('leave_channel', (channelId) => {
            socket.leave(`channel:${channelId}`);
        });

        // ── Channel messages ──────────────────────────────────────────────────

        socket.on('channel:send_message', async (data) => {
            try {
                const { channelId, content, reply_to_id, attachments } = data;
                if (!channelId || (!content && (!attachments || !attachments.length))) return;

                const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
                if (!channel) return socket.emit('error', { message: 'Channel not found' });

                const msgId = uuidv4();
                const now   = new Date().toISOString();

                await db.run(
                    `INSERT INTO channel_messages
                     (id, channel_id, author_id, content, reply_to_id, attachments, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [msgId, channelId, userId, content || null,
                     reply_to_id || null, JSON.stringify(attachments || []), now]
                );
                await db.run('UPDATE channels SET last_message_at = ? WHERE id = ?', [now, channelId]);

                const message  = await db.get('SELECT * FROM channel_messages WHERE id = ?', [msgId]);
                const enriched = {
                    ...message,
                    sender_username:     socket.user.username,
                    sender_display_name: socket.user.display_name || null,
                    sender_avatar:       socket.user.avatar       || null,
                };

                socket.to(`channel:${channelId}`).emit('channel:message', enriched);

                // Mark read for sender
                await db.run(
                    `INSERT INTO read_states (user_id, channel_id, last_read_message_id)
                     VALUES (?, ?, ?)
                     ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id`,
                    [userId, channelId, msgId]
                );
            } catch (err) {
                console.error('[Messenger] channel:send_message error:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('channel:typing', ({ channelId }) => {
            socket.to(`channel:${channelId}`).emit('channel:typing', {
                userId, username: socket.user.username, channelId,
            });
        });

        socket.on('channel:react', async ({ messageId, emoji, channelId }) => {
            try {
                const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [messageId]);
                if (!message || message.deleted) return;

                const reactions = JSON.parse(message.reactions || '{}');
                if (!reactions[emoji]) reactions[emoji] = [];
                const idx = reactions[emoji].indexOf(userId);
                if (idx === -1) reactions[emoji].push(userId);
                else {
                    reactions[emoji].splice(idx, 1);
                    if (!reactions[emoji].length) delete reactions[emoji];
                }

                await db.run('UPDATE channel_messages SET reactions = ? WHERE id = ?',
                    [JSON.stringify(reactions), messageId]);

                ns.to(`channel:${channelId}`).emit('channel:reaction_update', { messageId, reactions });
            } catch (err) {
                console.error('[Messenger] channel:react error:', err);
            }
        });

        socket.on('channel:mark_read', async ({ channelId, lastMessageId }) => {
            try {
                await db.run(
                    `INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count)
                     VALUES (?, ?, ?, 0)
                     ON CONFLICT(user_id, channel_id) DO UPDATE
                     SET last_read_message_id = EXCLUDED.last_read_message_id, mention_count = 0`,
                    [userId, channelId, lastMessageId]
                );
            } catch (err) {
                console.error('[Messenger] channel:mark_read error:', err);
            }
        });

        // ── DM messages ───────────────────────────────────────────────────────

        socket.on('dm:send_message', async ({ dmChannelId, content, reply_to_id }) => {
            try {
                if (!dmChannelId || !content) return;

                const member = await db.get(
                    'SELECT 1 FROM dm_members WHERE dm_channel_id = ? AND user_id = ?',
                    [dmChannelId, userId]
                );
                if (!member) return socket.emit('error', { message: 'Not a member of this DM' });

                const msgId = uuidv4();
                const now   = new Date().toISOString();

                await db.run(
                    `INSERT INTO dm_messages (id, dm_channel_id, author_id, content, reply_to_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [msgId, dmChannelId, userId, content, reply_to_id || null, now]
                );
                await db.run('UPDATE dm_channels SET last_message_at = ? WHERE id = ?', [now, dmChannelId]);

                const message  = await db.get('SELECT * FROM dm_messages WHERE id = ?', [msgId]);
                const enriched = {
                    ...message,
                    sender_username:     socket.user.username,
                    sender_display_name: socket.user.display_name || null,
                    sender_avatar:       socket.user.avatar       || null,
                };

                const members = await db.all('SELECT user_id FROM dm_members WHERE dm_channel_id = ?', [dmChannelId]);
                members.forEach(m => {
                    if (m.user_id !== userId) {
                        ns.to(`user:${m.user_id}`).emit('dm:message', enriched);
                    }
                });
            } catch (err) {
                console.error('[Messenger] dm:send_message error:', err);
                socket.emit('error', { message: 'Failed to send DM' });
            }
        });

        socket.on('dm:typing', async ({ dmChannelId }) => {
            try {
                const members = await db.all(
                    'SELECT user_id FROM dm_members WHERE dm_channel_id = ? AND user_id != ?',
                    [dmChannelId, userId]
                );
                members.forEach(m => ns.to(`user:${m.user_id}`).emit('dm:typing', {
                    userId, username: socket.user.username, dmChannelId,
                }));
            } catch (err) {
                console.error('[Messenger] dm:typing error:', err);
            }
        });

        // ── Disconnect ────────────────────────────────────────────────────────

        socket.on('disconnect', () => {
            console.log(`[Messenger] User disconnected: ${socket.user.username}`);
        });
    });

    return ns;
};
