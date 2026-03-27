/* =======================================
   Pterodactyl Panel Extension — Panel Page
   Live console, stats, server info, ANSI colors.
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
    _statusPoll: null,
    _resourcePoll: null,
    // Stats history for mini-graphs (last 60 samples)
    _cpuHistory: [],
    _ramHistory: [],
    _GRAPH_SAMPLES: 60,

    async render(container) {
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
            <div class="ptero-page animate-fade-up" style="max-width:1100px;margin:0 auto">

                <!-- Top bar -->
                <div class="ptero-topbar">
                    <div class="ptero-topbar-left">
                        <h2 class="ptero-title">Server Panel</h2>
                        <select id="ptero-server-select" class="ptero-server-select" style="display:none"
                                onchange="PterodactylPage._switchServer(this.value)"></select>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span id="ptero-player-count" class="ptero-player-count" style="display:none"></span>
                        <div id="ptero-status-pill" class="ptero-status-pill ptero-status-offline">
                            <span class="ptero-status-dot"></span>
                            <span id="ptero-status-text">OFFLINE</span>
                        </div>
                    </div>
                </div>

                <!-- Error banner -->
                <div id="ptero-error-banner" class="ptero-error-banner" style="display:none">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span id="ptero-error-msg">Console stream unavailable.</span>
                    <button class="btn btn-sm" onclick="PterodactylPage._reconnect()"
                            style="font-size:0.72rem;padding:3px 10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:var(--text-secondary);flex-shrink:0">
                        Reconnect
                    </button>
                    <button class="ptero-banner-close" onclick="PterodactylPage._dismissError()">✕</button>
                </div>

                <!-- Server info bar -->
                <div id="ptero-info-bar" class="ptero-info-bar" style="display:none"></div>

                <!-- Stats row -->
                <div class="ptero-stats-row" id="ptero-stats-row">
                    <div class="ptero-stat-card" id="ptero-stat-cpu">
                        <div class="ptero-stat-label">CPU</div>
                        <div class="ptero-stat-value" id="ptero-cpu-val">—</div>
                        <canvas class="ptero-graph" id="ptero-cpu-graph" width="120" height="36"></canvas>
                    </div>
                    <div class="ptero-stat-card" id="ptero-stat-ram">
                        <div class="ptero-stat-label">RAM</div>
                        <div class="ptero-stat-value" id="ptero-ram-val">—</div>
                        <canvas class="ptero-graph" id="ptero-ram-graph" width="120" height="36"></canvas>
                    </div>
                    <div class="ptero-stat-card">
                        <div class="ptero-stat-label">Disk</div>
                        <div class="ptero-stat-value" id="ptero-disk-val">—</div>
                        <div class="ptero-stat-bar-wrap"><div class="ptero-stat-bar" id="ptero-disk-bar"></div></div>
                    </div>
                    <div class="ptero-stat-card">
                        <div class="ptero-stat-label">Network ↓↑</div>
                        <div class="ptero-stat-value" id="ptero-net-val">—</div>
                        <div class="ptero-stat-sub" id="ptero-uptime-val"></div>
                    </div>
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
                            <button id="ptero-btn-kill" class="ptero-btn-kill" onclick="PterodactylPage._power('kill')" title="Force kill">
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
                        <input id="ptero-cmd-input" class="ptero-cmd-input" type="text"
                               placeholder="Enter command..." autocomplete="off" spellcheck="false"
                               onkeydown="PterodactylPage._onCmdKey(event)" />
                        <button id="ptero-cmd-send" class="ptero-cmd-send" onclick="PterodactylPage._sendCommand()" title="Send (Enter)">
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
            if (!servers.length) { this._showError('No servers found. Check your API key in the extension settings.'); return; }

            const select = document.getElementById('ptero-server-select');
            if (select) {
                select.innerHTML = servers.map(s => `<option value="${App.escapeHtml(s.id)}">${App.escapeHtml(s.name)}</option>`).join('');
                if (servers.length > 1) select.style.display = '';
            }

            this._serverId = servers[0].id;
            this._updateConsoleLabel(servers[0].name);
            this._fetchServerInfo();
            this._fetchStatus();
            this._fetchResources(); // immediate stats on load
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
        this._cpuHistory = [];
        this._ramHistory = [];
        this._fetchServerInfo();
        this._fetchStatus();
        this._fetchResources();
        this._connectSocket();
    },

    _updateConsoleLabel(name) {
        const el = document.getElementById('ptero-console-label');
        if (el) el.textContent = name;
    },

    // ── Server info bar ───────────────────────────────────────────────────────

    async _fetchServerInfo() {
        if (!this._serverId) return;
        try {
            const info = await API.get('/api/ext/pterodactyl-panel/server-info?server=' + encodeURIComponent(this._serverId));
            const bar = document.getElementById('ptero-info-bar');
            if (!bar) return;
            const addr = info.ip ? (info.ip + (info.port ? ':' + info.port : '')) : '—';
            bar.innerHTML =
                `<span class="ptero-info-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>${App.escapeHtml(info.node || '—')}</span>` +
                `<span class="ptero-info-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>${App.escapeHtml(addr)}</span>` +
                (info.limits && info.limits.memory ? `<span class="ptero-info-item">RAM ${info.limits.memory} MB</span>` : '') +
                (info.limits && info.limits.cpu ? `<span class="ptero-info-item">CPU ${info.limits.cpu}%</span>` : '') +
                (info.limits && info.limits.disk ? `<span class="ptero-info-item">Disk ${info.limits.disk} MB</span>` : '');
            bar.style.display = 'flex';
        } catch { /* non-critical */ }
    },

    // ── Status ───────────────────────────────────────────────────────────────

    async _fetchStatus() {
        if (!this._serverId) return;
        try {
            const r = await API.get('/api/ext/pterodactyl-panel/status?server=' + encodeURIComponent(this._serverId));
            this._setStatus(r.status);
            // Also seed stats from the initial REST response
            if (r.resources && Object.keys(r.resources).length) {
                this._updateStats(r.resources);
            }
        } catch { this._setStatus('offline'); }
    },

    /** Fetch live resources directly and update stats immediately. */
    async _fetchResources() {
        if (!this._serverId) return;
        try {
            const r = await API.get('/api/ext/pterodactyl-panel/resources?server=' + encodeURIComponent(this._serverId));
            if (r.state) this._setStatus(r.state);
            if (r.resources) this._updateStats(r.resources);
        } catch { /* non-critical */ }
    },

    /** Start a client-side resource poll every 3s as a reliable fallback. */
    _startResourcePoll() {
        if (this._resourcePoll) return;
        this._resourcePoll = setInterval(() => this._fetchResources(), 1000);
    },

    _stopResourcePoll() {
        if (this._resourcePoll) { clearInterval(this._resourcePoll); this._resourcePoll = null; }
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

        // Hide player count when offline
        if (state === 'offline' || state === 'stopping') {
            const pc = document.getElementById('ptero-player-count');
            if (pc) pc.style.display = 'none';
        }
    },

    _setPlayerCount(online, max) {
        const el = document.getElementById('ptero-player-count');
        if (!el) return;
        if (this._status !== 'running') { el.style.display = 'none'; return; }
        el.textContent = online + ' / ' + max + ' players';
        el.style.display = 'flex';
    },

    /** Parse player count from a Minecraft console line. */
    _parsePlayerCount(line) {
        // "There are X of a max of Y players online"
        let m = line.match(/There are (\d+) of a max(?: of)? (\d+) players/i);
        if (m) { this._setPlayerCount(parseInt(m[1]), parseInt(m[2])); return; }
        // "Players Online: X/Y"
        m = line.match(/Players Online:\s*(\d+)\/(\d+)/i);
        if (m) { this._setPlayerCount(parseInt(m[1]), parseInt(m[2])); return; }
        // "[Server thread/INFO]: ChaseRubble joined the game" — increment
        // "[Server thread/INFO]: ChaseRubble left the game" — decrement
        // These are handled by the /list command poll instead
    },

    // ── Stats ─────────────────────────────────────────────────────────────────

    _updateStats(stats) {
        // Guard: skip if stats object is empty or clearly invalid
        if (!stats || typeof stats !== 'object') return;

        const cpu = parseFloat(stats.cpu_absolute) || 0;
        const ramBytes = stats.memory_bytes || 0;
        const ramMB = Math.round(ramBytes / 1048576);
        const ramLimitMB = Math.round((stats.memory_limit_bytes || 0) / 1048576);
        const diskMB = Math.round((stats.disk_bytes || 0) / 1048576);
        const rx = this._fmtBytes(stats.network_rx_bytes || 0);
        const tx = this._fmtBytes(stats.network_tx_bytes || 0);
        const uptime = this._fmtUptime(stats.uptime || 0);

        // Only push to graph history when server is running and we have real data.
        // This prevents the graph spiking to 0 between polls or when offline.
        const hasRealData = this._status === 'running' && (cpu > 0 || ramBytes > 0);
        if (hasRealData) {
            this._cpuHistory.push(cpu);
            if (this._cpuHistory.length > this._GRAPH_SAMPLES) this._cpuHistory.shift();
            this._ramHistory.push(ramMB);
            if (this._ramHistory.length > this._GRAPH_SAMPLES) this._ramHistory.shift();
        }

        // Always update text values when we have any data
        const cpuEl = document.getElementById('ptero-cpu-val');
        if (cpuEl) cpuEl.textContent = cpu.toFixed(1) + '%';

        const ramEl = document.getElementById('ptero-ram-val');
        if (ramEl) ramEl.textContent = ramMB + ' / ' + (ramLimitMB > 0 ? ramLimitMB : '∞') + ' MB';

        const diskEl = document.getElementById('ptero-disk-val');
        if (diskEl) diskEl.textContent = diskMB + ' MB';

        const netEl = document.getElementById('ptero-net-val');
        if (netEl) netEl.textContent = '↓ ' + rx + '  ↑ ' + tx;

        const uptimeEl = document.getElementById('ptero-uptime-val');
        if (uptimeEl) uptimeEl.textContent = uptime ? 'Up ' + uptime : '';

        // Disk bar
        const diskBar = document.getElementById('ptero-disk-bar');
        if (diskBar) {
            const pct = ramLimitMB > 0 ? Math.min(100, (diskMB / ramLimitMB) * 100) : 0;
            diskBar.style.width = pct + '%';
        }

        // Only redraw graphs when we actually added new data points
        if (hasRealData) {
            this._drawGraph('ptero-cpu-graph', this._cpuHistory, 100, '#29b6f6');
            const ramMax = ramLimitMB > 0 ? ramLimitMB : (this._ramHistory.length ? Math.max(...this._ramHistory) : 1);
            this._drawGraph('ptero-ram-graph', this._ramHistory, ramMax, '#ab47bc');
        }
    },

    _drawGraph(canvasId, data, maxVal, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (data.length < 2) return;

        const step = w / (this._GRAPH_SAMPLES - 1);
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = i * step;
            const y = h - (v / maxVal) * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        // Fill under line
        ctx.lineTo((data.length - 1) * step, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = color + '22';
        ctx.fill();
        // Line
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = i * step;
            const y = h - (v / maxVal) * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    },

    _fmtBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(2) + ' GB';
    },

    _fmtUptime(ms) {
        if (!ms) return '';
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        if (h > 0) return h + 'h ' + m + 'm';
        return m + 'm ' + (s % 60) + 's';
    },

    // ── ANSI color processing ─────────────────────────────────────────────────

    /**
     * Convert ANSI escape sequences to styled HTML spans.
     * Handles: colors (30-37, 90-97), bright, reset, bold.
     */
    _ansiToHtml(text) {
        // Escape HTML first
        const escaped = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const ANSI_COLORS = {
            30: '#4a4a4a', 31: '#ff5555', 32: '#50fa7b', 33: '#f1fa8c',
            34: '#6272a4', 35: '#ff79c6', 36: '#8be9fd', 37: '#f8f8f2',
            90: '#6272a4', 91: '#ff6e6e', 92: '#69ff94', 93: '#ffffa5',
            94: '#d6acff', 95: '#ff92df', 96: '#a4ffff', 97: '#ffffff',
        };

        let result = '';
        let openSpans = 0;
        // Match ESC[ sequences
        const parts = escaped.split(/(\x1b\[[0-9;]*m|\x1b\[[0-9;]*[A-Za-z])/);

        for (const part of parts) {
            if (!part.startsWith('\x1b[')) {
                result += part;
                continue;
            }
            // Extract codes
            const inner = part.slice(2, -1);
            if (!inner || inner === '0' || inner === '') {
                // Reset
                for (let i = 0; i < openSpans; i++) result += '</span>';
                openSpans = 0;
                continue;
            }
            const codes = inner.split(';').map(Number);
            let style = '';
            for (const code of codes) {
                if (code === 1) style += 'font-weight:bold;';
                else if (ANSI_COLORS[code]) style += 'color:' + ANSI_COLORS[code] + ';';
                else if (code >= 40 && code <= 47) {
                    const bg = { 40:'#000',41:'#ff5555',42:'#50fa7b',43:'#f1fa8c',44:'#6272a4',45:'#ff79c6',46:'#8be9fd',47:'#bbb' };
                    if (bg[code]) style += 'background:' + bg[code] + ';';
                }
            }
            if (style) {
                result += '<span style="' + style + '">';
                openSpans++;
            }
        }
        for (let i = 0; i < openSpans; i++) result += '</span>';
        return result;
    },

    // ── Socket.IO ────────────────────────────────────────────────────────────

    _connectSocket() {
        if (!this._serverId) return;
        if (this._socket) { this._socket.off(); this._socket.disconnect(); this._socket = null; }

        const socket = io('/pterodactyl-console', {
            auth: { token: API.token, server: this._serverId },
            query: { server: this._serverId },
            transports: ['websocket'],
            reconnection: false,
        });
        this._socket = socket;

        socket.on('connect', () => {
            this._dismissError();
            if (this._statusPoll) { clearInterval(this._statusPoll); this._statusPoll = null; }
            if (this._playerPoll) { clearInterval(this._playerPoll); this._playerPoll = null; }
            // Socket is live — server-side push handles stats, stop client poll
            this._stopResourcePoll();
        });
        socket.on('history', ({ lines }) => {
            lines.forEach(l => this._appendLine(l, false));
            this._scrollToBottom();
        });
        socket.on('console:line', ({ line }) => this._appendLine(line, true));
        socket.on('status:update', ({ state }) => this._setStatus(state));
        socket.on('stats:update', (stats) => this._updateStats(stats));
        socket.on('players:update', ({ online, max }) => this._setPlayerCount(online, max));
        socket.on('console:error', ({ message }) => {
            this._showError(message || 'Console stream unavailable.');
            this._startStatusPoll();
            this._startResourcePoll(); // fall back to REST polling
        });
        socket.on('connect_error', (err) => {
            this._showError('Connection failed: ' + (err.message || 'unknown'));
            this._startStatusPoll();
            this._startResourcePoll();
        });
        socket.on('disconnect', (reason) => {
            if (reason === 'io client disconnect') return;
            this._showError('Disconnected: ' + reason);
            this._startStatusPoll();
            this._startResourcePoll();
        });
    },

    _startStatusPoll() {
        if (this._statusPoll) return;
        this._statusPoll = setInterval(() => this._fetchStatus(), 5000);
    },

    // ── Console output ───────────────────────────────────────────────────────

    _appendLine(line, scroll) {
        const el = document.getElementById('ptero-console');
        if (!el) return;

        const lines = el.querySelectorAll('.ptero-line');
        if (lines.length >= 500) lines[0].remove();

        const div = document.createElement('div');
        div.className = 'ptero-line';
        div.innerHTML = this._ansiToHtml(line);
        el.appendChild(div);

        // Parse player count from console output
        // this._parsePlayerCount(line); — disabled, using server-side MC pinger instead

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

    // ── Command input ─────────────────────────────────────────────────────────

    _onCmdKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); this._sendCommand(); }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!this._cmdHistory.length) return;
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

        this._appendLine('> ' + cmd, true);
        this._cmdHistory.unshift(cmd);
        if (this._cmdHistory.length > 50) this._cmdHistory.pop();
        this._cmdHistoryIdx = -1;
        input.value = '';
        if (sendBtn) sendBtn.disabled = true;

        try {
            await API.post('/api/ext/pterodactyl-panel/command', { command: cmd, server: this._serverId });
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

    _reconnect() {
        this._dismissError();
        if (this._statusPoll) { clearInterval(this._statusPoll); this._statusPoll = null; }
        this._fetchStatus();
        this._connectSocket();
    },

    destroy() {
        if (this._socket) { this._socket.off(); this._socket.disconnect(); this._socket = null; }
        if (this._statusPoll) { clearInterval(this._statusPoll); this._statusPoll = null; }
        this._stopResourcePoll();
        this._busy = false;
        this._autoScroll = true;
        this._serverId = null;
        this._servers = [];
        this._cmdHistory = [];
        this._cmdHistoryIdx = -1;
        this._cpuHistory = [];
        this._ramHistory = [];
    },
};

// Auto-scroll detection
document.addEventListener('scroll', function (e) {
    const el = document.getElementById('ptero-console');
    if (!el || e.target !== el) return;
    PterodactylPage._autoScroll = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}, true);
