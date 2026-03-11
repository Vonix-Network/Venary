const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('./middleware/auth');
const db = require('./db');

// Track online users: { userId: Set<socketId> }
const onlineUsers = new Map();

function initializeSocket(io) {
    // Auth middleware for socket connections
    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication required'));
        }
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
        console.log(`User connected: ${socket.user.username} (${userId})`);

        // Track online status
        if (!onlineUsers.has(userId)) {
            onlineUsers.set(userId, new Set());
        }
        onlineUsers.get(userId).add(socket.id);

        // Update status in DB
        db.run("UPDATE users SET status = 'online', last_seen = ? WHERE id = ?", [new Date().toISOString(), userId])
            .catch(err => console.error('Status update error:', err));

        // Broadcast status to friends
        broadcastPresence(io, userId, 'online');

        // Join user's own room for targeted messages
        socket.join(`user:${userId}`);

        // Send message
        socket.on('send_message', async (data) => {
            try {
                const { receiver_id, content } = data;
                if (!receiver_id || !content) return;

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

                // Send to receiver
                io.to(`user:${receiver_id}`).emit('new_message', message);
                // Send back to sender for confirmation
                socket.emit('message_sent', message);
            } catch (err) {
                console.error('Send message error:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing', (data) => {
            const { receiver_id, is_typing } = data;
            io.to(`user:${receiver_id}`).emit('user_typing', {
                user_id: userId,
                username: socket.user.username,
                is_typing
            });
        });

        // Mark messages as read
        socket.on('mark_read', async (data) => {
            const { sender_id } = data;
            await db.run(
                `UPDATE messages SET read = 1
                 WHERE sender_id = ? AND receiver_id = ? AND read = 0`,
                [sender_id, userId]
            );

            io.to(`user:${sender_id}`).emit('messages_read', { reader_id: userId });
        });

        // Disconnect
        socket.on('disconnect', () => {
            console.log(`User disconnected: ${socket.user.username}`);

            const userSockets = onlineUsers.get(userId);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    onlineUsers.delete(userId);
                    db.run("UPDATE users SET status = 'offline', last_seen = ? WHERE id = ?", [new Date().toISOString(), userId])
                        .catch(err => console.error('Status update error:', err));
                    broadcastPresence(io, userId, 'offline');
                }
            }
        });
    });
}

async function broadcastPresence(io, userId, status) {
    // Get user's friends
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

module.exports = { initializeSocket, getOnlineUsers };
