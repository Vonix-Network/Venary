/* =======================================
   Donations & Ranks — Admin Management Page
   ======================================= */
window.DonationsAdminPage = {
    activeTab: 'overview',

    async render(container) {
        const isEmbedded = container.id === 'admin-content';
        
        let html = `
            <div class="donations-admin-container" style="${isEmbedded ? '' : 'max-width:1100px;margin:0 auto'}">`;
        
        if (!isEmbedded) {
            html += `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
                    <div>
                        <h1 style="margin-bottom:4px">Donations Management</h1>
                        <p style="color:var(--text-secondary);margin-bottom:0;font-size:0.9rem">Manage ranks, view donations, and configure payment settings.</p>
                    </div>
                    <button class="mc-btn" onclick="window.location.hash='#/admin'" style="background:rgba(255,255,255,0.05);border-color:var(--border-subtle)">
                        &larr; Back to Admin
                    </button>
                </div>`;
        }

        html += `
                <div class="mc-chart-controls" style="margin-bottom:1.5rem">
                    <button class="mc-chart-btn ${this.activeTab === 'overview' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('overview', this)">Overview</button>
                    <button class="mc-chart-btn ${this.activeTab === 'ranks' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('ranks', this)">Ranks</button>
                    <button class="mc-chart-btn ${this.activeTab === 'history' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('history', this)">Donations</button>
                    <button class="mc-chart-btn ${this.activeTab === 'settings' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('settings', this)">Settings</button>
                    <button class="mc-chart-btn ${this.activeTab === 'crypto' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('crypto', this)">Crypto Settings</button>
                    <button class="mc-chart-btn ${this.activeTab === 'balance-settings' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('balance-settings', this)">Balance Settings</button>
                    <button class="mc-chart-btn ${this.activeTab === 'balances' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('balances', this)">User Balances</button>
                </div>

                <div id="donate-admin-content"></div>
            </div>`;

        container.innerHTML = html;
        this.loadTab();
    },

    switchTab(tab, btn) {
        this.activeTab = tab;
        if (btn) {
            btn.closest('.mc-chart-controls').querySelectorAll('.mc-chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        this.loadTab();
    },

    async loadTab() {
        const area = document.getElementById('donate-admin-content');
        if (!area) return;
        area.innerHTML = '<div class="loading-spinner" style="text-align:center;padding:2rem">Loading...</div>';

        switch (this.activeTab) {
            case 'overview': return this.renderOverview(area);
            case 'ranks': return this.renderRanks(area);
            case 'history': return this.renderHistory(area);
            case 'settings': return this.renderSettings(area);
            case 'crypto': return this.renderCryptoSettings(area);
            case 'balance-settings': return this.renderBalanceSettings(area);
            case 'balances': return this.renderUserBalances(area);
        }
    },

    // ── OVERVIEW ──
    async renderOverview(area) {
        try {
            const stats = await API.get('/api/ext/donations/admin/stats');
            area.innerHTML = `
                <div class="donate-stats-grid">
                    <div class="donate-stat-card">
                        <div class="stat-value">$${stats.total_revenue.toFixed(2)}</div>
                        <div class="stat-label">Total Revenue</div>
                    </div>
                    <div class="donate-stat-card">
                        <div class="stat-value">${stats.total_donations}</div>
                        <div class="stat-label">Total Donations</div>
                    </div>
                    <div class="donate-stat-card">
                        <div class="stat-value">${stats.active_ranks}</div>
                        <div class="stat-label">Active Ranks</div>
                    </div>
                    <div class="donate-stat-card">
                        <div class="stat-value" style="color:var(--neon-green)">$${stats.month_revenue.toFixed(2)}</div>
                        <div class="stat-label">This Month</div>
                    </div>
                </div>
                <h3 style="margin-bottom:1rem;font-size:1rem;color:var(--text-secondary)">Quick Actions</h3>
                <div style="display:flex;gap:var(--space-md);flex-wrap:wrap">
                    <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)" onclick="DonationsAdminPage.switchTab('ranks')">Manage Ranks</button>
                    <button class="mc-btn" style="background:rgba(171,71,188,0.1);color:var(--neon-magenta);border-color:rgba(171,71,188,0.3)" onclick="DonationsAdminPage.showGrantRankModal()">Grant Rank</button>
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.switchTab('settings')">Settings</button>
                </div>`;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load stats.</p>';
        }
    },

    // ── RANKS ──
    async renderRanks(area) {
        try {
            const ranks = await API.get('/api/ext/donations/admin/ranks');
            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                    <h3 style="margin:0;font-size:1rem;color:var(--text-secondary)">Donation Ranks</h3>
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.showRankEditor()">+ Add Rank</button>
                </div>
                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">
                <table class="donate-table">
                    <thead><tr>
                        <th>Rank</th><th>Price</th><th>LP Group</th><th>Active</th><th>Actions</th>
                    </tr></thead>
                    <tbody>`;

            for (const r of ranks) {
                html += `
                    <tr>
                        <td><span style="color:${App.escapeHtml(r.color)};font-weight:700">${r.icon} ${App.escapeHtml(r.name)}</span></td>
                        <td>$${r.price.toFixed(2)}</td>
                        <td><code style="font-size:0.75rem;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px">${App.escapeHtml(r.luckperms_group || '—')}</code></td>
                        <td>${r.active ? '<span style="color:var(--neon-green)">✓</span>' : '<span style="color:var(--text-muted)">✗</span>'}</td>
                        <td style="display:flex;gap:6px">
                            <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem" onclick="DonationsAdminPage.showRankEditor('${r.id}')">Edit</button>
                            <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem;color:var(--neon-magenta);border-color:rgba(239,68,68,0.3)" onclick="DonationsAdminPage.deleteRank('${r.id}', '${App.escapeHtml(r.name)}')">Delete</button>
                        </td>
                    </tr>`;
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load ranks.</p>';
        }
    },

    // ── HISTORY ──
    async renderHistory(area) {
        try {
            const data = await API.get('/api/ext/donations/admin/donations?limit=50');
            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                    <h3 style="margin:0;font-size:1rem;color:var(--text-secondary)">Donation History</h3>
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.showManualDonationModal()">+ Manual Donation</button>
                </div>
                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">
                <table class="donate-table">
                    <thead><tr>
                        <th>User</th><th>Rank</th><th>Amount</th><th>Status</th><th>Date</th>
                    </tr></thead>
                    <tbody>`;

            for (const d of data.donations) {
                const statusClass = d.status === 'completed' ? 'completed' : d.status === 'pending' ? 'pending' : 'failed';
                const typeIcon = d.payment_type === 'manual' ? '📝 ' : '';
                html += `
                    <tr>
                        <td>${App.escapeHtml(d.username)}</td>
                        <td><span style="color:${App.escapeHtml(d.rank_color || '#fff')}">${App.escapeHtml(d.rank_name || '—')}</span></td>
                        <td>$${d.amount.toFixed(2)} <small style="color:var(--text-muted);font-size:0.7rem">${d.payment_type}</small></td>
                        <td><span class="donate-status ${statusClass}">${typeIcon}${d.status}</span></td>
                        <td style="font-size:0.8rem;color:var(--text-muted)">${new Date(d.created_at).toLocaleDateString()}</td>
                    </tr>`;
            }

            if (!data.donations.length) {
                html += '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No donations yet.</td></tr>';
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load donations.</p>';
        }
    },

    // ── SETTINGS ──
    async renderSettings(area) {
        try {
            const config = await API.get('/api/ext/donations/admin/config');
            area.innerHTML = `
                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:var(--space-lg)">
                    <h3 style="margin:0 0 1rem 0;font-size:1rem;color:var(--text-secondary)">Payment & Integration Settings</h3>
                    <div class="donate-admin-form">
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Stripe Secret Key</label>
                            <input id="cfg-stripe-key" type="password" class="form-input" value="${App.escapeHtml(config.stripe_secret_key)}" placeholder="sk_live_..." style="width:100%">
                        </div>
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Stripe Webhook Secret</label>
                            <input id="cfg-stripe-webhook" type="password" class="form-input" value="${App.escapeHtml(config.stripe_webhook_secret)}" placeholder="whsec_..." style="width:100%">
                        </div>
                        <div class="full-width">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Discord Donation Webhook URL</label>
                            <input id="cfg-discord-webhook" class="form-input" value="${App.escapeHtml(config.discord_donation_webhook)}" placeholder="https://discord.com/api/webhooks/..." style="width:100%">
                        </div>
                        <div class="full-width">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Site URL (for Stripe redirects)</label>
                            <input id="cfg-site-url" class="form-input" value="${App.escapeHtml(config.siteUrl)}" placeholder="https://yourdomain.com" style="width:100%">
                        </div>
                        <div class="full-width" style="text-align:right">
                            <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.saveSettings()">Save Settings</button>
                        </div>
                    </div>
                </div>`;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load settings.</p>';
        }
    },

    async saveSettings() {
        try {
            const stripeKey = document.getElementById('cfg-stripe-key').value;
            const stripeWebhook = document.getElementById('cfg-stripe-webhook').value;
            const discordWebhook = document.getElementById('cfg-discord-webhook').value;
            const siteUrl = document.getElementById('cfg-site-url').value;

            const body = { discord_donation_webhook: discordWebhook, siteUrl };
            // Only send keys if they aren't masked
            if (stripeKey && !stripeKey.startsWith('••')) body.stripe_secret_key = stripeKey;
            if (stripeWebhook && !stripeWebhook.startsWith('••')) body.stripe_webhook_secret = stripeWebhook;

            await API.put('/api/ext/donations/admin/config', body);
            App.showToast('Settings saved!', 'success');
        } catch (err) {
            App.showToast('Failed to save settings', 'error');
        }
    },

    // ── RANK EDITOR MODAL ──
    async showRankEditor(rankId) {
        let rank = { id: '', name: '', price: 4.99, color: '#29b6f6', icon: '⭐', description: '', perks: [], luckperms_group: '', sort_order: 0, active: 1 };

        if (rankId) {
            try {
                const ranks = await API.get('/api/ext/donations/admin/ranks');
                rank = ranks.find(r => r.id === rankId) || rank;
            } catch { /* use defaults */ }
        }

        const perksStr = Array.isArray(rank.perks) ? rank.perks.join('\n') : '';
        const isNew = !rankId;

        App.showModal('Rank Editor', `
            <div class="donate-admin-form">
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Name</label>
                    <input id="re-name" class="form-input" value="${App.escapeHtml(rank.name)}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Price (USD)</label>
                    <input id="re-price" type="number" step="0.01" class="form-input" value="${rank.price}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Color</label>
                    <input id="re-color" type="color" value="${rank.color}" style="width:100%;height:38px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--bg-input)">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Icon</label>
                    <input id="re-icon" class="form-input" value="${rank.icon}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">LuckPerms Group</label>
                    <input id="re-lp" class="form-input" value="${App.escapeHtml(rank.luckperms_group || '')}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Sort Order</label>
                    <input id="re-order" type="number" class="form-input" value="${rank.sort_order}" style="width:100%">
                </div>
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Description</label>
                    <input id="re-desc" class="form-input" value="${App.escapeHtml(rank.description || '')}" style="width:100%">
                </div>
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Perks (one per line)</label>
                    <textarea id="re-perks" class="form-input" rows="4" style="width:100%;resize:vertical">${App.escapeHtml(perksStr)}</textarea>
                </div>
                <div class="full-width" style="display:flex;gap:var(--space-md);align-items:center">
                    <label style="font-size:0.8rem;color:var(--text-muted)">
                        <input id="re-active" type="checkbox" ${rank.active ? 'checked' : ''}> Active
                    </label>
                </div>
                <div class="full-width" style="text-align:right;margin-top:var(--space-md)">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.saveRank('${rankId || ''}')">
                        ${isNew ? 'Create Rank' : 'Save Changes'}
                    </button>
                </div>
            </div>
        `);
    },

    async saveRank(rankId) {
        const body = {
            name: document.getElementById('re-name').value,
            price: parseFloat(document.getElementById('re-price').value),
            color: document.getElementById('re-color').value,
            icon: document.getElementById('re-icon').value,
            description: document.getElementById('re-desc').value,
            perks: document.getElementById('re-perks').value.split('\n').map(s => s.trim()).filter(Boolean),
            luckperms_group: document.getElementById('re-lp').value,
            sort_order: parseInt(document.getElementById('re-order').value) || 0,
            active: document.getElementById('re-active').checked,
        };

        try {
            if (rankId) {
                await API.put('/api/ext/donations/admin/ranks/' + rankId, body);
                App.showToast('Rank updated!', 'success');
            } else {
                await API.post('/api/ext/donations/admin/ranks', body);
                App.showToast('Rank created!', 'success');
            }
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to save rank', 'error');
        }
    },

    async deleteRank(rankId, name) {
        if (!confirm(`Delete rank "${name}"? This cannot be undone.`)) return;
        try {
            await API.delete('/api/ext/donations/admin/ranks/' + rankId);
            App.showToast('Rank deleted', 'success');
            this.loadTab();
        } catch (err) {
            App.showToast('Failed to delete rank', 'error');
        }
    },

    // ── GRANT RANK MODAL ──
    async showGrantRankModal() {
        let ranks;
        try { ranks = await API.get('/api/ext/donations/admin/ranks'); } catch { ranks = []; }

        App.showModal('Grant Rank', `
            <div class="donate-admin-form">
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">User ID</label>
                    <input id="gr-user" class="form-input" placeholder="User UUID" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Rank</label>
                    <select id="gr-rank" class="form-input" style="width:100%">
                        ${ranks.map(r => `<option value="${r.id}">${App.escapeHtml(r.name)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Duration (days, blank = permanent)</label>
                    <input id="gr-days" type="number" class="form-input" value="30" style="width:100%">
                </div>
                <div class="full-width" style="text-align:right;margin-top:var(--space-md)">
                    <button class="mc-btn" style="background:rgba(171,71,188,0.1);color:var(--neon-magenta);border-color:rgba(171,71,188,0.3)" onclick="DonationsAdminPage.grantRank()">Grant Rank</button>
                </div>
            </div>
        `);
    },

    async grantRank() {
        const userId = document.getElementById('gr-user').value.trim();
        const rankId = document.getElementById('gr-rank').value;
        const days = parseInt(document.getElementById('gr-days').value) || null;

        if (!userId) { App.showToast('User ID required', 'error'); return; }

        try {
            await API.post('/api/ext/donations/admin/grant-rank', { user_id: userId, rank_id: rankId, duration_days: days });
            App.showToast('Rank granted!', 'success');
            App.closeModal();
        } catch (err) {
            App.showToast(err.message || 'Failed to grant rank', 'error');
        }
    },

    // ── MANUAL DONATION MODAL ──
    async showManualDonationModal() {
        let ranks;
        try { ranks = await API.get('/api/ext/donations/admin/ranks'); } catch { ranks = []; }

        App.showModal('Add Manual Donation', `
            <div class="donate-admin-form">
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Username or ID</label>
                    <input id="md-user" class="form-input" placeholder="User's username" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Amount (USD)</label>
                    <input id="md-amount" type="number" step="0.01" class="form-input" value="10.00" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Rank (Optional)</label>
                    <select id="md-rank" class="form-input" style="width:100%">
                        <option value="">None</option>
                        ${ranks.map(r => `<option value="${r.id}">${App.escapeHtml(r.name)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Date</label>
                    <input id="md-date" type="datetime-local" class="form-input" value="${new Date().toISOString().slice(0, 16)}" style="width:100%">
                </div>
                <div style="display:flex;align-items:center;padding-top:24px">
                    <label style="font-size:0.8rem;color:var(--text-muted);cursor:pointer">
                        <input id="md-grant" type="checkbox" checked> Grant Rank?
                    </label>
                </div>
                <div class="full-width" style="text-align:right;margin-top:var(--space-md)">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.addManualDonation()">Add Donation</button>
                </div>
            </div>
        `);
    },

    async addManualDonation() {
        const username = document.getElementById('md-user').value.trim();
        const amount = parseFloat(document.getElementById('md-amount').value);
        const rankId = document.getElementById('md-rank').value;
        const date = document.getElementById('md-date').value;
        const grant = document.getElementById('md-grant').checked;

        if (!username || isNaN(amount)) { App.showToast('Username and amount required', 'error'); return; }

        try {
            await API.post('/api/ext/donations/admin/manual-donation', { 
                username, 
                rank_id: rankId, 
                amount, 
                created_at: date ? new Date(date).toISOString() : null,
                grant_rank: grant
            });
            App.showToast('Manual donation added!', 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to add donation', 'error');
        }
    },

    // ══════════════════════════════════════════════════════
    // CRYPTO SETTINGS TAB
    // ══════════════════════════════════════════════════════

    async renderCryptoSettings(area) {
        try {
            const [cfg, status] = await Promise.all([
                API.get('/api/ext/donations/admin/crypto/config'),
                API.get('/api/ext/donations/admin/crypto/status').catch(() => ({})),
            ]);

            const isSuperadmin = App.currentUser?.role === 'superadmin';
            const statusBadge = s => {
                const map = { connected: ['var(--neon-green)', '●'], degraded: ['#eab308', '●'], offline: ['var(--neon-magenta)', '●'], disabled: ['var(--text-muted)', '○'] };
                const [color, dot] = map[s] || ['var(--text-muted)', '○'];
                return `<span style="color:${color}">${dot} ${s}</span>`;
            };

            area.innerHTML = `
                <div style="display:grid;gap:var(--space-lg)">

                <!-- Chain toggles + status -->
                <div class="donate-admin-card">
                    <h3 class="donate-admin-section-title">Blockchain Status</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md)">
                        <div class="donate-chain-status-card">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span style="font-weight:700">◎ Solana</span>
                                ${statusBadge(status.solana || 'disabled')}
                            </div>
                            <label class="donate-toggle-label">
                                <input type="checkbox" id="cfg-sol-enabled" ${cfg.solana_enabled ? 'checked' : ''}>
                                Enable Solana payments
                            </label>
                        </div>
                        <div class="donate-chain-status-card">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                                <span style="font-weight:700">Ł Litecoin</span>
                                ${statusBadge(status.litecoin || 'disabled')}
                            </div>
                            <label class="donate-toggle-label">
                                <input type="checkbox" id="cfg-ltc-enabled" ${cfg.litecoin_enabled ? 'checked' : ''}>
                                Enable Litecoin payments
                            </label>
                        </div>
                    </div>
                </div>

                <!-- RPC Endpoints -->
                <div class="donate-admin-card">
                    <h3 class="donate-admin-section-title">RPC Endpoints</h3>
                    <div class="donate-admin-form">
                        <div class="full-width">
                            <label class="donate-admin-label">Solana RPC (Primary)</label>
                            <input id="cfg-sol-rpc-primary" class="form-input" value="${App.escapeHtml(cfg.solana_rpc_primary || '')}" placeholder="https://api.mainnet-beta.solana.com" style="width:100%">
                        </div>
                        <div class="full-width">
                            <label class="donate-admin-label">Solana RPC (Secondary / Fallback)</label>
                            <input id="cfg-sol-rpc-secondary" class="form-input" value="${App.escapeHtml(cfg.solana_rpc_secondary || '')}" placeholder="Optional fallback RPC" style="width:100%">
                        </div>
                        <div class="full-width">
                            <label class="donate-admin-label">Litecoin RPC (Primary)</label>
                            <input id="cfg-ltc-rpc-primary" class="form-input" value="${App.escapeHtml(cfg.litecoin_rpc_primary || '')}" placeholder="https://api.blockcypher.com/v1/ltc/main" style="width:100%">
                        </div>
                        <div class="full-width">
                            <label class="donate-admin-label">Litecoin RPC (Secondary / Fallback)</label>
                            <input id="cfg-ltc-rpc-secondary" class="form-input" value="${App.escapeHtml(cfg.litecoin_rpc_secondary || '')}" placeholder="Optional fallback RPC" style="width:100%">
                        </div>
                    </div>
                </div>

                <!-- Webhook Secrets -->
                <div class="donate-admin-card">
                    <h3 class="donate-admin-section-title">Webhook Secrets</h3>
                    <div class="donate-admin-form">
                        <div>
                            <label class="donate-admin-label">Solana Webhook Secret (Helius)</label>
                            <input id="cfg-sol-webhook" type="password" class="form-input" placeholder="${cfg.solana_webhook_secret_set ? '••••••••' : 'Not set'}" style="width:100%">
                        </div>
                        <div>
                            <label class="donate-admin-label">Litecoin Webhook Secret (BlockCypher)</label>
                            <input id="cfg-ltc-webhook" type="password" class="form-input" placeholder="${cfg.litecoin_webhook_secret_set ? '••••••••' : 'Not set'}" style="width:100%">
                        </div>
                    </div>
                </div>

                <!-- Wallet Setup (superadmin only) -->
                <div class="donate-admin-card">
                    <h3 class="donate-admin-section-title">HD Wallet Setup</h3>
                    ${isSuperadmin ? `
                    <div style="display:grid;gap:var(--space-md)">
                        <div class="donate-wallet-status-row">
                            <span>Solana Seed:</span>
                            <span style="color:${cfg.solana_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'}">
                                ${cfg.solana_seed_configured ? '✓ Configured' : '✗ Not configured'}
                            </span>
                            ${cfg.solana_seed_masked ? `<code style="font-size:0.72rem;color:var(--text-muted)">${App.escapeHtml(cfg.solana_seed_masked)}</code>` : ''}
                        </div>
                        <div class="donate-wallet-status-row">
                            <span>Litecoin Seed:</span>
                            <span style="color:${cfg.litecoin_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'}">
                                ${cfg.litecoin_seed_configured ? '✓ Configured' : '✗ Not configured'}
                            </span>
                            ${cfg.litecoin_seed_masked ? `<code style="font-size:0.72rem;color:var(--text-muted)">${App.escapeHtml(cfg.litecoin_seed_masked)}</code>` : ''}
                        </div>
                        <div style="display:flex;gap:var(--space-md);flex-wrap:wrap;margin-top:8px">
                            <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)" onclick="DonationsAdminPage.showWalletSetupModal()">
                                🔑 Set Seed Phrase
                            </button>
                            <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.generateNewSeed()">
                                ✨ Generate New Seed
                            </button>
                        </div>
                        <p style="font-size:0.75rem;color:var(--text-muted);margin:0">
                            ⚠️ The seed phrase is encrypted with AES-256 and stored in config.json. Never share it. Changing the seed will re-derive all user addresses.
                        </p>
                    </div>` : `
                    <div style="padding:1rem;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:var(--radius-md);color:var(--text-muted);font-size:0.85rem">
                        🔒 Wallet seed configuration is restricted to superadmins only.
                    </div>`}
                </div>

                <!-- Save button -->
                <div style="text-align:right">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.saveCryptoConfig()">
                        Save Crypto Settings
                    </button>
                </div>

                </div>`;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load crypto settings.</p>';
        }
    },

    async saveCryptoConfig() {
        try {
            const body = {
                solana_enabled:  document.getElementById('cfg-sol-enabled')?.checked,
                litecoin_enabled: document.getElementById('cfg-ltc-enabled')?.checked,
                solana_rpc_primary:    document.getElementById('cfg-sol-rpc-primary')?.value,
                solana_rpc_secondary:  document.getElementById('cfg-sol-rpc-secondary')?.value,
                litecoin_rpc_primary:  document.getElementById('cfg-ltc-rpc-primary')?.value,
                litecoin_rpc_secondary: document.getElementById('cfg-ltc-rpc-secondary')?.value,
            };
            const solWebhook = document.getElementById('cfg-sol-webhook')?.value;
            const ltcWebhook = document.getElementById('cfg-ltc-webhook')?.value;
            if (solWebhook) body.solana_webhook_secret = solWebhook;
            if (ltcWebhook) body.litecoin_webhook_secret = ltcWebhook;

            await API.put('/api/ext/donations/admin/crypto/config', body);
            App.showToast('Crypto settings saved!', 'success');
        } catch (err) {
            App.showToast('Failed to save crypto settings', 'error');
        }
    },

    async showWalletSetupModal() {
        App.showModal('Set Seed Phrase', `
            <div style="display:grid;gap:var(--space-md)">
                <p style="color:var(--text-secondary);font-size:0.85rem;margin:0">
                    Enter a 12 or 24-word BIP39 mnemonic. This will be encrypted and stored in config.json.
                    <strong style="color:var(--neon-magenta)">Never share this phrase.</strong>
                </p>
                <div>
                    <label class="donate-admin-label">Solana Seed Phrase (leave blank to keep existing)</label>
                    <textarea id="ws-sol-seed" class="form-input" rows="3" placeholder="word1 word2 word3 ..." style="width:100%;resize:vertical;font-family:monospace"></textarea>
                </div>
                <div>
                    <label class="donate-admin-label">Litecoin Seed Phrase (leave blank to keep existing, or use same seed)</label>
                    <textarea id="ws-ltc-seed" class="form-input" rows="3" placeholder="word1 word2 word3 ..." style="width:100%;resize:vertical;font-family:monospace"></textarea>
                </div>
                <div style="text-align:right">
                    <button class="mc-btn" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:rgba(239,68,68,0.3)" onclick="DonationsAdminPage.saveWalletSeeds()">
                        🔒 Save Encrypted Seeds
                    </button>
                </div>
            </div>
        `);
    },

    async saveWalletSeeds() {
        const solSeed = document.getElementById('ws-sol-seed')?.value.trim();
        const ltcSeed = document.getElementById('ws-ltc-seed')?.value.trim();
        if (!solSeed && !ltcSeed) { App.showToast('Enter at least one seed phrase', 'warning'); return; }

        const body = {};
        if (solSeed) body.solana_mnemonic = solSeed;
        if (ltcSeed) body.litecoin_mnemonic = ltcSeed;

        try {
            await API.put('/api/ext/donations/admin/crypto/wallet', body);
            App.showToast('Seed phrases saved and encrypted!', 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to save seeds', 'error');
        }
    },

    async generateNewSeed() {
        if (!confirm('Generate a new random seed phrase? This will replace the existing seed and re-derive all addresses. Make sure to back it up!')) return;
        try {
            const data = await API.post('/api/ext/donations/admin/crypto/generate-seed', {});
            App.showModal('New Seed Generated', `
                <div style="display:grid;gap:var(--space-md)">
                    <p style="color:var(--neon-magenta);font-size:0.85rem;font-weight:700">⚠️ Write this down and store it safely. It will not be shown again.</p>
                    <div style="background:#0d1117;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;font-family:monospace;font-size:0.85rem;color:var(--neon-cyan);word-break:break-all;line-height:1.8">
                        ${App.escapeHtml(data.mnemonic)}
                    </div>
                    <p style="color:var(--text-muted);font-size:0.75rem">${data.word_count} words · BIP39</p>
                    <div style="display:flex;gap:var(--space-md)">
                        <button class="mc-btn" style="flex:1;background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)"
                            onclick="navigator.clipboard.writeText('${App.escapeHtml(data.mnemonic)}');App.showToast('Copied!','success')">
                            Copy to Clipboard
                        </button>
                        <button class="mc-btn" style="flex:1;background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                            onclick="DonationsAdminPage._applySeed('${App.escapeHtml(data.mnemonic)}')">
                            Apply as Both Seeds
                        </button>
                    </div>
                </div>
            `);
        } catch (err) {
            App.showToast('Failed to generate seed', 'error');
        }
    },

    async _applySeed(mnemonic) {
        try {
            await API.put('/api/ext/donations/admin/crypto/wallet', {
                solana_mnemonic: mnemonic,
                litecoin_mnemonic: mnemonic,
            });
            App.showToast('Seed applied and encrypted!', 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to apply seed', 'error');
        }
    },

    // ══════════════════════════════════════════════════════
    // BALANCE SETTINGS TAB
    // ══════════════════════════════════════════════════════

    async renderBalanceSettings(area) {
        try {
            const cfg = await API.get('/api/ext/donations/admin/crypto/config');
            const currencies = cfg.balance_display_currencies || ['usd','sol','ltc','eur','gbp'];
            const allCurrencies = ['usd','sol','ltc','eur','gbp'];

            area.innerHTML = `
                <div class="donate-admin-card">
                    <h3 class="donate-admin-section-title">Balance Display Currencies</h3>
                    <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:1rem">Select which currencies users can choose to display their balance in.</p>
                    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:1.5rem">
                        ${allCurrencies.map(c => `
                            <label class="donate-toggle-label" style="padding:8px 16px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
                                <input type="checkbox" name="bal-currency" value="${c}" ${currencies.includes(c) ? 'checked' : ''}>
                                ${c.toUpperCase()}
                            </label>`).join('')}
                    </div>
                    <div style="text-align:right">
                        <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.saveBalanceSettings()">
                            Save Balance Settings
                        </button>
                    </div>
                </div>`;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load balance settings.</p>';
        }
    },

    async saveBalanceSettings() {
        const checked = [...document.querySelectorAll('input[name="bal-currency"]:checked')].map(el => el.value);
        if (!checked.length) { App.showToast('Select at least one currency', 'warning'); return; }
        try {
            await API.put('/api/ext/donations/admin/crypto/config', { balance_display_currencies: checked });
            App.showToast('Balance settings saved!', 'success');
        } catch (err) {
            App.showToast('Failed to save balance settings', 'error');
        }
    },

    // ══════════════════════════════════════════════════════
    // USER BALANCES TAB
    // ══════════════════════════════════════════════════════

    async renderUserBalances(area) {
        try {
            const search = this._balanceSearch || '';
            const data = await API.get(`/api/ext/donations/admin/balances?search=${encodeURIComponent(search)}&limit=50`);

            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:1rem;flex-wrap:wrap">
                    <h3 style="margin:0;font-size:1rem;color:var(--text-secondary)">User Balances</h3>
                    <input class="form-input" placeholder="Search username..." value="${App.escapeHtml(search)}"
                        oninput="DonationsAdminPage._balanceSearch=this.value;clearTimeout(DonationsAdminPage._bsTimer);DonationsAdminPage._bsTimer=setTimeout(()=>DonationsAdminPage.loadTab(),400)"
                        style="max-width:220px">
                </div>
                <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">
                <table class="donate-table">
                    <thead><tr>
                        <th>User</th><th>Balance (USD)</th><th>Display Currency</th><th>Last Updated</th><th>Actions</th>
                    </tr></thead>
                    <tbody>`;

            for (const b of data.balances) {
                const name = App.escapeHtml(b.display_name || b.username || b.user_id);
                html += `
                    <tr>
                        <td>${name}</td>
                        <td style="color:var(--neon-green);font-weight:700">$${parseFloat(b.usd_balance).toFixed(2)}</td>
                        <td><span style="font-size:0.75rem;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:999px">${(b.balance_display_currency||'usd').toUpperCase()}</span></td>
                        <td style="font-size:0.8rem;color:var(--text-muted)">${b.updated_at ? new Date(b.updated_at).toLocaleDateString() : '—'}</td>
                        <td style="display:flex;gap:6px">
                            <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem" onclick="DonationsAdminPage.showAdjustModal('${b.user_id}','${name}')">Adjust</button>
                            <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem;color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)" onclick="DonationsAdminPage.showLedgerModal('${b.user_id}','${name}')">Ledger</button>
                        </td>
                    </tr>`;
            }

            if (!data.balances.length) {
                html += '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:2rem">No balances found.</td></tr>';
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load user balances.</p>';
        }
    },

    showAdjustModal(userId, username) {
        App.showModal(`Adjust Balance — ${username}`, `
            <div style="display:grid;gap:var(--space-md)">
                <p style="color:var(--text-secondary);font-size:0.85rem;margin:0">
                    Positive amount = credit, negative = debit. A reason is required for audit purposes.
                </p>
                <div>
                    <label class="donate-admin-label">Amount (USD)</label>
                    <input id="adj-amount" type="number" step="0.01" class="form-input" placeholder="e.g. 10.00 or -5.00" style="width:100%">
                </div>
                <div>
                    <label class="donate-admin-label">Reason (required)</label>
                    <input id="adj-reason" class="form-input" placeholder="e.g. Refund for failed payment" style="width:100%">
                </div>
                <div style="text-align:right">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)"
                        onclick="DonationsAdminPage.submitAdjust('${userId}')">Apply Adjustment</button>
                </div>
            </div>
        `);
    },

    async submitAdjust(userId) {
        const amount = parseFloat(document.getElementById('adj-amount')?.value);
        const reason = document.getElementById('adj-reason')?.value.trim();
        if (isNaN(amount) || amount === 0) { App.showToast('Enter a non-zero amount', 'warning'); return; }
        if (!reason) { App.showToast('Reason is required', 'warning'); return; }
        try {
            const result = await API.post(`/api/ext/donations/admin/balances/${userId}/adjust`, { amount, reason });
            App.showToast(`Balance updated. New balance: $${result.new_balance.toFixed(2)}`, 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Adjustment failed', 'error');
        }
    },

    async showLedgerModal(userId, username) {
        try {
            const ledger = await API.get(`/api/ext/donations/admin/balances/${userId}/ledger`);
            let rows = ledger.map(t => `
                <tr>
                    <td style="color:${t.type==='credit'?'var(--neon-green)':'var(--neon-magenta)'}">${t.type === 'credit' ? '+' : '-'}$${Math.abs(t.amount_usd).toFixed(2)}</td>
                    <td style="font-size:0.75rem">${App.escapeHtml(t.source)}</td>
                    <td style="font-size:0.75rem;color:var(--text-muted)">${App.escapeHtml(t.description||'')}</td>
                    <td style="font-size:0.75rem;color:var(--text-muted)">${new Date(t.created_at).toLocaleDateString()}</td>
                </tr>`).join('');
            if (!rows) rows = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem">No transactions.</td></tr>';

            App.showModal(`Balance Ledger — ${username}`, `
                <div style="max-height:400px;overflow-y:auto">
                <table class="donate-table">
                    <thead><tr><th>Amount</th><th>Source</th><th>Description</th><th>Date</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                </div>
            `);
        } catch (err) {
            App.showToast('Failed to load ledger', 'error');
        }
    }
};
