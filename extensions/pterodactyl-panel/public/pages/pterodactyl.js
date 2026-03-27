/* =======================================
   Pterodactyl Panel Extension — Panel Page
   Live console, power controls, server selector.
   ======================================= */
var PterodactylPage = {
    _socket: null,
    _autoScroll: true,
    _status: 'offline',
    _busy: false,
    _serverId: null,
    _servers: [],

    async render(container) {
        // Access check
        try {
            const r = await API.get('/api/ext/pterodactyl-panel/access/me');
            if (!r.granted) throw new Error('no access');
        } catch {
            container.innerHTML = `
                <div class="empty-state animate-fade-up">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <h3>Access Denied</h3>
                    <p>You don't have permission to access the server panel.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="ptero-page animate-fade-up" style="max-width:1000px;margin:0 auto">
                <div class="ptero-header">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                        <div>
                            <h2 style="margin:0 0 4px;font-size:1.4rem">🖥️ Server Panel</h2>
                            <p style="margin:0;color:var(--text-muted);font-size:0.85rem">Real-time console and power controls.</p>
                        </div>
                        <div id="ptero-server-selector-wrap" style="display:none">
                            <select id="ptero-server-select" class="input-field" style="height:36px;font-size:0.85rem;min-width:200px"
                                    onchange="PterodactylPage._switchServer(this.value)">
                            </select>
                        </div>
                    </div>
                    <span id="ptero-status-badge" class="badge badge-offline">OFFLINE</span>
                </div>

                <!-- Error banner -->
                <div id="ptero-error-banner" class="ptero-error-banner" style="display:none">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span id="ptero-error-msg">Console stream unavailable.</span>
                    <button class="ptero-banner-close" onclick="PterodactylPage._dismissError()">✕</button>
                </div>

                <!-- Power controls -->
                <div class="ptero-controls animate-fade-up" style="animation-delay:0.05s">
                    <button id="ptero-btn-start" class="btn ptero-btn-start" onclick="PterodactylPage._power('start')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                        Start
                    </button>
                    <div class="ptero-stop-group">
                        <button id="ptero-btn-stop" class="btn ptero-btn-stop" onclick="PterodactylPage._power('stop')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                            Stop
                        </button>
                        <button id="ptero-btn-kill" class="btn ptero-btn-kill" onclick="PterodactylPage._power('kill')" title="Force kill">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            Kill
                        </button>
                    </div>
                    <button id="ptero-btn-restart" class="btn ptero-btn-restart" onclick="PterodactylPage._power('restart')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        Restart
                    </button>
                </div>

                <!-- Console -->
                <div class="admin-settings-card animate-fade-up" style="animation-delay:0.1s;padding:0;overflow:hidden">
                    <div class="ptero-console-toolbar">
                        <span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono)" id="ptero-console-label">console output</span>
                        <button class="btn btn-sm btn-ghost" onclick="PterodactylPage._clearConsole()" style="font-size:0.7rem;padding:2px 8px">Clear</button>
                    </div>
                    <div id="ptero-console" class="ptero-console"></div>
                </div>
            </div>`;

        // Load server list then initialise
        await this._loadServers();
    },

    // ── Server list ──────────────────────────────────────────────────────────

    async _loadServers() {
        try {
            const servers = await API.get('/api/ext/pterodactyl-panel/servers');
            this._servers = servers;

            if (!servers.length) {
                this._showError('No servers found. Check your API key in the extension settings.');
                return;
            }

            const select = document.getElementById('ptero-server-select');
            const wrap = document.getElementById('ptero-server-selector-wrap');
            if (select && wrap) {
                select.innerHTML = servers.map(s =>
                    `<option value="${App.escapeHtml(s.id)}">${App.escapeHtml(s.name)}</option>`
                ).join('');
                // Only show selector if more than one server
                if (servers.length > 1) wrap.style.display = '';
            }

            // Auto-select first server
            this._serverId = servers[0].id;
            this._updateConsoleLabel(servers[0].name);
            this._fetchStatus();
            this._connectSocket();
        } catch (err) {
            this._showError(err.message || 'Failed to load servers. Check extension settings.');
        }
    },

    _switchServer(serverId) {
        if (serverId === this._serverId) return;
        this._serverId = serverId;

        const server = this._servers.find(s => s.id === serverId);
        if (server) this._updateConsoleLabel(server.name);

        // Disconnect existing socket, clear console, reconnect for new server
        if (this._socket) { this._socket.disconnect(); this._socket = null; }
        this._clearConsole();
        this._setStatus('offline');
        this._fetchStatus();
        this._connectSocket();
    },

    _updateConsoleLabel(name) {
        const el = document.getElementById('ptero-console-label');
        if (el) el.textContent = `console — ${name}`;
    },

    // ── Status ───────────────────────────────────────────────────────────────

    async _fetchStatus() {
        if (!this._serverId) return;
        try {
            const r = await API.get(`/api/ext/pterodactyl-panel/status?server=${encodeURIComponent(this._serverId)}`);
            this._setStatus(r.status);
        } catch {
            this._setStatus('offline');
        }
    },

    _setStatus(state) {
        this._status = state;
        const badge = document.getElementById('ptero-status-badge');
        if (!badge) return;
        const MAP = {
            running:  { cls: 'badge-online',  label: 'RUNNING'  },
            offline:  { cls: 'badge-offline', label: 'OFFLINE'  },
            starting: { cls: 'badge-level',   label: 'STARTING' },
            stopping: { cls: 'badge-level',   label: 'STOPPING' },
        };
        const s = MAP[state] || MAP.offline;
        badge.className = `badge ${s.cls}`;
        badge.textContent = s.label;
    },

    // ── Socket.IO ────────────────────────────────────────────────────────────

    _connectSocket() {
        if (!this._serverId) return;
        if (this._socket) { this._socket.disconnect(); this._socket = null; }

        const socket = io('/pterodactyl-console', {
            auth: { token: API.token },
            query: { server: this._serverId },
            transports: ['websocket'],
        });
        this._socket = socket;

        socket.on('history', ({ lines }) => {
            lines.forEach(l => this._appendLine(l, false));
            this._scrollToBottom();
        });
        socket.on('console:line', ({ line }) => this._appendLine(line, true));
        socket.on('status:update', ({ state }) => this._setStatus(state));
        socket.on('console:error', ({ message }) => this._showError(message || 'Console stream unavailable.'));
        socket.on('connect_error', (err) => this._showError(err.message || 'Connection failed.'));
        socket.on('disconnect', () => this._showError('Disconnected from console stream.'));
    },

    // ── Console ──────────────────────────────────────────────────────────────

    _appendLine(line, scroll) {
        const el = document.getElementById('ptero-console');
        if (!el) return;
        const lines = el.querySelectorAll('.ptero-line');
        if (lines.length >= 500) lines[0].remove();
        const div = document.createElement('div');
        div.className = 'ptero-line';
        div.textContent = line;
        el.appendChild(div);
        if (scroll && this._autoScroll) this._scrollToBottom();
    },

    _scrollToBottom() {
        const el = document.getElementById('ptero-console');
        if (el) el.scrollTop = el.scrollHeight;
    },

    _clearConsole() {
        const el = document.getElementById('ptero-console');
        if (el) el.innerHTML = '';
    },

    // ── Power ────────────────────────────────────────────────────────────────

    async _power(action) {
        if (this._busy || !this._serverId) return;
        this._setBusy(true);
        try {
            await API.post('/api/ext/pterodactyl-panel/power', { action, server: this._serverId });
            App.showToast(`Server ${action} signal sent.`, 'success');
        } catch (err) {
            App.showToast(err.message || `Failed to send ${action} signal.`, 'error');
        } finally {
            this._setBusy(false);
        }
    },

    _setBusy(busy) {
        this._busy = busy;
        ['start', 'stop', 'kill', 'restart'].forEach(id => {
            const btn = document.getElementById(`ptero-btn-${id}`);
            if (btn) btn.disabled = busy;
        });
    },

    // ── Error banner ─────────────────────────────────────────────────────────

    _showError(msg) {
        const banner = document.getElementById('ptero-error-banner');
        const msgEl = document.getElementById('ptero-error-msg');
        if (!banner) return;
        if (msgEl) msgEl.textContent = msg;
        banner.style.display = 'flex';
        this._setBusy(true);
    },

    _dismissError() {
        const banner = document.getElementById('ptero-error-banner');
        if (banner) banner.style.display = 'none';
        this._setBusy(false);
    },

    destroy() {
        if (this._socket) { this._socket.disconnect(); this._socket = null; }
        this._busy = false;
        this._autoScroll = true;
        this._serverId = null;
        this._servers = [];
    },
};

document.addEventListener('scroll', function (e) {
    const el = document.getElementById('ptero-console');
    if (!el || e.target !== el) return;
    PterodactylPage._autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}, true);
