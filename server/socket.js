/* =======================================
   Venary — Socket.IO Server
   Handles real-time DMs, presence, and
   fans out all application events from
   the centralized event bus.
   ======================================= */
const jwt = require('jsonwebtoken');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('./middleware/auth');
const db = require('./db');
const eventBus = require('./events');

// Track online users: { userId: Set<socketId> }
const onlineUsers = new Map();
let ioInstance;

// Simple in-memory per-socket rate limiter
// Returns true if the action is allowed, false if rate-limited
function socketRateLimit(store, key, maxPerWindow, windowMs) {
    const now = Date.now();
    if (!store.has(key)) store.set(key, { count: 0, resetAt: now + windowMs });
    const entry = store.get(key);
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    return entry.count <= maxPerWindow;
}
const msgRateLimitStore  = new Map(); // send_message: 30/min per socket
const typingRateLimitStore = new Map(); // typing: 60/min per socket

function initializeSocket(io) {
    ioInstance = io;

    // ── Auth middleware ──────────────────────────────────────────
    io.use((socket, next) => {
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

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        logger.info('socket_connected', { username: socket.user.username, userId });

        // Track online status
        if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
        onlineUsers.get(userId).add(socket.id);

        db.run("UPDATE users SET status = 'online', last_seen = ? WHERE id = ?", [new Date().toISOString(), userId])
            .catch(err => logger.error('Status update error:', { err: err.message, stack: err.stack }));

        broadcastPresence(io, userId, 'online');
        socket.join(`user:${userId}`);

        // ── DM: send message ────────────────────────────────────
        socket.on('send_message', async (data) => {
            try {
                if (!socketRateLimit(msgRateLimitStore, socket.id, 30, 60 * 1000)) {
                    return socket.emit('error', { message: 'Message rate limit exceeded. Please slow down.' });
                }
                const { receiver_id, content } = data;
                if (!receiver_id || !content) return;

                // Validate receiver exists and content is within bounds
                const receiver = await db.get('SELECT id FROM users WHERE id = ?', [receiver_id]);
                if (!receiver) return socket.emit('error', { message: 'Recipient not found' });
                if (typeof content !== 'string' || content.length > 4000) return socket.emit('error', { message: 'Invalid message' });

                const id = uuidv4();
                const now = new Date().toISOString();
                await db.run(
                    `INSERT INTO messages (id, sender_id, receiver_id, content, created_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [id, userId, receiver_id, content, now]
                );

                const message = {
                    id,
                    sender_id: userId,
                    receiver_id,
                    content,
                    read: 0,
                    created_at: now,
                    sender_username: socket.user.username
                };

                io.to(`user:${receiver_id}`).emit('new_message', message);
                socket.emit('message_sent', message);
            } catch (err) {
                logger.error('Send message error:', { err: err.message, stack: err.stack });
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // ── DM: typing indicator ─────────────────────────────────
        socket.on('typing', (data) => {
            if (!socketRateLimit(typingRateLimitStore, socket.id, 60, 60 * 1000)) return;
            const { receiver_id, is_typing } = data;
            if (!receiver_id) return;
            io.to(`user:${receiver_id}`).emit('user_typing', {
                user_id: userId,
                username: socket.user.username,
                is_typing
            });
        });

        // ── DM: mark as read ─────────────────────────────────────
        socket.on('mark_read', async (data) => {
            const { sender_id } = data;
            await db.run(
                `UPDATE messages SET read = 1
                 WHERE sender_id = ? AND receiver_id = ? AND read = 0`,
                [sender_id, userId]
            );
            io.to(`user:${sender_id}`).emit('messages_read', { reader_id: userId });
        });

        // ── Disconnect ───────────────────────────────────────────
        socket.on('disconnect', () => {
            logger.info('socket_disconnected', { username: socket.user.username });
            msgRateLimitStore.delete(socket.id);
            typingRateLimitStore.delete(socket.id);
            const userSockets = onlineUsers.get(userId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    onlineUsers.delete(userId);
                    db.run("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?", [new Date().toISOString(), userId])
                        .catch(err => logger.error('Status update error:', { err: err.message, stack: err.stack }));
                    broadcastPresence(io, userId, 'offline');
                }
            }
        });
    });

    // ── Global Event Bus Subscriptions ──────────────────────────
    // Feed
    eventBus.on('post:created',      (post)  => io.emit('feed:new_post', post));
    eventBus.on('post:deleted',      (data)  => io.emit('feed:post_deleted', data));
    eventBus.on('post:updated',      (data)  => io.emit('feed:post_updated', data));
    eventBus.on('post:liked',        (data)  => io.emit('feed:post_liked', data));
    eventBus.on('post:unliked',      (data)  => io.emit('feed:post_unliked', data));
    eventBus.on('comment:created',   (data)  => io.emit('feed:new_comment', data));
    eventBus.on('comment:deleted',   (data)  => io.emit('feed:comment_deleted', data));

    // Friends
    eventBus.on('friend:request',  (data) => io.to(`user:${data.to}`).emit('friend:request', data));
    eventBus.on('friend:accepted', (data) => {
        io.to(`user:${data.userId}`).emit('friend:accepted', data);
        io.to(`user:${data.friendId}`).emit('friend:accepted', data);
    });
    eventBus.on('friend:removed',  (data) => {
        io.to(`user:${data.userId}`).emit('friend:removed', data);
        io.to(`user:${data.friendId}`).emit('friend:removed', data);
    });

    // Notifications
    eventBus.on('notification:created', (data) => {
        io.to(`user:${data.userId}`).emit('notification:new', data);
    });

    // Users / admin
    eventBus.on('user:updated',      (data) => io.emit('user:updated', data));
    eventBus.on('user:banned',       (data) => io.to(`user:${data.userId}`).emit('user:banned', data));
    eventBus.on('user:unbanned',     (data) => io.to(`user:${data.userId}`).emit('user:unbanned', data));
    eventBus.on('user:role_changed', (data) => io.to(`user:${data.userId}`).emit('user:role_changed', data));
}

async function broadcastPresence(io, userId, status) {
    const friends = await db.all(
        `SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as friend_id
         FROM friendships
         WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'`,
        [userId, userId, userId]
    );
    friends.forEach(f => {
        io.to(`user:${f.friend_id}`).emit('presence_update', { user_id: userId, status });
    });
}

function getOnlineUsers() {
    return Array.from(onlineUsers.keys());
}

function getIo() {
    return ioInstance;
}

module.exports = { initializeSocket, getOnlineUsers, getIo };
