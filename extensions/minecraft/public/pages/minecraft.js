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

    async render(container, params) {
        // If a server ID is in the route, show detail page
        if (params && params[0]) {
            return this.renderServerDetail(container, params[0]);
        }

        container.innerHTML = `
            <div class="minecraft-page" style="max-width: 1000px; margin: 0 auto;">
                <h1 style="margin-bottom:0.5rem">⛏️ Minecraft</h1>
                <p style="color:rgba(255,255,255,0.5);margin-bottom:1.5rem">Live server status, leaderboards, and account linking.</p>
                <div class="mc-tabs">
                    <button class="mc-tab active" data-tab="servers">🖥️ Servers</button>
                    <button class="mc-tab" data-tab="leaderboard">🏆 Leaderboard</button>
                    <button class="mc-tab" data-tab="link">🔗 Link Account</button>
                </div>
                <div id="mc-tab-content"></div>
            </div>
        `;

        container.querySelectorAll('.mc-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.mc-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.renderTab(document.getElementById('mc-tab-content'));
            });
        });

        this.renderTab(document.getElementById('mc-tab-content'));
    },

    renderTab(container) {
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

        if (this.servers.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:4rem 1rem">
                    <div style="font-size:3rem;margin-bottom:1rem">🖥️</div>
                    <h2>No Servers Configured</h2>
                    <p style="color:rgba(255,255,255,0.5)">Admins can add servers from the admin dashboard.</p>
                </div>`;
            return;
        }

        const totalPlayers = this.servers.reduce((sum, s) => sum + (s.players?.online || 0), 0);
        const onlineCount = this.servers.filter(s => s.online).length;

        let html = `
            <div style="display:flex;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap;align-items:center">
                <span class="mc-badge online"><span class="dot"></span>${totalPlayers} Players Online</span>
                <span class="mc-badge ${onlineCount > 0 ? 'online' : 'offline'}">${onlineCount}/${this.servers.length} Servers</span>
            </div>
            <div class="mc-server-grid">
        `;

        for (const s of this.servers) {
            const address = s.hide_port || s.port === 25565 ? s.address : s.address + ':' + s.port;
            const iconHtml = s.icon && s.icon.startsWith('data:')
                ? `<img class="mc-server-icon" src="${s.icon}" alt="${s.name}">`
                : `<div class="mc-server-icon-placeholder">⛏</div>`;

            html += `
                <div class="mc-server-card" data-server-id="${s.id}">
                    <div class="status-bar ${s.online ? 'online' : 'offline'}"></div>
                    <div class="mc-server-header">
                        ${iconHtml}
                        <div style="flex:1">
                            <div class="mc-server-name">${this._esc(s.name)}</div>
                            <div class="mc-server-version">${s.version || 'Unknown'}</div>
                        </div>
                        <span class="mc-badge ${s.online ? 'online' : 'offline'}">
                            <span class="dot"></span>${s.online ? 'Online' : 'Offline'}
                        </span>
                    </div>
                    ${s.description ? `<p style="font-size:0.85rem;color:rgba(255,255,255,0.6);margin-bottom:8px">${this._esc(s.description)}</p>` : ''}
                    ${s.motd ? `<div class="mc-server-motd">${this._esc(s.motd)}</div>` : ''}
                    <div class="mc-server-stats">
                        <div class="mc-stat">👤 <span class="value">${s.players?.online || 0}</span>/<span>${s.players?.max || 0}</span></div>
                        ${s.modpack_name ? `<div class="mc-stat">📦 ${this._esc(s.modpack_name)}</div>` : ''}
                    </div>
                    <div class="mc-ip-bar">
                        <span>🌐</span>
                        <code style="flex:1">${address}</code>
                        <button class="mc-btn mc-btn-copy" onclick="MinecraftPage.copyIP('${address}', this)">📋 Copy</button>
                    </div>
                    <div class="mc-btn-group" style="align-items:center">
                        ${s.user_linked ? `<div style="font-size:0.9rem;font-weight:600;color:var(--neon-cyan);margin-right:8px">✨ ${(s.user_xp || 0).toLocaleString()} XP</div>` : ''}
                        ${s.curseforge_url ? `<a href="${s.curseforge_url}" target="_blank" class="mc-btn mc-btn-curseforge"><img src="https://www.curseforge.com/favicon.ico" alt="CF">CurseForge</a>` : ''}
                        ${s.modrinth_url ? `<a href="${s.modrinth_url}" target="_blank" class="mc-btn mc-btn-modrinth"><img src="https://modrinth.com/favicon.ico" alt="MR">Modrinth</a>` : ''}
                        ${s.bluemap_url ? `<a href="${s.bluemap_url}" target="_blank" class="mc-btn mc-btn-map">🗺️ Map</a>` : ''}
                        <button class="mc-btn" onclick="MinecraftPage.viewServer('${s.id}')" style="margin-left:auto">View Details →</button>
                    </div>
                </div>
            `;
        }
        html += '</div>';
        container.innerHTML = html;
    },

    copyIP(ip, btn) {
        navigator.clipboard.writeText(ip).then(() => {
            btn.classList.add('copied');
            btn.textContent = '✓ Copied!';
            setTimeout(() => { btn.classList.remove('copied'); btn.textContent = '📋 Copy'; }, 2000);
        });
    },

    viewServer(id) {
        window.location.hash = '#/servers/' + id;
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
            : `<div class="mc-server-icon-placeholder" style="width:64px;height:64px;font-size:28px">⛏</div>`;

        let html = `
            <div class="minecraft-page" style="max-width: 1000px; margin: 0 auto;">
                <button class="mc-btn" onclick="window.location.hash='#/servers'" style="margin-bottom:1rem">← Back to Servers</button>

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
                                <span class="value">${server.responseTimeMs || '—'}ms</span>
                            </div>
                        </div>
                        <div class="mc-ip-bar" style="margin-top:12px">
                            <span>🌐</span>
                            <code style="flex:1">${address}</code>
                            <button class="mc-btn mc-btn-copy" onclick="MinecraftPage.copyIP('${address}', this)">📋 Copy</button>
                        </div>
                        <div class="mc-btn-group">
                            ${server.curseforge_url ? `<a href="${server.curseforge_url}" target="_blank" class="mc-btn mc-btn-curseforge"><img src="https://www.curseforge.com/favicon.ico" alt="CF">CurseForge</a>` : ''}
                            ${server.modrinth_url ? `<a href="${server.modrinth_url}" target="_blank" class="mc-btn mc-btn-modrinth"><img src="https://modrinth.com/favicon.ico" alt="MR">Modrinth</a>` : ''}
                            ${server.bluemap_url ? `<a href="${server.bluemap_url}" target="_blank" class="mc-btn mc-btn-map">🗺️ Map</a>` : ''}
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
                        <div class="mc-chart-controls">
                            <button class="mc-chart-btn range-btn ${this.chartRange === '1h' ? 'active' : ''}" onclick="MinecraftPage.loadChart('${serverId}','1h',this)">1h</button>
                            <button class="mc-chart-btn range-btn ${this.chartRange === '7h' ? 'active' : ''}" onclick="MinecraftPage.loadChart('${serverId}','7h',this)">7h</button>
                            <button class="mc-chart-btn range-btn ${this.chartRange === '24h' ? 'active' : ''}" onclick="MinecraftPage.loadChart('${serverId}','24h',this)">24h</button>
                            <button class="mc-chart-btn range-btn ${this.chartRange === '7d' ? 'active' : ''}" onclick="MinecraftPage.loadChart('${serverId}','7d',this)">7d</button>
                        </div>
                        <canvas id="mc-chart" class="mc-chart-canvas"></canvas>
                    </div>
        `;

        // Map iframe (only if configured)
        if (server.bluemap_url) {
            html += `
                    <div class="mc-detail-card mc-map-container">
                        <h3>🗺️ Server Map</h3>
                        <iframe src="${server.bluemap_url}" title="Server Map" loading="lazy" allowfullscreen></iframe>
                    </div>
            `;
        }

        html += '</div></div>';
        container.innerHTML = html;

        // Load chart
        this.loadChart(serverId, this.chartRange);
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
        if (btn) {
            btn.closest('.mc-chart-controls').querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        const canvas = document.getElementById('mc-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let data;
        try {
            data = await API.get(`/api/ext/minecraft/servers/${serverId}/history?range=${range}`);
        } catch { data = { records: [], stats: {} }; }

        const records = data.records || [];
        if (records.length === 0) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No history data yet', canvas.width / 2, canvas.height / 2);
            return;
        }

        // Draw a simple bar chart
        const W = canvas.width = canvas.parentElement.clientWidth;
        const H = canvas.height = 200;
        ctx.clearRect(0, 0, W, H);

        const isUptime = this.chartMetric === 'uptime';
        const maxValue = isUptime ? 1 : Math.max(1, ...records.map(r => r.players_online || 0));
        const barW = Math.max(1, Math.floor((W - 40) / records.length) - 1);
        const startX = 30;

        // Y axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(isUptime ? 'ON' : maxValue, 25, 15);
        ctx.fillText(isUptime ? 'OFF' : '0', 25, H - 5);

        // Grid line
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(startX, H - 2);
        ctx.lineTo(W, H - 2);
        ctx.stroke();

        records.forEach((r, i) => {
            const x = startX + i * (barW + 1);
            const value = isUptime ? (r.online ? 1 : 0) : (r.players_online || 0);
            const h = isUptime ? (r.online ? H - 20 : 4) : ((value / maxValue) * (H - 20));

            if (r.online) {
                const grad = ctx.createLinearGradient(x, H - h - 2, x, H - 2);
                grad.addColorStop(0, isUptime ? 'rgba(34,197,94,0.8)' : 'rgba(0,255,255,0.8)');
                grad.addColorStop(1, isUptime ? 'rgba(34,197,94,0.2)' : 'rgba(0,255,255,0.2)');
                ctx.fillStyle = grad;
                ctx.fillRect(x, H - h - 2, barW, h);
            } else {
                ctx.fillStyle = 'rgba(255,0,0,0.5)';
                ctx.fillRect(x, H - 8, barW, 6);
            }
        });
    },

    // ══════════════════════════════════════════════════════
    // LEADERBOARD TAB
    // ══════════════════════════════════════════════════════
    async renderLeaderboard(container) {
        container.innerHTML = '<div class="loading-spinner" style="text-align:center;padding:3rem">Loading leaderboard...</div>';

        let entries;
        try {
            entries = await API.get('/api/ext/minecraft/leaderboard?limit=50');
        } catch { entries = []; }

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

        if (entries.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:rgba(255,255,255,0.5)">No leaderboard data yet.</div>';
            return;
        }

        let html = `
            <table class="mc-leaderboard">
                <thead><tr>
                    <th>#</th><th>Player</th><th>Site XP</th><th>MC XP</th><th>Total XP</th><th>Level</th>
                </tr></thead>
                <tbody>
        `;

        entries.forEach((e, i) => {
            const rank = i + 1;
            const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            const headUrl = e.minecraft_uuid
                ? `https://mc-heads.net/avatar/${e.minecraft_uuid}/20`
                : (e.avatar || '/img/default-avatar.png');

            html += `
                <tr>
                    <td><span class="mc-rank ${rankClass}">${rank}</span></td>
                    <td style="display:flex;align-items:center;gap:8px">
                        <img src="${headUrl}" style="width:20px;height:20px;border-radius:3px" alt="">
                        <span>${this._esc(e.minecraft_username || e.username)}</span>
                        ${!e.is_registered ? '<span style="font-size:0.7rem;color:rgba(255,255,255,0.3)">(unlinked)</span>' : ''}
                    </td>
                    <td>${(e.site_xp || 0).toLocaleString()}</td>
                    <td>${(e.minecraft_xp || 0).toLocaleString()}</td>
                    <td style="font-weight:700;color:var(--neon-cyan)">${(e.total_xp || 0).toLocaleString()}</td>
                    <td>${e.level || 1}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
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
                    <h3 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:1rem">✅ Minecraft Account Linked</h3>
                    <div id="mc-profile-skin" style="width:150px;height:250px;margin:1.5rem auto;position:relative;background:rgba(0,0,0,0.2);border-radius:12px;overflow:hidden;border:1px solid var(--border-subtle)">
                        <div class="loading-spinner" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)"></div>
                    </div>
                    <div class="mc-skin-username" style="font-size:1.1rem">${this._esc(link.minecraft_username)}</div>
                    <p style="font-size:0.85rem;color:var(--text-muted);margin-top:4px">${link.minecraft_uuid}</p>
                    <p style="color:var(--text-secondary);margin:1.5rem 0">MC XP: <strong style="color:var(--neon-cyan);font-size:1.1rem">${(link.minecraft_xp || 0).toLocaleString()}</strong></p>
                    <button class="btn btn-secondary" onclick="MinecraftPage.unlinkAccount()" style="margin-top:0.5rem">🔗 Unlink Account</button>
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
                    <h3 style="text-align:center;margin-bottom:1rem;font-family:var(--font-display)">🔗 Link Minecraft Account</h3>
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
            resultEl.innerHTML = '<span style="color:var(--neon-green)">✓ ' + (res.message || 'Linked!') + '</span>';
            setTimeout(() => this.renderLink(document.getElementById('mc-tab-content')), 1500);
        } catch (err) {
            resultEl.innerHTML = '<span style="color:var(--neon-magenta)">✗ ' + (err.message || 'Failed') + '</span>';
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
            this.renderLink(document.getElementById('mc-tab-content'));
        } catch (err) {
            App.showToast(err.message || 'Failed', 'error');
        }
    },

    // ── Helpers ──
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
