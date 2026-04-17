/* =======================================
   Minecraft Extension — Admin Page
   Manages MC Servers via the extension's DB
   ======================================= */
var MinecraftAdminPage = {
    servers: [],
    editingServer: null,

    async render(container) {
        if (!App.currentUser || !['admin', 'superadmin'].includes(App.currentUser.role)) {
            container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>Admin only.</p></div>';
            return;
        }

        container.innerHTML = `
            <div style="max-width:900px;margin:0 auto">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;gap:1rem">
                    <div>
                        <h2 style="margin:0 0 4px;font-size:1.4rem">⛏️ Minecraft Servers</h2>
                        <p style="margin:0;color:var(--text-muted);font-size:0.85rem">Manage server listings, API keys, and external links.</p>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0">
                        <button class="btn btn-secondary btn-sm" onclick="Router.go('/admin')">← Back</button>
                        <button class="btn btn-primary btn-sm" onclick="MinecraftAdminPage.openForm()">+ Add Server</button>
                    </div>
                </div>

                <div id="mc-admin-list">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;

        this.loadServers();
    },

    async loadServers() {
        const list = document.getElementById('mc-admin-list');
        if (!list) return;
        try {
            this.servers = await API.get('/api/minecraft/servers');
            if (this.servers.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                        <h3>No servers yet</h3>
                        <p>Click <strong>+ Add Server</strong> to get started.</p>
                    </div>`;
                return;
            }

            list.innerHTML = this.servers.map((s, i) => `
                <div class="admin-settings-card animate-fade-up" style="animation-delay:${i * 0.04}s;margin-bottom:1rem">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
                        <div style="display:flex;gap:14px;align-items:flex-start;flex:1;min-width:0">
                            <div style="width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--neon-cyan),var(--neon-magenta));display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">⛏️</div>
                            <div style="flex:1;min-width:0">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                                    <span style="font-weight:700;font-size:1rem">${this._esc(s.name)}</span>
                                    ${s.is_bedrock
                                        ? '<span class="badge badge-level">Bedrock</span>'
                                        : '<span class="badge badge-online">Java</span>'}
                                </div>
                                <div style="font-family:var(--font-mono);font-size:0.78rem;color:var(--neon-cyan);margin-bottom:6px">
                                    ${this._esc(s.address)}${s.hide_port ? '' : ':' + s.port}
                                </div>
                                <p style="font-size:0.83rem;color:var(--text-muted);margin:0;line-height:1.5">
                                    ${this._esc(s.description || 'No description')}
                                </p>
                                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
                                    ${s.modpack_name ? `<span class="badge" style="background:rgba(0,240,255,0.08);color:var(--neon-cyan);border:1px solid rgba(0,240,255,0.15)">📦 ${this._esc(s.modpack_name)}</span>` : ''}
                                    ${s.curseforge_url ? '<span class="badge" style="background:rgba(241,99,34,0.1);color:#f16322;border:1px solid rgba(241,99,34,0.2)">CurseForge</span>' : ''}
                                    ${s.modrinth_url   ? '<span class="badge" style="background:rgba(30,200,115,0.1);color:#1ec873;border:1px solid rgba(30,200,115,0.2)">Modrinth</span>' : ''}
                                    ${s.bluemap_url    ? '<span class="badge" style="background:rgba(0,150,255,0.1);color:#4da6ff;border:1px solid rgba(0,150,255,0.2)">🗺 Map</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                            <button class="btn btn-secondary btn-sm" onclick="MinecraftAdminPage.editServer('${s.id}')">✏️ Edit</button>
                            <button class="btn btn-sm" style="background:rgba(0,240,255,0.08);color:var(--neon-cyan);border:1px solid rgba(0,240,255,0.2)" onclick="MinecraftAdminPage.regenerateKey('${s.id}')">🔑 API Key</button>
                            <button class="btn btn-danger btn-sm" onclick="MinecraftAdminPage.deleteServer('${s.id}','${this._esc(s.name)}')">🗑 Delete</button>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            list.innerHTML = `<div class="empty-state"><p>Failed to load servers: ${err.message || 'Unknown error'}</p></div>`;
        }
    },

    /** Open add/edit form in a modal */
    openForm(server = null) {
        this.editingServer = server;
        const title = server ? `✏️ Edit — ${this._esc(server.name)}` : '➕ Add New Server';

        const v = (field, fallback = '') => server ? (server[field] ?? fallback) : fallback;

        const body = `
            <div style="display:flex;flex-direction:column;gap:0">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                    ${this._mf('mc-f-name',    'Server Name *',   'text',   'My Awesome Server',      v('name'))}
                    ${this._mf('mc-f-address',  'Server Address *','text',   'play.example.com',       v('address'))}
                    ${this._mf('mc-f-port',     'Port',            'number', '25565',                  v('port', 25565))}
                    ${this._mf('mc-f-sort',     'Sort Order',      'number', '0',                      v('sort_order', 0))}
                </div>
                ${this._mf('mc-f-desc', 'Description', 'textarea', 'A great survival experience...', v('description'), true)}

                <div style="display:flex;gap:1.5rem;padding:10px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:10px">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.875rem">
                        <input type="checkbox" id="mc-f-hideport" ${v('hide_port') ? 'checked' : ''} style="accent-color:var(--neon-cyan)">
                        Hide Port in UI
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.875rem">
                        <input type="checkbox" id="mc-f-bedrock" ${v('is_bedrock') ? 'checked' : ''} style="accent-color:var(--neon-cyan)">
                        Bedrock Edition (Geyser)
                    </label>
                </div>

                <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px">External Links (Optional)</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    ${this._mf('mc-f-modpack',    'Modpack Name',      'text', 'e.g. All The Mods 9',          v('modpack_name'))}
                    ${this._mf('mc-f-curseforge', 'CurseForge URL',    'text', 'https://www.curseforge.com/…', v('curseforge_url'))}
                    ${this._mf('mc-f-modrinth',   'Modrinth URL',      'text', 'https://modrinth.com/…',       v('modrinth_url'))}
                    ${this._mf('mc-f-bluemap',    'Bluemap / Map URL', 'text', 'http://map.example.com',       v('bluemap_url'))}
                </div>

                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-subtle)">
                    <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="MinecraftAdminPage.saveServer()">
                        ${server ? 'Save Changes' : 'Create Server'}
                    </button>
                </div>
            </div>
        `;

        App.showModal(title, body);
    },

    editServer(id) {
        const s = this.servers.find(x => x.id === id);
        if (s) this.openForm(s);
    },

    async saveServer() {
        const payload = {
            name:          document.getElementById('mc-f-name').value.trim(),
            address:       document.getElementById('mc-f-address').value.trim(),
            port:          parseInt(document.getElementById('mc-f-port').value) || 25565,
            sort_order:    parseInt(document.getElementById('mc-f-sort').value) || 0,
            description:   document.getElementById('mc-f-desc').value.trim(),
            hide_port:     document.getElementById('mc-f-hideport').checked,
            is_bedrock:    document.getElementById('mc-f-bedrock').checked,
            modpack_name:  document.getElementById('mc-f-modpack').value.trim(),
            curseforge_url:document.getElementById('mc-f-curseforge').value.trim(),
            modrinth_url:  document.getElementById('mc-f-modrinth').value.trim(),
            bluemap_url:   document.getElementById('mc-f-bluemap').value.trim()
        };

        if (!payload.name || !payload.address) {
            App.showToast('Server Name and Address are required.', 'error');
            return;
        }

        try {
            if (this.editingServer) {
                await API.put('/api/minecraft/admin/servers/' + this.editingServer.id, payload);
                App.showToast('Server updated!', 'success');
                App.closeModal();
            } else {
                const created = await API.post('/api/minecraft/admin/servers', payload);
                App.closeModal();
                // Show API key in a dedicated modal so it's readable
                this._showApiKeyModal(created.api_key, payload.name);
            }
            this.loadServers();
        } catch (err) {
            App.showToast(err.message || 'Failed to save server.', 'error');
        }
    },

    async deleteServer(id, name) {
        const confirmed = await App.confirm(
            '🗑 Delete Server',
            `Are you sure you want to delete <strong>${this._esc(name)}</strong>? This will permanently erase all associated XP data and statistics.`
        );
        if (!confirmed) return;
        try {
            await API.delete('/api/minecraft/admin/servers/' + id);
            App.showToast('Server deleted.', 'success');
            this.loadServers();
        } catch (err) {
            App.showToast(err.message || 'Failed to delete.', 'error');
        }
    },

    async regenerateKey(id) {
        const confirmed = await App.confirm(
            '🔑 Regenerate API Key',
            'Any plugins currently using the old key will stop working immediately. Continue?'
        );
        if (!confirmed) return;
        try {
            const res = await API.post('/api/minecraft/admin/servers/' + id + '/regenerate-key');
            this._showApiKeyModal(res.api_key);
        } catch (err) {
            App.showToast(err.message || 'Failed to regenerate key.', 'error');
        }
    },

    /** Show a clean modal with the API key and a copy button */
    _showApiKeyModal(key, serverName = null) {
        const intro = serverName
            ? `<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">Server <strong>${this._esc(serverName)}</strong> created. Copy the API key below and add it to your server plugin config. <strong>You won't be able to see it again.</strong></p>`
            : `<p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:1rem">New API key generated. Copy it now — <strong>it won't be shown again.</strong></p>`;

        const body = `
            ${intro}
            <div style="font-family:var(--font-mono);font-size:0.82rem;padding:12px 14px;background:rgba(0,240,255,0.06);border:1px solid rgba(0,240,255,0.2);border-radius:8px;color:var(--neon-cyan);word-break:break-all;user-select:all;margin-bottom:1rem">${this._esc(key)}</div>
            <div style="display:flex;justify-content:flex-end;gap:8px">
                <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
                <button class="btn btn-primary" onclick="navigator.clipboard.writeText('${this._esc(key)}');App.showToast('Copied!','success')">📋 Copy Key</button>
            </div>
        `;
        App.showModal('🔑 API Key', body);
    },

    /** Render a modal form field */
    _mf(id, label, type, placeholder, value = '', fullWidth = false) {
        const input = type === 'textarea'
            ? `<textarea id="${id}" class="input-field" rows="2" placeholder="${placeholder}" style="font-size:0.875rem">${this._esc(String(value))}</textarea>`
            : `<input type="${type}" id="${id}" class="input-field" placeholder="${placeholder}" value="${this._esc(String(value))}" style="font-size:0.875rem">`;
        return `<div${fullWidth ? ' style="margin-bottom:10px"' : ''}>
            <label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:4px">${label}</label>
            ${input}
        </div>`;
    },

    _esc(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
};
