/* =======================================
   Venary Messenger — Main SPA Page
   Discord-like 4-panel layout.
   ======================================= */
var MessengerPage = {
    // ── State ──────────────────────────────────────────────────
    socket: null,
    spaces: [],
    activeSpaceId: null,
    activeDmId: null,
    activeChannelId: null,
    channels: {},         // spaceId -> []
    categories: {},       // spaceId -> []
    members: {},          // spaceId -> []
    dmList: [],
    messages: [],
    typingUsers: {},      // channelId -> {userId: username, timer}
    showMemberList: true,
    messageObserver: null,
    _typingTimeout: null,

    // ── Render ──────────────────────────────────────────────────
    async render(container) {
        // Hide the main nav — messenger is a full-page overlay
        var mainNav = document.getElementById('main-nav');
        var mobileBottomNav = document.getElementById('mobile-bottom-nav');
        var mobileHeader = document.getElementById('mobile-header');
        if (mainNav) mainNav.classList.add('hidden');
        if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
        if (mobileHeader) mobileHeader.classList.add('hidden');
        container.classList.add('full-width', 'admin-fullscreen');

        container.innerHTML = `
        <div class="messenger-root" id="msn-root">
            <div class="msn-space-list" id="msn-space-list"></div>
            <div class="msn-channel-sidebar" id="msn-channel-sidebar">
                <div class="msn-sidebar-header" id="msn-sidebar-header">
                    <h2>Direct Messages</h2>
                </div>
                <div class="msn-channel-scroll" id="msn-channel-scroll"></div>
                <div class="msn-sidebar-footer" id="msn-sidebar-footer"></div>
            </div>
            <div class="msn-message-area" id="msn-message-area">
                <div class="msn-welcome" id="msn-welcome">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h2>Venary Messenger</h2>
                    <p>Select a space and channel to start chatting, or open a direct message.</p>
                </div>
            </div>
            <div class="msn-member-list" id="msn-member-list"></div>
        </div>`;

        this._connectSocket();
        await this._loadSpaces();
        await this._loadDMs();
        this._renderSpaceList();
        this._renderSidebarFooter();
        this._showDMList();
    },

    // ── Socket ─────────────────────────────────────────────────
    _connectSocket() {
        const token = localStorage.getItem('token');
        if (!token || typeof io === 'undefined') return;

        this.socket = io('/messenger', {
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 10
        });

        this.socket.on('connect', () => {
            this.socket.emit('subscribe_spaces');
            if (this.activeChannelId) this.socket.emit('join_channel', this.activeChannelId);
        });

        this.socket.on('channel:message', (msg) => this._onChannelMessage(msg));
        this.socket.on('channel:message_edited', (msg) => this._onMessageEdited(msg));
        this.socket.on('channel:message_deleted', (d) => this._onMessageDeleted(d));
        this.socket.on('channel:reaction_update', (d) => this._onReactionUpdate(d));
        this.socket.on('channel:typing', (d) => this._onTyping(d, false));
        this.socket.on('dm:message', (msg) => this._onDmMessage(msg));
        this.socket.on('dm:typing', (d) => this._onTyping(d, true));
        this.socket.on('member:joined', () => this._reloadMembers());
        this.socket.on('member:left', () => this._reloadMembers());
        this.socket.on('space:updated', (s) => this._onSpaceUpdated(s));
        this.socket.on('space:deleted', (d) => this._onSpaceDeleted(d));
        this.socket.on('channel:created', (c) => this._onChannelCreated(c));
        this.socket.on('channel:deleted', (d) => this._onChannelDeleted(d));
    },

    // ── Data Loading ───────────────────────���───────────────────
    async _loadSpaces() {
        try {
            const res = await fetch('/api/ext/messenger/spaces', {
                headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
            });
            if (res.ok) this.spaces = await res.json();
        } catch (e) { console.error('[Messenger] load spaces:', e); }
    },

    async _loadDMs() {
        try {
            const res = await fetch('/api/ext/messenger/dm', {
                headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
            });
            if (res.ok) this.dmList = await res.json();
        } catch (e) { console.error('[Messenger] load DMs:', e); }
    },

    async _loadSpaceDetails(spaceId) {
        try {
            const res = await fetch('/api/ext/messenger/spaces/' + spaceId, {
                headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
            });
            if (res.ok) {
                const data = await res.json();
                this.channels[spaceId] = data.channels || [];
                this.categories[spaceId] = data.categories || [];
                this.members[spaceId] = data.members || [];
                return data;
            }
        } catch (e) { console.error('[Messenger] load space details:', e); }
        return null;
    },

    async _loadMessages(channelId, before) {
        const url = '/api/ext/messenger/channels/' + channelId + '/messages' +
            (before ? '?before=' + before : '');
        const res = await fetch(url, {
            headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
        });
        if (res.ok) return res.json();
        return [];
    },

    async _loadDMMessages(dmId, before) {
        const url = '/api/ext/messenger/dm/' + dmId + '/messages' +
            (before ? '?before=' + before : '');
        const res = await fetch(url, {
            headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
        });
        if (res.ok) return res.json();
        return [];
    },

    async _reloadMembers() {
        if (!this.activeSpaceId) return;
        try {
            const res = await fetch('/api/ext/messenger/spaces/' + this.activeSpaceId + '/members', {
                headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
            });
            if (res.ok) {
                this.members[this.activeSpaceId] = await res.json();
                this._renderMemberList(this.activeSpaceId);
            }
        } catch (e) {}
    },

    // ── Space List ────────────────────���────────────────────────
    _renderSpaceList() {
        const el = document.getElementById('msn-space-list');
        if (!el) return;

        let html = `<button class="msn-space-icon msn-dm-btn ${!this.activeSpaceId ? 'active' : ''}"
            title="Direct Messages" onclick="MessengerPage._selectDMs()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg></button>
        <div class="msn-space-separator"></div>`;

        this.spaces.forEach(space => {
            const initials = (space.name || '?').slice(0, 2).toUpperCase();
            const isActive = this.activeSpaceId === space.id;
            html += `<button class="msn-space-icon ${isActive ? 'active' : ''}"
                title="${this._esc(space.name)}"
                onclick="MessengerPage._selectSpace('${space.id}')">
                ${space.icon
                    ? `<img src="${this._esc(space.icon)}" alt="${this._esc(space.name)}">`
                    : initials}
            </button>`;
        });

        html += `<div class="msn-space-separator"></div>
        <button class="msn-space-icon msn-add-space-btn" title="Add a Space"
            onclick="MessengerPage._showCreateSpaceModal()">+</button>`;

        el.innerHTML = html;
    },

    // ── DM View ───────────────────────────────��────────────────
    _selectDMs() {
        this.activeSpaceId = null;
        this.activeChannelId = null;
        this._renderSpaceList();
        this._showDMList();
        this._clearMessageArea();
        document.getElementById('msn-member-list').innerHTML = '';
    },

    _showDMList() {
        const header = document.getElementById('msn-sidebar-header');
        const scroll = document.getElementById('msn-channel-scroll');
        if (!header || !scroll) return;

        header.innerHTML = '<h2>Direct Messages</h2>';

        if (this.dmList.length === 0) {
            scroll.innerHTML = `<div style="padding:16px;font-size:0.82rem;color:var(--text-muted)">
                No direct messages yet.<br>Click a user's profile to message them.</div>`;
            return;
        }

        const currentUserId = App.currentUser ? App.currentUser.id : null;
        scroll.innerHTML = this.dmList.map(dm => {
            const otherIds = (dm.member_ids || []).filter(id => id !== currentUserId);
            const label = dm.type === 'group_dm' ? (dm.name || 'Group DM') : (otherIds[0] || 'DM');
            const isActive = this.activeDmId === dm.id;
            return `<div class="msn-dm-item ${isActive ? 'active' : ''}"
                onclick="MessengerPage._openDM('${dm.id}')">
                <div class="msn-dm-avatar">${label.charAt(0).toUpperCase()}</div>
                <span>${this._esc(label)}</span>
            </div>`;
        }).join('');
    },

    async _openDM(dmId) {
        this.activeDmId = dmId;
        this.activeChannelId = null;
        this._showDMList();

        const messages = await this._loadDMMessages(dmId);
        this._renderMessageArea(null, messages, true, dmId);
    },

    // ── Space Selection ────────────────────────────────────────
    async _selectSpace(spaceId) {
        if (this.activeSpaceId === spaceId) return;
        this.activeSpaceId = spaceId;
        this.activeDmId = null;
        this._renderSpaceList();

        const data = await this._loadSpaceDetails(spaceId);
        if (!data) return;

        this._renderSpaceSidebar(data);
        this._renderMemberList(spaceId);

        // Auto-select first text channel
        const firstText = (data.channels || []).find(c => c.type === 'text');
        if (firstText) this._selectChannel(firstText.id);
        else this._clearMessageArea();
    },

    _renderSpaceSidebar(data) {
        const header = document.getElementById('msn-sidebar-header');
        const scroll = document.getElementById('msn-channel-scroll');
        if (!header || !scroll) return;

        header.innerHTML = `<h2>${this._esc(data.name)}</h2>
            ${data.description ? `<p>${this._esc(data.description)}</p>` : ''}`;

        const cats = this.categories[data.id] || [];
        const channels = this.channels[data.id] || [];
        const uncategorized = channels.filter(c => !c.category_id);

        let html = '';

        // Uncategorized channels first
        uncategorized.forEach(c => {
            html += this._renderChannelItem(c);
        });

        // Categorized
        cats.forEach(cat => {
            const catChannels = channels.filter(c => c.category_id === cat.id);
            html += `<div class="msn-category">
                <div class="msn-category-header" onclick="MessengerPage._toggleCategory(this)">
                    <span class="msn-caret">▾</span>
                    ${this._esc(cat.name)}
                    <button class="msn-add-channel-btn" title="Add Channel"
                        onclick="event.stopPropagation();MessengerPage._showCreateChannelModal('${cat.id}')">+</button>
                </div>
                ${catChannels.map(c => this._renderChannelItem(c)).join('')}
            </div>`;
        });

        scroll.innerHTML = html;
    },

    _renderChannelItem(channel) {
        const icons = { text: '#', voice: '🔊', announcement: '📢', forum: '💬', stage: '🎭' };
        const icon = icons[channel.type] || '#';
        const isActive = this.activeChannelId === channel.id;
        return `<div class="msn-channel-item ${isActive ? 'active' : ''}"
            id="ch-${channel.id}"
            onclick="MessengerPage._selectChannel('${channel.id}')">
            <span class="msn-channel-icon">${icon}</span>
            <span class="msn-channel-name">${this._esc(channel.name)}</span>
        </div>`;
    },

    _toggleCategory(el) {
        el.classList.toggle('collapsed');
        const cat = el.closest('.msn-category');
        if (!cat) return;
        const items = cat.querySelectorAll('.msn-channel-item');
        items.forEach(item => {
            item.style.display = el.classList.contains('collapsed') ? 'none' : '';
        });
    },

    // ── Channel Selection ─────────────────────────────────────
    async _selectChannel(channelId) {
        // Leave previous channel
        if (this.socket && this.activeChannelId) {
            this.socket.emit('leave_channel', this.activeChannelId);
        }

        this.activeChannelId = channelId;
        this.activeDmId = null;

        // Update active state in sidebar
        document.querySelectorAll('.msn-channel-item').forEach(el => {
            el.classList.toggle('active', el.id === 'ch-' + channelId);
        });

        if (this.socket) this.socket.emit('join_channel', channelId);

        // Find channel data
        const channel = (this.channels[this.activeSpaceId] || []).find(c => c.id === channelId);
        const messages = await this._loadMessages(channelId);
        this._renderMessageArea(channel, messages, false, null);
    },

    // ── Message Area ──────────────────────��────────────────────
    _clearMessageArea() {
        const area = document.getElementById('msn-message-area');
        if (!area) return;
        area.innerHTML = `<div class="msn-welcome" id="msn-welcome">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <h2>Venary Messenger</h2>
            <p>Select a channel or conversation.</p>
        </div>`;
    },

    _renderMessageArea(channel, messages, isDM, dmId) {
        const area = document.getElementById('msn-message-area');
        if (!area) return;

        const title = channel ? channel.name : (isDM ? 'Direct Message' : '');
        const topic = channel ? (channel.topic || '') : '';
        const icon = channel ? (channel.type === 'voice' ? '🔊' : channel.type === 'announcement' ? '📢' : '#') : '💬';
        const canSend = channel ? channel.type !== 'voice' : isDM;
        const contextId = isDM ? dmId : (channel ? channel.id : null);

        area.innerHTML = `
        <div class="msn-channel-header">
            <span class="msn-ch-icon">${icon}</span>
            <span class="msn-ch-name">${this._esc(title)}</span>
            ${topic ? `<span class="msn-ch-topic">${this._esc(topic)}</span>` : ''}
            <div class="msn-header-actions">
                ${!isDM ? `<button class="msn-header-btn" title="Members" onclick="MessengerPage._toggleMemberList()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg></button>` : ''}
                ${!isDM && this.activeSpaceId ? `<button class="msn-header-btn" title="Invite People"
                    onclick="MessengerPage._showInviteModal()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg></button>` : ''}
            </div>
        </div>
        <div class="msn-messages" id="msn-messages">
            ${messages.length === 0 ? `
            <div class="msn-empty-channel">
                <div class="msn-ch-welcome-icon">${isDM ? '💬' : '#'}</div>
                <h2>${isDM ? 'Start of your DM' : `Welcome to #${this._esc(title)}`}</h2>
                <p>${isDM ? 'This is the beginning of your direct message history.' :
                    'This is the beginning of the <strong>#' + this._esc(title) + '</strong> channel.'}</p>
            </div>` : this._renderMessages(messages)}
        </div>
        <div class="msn-typing-indicator" id="msn-typing-indicator"></div>
        ${canSend ? `
        <div class="msn-input-area">
            <div class="msn-input-box">
                <button class="msn-input-attach" title="Attach file">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                </button>
                <textarea class="msn-chat-input" id="msn-chat-input"
                    placeholder="Message ${isDM ? '' : '#'}${this._esc(title)}" rows="1"></textarea>
                <button class="msn-input-emoji" title="Emoji">😊</button>
                <button class="msn-send-btn" id="msn-send-btn" disabled>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>` : ''}`;

        // Scroll to bottom
        const msgsEl = document.getElementById('msn-messages');
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

        // Wire input
        if (canSend) this._wireInput(contextId, isDM);
    },

    _renderMessages(messages) {
        let html = '';
        let lastAuthor = null;
        let lastDate = null;

        messages.forEach(msg => {
            const date = new Date(msg.created_at).toLocaleDateString();
            if (date !== lastDate) {
                html += `<div class="msn-date-divider">${date}</div>`;
                lastDate = date;
                lastAuthor = null;
            }

            const isNewAuthor = msg.author_id !== lastAuthor;
            lastAuthor = msg.author_id;
            html += this._renderMessageGroup(msg, isNewAuthor);
        });

        return html;
    },

    _renderMessageGroup(msg, isNewAuthor) {
        const isSelf = App.currentUser && msg.author_id === App.currentUser.id;
        const authorName = msg.sender_username || msg.webhook_name || msg.author_id.slice(0, 8);
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const avatar = (authorName || '?').charAt(0).toUpperCase();
        const reactions = msg.reactions ? Object.entries(JSON.parse(typeof msg.reactions === 'string' ? msg.reactions : '{}')).map(([emoji, users]) => {
            const reacted = App.currentUser && users.includes(App.currentUser.id);
            return `<button class="msn-reaction ${reacted ? 'msn-reacted' : ''}"
                onclick="MessengerPage._toggleReaction('${msg.id}', '${emoji}', '${this.activeChannelId || ''}')">
                ${emoji} <span class="msn-reaction-count">${users.length}</span>
            </button>`;
        }).join('') : '';

        const replyHtml = msg.reply_to_id ? `<div class="msn-msg-reply">
            <span class="msn-reply-author">↩ Reply</span>
            <span>(original message)</span>
        </div>` : '';

        return `<div class="msn-msg-group ${isNewAuthor ? 'msn-msg-new-author' : ''}" data-msg-id="${msg.id}">
            ${isNewAuthor
                ? `<div class="msn-msg-avatar" title="${this._esc(authorName)}">${avatar}</div>`
                : `<div class="msn-msg-avatar-spacer"></div>`}
            <div class="msn-msg-body">
                ${isNewAuthor ? `<div class="msn-msg-header">
                    <span class="msn-msg-author">${this._esc(authorName)}</span>
                    <span class="msn-msg-timestamp">${time}</span>
                </div>` : ''}
                ${replyHtml}
                <div class="msn-msg-content ${msg.deleted ? 'msn-msg-deleted' : ''}">
                    ${msg.deleted ? '(message deleted)' : this._esc(msg.content || '')}
                    ${msg.edited_at && !msg.deleted ? '<span class="msn-msg-edited">(edited)</span>' : ''}
                </div>
                ${reactions ? `<div class="msn-msg-reactions">${reactions}</div>` : ''}
            </div>
            <div class="msn-msg-actions">
                <button class="msn-msg-action-btn" title="React"
                    onclick="MessengerPage._showQuickReact('${msg.id}')">😊</button>
                ${!msg.deleted && this.activeChannelId
                    ? `<button class="msn-msg-action-btn" title="Reply"
                        onclick="MessengerPage._setReply('${msg.id}')">↩</button>` : ''}
                ${isSelf && !msg.deleted
                    ? `<button class="msn-msg-action-btn" title="Edit"
                        onclick="MessengerPage._editMessage('${msg.id}')">✏️</button>
                       <button class="msn-msg-action-btn danger" title="Delete"
                        onclick="MessengerPage._deleteMessage('${msg.id}')">🗑️</button>`
                    : ''}
            </div>
        </div>`;
    },

    // ── Input Wiring ───────────────────────────────────────────
    _wireInput(contextId, isDM) {
        const input = document.getElementById('msn-chat-input');
        const sendBtn = document.getElementById('msn-send-btn');
        if (!input || !sendBtn) return;

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
            sendBtn.disabled = !input.value.trim();

            // Typing indicator
            if (this.socket) {
                if (isDM) {
                    this.socket.emit('dm:typing', { dmChannelId: contextId });
                } else {
                    this.socket.emit('channel:typing', { channelId: contextId });
                }
            }
            clearTimeout(this._typingTimeout);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.value.trim()) this._sendMessage(contextId, isDM, input, sendBtn);
            }
        });

        sendBtn.addEventListener('click', () => {
            if (input.value.trim()) this._sendMessage(contextId, isDM, input, sendBtn);
        });

        input.focus();
    },

    _sendMessage(contextId, isDM, input, sendBtn) {
        const content = input.value.trim();
        if (!content || !contextId) return;

        if (this.socket) {
            if (isDM) {
                this.socket.emit('dm:send_message', { dmChannelId: contextId, content });
            } else {
                this.socket.emit('channel:send_message', { channelId: contextId, content });
            }
        } else {
            // REST fallback
            const url = isDM
                ? '/api/ext/messenger/dm/' + contextId + '/messages'
                : '/api/ext/messenger/channels/' + contextId + '/messages';
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify({ content })
            }).then(r => r.json()).then(msg => {
                if (!msg.error) this._appendMessage(msg);
            });
        }

        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;
    },

    // ── Real-time Event Handlers ─────────────────��─────────────
    _onChannelMessage(msg) {
        if (msg.channel_id !== this.activeChannelId) return;
        this._appendMessage(msg);
    },

    _onDmMessage(msg) {
        if (msg.dm_channel_id !== this.activeDmId) return;
        this._appendMessage(msg);
    },

    _appendMessage(msg) {
        const msgsEl = document.getElementById('msn-messages');
        if (!msgsEl) return;

        const emptyState = msgsEl.querySelector('.msn-empty-channel');
        if (emptyState) emptyState.remove();

        const lastGroup = msgsEl.lastElementChild;
        const lastAuthorId = lastGroup ? lastGroup.dataset.msgId : null;
        // Determine if same author by checking last rendered group
        const lastMsg = lastGroup ? { author_id: lastGroup.querySelector('.msn-msg-author') ? null : 'different' } : null;
        const isNewAuthor = true; // simplified: always show avatar for appended messages

        const div = document.createElement('div');
        div.innerHTML = this._renderMessageGroup(msg, isNewAuthor);
        while (div.firstChild) msgsEl.appendChild(div.firstChild);

        const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 150;
        if (atBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
    },

    _onMessageEdited(msg) {
        const el = document.querySelector(`[data-msg-id="${msg.id}"] .msn-msg-content`);
        if (!el) return;
        el.innerHTML = this._esc(msg.content || '') + '<span class="msn-msg-edited">(edited)</span>';
    },

    _onMessageDeleted(d) {
        const el = document.querySelector(`[data-msg-id="${d.messageId}"] .msn-msg-content`);
        if (!el) return;
        el.textContent = '(message deleted)';
        el.classList.add('msn-msg-deleted');
    },

    _onReactionUpdate(d) {
        const group = document.querySelector(`[data-msg-id="${d.messageId}"]`);
        if (!group) return;
        let reactionsEl = group.querySelector('.msn-msg-reactions');
        const currentUserId = App.currentUser ? App.currentUser.id : null;
        const reactions = d.reactions || {};
        const reactHtml = Object.entries(reactions).map(([emoji, users]) => {
            const reacted = currentUserId && users.includes(currentUserId);
            return `<button class="msn-reaction ${reacted ? 'msn-reacted' : ''}"
                onclick="MessengerPage._toggleReaction('${d.messageId}', '${emoji}', '${this.activeChannelId || ''}')">
                ${emoji} <span class="msn-reaction-count">${users.length}</span>
            </button>`;
        }).join('');

        if (reactionsEl) {
            reactionsEl.innerHTML = reactHtml;
        } else {
            const body = group.querySelector('.msn-msg-body');
            if (body) {
                const div = document.createElement('div');
                div.className = 'msn-msg-reactions';
                div.innerHTML = reactHtml;
                body.appendChild(div);
            }
        }
    },

    _onTyping(d, isDM) {
        const indicator = document.getElementById('msn-typing-indicator');
        if (!indicator) return;
        if (App.currentUser && d.userId === App.currentUser.id) return;

        const key = isDM ? d.dmChannelId : d.channelId;
        if (!this.typingUsers[key]) this.typingUsers[key] = {};

        if (this.typingUsers[key][d.userId]) {
            clearTimeout(this.typingUsers[key][d.userId]);
        }
        this.typingUsers[key][d.userId] = setTimeout(() => {
            delete this.typingUsers[key][d.userId];
            this._updateTypingIndicator(key, indicator);
        }, 3000);

        this._updateTypingIndicator(key, indicator);
    },

    _updateTypingIndicator(key, el) {
        const users = Object.keys(this.typingUsers[key] || {});
        if (users.length === 0) { el.textContent = ''; return; }
        // We don't have usernames here easily, so just show a generic indicator
        el.textContent = users.length === 1
            ? 'Someone is typing...'
            : users.length + ' people are typing...';
    },

    _onSpaceUpdated(space) {
        const idx = this.spaces.findIndex(s => s.id === space.id);
        if (idx !== -1) {
            this.spaces[idx] = space;
            this._renderSpaceList();
            if (this.activeSpaceId === space.id) {
                document.querySelector('.msn-sidebar-header h2').textContent = space.name;
            }
        }
    },

    _onSpaceDeleted(d) {
        this.spaces = this.spaces.filter(s => s.id !== d.spaceId);
        if (this.activeSpaceId === d.spaceId) {
            this.activeSpaceId = null;
            this.activeChannelId = null;
            this._clearMessageArea();
        }
        this._renderSpaceList();
    },

    _onChannelCreated(channel) {
        if (!this.channels[channel.space_id]) this.channels[channel.space_id] = [];
        this.channels[channel.space_id].push(channel);
        if (this.activeSpaceId === channel.space_id) {
            this._loadSpaceDetails(channel.space_id).then(data => {
                if (data) this._renderSpaceSidebar(data);
            });
        }
    },

    _onChannelDeleted(d) {
        if (this.channels[d.spaceId]) {
            this.channels[d.spaceId] = this.channels[d.spaceId].filter(c => c.id !== d.channelId);
        }
        if (this.activeChannelId === d.channelId) {
            this.activeChannelId = null;
            this._clearMessageArea();
        }
        if (this.activeSpaceId === d.spaceId) {
            this._loadSpaceDetails(d.spaceId).then(data => {
                if (data) this._renderSpaceSidebar(data);
            });
        }
    },

    // ── Member List ─────────────────────��──────────────────────
    _renderMemberList(spaceId) {
        const el = document.getElementById('msn-member-list');
        if (!el) return;

        const members = this.members[spaceId] || [];
        if (members.length === 0) { el.innerHTML = ''; return; }

        const online = members.filter(m => m.status === 'online' || m.status === 'idle');
        const offline = members.filter(m => !m.status || m.status === 'offline');

        let html = '';
        if (online.length) {
            html += `<div class="msn-member-role-header">Online — ${online.length}</div>`;
            html += online.map(m => this._renderMemberItem(m, true)).join('');
        }
        if (offline.length) {
            html += `<div class="msn-member-role-header">Offline — ${offline.length}</div>`;
            html += offline.map(m => this._renderMemberItem(m, false)).join('');
        }

        el.innerHTML = html;
    },

    _renderMemberItem(member, isOnline) {
        const name = member.nickname || member.user_id.slice(0, 8);
        const avatar = name.charAt(0).toUpperCase();
        const status = isOnline ? 'online' : 'offline';
        return `<div class="msn-member-item">
            <div class="msn-member-avatar">
                ${avatar}
                <span class="msn-member-status-dot ${status}"></span>
            </div>
            <div class="msn-member-info">
                <div class="msn-member-name ${isOnline ? '' : 'offline'}">${this._esc(name)}</div>
            </div>
        </div>`;
    },

    _toggleMemberList() {
        const el = document.getElementById('msn-member-list');
        if (!el) return;
        el.classList.toggle('hidden');
    },

    // ── Message Actions ───────────────────────��────────────────
    _toggleReaction(messageId, emoji, channelId) {
        if (!this.socket) return;
        this.socket.emit('channel:react', { messageId, emoji, channelId });
    },

    _showQuickReact(messageId) {
        const emojis = ['👍','👎','❤️','😂','🎉','🔥','😮','😢'];
        this._showContextMenu(emojis.map(e => ({
            label: e,
            action: () => {
                if (this.socket && this.activeChannelId) {
                    this.socket.emit('channel:react', {
                        messageId, emoji: e, channelId: this.activeChannelId
                    });
                }
            }
        })));
    },

    _setReply(messageId) {
        const input = document.getElementById('msn-chat-input');
        if (input) {
            input.dataset.replyTo = messageId;
            input.placeholder = 'Replying to message... (press Esc to cancel)';
            input.focus();
        }
    },

    async _editMessage(messageId) {
        const group = document.querySelector(`[data-msg-id="${messageId}"]`);
        const contentEl = group ? group.querySelector('.msn-msg-content') : null;
        if (!contentEl) return;

        const current = contentEl.textContent.replace('(edited)', '').trim();
        const newContent = prompt('Edit message:', current);
        if (!newContent || newContent === current) return;

        await fetch('/api/ext/messenger/messages/' + messageId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ content: newContent })
        });
    },

    async _deleteMessage(messageId) {
        if (!confirm('Delete this message?')) return;
        await fetch('/api/ext/messenger/messages/' + messageId, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
        });
    },

    // ── Modals ────────────────���────────────────────────────────
    _showCreateSpaceModal() {
        const overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Create a Space</h2>
            <p>Your Space is where you and your friends hang out. Make yours and start talking.</p>
            <label>Space Name</label>
            <input type="text" id="msn-space-name" placeholder="My Awesome Space" maxlength="100">
            <label>Description (optional)</label>
            <input type="text" id="msn-space-desc" placeholder="What's this space about?" maxlength="200">
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Cancel</button>
                <button class="msn-btn msn-btn-primary" onclick="MessengerPage._createSpace()">Create Space</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-space-name').focus();
    },

    async _createSpace() {
        const name = document.getElementById('msn-space-name').value.trim();
        const description = document.getElementById('msn-space-desc').value.trim();
        if (!name) return this._toast('Space name is required');

        const res = await fetch('/api/ext/messenger/spaces', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ name, description })
        });

        const data = await res.json();
        if (data.error) return this._toast(data.error);

        document.querySelector('.msn-modal-overlay')?.remove();
        this.spaces.push(data);
        this._renderSpaceList();
        this._selectSpace(data.id);
        this._toast('Space created!');
    },

    _showCreateChannelModal(categoryId) {
        const overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Create Channel</h2>
            <label>Channel Type</label>
            <select id="msn-ch-type">
                <option value="text">📝 Text Channel</option>
                <option value="announcement">📢 Announcement</option>
                <option value="voice">🔊 Voice Channel</option>
            </select>
            <label>Channel Name</label>
            <input type="text" id="msn-ch-name" placeholder="new-channel" maxlength="100">
            <label>Topic (optional)</label>
            <input type="text" id="msn-ch-topic" placeholder="What's this channel for?" maxlength="200">
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Cancel</button>
                <button class="msn-btn msn-btn-primary"
                    onclick="MessengerPage._createChannel('${categoryId || ''}')">Create Channel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-ch-name').focus();
    },

    async _createChannel(categoryId) {
        const name = document.getElementById('msn-ch-name').value.trim();
        const type = document.getElementById('msn-ch-type').value;
        const topic = document.getElementById('msn-ch-topic').value.trim();
        if (!name) return this._toast('Channel name is required');

        const res = await fetch('/api/ext/messenger/spaces/' + this.activeSpaceId + '/channels', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ name, type, topic, category_id: categoryId || null })
        });

        const data = await res.json();
        if (data.error) return this._toast(data.error);

        document.querySelector('.msn-modal-overlay')?.remove();
        this._toast('Channel created!');
    },

    async _showInviteModal() {
        const res = await fetch('/api/ext/messenger/spaces/' + this.activeSpaceId + '/invites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + localStorage.getItem('token')
            },
            body: JSON.stringify({ max_age: 86400, max_uses: 0 })
        });

        const invite = await res.json();
        if (invite.error) return this._toast(invite.error);

        const link = window.location.origin + '/#/messenger?invite=' + invite.code;
        const overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Invite People</h2>
            <p>Share this link to invite people to your space.</p>
            <div class="msn-invite-code">
                <span>${this._esc(link)}</span>
                <button onclick="navigator.clipboard.writeText('${this._esc(link)}').then(() => MessengerPage._toast('Copied!'))">Copy</button>
            </div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Done</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    // ── Sidebar footer ─────────────────────────────────────────
    _renderSidebarFooter() {
        const el = document.getElementById('msn-sidebar-footer');
        if (!el || !App.currentUser) return;

        const user = App.currentUser;
        const initials = (user.display_name || user.username || '?').charAt(0).toUpperCase();
        const avatarHtml = user.avatar
            ? `<img src="${this._esc(user.avatar)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent,#5865f2);display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;color:#fff">${initials}</div>`;

        el.innerHTML = `
            ${avatarHtml}
            <div class="msn-user-tag">
                <div class="msn-uname">${this._esc(user.display_name || user.username)}</div>
                <div class="msn-discrim" style="color:var(--text-muted);font-size:0.72rem">Online</div>
            </div>
            <button class="msn-footer-btn" title="Settings" onclick="window.location.hash='#/settings'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            </button>`;
    },

    // ── Context Menu ──────────────��────────────────────────────
    _showContextMenu(items) {
        document.querySelectorAll('.msn-ctx-menu').forEach(el => el.remove());
        const menu = document.createElement('div');
        menu.className = 'msn-ctx-menu';
        menu.innerHTML = items.map(item =>
            `<div class="msn-ctx-item ${item.danger ? 'danger' : ''}">${item.label}</div>`
        ).join('');
        items.forEach((item, i) => {
            menu.children[i].addEventListener('click', () => {
                item.action();
                menu.remove();
            });
        });
        document.body.appendChild(menu);
        const hide = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', hide);
            }
        };
        setTimeout(() => document.addEventListener('click', hide), 0);
    },

    // ── Toast ───────────────────���──────────────────────────────
    _toast(message, duration = 3000) {
        let toast = document.getElementById('msn-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'msn-toast';
            toast.id = 'msn-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    },

    // ── Utility ────────────────────────────────────────────────
    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // ── Cleanup ────────────────────────────────────────────────
    destroy() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        document.querySelectorAll('.msn-toast, .msn-modal-overlay, .msn-ctx-menu').forEach(el => el.remove());
    }
};
