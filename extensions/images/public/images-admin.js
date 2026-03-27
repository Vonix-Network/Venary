/**
 * Images Extension — Admin Page
 */
var ImagesAdminPage = {
    settings: null,

    async render(container) {
        if (!App.currentUser || App.currentUser.role !== 'admin') {
            container.innerHTML = '<h2>Access Denied</h2>';
            return;
        }

        container.innerHTML = `
            <div class="admin-page">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <h1>🎬 Media & Embed Settings</h1>
                    <button class="btn btn-secondary" onclick="window.location.hash='#/admin'">← Back</button>
                </div>

                <div class="card stagger-children">
                    <div style="margin-bottom:1.5rem">
                        <label style="display:flex;align-items:center;gap:12px;cursor:pointer">
                            <input type="checkbox" id="cfg-allow-upload" style="width:20px;height:20px">
                            <div>
                                <div style="font-weight:bold">Allow Direct Media Uploads (Images & Video)</div>
                                <div style="font-size:0.85rem;color:var(--text-muted)">Users can upload files directly to your chosen provider.</div>
                            </div>
                        </label>
                    </div>

                    <div style="margin-bottom:1.5rem">
                        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">Storage Strategy</label>
                        <select id="cfg-storage-type" class="input-field" onchange="ImagesAdminPage.toggleExtConfig(this.value)">
                            <option value="local">Local Storage (Current Server)</option>
                            <option value="nullpointer">0x0.st (Free, No Key Required)</option>
                            <option value="imgbb">ImgBB (Free External API)</option>
                            <option value="catbox">Catbox.moe (Unlimited Free Host)</option>
                            <option value="s3">Amazon S3 / DigitalOcean Spaces</option>
                        </select>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">External storage requires additional configuration.</div>
                    </div>

                    <div id="config-imgbb" class="hidden" style="margin-bottom:1.5rem;padding:12px;background:var(--bg-tertiary);border-radius:8px">
                        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">ImgBB API Key</label>
                        <input type="text" id="cfg-imgbb-key" class="input-field" placeholder="Paste your API key from api.imgbb.com">
                    </div>

                    <div style="display:flex;justify-content:flex-end">
                        <button class="btn btn-primary" onclick="ImagesAdminPage.saveSettings()">Save Configuration</button>
                    </div>
                </div>
            </div>
        `;

        await this.loadSettings();
        this.toggleExtConfig(document.getElementById('cfg-storage-type').value);
    },

    toggleExtConfig(val) {
        document.getElementById('config-imgbb').classList.toggle('hidden', val !== 'imgbb');
    },

    async loadSettings() {
        try {
            this.settings = await API.get('/api/ext/images/settings');
            document.getElementById('cfg-allow-upload').checked = this.settings.allow_direct_upload === '1';
            document.getElementById('cfg-storage-type').value = this.settings.storage_type || 'local';
            
            const extConfig = JSON.parse(this.settings.external_storage_config || '{}');
            if (extConfig.imgbb_key) {
                document.getElementById('cfg-imgbb-key').value = extConfig.imgbb_key;
            }
            this.toggleExtConfig(this.settings.storage_type);
        } catch (err) {
            App.showToast('Failed to load settings', 'error');
        }
    },

    async saveSettings() {
        const extConfig = {
            imgbb_key: document.getElementById('cfg-imgbb-key').value
        };

        const payload = {
            allow_direct_upload: document.getElementById('cfg-allow-upload').checked ? '1' : '0',
            storage_type: document.getElementById('cfg-storage-type').value,
            external_storage_config: JSON.stringify(extConfig)
        };

        try {
            await API.put('/api/ext/images/settings', payload);
            App.showToast('Configuration saved!', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to save', 'error');
        }
    }
};
