/* =======================================
   Minecraft Extension — Frontend Page
   Handles: Server List, Server Detail,
   Leaderboard, and Account Linking UI.
   ======================================= */
var MinecraftPage = {
    currentTab: 'servers',
    servers: [],
    selectedServer: null,
    chartRange: '24h',
    chartMetric: 'players',
    leaderboardPage: 1,
    leaderboardLimit: 50,
    leaderboardStat: 'play_time',
    leaderboardServer: 'all',
    leaderboardMeta: null,

    // Minecraft color code map
    colorCodes: {
        '0': '#000000',
        '1': '#0000AA',
        '2': '#00AA00',
        '3': '#00AAAA',
        '4': '#AA0000',
        '5': '#AA00AA',
        '6': '#FFAA00',
        '7': '#AAAAAA',
        '8': '#555555',
        '9': '#5555FF',
        'a': '#55FF55',
        'b': '#55FFFF',
        'c': '#FF5555',
        'd': '#FF55FF',
        'e': '#FFFF55',
        'f': '#FFFFFF'
    },

    // Convert Minecraft color codes to HTML
    formatMOTD(text) {
        if (!text) return '';
        let result = '';
        let parts = text.split('&');
        result += parts[0]; // First part has no color code
        for (let i = 1; i < parts.length; i++) {
            const code = parts[i].charAt(0).toLowerCase();
            const content = parts[i].slice(1);
            if (this.colorCodes[code]) {
                result += `<span style="color:${this.colorCodes[code]}">${this._esc(content)}</span>`;
            } else {
                result += this._esc('&' + parts[i]);
            }
        }
        return result;
    },

    async render(container, params) {
        if (params && params.length > 0 && !window.location.pathname.includes('leaderboard') && !window.location.pathname.includes('link')) {
            return this.renderServerDetail(container, params[0]);
        }

        const hash = window.location.pathname + window.location.search;
        let title = 'Minecraft Network';
        let subtitle = 'Explore servers and track your progress.';

        if (hash.includes('/mc-leaderboard')) {
            this.currentTab = 'leaderboard';
            title = 'Network Leaderboard';
            subtitle = 'See the top players across all tracked statistics.';
        } else if (hash.includes('/mc-link')) {
            this.currentTab = 'link';
            title = 'Link Account';
            subtitle = 'Connect your Minecraft account to Venary.';
        } else {
            this.currentTab = 'servers';
            title = 'Network Servers';
            subtitle = 'View live status and online players.';
        }

        container.innerHTML = `
            <div class="minecraft-page">
                <div id="mc-header-container"></div>
                <div id="mc-page-content" class="animate-fade-in">
                    <!-- content injected here -->
                </div>
            </div>
        `;

        this.renderCurrentPage(document.getElementById('mc-page-content'));
    },

    renderCurrentPage(container) {
        switch (this.currentTab) {
            case 'servers': return this.renderServers(container);
            case 'leaderboard': return this.renderLeaderboard(container);
            case 'link': return this.renderLink(container);
        }
    },

    // ══════════════════════════════════════════════════════
    // SERVER LIST TAB
    // ══════════════════════════════════════════════════════
    async renderServers(container) {
        container.innerHTML = '<div class="loading-spinner" style="text-align:center;padding:3rem">Loading servers...</div>';
        try {
            const res = await API.get('/api/ext/minecraft/servers');
            this.servers = res;
        } catch { this.servers = []; }

        // Render header with loading state
        const headerEl = document.getElementById('mc-header-container');
        if (headerEl) {
            headerEl.innerHTML = StatusHeader.render({
                title: 'Network Servers',
                subtitle: 'View live status and online players.',
                theme: 'cyan',
                statusCards: [
                    {
                        type: 'players',
                        value: '—',
                        label: 'Players Online',
                        theme: 'cyan',
                        pulse: false,
                        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
                    },
                    {
                        type: 'servers',
                        value: `—/${this.servers.length}`,
                        label: 'Servers Online',
                        theme: 'yellow',
                        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>'
                    }
                ]
            });
        }

        if (this.servers.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:4rem 1rem">
                    <div style="font-size:3rem;margin-bottom:1rem">\uD83D\uDDA5\uFE0F</div>
                    <h2>No Servers Configured</h2>
                    <p style="color:rgba(255,255,255,0.5)">Admins can add servers from the admin dashboard.</p>
                </div>`;
            return;
        }

        // Render all cards immediately with loading state
        let html = '<div class="mc-server-grid">';
        for (const s of this.servers) {
            html += this._renderServerCard(s, null);
        }
        html += '</div>';
        container.innerHTML = html;

        // Fetch status for each server individually and update cards
        let resolvedOnline = 0;
        let resolvedTotal = 0;
        let totalPlayers = 0;

        const statusPromises = this.servers.map(async s => {
            try {
                const status = await API.get(`/api/ext/minecraft/servers/${s.id}/status`);
                Object.assign(s, status);
            } catch {
                s.online = false;
                s.players = { online: 0, max: 0, list: [] };
                s.motd = '';
                s.responseTimeMs = null;
            }
            this._updateServerCard(s);
            resolvedTotal++;
            if (s.online) resolvedOnline++;
            totalPlayers += s.players?.online || 0;

            // Update header counts as each server resolves
            const allDone = resolvedTotal === this.servers.length;
            const headerEl2 = document.getElementById('mc-header-container');
            if (headerEl2) {
                const serverTheme = allDone
                    ? (resolvedOnline === this.servers.length ? 'green' : resolvedOnline > 0 ? 'yellow' : 'red')
                    : 'yellow';
                headerEl2.innerHTML = StatusHeader.render({
                    title: 'Network Servers',
                    subtitle: 'View live status and online players.',
                    theme: 'cyan',
                    statusCards: [
                        {
                            type: 'players',
                            value: totalPlayers,
                            label: 'Players Online',
                            theme: 'cyan',
                            pulse: allDone,
                            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
                        },
                        {
                            type: 'servers',
                            value: `${resolvedOnline}/${this.servers.length}`,
                            label: 'Servers Online',
                            theme: serverTheme,
                            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>'
                        }
                    ]
                });
            }
        });
        await Promise.allSettled(statusPromises);
    },

    _renderServerCard(s, status) {
        const address = s.hide_port || s.port === 25565 ? s.address : s.address + ':' + s.port;
        const isLoading = status === null;
        const online = isLoading ? null : s.online;
        const iconHtml = s.icon && s.icon.startsWith('data:')
            ? `<img class="mc-server-icon" src="${s.icon}" alt="${s.name}">`
            : `<div class="mc-server-icon-placeholder">\u26CF</div>`;

        const playerList = (s.players?.list || []).slice(0, 10);
        const morePlayers = (s.players?.online || 0) - playerList.length;

        return `
            <div class="mc-server-card${isLoading ? ' mc-status-loading' : ''}" data-server-id="${s.id}">
                <div class="status-bar ${isLoading ? 'loading' : (online ? 'online' : 'offline')}"></div>
                <div class="mc-server-card-main">
                    <div class="mc-server-card-left">
                        <div class="mc-server-icon-wrap" id="icon-${s.id}">${iconHtml}</div>
                        <div>
                            <div class="mc-server-name">${this._esc(s.name)}</div>
                            <div class="mc-server-version" id="ver-${s.id}">${s.version || 'Unknown'}</div>
                        </div>
                    </div>
                    <div class="mc-server-card-center" id="center-${s.id}">
                        ${s.description ? `<p style="font-size:0.85rem;color:rgba(255,255,255,0.6);margin:0">${this._esc(s.description)}</p>` : ''}
                        ${isLoading ? `<div class="mc-server-motd mc-loading-text" style="margin:4px 0 0 0">Checking status...</div>` : (s.motd ? `<div class="mc-server-motd" style="margin:4px 0 0 0">${this.formatMOTD(s.motd)}</div>` : '')}
                        <div class="mc-server-stats" id="stats-${s.id}" style="margin-top:8px">
                            <div class="mc-stat">\uD83D\uDC64 <span class="value">${isLoading ? '?' : (s.players?.online || 0)}</span>/<span>${isLoading ? '?' : (s.players?.max || 0)}</span></div>
                            ${s.modpack_name ? `<div class="mc-stat">\uD83D\uDCE6 ${this._esc(s.modpack_name)}</div>` : ''}
                            ${s.is_bedrock ? `<div class="mc-stat">\uD83D\uDCF1 Bedrock</div>` : ''}
                        </div>
                    </div>
                    <div class="mc-server-card-right">
                        <span class="mc-badge ${isLoading ? 'loading' : (online ? 'online' : 'offline')}" id="badge-${s.id}">
                            <span class="dot"></span>${isLoading ? 'Loading' : (online ? 'Online' : 'Offline')}
                        </span>
                        <div class="mc-server-card-actions">
                            <div class="mc-ip-bar" style="margin:0;padding:6px 12px">
                                <code style="font-size:0.75rem">${address}</code>
                                <button class="mc-btn mc-btn-copy" style="padding:4px 8px;font-size:0.7rem" onclick="MinecraftPage.copyIP('${address}', this)">\uD83D\uDCCB Copy</button>
                            </div>
                            ${s.curseforge_url ? `<a href="${s.curseforge_url}" target="_blank" class="mc-btn mc-btn-curseforge" style="padding:6px 10px"><img src="https://www.curseforge.com/favicon.ico" alt="CF"></a>` : ''}
                            ${s.modrinth_url ? `<a href="${s.modrinth_url}" target="_blank" class="mc-btn mc-btn-modrinth" style="padding:6px 10px"><img src="https://modrinth.com/favicon.ico" alt="MR"></a>` : ''}
                            ${s.bluemap_url ? `<a href="${s.bluemap_url}" target="_blank" class="mc-btn mc-btn-map" style="padding:6px 10px">\uD83D\uDDFA\uFE0F</a>` : ''}
                            <button class="mc-details-toggle" onclick="MinecraftPage.toggleDetails('${s.id}', this)">
                                <span>Details</span> <span class="arrow">\u25BC</span>
                            </button>
                            <a href="/servers/${s.id}" target="_blank" class="mc-btn" style="padding:6px 10px" title="Open in new page">\u2197</a>
                        </div>
                    </div>
                </div>
                <div class="mc-server-details" id="details-${s.id}">
                    <div class="mc-details-grid">
                        <div class="mc-details-section">
                            <h4>\uD83D\uDC65 Online Players (<span id="player-count-${s.id}">${isLoading ? '...' : (s.players?.online || 0)}</span>)</h4>
                            <div class="mc-player-list" id="player-list-${s.id}">
                                ${isLoading ? '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem">Loading...</p>' : (playerList.length > 0 ? playerList.map(p => `
                                    <div class="mc-player-pill">
                                        <img class="mc-player-head" src="https://mc-heads.net/avatar/${p.uuid || p.name}/20" alt="${p.name}">
                                        ${this._esc(p.name)}
                                    </div>
                                `).join('') + (morePlayers > 0 ? `<div class="mc-player-pill" style="opacity:0.6">+${morePlayers} more</div>` : '') : '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem">No players online</p>')}
                            </div>
                        </div>
                        <div class="mc-details-section">
                            <h4>\u2139\uFE0F Server Info</h4>
                            <div style="font-size:0.85rem;color:rgba(255,255,255,0.7);display:flex;flex-direction:column;gap:6px">
                                <div>Address: <code style="color:var(--neon-cyan)">${address}</code></div>
                                <div>Port: <span style="color:#fff">${s.port}</span></div>
                                <div>Ping: <span style="color:#fff" id="ping-${s.id}">${isLoading ? '...' : (s.responseTimeMs || '\u2014')}ms</span></div>
                                ${s.bluemap_url ? `<div><a href="${s.bluemap_url}" target="_blank" style="color:var(--neon-cyan)">\uD83D\uDDFA\uFE0F View Live Map</a></div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    _updateServerCard(s) {
        const card = document.querySelector(`.mc-server-card[data-server-id="${s.id}"]`);
        if (!card) return;

        card.classList.remove('mc-status-loading');

        const statusBar = card.querySelector('.status-bar');
        if (statusBar) { statusBar.className = `status-bar ${s.online ? 'online' : 'offline'}`; }

        const badge = document.getElementById(`badge-${s.id}`);
        if (badge) {
            badge.className = `mc-badge ${s.online ? 'online' : 'offline'}`;
            badge.innerHTML = `<span class="dot"></span>${s.online ? 'Online' : 'Offline'}`;
        }

        const ver = document.getElementById(`ver-${s.id}`);
        if (ver) ver.textContent = s.version || 'Unknown';

        const iconWrap = document.getElementById(`icon-${s.id}`);
        if (iconWrap && s.icon && s.icon.startsWith('data:')) {
            iconWrap.innerHTML = `<img class="mc-server-icon" src="${s.icon}" alt="${s.name}">`;
        }

        const stats = document.getElementById(`stats-${s.id}`);
        if (stats) {
            const modpackHtml = s.modpack_name ? `<div class="mc-stat">\uD83D\uDCE6 ${this._esc(s.modpack_name)}</div>` : '';
            const bedrockHtml = s.is_bedrock ? `<div class="mc-stat">\uD83D\uDCF1 Bedrock</div>` : '';
            stats.innerHTML = `<div class="mc-stat">\uD83D\uDC64 <span class="value">${s.players?.online || 0}</span>/<span>${s.players?.max || 0}</span></div>${modpackHtml}${bedrockHtml}`;
        }

        const center = document.getElementById(`center-${s.id}`);
        if (center) {
            const descHtml = s.description ? `<p style="font-size:0.85rem;color:rgba(255,255,255,0.6);margin:0">${this._esc(s.description)}</p>` : '';
            const motdHtml = s.motd ? `<div class="mc-server-motd" style="margin:4px 0 0 0">${this.formatMOTD(s.motd)}</div>` : '';
            const statsEl = document.getElementById(`stats-${s.id}`);
            center.innerHTML = descHtml + motdHtml;
            if (statsEl) center.appendChild(statsEl);
        }

        const playerCount = document.getElementById(`player-count-${s.id}`);
        if (playerCount) playerCount.textContent = s.players?.online || 0;

        const playerList = document.getElementById(`player-list-${s.id}`);
        if (playerList) {
            const list = (s.players?.list || []).slice(0, 10);
            const more = (s.players?.online || 0) - list.length;
            playerList.innerHTML = list.length > 0
                ? list.map(p => `<div class="mc-player-pill"><img class="mc-player-head" src="https://mc-heads.net/avatar/${p.uuid || p.name}/20" alt="${p.name}">${this._esc(p.name)}</div>`).join('') + (more > 0 ? `<div class="mc-player-pill" style="opacity:0.6">+${more} more</div>` : '')
                : '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem">No players online</p>';
        }

        const ping = document.getElementById(`ping-${s.id}`);
        if (ping) ping.textContent = (s.responseTimeMs || '—') + 'ms';
    },

    toggleDetails(serverId, btn) {
        const details = document.getElementById('details-' + serverId);
        const isOpen = details.classList.contains('open');
        if (isOpen) {
            details.classList.remove('open');
            btn.classList.remove('open');
        } else {
            details.classList.add('open');
            btn.classList.add('open');
        }
    },

    copyIP(ip, btn) {
        navigator.clipboard.writeText(ip).then(() => {
            btn.classList.add('copied');
            btn.textContent = '\u2713 Copied!';
            setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '\uD83D\uDCCB Copy'; }, 2000);
        });
    },

    viewServer(id) {
        Router.go('/servers/' + id);
    },

    // ══════════════════════════════════════════════════════
    // SERVER DETAIL PAGE
    // ══════════════════════════════════════════════════════
    async renderServerDetail(container, serverId) {
        container.innerHTML = '<div class="minecraft-page"><div class="loading-spinner" style="text-align:center;padding:3rem">Loading server...</div></div>';

        let server;
        try {
            server = await API.get('/api/ext/minecraft/servers/' + serverId);
        } catch {
            container.innerHTML = '<div class="minecraft-page"><p>Server not found.</p></div>';
            return;
        }

        const address = server.hide_port || server.port === 25565 ? server.address : server.address + ':' + server.port;
        const iconHtml = server.icon && server.icon.startsWith('data:')
            ? `<img class="mc-server-icon" src="${server.icon}" alt="${server.name}" style="width:64px;height:64px">`
            : `<div class="mc-server-icon-placeholder" style="width:64px;height:64px;font-size:28px">\u26CF</div>`;

        let html = `
            <div class="minecraft-page" style="max-width: 1000px; margin: 0 auto;">
                <button class="mc-btn" onclick="Router.go('/servers')" style="margin-bottom:1rem">\u2190 Back to Servers</button>

                <div style="display:flex;gap:16px;align-items:center;margin-bottom:1.5rem">
                    ${iconHtml}
                    <div>
                        <h1 style="margin:0">${this._esc(server.name)}</h1>
                        <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                            <span class="mc-badge ${server.online ? 'online' : 'offline'}"><span class="dot"></span>${server.online ? 'Online' : 'Offline'}</span>
                            ${server.version ? `<span style="color:rgba(255,255,255,0.5);font-size:0.85rem">${server.version}</span>` : ''}
                        </div>
                    </div>
                </div>

                ${server.description ? `<p style="color:rgba(255,255,255,0.6);margin-bottom:1rem">${this._esc(server.description)}</p>` : ''}

                <div class="mc-detail-grid">
                    <!-- Status Card -->
                    <div class="mc-detail-card">
                        <h3>Server Status</h3>
                        <div class="mc-server-stats" style="flex-direction:column;gap:10px">
                            <div class="mc-stat" style="justify-content:space-between;width:100%">
                                <span>Players</span>
                                <span class="value" style="font-size:1.2rem">${server.players?.online || 0}/${server.players?.max || 0}</span>
                            </div>
                            <div class="mc-stat" style="justify-content:space-between;width:100%">
                                <span>Ping</span>
                                <span class="value">${server.responseTimeMs || '\u2014'}ms</span>
                            </div>
                        </div>
                        <div class="mc-ip-bar" style="margin-top:12px">
                            <span>\uD83C\uDF10</span>
                            <code style="flex:1">${address}</code>
                            <button class="mc-btn mc-btn-copy" onclick="MinecraftPage.copyIP('${address}', this)">\uD83D\uDCCB Copy</button>
                        </div>
                        <div class="mc-btn-group">
                            ${server.curseforge_url ? `<a href="${server.curseforge_url}" target="_blank" class="mc-btn mc-btn-curseforge"><img src="https://www.curseforge.com/favicon.ico" alt="CF">CurseForge</a>` : ''}
                            ${server.modrinth_url ? `<a href="${server.modrinth_url}" target="_blank" class="mc-btn mc-btn-modrinth"><img src="https://modrinth.com/favicon.ico" alt="MR">Modrinth</a>` : ''}
                            ${server.bluemap_url ? `<a href="${server.bluemap_url}" target="_blank" class="mc-btn mc-btn-map">\uD83D\uDDFA\uFE0F Map</a>` : ''}
                            <button class="mc-btn mc-btn-primary" onclick="MinecraftPage.viewServerLeaderboard('${server.id}')">\uD83C\uDFC6 View Leaderboard</button>
                        </div>
                    </div>

                    <!-- Online Players -->
                    <div class="mc-detail-card">
                        <h3>Online Players (${server.players?.online || 0})</h3>
                        <div class="mc-player-list">
                            ${(server.players?.list || []).map(p => `
                                <div class="mc-player-pill">
                                    <img class="mc-player-head" src="https://mc-heads.net/avatar/${p.uuid || p.name}/20" alt="${p.name}">
                                    ${this._esc(p.name)}
                                </div>
                            `).join('') || '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem">No players online</p>'}
                        </div>
                    </div>

                    <!-- Player / Uptime History Chart -->
                    <div class="mc-detail-card mc-chart-container">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
                            <h3 style="margin:0">Server History</h3>
                            <div class="mc-chart-controls">
                                <button class="mc-chart-btn metric-btn ${this.chartMetric === 'uptime' ? '' : 'active'}" onclick="MinecraftPage.setChartMetric('players', this, '${serverId}')">Players</button>
                                <button class="mc-chart-btn metric-btn ${this.chartMetric === 'uptime' ? 'active' : ''}" onclick="MinecraftPage.setChartMetric('uptime', this, '${serverId}')">Uptime</button>
                            </div>
                        </div>
                        <div id="mc-chart-range-btns" class="mc-chart-controls" style="margin-bottom:10px">
                            <span style="color:rgba(255,255,255,0.25);font-size:0.8rem;padding:4px 2px">Loading...</span>
                        </div>
                        <div id="mc-chart-stats" style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06)"></div>
                        <canvas id="mc-chart" class="mc-chart-canvas" style="cursor:pointer"></canvas>
                        <div id="mc-chart-drilldown" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08)"></div>
                    </div>
        `;

        // Map iframe (only if configured)
        if (server.bluemap_url) {
            html += `
                    <div class="mc-detail-card mc-map-container">
                        <h3>\uD83D\uDDFA\uFE0F Server Map</h3>
                        <iframe src="${server.bluemap_url}" title="Server Map" loading="lazy" allowfullscreen></iframe>
                    </div>
            `;
        }

        html += '</div></div>';
        container.innerHTML = html;

        this._initChartRanges(serverId);
    },

    viewServerLeaderboard(serverId) {
        this.leaderboardServer = serverId;
        Router.go('/mc-leaderboard');
    },

    setChartMetric(metric, btn, serverId) {
        this.chartMetric = metric;
        if (btn) {
            btn.closest('.mc-chart-controls').querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        this.loadChart(serverId, this.chartRange);
    },

    async loadChart(serverId, range, btn) {
        this.chartRange = range;
        this.chartMetric = this.chartMetric || 'players';
        this._chartServerId = serverId;
        if (btn) {
            btn.closest('.mc-chart-controls').querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        const ddEl = document.getElementById('mc-chart-drilldown');
        if (ddEl) { ddEl.style.display = 'none'; ddEl.innerHTML = ''; }

        const canvas = document.getElementById('mc-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let data;
        try {
            data = await API.get(`/api/ext/minecraft/servers/${serverId}/history?range=${range}`);
        } catch { data = { records: [], stats: {} }; }

        const statsEl = document.getElementById('mc-chart-stats');
        if (statsEl && data.stats) {
            const s = data.stats;
            const uptimePct = (s.uptimePercentage || 0).toFixed(1);
            const uptimeColor = s.uptimePercentage >= 95 ? '#22c55e' : s.uptimePercentage >= 80 ? '#f59e0b' : '#ef4444';
            statsEl.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Uptime</span><span style="font-weight:700;color:${uptimeColor}">${uptimePct}%</span></div>
                <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Avg Players</span><span style="font-weight:700;color:#fff">${s.avgPlayers || 0}</span></div>
                <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Peak Players</span><span style="font-weight:700;color:var(--neon-cyan)">${s.peakPlayers || 0}</span></div>
                <div style="display:flex;flex-direction:column;gap:2px"><span style="font-size:0.7rem;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.05em">Data Points</span><span style="font-weight:700;color:rgba(255,255,255,0.6)">${s.totalChecks || 0}</span></div>
            `;
        }

        const records = data.records || [];
        const rangeHours = { '6h': 6, '12h': 12, '24h': 24, '3d': 72, '7d': 168, '10d': 240, '20d': 480, '30d': 720 };
        const isAggregated = (rangeHours[range] || 24) > 24;

        this._drawChart(canvas, records, isAggregated);

        // Wire up click handler for drill-down on multi-day views
        canvas.onclick = isAggregated ? (e) => this._handleChartClick(e, canvas) : null;
        canvas.title = isAggregated ? 'Click a bar to drill into that hour' : '';
    },

    async _initChartRanges(serverId) {
        const ALL_RANGES = [
            { key: '6h',  hours: 6   },
            { key: '12h', hours: 12  },
            { key: '24h', hours: 24  },
            { key: '3d',  hours: 72  },
            { key: '7d',  hours: 168 },
            { key: '10d', hours: 240 },
            { key: '20d', hours: 480 },
            { key: '30d', hours: 720 },
        ];

        let hoursAvailable = 0;
        try {
            const span = await API.get(`/api/ext/minecraft/servers/${serverId}/history/span`);
            hoursAvailable = span.hoursAvailable || 0;
        } catch { /* show at least short ranges */ }

        // Show a range if we have at least 1 hour of data within its window
        // Always include at least 6h so the chart always shows something
        const available = ALL_RANGES.filter(r => r.hours <= Math.max(6, hoursAvailable + 1));

        // Pick best default: prefer 24h, else the largest available
        const preferred = available.find(r => r.key === '24h') || available[available.length - 1];
        if (!available.find(r => r.key === this.chartRange)) {
            this.chartRange = preferred?.key || '6h';
        }

        const rangeEl = document.getElementById('mc-chart-range-btns');
        if (rangeEl) {
            rangeEl.innerHTML = available.map(r =>
                `<button class="mc-chart-btn range-btn${this.chartRange === r.key ? ' active' : ''}" onclick="MinecraftPage.loadChart('${serverId}','${r.key}',this)">${r.key}</button>`
            ).join('');
        }

        this.loadChart(serverId, this.chartRange);
    },

    _drawChart(canvas, records, isAggregated) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width = canvas.parentElement.clientWidth;
        const H = canvas.height = 200;
        ctx.clearRect(0, 0, W, H);

        if (records.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No history data yet', W / 2, H / 2);
            return;
        }

        const isUptime = this.chartMetric === 'uptime';
        const maxValue = isUptime ? 1 : Math.max(1, ...records.map(r => r.players_online || 0));
        const PAD = { left: 36, right: 8, top: 12, bottom: 22 };
        const chartW = W - PAD.left - PAD.right;
        const chartH = H - PAD.top - PAD.bottom;
        const barW = Math.max(1, Math.floor(chartW / records.length) - 1);

        // Store geometry for click mapping
        this._chartGeo = { records, barW, PAD, chartH, H, W };

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
            const y = PAD.top + chartH * frac;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        });

        // Y-axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        if (isUptime) {
            ctx.fillText('ON', PAD.left - 3, PAD.top + 10);
            ctx.fillText('OFF', PAD.left - 3, PAD.top + chartH);
        } else {
            ctx.fillText(maxValue, PAD.left - 3, PAD.top + 10);
            if (maxValue > 2) ctx.fillText(Math.round(maxValue / 2), PAD.left - 3, PAD.top + chartH / 2 + 4);
            ctx.fillText('0', PAD.left - 3, PAD.top + chartH + 1);
        }

        // X-axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const labelStep = Math.max(1, Math.floor(records.length / Math.min(7, records.length)));
        for (let i = 0; i < records.length; i += labelStep) {
            const d = new Date(records[i].checked_at);
            const label = isAggregated
                ? `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}h`
                : `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            ctx.fillText(label, PAD.left + i * (barW + 1) + barW / 2, H - 4);
        }

        // Drill-down hint
        if (isAggregated) {
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.font = 'italic 9px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('click bar to drill down', W - PAD.right, PAD.top + 9);
        }

        // Bars
        records.forEach((r, i) => {
            const x = PAD.left + i * (barW + 1);
            const value = isUptime ? (r.online ? 1 : 0) : (r.players_online || 0);
            const barH = isUptime
                ? (r.online ? chartH - 2 : 3)
                : (value > 0 ? Math.max(1, (value / maxValue) * (chartH - 2)) : 0);
            const y = PAD.top + chartH - barH;
            if (r.online) {
                const grad = ctx.createLinearGradient(x, y, x, PAD.top + chartH);
                grad.addColorStop(0, isUptime ? 'rgba(34,197,94,0.85)' : 'rgba(0,255,255,0.85)');
                grad.addColorStop(1, isUptime ? 'rgba(34,197,94,0.1)' : 'rgba(0,255,255,0.1)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(239,68,68,0.5)';
            }
            if (barH > 0) ctx.fillRect(x, y, barW, barH);
        });
    },

    _handleChartClick(e, canvas) {
        const geo = this._chartGeo;
        if (!geo) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const idx = Math.floor((clickX - geo.PAD.left) / (geo.barW + 1));
        if (idx < 0 || idx >= geo.records.length) return;
        this._drillDownHour(this._chartServerId, geo.records[idx].checked_at);
    },

    async _drillDownHour(serverId, hourIso) {
        const ddEl = document.getElementById('mc-chart-drilldown');
        if (!ddEl) return;
        const d = new Date(hourIso);
        const h0 = String(d.getHours()).padStart(2, '0');
        const h1 = String(d.getHours() + 1).padStart(2, '0');
        const label = `${d.getMonth()+1}/${d.getDate()} ${h0}:00 – ${h1}:00`;

        ddEl.style.display = 'block';
        ddEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <button class="mc-chart-btn" onclick="MinecraftPage._closeDrilldown()" style="padding:3px 10px;font-size:0.75rem">✕ Close</button>
                <span style="font-size:0.85rem;color:rgba(255,255,255,0.55)">Drill-down: <strong style="color:#fff">${label}</strong></span>
            </div>
            <div id="mc-drill-loading" style="text-align:center;padding:0.75rem;color:rgba(255,255,255,0.35);font-size:0.8rem">Loading per-minute data...</div>
        `;

        let raw;
        try {
            raw = await API.get(`/api/ext/minecraft/servers/${serverId}/history?hour=${encodeURIComponent(hourIso)}`);
        } catch { raw = { records: [] }; }

        const loadEl = document.getElementById('mc-drill-loading');
        if (loadEl) loadEl.remove();

        const records = raw.records || [];
        if (records.length === 0) {
            ddEl.insertAdjacentHTML('beforeend', '<p style="color:rgba(255,255,255,0.35);font-size:0.85rem;text-align:center">No data recorded for this hour</p>');
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.display = 'block';
        ddEl.appendChild(canvas);

        // Re-use draw logic with smaller height
        const isUptime = this.chartMetric === 'uptime';
        const maxValue = isUptime ? 1 : Math.max(1, ...records.map(r => r.players_online || 0));
        const ctx = canvas.getContext('2d');
        const W = canvas.width = ddEl.clientWidth;
        const H = canvas.height = 110;
        ctx.clearRect(0, 0, W, H);

        const PAD = { left: 36, right: 8, top: 8, bottom: 20 };
        const chartW = W - PAD.left - PAD.right;
        const chartH = H - PAD.top - PAD.bottom;
        const barW = Math.max(1, Math.floor(chartW / records.length) - 1);

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        [0, 0.5, 1].forEach(frac => {
            const y = PAD.top + chartH * frac;
            ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
        });

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        if (!isUptime) {
            ctx.fillText(maxValue, PAD.left - 3, PAD.top + 10);
            ctx.fillText('0', PAD.left - 3, PAD.top + chartH + 1);
        } else {
            ctx.fillText('ON', PAD.left - 3, PAD.top + 10);
            ctx.fillText('OFF', PAD.left - 3, PAD.top + chartH);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        const step = Math.max(1, Math.floor(records.length / 6));
        for (let i = 0; i < records.length; i += step) {
            const t = new Date(records[i].checked_at);
            ctx.fillText(`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`, PAD.left + i * (barW + 1) + barW / 2, H - 4);
        }

        records.forEach((r, i) => {
            const x = PAD.left + i * (barW + 1);
            const value = isUptime ? (r.online ? 1 : 0) : (r.players_online || 0);
            const barH = isUptime
                ? (r.online ? chartH - 2 : 3)
                : (value > 0 ? Math.max(1, (value / maxValue) * (chartH - 2)) : 0);
            const y = PAD.top + chartH - barH;
            if (r.online) {
                const grad = ctx.createLinearGradient(x, y, x, PAD.top + chartH);
                grad.addColorStop(0, isUptime ? 'rgba(34,197,94,0.85)' : 'rgba(0,200,255,0.9)');
                grad.addColorStop(1, isUptime ? 'rgba(34,197,94,0.1)' : 'rgba(0,200,255,0.1)');
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = 'rgba(239,68,68,0.5)';
            }
            if (barH > 0) ctx.fillRect(x, y, barW, barH);
        });
    },

    _closeDrilldown() {
        const ddEl = document.getElementById('mc-chart-drilldown');
        if (ddEl) { ddEl.style.display = 'none'; ddEl.innerHTML = ''; }
    },

    // ══════════════════════════════════════════════════════
    // LEADERBOARD TAB
    // ══════════════════════════════════════════════════════
    async renderLeaderboard(container) {
        // Always refresh metadata so server dropdown is up-to-date
        try {
            this.leaderboardMeta = await API.get('/api/ext/minecraft/leaderboard/meta');
        } catch {
            if (!this.leaderboardMeta) this.leaderboardMeta = { categories: {}, servers: [] };
        }

        container.innerHTML = '<div class="loading-spinner" style="text-align:center;padding:3rem">Loading leaderboard...</div>';

        const offset = (this.leaderboardPage - 1) * this.leaderboardLimit;
        let data;
        try {
            data = await API.get(`/api/ext/minecraft/leaderboard?stat=${this.leaderboardStat}&server_id=${this.leaderboardServer}&limit=${this.leaderboardLimit}&offset=${offset}`);
        } catch (err) {
            console.error('[MC] Leaderboard fetch error:', err);
            data = { entries: [], total: 0 };
        }

        const entries = data.entries || [];
        const total = data.total || 0;

        // Resolve names for leaderboard entries if they are UUIDs
        const needsResolution = entries.filter(e => {
            const name = e.minecraft_username || e.username;
            return name === e.minecraft_uuid || !name || (name.length > 30 && name.includes('-'));
        });

        if (needsResolution.length > 0) {
            await Promise.all(needsResolution.map(async e => {
                try {
                    const mojang = await fetch('https://api.ashcon.app/mojang/v2/user/' + e.minecraft_uuid).then(r => r.json());
                    if (mojang && mojang.username) {
                        e.minecraft_username = mojang.username;
                        e.username = mojang.username; // For unregistered fallback
                    }
                } catch (err) {
                    console.warn('[MC] Leaderboard name resolution failed for:', e.minecraft_uuid);
                }
            }));
        }

        let statSelectorHtml = `<div style="display:flex;gap:12px;margin-bottom:1rem;flex-wrap:wrap">
            <select class="input-field" style="width:auto;min-width:200px" onchange="MinecraftPage.changeLeaderboardFilter('server', this.value)">
                <option value="all" ${this.leaderboardServer === 'all' ? 'selected' : ''}>Network Total (All Servers)</option>
                ${(this.leaderboardMeta.servers || []).map(s => `<option value="${s.id}" ${this.leaderboardServer === s.id ? 'selected' : ''}>${this._esc(s.name)}</option>`).join('')}
            </select>
            
            <select class="input-field" style="width:auto;min-width:200px" onchange="MinecraftPage.changeLeaderboardFilter('stat', this.value)">
                ${Object.entries(this.leaderboardMeta.categories || {}).map(([cat, stats]) => `
                    <optgroup label="${cat.toUpperCase()}">
                        ${stats.map(s => `<option value="${s}" ${this.leaderboardStat === s ? 'selected' : ''}>${MinecraftPage.formatStatName(s)}</option>`).join('')}
                    </optgroup>
                `).join('')}
            </select>
            
            <button class="btn btn-secondary" style="margin-left:auto" onclick="MinecraftPage.renderLeaderboard(document.getElementById('mc-page-content'))">
                \uD83D\uDD04 Refresh
            </button>
        </div>`;

        if (entries.length === 0 && this.leaderboardPage === 1) {
            container.innerHTML = statSelectorHtml + '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">No leaderboard data yet for this stat/server combination.</div>';
            return;
        }

        let html = statSelectorHtml + `
            <table class="mc-leaderboard">
                <thead><tr>
                    <th style="width:60px;text-align:center">#</th>
                    <th>Player</th>
                    <th style="text-align:right">${MinecraftPage.formatStatName(this.leaderboardStat)}</th>
                </tr></thead>
                <tbody>
        `;

        entries.forEach((e, i) => {
            const rank = offset + i + 1;
            const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            // Use player_uuid for mc-heads (most reliable for skin lookup), fall back to username/MHF_Steve
            const headIdentifier = e.player_uuid || e.minecraft_username || e.username || 'MHF_Steve';
            const headUrl = `https://mc-heads.net/avatar/${headIdentifier}/20`;
            // Safe display name — never show raw undefined/null
            const displayName = e.minecraft_username || e.username || (e.player_uuid ? e.player_uuid.slice(0, 8) + '...' : '???');

            html += `
                <tr>
                    <td style="text-align:center"><span class="mc-rank ${rankClass}">${rank}</span></td>
                    <td style="display:flex;align-items:center;gap:8px">
                        <img src="${headUrl}" style="width:20px;height:20px;border-radius:3px" alt="">
                        <span>${this._esc(displayName)}</span>
                        ${!e.is_registered ? '<span style="font-size:0.7rem;color:rgba(255,255,255,0.3)">(unlinked)</span>' : ''}
                    </td>
                    <td style="text-align:right;font-weight:700;color:var(--neon-cyan)">${MinecraftPage.formatStat(this.leaderboardStat, e.stat_value)}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';

        // Add Pagination Controls
        if (total > this.leaderboardLimit) {
            const totalPages = Math.ceil(total / this.leaderboardLimit);
            html += `
                <div class="mc-pagination">
                    <button class="mc-page-btn" ${this.leaderboardPage <= 1 ? 'disabled' : ''} onclick="MinecraftPage.changeLeaderboardPage(-1)">
                        \u2190 Previous
                    </button>
                    <div class="mc-page-info">
                        Page <strong>${this.leaderboardPage}</strong> of <strong>${totalPages}</strong>
                        <span style="margin-left:8px;opacity:0.6">(${total} players)</span>
                    </div>
                    <button class="mc-page-btn" ${this.leaderboardPage >= totalPages ? 'disabled' : ''} onclick="MinecraftPage.changeLeaderboardPage(1)">
                        Next \u2192
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    changeLeaderboardFilter(type, value) {
        if (type === 'server') this.leaderboardServer = value;
        if (type === 'stat') this.leaderboardStat = value;
        this.leaderboardPage = 1;
        this.renderLeaderboard(document.getElementById('mc-page-content'));
    },

    changeLeaderboardPage(delta) {
        this.leaderboardPage += delta;
        this.renderLeaderboard(document.getElementById('mc-page-content'));
        // Scroll to top of leaderboard
        document.querySelector('.mc-tabs').scrollIntoView({ behavior: 'smooth' });
    },

    // ══════════════════════════════════════════════════════
    // LINK ACCOUNT TAB
    // ══════════════════════════════════════════════════════
    async renderLink(container) {
        const user = App.currentUser;
        if (!user) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">Log in to link your Minecraft account.</div>';
            return;
        }

        // Check existing link
        let link;
        try {
            link = await API.get('/api/ext/minecraft/account/' + user.id);
        } catch { link = { linked: false }; }

        // If username is missing or is just the UUID, try to fetch it from Ashcon (Mojang API proxy)
        if (link.linked && (link.minecraft_username === link.minecraft_uuid || !link.minecraft_username)) {
            try {
                const mojang = await fetch('https://api.ashcon.app/mojang/v2/user/' + link.minecraft_uuid).then(r => r.json());
                if (mojang && mojang.username) {
                    link.minecraft_username = mojang.username;
                }
            } catch (e) {
                console.warn('[MC] Could not fetch username for UUID:', link.minecraft_uuid);
            }
        }

        if (link.linked) {
            container.innerHTML = `
                <div class="mc-link-card" style="max-width:500px;margin:0 auto;text-align:center">
                    <h3 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:1rem">\u2705 Minecraft Account Linked</h3>
                    <div id="mc-profile-skin" style="width:150px;height:250px;margin:1.5rem auto;position:relative;background:rgba(0,0,0,0.2);border-radius:12px;overflow:hidden;border:1px solid var(--border-subtle)">
                        <div class="loading-spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>
                    </div>
                    <div class="mc-skin-username" style="font-size:1.1rem">${this._esc(link.minecraft_username)}</div>
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:4px">${link.minecraft_uuid}</p>
                    <div style="margin:1.5rem 0;color:var(--text-secondary);text-align:left;background:rgba(0,0,0,0.2);padding:1rem;border-radius:8px">
                        <h4 style="margin:0 0 12px 0;font-size:0.9rem;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.6)">Top Network Stats</h4>
                        ${(link.top_stats || []).slice(0, 3).map(s => `
                            <div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.05);padding:8px 0;last-child:border-bottom:none">
                                <span>${MinecraftPage.formatStatName(s.stat_key)}</span>
                                <strong style="color:var(--neon-cyan)">${MinecraftPage.formatStat(s.stat_key, s.total)}</strong>
                            </div>
                        `).join('') || '<div style="opacity:0.5;text-align:center;padding:1rem">No stats synced yet. Play on a server!</div>'}
                    </div>
                    <button class="btn btn-secondary" onclick="MinecraftPage.unlinkAccount()" style="margin-top:0.5rem">\uD83D\uDD17 Unlink Account</button>
                </div>
            `;

            // Initialize Skin Viewer
            setTimeout(() => {
                if (!window.skin3d) {
                    const script = document.createElement('script');
                    script.src = '/ext/minecraft/lib/skin3d.umd.js';
                    script.onload = () => this.initSkinViewer(link.minecraft_uuid, 'mc-profile-skin');
                    document.head.appendChild(script);
                } else {
                    this.initSkinViewer(link.minecraft_uuid, 'mc-profile-skin');
                }
            }, 50);
        } else {
            container.innerHTML = `
                <div class="mc-link-card" style="max-width:500px;margin:0 auto">
                    <h3 style="text-align:center;margin-bottom:1rem;font-family:var(--font-display)">\uD83D\uDD17 Link Minecraft Account</h3>
                    <p style="color:var(--text-muted);text-align:center;margin-bottom:1.5rem;font-size:0.95rem">
                        Run <code style="background:rgba(0,240,255,0.1);color:var(--neon-cyan);padding:2px 6px;border-radius:4px;font-family:var(--font-mono)">/link</code> on any connected server to get a 6-character code.
                    </p>
                    <div class="mc-link-input">
                        <input type="text" id="mc-link-code" placeholder="ABCDEF" maxlength="6" class="input-field">
                        <button class="btn btn-primary" onclick="MinecraftPage.submitLinkCode()">Link</button>
                    </div>
                    <div id="mc-link-result" style="margin-top:12px;text-align:center;font-size:0.85rem"></div>
                </div>
            `;
        }
    },

    async submitLinkCode() {
        const code = document.getElementById('mc-link-code').value.trim();
        const resultEl = document.getElementById('mc-link-result');
        if (!code || code.length !== 6) {
            resultEl.innerHTML = '<span style="color:var(--neon-magenta)">Enter a valid 6-character code</span>';
            return;
        }
        try {
            const res = await API.post('/api/ext/minecraft/link', { code });
            resultEl.innerHTML = '<span style="color:var(--neon-green)">\u2713 ' + (res.message || 'Linked!') + '</span>';
            setTimeout(() => this.renderLink(document.getElementById('mc-page-content')), 1500);
        } catch (err) {
            resultEl.innerHTML = '<span style="color:var(--neon-magenta)">\u2717 ' + (err.message || 'Failed') + '</span>';
        }
    },

    initSkinViewer(uuid, containerId) {
        try {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';

            const canvas = document.createElement('canvas');
            container.appendChild(canvas);

            const viewer = new window.skin3d.Render({
                canvas: canvas,
                width: 150,
                height: 200,
                skin: 'https://minotar.net/skin/' + uuid,
                autoRotate: true
            });

            viewer.animation = new window.skin3d.WalkingAnimation();
        } catch (e) {
            console.error('Failed to init skin viewer', e);
            const container = document.getElementById(containerId);
            if (container) container.innerHTML = `<img src="https://mc-heads.net/body/${uuid}/150" alt="Skin fallback" style="image-rendering:pixelated;margin:auto;display:block;height:100%">`;
        }
    },

    async unlinkAccount() {
        if (!confirm('Are you sure you want to unlink your Minecraft account?')) return;
        try {
            await API.delete('/api/ext/minecraft/link');
            App.showToast('Minecraft account unlinked', 'success');
            this.renderLink(document.getElementById('mc-page-content'));
        } catch (err) {
            App.showToast(err.message || 'Failed', 'error');
        }
    },

    // ── Helpers ──
    formatStat(key, value) {
        if (!value) return "0";
        if (key.includes('time')) {
            const seconds = Math.floor(value / 20);
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            if (h > 0) return `${h}h ${m}m`;
            return `${m}m`;
        }
        if (key.includes('one_cm')) {
            const m = value / 100;
            if (m > 1000) return (m / 1000).toFixed(2) + ' km';
            return Math.floor(m) + ' m';
        }
        if (key.includes('damage')) {
            return (value / 10).toFixed(1) + ' \u2764';
        }
        return value.toLocaleString();
    },

    formatStatName(key) {
        if (!key) return '';
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            .replace('One Cm', 'Distance').replace('Play Time', 'Playtime');
    },

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};
