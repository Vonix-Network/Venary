/* =======================================
   Minecraft Extension — Admin Page
   Manages MC Servers via the extension's DB
   ======================================= */
var MinecraftAdminPage = {
    servers: [],
    editingServer: null,

    async render(container, params) {
        if (!App.currentUser || App.currentUser.role !== 'admin') {
            container.innerHTML = '<div class="minecraft-admin-page"><div class="empty-state"><h2>Access Denied</h2><p>Admin only.</p></div></div>';
            return;
        }

        container.innerHTML = `
            <div class="minecraft-admin-page">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <h1 style="margin:0">🧩 Servers</h1>
                    <div style="display:flex;gap:12px">
                        <button class="btn btn-secondary" onclick="window.location.hash='#/admin'">← Back to Dashboard</button>
                        <button class="btn btn-primary" onclick="MinecraftAdminPage.openForm()">+ Add Server</button>
                    </div>
                </div>

                <div id="mc-admin-form" class="card hidden" style="margin-bottom:1.5rem;border:1px solid var(--neon-cyan)">
                    <h3 id="mc-form-title" style="margin-bottom:1rem">Add New Server</h3>
                    <div class="mc-admin-form">
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Server Name *</label>
                            <input type="text" id="mc-f-name" class="input-field" placeholder="My Awesome Server">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Server Address *</label>
                            <input type="text" id="mc-f-address" class="input-field" placeholder="play.example.com">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Port</label>
                            <input type="number" id="mc-f-port" class="input-field" value="25565">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Sort Order</label>
                            <input type="number" id="mc-f-sort" class="input-field" value="0">
                        </div>
                        <div class="full-width">
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Description</label>
                            <textarea id="mc-f-desc" class="input-field" rows="2" placeholder="A great survival experience..."></textarea>
                        </div>
                        <div class="full-width" style="display:flex;gap:1.5rem;align-items:center;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                <input type="checkbox" id="mc-f-hideport"> <span style="font-size:0.9rem">Hide Port in UI</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                                <input type="checkbox" id="mc-f-bedrock"> <span style="font-size:0.9rem">Bedrock Edition (Geyser)</span>
                            </label>
                        </div>
                        <h4 class="full-width" style="margin-top:0.5rem;color:var(--text-muted);border-bottom:1px solid var(--border-primary);padding-bottom:4px">External Links (Optional)</h4>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Modpack Name</label>
                            <input type="text" id="mc-f-modpack" class="input-field" placeholder="e.g. All The Mods 9">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">CurseForge URL</label>
                            <input type="text" id="mc-f-curseforge" class="input-field" placeholder="https://www.curseforge.com/...">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Modrinth URL</label>
                            <input type="text" id="mc-f-modrinth" class="input-field" placeholder="https://modrinth.com/...">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Bluemap / Web Map URL</label>
                            <input type="text" id="mc-f-bluemap" class="input-field" placeholder="http://map.example.com">
                        </div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:1.5rem">
                        <button class="btn btn-secondary" onclick="MinecraftAdminPage.closeForm()">Cancel</button>
                        <button class="btn btn-primary" onclick="MinecraftAdminPage.saveServer()">Save Server</button>
                    </div>
                </div>

                <div id="mc-admin-list" class="stagger-children">
                    <div class="loading-spinner"></div>
                </div>
            </div>
        `;

        this.loadServers();
    },

    async loadServers() {
        const listContainer = document.getElementById('mc-admin-list');
        if (!listContainer) return;

        // Let's modify the app's script block to request the public endpoint. 
        // We can't see the API key, but we don't really need to unless we are regenerating it. Let's just regenerate it when needed.
        try {
            this.servers = await API.get('/api/ext/minecraft/servers');
            if (this.servers.length === 0) {
                listContainer.innerHTML = '<div class="empty-state"><p>No servers configured.</p></div>';
                return;
            }

            let html = '';
            for (let i = 0; i < this.servers.length; i++) {
                const s = this.servers[i];
                html += `
                    <div class="card" style="margin-bottom:1rem;animation-delay:${i * 0.05}s">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start">
                            <div>
                                <h3 style="margin-bottom:4px">${this._esc(s.name)} <span style="color:var(--text-muted);font-weight:normal;font-size:0.85rem">(${s.address}:${s.port})</span></h3>
                                <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">${this._esc(s.description || 'No description')}</p>
                                
                                <div style="display:flex;gap:8px;flex-wrap:wrap">
                                    ${s.is_bedrock ? '<span class="badge badge-level">Bedrock</span>' : '<span class="badge badge-online">Java</span>'}
                                    <button class="btn btn-sm btn-secondary" onclick="MinecraftAdminPage.regenerateKey('${s.id}')">🔑 Generate API Key</button>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px">
                                <button class="btn btn-sm btn-secondary" onclick="MinecraftAdminPage.editServer('${s.id}')">Edit</button>
                                <button class="btn btn-sm btn-danger" onclick="MinecraftAdminPage.deleteServer('${s.id}', '${this._esc(s.name)}')">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            }
            listContainer.innerHTML = html;
        } catch (err) {
            listContainer.innerHTML = '<div class="empty-state"><p>Failed to load servers: ' + (err.message || 'Error') + '</p></div>';
        }
    },

    openForm(server = null) {
        this.editingServer = server;
        document.getElementById('mc-form-title').textContent = server ? 'Edit Server' : 'Add New Server';

        document.getElementById('mc-f-name').value = server ? server.name : '';
        document.getElementById('mc-f-address').value = server ? server.address : '';
        document.getElementById('mc-f-port').value = server ? server.port : 25565;
        document.getElementById('mc-f-sort').value = server ? (server.sort_order || 0) : 0;
        document.getElementById('mc-f-desc').value = server ? (server.description || '') : '';
        document.getElementById('mc-f-hideport').checked = server ? !!server.hide_port : false;
        document.getElementById('mc-f-bedrock').checked = server ? !!server.is_bedrock : false;
        document.getElementById('mc-f-modpack').value = server ? (server.modpack_name || '') : '';
        document.getElementById('mc-f-curseforge').value = server ? (server.curseforge_url || '') : '';
        document.getElementById('mc-f-modrinth').value = server ? (server.modrinth_url || '') : '';
        document.getElementById('mc-f-bluemap').value = server ? (server.bluemap_url || '') : '';

        document.getElementById('mc-admin-form').classList.remove('hidden');
        window.scrollTo(0, 0);
    },

    closeForm() {
        document.getElementById('mc-admin-form').classList.add('hidden');
        this.editingServer = null;
    },

    editServer(id) {
        const s = this.servers.find(x => x.id === id);
        if (s) this.openForm(s);
    },

    async saveServer() {
        const payload = {
            name: document.getElementById('mc-f-name').value.trim(),
            address: document.getElementById('mc-f-address').value.trim(),
            port: parseInt(document.getElementById('mc-f-port').value) || 25565,
            sort_order: parseInt(document.getElementById('mc-f-sort').value) || 0,
            description: document.getElementById('mc-f-desc').value.trim(),
            hide_port: document.getElementById('mc-f-hideport').checked,
            is_bedrock: document.getElementById('mc-f-bedrock').checked,
            modpack_name: document.getElementById('mc-f-modpack').value.trim(),
            curseforge_url: document.getElementById('mc-f-curseforge').value.trim(),
            modrinth_url: document.getElementById('mc-f-modrinth').value.trim(),
            bluemap_url: document.getElementById('mc-f-bluemap').value.trim()
        };

        if (!payload.name || !payload.address) {
            App.showToast('Name and Address are required', 'error');
            return;
        }

        try {
            if (this.editingServer) {
                await API.put('/api/ext/minecraft/admin/servers/' + this.editingServer.id, payload);
                App.showToast('Server updated!', 'success');
            } else {
                const created = await API.post('/api/ext/minecraft/admin/servers', payload);
                App.showToast('Server created!', 'success');
                // Auto copy new API key
                navigator.clipboard.writeText(created.api_key);
                alert('Server Created!\n\nAPI KEY (Copied to clipboard):\n' + created.api_key + '\n\nSave this key! You will not be able to see it again unless you regenerate it.');
            }
            this.closeForm();
            this.loadServers();
        } catch (err) {
            App.showToast(err.message || 'Failed to save', 'error');
        }
    },

    async deleteServer(id, name) {
        if (!confirm('Are you SURE you want to delete "' + name + '"? This will erase all its associated XP data and statistics.')) return;
        try {
            await API.delete('/api/ext/minecraft/admin/servers/' + id);
            App.showToast('Server deleted', 'success');
            this.loadServers();
        } catch (err) {
            App.showToast(err.message || 'Failed to delete', 'error');
        }
    },

    async regenerateKey(id) {
        if (!confirm('Regenerate API Key? Any plugins currently using the old key will stop working immediately.')) return;
        try {
            const res = await API.post('/api/ext/minecraft/admin/servers/' + id + '/regenerate-key');
            navigator.clipboard.writeText(res.api_key);
            alert('New API Key Generated!\n\nAPI KEY (Copied to clipboard):\n' + res.api_key + '\n\nPlease update your server config.');
        } catch (err) {
            App.showToast(err.message || 'Failed to regenerate key', 'error');
        }
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
