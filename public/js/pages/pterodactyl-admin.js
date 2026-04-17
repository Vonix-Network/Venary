/* =======================================
   Pterodactyl Panel Extension — Admin Settings Page
   Configure base URL and API key only.
   Server selection happens in the panel itself.
   ======================================= */
var PterodactylAdminPage = {

    async render(container) {
        if (!App.currentUser || !['admin', 'superadmin'].includes(App.currentUser.role)) {
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
                    <button class="btn btn-secondary btn-sm" onclick="Router.go('/admin')">← Back</button>
                </div>
                <div class="admin-settings-card animate-fade-up">
                    <div id="ptero-admin-form"><div class="loading-spinner"></div></div>
                </div>
            </div>`;

        await this._loadForm();
    },

    async _loadForm() {
        const area = document.getElementById('ptero-admin-form');
        if (!area) return;

        let baseUrl = '';
        try {
            const s = await API.get('/api/pterodactyl/settings');
            baseUrl = s.base_url || '';
        } catch { /* first-time setup */ }

        area.innerHTML = `
            <form id="ptero-settings-form" onsubmit="PterodactylAdminPage._save(event)">
                <div style="display:flex;flex-direction:column;gap:1.2rem">

                    <div>
                        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
                            Panel Base URL
                        </label>
                        <input id="ptero-base-url" class="input-field" type="url"
                               placeholder="https://panel.example.com"
                               value="${App.escapeHtml(baseUrl)}"
                               style="width:100%" required />
                        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted)">Root URL of your Pterodactyl panel (no trailing slash).</p>
                    </div>

                    <div>
                        <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
                            API Key
                        </label>
                        <input id="ptero-api-key" class="input-field" type="password"
                               placeholder="${baseUrl ? '(leave blank to keep existing key)' : 'ptlc_xxxxxxxxxxxx'}"
                               autocomplete="new-password"
                               style="width:100%" />
                        <p style="margin:4px 0 0;font-size:0.75rem;color:var(--text-muted)">
                            Client API key from your Pterodactyl account. Stored securely — never displayed after saving.
                        </p>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:0.5rem;border-top:1px solid var(--border-subtle);gap:1rem;flex-wrap:wrap">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="PterodactylAdminPage._testConnection()" id="ptero-test-btn">
                            Test Connection
                        </button>
                        <button type="submit" class="btn btn-primary" id="ptero-save-btn">Save Settings</button>
                    </div>

                    <div id="ptero-test-result" style="display:none"></div>
                </div>
            </form>`;
    },

    async _save(e) {
        e.preventDefault();
        const btn = document.getElementById('ptero-save-btn');
        const baseUrl = document.getElementById('ptero-base-url').value.trim();
        const apiKey  = document.getElementById('ptero-api-key').value;

        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
        try {
            await API.post('/api/pterodactyl/settings', {
                base_url: baseUrl,
                api_key: apiKey,
                server_id: '_dynamic',
            });
            App.showToast('Pterodactyl settings saved!', 'success');
            const keyField = document.getElementById('ptero-api-key');
            if (keyField) { keyField.value = ''; keyField.placeholder = '(leave blank to keep existing key)'; }
        } catch (err) {
            App.showToast(err.message || 'Failed to save settings.', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Settings'; }
        }
    },

    async _testConnection() {
        const btn = document.getElementById('ptero-test-btn');
        const result = document.getElementById('ptero-test-result');
        if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }
        if (result) result.style.display = 'none';

        try {
            const servers = await API.get('/api/pterodactyl/servers');
            if (result) {
                result.style.display = 'block';
                result.innerHTML = '<div style="padding:10px 12px;border-radius:8px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#86efac;font-size:0.85rem">' +
                    'Connected — ' + servers.length + ' server' + (servers.length !== 1 ? 's' : '') + ' found:' +
                    '<ul style="margin:6px 0 0;padding-left:1.2rem">' +
                    servers.map(function(s) { return '<li>' + App.escapeHtml(s.name) + ' <span style="opacity:0.6;font-size:0.75rem">(' + App.escapeHtml(s.id) + ')</span></li>'; }).join('') +
                    '</ul></div>';
            }
        } catch (err) {
            if (result) {
                result.style.display = 'block';
                result.innerHTML = '<div style="padding:10px 12px;border-radius:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;font-size:0.85rem">' +
                    App.escapeHtml(err.message || 'Connection failed. Check your Base URL and API Key.') + '</div>';
            }
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Test Connection'; }
        }
    },
};