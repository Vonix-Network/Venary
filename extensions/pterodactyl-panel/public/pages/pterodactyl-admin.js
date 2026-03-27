/* =======================================
   Pterodactyl Panel Extension — Admin Settings Page
   Configure base URL, API key, and server ID.
   ======================================= */
var PterodactylAdminPage = {

    async render(container) {
        if (!App.currentUser || !['admin', 'superadmin', 'moderator'].includes(App.currentUser.role)) {
            container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3><p>Admin only.</p></div>';
            return;
        }

        container.innerHTML = `
            <div style="max-width:640px;margin:0 auto">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;gap:1rem">
                    <div>
                        <h2 style="margin:0 0 4px;font-size:1.4rem">🖥️ Pterodactyl Panel Settings</h2>
                        <p style="margin:0;color:var(--text-muted);font-size:0.85rem">Configure the connection to your Pterodactyl instance.</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/admin'">← Back</button>
                </div>

                <div class="admin-settings-card animate-fade-up">
                    <div id="ptero-admin-form">
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            </div>`;

        await this._loadForm();
    },

    async _loadForm() {
        const area = document.getElementById('ptero-admin-form');
        if (!area) return;

        let baseUrl = '', serverId = '';
        try {
            const s = await API.get('/api/ext/pterodactyl-panel/settings');
            baseUrl = s.base_url || '';
            serverId = s.server_id || '';
        } catch { /* first-time setup — fields stay empty */ }

        area.innerHTML = `
            <form id="ptero-settings-form" onsubmit="PterodactylAdminPage._save(event)">
                <div style="display:flex;flex-direction:column;gap:1.2rem">

                    <div>
                        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
                            Panel Base URL
                        </label>
                        <input id="ptero-base-url"
                               class="input-field"
                               type="url"
                               placeholder="https://panel.example.com"
                               value="${App.escapeHtml(baseUrl)}"
                               style="width:100%"
                               required />
                        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted)">The root URL of your Pterodactyl panel (no trailing slash).</p>
                    </div>

                    <div>
                        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
                            API Key
                        </label>
                        <input id="ptero-api-key"
                               class="input-field"
                               type="password"
                               placeholder="${baseUrl ? '(leave blank to keep existing key)' : 'ptlc_xxxxxxxxxxxx'}"
                               autocomplete="new-password"
                               style="width:100%" />
                        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted)">
                            Client API key from your Pterodactyl account. Stored securely — never displayed after saving.
                        </p>
                    </div>

                    <div>
                        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
                            Server ID
                        </label>
                        <input id="ptero-server-id"
                               class="input-field"
                               type="text"
                               placeholder="e.g. 1a2b3c4d"
                               value="${App.escapeHtml(serverId)}"
                               style="width:100%"
                               required />
                        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted)">The short server identifier shown in your Pterodactyl panel URL.</p>
                    </div>

                    <div style="display:flex;justify-content:flex-end;padding-top:0.5rem;border-top:1px solid var(--border-subtle)">
                        <button type="submit" class="btn btn-primary" id="ptero-save-btn">Save Settings</button>
                    </div>
                </div>
            </form>`;
    },

    async _save(e) {
        e.preventDefault();
        const btn = document.getElementById('ptero-save-btn');
        const baseUrl = document.getElementById('ptero-base-url').value.trim();
        const apiKey  = document.getElementById('ptero-api-key').value;
        const serverId = document.getElementById('ptero-server-id').value.trim();

        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        try {
            await API.post('/api/ext/pterodactyl-panel/settings', {
                base_url: baseUrl,
                api_key: apiKey,   // empty string = don't update key
                server_id: serverId,
            });
            App.showToast('✓ Pterodactyl settings saved!', 'success');
            // Clear the key field — never show it back
            const keyField = document.getElementById('ptero-api-key');
            if (keyField) {
                keyField.value = '';
                keyField.placeholder = '(leave blank to keep existing key)';
            }
        } catch (err) {
            App.showToast(err.message || 'Failed to save settings.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
        }
    },
};
