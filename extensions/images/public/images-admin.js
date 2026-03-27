/**
 * Images Extension — Admin Page
 */
var ImagesAdminPage = {
    settings: null,
    multiKeys: [], // working copy of multicloud_keys array

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
                            <option value="multicloud">☁️ Multi-Cloud Pool (R2 → B2 → Cloudinary → Bunny)</option>
                            <option value="nullpointer">0x0.st (Free, No Key Required)</option>
                            <option value="catbox">Catbox.moe (Unlimited Free Host)</option>
                            <option value="imgbb">ImgBB (Single API Key)</option>
                        </select>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Multi-Cloud tries each key in order — R2 first, then B2, Cloudinary, Bunny.</div>
                    </div>

                    <!-- ImgBB single-key config -->
                    <div id="config-imgbb" class="hidden" style="margin-bottom:1.5rem;padding:12px;background:var(--bg-tertiary);border-radius:8px">
                        <label style="display:block;font-size:0.8rem;color:var(--text-secondary);margin-bottom:4px">ImgBB API Key</label>
                        <input type="text" id="cfg-imgbb-key" class="input-field" placeholder="Paste your API key from api.imgbb.com">
                    </div>

                    <!-- Multi-Cloud key pool -->
                    <div id="config-multicloud" class="hidden" style="margin-bottom:1.5rem">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                            <span style="font-weight:bold;font-size:0.95rem">Storage Key Pool</span>
                            <div style="display:flex;gap:8px">
                                <select id="mc-add-provider" class="input-field" style="width:auto;font-size:0.8rem">
                                    <option value="r2">Cloudflare R2</option>
                                    <option value="b2">Backblaze B2</option>
                                    <option value="cloudinary">Cloudinary</option>
                                    <option value="bunny">Bunny.net</option>
                                </select>
                                <button class="btn btn-primary btn-sm" onclick="ImagesAdminPage.addKey()">+ Add Key</button>
                            </div>
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem">
                            Keys are tried in order: all R2 → all B2 → all Cloudinary → all Bunny. Add multiple accounts per provider to maximise storage.
                        </div>
                        <div id="mc-key-list"></div>
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
        document.getElementById('config-multicloud').classList.toggle('hidden', val !== 'multicloud');
    },

    async loadSettings() {
        try {
            this.settings = await API.get('/api/ext/images/settings');
            document.getElementById('cfg-allow-upload').checked = this.settings.allow_direct_upload === '1';
            document.getElementById('cfg-storage-type').value = this.settings.storage_type || 'local';

            const extConfig = JSON.parse(this.settings.external_storage_config || '{}');
            if (extConfig.imgbb_key) document.getElementById('cfg-imgbb-key').value = extConfig.imgbb_key;

            this.multiKeys = extConfig.multicloud_keys || [];
            this.renderKeyList();
            this.toggleExtConfig(this.settings.storage_type);
        } catch (err) {
            App.showToast('Failed to load settings', 'error');
        }
    },

    /** Render the dynamic key list from this.multiKeys */
    renderKeyList() {
        const list = document.getElementById('mc-key-list');
        if (!list) return;
        if (this.multiKeys.length === 0) {
            list.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:12px;text-align:center;border:1px dashed var(--border-subtle);border-radius:8px">No keys added yet. Select a provider above and click + Add Key.</div>';
            return;
        }

        const providerLabel = { r2: '☁️ Cloudflare R2', b2: '🔥 Backblaze B2', cloudinary: '🌤 Cloudinary', bunny: '🐰 Bunny.net' };

        list.innerHTML = this.multiKeys.map((k, i) => `
            <div style="border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg-tertiary)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:bold;font-size:0.85rem">${providerLabel[k.provider] || k.provider} — Key #${i + 1}</span>
                    <button class="btn btn-ghost btn-sm" style="color:var(--text-danger)" onclick="ImagesAdminPage.removeKey(${i})">✕ Remove</button>
                </div>
                <input type="text" class="input-field" style="margin-bottom:6px;font-size:0.8rem" placeholder="Label (optional, e.g. Account 1)"
                    value="${App.escapeHtml(k.label || '')}" oninput="ImagesAdminPage.updateKey(${i},'label',this.value)">
                ${this.renderKeyFields(k, i)}
            </div>
        `).join('');
    },

    /** Render provider-specific fields for a key entry */
    renderKeyFields(k, i) {
        const f = (field, placeholder, val) =>
            `<input type="text" class="input-field" style="margin-bottom:6px;font-size:0.8rem" placeholder="${placeholder}"
                value="${App.escapeHtml(val || '')}" oninput="ImagesAdminPage.updateKey(${i},'${field}',this.value)">`;

        switch (k.provider) {
            case 'r2': return `
                ${f('keyId',    'Access Key ID (R2 API Token)',          k.keyId)}
                ${f('appKey',   'Secret Access Key',                     k.appKey)}
                ${f('bucket',   'Bucket Name',                           k.bucket)}
                ${f('endpoint', 'Endpoint URL (e.g. https://ACCOUNT_ID.r2.cloudflarestorage.com)', k.endpoint)}
                ${f('publicUrl','Public URL / CDN Domain (optional)',    k.publicUrl)}`;
            case 'b2': return `
                ${f('keyId',    'Application Key ID',                    k.keyId)}
                ${f('appKey',   'Application Key',                       k.appKey)}
                ${f('bucket',   'Bucket Name',                           k.bucket)}
                ${f('endpoint', 'S3-Compatible Endpoint (e.g. https://s3.us-west-004.backblazeb2.com)', k.endpoint)}
                ${f('publicUrl','Public URL / CDN Domain (optional)',    k.publicUrl)}`;
            case 'cloudinary': return `
                ${f('cloudName','Cloud Name',                            k.cloudName)}
                ${f('apiKey',   'API Key',                               k.apiKey)}
                ${f('apiSecret','API Secret',                            k.apiSecret)}`;
            case 'bunny': return `
                ${f('accessKey',     'Storage Zone Password (AccessKey)', k.accessKey)}
                ${f('storageZone',   'Storage Zone Name',                 k.storageZone)}
                ${f('region',        'Region (de / ny / la / sg / syd — default: de)', k.region)}
                ${f('publicHostname','Pull Zone Hostname (optional, e.g. cdn.yourdomain.com)', k.publicHostname)}`;
            default: return '';
        }
    },

    addKey() {
        const provider = document.getElementById('mc-add-provider').value;
        this.multiKeys.push({ provider, label: '' });
        this.renderKeyList();
    },

    removeKey(i) {
        this.multiKeys.splice(i, 1);
        this.renderKeyList();
    },

    updateKey(i, field, value) {
        if (this.multiKeys[i]) this.multiKeys[i][field] = value;
    },

    async saveSettings() {
        const storageType = document.getElementById('cfg-storage-type').value;

        const extConfig = {
            imgbb_key: document.getElementById('cfg-imgbb-key')?.value || '',
            multicloud_keys: this.multiKeys
        };

        const payload = {
            allow_direct_upload: document.getElementById('cfg-allow-upload').checked ? '1' : '0',
            storage_type: storageType,
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
