/* =======================================
   Venary Messenger — Full SPA Page
   Fluxer/Discord-parity feature set:
   spaces, channels, DMs, roles, search,
   markdown, emoji, popouts, notifications
   ======================================= */
var MessengerPage = {

    // ── State ──────────────────────────────────────────────────
    socket: null,
    spaces: [],
    activeSpaceId: null,
    activeDmId: null,
    activeChannelId: null,
    channels: {},          // spaceId -> []
    categories: {},        // spaceId -> []
    members: {},           // spaceId -> []
    memberCache: {},       // userId -> { username, display_name, avatar, status }
    dmList: [],
    messages: [],
    unreadCounts: {},      // channelId/dmId -> count
    typingUsers: {},       // contextId -> { userId: { username, timer } }
    showMemberList: true,
    _typingTimeout: null,
    _toastTimer: null,
    _replyToId: null,
    _replyToContent: null,
    _searchDebounce: null,
    _messengerSettings: null,   // cached settings object
    _pendingRequests: [],        // pending incoming message requests

    // ── Render ──────────────────────────────────────────────────
    async render(container) {
        // Request desktop notification permission early
        this._requestNotificationPermission();

        // Hide main nav — full-page overlay
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
                <div class="msn-sidebar-header" id="msn-sidebar-header"></div>
                <div class="msn-channel-scroll" id="msn-channel-scroll"></div>
                <div class="msn-sidebar-footer" id="msn-sidebar-footer"></div>
            </div>
            <div class="msn-message-area" id="msn-message-area">
                <div class="msn-welcome" id="msn-welcome">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <h2>Venary Messenger</h2>
                    <p>Select a space and channel, or open a direct message to start chatting.</p>
                    <button class="msn-btn msn-btn-primary" onclick="MessengerPage._showBrowseSpaces()" style="margin-top:8px">Browse Public Spaces</button>
                </div>
            </div>
            <div class="msn-member-list" id="msn-member-list"></div>
        </div>`;

        // Check for hash query params
        var inviteCode = this._getHashParam('invite');
        var dmUserId   = this._getHashParam('dmUser');
        var dmId       = this._getHashParam('dm');
        var spaceId    = this._getHashParam('space');
        var channelId  = this._getHashParam('channel');

        this._connectSocket();
        await Promise.all([this._loadSpaces(), this._loadDMs(), this._loadMessengerSettings(), this._loadMessageRequests()]);
        this._renderSpaceList();
        this._renderSidebarFooter();

        if (inviteCode) {
            this._showDMList();
            this._acceptInviteByCode(inviteCode);
        } else if (dmUserId) {
            this._showDMList();
            this._startDM(dmUserId);
        } else if (dmId) {
            this._openDM(dmId);
        } else if (spaceId) {
            await this._selectSpace(spaceId);
            if (channelId) this._selectChannel(channelId);
        } else {
            this._showDMList();
        }

        // Setup long press for context menu
        var touchTimer = null;
        var touchEl = null;
        container.addEventListener('touchstart', (e) => {
            touchEl = e.target.closest('[oncontextmenu]');
            if (!touchEl) return;
            touchTimer = setTimeout(() => {
                var ev = new Event('contextmenu', {bubbles: true, cancelable: true});
                ev.clientX = e.touches[0].clientX;
                ev.clientY = e.touches[0].clientY;
                touchEl.dispatchEvent(ev);
            }, 500);
        }, {passive: true});
        container.addEventListener('touchmove', () => clearTimeout(touchTimer), {passive: true});
        container.addEventListener('touchend', () => clearTimeout(touchTimer), {passive: true});
        container.addEventListener('touchcancel', () => clearTimeout(touchTimer), {passive: true});
    },

    // ── Socket ──────────────────────────────────────────────────
    _connectSocket() {
        var token = localStorage.getItem('venary_token');
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

        this.socket.on('channel:message',        (m) => this._onChannelMessage(m));
        this.socket.on('channel:message_edited', (m) => this._onMessageEdited(m));
        this.socket.on('channel:message_deleted',(d) => this._onMessageDeleted(d));
        this.socket.on('channel:reaction_update',(d) => this._onReactionUpdate(d));
        this.socket.on('channel:typing',         (d) => this._onTyping(d, false));
        this.socket.on('dm:message',             (m) => this._onDmMessage(m));
        this.socket.on('dm:typing',              (d) => this._onTyping(d, true));
        this.socket.on('member:joined',          ()  => this._reloadMembers());
        this.socket.on('member:left',            ()  => this._reloadMembers());
        this.socket.on('space:updated',          (s) => this._onSpaceUpdated(s));
        this.socket.on('space:deleted',          (d) => this._onSpaceDeleted(d));
        this.socket.on('channel:created',        (c) => this._onChannelCreated(c));
        this.socket.on('channel:deleted',        (d) => this._onChannelDeleted(d));
        this.socket.on('dm:message_request',     (d) => this._onMessageRequest(d));
        this.socket.on('dm:request_accepted',    (d) => { this._toast('Your message request was accepted!'); this._loadDMs(); });
        this.socket.on('dm:request_declined',    (d) => { this._toast('Your message request was declined.'); });
    },

    // ── API helpers ─────────────────────────────────────────────
    _api(method, path, body) {
        var opts = {
            method: method,
            headers: { Authorization: 'Bearer ' + (localStorage.getItem('venary_token') || '') }
        };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch('/api/messenger' + path, opts).then(r => r.json());
    },

    _coreApi(method, path, body) {
        var opts = {
            method: method,
            headers: { Authorization: 'Bearer ' + (localStorage.getItem('venary_token') || '') }
        };
        if (body) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        return fetch('/api' + path, opts).then(r => r.json());
    },

    // ── Data Loading ─────────────────────────────────────────────
    async _loadSpaces() {
        try {
            var data = await this._api('GET', '/spaces');
            if (Array.isArray(data)) this.spaces = data;
        } catch (e) { console.error('[Messenger] load spaces:', e); }
    },

    async _loadDMs() {
        try {
            var data = await this._api('GET', '/dm');
            if (Array.isArray(data)) {
                this.dmList = data;
            } else {
                console.error('[Messenger] GET /dm returned non-array:', data);
            }
        } catch (e) { console.error('[Messenger] load DMs:', e); }
    },

    async _loadSpaceDetails(spaceId) {
        try {
            var data = await this._api('GET', '/spaces/' + spaceId);
            if (data && !data.error) {
                this.channels[spaceId]   = data.channels   || [];
                this.categories[spaceId] = data.categories || [];
                this.members[spaceId]    = data.members    || [];
                return data;
            }
        } catch (e) { console.error('[Messenger] load space details:', e); }
        return null;
    },

    async _loadMessages(channelId, before, search) {
        var qs = '?limit=50';
        if (before) qs += '&before=' + encodeURIComponent(before);
        if (search) qs += '&search=' + encodeURIComponent(search);
        return this._api('GET', '/channels/' + channelId + '/messages' + qs);
    },

    async _loadDMMessages(dmId, before, search) {
        var qs = '?limit=50';
        if (before) qs += '&before=' + encodeURIComponent(before);
        if (search) qs += '&search=' + encodeURIComponent(search);
        return this._api('GET', '/dm/' + dmId + '/messages' + qs);
    },

    async _getMemberInfo(userId) {
        if (this.memberCache[userId]) return this.memberCache[userId];
        try {
            var user = await this._coreApi('GET', '/users/' + userId);
            if (user && !user.error) {
                this.memberCache[userId] = user;
                return user;
            }
        } catch (e) {}
        return { id: userId, username: userId.slice(0, 8), display_name: null, avatar: null, status: 'offline' };
    },

    async _reloadMembers() {
        if (!this.activeSpaceId) return;
        var data = await this._api('GET', '/spaces/' + this.activeSpaceId + '/members');
        if (Array.isArray(data)) {
            this.members[this.activeSpaceId] = data;
            this._renderMemberList(this.activeSpaceId);
        }
    },

    // ── Space List ───────────────────────────────────────────────
    _renderSpaceList() {
        var el = document.getElementById('msn-space-list');
        if (!el) return;

        var html = `<button class="msn-space-icon msn-dm-btn ${!this.activeSpaceId ? 'active' : ''}"
            title="Direct Messages" onclick="MessengerPage._selectDMs()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg></button>
        <div class="msn-space-separator"></div>`;

        this.spaces.forEach(space => {
            var initials = (space.name || '?').slice(0, 2).toUpperCase();
            var isActive = this.activeSpaceId === space.id;
            html += `<button class="msn-space-icon ${isActive ? 'active' : ''}"
                title="${this._esc(space.name)}"
                onclick="MessengerPage._selectSpace('${space.id}')"
                oncontextmenu="event.preventDefault();MessengerPage._spaceCtxMenu('${space.id}',event)">
                ${space.icon ? `<img src="${this._esc(space.icon)}" alt="">` : initials}
            </button>`;
        });

        html += `<div class="msn-space-separator"></div>
        <button class="msn-space-icon msn-add-space-btn" title="Create or join a Space"
            onclick="MessengerPage._showAddSpaceMenu(event)">+</button>
        <button class="msn-space-icon" title="Browse Public Spaces" style="font-size:1.1rem"
            onclick="MessengerPage._showBrowseSpaces()">🧭</button>`;

        el.innerHTML = html;
    },

    _spaceCtxMenu(spaceId, e) {
        var space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;
        var currentUserId = App.currentUser ? App.currentUser.id : null;
        var isOwner = space.owner_id === currentUserId;
        this._showContextMenu(e.clientX, e.clientY, [
            { label: '⚙️ Space Settings', action: () => this._showSpaceSettings(spaceId), show: isOwner },
            { label: '🔗 Invite People',  action: () => this._showInviteModal() },
            { label: '🧭 Browse Channels', action: () => this._selectSpace(spaceId) },
            { separator: true },
            { label: isOwner ? '🗑️ Delete Space' : '🚪 Leave Space',
              danger: true,
              action: () => isOwner ? this._deleteSpace(spaceId) : this._leaveSpace(spaceId) }
        ]);
    },

    _showAddSpaceMenu(e) {
        this._showContextMenu(e.clientX, e.clientY, [
            { label: '➕ Create a Space', action: () => this._showCreateSpaceModal() },
            { label: '🔗 Join via Invite', action: () => this._showJoinByInviteModal() }
        ]);
    },

    // ── DM View ──────────────────────────────────────────────────
    _selectDMs() {
        this.activeSpaceId = null;
        this.activeChannelId = null;
        this.activeDmId = null;
        this._renderSpaceList();
        this._showDMList();
        this._clearMessageArea();
        var ml = document.getElementById('msn-member-list');
        if (ml) ml.innerHTML = '';
        window.history.replaceState(null, '', '/messenger');
    },

    _showDMList() {
        var header = document.getElementById('msn-sidebar-header');
        var scroll = document.getElementById('msn-channel-scroll');
        if (!header || !scroll) return;

        header.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h2 style="margin:0">Direct Messages</h2>
            <button class="msn-header-btn" title="New Message" onclick="MessengerPage._showNewDMSearch()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            </button>
        </div>
        <button class="msn-search-input" style="text-align:left;color:var(--text-muted);cursor:pointer;display:block" onclick="MessengerPage._showNewDMSearch()">
            Find or start a conversation
        </button>`;

        // Render the Friends button at the top of the scroll area
        var friendsBtnHtml = `
            <div class="msn-dm-item" id="msn-friends-btn" onclick="MessengerPage._showFriendsInMain()" style="margin-bottom:8px">
                <div class="msn-dm-avatar" style="width:32px;height:32px;background:transparent;display:flex;align-items:center;justify-content:center;color:var(--text-primary)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></path>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <div style="flex:1;min-width:0;font-weight:600;font-size:0.95rem;">Friends</div>
            </div>
            <div class="msn-friends-section-label" style="margin-top:0">DIRECT MESSAGES</div>
        `;

        scroll.innerHTML = friendsBtnHtml;
        var dmContainer = document.createElement('div');
        dmContainer.id = 'msn-dm-list-container';
        scroll.appendChild(dmContainer);

        this._renderDMItems(dmContainer, this.dmList);
    },

    async _showFriendsInMain() {
        this.activeChannelId = null;
        this.activeDmId = null;

        var sidebar = document.getElementById('msn-channel-sidebar');
        if (sidebar) sidebar.classList.remove('msn-sidebar-open');
        
        // Highlight friends button
        document.querySelectorAll('.msn-dm-item, .msn-channel-item').forEach(el => el.classList.remove('active'));
        var fBtn = document.getElementById('msn-friends-btn');
        if (fBtn) fBtn.classList.add('active');

        var area = document.getElementById('msn-message-area');
        if (!area) return;

        area.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center"><div class="loading-spinner"></div></div>';

        try {
            var friends = await this._coreApi('GET', '/friends');
            if (!Array.isArray(friends)) friends = [];

            var online = friends.filter(f => f.status === 'online' || f.status === 'idle');
            var offline = friends.filter(f => !f.status || f.status === 'offline');

            var renderFriend = (f) => {
                var name = this._esc(f.display_name || f.username);
                var tag = this._esc(f.username);
                var initials = (f.display_name || f.username || '?').charAt(0).toUpperCase();
                var avatar = f.avatar ? `<img src="${this._esc(f.avatar)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover">` 
                                      : `<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:bold">${initials}</div>`;
                
                return `
                <div class="msn-main-friend-item" style="display:flex;align-items:center;padding:12px;border-top:1px solid var(--border);cursor:pointer;border-radius:8px;transition:background 0.2s" 
                     onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'"
                     onclick="MessengerPage._startDM('${f.id}')">
                    <div style="position:relative;margin-right:12px">
                        ${avatar}
                        <span class="msn-dm-status-dot ${f.status || 'offline'}" style="position:absolute;bottom:0;right:0;width:12px;height:12px;border:2px solid var(--bg-primary)"></span>
                    </div>
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:1rem">${name} <span style="font-size:0.85rem;color:var(--text-muted);font-weight:normal;margin-left:4px">@${tag}</span></div>
                        <div style="font-size:0.85rem;color:var(--text-muted)">${f.status === 'online' ? 'Online' : 'Offline'}</div>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="msn-msg-action-btn" title="Message" style="background:var(--bg-secondary);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center"
                                onclick="event.stopPropagation();MessengerPage._startDM('${f.id}')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                        </button>
                    </div>
                </div>`;
            };

            area.innerHTML = `
            <div class="msn-channel-header" style="border-bottom:1px solid var(--border)">
                <span class="msn-ch-icon" style="margin-right:8px">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></path><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                </span>
                <span class="msn-ch-name">Friends</span>
                <div style="margin-left:24px;display:flex;gap:16px;font-size:0.9rem;font-weight:600;color:var(--text-muted)">
                    <span style="color:var(--text-primary);cursor:pointer">Online</span>
                    <span style="cursor:pointer" onclick="MessengerPage._toast('All friends view not implemented yet')">All</span>
                </div>
            </div>
            <div style="flex:1;overflow-y:auto;padding:16px 32px">
                ${online.length > 0 ? `
                    <div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">ONLINE — ${online.length}</div>
                    <div style="display:flex;flex-direction:column;margin-bottom:24px">
                        ${online.map(renderFriend).join('')}
                    </div>
                ` : ''}
                ${offline.length > 0 ? `
                    <div style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">OFFLINE — ${offline.length}</div>
                    <div style="display:flex;flex-direction:column">
                        ${offline.map(renderFriend).join('')}
                    </div>
                ` : ''}
                ${friends.length === 0 ? `
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">
                        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom:16px">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></path><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <p>No one's around to play with Wumpus.</p>
                    </div>
                ` : ''}
            </div>
            `;
        } catch (e) {
            area.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-muted)">Failed to load friends.</div>';
        }
    },

    _renderDMItems(scroll, list) {
        var currentUserId = App.currentUser ? App.currentUser.id : null;
        if (list.length === 0) {
            scroll.innerHTML = `<div class="msn-sidebar-empty">
                No conversations yet.<br>
                <a onclick="MessengerPage._showNewDMSearch()" style="color:var(--accent);cursor:pointer">Start one!</a>
            </div>`;
            return;
        }

        scroll.innerHTML = list.map(dm => {
            var otherIds = (dm.member_ids || []).filter(id => id !== currentUserId);
            var label = dm.type === 'group_dm'
                ? (dm.name || 'Group DM')
                : (dm.partner_display_name || dm.partner_username || (otherIds[0] ? otherIds[0].slice(0, 8) : 'DM'));
            var avatar = dm.partner_avatar || null;
            var status = dm.partner_status || 'offline';
            var isActive = this.activeDmId === dm.id;
            var unread = this.unreadCounts[dm.id] || 0;

            return `<div class="msn-dm-item ${isActive ? 'active' : ''}"
                onclick="MessengerPage._openDM('${dm.id}')">
                <div class="msn-dm-avatar">
                    ${avatar ? `<img src="${this._esc(avatar)}" alt="">` : this._esc(label.charAt(0).toUpperCase())}
                    <span class="msn-dm-status-dot ${this._esc(status)}"></span>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:0.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        ${this._esc(label)}
                    </div>
                    ${dm.last_message_preview ? `<div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(dm.last_message_preview)}</div>` : ''}
                </div>
                ${unread ? `<span class="msn-channel-unread">${unread}</span>` : ''}
            </div>`;
        }).join('');
    },

    _filterDMs(query) {
        if (!query) return this._renderDMItems(document.getElementById('msn-channel-scroll'), this.dmList);
        var q = query.toLowerCase();
        var currentUserId = App.currentUser ? App.currentUser.id : null;
        var filtered = this.dmList.filter(dm => {
            var label = dm.type === 'group_dm'
                ? (dm.name || 'Group DM')
                : (dm.partner_display_name || dm.partner_username || '');
            return label.toLowerCase().includes(q);
        });
        this._renderDMItems(document.getElementById('msn-channel-scroll'), filtered);
    },

    // ── New DM Search ────────────────────────────────────────────
    _showNewDMSearch() {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.id = 'msn-new-dm-overlay';
        overlay.innerHTML = `<div class="msn-modal" style="width:500px">
            <h2>Open a Direct Message</h2>
            <p>Search for a user to start a conversation.</p>
            <input class="msn-search-input" id="msn-user-search-input" placeholder="Search users..."
                oninput="MessengerPage._searchUsersForDM(this.value)" autocomplete="off" style="font-size:0.95rem;padding:12px">
            <div id="msn-user-search-results" style="margin-top:8px;max-height:300px;overflow-y:auto"></div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="document.getElementById('msn-new-dm-overlay').remove()">Cancel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-user-search-input').focus();
    },

    _searchUsersForDM(query) {
        clearTimeout(this._searchDebounce);
        var results = document.getElementById('msn-user-search-results');
        if (!query || query.trim().length < 1) {
            if (results) results.innerHTML = '';
            return;
        }
        if (results) results.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:0.85rem">Searching...</div>';

        this._searchDebounce = setTimeout(async () => {
            try {
                var users = await this._coreApi('GET', '/users/search?q=' + encodeURIComponent(query.trim()));
                var resultsEl = document.getElementById('msn-user-search-results');
                if (!resultsEl) return;

                if (!Array.isArray(users)) {
                    resultsEl.innerHTML = `<div style="padding:8px;color:#ed4245;font-size:0.85rem">${this._esc(users?.error || 'Search error.')}</div>`;
                    return;
                }
                if (users.length === 0) {
                    resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:0.85rem">No users found.</div>';
                    return;
                }

                resultsEl.innerHTML = users.map(u => {
                    var initials = (u.display_name || u.username || '?').charAt(0).toUpperCase();
                    return `<div class="msn-user-result" onclick="MessengerPage._startDM('${u.id}')">
                        <div class="msn-dm-avatar" style="width:36px;height:36px;font-size:0.8rem">
                            ${u.avatar ? `<img src="${this._esc(u.avatar)}" alt="">` : initials}
                            <span class="msn-dm-status-dot ${u.status || 'offline'}"></span>
                        </div>
                        <div>
                            <div style="font-weight:600;font-size:0.9rem">${this._esc(u.display_name || u.username)}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted)">@${this._esc(u.username)}</div>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;color:var(--text-muted)">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                    </div>`;
                }).join('');
            } catch (e) {
                var resultsEl = document.getElementById('msn-user-search-results');
                if (resultsEl) resultsEl.innerHTML = '<div style="padding:8px;color:#ed4245;font-size:0.85rem">Search failed.</div>';
            }
        }, 300);
    },

    async _startDM(userId) {
        document.getElementById('msn-new-dm-overlay')?.remove();
        try {
            var dm = await this._api('POST', '/dm', { target_user_id: userId });
            if (dm && dm.message_request) {
                this._toast('Message request sent! They will be notified.', 4000);
                return;
            }
            if (dm && !dm.error) {
                await this._loadDMs();
                this._selectDMs();
                await this._openDM(dm.id);
            } else {
                this._toast(dm?.error || 'Failed to open DM');
            }
        } catch (e) {
            this._toast('Failed to open DM');
        }
    },

    async _openDM(dmId) {
        this.activeDmId = dmId;
        this.activeChannelId = null;
        this.unreadCounts[dmId] = 0;
        this._showDMList();
        
        window.history.replaceState(null, '', '/messenger?dm=' + dmId);

        var messagesEl = document.getElementById('msn-message-area');
        if (messagesEl) messagesEl.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center"><div class="loading-spinner"></div></div>';

        // Find DM metadata from dmList; if absent, fetch directly from API
        var dmMeta = this.dmList.find(d => d.id === dmId);
        if (!dmMeta) {
            try {
                var fetched = await this._api('GET', '/dm/' + dmId);
                if (fetched && !fetched.error) {
                    dmMeta = fetched;
                    // Add to local list so future opens work without a round-trip
                    this.dmList.push(dmMeta);
                    this._showDMList();
                }
            } catch (e) { /* non-fatal */ }
        }

        // Pre-populate memberCache for all participants so messages render correctly
        if (dmMeta && Array.isArray(dmMeta.member_ids)) {
            await Promise.all(dmMeta.member_ids.map(uid => this._getMemberInfo(uid)));
        }

        // Also seed cache from inline partner fields on dmMeta
        if (dmMeta && dmMeta.partner_id && !this.memberCache[dmMeta.partner_id]) {
            this.memberCache[dmMeta.partner_id] = {
                username:     dmMeta.partner_username     || null,
                display_name: dmMeta.partner_display_name || null,
                avatar:       dmMeta.partner_avatar       || null,
                status:       dmMeta.partner_status       || 'offline'
            };
        }

        var messages = await this._loadDMMessages(dmId);
        if (!Array.isArray(messages)) messages = [];
        this._renderMessageArea(null, messages, true, dmId, dmMeta);
    },

    // ── Space Selection ──────────────────────────────────────────
    async _selectSpace(spaceId) {
        this.activeSpaceId = spaceId;
        this.activeDmId = null;
        this._renderSpaceList();

        window.history.replaceState(null, '', '/messenger?space=' + spaceId);

        var sidebar = document.getElementById('msn-channel-sidebar');
        var scroll = document.getElementById('msn-channel-scroll');
        if (scroll) scroll.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.85rem">Loading...</div>';

        var data = await this._loadSpaceDetails(spaceId);
        if (!data) return;

        this._renderSpaceSidebar(data);
        this._renderMemberList(spaceId);

        var firstText = (data.channels || []).find(c => c.type === 'text');
        if (firstText) this._selectChannel(firstText.id);
        else this._clearMessageArea();
    },

    _renderSpaceSidebar(data) {
        var header = document.getElementById('msn-sidebar-header');
        var scroll  = document.getElementById('msn-channel-scroll');
        if (!header || !scroll) return;

        var currentUserId = App.currentUser ? App.currentUser.id : null;
        var isOwner = data.owner_id === currentUserId;

        header.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
            <h2 style="margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px"
                title="${this._esc(data.name)}">${this._esc(data.name)}</h2>
            <button class="msn-header-btn" onclick="MessengerPage._showSpaceHeaderMenu('${data.id}',event)" title="Space options">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
        </div>`;

        var cats = this.categories[data.id] || [];
        var channels = this.channels[data.id] || [];
        var uncategorized = channels.filter(c => !c.category_id);
        var html = '';

        uncategorized.forEach(c => { html += this._renderChannelItem(c); });

        cats.forEach(cat => {
            var catChannels = channels.filter(c => c.category_id === cat.id);
            html += `<div class="msn-category">
                <div class="msn-category-header" onclick="MessengerPage._toggleCategory(this)">
                    <span class="msn-caret">▾</span>
                    ${this._esc(cat.name.toUpperCase())}
                    ${isOwner ? `<button class="msn-add-channel-btn" title="Add Channel"
                        onclick="event.stopPropagation();MessengerPage._showCreateChannelModal('${cat.id}')">+</button>` : ''}
                </div>
                ${catChannels.map(c => this._renderChannelItem(c)).join('')}
            </div>`;
        });

        if (isOwner) {
            html += `<div style="padding:8px 16px;margin-top:8px">
                <button class="msn-btn msn-btn-secondary" style="width:100%;font-size:0.8rem;text-align:left;padding:6px 10px"
                    onclick="MessengerPage._showCreateChannelModal('')">
                    + Add Channel
                </button>
            </div>`;
        }

        scroll.innerHTML = html;
    },

    _renderChannelItem(channel) {
        var icons = { text: '#', voice: '🔊', announcement: '📢', forum: '💬', stage: '🎭' };
        var icon = icons[channel.type] || '#';
        var isActive = this.activeChannelId === channel.id;
        var unread = this.unreadCounts[channel.id] || 0;
        return `<div class="msn-channel-item ${isActive ? 'active' : ''} ${unread ? 'has-unread' : ''}"
            id="ch-${channel.id}"
            onclick="MessengerPage._selectChannel('${channel.id}')"
            oncontextmenu="event.preventDefault();MessengerPage._channelCtxMenu('${channel.id}',event)">
            <span class="msn-channel-icon">${icon}</span>
            <span class="msn-channel-name">${this._esc(channel.name)}</span>
            ${unread ? `<span class="msn-channel-unread">${unread}</span>` : ''}
        </div>`;
    },

    _showSpaceHeaderMenu(spaceId, e) {
        var space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;
        var isOwner = App.currentUser && space.owner_id === App.currentUser.id;
        this._showContextMenu(e.clientX, e.clientY, [
            { label: '🔗 Invite People', action: () => this._showInviteModal() },
            { label: '🔍 Search Messages', action: () => this._showMessageSearch() },
            { label: '⚙️ Space Settings', action: () => this._showSpaceSettings(spaceId), show: isOwner },
            { separator: true, show: isOwner },
            { label: '🗑️ Delete Space', danger: true, action: () => this._deleteSpace(spaceId), show: isOwner },
            { label: '🚪 Leave Space', danger: true, action: () => this._leaveSpace(spaceId), show: !isOwner }
        ]);
    },

    _channelCtxMenu(channelId, e) {
        var isOwner = this.activeSpaceId && this.spaces.find(s => s.id === this.activeSpaceId)?.owner_id === App.currentUser?.id;
        this._showContextMenu(e.clientX, e.clientY, [
            { label: '📌 View Pinned Messages', action: () => this._showPinnedMessages(channelId) },
            { label: '🔍 Search Messages', action: () => this._showMessageSearch(channelId) },
            { label: '🔗 Copy Link', action: () => { navigator.clipboard.writeText(window.location.origin + '/messenger?channel=' + channelId); this._toast('Link copied!'); } },
            { separator: true, show: isOwner },
            { label: '✏️ Edit Channel', action: () => this._showEditChannelModal(channelId), show: isOwner },
            { label: '🗑️ Delete Channel', danger: true, action: () => this._deleteChannel(channelId), show: isOwner }
        ]);
    },

    _toggleCategory(el) {
        el.classList.toggle('collapsed');
        var cat = el.closest('.msn-category');
        if (!cat) return;
        cat.querySelectorAll('.msn-channel-item').forEach(item => {
            item.style.display = el.classList.contains('collapsed') ? 'none' : '';
        });
    },

    // ── Channel Selection ────────────────────────────────────────
    async _selectChannel(channelId) {
        if (this.socket && this.activeChannelId) this.socket.emit('leave_channel', this.activeChannelId);

        this.activeChannelId = channelId;
        this.activeDmId = null;
        this.unreadCounts[channelId] = 0;
        
        window.history.replaceState(null, '', '/messenger?space=' + this.activeSpaceId + '&channel=' + channelId);

        document.querySelectorAll('.msn-channel-item').forEach(el => {
            el.classList.toggle('active', el.id === 'ch-' + channelId);
            if (el.id === 'ch-' + channelId) el.classList.remove('has-unread');
        });
        
        var sidebar = document.getElementById('msn-channel-sidebar');
        if (sidebar) sidebar.classList.remove('msn-sidebar-open');

        if (this.socket) this.socket.emit('join_channel', channelId);

        var area = document.getElementById('msn-message-area');
        if (area) area.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center"><div class="loading-spinner"></div></div>';

        var channel = (this.channels[this.activeSpaceId] || []).find(c => c.id === channelId);
        var messages = await this._loadMessages(channelId);
        if (!Array.isArray(messages)) messages = [];
        this._renderMessageArea(channel, messages, false, null);

        if (this.socket) {
            this.socket.emit('channel:mark_read', { channelId, lastMessageId: messages[messages.length - 1]?.id });
        }
    },

    // ── Message Area ─────────────────────────────────────────────
    _toggleMobileSidebar() {
        var sidebar = document.getElementById('msn-channel-sidebar');
        if (sidebar) sidebar.classList.toggle('msn-sidebar-open');
    },

    _clearMessageArea() {
        var area = document.getElementById('msn-message-area');
        if (!area) return;
        area.innerHTML = `<div class="msn-welcome">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <h2>Venary Messenger</h2>
            <p>Select a channel or conversation to start chatting.</p>
        </div>`;
    },

    _renderMessageArea(channel, messages, isDM, dmId, dmMeta) {
        var area = document.getElementById('msn-message-area');
        if (!area) return;

        // Resolve DM partner info for header
        var partnerName   = '';
        var partnerAvatar = null;
        var partnerStatus = 'offline';
        var partnerId     = null;
        if (isDM && dmMeta) {
            if (dmMeta.type === 'group_dm') {
                partnerName = dmMeta.name || 'Group DM';
            } else {
                var currentUserId = App.currentUser ? App.currentUser.id : null;
                partnerId     = dmMeta.partner_id || (dmMeta.member_ids || []).find(id => id !== currentUserId);
                var cached    = partnerId ? this.memberCache[partnerId] : null;
                partnerName   = (cached ? (cached.display_name || cached.username) : null)
                                || dmMeta.partner_display_name || dmMeta.partner_username || 'Direct Message';
                partnerAvatar = (cached ? cached.avatar : null) || dmMeta.partner_avatar || null;
                partnerStatus = (cached ? cached.status : null) || dmMeta.partner_status || 'offline';
            }
        }

        var title   = channel ? channel.name : partnerName;
        var topic   = channel ? (channel.topic || '') : '';
        var icon    = isDM ? null : (channel ? (channel.type === 'voice' ? '🔊' : channel.type === 'announcement' ? '📢' : '#') : '#');
        var canSend = channel ? channel.type !== 'voice' : isDM;
        var contextId = isDM ? dmId : (channel ? channel.id : null);

        var headerIconHtml = isDM
            ? `<div class="msn-dm-avatar" style="width:28px;height:28px;font-size:0.75rem;flex-shrink:0;margin-right:4px">
                ${partnerAvatar ? `<img src="${this._esc(partnerAvatar)}" alt="">` : this._esc((partnerName || '?').charAt(0).toUpperCase())}
                <span class="msn-dm-status-dot ${this._esc(partnerStatus)}" style="width:8px;height:8px;border-width:1.5px"></span>
               </div>`
            : `<span class="msn-ch-icon">${icon}</span>`;

        area.innerHTML = `
        <div class="msn-channel-header">
            <button class="msn-header-btn msn-mobile-menu-btn" onclick="MessengerPage._toggleMobileSidebar()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            ${headerIconHtml}
            <span class="msn-ch-name" ${partnerId ? `onclick="MessengerPage._showUserPopout('${partnerId}',event)" style="cursor:pointer"` : ''}>${this._esc(title)}</span>
            ${topic ? `<span class="msn-ch-topic" title="${this._esc(topic)}">${this._esc(topic)}</span>` : ''}
            <div class="msn-header-actions">
                <button class="msn-header-btn" title="Search Messages" onclick="MessengerPage._showMessageSearch('${contextId}','${isDM}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                </button>
                ${!isDM ? `<button class="msn-header-btn" title="Pinned Messages" onclick="MessengerPage._showPinnedMessages('${contextId}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/>
                    </svg>
                </button>` : ''}
                <button class="msn-header-btn" title="Toggle Member List" onclick="MessengerPage._toggleMemberList()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                </button>
                ${!isDM && this.activeSpaceId ? `<button class="msn-header-btn" title="Invite People" onclick="MessengerPage._showInviteModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                </button>` : ''}
            </div>
        </div>
        <div class="msn-messages" id="msn-messages">
            ${messages.length > 0
                ? `<button class="msn-load-more-btn" onclick="MessengerPage._loadMoreMessages('${contextId}','${isDM}')">Load earlier messages</button>`
                : ''}
            ${messages.length === 0 ? `
            <div class="msn-empty-channel">
                <div class="msn-ch-welcome-icon">${isDM ? (partnerAvatar ? `<img src="${this._esc(partnerAvatar)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover">` : '👋') : icon}</div>
                <h2>${isDM ? 'This is the beginning of your direct message history with <strong>' + this._esc(title) + '</strong>' : 'Welcome to #' + this._esc(title)}</h2>
                <p>${isDM ? '' : 'This is the beginning of the <strong>#' + this._esc(title) + '</strong> channel.'}</p>
            </div>` : this._renderMessages(messages)}
        </div>
        <div class="msn-reply-preview hidden" id="msn-reply-preview">
            <span id="msn-reply-text"></span>
            <button onclick="MessengerPage._clearReply()">✕</button>
        </div>
        <div class="msn-typing-indicator" id="msn-typing-indicator"></div>
        ${canSend ? `
        <div class="msn-input-area">
            <div class="msn-input-box">
                <button class="msn-input-attach" title="Attach file" onclick="MessengerPage._triggerFileUpload('${contextId}','${isDM}')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                </button>
                <input type="file" id="msn-file-input" style="display:none" onchange="MessengerPage._handleFileUpload(this,'${contextId}','${isDM}')">
                <textarea class="msn-chat-input" id="msn-chat-input"
                    placeholder="Message ${isDM ? '@' : '#'}${this._esc(title)}" rows="1"
                    data-context="${contextId}" data-isdm="${isDM}"></textarea>
                <button class="msn-input-emoji" title="Emoji" onclick="MessengerPage._showEmojiPicker()">😊</button>
                <button class="msn-send-btn" id="msn-send-btn" disabled>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
        </div>` : `<div style="padding:12px 16px;text-align:center;color:var(--text-muted);font-size:0.85rem">Voice channels cannot receive text messages.</div>`}`;

        var msgsEl = document.getElementById('msn-messages');
        if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

        if (canSend) this._wireInput(contextId, isDM === 'true' || isDM === true);
    },

    // ── Message Rendering ────────────────────────────────────────
    _renderMessages(messages) {
        var html = '';
        var lastAuthorId = null;
        var lastDate = null;
        var lastTimeMs = 0;

        messages.forEach(msg => {
            var msgTimeMs = new Date(msg.created_at).getTime();
            var date = new Date(msg.created_at).toLocaleDateString();
            if (date !== lastDate) {
                html += `<div class="msn-date-divider">${date}</div>`;
                lastDate = date;
                lastAuthorId = null;
            }
            var timeDiff = msgTimeMs - lastTimeMs;
            var isNewAuthor = msg.author_id !== lastAuthorId || !!msg.reply_to_id || timeDiff > 5 * 60 * 1000;
            lastAuthorId = msg.author_id;
            lastTimeMs = msgTimeMs;
            html += this._renderMessageGroup(msg, isNewAuthor);
        });

        return html;
    },

    _renderMessageGroup(msg, isNewAuthor) {
        var currentUserId = App.currentUser ? App.currentUser.id : null;
        var isSelf = msg.author_id === currentUserId;

        // Seed memberCache from inline sender fields (set by backend)
        if (msg.author_id && (msg.sender_username || msg.sender_display_name)) {
            if (!this.memberCache[msg.author_id]) {
                this.memberCache[msg.author_id] = {
                    username:     msg.sender_username     || null,
                    display_name: msg.sender_display_name || null,
                    avatar:       msg.sender_avatar       || null
                };
            }
        }

        // Resolve author display: cache → inline fields → fallback
        var cached = this.memberCache[msg.author_id];
        var authorName = (cached ? (cached.display_name || cached.username) : null)
            || msg.sender_display_name || msg.sender_username || msg.webhook_name
            || (msg.author_id ? msg.author_id.slice(0, 8) : 'Unknown');
        var authorAvatar = (cached ? cached.avatar : null) || msg.sender_avatar || null;
        var avatarInitial = authorName.charAt(0).toUpperCase();

        var time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var fullTime = new Date(msg.created_at).toLocaleString();

        // Reactions
        var reactionsObj = {};
        try { reactionsObj = JSON.parse(typeof msg.reactions === 'string' ? msg.reactions : '{}'); } catch (e) {}
        var reactionsHtml = Object.entries(reactionsObj).map(([emoji, users]) => {
            var reacted = currentUserId && users.includes(currentUserId);
            return `<button class="msn-reaction ${reacted ? 'msn-reacted' : ''}"
                onclick="MessengerPage._toggleReaction('${this._esc(msg.id)}','${this._esc(emoji)}','${this._esc(msg.channel_id || msg.dm_channel_id || '')}','${!!msg.dm_channel_id}')">
                ${this._esc(emoji)} <span class="msn-reaction-count">${users.length}</span>
            </button>`;
        }).join('');

        // Attachments
        var attachments = [];
        try { attachments = JSON.parse(msg.attachments || '[]'); } catch (e) {}
        var attachHtml = attachments.map(att => {
            if (/\.(png|jpg|jpeg|gif|webp)$/i.test(att.filename || att.url || '')) {
                return `<div class="msn-attachment-img"><img src="${this._esc(att.url)}" alt="${this._esc(att.filename || 'image')}" onclick="MessengerPage._lightbox('${this._esc(att.url)}')"></div>`;
            }
            return `<div class="msn-attachment-file">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                <a href="${this._esc(att.url)}" target="_blank" rel="noopener">${this._esc(att.filename || 'file')}</a>
            </div>`;
        }).join('');

        // Reply preview
        var replyHtml = '';
        if (msg.reply_to_id) {
            replyHtml = `<div class="msn-msg-reply" onclick="var el=document.querySelector('[data-msg-id=\\'${msg.reply_to_id}\\']');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.backgroundColor='var(--bg-hover,rgba(255,255,255,0.1))';setTimeout(()=>el.style.backgroundColor='',2000)}" title="Jump to original message">
                <div class="msn-reply-spine"></div>
                <span class="msn-reply-author">Replied to message</span>
            </div>`;
        }

        return `<div class="msn-msg-group ${isNewAuthor ? 'msn-msg-new-author' : ''}" data-msg-id="${msg.id}" data-author-id="${msg.author_id}" data-created-at="${new Date(msg.created_at).getTime()}"
            oncontextmenu="event.preventDefault();MessengerPage._msgCtxMenu('${msg.id}','${isSelf}',event)">
            ${isNewAuthor
                ? `<div class="msn-msg-avatar" onclick="MessengerPage._showUserPopout('${msg.author_id}',event)" title="${this._esc(authorName)}">
                    ${authorAvatar ? `<img src="${this._esc(authorAvatar)}" alt="">` : avatarInitial}
                   </div>`
                : `<div class="msn-msg-avatar-spacer" title="${fullTime}">${time}</div>`}
            <div class="msn-msg-body">
                ${replyHtml}
                ${isNewAuthor ? `<div class="msn-msg-header">
                    <span class="msn-msg-author" onclick="MessengerPage._showUserPopout('${msg.author_id}',event)">${this._esc(authorName)}</span>
                    <span class="msn-msg-timestamp" title="${fullTime}">${time}</span>
                    ${msg.type === 'bot' || msg.type === 'webhook' ? '<span class="msn-badge-bot">BOT</span>' : ''}
                </div>` : ''}
                <div class="msn-msg-content ${msg.deleted ? 'msn-msg-deleted' : ''}">${msg.deleted ? '<em>(message deleted)</em>' : this._renderMarkdown(msg.content || '')}${msg.edited_at && !msg.deleted ? '<span class="msn-msg-edited">(edited)</span>' : ''}</div>
                ${attachHtml}
                ${reactionsHtml ? `<div class="msn-msg-reactions">${reactionsHtml}</div>` : ''}
            </div>
            <div class="msn-msg-actions">
                <button class="msn-msg-action-btn" title="Add Reaction" onclick="MessengerPage._showReactionPicker('${msg.id}','${msg.channel_id || msg.dm_channel_id || ''}','${!!msg.dm_channel_id}',event)">😊</button>
                <button class="msn-msg-action-btn" title="Reply" onclick="MessengerPage._setReply('${msg.id}','${this._esc(authorName)}','${this._esc((msg.content||'').slice(0,60))}')">↩</button>
                ${isSelf && !msg.deleted ? `
                <button class="msn-msg-action-btn" title="Edit" onclick="MessengerPage._editMessage('${msg.id}')">✏️</button>
                <button class="msn-msg-action-btn danger" title="Delete" onclick="MessengerPage._deleteMessage('${msg.id}')">🗑️</button>` : ''}
            </div>
        </div>`;
    },

    // ── Markdown Renderer ────────────────────────────────────────
    _renderMarkdown(text) {
        if (!text) return '';
        // Escape HTML first
        var s = String(text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code blocks (``` ... ```)
        s = s.replace(/```([a-z]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
            `<pre class="msn-code-block"><code class="${lang ? 'lang-' + lang : ''}">${code.trim()}</code></pre>`);

        // Inline code
        s = s.replace(/`([^`\n]+)`/g, '<code class="msn-inline-code">$1</code>');

        // Bold + italic
        s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        // Bold
        s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/__(.+?)__/g, '<u>$1</u>');
        // Italic
        s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
        // Strikethrough
        s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
        // Spoiler
        s = s.replace(/\|\|(.+?)\|\|/g, '<span class="msn-spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
        // Block quote
        s = s.replace(/^&gt; (.+)$/gm, '<div class="msn-blockquote">$1</div>');
        // Newlines → <br> (not inside pre blocks)
        s = s.replace(/\n/g, '<br>');
        // URLs — auto-link
        s = s.replace(/(https?:\/\/[^\s<>"]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="msn-link">$1</a>');

        return s;
    },

    // ── Input Wiring ─────────────────────────────────────────────
    _wireInput(contextId, isDM) {
        var input   = document.getElementById('msn-chat-input');
        var sendBtn = document.getElementById('msn-send-btn');
        if (!input || !sendBtn) return;

        var self = this;

        input.addEventListener('input', function () {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
            sendBtn.disabled = !input.value.trim();

            if (self.socket) {
                if (isDM) self.socket.emit('dm:typing', { dmChannelId: contextId });
                else self.socket.emit('channel:typing', { channelId: contextId });
            }
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) self._sendMessage(contextId, isDM, input, sendBtn);
            }
            if (e.key === 'Escape') self._clearReply();
        });

        sendBtn.addEventListener('click', function () {
            if (!sendBtn.disabled) self._sendMessage(contextId, isDM, input, sendBtn);
        });

        input.focus();
    },

    _sendMessage(contextId, isDM, input, sendBtn) {
        var content = input.value.trim();
        if (!content || !contextId) return;

        if (this.socket) {
            if (isDM) {
                this.socket.emit('dm:send_message', { dmChannelId: contextId, content, reply_to_id: this._replyToId || null });
            } else {
                this.socket.emit('channel:send_message', { channelId: contextId, content, reply_to_id: this._replyToId || null });
            }
        } else {
            var endpoint = isDM ? '/dm/' + contextId + '/messages' : '/channels/' + contextId + '/messages';
            this._api('POST', endpoint, { content, reply_to_id: this._replyToId || null })
                .then(msg => { if (msg && !msg.error) this._appendMessage(msg); });
        }

        input.value = '';
        input.style.height = 'auto';
        sendBtn.disabled = true;
        this._clearReply();
    },

    // ── Reply ────────────────────────────────────────────────────
    _setReply(messageId, authorName, preview) {
        this._replyToId = messageId;
        this._replyToContent = preview;
        var el = document.getElementById('msn-reply-preview');
        var txt = document.getElementById('msn-reply-text');
        if (el) el.classList.remove('hidden');
        if (txt) txt.innerHTML = `<strong>Replying to ${this._esc(authorName)}:</strong> ${this._esc(preview)}${preview.length >= 60 ? '…' : ''}`;
        document.getElementById('msn-chat-input')?.focus();
    },

    _clearReply() {
        this._replyToId = null;
        this._replyToContent = null;
        var el = document.getElementById('msn-reply-preview');
        if (el) el.classList.add('hidden');
    },

    // ── Load More ────────────────────────────────────────────────
    async _loadMoreMessages(contextId, isDM) {
        var msgsEl = document.getElementById('msn-messages');
        var firstMsg = msgsEl ? msgsEl.querySelector('[data-msg-id]') : null;
        var before = firstMsg ? firstMsg.dataset.msgId : null;

        var messages = isDM === 'true' || isDM === true
            ? await this._loadDMMessages(contextId, before)
            : await this._loadMessages(contextId, before);

        if (!Array.isArray(messages) || messages.length === 0) {
            var btn = msgsEl ? msgsEl.querySelector('.msn-load-more-btn') : null;
            if (btn) btn.textContent = 'No more messages';
            return;
        }

        var prevScrollHeight = msgsEl.scrollHeight;
        var newHtml = this._renderMessages(messages);

        var btn = msgsEl ? msgsEl.querySelector('.msn-load-more-btn') : null;
        if (btn) btn.insertAdjacentHTML('afterend', newHtml);

        // Preserve scroll position
        msgsEl.scrollTop = msgsEl.scrollHeight - prevScrollHeight;
    },

    // ── Real-time Events ─────────────────────────────────────────
    _onChannelMessage(msg) {
        if (msg.channel_id === this.activeChannelId) {
            this._appendMessage(msg);
            if (this.socket) this.socket.emit('channel:mark_read', { channelId: msg.channel_id, lastMessageId: msg.id });
        } else {
            this.unreadCounts[msg.channel_id] = (this.unreadCounts[msg.channel_id] || 0) + 1;
            var el = document.getElementById('ch-' + msg.channel_id);
            if (el) {
                el.classList.add('has-unread');
                var badge = el.querySelector('.msn-channel-unread');
                var count = this.unreadCounts[msg.channel_id];
                if (badge) badge.textContent = count;
                else el.insertAdjacentHTML('beforeend', `<span class="msn-channel-unread">${count}</span>`);
            }
        }
        // Desktop notification for @mentions
        if (App.currentUser && msg.content && msg.content.includes('@' + App.currentUser.username)) {
            this._sendDesktopNotification('New mention', msg.content.slice(0, 80));
        }
    },

    _onDmMessage(msg) {
        // Seed memberCache from inline sender fields on real-time messages
        if (msg.author_id && (msg.sender_username || msg.sender_display_name)) {
            if (!this.memberCache[msg.author_id]) {
                this.memberCache[msg.author_id] = {
                    username:     msg.sender_username     || null,
                    display_name: msg.sender_display_name || null,
                    avatar:       msg.sender_avatar       || null
                };
            }
        }

        // If this DM channel isn't in our list yet, reload the list so it appears
        var knownDm = this.dmList.find(d => d.id === msg.dm_channel_id);
        if (!knownDm) {
            this._loadDMs().then(() => {
                if (!this.activeSpaceId) this._showDMList();
            });
        }

        if (msg.dm_channel_id === this.activeDmId) {
            this._appendMessage(msg);
        } else {
            this.unreadCounts[msg.dm_channel_id] = (this.unreadCounts[msg.dm_channel_id] || 0) + 1;
            this._showDMList();
            this._sendDesktopNotification('New message', msg.content ? msg.content.slice(0, 80) : '');
        }
        // Update unread badge in top nav
        var badge = document.getElementById('unread-badge');
        if (badge && msg.dm_channel_id !== this.activeDmId) {
            var total = Object.values(this.unreadCounts).reduce((a, b) => a + b, 0);
            badge.textContent = total;
            badge.classList.toggle('hidden', total === 0);
        }
    },

    _appendMessage(msg) {
        var msgsEl = document.getElementById('msn-messages');
        if (!msgsEl) return;

        var emptyState = msgsEl.querySelector('.msn-empty-channel');
        if (emptyState) emptyState.remove();

        // Seed cache from inline sender fields so the message renders correctly
        if (msg.author_id && (msg.sender_username || msg.sender_display_name)) {
            if (!this.memberCache[msg.author_id]) {
                this.memberCache[msg.author_id] = {
                    username:     msg.sender_username     || null,
                    display_name: msg.sender_display_name || null,
                    avatar:       msg.sender_avatar       || null
                };
            }
        } else if (msg.author_id && !this.memberCache[msg.author_id]) {
            this._getMemberInfo(msg.author_id);
        }

        // Determine grouping: only start a new author block when the author changes or time passed
        var lastGroup = msgsEl.querySelector('.msn-msg-group:last-of-type');
        var msgTimeMs = new Date(msg.created_at).getTime();
        var lastGroupTimeStr = lastGroup ? lastGroup.dataset.createdAt : null;
        var lastGroupTimeMs = lastGroupTimeStr ? parseInt(lastGroupTimeStr, 10) : 0;
        var timeDiff = msgTimeMs - lastGroupTimeMs;
        var isNewAuthor = !lastGroup || lastGroup.dataset.authorId !== msg.author_id || !!msg.reply_to_id || timeDiff > 5 * 60 * 1000;

        var div = document.createElement('div');
        div.innerHTML = this._renderMessageGroup(msg, isNewAuthor);
        while (div.firstChild) msgsEl.appendChild(div.firstChild);

        var atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 200;
        if (atBottom) msgsEl.scrollTop = msgsEl.scrollHeight;
    },

    _onMessageEdited(msg) {
        var el = document.querySelector(`[data-msg-id="${msg.id}"] .msn-msg-content`);
        if (!el) return;
        el.innerHTML = this._renderMarkdown(msg.content || '') + '<span class="msn-msg-edited">(edited)</span>';
    },

    _onMessageDeleted(d) {
        var el = document.querySelector(`[data-msg-id="${d.messageId}"] .msn-msg-content`);
        if (!el) return;
        el.innerHTML = '<em>(message deleted)</em>';
        el.classList.add('msn-msg-deleted');
    },

    _onReactionUpdate(d) {
        var group = document.querySelector(`[data-msg-id="${d.messageId}"]`);
        if (!group) return;
        var reactionsEl = group.querySelector('.msn-msg-reactions');
        var currentUserId = App.currentUser ? App.currentUser.id : null;
        var reactions = d.reactions || {};
        var html = Object.entries(reactions).map(([emoji, users]) => {
            var reacted = currentUserId && users.includes(currentUserId);
            return `<button class="msn-reaction ${reacted ? 'msn-reacted' : ''}"
                onclick="MessengerPage._toggleReaction('${d.messageId}','${this._esc(emoji)}','${this._esc(d.channelId || '')}','false')">
                ${this._esc(emoji)} <span class="msn-reaction-count">${users.length}</span>
            </button>`;
        }).join('');

        if (reactionsEl) {
            reactionsEl.innerHTML = html;
        } else {
            var body = group.querySelector('.msn-msg-body');
            if (body && html) body.insertAdjacentHTML('beforeend', `<div class="msn-msg-reactions">${html}</div>`);
        }
    },

    _onTyping(d, isDM) {
        var indicator = document.getElementById('msn-typing-indicator');
        if (!indicator) return;
        if (App.currentUser && d.userId === App.currentUser.id) return;

        var key = isDM ? d.dmChannelId : d.channelId;
        if (!this.typingUsers[key]) this.typingUsers[key] = {};
        if (this.typingUsers[key][d.userId]) clearTimeout(this.typingUsers[key][d.userId].timer);

        this.typingUsers[key][d.userId] = {
            username: d.username,
            timer: setTimeout(() => {
                delete this.typingUsers[key][d.userId];
                this._updateTypingIndicator(key, indicator);
            }, 3000)
        };
        this._updateTypingIndicator(key, indicator);
    },

    _updateTypingIndicator(key, el) {
        var users = Object.values(this.typingUsers[key] || {}).map(u => u.username || '…');
        if (users.length === 0) { el.textContent = ''; return; }
        if (users.length === 1) el.innerHTML = `<strong>${this._esc(users[0])}</strong> is typing…`;
        else el.innerHTML = `<strong>${users.slice(0, 2).map(u => this._esc(u)).join(', ')}</strong> are typing…`;
    },

    _onSpaceUpdated(s) {
        var idx = this.spaces.findIndex(sp => sp.id === s.id);
        if (idx !== -1) { this.spaces[idx] = s; this._renderSpaceList(); }
    },
    _onSpaceDeleted(d) {
        this.spaces = this.spaces.filter(s => s.id !== d.spaceId);
        if (this.activeSpaceId === d.spaceId) { this.activeSpaceId = null; this._clearMessageArea(); }
        this._renderSpaceList();
    },
    _onChannelCreated(c) {
        if (!this.channels[c.space_id]) this.channels[c.space_id] = [];
        this.channels[c.space_id].push(c);
        if (this.activeSpaceId === c.space_id) this._loadSpaceDetails(c.space_id).then(d => d && this._renderSpaceSidebar(d));
    },
    _onChannelDeleted(d) {
        if (this.channels[d.spaceId]) this.channels[d.spaceId] = this.channels[d.spaceId].filter(c => c.id !== d.channelId);
        if (this.activeChannelId === d.channelId) { this.activeChannelId = null; this._clearMessageArea(); }
        if (this.activeSpaceId === d.spaceId) this._loadSpaceDetails(d.spaceId).then(data => data && this._renderSpaceSidebar(data));
    },

    // ── Member List ──────────────────────────────────────────────
    _renderMemberList(spaceId) {
        var el = document.getElementById('msn-member-list');
        if (!el) return;

        var members = this.members[spaceId] || [];
        if (members.length === 0) { el.innerHTML = '<div class="msn-sidebar-empty">No members found.</div>'; return; }

        var online  = members.filter(m => m.status === 'online' || m.status === 'idle');
        var offline = members.filter(m => !m.status || m.status === 'offline');

        var html = '';
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
        var cached = this.memberCache[member.user_id];
        var name = member.nickname || (cached ? (cached.display_name || cached.username) : null) || member.user_id.slice(0, 8);
        var avatar = cached ? cached.avatar : null;
        var status = isOnline ? (cached?.status || 'online') : 'offline';

        return `<div class="msn-member-item" onclick="MessengerPage._showUserPopout('${member.user_id}',event)">
            <div class="msn-member-avatar">
                ${avatar ? `<img src="${this._esc(avatar)}" alt="">` : this._esc(name.charAt(0).toUpperCase())}
                <span class="msn-member-status-dot ${status}"></span>
            </div>
            <div class="msn-member-info">
                <div class="msn-member-name ${isOnline ? '' : 'offline'}">${this._esc(name)}</div>
                ${member.roles && member.roles.length ? `<div class="msn-member-sub">${this._esc(member.roles[0].name || '')}</div>` : ''}
            </div>
        </div>`;
    },

    _toggleMemberList() {
        var el = document.getElementById('msn-member-list');
        if (el) el.classList.toggle('hidden');
    },

    // ── User Profile Popout ──────────────────────────────────────
    async _showUserPopout(userId, e) {
        document.querySelectorAll('.msn-user-popout').forEach(el => el.remove());

        var user = await this._getMemberInfo(userId);
        var popout = document.createElement('div');
        popout.className = 'msn-user-popout';

        var initials = (user.display_name || user.username || '?').charAt(0).toUpperCase();
        var isSelf = App.currentUser && App.currentUser.id === userId;

        popout.innerHTML = `
        <div class="msn-popout-banner" style="background:linear-gradient(135deg,var(--accent,#5865f2),#4752c4)"></div>
        <div class="msn-popout-avatar">
            ${user.avatar ? `<img src="${this._esc(user.avatar)}" alt="">` : `<div class="msn-popout-initials">${initials}</div>`}
            <span class="msn-dm-status-dot ${user.status || 'offline'}"></span>
        </div>
        <div class="msn-popout-body">
            <div class="msn-popout-name">${this._esc(user.display_name || user.username)}</div>
            <div class="msn-popout-tag">@${this._esc(user.username)}</div>
            ${user.bio ? `<div class="msn-popout-bio">${this._esc(user.bio)}</div>` : ''}
            <div class="msn-popout-actions">
                ${!isSelf ? `<button class="msn-btn msn-btn-primary" onclick="MessengerPage._startDM('${userId}');document.querySelector('.msn-user-popout').remove()">Message</button>` : ''}
                ${!isSelf ? `<button class="msn-btn msn-btn-secondary" onclick="Router.go('/profile/${userId}');document.querySelector('.msn-user-popout').remove()">View Profile</button>` : ''}
                ${isSelf ? `<button class="msn-btn msn-btn-secondary" onclick="Router.go('/profile');document.querySelector('.msn-user-popout').remove()">View Profile</button>` : ''}
            </div>
        </div>`;

        document.body.appendChild(popout);

        // Position near cursor
        var x = e.clientX + 10, y = e.clientY - 20;
        if (x + 280 > window.innerWidth) x = e.clientX - 290;
        if (y + 300 > window.innerHeight) y = window.innerHeight - 310;
        popout.style.left = x + 'px';
        popout.style.top  = y + 'px';

        setTimeout(() => {
            var close = (ev) => { if (!popout.contains(ev.target)) { popout.remove(); document.removeEventListener('click', close); } };
            document.addEventListener('click', close);
        }, 50);
    },

    // ── Reactions ────────────────────────────────────────────────
    _toggleReaction(messageId, emoji, contextId, isDM) {
        if (!this.socket) return;
        this.socket.emit('channel:react', { messageId, emoji, channelId: contextId });
    },

    _showReactionPicker(messageId, contextId, isDM, e) {
        var common = ['👍','👎','❤️','😂','🎉','🔥','😮','😢','🙏','👀','✅','❌','🎮','💯','🤔','😎'];
        var menu = document.createElement('div');
        menu.className = 'msn-emoji-picker-mini';
        menu.style.cssText = `position:fixed;z-index:2000;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:8px;display:flex;flex-wrap:wrap;gap:4px;width:232px`;
        common.forEach(em => {
            var btn = document.createElement('button');
            btn.textContent = em;
            btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1.2rem;padding:4px;border-radius:4px;width:28px;height:28px;display:flex;align-items:center;justify-content:center';
            btn.addEventListener('mouseover', () => btn.style.background = 'var(--bg-hover,rgba(255,255,255,.1))');
            btn.addEventListener('mouseout',  () => btn.style.background = 'none');
            btn.addEventListener('click', () => {
                this._toggleReaction(messageId, em, contextId, isDM);
                menu.remove();
            });
            menu.appendChild(btn);
        });
        document.body.appendChild(menu);

        var rect = e.target.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top  = (rect.bottom + 4) + 'px';

        setTimeout(() => {
            var close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
            document.addEventListener('click', close);
        }, 50);
    },

    // ── Emoji Picker (full) ──────────────────────────────────────
    _showEmojiPicker() {
        var input = document.getElementById('msn-chat-input');
        if (!input) return;

        var categories = {
            '😀 Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
            '👍 Gestures': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦿'],
            '❤️ Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💖','💗','💓','💞','💕','💟','☮️','✝️','☯️','🕉️','✡️','💝','💘'],
            '🎉 Symbols': ['🎉','🎊','🎈','🎁','🏆','🥇','⭐','🌟','💫','✨','🔥','💥','🌈','☀️','🌊','💎','🚀','🎮','🎯','🎲','🃏','♟️','🎭','🎪','🎠','🎡','🎢','🎤','🎵','🎶','🎸','🎹','🎺','🥁','🎷'],
        };

        var picker = document.createElement('div');
        picker.className = 'msn-emoji-picker';

        var tabsHtml = Object.keys(categories).map((cat, i) =>
            `<button class="msn-emoji-tab ${i === 0 ? 'active' : ''}" onclick="MessengerPage._switchEmojiTab(this,'msn-emoji-cat-${i}')">${cat.split(' ')[0]}</button>`
        ).join('');

        var catsHtml = Object.entries(categories).map(([cat, emojis], i) =>
            `<div class="msn-emoji-category ${i === 0 ? '' : 'hidden'}" id="msn-emoji-cat-${i}">
                <div class="msn-emoji-cat-label">${cat}</div>
                <div class="msn-emoji-grid">${emojis.map(em =>
                    `<button class="msn-emoji-cell" onclick="MessengerPage._insertEmoji('${em}')">${em}</button>`
                ).join('')}</div>
            </div>`
        ).join('');

        picker.innerHTML = `<div class="msn-emoji-tabs">${tabsHtml}</div>${catsHtml}`;
        document.body.appendChild(picker);

        var inputRect = input.getBoundingClientRect();
        picker.style.bottom = (window.innerHeight - inputRect.top + 8) + 'px';
        picker.style.right  = (window.innerWidth - inputRect.right) + 'px';

        setTimeout(() => {
            var close = (ev) => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); } };
            document.addEventListener('click', close);
        }, 50);
    },

    _switchEmojiTab(btn, catId) {
        btn.closest('.msn-emoji-picker').querySelectorAll('.msn-emoji-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.closest('.msn-emoji-picker').querySelectorAll('.msn-emoji-category').forEach(c => c.classList.add('hidden'));
        document.getElementById(catId)?.classList.remove('hidden');
    },

    _insertEmoji(emoji) {
        var input = document.getElementById('msn-chat-input');
        if (!input) return;
        var pos = input.selectionStart;
        input.value = input.value.slice(0, pos) + emoji + input.value.slice(input.selectionEnd);
        input.selectionStart = input.selectionEnd = pos + emoji.length;
        input.dispatchEvent(new Event('input'));
        document.querySelector('.msn-emoji-picker')?.remove();
        input.focus();
    },

    // ── File Upload ──────────────────────────────────────────────
    _triggerFileUpload(contextId, isDM) {
        var el = document.getElementById('msn-file-input');
        if (el) el.click();
    },

    _handleFileUpload(input, contextId, isDM) {
        var file = input.files && input.files[0];
        if (!file) return;
        // Show preview / status — actual upload requires a server endpoint for file storage
        // For now: notify user that file upload needs backend configuration
        this._toast('File: ' + file.name + ' (upload endpoint not configured — attach URL in message)');
        input.value = '';
    },

    // ── Message Context Menu ─────────────────────────────────────
    _msgCtxMenu(messageId, isSelf, e) {
        var group = document.querySelector('[data-msg-id="' + messageId + '"]');
        var content = group ? group.querySelector('.msn-msg-content')?.textContent?.trim() : '';
        var items = [
            { label: '😊 Add Reaction', action: () => this._showReactionPicker(messageId, this.activeChannelId || this.activeDmId, !!this.activeDmId, e) },
            { label: '↩ Reply', action: () => this._setReply(messageId, '…', content.slice(0, 60)) },
            { label: '📋 Copy Text', action: () => { navigator.clipboard.writeText(content); this._toast('Copied!'); } },
            { separator: true },
            { label: '📌 Pin Message', action: () => this._pinMessage(messageId), show: !!this.activeChannelId },
        ];
        if (isSelf === 'true' || isSelf === true) {
            items.push({ separator: true });
            items.push({ label: '✏️ Edit Message',   action: () => this._editMessage(messageId) });
            items.push({ label: '🗑️ Delete Message', danger: true, action: () => this._deleteMessage(messageId) });
        }
        this._showContextMenu(e.clientX, e.clientY, items);
    },

    async _pinMessage(messageId) {
        var res = await this._api('POST', '/messages/' + messageId + '/pin');
        if (res && !res.error) this._toast(res.pinned ? 'Message pinned!' : 'Message unpinned!');
        else this._toast(res?.error || 'Failed');
    },

    async _editMessage(messageId) {
        var group = document.querySelector('[data-msg-id="' + messageId + '"]');
        var content = group ? group.querySelector('.msn-msg-content')?.textContent?.replace('(edited)', '')?.trim() : '';
        var newContent = prompt('Edit message:', content);
        if (!newContent || newContent === content) return;
        var res = await this._api('PUT', '/messages/' + messageId, { content: newContent });
        if (res && res.error) this._toast(res.error);
    },

    async _deleteMessage(messageId) {
        if (!confirm('Delete this message?')) return;
        var res = await this._api('DELETE', '/messages/' + messageId);
        if (res && res.error) this._toast(res.error);
    },

    // ── Pinned Messages ──────────────────────────────────────────
    async _showPinnedMessages(channelId) {
        var messages = await this._api('GET', '/channels/' + channelId + '/pins');
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal" style="width:600px">
            <h2>📌 Pinned Messages</h2>
            <p>${messages.length || 0} pinned message${messages.length !== 1 ? 's' : ''}</p>
            <div style="max-height:400px;overflow-y:auto">
                ${messages.length === 0
                    ? '<div style="color:var(--text-muted);font-size:0.9rem;padding:16px 0">No pinned messages in this channel.</div>'
                    : messages.map(m => `<div class="msn-pinned-item">
                        <div class="msn-pinned-meta">${this._esc(m.author_id?.slice(0, 8) || 'Unknown')} · ${new Date(m.created_at).toLocaleDateString()}</div>
                        <div class="msn-pinned-content">${this._renderMarkdown(m.content || '')}</div>
                      </div>`).join('')}
            </div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Close</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    // ── Message Search ───────────────────────────────────────────
    _showMessageSearch(channelId, isDM) {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal" style="width:600px">
            <h2>🔍 Search Messages</h2>
            <input class="msn-search-input" id="msn-msg-search-input" placeholder="Search for a message..." style="font-size:0.95rem;padding:12px" autocomplete="off">
            <div id="msn-msg-search-results" style="margin-top:8px;max-height:350px;overflow-y:auto"></div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Close</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        var input = document.getElementById('msn-msg-search-input');
        input.focus();
        input.addEventListener('input', () => {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(async () => {
                var q = input.value.trim();
                var resultsEl = document.getElementById('msn-msg-search-results');
                if (!resultsEl || !q) return;
                resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px">Searching...</div>';

                var results;
                try {
                    results = isDM === 'true' || isDM === true
                        ? await this._loadDMMessages(channelId, null, q)
                        : await this._loadMessages(channelId, null, q);
                } catch (e) { results = []; }

                if (!Array.isArray(results) || results.length === 0) {
                    resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px">No results found.</div>';
                    return;
                }

                resultsEl.innerHTML = results.map(m => `
                    <div class="msn-search-result" onclick="this.closest('.msn-modal-overlay').remove()">
                        <div class="msn-pinned-meta">${new Date(m.created_at).toLocaleString()}</div>
                        <div class="msn-pinned-content">${this._renderMarkdown(m.content || '')}</div>
                    </div>`).join('');
            }, 400);
        });
    },

    // ── Space Settings ───────────────────────────────────────────
    async _showSpaceSettings(spaceId) {
        var space = this.spaces.find(s => s.id === spaceId);
        if (!space) return;

        var roles = await this._api('GET', '/spaces/' + spaceId + '/members');
        var invites = [];
        try { invites = await this._api('GET', '/spaces/' + spaceId + '/invites'); } catch (e) {}

        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal msn-settings-modal">
            <div class="msn-settings-sidebar">
                <div class="msn-settings-section-label">Space Settings</div>
                <button class="msn-settings-tab active" data-tab="overview" onclick="MessengerPage._switchSettingsTab(this,'overview')">Overview</button>
                <button class="msn-settings-tab" data-tab="roles" onclick="MessengerPage._switchSettingsTab(this,'roles')">Roles</button>
                <button class="msn-settings-tab" data-tab="members" onclick="MessengerPage._switchSettingsTab(this,'members')">Members</button>
                <button class="msn-settings-tab" data-tab="invites" onclick="MessengerPage._switchSettingsTab(this,'invites')">Invites</button>
                <button class="msn-settings-tab" data-tab="bans" onclick="MessengerPage._switchSettingsTab(this,'bans')">Bans</button>
                <div class="msn-settings-section-label" style="margin-top:16px">Integrations</div>
                <button class="msn-settings-tab" data-tab="webhooks" onclick="MessengerPage._switchSettingsTab(this,'webhooks')">Webhooks</button>
                <div style="margin-top:auto;padding-top:16px">
                    <button class="msn-btn msn-btn-danger" style="width:100%" onclick="MessengerPage._deleteSpace('${spaceId}');this.closest('.msn-modal-overlay').remove()">Delete Space</button>
                </div>
            </div>
            <div class="msn-settings-content">
                <button class="msn-settings-close" onclick="this.closest('.msn-modal-overlay').remove()">✕</button>

                <div id="msn-tab-overview" class="msn-settings-pane">
                    <h2>Overview</h2>
                    <label>Space Name</label>
                    <input type="text" id="msn-space-name-edit" value="${this._esc(space.name)}" maxlength="100">
                    <label>Description</label>
                    <textarea id="msn-space-desc-edit" rows="3" style="width:100%">${this._esc(space.description || '')}</textarea>
                    <label style="display:flex;align-items:center;gap:8px;margin-top:12px">
                        <input type="checkbox" id="msn-space-public" ${space.is_public ? 'checked' : ''}>
                        <span>Public Space (discoverable)</span>
                    </label>
                    <div class="msn-modal-actions" style="margin-top:16px">
                        <button class="msn-btn msn-btn-primary" onclick="MessengerPage._saveSpaceOverview('${spaceId}')">Save Changes</button>
                    </div>
                </div>

                <div id="msn-tab-roles" class="msn-settings-pane hidden">
                    <h2>Roles</h2>
                    <button class="msn-btn msn-btn-primary" style="margin-bottom:12px" onclick="MessengerPage._createRolePrompt('${spaceId}')">+ Create Role</button>
                    <div id="msn-roles-list" style="display:flex;flex-direction:column;gap:6px">Loading...</div>
                </div>

                <div id="msn-tab-members" class="msn-settings-pane hidden">
                    <h2>Members</h2>
                    <input class="msn-search-input" placeholder="Search members..." oninput="MessengerPage._filterSettingsMembers(this.value,'${spaceId}')" style="margin-bottom:8px">
                    <div id="msn-members-settings-list">Loading...</div>
                </div>

                <div id="msn-tab-invites" class="msn-settings-pane hidden">
                    <h2>Invites</h2>
                    <button class="msn-btn msn-btn-primary" style="margin-bottom:12px" onclick="MessengerPage._showInviteModal()">+ Create Invite</button>
                    <div id="msn-invites-list">${invites.length === 0
                        ? '<div style="color:var(--text-muted);font-size:0.9rem">No active invites.</div>'
                        : invites.map(inv => `<div class="msn-invite-row">
                            <span style="font-family:monospace;font-size:0.9rem">${this._esc(inv.code)}</span>
                            <span style="color:var(--text-muted);font-size:0.8rem">${inv.uses} uses</span>
                            <button class="msn-btn msn-btn-secondary" onclick="navigator.clipboard.writeText('${window.location.origin}/messenger?invite=${inv.code}');MessengerPage._toast('Copied!')">Copy</button>
                            <button class="msn-msg-action-btn danger" onclick="MessengerPage._revokeInvite('${inv.code}',this.closest('.msn-invite-row'))">Revoke</button>
                          </div>`).join('')}
                    </div>
                </div>

                <div id="msn-tab-bans" class="msn-settings-pane hidden">
                    <h2>Bans</h2>
                    <div style="color:var(--text-muted);font-size:0.9rem">Right-click a member to ban them. Banned users can be unbanned via the API.</div>
                </div>

                <div id="msn-tab-webhooks" class="msn-settings-pane hidden">
                    <h2>Webhooks</h2>
                    <div style="color:var(--text-muted);font-size:0.9rem">Select a channel then use the channel context menu to manage webhooks.</div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        // Load roles and members async
        this._loadSettingsRoles(spaceId);
        this._loadSettingsMembers(spaceId);
    },

    _switchSettingsTab(btn, tabId) {
        btn.closest('.msn-settings-modal').querySelectorAll('.msn-settings-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        btn.closest('.msn-settings-modal').querySelectorAll('.msn-settings-pane').forEach(p => p.classList.add('hidden'));
        document.getElementById('msn-tab-' + tabId)?.classList.remove('hidden');
    },

    async _loadSettingsRoles(spaceId) {
        var roles = await this._api('GET', '/spaces/' + spaceId + '/roles').catch(() => []);
        if (!Array.isArray(roles)) roles = [];
        var el = document.getElementById('msn-roles-list');
        if (!el) return;
        el.innerHTML = roles.map(r => `<div class="msn-role-row">
            <span class="msn-role-dot" style="background:${this._esc(r.color || '#99aab5')}"></span>
            <span style="flex:1;font-weight:600">${this._esc(r.name)}</span>
            <span style="color:var(--text-muted);font-size:0.8rem">${r.is_default ? '@everyone' : ''}</span>
            ${!r.is_default ? `<button class="msn-msg-action-btn danger" onclick="MessengerPage._deleteRole('${r.id}',this.closest('.msn-role-row'))">🗑️</button>` : ''}
        </div>`).join('') || '<div style="color:var(--text-muted);font-size:0.9rem">No roles yet.</div>';
    },

    async _loadSettingsMembers(spaceId) {
        var members = this.members[spaceId] || await this._api('GET', '/spaces/' + spaceId + '/members').catch(() => []);
        var el = document.getElementById('msn-members-settings-list');
        if (!el) return;
        el.innerHTML = members.map(m => {
            var cached = this.memberCache[m.user_id];
            var name = m.nickname || (cached?.display_name || cached?.username) || m.user_id.slice(0, 8);
            return `<div class="msn-member-settings-row" data-name="${this._esc(name.toLowerCase())}">
                <div class="msn-member-avatar" style="width:32px;height:32px;font-size:0.75rem">${name.charAt(0).toUpperCase()}</div>
                <span style="flex:1;font-size:0.9rem">${this._esc(name)}</span>
                <button class="msn-btn msn-btn-secondary" style="font-size:0.8rem;padding:4px 8px"
                    onclick="MessengerPage._kickMember('${spaceId}','${m.user_id}',this.closest('.msn-member-settings-row'))">Kick</button>
                <button class="msn-btn msn-btn-danger" style="font-size:0.8rem;padding:4px 8px"
                    onclick="MessengerPage._banMember('${spaceId}','${m.user_id}',this.closest('.msn-member-settings-row'))">Ban</button>
            </div>`;
        }).join('') || '<div style="color:var(--text-muted);font-size:0.9rem">No members found.</div>';
    },

    _filterSettingsMembers(q) {
        document.querySelectorAll('.msn-member-settings-row').forEach(row => {
            row.style.display = !q || row.dataset.name.includes(q.toLowerCase()) ? '' : 'none';
        });
    },

    async _saveSpaceOverview(spaceId) {
        var name = document.getElementById('msn-space-name-edit')?.value?.trim();
        var desc = document.getElementById('msn-space-desc-edit')?.value?.trim();
        var isPublic = document.getElementById('msn-space-public')?.checked;
        if (!name) return this._toast('Name is required');
        var res = await this._api('PUT', '/spaces/' + spaceId, { name, description: desc, is_public: isPublic });
        if (res && !res.error) { this._toast('Saved!'); await this._loadSpaces(); this._renderSpaceList(); }
        else this._toast(res?.error || 'Failed to save');
    },

    async _createRolePrompt(spaceId) {
        var name = prompt('Role name:');
        if (!name) return;
        var color = prompt('Role color (hex, e.g. #ff5500):', '#99aab5') || '#99aab5';
        var res = await this._api('POST', '/spaces/' + spaceId + '/roles', { name, color });
        if (res && !res.error) { this._toast('Role created!'); this._loadSettingsRoles(spaceId); }
        else this._toast(res?.error || 'Failed');
    },

    async _deleteRole(roleId, row) {
        if (!confirm('Delete this role?')) return;
        var res = await this._api('DELETE', '/roles/' + roleId);
        if (res && !res.error) row.remove();
        else this._toast(res?.error || 'Failed');
    },

    async _kickMember(spaceId, userId, row) {
        if (!confirm('Kick this member?')) return;
        var res = await this._api('POST', '/spaces/' + spaceId + '/kick/' + userId);
        if (res && !res.error) row.remove();
        else this._toast(res?.error || 'Failed');
    },

    async _banMember(spaceId, userId, row) {
        var reason = prompt('Ban reason (optional):') || '';
        var res = await this._api('POST', '/spaces/' + spaceId + '/ban/' + userId, { reason });
        if (res && !res.error) { this._toast('User banned'); row.remove(); }
        else this._toast(res?.error || 'Failed');
    },

    async _revokeInvite(code, row) {
        var res = await this._api('DELETE', '/invites/' + code);
        if (res && !res.error) { this._toast('Invite revoked'); row?.remove(); }
        else this._toast(res?.error || 'Failed');
    },

    // ── Browse Public Spaces ─────────────────────────────────────
    async _showBrowseSpaces() {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal" style="width:640px">
            <h2>🧭 Browse Public Spaces</h2>
            <p>Join public communities or search for one below.</p>
            <input class="msn-search-input" id="msn-browse-search" placeholder="Search spaces..." style="margin-bottom:12px" oninput="MessengerPage._filterBrowseResults(this.value)">
            <div id="msn-browse-results" style="max-height:420px;overflow-y:auto">
                <div style="color:var(--text-muted);font-size:0.85rem;padding:8px">Loading...</div>
            </div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Close</button>
                <button class="msn-btn msn-btn-secondary" onclick="MessengerPage._showJoinByInviteModal()">Join via Invite Code</button>
                <button class="msn-btn msn-btn-primary" onclick="this.closest('.msn-modal-overlay').remove();MessengerPage._showCreateSpaceModal()">Create a Space</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

        try {
            var spaces = await this._api('GET', '/spaces/public/browse');
            this._allBrowseSpaces = Array.isArray(spaces) ? spaces : [];
            this._renderBrowseResults(this._allBrowseSpaces);
        } catch (e) {
            var el = document.getElementById('msn-browse-results');
            if (el) el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px">Failed to load spaces.</div>';
        }
    },

    _filterBrowseResults(q) {
        if (!this._allBrowseSpaces) return;
        var filtered = q
            ? this._allBrowseSpaces.filter(s => (s.name + ' ' + (s.description || '')).toLowerCase().includes(q.toLowerCase()))
            : this._allBrowseSpaces;
        this._renderBrowseResults(filtered);
    },

    _renderBrowseResults(spaces) {
        var el = document.getElementById('msn-browse-results');
        if (!el) return;
        if (!spaces || spaces.length === 0) {
            el.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px">No public spaces found.</div>';
            return;
        }
        el.innerHTML = spaces.map(s => `<div class="msn-browse-card">
            <div class="msn-browse-icon">
                ${s.icon ? `<img src="${this._esc(s.icon)}" alt="">` : s.name.charAt(0).toUpperCase()}
            </div>
            <div class="msn-browse-info">
                <div class="msn-browse-name">${this._esc(s.name)}</div>
                ${s.description ? `<div class="msn-browse-desc">${this._esc(s.description)}</div>` : ''}
                <div class="msn-browse-meta">${s.member_count || 0} members</div>
            </div>
            <button class="msn-btn msn-btn-primary" style="flex-shrink:0"
                onclick="MessengerPage._joinPublicSpace('${s.id}',this)">Join</button>
        </div>`).join('');
    },

    async _joinPublicSpace(spaceId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Joining...'; }
        var res = await this._api('POST', '/spaces/' + spaceId + '/join', { invite_code: '' });
        if (res && !res.error) {
            this._toast('Joined space!');
            document.querySelector('.msn-modal-overlay')?.remove();
            await this._loadSpaces();
            if (this.socket) this.socket.emit('subscribe_spaces');
            this._renderSpaceList();
            this._selectSpace(spaceId);
        } else {
            this._toast(res?.error || 'Failed to join');
            if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
        }
    },

    // ── Space modals ─────────────────────────────────────────────
    _showCreateSpaceModal() {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Create a Space</h2>
            <p>Your Space is where you and your friends hang out.</p>
            <label>Space Name</label>
            <input type="text" id="msn-space-name" placeholder="My Awesome Space" maxlength="100">
            <label>Description (optional)</label>
            <input type="text" id="msn-space-desc" placeholder="What's this space about?" maxlength="200">
            <label style="display:flex;align-items:center;gap:8px;margin-top:12px">
                <input type="checkbox" id="msn-space-public-new">
                <span>Make this space public (discoverable)</span>
            </label>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Cancel</button>
                <button class="msn-btn msn-btn-primary" onclick="MessengerPage._createSpace()">Create Space</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-space-name')?.focus();
    },

    async _createSpace() {
        var name     = document.getElementById('msn-space-name')?.value?.trim();
        var desc     = document.getElementById('msn-space-desc')?.value?.trim();
        var isPublic = document.getElementById('msn-space-public-new')?.checked;
        if (!name) return this._toast('Space name is required');

        var res = await this._api('POST', '/spaces', { name, description: desc, is_public: isPublic });
        if (res && res.error) return this._toast(res.error);

        document.querySelector('.msn-modal-overlay')?.remove();
        this.spaces.push(res);
        if (this.socket) this.socket.emit('subscribe_spaces');
        this._renderSpaceList();
        this._selectSpace(res.id);
        this._toast('Space created!');
    },

    _showJoinByInviteModal() {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Join a Space</h2>
            <p>Enter an invite code or paste an invite link.</p>
            <label>Invite Code or Link</label>
            <input type="text" id="msn-join-code" placeholder="e.g. ABC12345" style="font-family:monospace">
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Cancel</button>
                <button class="msn-btn msn-btn-primary" onclick="MessengerPage._joinByCode()">Join Space</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-join-code')?.focus();
    },

    async _joinByCode() {
        var raw = document.getElementById('msn-join-code')?.value?.trim() || '';
        // Extract code from URL if pasted as full link
        var code = raw.includes('invite=') ? raw.split('invite=').pop().split('&')[0] : raw;
        if (!code) return this._toast('Please enter an invite code');
        await this._acceptInviteByCode(code);
        document.querySelector('.msn-modal-overlay')?.remove();
    },

    async _acceptInviteByCode(code) {
        var info = await this._api('GET', '/invites/' + code).catch(() => null);
        if (!info || info.error) return this._toast('Invalid or expired invite');

        var res = await this._api('POST', '/invites/' + code + '/use');
        if (res && !res.error) {
            this._toast('Joined ' + (info.space?.name || 'space') + '!');
            await this._loadSpaces();
            this._renderSpaceList();
            if (res.spaceId) this._selectSpace(res.spaceId);
        } else {
            this._toast(res?.error || 'Failed to join');
        }
    },

    _showCreateChannelModal(categoryId) {
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>Create Channel</h2>
            <label>Channel Type</label>
            <select id="msn-ch-type">
                <option value="text">📝 Text Channel</option>
                <option value="announcement">📢 Announcement</option>
                <option value="voice">🔊 Voice Channel</option>
                <option value="forum">💬 Forum</option>
            </select>
            <label>Channel Name</label>
            <input type="text" id="msn-ch-name" placeholder="new-channel" maxlength="100">
            <label>Topic (optional)</label>
            <input type="text" id="msn-ch-topic" placeholder="What's this channel for?" maxlength="200">
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Cancel</button>
                <button class="msn-btn msn-btn-primary" onclick="MessengerPage._createChannel('${categoryId || ''}')">Create Channel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('msn-ch-name')?.focus();
    },

    async _createChannel(categoryId) {
        var name  = document.getElementById('msn-ch-name')?.value?.trim();
        var type  = document.getElementById('msn-ch-type')?.value;
        var topic = document.getElementById('msn-ch-topic')?.value?.trim();
        if (!name) return this._toast('Channel name is required');
        var res = await this._api('POST', '/spaces/' + this.activeSpaceId + '/channels', { name, type, topic, category_id: categoryId || null });
        if (res && res.error) return this._toast(res.error);
        document.querySelector('.msn-modal-overlay')?.remove();
        this._toast('Channel created!');
        
        // Ensure local list has it immediately and we select it, or just let it render
        var exists = (this.channels[this.activeSpaceId] || []).find(c => c.id === res.id);
        if (!exists) this._onChannelCreated(res);
    },

    async _deleteChannel(channelId) {
        if (!confirm('Delete this channel? This cannot be undone.')) return;
        var res = await this._api('DELETE', '/channels/' + channelId);
        if (res && res.error) this._toast(res.error);
    },

    async _showInviteModal() {
        var res = await this._api('POST', '/spaces/' + this.activeSpaceId + '/invites', { max_age: 86400, max_uses: 0 });
        if (res && res.error) return this._toast(res.error);

        var link = window.location.origin + '/messenger?invite=' + res.code;
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.innerHTML = `<div class="msn-modal">
            <h2>🔗 Invite People</h2>
            <p>Share this link to invite people to your space. Expires in 24 hours.</p>
            <label>Invite Code</label>
            <div class="msn-invite-code"><span>${this._esc(res.code)}</span></div>
            <label style="margin-top:8px">Invite Link</label>
            <div class="msn-invite-code">
                <span style="font-size:0.8rem;word-break:break-all">${this._esc(link)}</span>
                <button onclick="navigator.clipboard.writeText('${this._esc(link)}').then(()=>MessengerPage._toast('Copied!'))">Copy</button>
            </div>
            <div class="msn-modal-actions">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Done</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    async _deleteSpace(spaceId) {
        if (!confirm('Permanently delete this space? All channels, messages, and members will be lost.')) return;
        var res = await this._api('DELETE', '/spaces/' + spaceId);
        if (res && !res.error) {
            this.spaces = this.spaces.filter(s => s.id !== spaceId);
            if (this.activeSpaceId === spaceId) { this.activeSpaceId = null; this._clearMessageArea(); }
            this._renderSpaceList();
            this._selectDMs();
            this._toast('Space deleted');
        } else this._toast(res?.error || 'Failed to delete');
    },

    async _leaveSpace(spaceId) {
        if (!confirm('Leave this space?')) return;
        var res = await this._api('POST', '/spaces/' + spaceId + '/leave');
        if (res && !res.error) {
            this.spaces = this.spaces.filter(s => s.id !== spaceId);
            if (this.activeSpaceId === spaceId) { this.activeSpaceId = null; this._clearMessageArea(); }
            this._renderSpaceList();
            this._selectDMs();
            this._toast('Left space');
        } else this._toast(res?.error || 'Failed to leave');
    },

    // ── Lightbox ─────────────────────────────────────────────────
    _lightbox(url) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:5000;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
        overlay.innerHTML = `<img src="${this._esc(url)}" style="max-width:90vw;max-height:90vh;border-radius:4px;box-shadow:0 8px 32px rgba(0,0,0,.5)">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    },

    // ── Sidebar Footer ───────────────────────────────────────────
    _renderSidebarFooter() {
        var el = document.getElementById('msn-sidebar-footer');
        if (!el || !App.currentUser) return;

        var user = App.currentUser;
        var initials = (user.display_name || user.username || '?').charAt(0).toUpperCase();
        var avatarHtml = user.avatar
            ? `<img src="${this._esc(user.avatar)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent,#5865f2);display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>`;

        el.innerHTML = `
            <div style="position:relative;cursor:pointer" onclick="MessengerPage._showUserPopout('${user.id}',event)">
                ${avatarHtml}
                <span class="msn-dm-status-dot online" style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border:2px solid var(--bg-secondary)"></span>
            </div>
            <div class="msn-user-tag" style="cursor:pointer" onclick="MessengerPage._showUserPopout('${user.id}',event)">
                <div class="msn-uname">${this._esc(user.display_name || user.username)}</div>
                <div class="msn-discrim">#${this._esc(user.username)}</div>
            </div>
            <button class="msn-footer-btn" title="User Settings" onclick="MessengerPage._showUserSettingsMenu(event)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            </button>`;
    },

    _showUserSettingsMenu(e) {
        var reqCount = this._pendingRequests.length;
        this._showContextMenu(e.clientX, e.clientY, [
            { label: '👤 View Profile', action: () => { Router.go('/profile'); } },
            { label: '✏️ Edit Profile', action: () => { if (typeof ProfilePage !== 'undefined') ProfilePage.showEditModal(App.currentUser); } },
            { separator: true },
            { label: '💬 Messenger Settings', action: () => this._showMessengerSettings() },
            { label: reqCount > 0 ? `📨 Message Requests (${reqCount})` : '📨 Message Requests', action: () => this._showMessageRequests() },
            { separator: true },
            { label: '🎨 Appearance', action: () => App.showAppearanceModal() },
            { label: '🔔 Notifications', action: () => this._requestNotificationPermission(true) },
            { separator: true },
            { label: '🚪 Logout', danger: true, action: () => {
                if (typeof App !== 'undefined' && App.logout) App.logout();
            }}
        ]);
    },

    // ── Messenger Settings & Message Requests ────────────────────

    async _loadMessengerSettings() {
        try {
            var s = await this._api('GET', '/settings');
            if (s && !s.error) this._messengerSettings = s;
        } catch (e) {}
    },

    async _loadMessageRequests() {
        try {
            var reqs = await this._api('GET', '/requests');
            if (Array.isArray(reqs)) {
                this._pendingRequests = reqs;
                this._updateRequestBadge();
            }
        } catch (e) {}
    },

    _updateRequestBadge() {
        var count = this._pendingRequests.length;
        var badge = document.getElementById('msn-req-badge');
        var btn = document.getElementById('msn-sidebar-footer')?.querySelector('.msn-footer-btn');
        if (!badge && count > 0 && btn) {
            badge = document.createElement('span');
            badge.id = 'msn-req-badge';
            badge.className = 'msn-req-badge';
            btn.style.position = 'relative';
            btn.appendChild(badge);
        }
        if (badge) {
            if (count > 0) { badge.textContent = count > 9 ? '9+' : count; badge.style.display = 'flex'; }
            else badge.style.display = 'none';
        }
    },

    _onMessageRequest(data) {
        this._loadMessageRequests();
        this._toast('You have a new message request!', 4000);
    },

    async _showMessengerSettings() {
        var s = this._messengerSettings || {};
        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.id = 'msn-messenger-settings-overlay';
        overlay.innerHTML = `<div class="msn-modal msn-settings-modal" style="width:700px;max-width:95vw">
            <div class="msn-settings-sidebar">
                <div class="msn-settings-section-label">Messenger Settings</div>
                <button class="msn-settings-tab active" data-tab="privacy" onclick="MessengerPage._switchSettingsTab(this,'mss-privacy')">Privacy & Safety</button>
                <button class="msn-settings-tab" data-tab="notifications" onclick="MessengerPage._switchSettingsTab(this,'mss-notifications')">Notifications</button>
                <button class="msn-settings-tab" data-tab="appearance" onclick="MessengerPage._switchSettingsTab(this,'mss-appearance')">Text & Appearance</button>
                <button class="msn-settings-tab" data-tab="advanced" onclick="MessengerPage._switchSettingsTab(this,'mss-advanced')">Advanced</button>
            </div>
            <div class="msn-settings-content">
                <button class="msn-settings-close" onclick="this.closest('.msn-modal-overlay').remove()">✕</button>

                <!-- Privacy & Safety -->
                <div id="msn-tab-mss-privacy" class="msn-settings-pane">
                    <h2>Privacy &amp; Safety</h2>

                    <div class="msn-setting-group">
                        <div class="msn-setting-label">Who can send you direct messages</div>
                        <div class="msn-setting-desc">Control who is allowed to open a DM conversation with you.</div>
                        <select class="msn-setting-select" id="mss-allow-dms" onchange="MessengerPage._saveSetting('allow_dms',this.value)">
                            <option value="everyone" ${s.allow_dms==='everyone'?'selected':''}>Everyone</option>
                            <option value="friends"  ${s.allow_dms==='friends'?'selected':''}>Friends Only</option>
                            <option value="nobody"   ${s.allow_dms==='nobody'?'selected':''}>Nobody</option>
                        </select>
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('message_requests','Enable Message Requests',
                            'When on, DMs from non-friends become requests you can accept or decline.',
                            s.message_requests)}
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('auto_accept_requests','Auto-Accept Message Requests',
                            'Automatically accept all incoming message requests without review.',
                            s.auto_accept_requests)}
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('show_online_status','Show Online Status',
                            'Let other users see when you are online or active.',
                            s.show_online_status)}
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('show_read_receipts','Show Read Receipts',
                            'Let people in DMs know when you have read their messages.',
                            s.show_read_receipts)}
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('allow_friend_requests','Allow Friend Requests via DM',
                            'Allow users to send you friend requests through direct messages.',
                            s.allow_friend_requests)}
                    </div>
                </div>

                <!-- Notifications -->
                <div id="msn-tab-mss-notifications" class="msn-settings-pane hidden">
                    <h2>Notifications</h2>

                    <div class="msn-setting-group">
                        <div class="msn-setting-label">DM Notification Level</div>
                        <div class="msn-setting-desc">Choose how you are notified about direct messages.</div>
                        <select class="msn-setting-select" id="mss-dm-notif" onchange="MessengerPage._saveSetting('dm_notifications',this.value)">
                            <option value="all"      ${s.dm_notifications==='all'?'selected':''}>All Messages</option>
                            <option value="mentions" ${s.dm_notifications==='mentions'?'selected':''}>Only Mentions</option>
                            <option value="none"     ${s.dm_notifications==='none'?'selected':''}>Nothing</option>
                        </select>
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('notification_sounds','Notification Sounds',
                            'Play a sound when you receive a new message.',
                            s.notification_sounds)}
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('notification_previews','Message Preview in Notifications',
                            'Show message content in desktop and push notifications.',
                            s.notification_previews)}
                    </div>
                </div>

                <!-- Appearance -->
                <div id="msn-tab-mss-appearance" class="msn-settings-pane hidden">
                    <h2>Text &amp; Appearance</h2>

                    <div class="msn-setting-group">
                        ${this._settingToggle('compact_mode','Compact Mode',
                            'Display messages in a condensed layout with less spacing.',
                            s.compact_mode)}
                    </div>

                    <div class="msn-setting-group">
                        <div class="msn-setting-label">Emoji Size</div>
                        <div class="msn-setting-desc">Size of emoji displayed in messages.</div>
                        <select class="msn-setting-select" id="mss-emoji-size" onchange="MessengerPage._saveSetting('emoji_size',this.value)">
                            <option value="small"  ${s.emoji_size==='small'?'selected':''}>Small</option>
                            <option value="medium" ${s.emoji_size==='medium'||!s.emoji_size?'selected':''}>Medium</option>
                            <option value="large"  ${s.emoji_size==='large'?'selected':''}>Large</option>
                        </select>
                    </div>

                    <div class="msn-setting-group">
                        ${this._settingToggle('link_previews','Link Previews',
                            'Show a preview card when a message contains a URL.',
                            s.link_previews)}
                    </div>
                </div>

                <!-- Advanced -->
                <div id="msn-tab-mss-advanced" class="msn-settings-pane hidden">
                    <h2>Advanced</h2>

                    <div class="msn-setting-group">
                        ${this._settingToggle('developer_mode','Developer Mode',
                            'Adds "Copy ID" to context menus for messages, users, and channels.',
                            s.developer_mode)}
                    </div>

                    <div class="msn-setting-group" style="background:var(--bg-tertiary,#2b2d31);border-radius:8px;padding:12px 16px;margin-top:24px">
                        <div class="msn-setting-label" style="color:#ed4245">Danger Zone</div>
                        <div class="msn-setting-desc" style="margin-bottom:8px">These actions cannot be undone easily.</div>
                        <button class="msn-btn msn-btn-danger" onclick="MessengerPage._clearAllDMHistory()">Clear All DM History (local)</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    _settingToggle(key, label, desc, value) {
        var checked = value === 1 || value === true || value === '1' ? 'checked' : '';
        return `<div class="msn-setting-row">
            <div class="msn-setting-row-text">
                <div class="msn-setting-label">${label}</div>
                <div class="msn-setting-desc">${desc}</div>
            </div>
            <label class="msn-toggle">
                <input type="checkbox" ${checked} onchange="MessengerPage._saveSetting('${key}',this.checked?1:0)">
                <span class="msn-toggle-slider"></span>
            </label>
        </div>`;
    },

    async _saveSetting(key, value) {
        try {
            var body = {};
            body[key] = value;
            var updated = await this._api('PUT', '/settings', body);
            if (updated && !updated.error) {
                this._messengerSettings = updated;
                this._toast('Setting saved');
            } else {
                this._toast(updated?.error || 'Failed to save setting');
            }
        } catch (e) {
            this._toast('Failed to save setting');
        }
    },

    async _showMessageRequests() {
        await this._loadMessageRequests();
        var reqs = this._pendingRequests;

        var overlay = document.createElement('div');
        overlay.className = 'msn-modal-overlay';
        overlay.id = 'msn-requests-overlay';

        var listHtml = '';
        if (reqs.length === 0) {
            listHtml = '<div style="color:var(--text-muted);padding:24px 0;text-align:center;font-size:0.9rem">No pending message requests.</div>';
        } else {
            listHtml = reqs.map(r => {
                var sender = r.sender || {};
                var initials = (sender.display_name || sender.username || '?').charAt(0).toUpperCase();
                return `<div class="msn-request-row" id="msn-req-${r.id}">
                    <div class="msn-dm-avatar" style="width:40px;height:40px;font-size:0.9rem;flex-shrink:0">
                        ${sender.avatar ? `<img src="${this._esc(sender.avatar)}" alt="">` : initials}
                        <span class="msn-dm-status-dot ${sender.status||'offline'}"></span>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:0.9rem">${this._esc(sender.display_name || sender.username || 'Unknown')}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">@${this._esc(sender.username || r.from_user_id)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0">
                        <button class="msn-btn msn-btn-primary" style="padding:6px 14px;font-size:0.8rem"
                            onclick="MessengerPage._acceptRequest('${r.id}')">Accept</button>
                        <button class="msn-btn msn-btn-danger" style="padding:6px 14px;font-size:0.8rem"
                            onclick="MessengerPage._declineRequest('${r.id}')">Decline</button>
                    </div>
                </div>`;
            }).join('');
        }

        overlay.innerHTML = `<div class="msn-modal" style="width:500px">
            <h2 style="margin-bottom:4px">Message Requests</h2>
            <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">People who want to message you. You will not receive their messages until you accept.</p>
            <div id="msn-requests-list">${listHtml}</div>
            <div class="msn-modal-actions" style="margin-top:16px">
                <button class="msn-btn msn-btn-secondary" onclick="this.closest('.msn-modal-overlay').remove()">Close</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    },

    async _acceptRequest(reqId) {
        try {
            var result = await this._api('POST', '/requests/' + reqId + '/accept');
            if (result && result.dm_channel) {
                document.getElementById('msn-req-' + reqId)?.remove();
                this._pendingRequests = this._pendingRequests.filter(r => r.id !== reqId);
                this._updateRequestBadge();

                // Close the request modal and open the DM
                document.getElementById('msn-requests-overlay')?.remove();
                await this._loadDMs();
                this._selectDMs();
                await this._openDM(result.dm_channel.id);
            } else {
                this._toast(result?.error || 'Failed to accept request');
            }
        } catch (e) {
            this._toast('Failed to accept request');
        }
    },

    async _declineRequest(reqId) {
        try {
            await this._api('POST', '/requests/' + reqId + '/decline');
            document.getElementById('msn-req-' + reqId)?.remove();
            this._pendingRequests = this._pendingRequests.filter(r => r.id !== reqId);
            this._updateRequestBadge();
            if (this._pendingRequests.length === 0) {
                var list = document.getElementById('msn-requests-list');
                if (list) list.innerHTML = '<div style="color:var(--text-muted);padding:24px 0;text-align:center;font-size:0.9rem">No pending message requests.</div>';
            }
            this._toast('Request declined');
        } catch (e) {
            this._toast('Failed to decline request');
        }
    },

    _clearAllDMHistory() {
        // This is a local-only action — clears cached messages, not server data
        this.messages = [];
        this.dmList = [];
        this._toast('Local DM cache cleared');
    },

    // ── Desktop Notifications ────────────────────────────────────
    _requestNotificationPermission(showPrompt) {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') return;
        if (Notification.permission === 'denied') {
            if (showPrompt) this._toast('Notifications are blocked. Enable them in browser settings.');
            return;
        }
        if (showPrompt || Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },

    _sendDesktopNotification(title, body) {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        if (document.hasFocus()) return; // Don't notify if window is focused
        try {
            new Notification('Venary · ' + title, {
                body: body,
                icon: '/favicon.ico'
            });
        } catch (e) {}
    },

    // ── Context Menu ─────────────────────────────────────────────
    _showContextMenu(x, y, items) {
        document.querySelectorAll('.msn-ctx-menu').forEach(el => el.remove());
        var menu = document.createElement('div');
        menu.className = 'msn-ctx-menu';

        items.forEach(item => {
            if (item.show === false) return;
            if (item.separator) {
                menu.insertAdjacentHTML('beforeend', '<div class="msn-ctx-separator"></div>');
                return;
            }
            var div = document.createElement('div');
            div.className = 'msn-ctx-item' + (item.danger ? ' danger' : '');
            div.textContent = item.label;
            div.addEventListener('click', () => { item.action(); menu.remove(); });
            menu.appendChild(div);
        });

        document.body.appendChild(menu);

        // Clamp to viewport
        if (x + menu.offsetWidth > window.innerWidth) x = window.innerWidth - menu.offsetWidth - 8;
        if (y + menu.offsetHeight > window.innerHeight) y = window.innerHeight - menu.offsetHeight - 8;
        menu.style.left = Math.max(8, x) + 'px';
        menu.style.top  = Math.max(8, y) + 'px';

        setTimeout(() => {
            var hide = ev => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', hide); } };
            document.addEventListener('click', hide);
        }, 0);
    },

    // ── Toast ────────────────────────────────────────────────────
    _toast(message, duration) {
        duration = duration || 3000;
        var toast = document.getElementById('msn-toast');
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

    // ── Utilities ────────────────────────────────────────────────
    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _getHashParam(key) {
        return new URLSearchParams(window.location.search).get(key);
    },

    // ── Cleanup ──────────────────────────────────────────────────
    destroy() {
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        document.querySelectorAll('.msn-toast, .msn-modal-overlay, .msn-ctx-menu, .msn-user-popout, .msn-emoji-picker').forEach(el => el.remove());
    }
};
