/**
 * Images Extension — Admin Page
 */
var ImagesAdminPage = {
    settings: null,
    multiKeys: [],

    // Provider definitions — used for both individual modes and pool cards
    PROVIDERS: {
        r2:         { label: 'Cloudflare R2',  icon: '☁️',  color: '#f6821f', desc: 'S3-compatible, 10GB free/mo, no egress fees, permanent.' },
        b2:         { label: 'Backblaze B2',   icon: '🔥',  color: '#e05c2a', desc: '10GB free forever, $0.006/GB after, S3-compatible.' },
        cloudinary: { label: 'Cloudinary',     icon: '🌤',  color: '#3448c5', desc: '25GB free/account, images & video, permanent.' },
        bunny:      { label: 'Bunny.net',      icon: '🐰',  color: '#f5a623', desc: 'Pay-as-you-go CDN storage, simple REST API.' },
        imgbb:      { label: 'ImgBB',          icon: '🖼',  color: '#2196f3', desc: 'Free image hosting, 32MB per image, API key required.' },
        catbox:     { label: 'Catbox.moe',     icon: '📦',  color: '#9c27b0', desc: 'Unlimited anonymous hosting, no key required.' },
        nullpointer:{ label: '0x0.st',         icon: '⬛',  color: '#607d8b', desc: '512MB max, 30d–1yr retention, no key required.' },
        local:      { label: 'Local Storage',  icon: '💾',  color: '#4caf50', desc: 'Store files on your own server.' },
        multicloud: { label: 'Multi-Cloud Pool', icon: '🔀', color: '#00f0ff', desc: 'R2 → B2 → Cloudinary → Bunny, sequential fallback.' },
    },

    async render(container) {
        if (!App.currentUser || App.currentUser.role !== 'admin') {
            container.innerHTML = '<h2>Access Denied</h2>';
            return;
        }

        container.innerHTML = `
            <div class="admin-page" style="max-width:860px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <div>
                        <h2 style="margin:0;font-size:1.4rem">🎬 Media & Embed Settings</h2>
                        <p style="margin:4px 0 0;color:var(--text-muted);font-size:0.85rem">Configure where uploaded files are stored.</p>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="window.location.hash='#/admin'">← Back</button>
                </div>

                <!-- Upload toggle -->
                <div class="card" style="margin-bottom:1rem;padding:1rem 1.25rem">
                    <label style="display:flex;align-items:center;gap:14px;cursor:pointer;margin:0">
                        <input type="checkbox" id="cfg-allow-upload" style="width:18px;height:18px;accent-color:var(--neon-cyan)">
                        <div>
                            <div style="font-weight:600;font-size:0.95rem">Allow Direct Media Uploads</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">Users can upload images & video directly to your chosen provider.</div>
                        </div>
                    </label>
                </div>

                <!-- Provider picker -->
                <div class="card" style="margin-bottom:1rem">
                    <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:0.75rem">Storage Provider</div>
                    <div id="provider-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px"></div>
                </div>

                <!-- Dynamic config panel -->
                <div id="provider-config"></div>

                <div style="display:flex;justify-content:flex-end;margin-top:1rem">
                    <button class="btn btn-primary" onclick="ImagesAdminPage.saveSettings()">Save Configuration</button>
                </div>
            </div>
        `;

        await this.loadSettings();
    },

    /** Render the provider selection grid */
    renderProviderGrid(selected) {
        const grid = document.getElementById('provider-grid');
        if (!grid) return;
        grid.innerHTML = Object.entries(this.PROVIDERS).map(([val, p]) => `
            <button onclick="ImagesAdminPage.selectProvider('${val}')"
                style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 12px;
                       border-radius:8px;border:1px solid ${val === selected ? p.color : 'var(--border-subtle)'};
                       background:${val === selected ? `${p.color}18` : 'var(--bg-tertiary)'};
                       cursor:pointer;transition:all 0.15s;text-align:left;width:100%"
                title="${p.desc}">
                <span style="font-size:1.2rem">${p.icon}</span>
                <span style="font-size:0.78rem;font-weight:600;color:${val === selected ? p.color : 'var(--text-secondary)'};line-height:1.2">${p.label}</span>
            </button>
        `).join('');
    },

    selectProvider(val) {
        document.getElementById('cfg-storage-type-hidden').value = val;
        this.renderProviderGrid(val);
        this.renderProviderConfig(val);
    },

    /** Render the config fields for the selected provider */
    renderProviderConfig(val) {
        const panel = document.getElementById('provider-config');
        if (!panel) return;

        // Providers with no config needed
        if (val === 'local' || val === 'catbox' || val === 'nullpointer') {
            const msgs = {
                local: 'Files will be stored in <code>/public/uploads/</code> on your server. No additional configuration needed.',
                catbox: 'Files are uploaded anonymously to Catbox.moe. No API key required.',
                nullpointer: 'Files are uploaded to 0x0.st. No API key required. Files expire after 30 days–1 year depending on size.'
            };
            panel.innerHTML = `<div class="card" style="padding:1rem 1.25rem;color:var(--text-muted);font-size:0.875rem">${msgs[val]}</div>`;
            return;
        }

        if (val === 'imgbb') {
            panel.innerHTML = this._card('ImgBB Configuration', `
                ${this._field('imgbb_key', 'API Key', 'Get your key at api.imgbb.com', 'text')}
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Images only, 32MB max per file. Register multiple accounts for more storage.</p>
            `);
            this._restoreField('imgbb_key');
            return;
        }

        if (val === 'r2') {
            panel.innerHTML = this._card('Cloudflare R2 Configuration', `
                ${this._field('r2_key_id',    'Access Key ID',    'R2 API Token Key ID')}
                ${this._field('r2_app_key',   'Secret Access Key','R2 API Token Secret')}
                ${this._field('r2_bucket',    'Bucket Name',      'my-bucket')}
                ${this._field('r2_endpoint',  'Endpoint URL',     'https://ACCOUNT_ID.r2.cloudflarestorage.com')}
                ${this._field('r2_public_url','Public URL / CDN Domain (optional)', 'https://cdn.yourdomain.com')}
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">10GB free/month. Create multiple accounts and use Multi-Cloud Pool to chain them.</p>
            `);
            ['r2_key_id','r2_app_key','r2_bucket','r2_endpoint','r2_public_url'].forEach(f => this._restoreField(f));
            return;
        }

        if (val === 'b2') {
            panel.innerHTML = this._card('Backblaze B2 Configuration', `
                ${this._field('b2_key_id',    'Application Key ID', 'From B2 App Keys page')}
                ${this._field('b2_app_key',   'Application Key',    'From B2 App Keys page')}
                ${this._field('b2_bucket',    'Bucket Name',        'my-bucket')}
                ${this._field('b2_endpoint',  'S3 Endpoint',        'https://s3.us-west-004.backblazeb2.com')}
                ${this._field('b2_public_url','Public URL / CDN Domain (optional)', 'https://cdn.yourdomain.com')}
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">10GB free forever. Files never expire. Use Multi-Cloud Pool to chain multiple accounts.</p>
            `);
            ['b2_key_id','b2_app_key','b2_bucket','b2_endpoint','b2_public_url'].forEach(f => this._restoreField(f));
            return;
        }

        if (val === 'cloudinary') {
            panel.innerHTML = this._card('Cloudinary Configuration', `
                ${this._field('cld_cloud_name', 'Cloud Name',  'your-cloud-name')}
                ${this._field('cld_api_key',    'API Key',     'From Cloudinary dashboard')}
                ${this._field('cld_api_secret', 'API Secret',  'From Cloudinary dashboard')}
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">25GB free per account. Supports images and video. Use Multi-Cloud Pool to chain multiple accounts.</p>
            `);
            ['cld_cloud_name','cld_api_key','cld_api_secret'].forEach(f => this._restoreField(f));
            return;
        }

        if (val === 'bunny') {
            panel.innerHTML = this._card('Bunny.net Configuration', `
                ${this._field('bunny_access_key',     'Storage Zone Password (AccessKey)', 'From Storage Zone → FTP & API Access')}
                ${this._field('bunny_storage_zone',   'Storage Zone Name',                 'my-storage-zone')}
                ${this._field('bunny_region',         'Region (de / ny / la / sg / syd)',  'de')}
                ${this._field('bunny_public_hostname','Pull Zone Hostname (optional)',      'cdn.yourdomain.com')}
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">Pay-as-you-go, ~$0.01/GB/month. Use Multi-Cloud Pool to chain multiple zones.</p>
            `);
            ['bunny_access_key','bunny_storage_zone','bunny_region','bunny_public_hostname'].forEach(f => this._restoreField(f));
            return;
        }

        if (val === 'multicloud') {
            panel.innerHTML = `
                <div class="card" style="margin-bottom:0">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
                        <div>
                            <div style="font-weight:600;font-size:0.95rem">Storage Key Pool</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Tried in order: all R2 → all B2 → all Cloudinary → all Bunny</div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center">
                            <select id="mc-add-provider" class="input-field" style="width:auto;font-size:0.8rem;padding:6px 10px">
                                <option value="r2">☁️ Cloudflare R2</option>
                                <option value="b2">🔥 Backblaze B2</option>
                                <option value="cloudinary">🌤 Cloudinary</option>
                                <option value="bunny">🐰 Bunny.net</option>
                            </select>
                            <button class="btn btn-primary btn-sm" onclick="ImagesAdminPage.addKey()">+ Add Key</button>
                        </div>
                    </div>
                    <div id="mc-key-list"></div>
                </div>
            `;
            this.renderKeyList();
            return;
        }
    },

    // -------------------------------------------------------------------------
    // Multi-Cloud key list helpers
    // -------------------------------------------------------------------------

    renderKeyList() {
        const list = document.getElementById('mc-key-list');
        if (!list) return;
        if (this.multiKeys.length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:16px;text-align:center;
                border:1px dashed var(--border-subtle);border-radius:8px">
                No keys added yet. Select a provider and click + Add Key.</div>`;
            return;
        }
        const pInfo = { r2:'☁️ Cloudflare R2', b2:'🔥 Backblaze B2', cloudinary:'🌤 Cloudinary', bunny:'🐰 Bunny.net' };
        list.innerHTML = this.multiKeys.map((k, i) => `
            <div style="border:1px solid var(--border-subtle);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg-tertiary)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:600;font-size:0.85rem">${pInfo[k.provider] || k.provider} — Key #${i + 1}</span>
                    <button class="btn btn-ghost btn-sm" style="color:var(--neon-pink);padding:2px 8px" onclick="ImagesAdminPage.removeKey(${i})">✕</button>
                </div>
                <input type="text" class="input-field" style="margin-bottom:6px;font-size:0.8rem" placeholder="Label (e.g. Account 1)"
                    value="${App.escapeHtml(k.label||'')}" oninput="ImagesAdminPage.updateKey(${i},'label',this.value)">
                ${this._mcKeyFields(k, i)}
            </div>
        `).join('');
    },

    _mcKeyFields(k, i) {
        const f = (field, ph, val) =>
            `<input type="text" class="input-field" style="margin-bottom:6px;font-size:0.8rem" placeholder="${ph}"
                value="${App.escapeHtml(val||'')}" oninput="ImagesAdminPage.updateKey(${i},'${field}',this.value)">`;
        switch (k.provider) {
            case 'r2': return f('keyId','Access Key ID',k.keyId)+f('appKey','Secret Access Key',k.appKey)+f('bucket','Bucket Name',k.bucket)+f('endpoint','Endpoint URL',k.endpoint)+f('publicUrl','Public URL (optional)',k.publicUrl);
            case 'b2': return f('keyId','Application Key ID',k.keyId)+f('appKey','Application Key',k.appKey)+f('bucket','Bucket Name',k.bucket)+f('endpoint','S3 Endpoint',k.endpoint)+f('publicUrl','Public URL (optional)',k.publicUrl);
            case 'cloudinary': return f('cloudName','Cloud Name',k.cloudName)+f('apiKey','API Key',k.apiKey)+f('apiSecret','API Secret',k.apiSecret);
            case 'bunny': return f('accessKey','Storage Zone Password',k.accessKey)+f('storageZone','Storage Zone Name',k.storageZone)+f('region','Region (de/ny/la/sg/syd)',k.region)+f('publicHostname','Pull Zone Hostname (optional)',k.publicHostname);
            default: return '';
        }
    },

    addKey() {
        const provider = document.getElementById('mc-add-provider').value;
        this.multiKeys.push({ provider, label: '' });
        this.renderKeyList();
    },

    removeKey(i) { this.multiKeys.splice(i, 1); this.renderKeyList(); },
    updateKey(i, field, value) { if (this.multiKeys[i]) this.multiKeys[i][field] = value; },

    // -------------------------------------------------------------------------
    // Load / Save
    // -------------------------------------------------------------------------

    async loadSettings() {
        try {
            this.settings = await API.get('/api/ext/images/settings');
            const storageType = this.settings.storage_type || 'local';
            const extConfig = JSON.parse(this.settings.external_storage_config || '{}');
            this.multiKeys = extConfig.multicloud_keys || [];
            this._extConfig = extConfig; // stash for field restoration

            // Inject hidden storage type field
            const page = document.querySelector('.admin-page');
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.id = 'cfg-storage-type-hidden';
            hidden.value = storageType;
            page.appendChild(hidden);

            document.getElementById('cfg-allow-upload').checked = this.settings.allow_direct_upload === '1';
            this.renderProviderGrid(storageType);
            this.renderProviderConfig(storageType);
        } catch (err) {
            App.showToast('Failed to load settings', 'error');
        }
    },

    async saveSettings() {
        const storageType = document.getElementById('cfg-storage-type-hidden')?.value || 'local';
        const extConfig = { multicloud_keys: this.multiKeys };

        // Collect individual provider fields if present
        const collect = (...ids) => ids.forEach(id => {
            const el = document.getElementById('ifield-' + id);
            if (el) extConfig[id] = el.value;
        });
        collect('imgbb_key');
        collect('r2_key_id','r2_app_key','r2_bucket','r2_endpoint','r2_public_url');
        collect('b2_key_id','b2_app_key','b2_bucket','b2_endpoint','b2_public_url');
        collect('cld_cloud_name','cld_api_key','cld_api_secret');
        collect('bunny_access_key','bunny_storage_zone','bunny_region','bunny_public_hostname');

        const payload = {
            allow_direct_upload: document.getElementById('cfg-allow-upload').checked ? '1' : '0',
            storage_type: storageType,
            external_storage_config: JSON.stringify(extConfig)
        };

        try {
            await API.put('/api/ext/images/settings', payload);
            this._extConfig = extConfig;
            App.showToast('Configuration saved!', 'success');
        } catch (err) {
            App.showToast(err.message || 'Failed to save', 'error');
        }
    },

    // -------------------------------------------------------------------------
    // UI helpers
    // -------------------------------------------------------------------------

    _card(title, body) {
        return `<div class="card" style="margin-bottom:0">
            <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.75rem">${title}</div>
            ${body}
        </div>`;
    },

    _field(id, label, placeholder, type = 'text') {
        return `<div style="margin-bottom:8px">
            <label style="display:block;font-size:0.75rem;color:var(--text-muted);margin-bottom:3px">${label}</label>
            <input type="${type}" id="ifield-${id}" class="input-field" style="font-size:0.875rem" placeholder="${placeholder}">
        </div>`;
    },

    /** Restore a field value from the stashed extConfig */
    _restoreField(id) {
        const el = document.getElementById('ifield-' + id);
        if (el && this._extConfig && this._extConfig[id]) el.value = this._extConfig[id];
    }
};
