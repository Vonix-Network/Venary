/* =======================================
   Venary — Socket.io Client
   ======================================= */
const SocketClient = {
    socket: null,
    connected: false,
    eventHandlers: {},

    connect(token) {
        if (this.socket) this.disconnect();

        this.socket = io({
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        this.socket.on('connect', () => {
            this.connected = true;
            console.log('🔌 Socket connected');
            this.emit('connected');
        });

        this.socket.on('disconnect', () => {
            this.connected = false;
            console.log('🔌 Socket disconnected');
            this.emit('disconnected');
        });

        this.socket.on('new_message', (msg) => {
            this.emit('new_message', msg);
        });

        this.socket.on('message_sent', (msg) => {
            this.emit('message_sent', msg);
        });

        this.socket.on('user_typing', (data) => {
            this.emit('user_typing', data);
        });

        this.socket.on('presence_update', (data) => {
            this.emit('presence_update', data);
        });

        this.socket.on('messages_read', (data) => {
            this.emit('messages_read', data);
        });

        this.socket.on('connect_error', async (err) => {
            if (err.message === 'Invalid token' || err.message === 'Authentication required') {
                // Token expired — refresh and reconnect with the new token
                if (typeof API !== 'undefined') {
                    const refreshed = await API.refreshToken();
                    if (refreshed && this.socket) {
                        this.socket.auth.token = API.token;
                        this.socket.connect();
                        return;
                    }
                }
                if (typeof App !== 'undefined') App.logout();
            } else {
                console.error('Socket connection error:', err.message);
            }
        });
    },

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.connected = false;
        }
    },

    sendMessage(receiverId, content) {
        if (this.socket) {
            this.socket.emit('send_message', { receiver_id: receiverId, content });
        }
    },

    sendTyping(receiverId, isTyping) {
        if (this.socket) {
            this.socket.emit('typing', { receiver_id: receiverId, is_typing: isTyping });
        }
    },

    markRead(senderId) {
        if (this.socket) {
            this.socket.emit('mark_read', { sender_id: senderId });
        }
    },

    // Simple event emitter
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    },

    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
    },

    emit(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(h => h(data));
        }
    }
};
