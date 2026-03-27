/* =======================================
   Pterodactyl Panel Extension — Panel Page
   Live console, command input, power controls.
   ======================================= */
var PterodactylPage = {
    _socket: null,
    _autoScroll: true,
    _status: 'offline',
    _busy: false,
    _serverId: null,
    _servers: [],
    _cmdHistory: [],
    _cmdHistoryIdx: -1,

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
            <div class="ptero-page animate-fade-up" style="max-width:1040px;margin:0 auto">

                <!-- Top bar -->
                <div class="ptero-topbar">
                    <div class="ptero-topbar-left">
                        <h2 class="ptero-title">Server Panel</h2>
                        <select id="ptero-server-select" class="ptero-server-select" style="display:none"
                                onchange="PterodactylPage._switchServer(this.value)"></select>
                    </div>
                    <div id="ptero-status-pill" class="ptero-status-pill ptero-status-offline">
                        <span class="ptero-status-dot"></span>
                        <span id="ptero-status-text">OFFLINE</span>
                    </div>
                </div>

                <!-- Error banner -->
                <div id="ptero-error-banner" class="ptero-error-banner" style="display:none">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span id="ptero-error-msg">Console stream unavailable.</span>
                    <button class="ptero-banner-close" onclick="PterodactylPage._dismissError()">✕</button>
                </div>

                <!-- Main panel card -->
                <div class="ptero-panel-card animate-fade-up" style="animation-delay:0.05s">

                    <!-- Power controls -->
                    <div class="ptero-power-bar">
                        <span class="ptero-power-label">Power</span>

                        <button id="ptero-btn-start" class="ptero-btn-start" onclick="PterodactylPage._power('start')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                            Start
                        </button>

                        <div class="ptero-stop-group">
                            <button id="ptero-btn-stop" class="ptero-btn-stop" onclick="PterodactylPage._power('stop')">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                                Stop
                            </button>
                            <button id="ptero-btn-kill" class="ptero-btn-kill" onclick="PterodactylPage._power('kill')" title="Force kill process">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                Kill
                            </button>
                        </div>

                        <button id="ptero-btn-restart" class="ptero-btn-restart" onclick="PterodactylPage._power('restart')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            Restart
                        </button>
                    </div>

                    <!-- Console toolbar -->
                    <div class="ptero-console-toolbar">
                        <div class="ptero-console-toolbar-left">
                            <span class="ptero-console-dot red"></span>
                            <span class="ptero-console-dot yellow"></span>
                            <span class="ptero-console-dot green"></span>
                            <span class="ptero-console-title" id="ptero-console-label">console</span>
                        </div>
                        <button class="btn btn-sm btn-ghost" onclick="PterodactylPage._clearConsole()"
                                style="font-size:0.7rem;padding:2px 10px;opacity:0.6">Clear</button>
                    </div>

                    <!-- Console output -->
                    <div id="ptero-console" class="ptero-console"></div>

                    <!-- Command input -->
                    <div class="ptero-cmd-bar">
                        <span class="ptero-cmd-prompt">&gt;</span>
                        <input id="ptero-cmd-input" class="ptero-cmd-input"
                               type="text"
                               placeholder="Enter command..."
                               autocomplete="off"
                               spellcheck="false"
                               onkeydown="PterodactylPage._onCmdKey(event)" />
                        <button id="ptero-cmd-send" class="ptero-cmd-send" onclick="PterodactylPage._sendCommand()" title="Send command (Enter)">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </button>
                    </div>
                </div>
            </div>`;

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
            if (select) {
                select.innerHTML = servers.map(s =>
                    `<option value="${App.escapeHtml(s.id)}">${App.escapeHtml(s.name)}</option>`
                ).join('');
                if (servers.length > 1) select.style.display = '';
            }

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
        if (this._socket) { this._socket.off(); this._socket.disconnect(); this._socket = null; }
        this._clearConsole();
        this._setStatus('offline');
        this._fetchStatus();
        this._connectSocket();
    },

    _updateConsoleLabel(name) {
        const el = document.getElementById('ptero-console-label');
        if (el) el.textContent = name;
    },

    // ── Status ───────────────────────────────────────────────────────────────

    async _fetchStatus() {
        if (!this._serverId) return;
        try {
            const r = await API.get('/api/ext/pterodactyl-panel/status?server=' + encodeURIComponent(this._serverId));
            this._setStatus(r.status);
        } catch {
            this._setStatus('offline');
        }
    },

    _setStatus(state) {
        this._status = state;
        const pill = document.getElementById('ptero-status-pill');
        const text = document.getElementById('ptero-status-text');
        if (!pill || !text) return;

        const MAP = {
            running:  { cls: 'ptero-status-running',  label: 'Running'  },
            offline:  { cls: 'ptero-status-offline',  label: 'Offline'  },
            starting: { cls: 'ptero-status-starting', label: 'Starting' },
            stopping: { cls: 'ptero-status-stopping', label: 'Stopping' },
        };
        const s = MAP[state] || MAP.offline;
        pill.className = 'ptero-status-pill ' + s.cls;
        text.textContent = s.label;
    },

    // ── Socket.IO ────────────────────────────────────────────────────────────

    _connectSocket() {
        if (!this._serverId) return;
        if (this._socket) { this._socket.off(); this._socket.disconnect(); this._socket = null; }

        const socket = io('/pterodactyl-console', {
            auth: { token: API.token },
            query: { server: this._serverId },
            transports: ['websocket'],
            reconnection: false,
        });
        this._socket = socket;

        socket.on('connect', () => this._dismissError());
        socket.on('history', ({ lines }) => {
            lines.forEach(l => this._appendLine(l, false));
            this._scrollToBottom();
        });
        socket.on('console:line', ({ line }) => this._appendLine(line, true));
        socket.on('status:update', ({ state }) => this._setStatus(state));
        socket.on('console:error', ({ message }) => this._showError(message || 'Console stream unavailable.'));
        socket.on('connect_error', (err) => this._showError('Connection failed: ' + (err.message || 'unknown')));
        socket.on('disconnect', (reason) => {
            if (reason === 'io client disconnect') return;
            this._showError('Disconnected: ' + reason);
        });
    },

    // ── Console output ───────────────────────────────────────────────────────

    _appendLine(line, scroll) {
        const el = document.getElementById('ptero-console');
        if (!el) return;

        const lines = el.querySelectorAll('.ptero-line');
        if (lines.length >= 500) lines[0].remove();

        const div = document.createElement('div');
        div.className = 'ptero-line ' + this._lineClass(line);
        div.textContent = line;
        el.appendChild(div);

        if (scroll && this._autoScroll) this._scrollToBottom();
    },

    /** Classify a console line for colour coding. */
    _lineClass(line) {
        const l = line.toLowerCase();
        if (/\b(warn|warning)\b/.test(l)) return 'warn';
        if (/\b(error|exception|fatal|severe|critical)\b/.test(l)) return 'error';
        if (/\b(done|started|ready|success|enabled)\b/.test(l)) return 'success';
        return 'info';
    },

    _scrollToBottom() {
        const el = document.getElementById('ptero-console');
        if (el) el.scrollTop = el.scrollHeight;
    },

    _clearConsole() {
        const el = document.getElementById('ptero-console');
        if (el) el.innerHTML = '';
    },

    // ── Command input ─────────────────────────────────────────────────────────

    _onCmdKey(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this._sendCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this._cmdHistory.length === 0) return;
            this._cmdHistoryIdx = Math.min(this._cmdHistoryIdx + 1, this._cmdHistory.length - 1);
            const input = document.getElementById('ptero-cmd-input');
            if (input) input.value = this._cmdHistory[this._cmdHistoryIdx];
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._cmdHistoryIdx = Math.max(this._cmdHistoryIdx - 1, -1);
            const input = document.getElementById('ptero-cmd-input');
            if (input) input.value = this._cmdHistoryIdx >= 0 ? this._cmdHistory[this._cmdHistoryIdx] : '';
        }
    },

    async _sendCommand() {
        const input = document.getElementById('ptero-cmd-input');
        const sendBtn = document.getElementById('ptero-cmd-send');
        if (!input || !this._serverId) return;

        const cmd = input.value.trim();
        if (!cmd) return;

        // Echo command to console
        this._appendLine('> ' + cmd, true);

        // Add to history
        this._cmdHistory.unshift(cmd);
        if (this._cmdHistory.length > 50) this._cmdHistory.pop();
        this._cmdHistoryIdx = -1;

        input.value = '';
        if (sendBtn) sendBtn.disabled = true;

        try {
            await API.post('/api/ext/pterodactyl-panel/command', {
                command: cmd,
                server: this._serverId,
            });
        } catch (err) {
            this._appendLine('[Error] ' + (err.message || 'Failed to send command'), true);
        } finally {
            if (sendBtn) sendBtn.disabled = false;
            input.focus();
        }
    },

    // ── Power ────────────────────────────────────────────────────────────────

    async _power(action) {
        if (this._busy || !this._serverId) return;
        this._setBusy(true);
        try {
            await API.post('/api/ext/pterodactyl-panel/power', { action, server: this._serverId });
            App.showToast('Signal sent: ' + action, 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to send ' + action + ' signal.', 'error');
        } finally {
            this._setBusy(false);
        }
    },

    _setBusy(busy) {
        this._busy = busy;
        ['start', 'stop', 'kill', 'restart'].forEach(id => {
            const btn = document.getElementById('ptero-btn-' + id);
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
    },

    _dismissError() {
        const banner = document.getElementById('ptero-error-banner');
        if (banner) banner.style.display = 'none';
    },

    destroy() {
        if (this._socket) { this._socket.off(); this._socket.disconnect(); this._socket = null; }
        this._busy = false;
        this._autoScroll = true;
        this._serverId = null;
        this._servers = [];
        this._cmdHistory = [];
        this._cmdHistoryIdx = -1;
    },
};

// Auto-scroll detection
document.addEventListener('scroll', function (e) {
    const el = document.getElementById('ptero-console');
    if (!el || e.target !== el) return;
    PterodactylPage._autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}, true);
