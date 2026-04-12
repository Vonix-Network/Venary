/* =======================================
   Messenger — Socket.IO Namespace
   Handles real-time messaging, typing,
   reactions, and presence for the
   /messenger namespace.
   ======================================= */
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('../../../server/middleware/auth');
const mainDb = require('../../../server/db');

module.exports = function attachMessengerNamespace(io, db) {
    const ns = io.of('/messenger');

    // Auth middleware
    ns.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication required'));
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    ns.on('connection', async (socket) => {
        const userId = socket.user.id;

        // Enrich socket.user with display_name and avatar from main DB once per connection
        try {
            const profile = await mainDb.get(
                'SELECT display_name, avatar FROM users WHERE id = ?', [userId]
            );
            if (profile) {
                socket.user.display_name = profile.display_name;
                socket.user.avatar       = profile.avatar;
            }
        } catch (e) { /* non-fatal */ }
        console.log(`[Messenger] User connected: ${socket.user.username}`);

        // Join personal room
        socket.join(`user:${userId}`);

        // Subscribe to all spaces the user is a member of
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

        // Join a specific channel room for live message viewing
        socket.on('join_channel', (channelId) => {
            socket.join(`channel:${channelId}`);
            socket.emit('channel_joined', { channelId });
        });

        socket.on('leave_channel', (channelId) => {
            socket.leave(`channel:${channelId}`);
        });

        // Send message in a channel
        socket.on('channel:send_message', async (data) => {
            try {
                const { channelId, content, reply_to_id, attachments } = data;
                if (!channelId || (!content && (!attachments || !attachments.length))) return;

                const channel = await db.get('SELECT * FROM channels WHERE id = ?', [channelId]);
                if (!channel) return socket.emit('error', { message: 'Channel not found' });

                const msgId = uuidv4();
                const now = new Date().toISOString();

                await db.run(
                    `INSERT INTO channel_messages
                     (id, channel_id, author_id, content, reply_to_id, attachments, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [msgId, channelId, userId, content || null,
                     reply_to_id || null, JSON.stringify(attachments || []), now]
                );

                await db.run(
                    'UPDATE channels SET last_message_at = ? WHERE id = ?', [now, channelId]
                );

                const message = await db.get('SELECT * FROM channel_messages WHERE id = ?', [msgId]);
                const enriched = {
                    ...message,
                    sender_username:     socket.user.username,
                    sender_display_name: socket.user.display_name || null,
                    sender_avatar:       socket.user.avatar       || null
                };

                ns.to(`channel:${channelId}`).emit('channel:message', enriched);

                // Update read state for sender (upsert — works in SQLite 3.24+ and PostgreSQL)
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

        // Typing indicator in channel
        socket.on('channel:typing', (data) => {
            const { channelId } = data;
            socket.to(`channel:${channelId}`).emit('channel:typing', {
                userId,
                username: socket.user.username,
                channelId
            });
        });

        // React to a message
        socket.on('channel:react', async (data) => {
            try {
                const { messageId, emoji, channelId } = data;
                const message = await db.get(
                    'SELECT * FROM channel_messages WHERE id = ?', [messageId]
                );
                if (!message || message.deleted) return;

                const reactions = JSON.parse(message.reactions || '{}');
                if (!reactions[emoji]) reactions[emoji] = [];
                const idx = reactions[emoji].indexOf(userId);
                if (idx === -1) {
                    reactions[emoji].push(userId);
                } else {
                    reactions[emoji].splice(idx, 1);
                    if (reactions[emoji].length === 0) delete reactions[emoji];
                }

                await db.run(
                    'UPDATE channel_messages SET reactions = ? WHERE id = ?',
                    [JSON.stringify(reactions), messageId]
                );

                ns.to(`channel:${channelId}`).emit('channel:reaction_update', { messageId, reactions });
            } catch (err) {
                console.error('[Messenger] channel:react error:', err);
            }
        });

        // Mark channel as read
        socket.on('channel:mark_read', async (data) => {
            try {
                const { channelId, lastMessageId } = data;
                await db.run(
                    `INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count)
                     VALUES (?, ?, ?, 0)
                     ON CONFLICT(user_id, channel_id) DO UPDATE SET last_read_message_id = EXCLUDED.last_read_message_id, mention_count = 0`,
                    [userId, channelId, lastMessageId]
                );
            } catch (err) {
                console.error('[Messenger] channel:mark_read error:', err);
            }
        });

        // DM: send message
        socket.on('dm:send_message', async (data) => {
            try {
                const { dmChannelId, content, reply_to_id } = data;
                if (!dmChannelId || !content) return;

                // Verify membership
                const member = await db.get(
                    'SELECT 1 FROM dm_members WHERE dm_channel_id = ? AND user_id = ?',
                    [dmChannelId, userId]
                );
                if (!member) return socket.emit('error', { message: 'Not a member of this DM' });

                const msgId = uuidv4();
                const now = new Date().toISOString();

                await db.run(
                    `INSERT INTO dm_messages (id, dm_channel_id, author_id, content, reply_to_id, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [msgId, dmChannelId, userId, content, reply_to_id || null, now]
                );

                await db.run(
                    'UPDATE dm_channels SET last_message_at = ? WHERE id = ?', [now, dmChannelId]
                );

                const message = await db.get('SELECT * FROM dm_messages WHERE id = ?', [msgId]);
                const enriched = {
                    ...message,
                    sender_username:     socket.user.username,
                    sender_display_name: socket.user.display_name || null,
                    sender_avatar:       socket.user.avatar       || null
                };

                // Emit to all DM members
                const members = await db.all(
                    'SELECT user_id FROM dm_members WHERE dm_channel_id = ?', [dmChannelId]
                );
                members.forEach(m => {
                    ns.to(`user:${m.user_id}`).emit('dm:message', enriched);
                });
            } catch (err) {
                console.error('[Messenger] dm:send_message error:', err);
                socket.emit('error', { message: 'Failed to send DM' });
            }
        });

        // DM: typing indicator
        socket.on('dm:typing', async (data) => {
            try {
                const { dmChannelId } = data;
                const members = await db.all(
                    'SELECT user_id FROM dm_members WHERE dm_channel_id = ? AND user_id != ?',
                    [dmChannelId, userId]
                );
                members.forEach(m => {
                    ns.to(`user:${m.user_id}`).emit('dm:typing', {
                        userId,
                        username: socket.user.username,
                        dmChannelId
                    });
                });
            } catch (err) {
                console.error('[Messenger] dm:typing error:', err);
            }
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`[Messenger] User disconnected: ${socket.user.username}`);
        });
    });

    return ns;
};
