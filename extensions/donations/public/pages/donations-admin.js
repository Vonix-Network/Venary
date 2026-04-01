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
                    <button class="mc-chart-btn ${this.activeTab === 'ranked-users' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('ranked-users', this)">Ranked Users</button>
                    <button class="mc-chart-btn ${this.activeTab === 'history' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('history', this)">Donations</button>
                    <button class="mc-chart-btn ${this.activeTab === 'settings' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('settings', this)">Settings</button>
                    <button class="mc-chart-btn ${this.activeTab === 'crypto' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('crypto', this)">Crypto</button>
                    ${App.currentUser?.role === 'superadmin' ? `<button class="mc-chart-btn ${this.activeTab === 'wallet' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('wallet', this)">Wallet</button>` : ''}
                    <button class="mc-chart-btn ${this.activeTab === 'balance-settings' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('balance-settings', this)">Balance Settings</button>
                    <button class="mc-chart-btn ${this.activeTab === 'balances' ? 'active' : ''}" onclick="DonationsAdminPage.switchTab('balances', this)">User Balances</button>
                </div>

                <div id="donate-admin-content"></div>
            </div>`;

        container.innerHTML = html;

        // Restore sub-tab from URL on render (e.g. #/admin?tab=donations&subtab=crypto)
        const _dQs     = new URLSearchParams(window.location.hash.split('?')[1] || '');
        const _subtab  = _dQs.get('subtab');
        if (_subtab && document.querySelector(`.mc-chart-btn[onclick*="'${_subtab}'"]`)) {
            this.activeTab = _subtab;
        }

        this.loadTab();
    },

    switchTab(tab, btn) {
        this.activeTab = tab;
        if (btn) {
            btn.closest('.mc-chart-controls').querySelectorAll('.mc-chart-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        // Silently update URL so refresh restores this sub-tab
        const _qs = new URLSearchParams(window.location.hash.split('?')[1] || '');
        _qs.set('subtab', tab);
        history.replaceState(null, '', '#/admin?' + _qs.toString());
        this.loadTab();
    },

    async loadTab() {
        const area = document.getElementById('donate-admin-content');
        if (!area) return;
        area.innerHTML = '<div class="loading-spinner" style="text-align:center;padding:2rem">Loading...</div>';

        switch (this.activeTab) {
            case 'overview': return this.renderOverview(area);
            case 'ranks': return this.renderRanks(area);
            case 'ranked-users': return this.renderRankedUsers(area);
            case 'history': return this.renderHistory(area);
            case 'settings': return this.renderSettings(area);
            case 'crypto': return this.renderCryptoSettings(area);
            case 'wallet': return this.renderWallet(area);
            case 'balance-settings': return this.renderBalanceSettings(area);
            case 'balances': return this.renderUserBalances(area);
        }
    },

    // ── OVERVIEW ──
    async renderOverview(area) {
        try {
            const stats = await API.get('/api/ext/donations/admin/stats');
            area.innerHTML = `
                <div style="display:flex;flex-direction:column;gap:1.5rem">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;">
                        <div style="background:linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:1.5rem;box-shadow:0 8px 16px rgba(0,0,0,0.2);position:relative;overflow:hidden">
                            <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.05">💰</div>
                            <div style="color:var(--text-muted);font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem">Total Revenue</div>
                            <div style="font-size:2rem;font-weight:800;color:#fff">$${stats.total_revenue.toFixed(2)}</div>
                        </div>
                        <div style="background:linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:1.5rem;box-shadow:0 8px 16px rgba(0,0,0,0.2);position:relative;overflow:hidden">
                            <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.05">📈</div>
                            <div style="color:var(--text-muted);font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem">This Month</div>
                            <div style="font-size:2rem;font-weight:800;color:var(--neon-green)">$${stats.month_revenue.toFixed(2)}</div>
                        </div>
                        <div style="background:linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:1.5rem;box-shadow:0 8px 16px rgba(0,0,0,0.2);position:relative;overflow:hidden">
                            <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.05">🤝</div>
                            <div style="color:var(--text-muted);font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem">Total Donations</div>
                            <div style="font-size:2rem;font-weight:800;color:var(--neon-cyan)">${stats.total_donations}</div>
                        </div>
                        <div style="background:linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9));border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:1.5rem;box-shadow:0 8px 16px rgba(0,0,0,0.2);position:relative;overflow:hidden">
                            <div style="position:absolute;top:-10px;right:-10px;font-size:4rem;opacity:0.05">⭐</div>
                            <div style="color:var(--text-muted);font-size:0.85rem;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.5rem">Active Ranked Users</div>
                            <div style="font-size:2rem;font-weight:800;color:var(--neon-magenta)">${stats.active_ranks}</div>
                        </div>
                    </div>
                    
                    <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:12px;padding:1.5rem">
                        <h3 style="margin:0 0 1rem 0;font-size:1.1rem;color:var(--text-primary);display:flex;align-items:center;gap:8px">
                            <span style="color:#f5a623">⚡</span> Quick Actions
                        </h3>
                        <div style="display:flex;gap:1rem;flex-wrap:wrap">
                            <button class="mc-btn" style="background:linear-gradient(135deg, rgba(41,182,246,0.1), rgba(41,182,246,0.2));color:var(--neon-cyan);border:1px solid rgba(41,182,246,0.3);padding:12px 20px;font-weight:600;flex:1;min-width:150px;justify-content:center" onclick="DonationsAdminPage.switchTab('ranks')">
                                <span style="font-size:1.2rem;margin-right:6px">🏅</span> Manage Ranks
                            </button>
                            <button class="mc-btn" style="background:linear-gradient(135deg, rgba(171,71,188,0.1), rgba(171,71,188,0.2));color:var(--neon-magenta);border:1px solid rgba(171,71,188,0.3);padding:12px 20px;font-weight:600;flex:1;min-width:150px;justify-content:center" onclick="DonationsAdminPage.showGrantRankModal()">
                                <span style="font-size:1.2rem;margin-right:6px">🎁</span> Grant Rank
                            </button>
                            <button class="mc-btn" style="background:linear-gradient(135deg, rgba(102,187,106,0.1), rgba(102,187,106,0.2));color:var(--neon-green);border:1px solid rgba(102,187,106,0.3);padding:12px 20px;font-weight:600;flex:1;min-width:150px;justify-content:center" onclick="DonationsAdminPage.showManualDonationModal()">
                                <span style="font-size:1.2rem;margin-right:6px">💵</span> Add Donation
                            </button>
                        </div>
                    </div>
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
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
                    <h3 style="margin:0;font-size:1.2rem;color:var(--text-primary);font-weight:700">Donation Ranks</h3>
                    <button class="mc-btn" style="background:var(--neon-green);color:#000;border:none;padding:8px 16px;font-weight:600;box-shadow:0 0 10px rgba(102,187,106,0.3)" onclick="DonationsAdminPage.showRankEditor()">
                        + Create New Rank
                    </button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:1.5rem">`;

            if (!ranks.length) {
                html += `<div style="grid-column:1/-1;text-align:center;padding:3rem;background:rgba(255,255,255,0.02);border-radius:12px;border:1px dashed var(--border-subtle);color:var(--text-muted)">
                    No ranks created yet. Click "Create New Rank" to get started.
                </div>`;
            }

            for (const r of ranks) {
                const perkCount = (r.perks || []).length;
                html += `
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;transition:transform 0.2s, box-shadow 0.2s;display:flex;flex-direction:column;position:relative" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow='none'">
                        <div style="height:4px;background:${App.escapeHtml(r.color)};width:100%"></div>
                        <div style="padding:1.5rem;flex:1;display:flex;flex-direction:column">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
                                <div style="display:flex;align-items:center;gap:12px">
                                    <div style="width:48px;height:48px;border-radius:12px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:1.5rem;border:1px solid rgba(255,255,255,0.1)">
                                        ${r.icon}
                                    </div>
                                    <div>
                                        <h4 style="margin:0;font-size:1.2rem;color:${App.escapeHtml(r.color)};font-weight:800">${App.escapeHtml(r.name)}</h4>
                                        <div style="color:var(--text-muted);font-size:0.8rem;margin-top:2px">Order: ${r.sort_order}</div>
                                    </div>
                                </div>
                                <div style="background:rgba(255,255,255,0.05);padding:4px 10px;border-radius:20px;font-weight:700;font-size:1.1rem;color:#fff">
                                    $${r.price.toFixed(2)}
                                </div>
                            </div>
                            
                            <div style="margin-bottom:1.5rem;flex:1">
                                <p style="color:var(--text-secondary);font-size:0.9rem;margin:0 0 1rem 0;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis">
                                    ${App.escapeHtml(r.description || 'No description provided.')}
                                </p>
                                <div style="display:flex;gap:8px;flex-wrap:wrap">
                                    <span style="font-size:0.75rem;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle)">
                                        Group: <span style="color:#fff">${App.escapeHtml(r.luckperms_group || 'none')}</span>
                                    </span>
                                    <span style="font-size:0.75rem;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:4px;color:var(--text-muted);border:1px solid var(--border-subtle)">
                                        Perks: <span style="color:#fff">${perkCount}</span>
                                    </span>
                                    ${r.active ? 
                                        `<span style="font-size:0.75rem;padding:2px 8px;background:rgba(74,222,128,0.1);border-radius:4px;color:var(--neon-green);border:1px solid rgba(74,222,128,0.2)">Active</span>` : 
                                        `<span style="font-size:0.75rem;padding:2px 8px;background:rgba(239,68,68,0.1);border-radius:4px;color:#ef4444;border:1px solid rgba(239,68,68,0.2)">Inactive</span>`
                                    }
                                </div>
                            </div>
                            
                            <div style="display:flex;gap:8px;margin-top:auto;border-top:1px solid var(--border-subtle);padding-top:1rem">
                                <button class="mc-btn" style="flex:1;background:rgba(255,255,255,0.05);color:#fff;border-color:rgba(255,255,255,0.1)" onclick="DonationsAdminPage.showRankEditor('${r.id}')">
                                    Edit Rank
                                </button>
                                <button class="mc-btn" style="width:40px;background:rgba(239,68,68,0.05);color:#ef4444;border-color:rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center" onclick="DonationsAdminPage.deleteRank('${r.id}', '${App.escapeHtml(r.name)}')" title="Delete Rank">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    </div>`;
            }

            html += '</div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load ranks.</p>';
        }
    },

    // ── RANKED USERS ──
    async renderRankedUsers(area) {
        try {
            const data = await API.get('/api/ext/donations/admin/ranked-users?limit=50');
            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                    <h3 style="margin:0;font-size:1rem;color:var(--text-secondary)">Users with Active Ranks</h3>
                    <div style="font-size:0.85rem;color:var(--text-muted)">Total: ${data.total}</div>
                </div>
                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">
                <table class="donate-table">
                    <thead><tr>
                        <th>User</th><th>Rank</th><th>Started</th><th>Expires</th>
                    </tr></thead>
                    <tbody>`;

            for (const u of data.users) {
                const expires = u.expires_at ? new Date(u.expires_at) : null;
                const isPermanent = !expires;
                const isExpired = expires && expires < new Date();
                
                let expiryHtml = '';
                if (isPermanent) {
                    expiryHtml = '<span style="color:var(--text-muted)">Permanent</span>';
                } else if (isExpired) {
                    expiryHtml = '<span style="color:var(--neon-magenta)">Expired</span>';
                } else {
                    const daysLeft = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
                    expiryHtml = `<span>${expires.toLocaleDateString()}</span> <span style="font-size:0.75rem;color:var(--text-muted)">(${daysLeft} days)</span>`;
                }

                html += `
                    <tr>
                        <td style="font-weight:600">${App.escapeHtml(u.username)}</td>
                        <td><span style="color:${App.escapeHtml(u.rank_color || '#fff')};font-weight:700;background:rgba(255,255,255,0.05);padding:2px 8px;border-radius:12px">${App.escapeHtml(u.rank_name || '—')}</span></td>
                        <td style="font-size:0.85rem;color:var(--text-muted)">${u.started_at ? new Date(u.started_at).toLocaleDateString() : '—'}</td>
                        <td style="font-size:0.85rem">${expiryHtml}</td>
                    </tr>`;
            }

            if (!data.users.length) {
                html += '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:2rem">No users currently have an active rank.</td></tr>';
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load ranked users.</p>';
        }
    },

    // ── HISTORY ──
    _donationHistory: [],

    async renderHistory(area) {
        try {
            const [data, ranks] = await Promise.all([
                API.get('/api/ext/donations/admin/donations?limit=50'),
                API.get('/api/ext/donations/admin/ranks').catch(() => []),
            ]);
            this._donationHistory = data.donations;
            this._donationRanks   = ranks;

            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                    <h3 style="margin:0;font-size:1rem;color:var(--text-secondary)">Donation History</h3>
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage.showManualDonationModal()">+ Manual Donation</button>
                </div>
                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);overflow:hidden">
                <table class="donate-table">
                    <thead><tr>
                        <th>User</th><th>Rank</th><th>Amount</th><th>Status</th><th>Date</th><th></th>
                    </tr></thead>
                    <tbody>`;

            for (const d of data.donations) {
                const statusClass = d.status === 'completed' ? 'completed' : d.status === 'pending' ? 'pending' : 'failed';
                const typeIcon    = d.payment_type === 'manual' ? '📝 ' : '';
                const isGuest     = !d.user_id;
                const displayName = isGuest
                    ? `<span style="color:var(--text-muted);font-size:0.82rem">👤 ${App.escapeHtml(d.minecraft_username || 'Guest')}</span>`
                    : App.escapeHtml(d.username);
                html += `
                    <tr>
                        <td>${displayName}</td>
                        <td><span style="color:${App.escapeHtml(d.rank_color || '#fff')}">${App.escapeHtml(d.rank_name || '—')}</span></td>
                        <td>$${d.amount.toFixed(2)} <small style="color:var(--text-muted);font-size:0.7rem">${d.payment_type}</small></td>
                        <td><span class="donate-status ${statusClass}">${typeIcon}${d.status}</span></td>
                        <td style="font-size:0.8rem;color:var(--text-muted)">${new Date(d.created_at).toLocaleDateString()}</td>
                        <td style="display:flex;gap:5px;align-items:center;flex-wrap:wrap">
                            <button class="mc-btn" style="padding:3px 10px;font-size:0.72rem;background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1);color:var(--text-secondary)"
                                onclick="DonationsAdminPage.showEditDonationModal('${d.id}')">Edit</button>
                            ${d.status === 'completed' ? `<button class="mc-btn" style="padding:3px 10px;font-size:0.72rem;background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.25);color:#10b981"
                                onclick="DonationsAdminPage.showReceiptModal('${d.id}')">Receipt</button>` : ''}
                        </td>
                    </tr>`;
            }

            if (!data.donations.length) {
                html += '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem">No donations yet.</td></tr>';
            }

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load donations.</p>';
        }
    },

    async showEditDonationModal(donationId) {
        const d = this._donationHistory?.find(x => x.id === donationId);
        if (!d) { App.showToast('Donation not found', 'error'); return; }

        const ranks = this._donationRanks || [];
        const rankOptions = `<option value="">— None —</option>` +
            ranks.map(r => `<option value="${r.id}" ${d.rank_id === r.id ? 'selected' : ''}>${App.escapeHtml(r.name)}</option>`).join('');

        const currentUser = d.user_id ? d.username : '';

        App.showModal('Edit Donation', `
            <div style="display:grid;gap:14px">
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-size:0.78rem;color:var(--text-muted)">
                    Ref: <strong style="color:var(--text-secondary);font-family:monospace">${d.id.slice(0,12).toUpperCase()}</strong>
                    &nbsp;·&nbsp; ${new Date(d.created_at).toLocaleString()}
                    &nbsp;·&nbsp; ${d.payment_type}
                </div>

                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">
                        Assign to Registered User
                        <span style="font-weight:400"> — leave blank to keep as guest</span>
                    </label>
                    <input id="ed-username" class="input-field" style="width:100%"
                        value="${App.escapeHtml(currentUser)}"
                        placeholder="Registered username or display name">
                    ${d.user_id ? '' : `<div style="margin-top:5px;font-size:0.72rem;color:#f59e0b">⚠ Currently unassigned (guest: ${App.escapeHtml(d.minecraft_username || '—')})</div>`}
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Amount (USD)</label>
                        <input id="ed-amount" type="number" step="0.01" min="0.01" class="input-field" style="width:100%" value="${d.amount.toFixed(2)}">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Status</label>
                        <select id="ed-status" class="input-field" style="width:100%">
                            ${['pending','completed','failed','refunded'].map(s =>
                                `<option value="${s}" ${d.status === s ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Rank</label>
                    <select id="ed-rank" class="input-field" style="width:100%">${rankOptions}</select>
                </div>

                <div style="display:flex;justify-content:flex-end;gap:10px;padding-top:4px">
                    <button class="mc-btn" style="background:rgba(255,255,255,0.04);color:var(--text-muted);border-color:rgba(255,255,255,0.1)"
                        onclick="App.closeModal()">Cancel</button>
                    <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                        onclick="DonationsAdminPage.saveEditDonation('${d.id}')">Save Changes</button>
                </div>
            </div>
        `);
    },

    async saveEditDonation(donationId) {
        const username = document.getElementById('ed-username')?.value.trim();
        const amount   = document.getElementById('ed-amount')?.value;
        const status   = document.getElementById('ed-status')?.value;
        const rankId   = document.getElementById('ed-rank')?.value;

        try {
            await API.patch(`/api/ext/donations/admin/donations/${donationId}`, {
                username,   // server treats '' as clear-to-guest, non-empty as lookup
                amount:  parseFloat(amount),
                status,
                rank_id: rankId || null,
            });
            App.showToast('Donation updated', 'success');
            App.closeModal();
            this.renderHistory(document.getElementById('donate-admin-content'));
        } catch (err) {
            App.showToast(err.message || 'Failed to update donation', 'error');
        }
    },

    showReceiptModal(donationId) {
        const d = this._donationHistory?.find(x => x.id === donationId);
        if (!d) { App.showToast('Donation not found', 'error'); return; }

        const refId      = d.id.slice(0, 8).toUpperCase();
        const dateStr    = new Date(d.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const expiryStr  = d.expires_at ? new Date(d.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
        const rankColor  = d.rank_color || 'var(--neon-cyan)';
        const balApplied = parseFloat(d.balance_applied) || 0;
        const fullAmt    = parseFloat(d.amount) || 0;
        const charged    = Math.max(fullAmt - balApplied, 0);
        const isGuest    = !d.user_id;
        const displayName = d.username || (isGuest ? (d.minecraft_username || 'Guest') : 'Unknown');

        const rankBlock = d.rank_name ? `
            <div style="background:${App.escapeHtml(rankColor)}14;border:1px solid ${App.escapeHtml(rankColor)}44;border-radius:10px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:14px">
                <span style="font-size:1.8rem">${d.rank_icon || '⭐'}</span>
                <div>
                    <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em">Rank Granted</div>
                    <div style="font-size:1.1rem;font-weight:700;color:${App.escapeHtml(rankColor)}">${App.escapeHtml(d.rank_name)}</div>
                    ${expiryStr ? `<div style="font-size:0.74rem;color:var(--text-muted);margin-top:2px">Active 30 days — expires ${expiryStr}</div>` : ''}
                </div>
            </div>` : `
            <div style="background:rgba(99,102,241,0.07);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:12px 18px;margin-bottom:16px;text-align:center">
                <div style="font-size:1.4rem">💙</div>
                <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px">One-Time Donation (no rank)</div>
            </div>`;

        const rows = [
            ['Receipt #',    `<code style="font-size:0.82rem;color:var(--text-primary)">${refId}</code>`],
            ['Date',         dateStr],
            ['Donor',        App.escapeHtml(displayName) + (isGuest ? ' <span style="font-size:0.7rem;color:var(--text-muted)">(Guest)</span>' : '')],
            ['Payment type', App.escapeHtml(d.payment_type || 'one-time')],
            d.rank_name ? ['Rank', `<span style="color:${App.escapeHtml(rankColor)};font-weight:600">${App.escapeHtml(d.rank_name)}</span>`] : null,
            balApplied > 0 ? ['Subtotal', `$${fullAmt.toFixed(2)}`] : null,
            balApplied > 0 ? ['Credit Applied', `<span style="color:#10b981">−$${balApplied.toFixed(2)}</span>`] : null,
            ['Total Charged', `<strong style="color:#22c55e;font-size:1rem">$${charged.toFixed(2)} USD</strong>`],
            d.guest_email ? ['Receipt Email', App.escapeHtml(d.guest_email)] : null,
            d.minecraft_username ? ['Minecraft User', App.escapeHtml(d.minecraft_username)] : null,
            d.stripe_session_id ? ['Stripe Session', `<code style="font-size:0.7rem;color:var(--text-muted)">${App.escapeHtml(d.stripe_session_id.slice(0, 24))}…</code>`] : null,
        ].filter(Boolean);

        const tableRows = rows.map(([label, val]) =>
            `<tr style="border-bottom:1px solid var(--border-subtle)">
                <td style="padding:9px 0;font-size:0.82rem;color:var(--text-muted);width:40%">${label}</td>
                <td style="padding:9px 0;font-size:0.82rem;color:var(--text-primary);text-align:right">${val}</td>
            </tr>`
        ).join('');

        App.showModal(`Receipt — ${refId}`, `
            ${rankBlock}
            <table style="width:100%;border-collapse:collapse">${tableRows}</table>
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);display:flex;gap:8px;justify-content:flex-end">
                <button class="mc-btn" style="background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.3);color:#818cf8;font-size:0.8rem;padding:6px 14px"
                    onclick="DonationsAdminPage.showEditDonationModal('${d.id}');App.closeModal()">Edit Donation</button>
                <button class="mc-btn" style="font-size:0.8rem;padding:6px 14px" onclick="App.closeModal()">Close</button>
            </div>
        `);
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
                            <input id="cfg-stripe-key" type="password" class="input-field" value="${App.escapeHtml(config.stripe_secret_key)}" placeholder="sk_live_..." style="width:100%">
                        </div>
                        <div>
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Stripe Webhook Secret</label>
                            <input id="cfg-stripe-webhook" type="password" class="input-field" value="${App.escapeHtml(config.stripe_webhook_secret)}" placeholder="whsec_..." style="width:100%">
                        </div>
                        <div class="full-width">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Discord Donation Webhook URL</label>
                            <input id="cfg-discord-webhook" class="input-field" value="${App.escapeHtml(config.discord_donation_webhook)}" placeholder="https://discord.com/api/webhooks/..." style="width:100%">
                        </div>
                        <div class="full-width">
                            <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Site URL (for Stripe redirects)</label>
                            <input id="cfg-site-url" class="input-field" value="${App.escapeHtml(config.siteUrl)}" placeholder="https://yourdomain.com" style="width:100%">
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
                    <input id="re-name" class="input-field" value="${App.escapeHtml(rank.name)}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Price (USD)</label>
                    <input id="re-price" type="number" step="0.01" class="input-field" value="${rank.price}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Color</label>
                    <input id="re-color" type="color" value="${rank.color}" style="width:100%;height:38px;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:var(--bg-input)">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Icon</label>
                    <input id="re-icon" class="input-field" value="${rank.icon}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">LuckPerms Group</label>
                    <input id="re-lp" class="input-field" value="${App.escapeHtml(rank.luckperms_group || '')}" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Sort Order</label>
                    <input id="re-order" type="number" class="input-field" value="${rank.sort_order}" style="width:100%">
                </div>
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Description</label>
                    <input id="re-desc" class="input-field" value="${App.escapeHtml(rank.description || '')}" style="width:100%">
                </div>
                <div class="full-width">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Perks (one per line)</label>
                    <textarea id="re-perks" class="input-field" rows="4" style="width:100%;resize:vertical">${App.escapeHtml(perksStr)}</textarea>
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
                    <input id="gr-user" class="input-field" placeholder="User UUID" style="width:100%">
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Rank</label>
                    <select id="gr-rank" class="input-field" style="width:100%">
                        ${ranks.map(r => `<option value="${r.id}">${App.escapeHtml(r.name)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Duration (days, blank = permanent)</label>
                    <input id="gr-days" type="number" class="input-field" value="30" style="width:100%">
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

        const rankOptions = ranks.map(r => `<option value="${r.id}">${App.escapeHtml(r.name)}</option>`).join('');

        App.showModal('Add Manual Donation', `
            <div style="display:grid;gap:14px">

                <!-- User type toggle -->
                <div style="display:flex;gap:0;border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden">
                    <button id="md-tab-registered" onclick="DonationsAdminPage._mdSetMode(false)"
                        style="flex:1;padding:8px;font-size:0.82rem;font-weight:700;border:none;cursor:pointer;
                               background:rgba(41,182,246,0.15);color:var(--neon-cyan);transition:background 0.15s">
                        Registered User
                    </button>
                    <button id="md-tab-guest" onclick="DonationsAdminPage._mdSetMode(true)"
                        style="flex:1;padding:8px;font-size:0.82rem;font-weight:700;border:none;cursor:pointer;
                               background:rgba(255,255,255,0.04);color:var(--text-muted);border-left:1px solid rgba(255,255,255,0.1);transition:background 0.15s">
                        Guest (MC Username)
                    </button>
                </div>

                <!-- Registered user field -->
                <div id="md-registered-field">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Username / Display Name</label>
                    <input id="md-user" class="input-field" placeholder="Registered account username" style="width:100%">
                </div>

                <!-- Guest field (hidden initially) -->
                <div id="md-guest-field" style="display:none">
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">
                        Minecraft Username
                        <span style="color:var(--text-muted);font-weight:400"> — used for avatar (mc-heads.net)</span>
                    </label>
                    <input id="md-mc-username" class="input-field" placeholder="e.g. Notch" maxlength="16" style="width:100%">
                </div>

                <!-- Amount + Rank side by side -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Amount (USD)</label>
                        <input id="md-amount" type="number" step="0.01" min="0.01" class="input-field" value="10.00" style="width:100%">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Rank (Optional)</label>
                        <select id="md-rank" class="input-field" style="width:100%">
                            <option value="">None</option>
                            ${rankOptions}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Date</label>
                    <input id="md-date" type="datetime-local" class="input-field" value="${new Date().toISOString().slice(0, 16)}" style="width:100%">
                </div>

                <div style="display:flex;align-items:center;gap:10px">
                    <label style="font-size:0.82rem;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:6px">
                        <input id="md-grant" type="checkbox" checked style="accent-color:var(--neon-green);width:16px;height:16px">
                        Grant rank to user
                    </label>
                    <span style="font-size:0.72rem;color:var(--text-muted)">(Registered users only)</span>
                </div>

                <div style="text-align:right">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)"
                        onclick="DonationsAdminPage.addManualDonation()">Add Donation</button>
                </div>
            </div>
        `);
    },

    _mdSetMode(isGuest) {
        document.getElementById('md-registered-field').style.display = isGuest ? 'none' : 'block';
        document.getElementById('md-guest-field').style.display      = isGuest ? 'block' : 'none';
        const regTab   = document.getElementById('md-tab-registered');
        const guestTab = document.getElementById('md-tab-guest');
        regTab.style.background   = isGuest ? 'rgba(255,255,255,0.04)' : 'rgba(41,182,246,0.15)';
        regTab.style.color        = isGuest ? 'var(--text-muted)'      : 'var(--neon-cyan)';
        guestTab.style.background = isGuest ? 'rgba(41,182,246,0.15)'  : 'rgba(255,255,255,0.04)';
        guestTab.style.color      = isGuest ? 'var(--neon-cyan)'       : 'var(--text-muted)';
    },

    async addManualDonation() {
        const isGuest  = document.getElementById('md-guest-field')?.style.display !== 'none';
        const amount   = parseFloat(document.getElementById('md-amount')?.value);
        const rankId   = document.getElementById('md-rank')?.value;
        const date     = document.getElementById('md-date')?.value;
        const grant    = document.getElementById('md-grant')?.checked;

        if (isNaN(amount) || amount <= 0) { App.showToast('Valid amount required', 'error'); return; }

        const payload = {
            amount,
            rank_id:    rankId || undefined,
            created_at: date ? new Date(date).toISOString() : undefined,
            grant_rank: grant,
        };

        if (isGuest) {
            const mc = document.getElementById('md-mc-username')?.value.trim();
            if (!mc) { App.showToast('Minecraft username required for guest donations', 'error'); return; }
            payload.guest_mode  = true;
            payload.mc_username = mc;
        } else {
            const username = document.getElementById('md-user')?.value.trim();
            if (!username) { App.showToast('Username required', 'error'); return; }
            payload.username = username;
        }

        try {
            await API.post('/api/ext/donations/admin/manual-donation', payload);
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
            const [cfg, status, provCfg] = await Promise.all([
                API.get('/api/ext/donations/admin/crypto/config'),
                API.get('/api/ext/donations/admin/crypto/status').catch(() => ({})),
                API.get('/api/ext/donations/admin/crypto/provider/config').catch(() => ({ active_provider: 'manual', providers: [], config: {} })),
            ]);
            this._lastCryptoConfig = cfg;

            const isSuperadmin = App.currentUser?.role === 'superadmin';
            const { active_provider, providers, config: provConfig } = provCfg;
            this._providerSelection = active_provider;
            const isManual = active_provider === 'manual';

            const statusBadge = s => {
                const map = { connected: ['var(--neon-green)', '●', 'rgba(74,222,128,0.1)'], degraded: ['#eab308', '●', 'rgba(234,179,8,0.1)'], offline: ['var(--neon-magenta)', '●', 'rgba(239,68,68,0.1)'], disabled: ['var(--text-muted)', '○', 'rgba(255,255,255,0.05)'] };
                const [color, dot, bg] = map[s] || ['var(--text-muted)', '○', 'rgba(255,255,255,0.05)'];
                return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;background:${bg};color:${color};font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border:1px solid ${color}30">${dot} ${s}</span>`;
            };

            const providerCards = (providers || []).map(p => {
                const isActive = p.id === active_provider;
                const isConfigured = p.id === 'manual' ? true : (() => {
                    const pc = provConfig[p.id];
                    return pc && Object.values(pc).some(v => v?.set === true);
                })();
                const badge = isConfigured
                    ? `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:rgba(74,222,128,0.1);color:var(--neon-green);font-weight:600">✓ Configured</span>`
                    : `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.06);color:var(--text-muted);font-weight:600">Not set up</span>`;
                const unsafeBadge = p.warning
                    ? `<span style="font-size:0.6rem;padding:2px 6px;border-radius:8px;background:rgba(239,68,68,0.12);color:#ef4444;font-weight:700;display:block;margin-top:6px">⚠ ${p.warning.split('.')[0]}</span>`
                    : '';
                return `
                <div class="pp-card" data-provider="${p.id}"
                    style="cursor:pointer;padding:14px 16px;border-radius:10px;border:2px solid ${isActive ? p.color : 'rgba(255,255,255,0.07)'};
                           background:${isActive ? `${p.color}0d` : 'rgba(255,255,255,0.02)'};
                           transition:border-color 0.2s,background 0.2s"
                    onclick="DonationsAdminPage._selectProvider('${p.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;color:${p.color};margin-bottom:3px">${App.escapeHtml(p.name)}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted)">Fee: <strong style="color:var(--text-secondary)">${p.fee}</strong></div>
                            ${unsafeBadge}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                            ${badge}
                            ${isActive ? `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:${p.color}22;color:${p.color};font-weight:700">● Active</span>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('');

            area.innerHTML = `
                <div style="display:grid;gap:1.5rem">

                    <!-- ── Master Enable/Disable Switch ── -->
                    <div style="background:var(--bg-card);border:1px solid ${cfg.payments_enabled ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'};border-radius:12px;padding:1.1rem 1.5rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;box-shadow:0 4px 16px rgba(0,0,0,0.2)">
                        <div>
                            <div style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:3px">
                                Crypto Payments
                                <span style="margin-left:8px;font-size:0.7rem;padding:2px 8px;border-radius:10px;font-weight:700;
                                    background:${cfg.payments_enabled ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)'};
                                    color:${cfg.payments_enabled ? 'var(--neon-green)' : 'var(--text-muted)'}">
                                    ${cfg.payments_enabled ? '● Enabled' : '○ Disabled'}
                                </span>
                            </div>
                            <div style="font-size:0.8rem;color:var(--text-muted)">When disabled, the /donate page shows no crypto option regardless of provider or coin settings.</div>
                        </div>
                        <button id="crypto-master-toggle" class="mc-btn" style="white-space:nowrap;flex-shrink:0;
                            background:${cfg.payments_enabled ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)'};
                            color:${cfg.payments_enabled ? '#ef4444' : 'var(--neon-green)'};
                            border-color:${cfg.payments_enabled ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'};
                            padding:9px 20px;font-weight:700"
                            onclick="DonationsAdminPage._toggleCryptoMasterSwitch(${!cfg.payments_enabled})">
                            ${cfg.payments_enabled ? '⛔ Disable' : '✅ Enable'}
                        </button>
                    </div>

                    <!-- ── Payment Provider ── -->
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06)">
                            <h2 style="margin:0;font-size:1.1rem;font-weight:700">Payment Provider</h2>
                            <p style="color:var(--text-muted);margin:4px 0 0;font-size:0.82rem">Select how crypto payments are processed. Click a card, configure API keys below, then save.</p>
                        </div>
                        <div style="padding:1rem 1.25rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px" id="pp-cards">
                            ${providerCards}
                        </div>
                    </div>

                    <!-- ── Provider Config Panel ── -->
                    <div id="pp-config-panel" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        ${this._renderProviderConfigPanel(active_provider, provConfig, providers)}
                    </div>

                    <!-- ── Provider Actions ── -->
                    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                        <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                            onclick="DonationsAdminPage._testProviderConnection()">⚡ Test Connection</button>
                        <button class="mc-btn" style="background:rgba(74,222,128,0.1);color:var(--neon-green);border-color:rgba(74,222,128,0.3)"
                            onclick="DonationsAdminPage._saveProviderSettings()">💾 Save Provider</button>
                        <span id="pp-save-status" style="font-size:0.8rem;color:var(--text-muted)"></span>
                    </div>

                    <!-- ── Active Coins (dynamic per-provider) ── -->
                    <div id="active-coins-section" style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:12px;padding:1.5rem;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:8px">
                            <h3 style="margin:0;font-size:1.1rem;color:var(--text-primary);display:flex;align-items:center;gap:8px">
                                <span style="color:var(--neon-cyan)">⚡</span> Active Coins
                                <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400;margin-left:4px">Select which coins are offered to customers at checkout</span>
                            </h3>
                            <div style="display:flex;gap:8px">
                                <button class="mc-btn" style="padding:4px 12px;font-size:0.72rem;background:rgba(41,182,246,0.08);color:var(--neon-cyan);border-color:rgba(41,182,246,0.25)"
                                    onclick="DonationsAdminPage._toggleAllCoins(true)">Select All</button>
                                <button class="mc-btn" style="padding:4px 12px;font-size:0.72rem;background:rgba(255,255,255,0.04);color:var(--text-muted);border-color:rgba(255,255,255,0.12)"
                                    onclick="DonationsAdminPage._toggleAllCoins(false)">Clear All</button>
                            </div>
                        </div>
                        <div id="coins-grid" style="min-height:60px;display:flex;align-items:center;justify-content:center">
                            <span style="color:var(--text-muted);font-size:0.82rem">Loading coins…</span>
                        </div>
                    </div>

                    <!-- ── Manual Mode Infrastructure (RPC + Webhooks + Wallet) ── -->
                    <div style="border:1px solid rgba(255,255,255,${isManual ? '0.08' : '0.03'});border-radius:12px;padding:0;overflow:hidden;opacity:${isManual ? '1' : '0.55'}">
                        <div style="padding:10px 1.25rem;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:8px">
                            <span style="color:#f5a623;font-size:0.9rem">🔧</span>
                            <span style="font-size:0.85rem;font-weight:700;color:var(--text-secondary)">Manual HD Wallet Settings</span>
                            <span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px">${isManual ? 'Active — configure your infrastructure below' : 'Not needed for your current provider'}</span>
                        </div>
                        <div style="padding:1.25rem;display:grid;gap:1.5rem">

                            <!-- RPCs -->
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:1.5rem">
                                <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:10px;padding:1.25rem;display:flex;flex-direction:column;gap:1rem">
                                    <h4 style="margin:0;font-size:0.95rem;color:var(--text-primary);display:flex;align-items:center;gap:6px">
                                        <span style="color:#f5a623">🔗</span> Infrastructure Nodes
                                    </h4>
                                    <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.02);border-radius:8px;padding:1rem">
                                        <div style="font-weight:600;color:var(--text-secondary);margin-bottom:8px;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px">Solana RPCs</div>
                                        <div style="margin-bottom:10px">
                                            <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Primary Node URL</label>
                                            <input id="cfg-sol-rpc-primary" class="input-field" style="width:100%;font-family:monospace;font-size:0.82rem" value="${App.escapeHtml(cfg.solana_rpc_primary || '')}" placeholder="https://api.mainnet-beta.solana.com">
                                        </div>
                                        <div>
                                            <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Fallback Node URL (Optional)</label>
                                            <input id="cfg-sol-rpc-secondary" class="input-field" style="width:100%;font-family:monospace;font-size:0.82rem" value="${App.escapeHtml(cfg.solana_rpc_secondary || '')}" placeholder="Optional fallback RPC">
                                        </div>
                                    </div>
                                    <div style="background:rgba(0,0,0,0.15);border:1px solid rgba(255,255,255,0.02);border-radius:8px;padding:1rem">
                                        <div style="font-weight:600;color:var(--text-secondary);margin-bottom:8px;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px">Litecoin RPCs</div>
                                        <div style="margin-bottom:10px">
                                            <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Primary Node URL</label>
                                            <input id="cfg-ltc-rpc-primary" class="input-field" style="width:100%;font-family:monospace;font-size:0.82rem" value="${App.escapeHtml(cfg.litecoin_rpc_primary || '')}" placeholder="https://api.blockcypher.com/v1/ltc/main">
                                        </div>
                                        <div>
                                            <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Fallback Node URL (Optional)</label>
                                            <input id="cfg-ltc-rpc-secondary" class="input-field" style="width:100%;font-family:monospace;font-size:0.82rem" value="${App.escapeHtml(cfg.litecoin_rpc_secondary || '')}" placeholder="Optional fallback RPC">
                                        </div>
                                    </div>
                                </div>

                                <!-- Webhook Secrets + HD Wallet -->
                                <div style="display:flex;flex-direction:column;gap:1.25rem">
                                    <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:10px;padding:1.25rem">
                                        <h4 style="margin:0 0 1rem 0;font-size:0.95rem;color:var(--text-primary);display:flex;align-items:center;gap:6px">
                                            <span style="color:var(--neon-green)">🔔</span> Webhook Secrets
                                        </h4>
                                        <div style="display:flex;flex-direction:column;gap:1rem">
                                            <div>
                                                <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Solana Webhook Secret (Helius)</label>
                                                <div style="position:relative">
                                                    <input id="cfg-sol-webhook" type="password" class="input-field" placeholder="${cfg.solana_webhook_secret_set ? '••••••••••••••••' : 'Not configured'}" style="width:100%;font-family:monospace;padding-right:45px">
                                                    ${cfg.solana_webhook_secret_set ? '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--neon-green);font-size:0.75rem;background:rgba(74,222,128,0.1);padding:2px 6px;border-radius:4px">✓ Set</span>' : ''}
                                                </div>
                                            </div>
                                            <div>
                                                <label style="font-size:0.72rem;color:var(--text-muted);display:block;margin-bottom:4px">Litecoin Webhook Secret (BlockCypher)</label>
                                                <div style="position:relative">
                                                    <input id="cfg-ltc-webhook" type="password" class="input-field" placeholder="${cfg.litecoin_webhook_secret_set ? '••••••••••••••••' : 'Not configured'}" style="width:100%;font-family:monospace;padding-right:45px">
                                                    ${cfg.litecoin_webhook_secret_set ? '<span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--neon-green);font-size:0.75rem;background:rgba(74,222,128,0.1);padding:2px 6px;border-radius:4px">✓ Set</span>' : ''}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style="background:var(--bg-card);backdrop-filter:blur(10px);border:1px solid var(--border-subtle);border-radius:10px;padding:1.25rem;flex-grow:1">
                                        <h4 style="margin:0 0 1rem 0;font-size:0.95rem;color:var(--text-primary);display:flex;align-items:center;gap:6px">
                                            <span style="color:var(--neon-magenta)">🔐</span> HD Wallet Seeds
                                        </h4>
                                        ${isSuperadmin ? `
                                        <div style="display:grid;gap:10px">
                                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.15);padding:10px 14px;border-radius:6px;border-left:3px solid ${cfg.solana_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'}">
                                                <div>
                                                    <div style="font-size:0.82rem;color:var(--text-secondary)">Solana Seed</div>
                                                    ${cfg.solana_seed_masked ? `<code style="font-size:0.7rem;color:var(--text-muted)">${App.escapeHtml(cfg.solana_seed_masked)}</code>` : ''}
                                                </div>
                                                <span style="color:${cfg.solana_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'};font-size:0.75rem;font-weight:600;padding:2px 8px;background:${cfg.solana_seed_configured ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)'};border-radius:4px">
                                                    ${cfg.solana_seed_configured ? '✓ Secured' : '⚠ Missing'}
                                                </span>
                                            </div>
                                            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.15);padding:10px 14px;border-radius:6px;border-left:3px solid ${cfg.litecoin_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'}">
                                                <div>
                                                    <div style="font-size:0.82rem;color:var(--text-secondary)">Litecoin Seed</div>
                                                    ${cfg.litecoin_seed_masked ? `<code style="font-size:0.7rem;color:var(--text-muted)">${App.escapeHtml(cfg.litecoin_seed_masked)}</code>` : ''}
                                                </div>
                                                <span style="color:${cfg.litecoin_seed_configured ? 'var(--neon-green)' : 'var(--neon-magenta)'};font-size:0.75rem;font-weight:600;padding:2px 8px;background:${cfg.litecoin_seed_configured ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)'};border-radius:4px">
                                                    ${cfg.litecoin_seed_configured ? '✓ Secured' : '⚠ Missing'}
                                                </span>
                                            </div>
                                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
                                                <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3);padding:8px" onclick="DonationsAdminPage.showWalletSetupModal()">🔑 Set Seeds</button>
                                                <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3);padding:8px" onclick="DonationsAdminPage.generateNewSeed()">✨ Autogenerate</button>
                                                <button class="mc-btn" style="grid-column:1/span 2;background:rgba(239,68,68,0.05);color:#ef4444;border-color:rgba(239,68,68,0.2);padding:8px" onclick="DonationsAdminPage.revealSeed()">👁 Reveal Seeds</button>
                                            </div>
                                        </div>` : `
                                        <div style="display:flex;align-items:center;justify-content:center;padding:1.5rem;background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.3);border-radius:8px">
                                            <div style="text-align:center;color:var(--text-muted)">
                                                <div style="font-size:2rem;margin-bottom:8px">🔒</div>
                                                <div style="font-size:0.82rem">Wallet seed configuration is restricted to superadmins.</div>
                                            </div>
                                        </div>`}
                                    </div>
                                </div>
                            </div>

                            <!-- Save chain config -->
                            <div style="background:linear-gradient(90deg,rgba(41,182,246,0.08),rgba(171,71,188,0.08));border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:0.9rem 1.25rem;display:flex;justify-content:space-between;align-items:center">
                                <span style="color:var(--text-secondary);font-size:0.82rem">Save coin toggles, RPC endpoints, and webhook secrets.</span>
                                <button class="mc-btn" style="background:var(--neon-cyan);color:#000;border:none;padding:9px 20px;font-weight:700;box-shadow:0 0 12px rgba(41,182,246,0.35)" onclick="DonationsAdminPage.saveCryptoConfig()">
                                    💾 Save Chain Config
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- ── Provider Dashboard ── -->
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <h2 style="margin:0;font-size:1.05rem;font-weight:700">Provider Dashboard</h2>
                                <p style="color:var(--text-muted);margin:4px 0 0;font-size:0.8rem">Recent payments from the active provider.</p>
                            </div>
                            <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem;background:rgba(255,255,255,0.04)"
                                onclick="DonationsAdminPage._loadProviderDashboard()">↻ Refresh</button>
                        </div>
                        <div id="pp-dashboard" style="padding:1rem 1.25rem">
                            <div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem">Loading dashboard…</div>
                        </div>
                    </div>

                </div>`;

            this._loadProviderDashboard();
            this._loadCoinsGrid(active_provider, cfg.enabled_coins || ['sol', 'ltc']);
        } catch (err) {
            area.innerHTML = '<p style="color:var(--neon-magenta)">Failed to load crypto settings.</p>';
        }
    },

    async _toggleCryptoMasterSwitch(enable) {
        const btn = document.getElementById('crypto-master-toggle');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            await API.put('/api/ext/donations/admin/crypto/config', { payments_enabled: enable });
            App.showToast(enable ? 'Crypto payments enabled' : 'Crypto payments disabled', enable ? 'success' : 'info');
            this.loadTab('crypto');
        } catch {
            App.showToast('Failed to update setting', 'error');
            if (btn) { btn.disabled = false; btn.textContent = enable ? '✅ Enable' : '⛔ Disable'; }
        }
    },

    async saveCryptoConfig() {
        try {
            const enabledCoins = [...document.querySelectorAll('.coin-toggle:checked')].map(el => el.value);
            const body = {
                enabled_coins: enabledCoins,
                solana_rpc_primary:    document.getElementById('cfg-sol-rpc-primary')?.value,
                solana_rpc_secondary:  document.getElementById('cfg-sol-rpc-secondary')?.value,
                litecoin_rpc_primary:  document.getElementById('cfg-ltc-rpc-primary')?.value,
                litecoin_rpc_secondary: document.getElementById('cfg-ltc-rpc-secondary')?.value,
            };
            // Propagate sol/ltc enabled flags from the enabled_coins array for backward-compat
            body.solana_enabled  = enabledCoins.includes('sol');
            body.litecoin_enabled = enabledCoins.includes('ltc');

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
                    <textarea id="ws-sol-seed" class="input-field" rows="3" placeholder="word1 word2 word3 ..." style="width:100%;resize:vertical;font-family:monospace"></textarea>
                </div>
                <div>
                    <label class="donate-admin-label">Litecoin Seed Phrase (leave blank to keep existing, or use same seed)</label>
                    <textarea id="ws-ltc-seed" class="input-field" rows="3" placeholder="word1 word2 word3 ..." style="width:100%;resize:vertical;font-family:monospace"></textarea>
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

    // Temporary stores for generated/revealed mnemonics — never persisted to DOM
    _pendingMnemonic: null,
    _revealedSeeds: null,

    async generateNewSeed() {
        if (!confirm('Generate a new random seed phrase? This will replace the existing seed and re-derive all addresses. Make sure to back it up!')) return;
        try {
            const data = await API.post('/api/ext/donations/admin/crypto/generate-seed', {});
            // Store in module variable — never injected into onclick attributes
            this._pendingMnemonic = data.mnemonic;
            App.showModal('New Seed Generated', `
                <div style="display:grid;gap:var(--space-md)">
                    <p style="color:var(--neon-magenta);font-size:0.85rem;font-weight:700">⚠️ Write this down and store it safely. It will not be shown again unless you use Reveal Seed.</p>
                    <div id="wallet-seed-display" style="background:#0d1117;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:16px;font-family:monospace;font-size:0.85rem;color:var(--neon-cyan);word-break:break-all;line-height:1.8;user-select:all">
                        ${App.escapeHtml(data.mnemonic)}
                    </div>
                    <p style="color:var(--text-muted);font-size:0.75rem">${data.word_count} words · BIP39</p>
                    <div style="display:flex;gap:var(--space-md)">
                        <button class="mc-btn" style="flex:1;background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)"
                            onclick="DonationsAdminPage._copyPendingSeed()">
                            Copy to Clipboard
                        </button>
                        <button class="mc-btn" style="flex:1;background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                            onclick="DonationsAdminPage._applyPendingSeed()">
                            Apply as Both Seeds
                        </button>
                    </div>
                </div>
            `);
        } catch (err) {
            App.showToast('Failed to generate seed: ' + (err.message || 'Unknown error'), 'error');
        }
    },

    _copyPendingSeed() {
        if (!this._pendingMnemonic) return;
        navigator.clipboard.writeText(this._pendingMnemonic)
            .then(() => App.showToast('Seed phrase copied to clipboard', 'success'))
            .catch(() => App.showToast('Copy failed — select the text manually', 'warning'));
    },

    _copyRevealedSeed(coin) {
        const mnemonic = coin === 'ltc'
            ? this._revealedSeeds?.litecoin_mnemonic
            : this._revealedSeeds?.solana_mnemonic;
        if (!mnemonic) return;
        navigator.clipboard.writeText(mnemonic)
            .then(() => App.showToast('Seed phrase copied to clipboard', 'success'))
            .catch(() => App.showToast('Copy failed — select the text manually', 'warning'));
    },

    async _applyPendingSeed() {
        if (!this._pendingMnemonic) { App.showToast('No pending seed to apply', 'error'); return; }
        try {
            await API.put('/api/ext/donations/admin/crypto/wallet', {
                solana_mnemonic: this._pendingMnemonic,
                litecoin_mnemonic: this._pendingMnemonic,
            });
            this._pendingMnemonic = null;
            App.showToast('Seed applied and encrypted!', 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to apply seed', 'error');
        }
    },

    async revealSeed() {
        if (!confirm('Reveal stored seed phrases? This is sensitive — your full mnemonic will be displayed on screen. Only do this in a secure, private environment.')) return;
        try {
            const data = await API.get('/api/ext/donations/admin/crypto/wallet/reveal');
            this._revealedSeeds = data;
            this._pendingMnemonic = data.solana_mnemonic || data.litecoin_mnemonic || null;

            const sameSeed = data.solana_mnemonic && data.litecoin_mnemonic && data.solana_mnemonic === data.litecoin_mnemonic;

            const buildSection = (label, mnemonic, copyKey) => mnemonic ? `
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${label}</span>
                        ${copyKey ? `<button class="mc-btn" style="padding:2px 10px;font-size:0.72rem;background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)" onclick="DonationsAdminPage._copyRevealedSeed(${JSON.stringify(copyKey)})">Copy</button>` : ''}
                    </div>
                    <div style="background:#0d1117;border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:14px;font-family:monospace;font-size:0.82rem;color:var(--neon-cyan);word-break:break-all;line-height:1.8;user-select:all">${App.escapeHtml(mnemonic)}</div>
                </div>` : '';

            App.showModal('Seed Phrase Recovery', `
                <div style="display:grid;gap:var(--space-md)">
                    <p style="color:var(--neon-magenta);font-size:0.85rem;font-weight:700;margin:0">⚠️ Keep this private. Close immediately after use. This access is logged.</p>
                    ${sameSeed
                        ? buildSection('Solana + Litecoin (shared seed)', data.solana_mnemonic, 'sol')
                        : buildSection('Solana Seed', data.solana_mnemonic, 'sol') + buildSection('Litecoin Seed', data.litecoin_mnemonic, 'ltc')
                    }
                    <div style="text-align:right">
                        <button class="mc-btn" style="background:rgba(255,255,255,0.05);color:var(--text-muted);border-color:var(--border-subtle)"
                            onclick="App.closeModal()">
                            Close
                        </button>
                    </div>
                </div>
            `);
        } catch (err) {
            App.showToast(err.message || 'Failed to retrieve seed phrase', 'error');
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
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <input class="input-field" placeholder="Search username..." value="${App.escapeHtml(search)}"
                            oninput="DonationsAdminPage._balanceSearch=this.value;clearTimeout(DonationsAdminPage._bsTimer);DonationsAdminPage._bsTimer=setTimeout(()=>DonationsAdminPage.loadTab(),400)"
                            style="max-width:200px">
                        <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3);white-space:nowrap"
                            onclick="DonationsAdminPage.showCreditUserModal()">+ Credit User</button>
                    </div>
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

    showCreditUserModal() {
        App.showModal('Credit / Debit User Balance', `
            <div style="display:grid;gap:14px">
                <p style="color:var(--text-muted);font-size:0.82rem;margin:0">
                    Credit or debit any registered user — even if they have no existing balance.
                    Positive = add funds, negative = remove funds.
                </p>
                <div>
                    <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Username / Display Name</label>
                    <input id="cu-username" class="input-field" placeholder="Registered username" style="width:100%"
                        oninput="DonationsAdminPage._cuLookupDebounce()">
                    <div id="cu-user-preview" style="margin-top:6px;min-height:18px;font-size:0.75rem;color:var(--text-muted)"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Amount (USD)</label>
                        <input id="cu-amount" type="number" step="0.01" class="input-field" placeholder="e.g. 10.00 or -5.00" style="width:100%">
                    </div>
                    <div>
                        <label style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Reason (required)</label>
                        <input id="cu-reason" class="input-field" placeholder="e.g. Guest donation transfer" style="width:100%">
                    </div>
                </div>
                <div style="text-align:right">
                    <button class="mc-btn" style="background:rgba(102,187,106,0.1);color:var(--neon-green);border-color:rgba(102,187,106,0.3)"
                        onclick="DonationsAdminPage.submitCreditUser()">Apply</button>
                </div>
            </div>
        `);
    },

    // Debounced live preview: shows current balance while admin types username
    _cuLookupDebounce() {
        clearTimeout(this._cuTimer);
        this._cuTimer = setTimeout(async () => {
            const username = document.getElementById('cu-username')?.value.trim();
            const preview  = document.getElementById('cu-user-preview');
            if (!preview) return;
            if (!username) { preview.textContent = ''; return; }
            preview.textContent = 'Looking up…';
            try {
                // Re-use the search endpoint to find the user
                const results = await API.get(`/api/users/search?q=${encodeURIComponent(username)}&limit=5`);
                const match = results?.find(u =>
                    u.username?.toLowerCase() === username.toLowerCase() ||
                    u.display_name?.toLowerCase() === username.toLowerCase()
                ) || results?.[0];
                if (!match) { preview.textContent = '⚠ No matching user found'; preview.style.color = '#f59e0b'; return; }
                // Fetch current balance
                const bal = await API.get(`/api/ext/donations/admin/balances/${match.id}/ledger`).catch(() => null);
                const currentBal = Array.isArray(bal)
                    ? bal.reduce((s, t) => s + (t.type === 'credit' ? t.amount_usd : -t.amount_usd), 0)
                    : null;
                preview.innerHTML = `<span style="color:var(--neon-green)">✓ Found: ${App.escapeHtml(match.display_name || match.username)}</span>`
                    + (currentBal !== null ? ` &nbsp;·&nbsp; Current balance: <strong>$${currentBal.toFixed(2)}</strong>` : '');
                preview.style.color = '';
            } catch { preview.textContent = ''; }
        }, 400);
    },

    async submitCreditUser() {
        const username = document.getElementById('cu-username')?.value.trim();
        const amount   = parseFloat(document.getElementById('cu-amount')?.value);
        const reason   = document.getElementById('cu-reason')?.value.trim();
        if (!username) { App.showToast('Username required', 'warning'); return; }
        if (isNaN(amount) || amount === 0) { App.showToast('Enter a non-zero amount', 'warning'); return; }
        if (!reason) { App.showToast('Reason is required', 'warning'); return; }
        try {
            const result = await API.post('/api/ext/donations/admin/balances/adjust-by-username', { username, amount, reason });
            App.showToast(`Balance updated for ${result.display_name}. New balance: $${result.new_balance.toFixed(2)}`, 'success');
            App.closeModal();
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to apply adjustment', 'error');
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
                    <input id="adj-amount" type="number" step="0.01" class="input-field" placeholder="e.g. 10.00 or -5.00" style="width:100%">
                </div>
                <div>
                    <label class="donate-admin-label">Reason (required)</label>
                    <input id="adj-reason" class="input-field" placeholder="e.g. Refund for failed payment" style="width:100%">
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
    },

    // ── WALLET VIEWER (superadmin only) ──

    async renderWallet(area) {
        if (App.currentUser?.role !== 'superadmin') {
            area.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:center;min-height:200px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px">
                    <div style="text-align:center;color:var(--text-muted)">
                        <div style="font-size:2.5rem;margin-bottom:8px">🔒</div>
                        <div style="font-weight:600">Wallet viewer is restricted to superadmins.</div>
                    </div>
                </div>`;
            return;
        }
        try {
            const { user_addresses, admin_addresses } = await API.get('/api/ext/donations/admin/crypto/wallet/addresses');
            const totalAddresses = user_addresses.length + admin_addresses.length;

            // Detect a malformed address (object accidentally stringified by earlier bug)
            const isMalformedAddr = v => !v || v.startsWith('{') || v === '[object Object]';

            const addrRow = (row, type) => {
                const idx = row.derivation_index;
                const userInfo = type === 'user'
                    ? `<a href="#/profile/${row.user_id}" style="color:var(--neon-cyan);text-decoration:none;font-size:0.8rem">@${App.escapeHtml(row.username || row.user_id?.slice(0,8) || '—')}</a>`
                    : `<span style="color:var(--text-muted);font-size:0.8rem;font-style:italic">${App.escapeHtml(row.label || '—')}</span>`;

                const solAddr = row.sol_address && !isMalformedAddr(row.sol_address) ? row.sol_address : null;
                const ltcAddr = row.ltc_address && !isMalformedAddr(row.ltc_address) ? row.ltc_address : null;

                const solCell = solAddr
                    ? `<div style="display:flex;align-items:center;gap:6px">
                           <code style="font-size:0.72rem;color:var(--neon-cyan);cursor:pointer" title="${App.escapeHtml(solAddr)}"
                               onclick="navigator.clipboard.writeText('${App.escapeHtml(solAddr)}').then(()=>App.showToast('Copied!','success'))"
                           >${solAddr.slice(0,6)}…${solAddr.slice(-4)}</code>
                       </div>`
                    : (row.sol_address ? '<span style="color:#ef4444;font-size:0.7rem" title="Malformed — regenerate this address">⚠ invalid</span>' : '<span style="color:var(--text-muted);font-size:0.75rem">—</span>');

                const ltcCell = ltcAddr
                    ? `<div style="display:flex;align-items:center;gap:6px">
                           <code style="font-size:0.72rem;color:var(--neon-magenta);cursor:pointer" title="${App.escapeHtml(ltcAddr)}"
                               onclick="navigator.clipboard.writeText('${App.escapeHtml(ltcAddr)}').then(()=>App.showToast('Copied!','success'))"
                           >${ltcAddr.slice(0,6)}…${ltcAddr.slice(-4)}</code>
                       </div>`
                    : (row.ltc_address ? '<span style="color:#ef4444;font-size:0.7rem" title="Malformed — regenerate this address">⚠ invalid</span>' : '<span style="color:var(--text-muted);font-size:0.75rem">—</span>');

                const txBtns = [
                    solAddr ? `<button class="mc-btn" style="padding:3px 8px;font-size:0.72rem;background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                        onclick="DonationsAdminPage.showWalletTxModal('sol','${App.escapeHtml(solAddr)}')">SOL Txs</button>` : '',
                    ltcAddr ? `<button class="mc-btn" style="padding:3px 8px;font-size:0.72rem;background:rgba(171,71,188,0.1);color:var(--neon-magenta);border-color:rgba(171,71,188,0.3)"
                        onclick="DonationsAdminPage.showWalletTxModal('ltc','${App.escapeHtml(ltcAddr)}')">LTC Txs</button>` : '',
                ].filter(Boolean).join('');

                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.04);transition:background 0.15s" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background=''">
                    <td style="padding:10px 12px;font-size:0.8rem;color:var(--text-muted);font-family:monospace">#${idx}</td>
                    <td style="padding:10px 12px">${userInfo}</td>
                    <td style="padding:10px 12px">${solCell}</td>
                    <td style="padding:10px 12px;font-size:0.78rem;color:var(--neon-green)" id="wb-sol-${idx}">
                        ${row.sol_address ? '<span style="color:var(--text-muted)">—</span>' : '<span style="color:var(--text-muted)">n/a</span>'}
                    </td>
                    <td style="padding:10px 12px">${ltcCell}</td>
                    <td style="padding:10px 12px;font-size:0.78rem;color:var(--neon-green)" id="wb-ltc-${idx}">
                        ${row.ltc_address ? '<span style="color:var(--text-muted)">—</span>' : '<span style="color:var(--text-muted)">n/a</span>'}
                    </td>
                    <td style="padding:10px 12px"><div style="display:flex;gap:6px;flex-wrap:wrap">${txBtns}</div></td>
                </tr>`;
            };

            const tableHeader = `
                <thead>
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">Index</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">User / Label</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--neon-cyan)">SOL Address</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--neon-cyan)">SOL Balance</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--neon-magenta)">LTC Address</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--neon-magenta)">LTC Balance</th>
                        <th style="padding:10px 12px;text-align:left;font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted)">Transactions</th>
                    </tr>
                </thead>`;

            area.innerHTML = `
                <div style="display:grid;gap:1.5rem">

                    <!-- Header bar -->
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <h2 style="margin:0;font-size:1.4rem;background:linear-gradient(135deg,#29b6f6,#ab47bc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:800">HD Wallet Explorer</h2>
                            <p style="color:var(--text-muted);margin:4px 0 0;font-size:0.85rem">${totalAddresses} address${totalAddresses !== 1 ? 'es' : ''} derived · Balances load on demand</p>
                        </div>
                        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                            <button class="mc-btn" id="wb-load-balances" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                                onclick="DonationsAdminPage._loadAllWalletBalances()">⚡ Load Balances</button>
                            <button class="mc-btn" style="background:rgba(74,222,128,0.08);color:var(--neon-green);border-color:rgba(74,222,128,0.3)"
                                onclick="DonationsAdminPage.showVerifyReport()">🔍 Verify Derivations</button>
                            <button class="mc-btn" style="background:rgba(234,179,8,0.08);color:#eab308;border-color:rgba(234,179,8,0.3)"
                                onclick="DonationsAdminPage.cleanMalformedAddresses()">🧹 Clean Malformed</button>
                            <button class="mc-btn" style="background:rgba(171,71,188,0.1);color:var(--neon-magenta);border-color:rgba(171,71,188,0.3)"
                                onclick="DonationsAdminPage.deriveWalletAddress()">+ Generate Address</button>
                        </div>
                    </div>

                    <!-- User addresses -->
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
                            <span style="color:var(--neon-cyan);font-size:1.1rem">👤</span>
                            <span style="font-weight:700;font-size:0.95rem">User Wallet Addresses</span>
                            <span style="background:rgba(41,182,246,0.15);color:var(--neon-cyan);border-radius:20px;padding:2px 10px;font-size:0.72rem;font-weight:600;margin-left:4px">${user_addresses.length}</span>
                        </div>
                        ${user_addresses.length ? `
                        <div style="overflow-x:auto">
                            <table style="width:100%;border-collapse:collapse">
                                ${tableHeader}
                                <tbody>${user_addresses.map(r => addrRow(r, 'user')).join('')}</tbody>
                            </table>
                        </div>` : `
                        <div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem">
                            No user addresses derived yet. Users get addresses when they first visit the Donate page with crypto enabled.
                        </div>`}
                    </div>

                    <!-- Admin addresses -->
                    <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                        <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px">
                            <span style="color:var(--neon-magenta);font-size:1.1rem">🔑</span>
                            <span style="font-weight:700;font-size:0.95rem">Admin Wallet Addresses</span>
                            <span style="background:rgba(171,71,188,0.15);color:var(--neon-magenta);border-radius:20px;padding:2px 10px;font-size:0.72rem;font-weight:600;margin-left:4px">${admin_addresses.length}</span>
                            <span style="color:var(--text-muted);font-size:0.72rem;margin-left:auto">Indices ≥ 20000 · standalone HD derivations</span>
                        </div>
                        ${admin_addresses.length ? `
                        <div style="overflow-x:auto">
                            <table style="width:100%;border-collapse:collapse">
                                ${tableHeader}
                                <tbody>${admin_addresses.map(r => addrRow(r, 'admin')).join('')}</tbody>
                            </table>
                        </div>` : `
                        <div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.85rem">
                            No admin addresses generated yet. Use <strong>+ Generate Address</strong> to derive one from the HD wallet seed.
                        </div>`}
                    </div>

                </div>`;

            // Store addresses for balance loading
            this._walletAddresses = { user_addresses, admin_addresses };
        } catch (err) {
            area.innerHTML = `<div style="padding:2rem;color:var(--neon-magenta);text-align:center">${App.escapeHtml(err.message || 'Failed to load wallet')}</div>`;
        }
    },

    /** Fetch and render live balances for all addresses in the wallet tab. */
    async _loadAllWalletBalances() {
        const btn = document.getElementById('wb-load-balances');
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }

        const { user_addresses = [], admin_addresses = [] } = this._walletAddresses || {};
        const all = [...user_addresses, ...admin_addresses];
        if (!all.length) {
            if (btn) { btn.disabled = false; btn.textContent = '⚡ Load Balances'; }
            return;
        }

        // Set all balance cells to "fetching…"
        all.forEach(r => {
            if (r.sol_address) {
                const el = document.getElementById(`wb-sol-${r.derivation_index}`);
                if (el) el.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem">fetching…</span>';
            }
            if (r.ltc_address) {
                const el = document.getElementById(`wb-ltc-${r.derivation_index}`);
                if (el) el.innerHTML = '<span style="color:var(--text-muted);font-size:0.72rem">fetching…</span>';
            }
        });

        // Fetch all balances in parallel, update cells as each resolves
        const fetchBalance = async (coin, address, idx) => {
            const elId = `wb-${coin}-${idx}`;
            try {
                const data = await API.get(`/api/ext/donations/admin/crypto/wallet/address/${coin}/${address}/balance`);
                const el = document.getElementById(elId);
                if (el) {
                    const val = data.balance.toFixed(6).replace(/\.?0+$/, '') || '0';
                    el.innerHTML = `<span style="font-family:monospace;color:var(--neon-green)">${val} ${coin.toUpperCase()}</span>`;
                }
            } catch (err) {
                const el = document.getElementById(elId);
                if (el) el.innerHTML = `<span style="color:#ef4444;font-size:0.72rem" title="${App.escapeHtml(err.message || '')}">error</span>`;
            }
        };

        await Promise.allSettled(
            all.flatMap(r => [
                r.sol_address ? fetchBalance('sol', r.sol_address, r.derivation_index) : null,
                r.ltc_address ? fetchBalance('ltc', r.ltc_address, r.derivation_index) : null,
            ].filter(Boolean))
        );

        if (btn) { btn.disabled = false; btn.textContent = '⚡ Refresh Balances'; }
    },

    /** Derive a new admin wallet address and refresh the tab. */
    async deriveWalletAddress() {
        const label = prompt('Optional label for this address (leave blank to skip):') ?? null;
        if (label === null) return; // user cancelled
        try {
            const data = await API.post('/api/ext/donations/admin/crypto/wallet/derive', { label: label.trim() });
            App.showToast(`Address #${data.derivation_index} generated`, 'success');
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Failed to generate address', 'error');
        }
    },

    /** Show a modal with recent on-chain transactions for the given address. */
    async showWalletTxModal(coin, address) {
        const coinLabel = coin === 'sol' ? 'Solana' : 'Litecoin';
        const coinColor = coin === 'sol' ? 'var(--neon-cyan)' : 'var(--neon-magenta)';

        App.showModal(`${coinLabel} Transactions`, `
            <div style="display:grid;gap:var(--space-md)">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <code style="font-size:0.78rem;color:${coinColor};background:rgba(0,0,0,0.3);padding:4px 10px;border-radius:6px;word-break:break-all">${App.escapeHtml(address)}</code>
                    <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem" onclick="navigator.clipboard.writeText('${App.escapeHtml(address)}').then(()=>App.showToast('Copied','success'))">Copy</button>
                </div>
                <div id="wallet-tx-list" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Loading transactions…</div>
            </div>
        `);

        try {
            const data = await API.get(`/api/ext/donations/admin/crypto/wallet/address/${coin}/${address}/transactions`);
            const txs = data.transactions || [];
            const el = document.getElementById('wallet-tx-list');
            if (!el) return;

            if (!txs.length) {
                el.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem">No transactions found for this address.</span>';
                return;
            }

            const statusBadge = s => {
                const cfg = {
                    confirmed: ['var(--neon-green)', 'rgba(74,222,128,0.1)'],
                    finalized: ['var(--neon-green)', 'rgba(74,222,128,0.1)'],
                    pending:   ['#eab308', 'rgba(234,179,8,0.1)'],
                    failed:    ['#ef4444', 'rgba(239,68,68,0.1)'],
                };
                const [color, bg] = cfg[s] || ['var(--text-muted)', 'rgba(255,255,255,0.05)'];
                return `<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:${bg};color:${color};font-weight:600">${s}</span>`;
            };

            el.style.textAlign = '';
            el.style.padding = '0';
            el.innerHTML = `
                <div style="overflow-x:auto;max-height:420px;overflow-y:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                        <thead>
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.08);position:sticky;top:0;background:var(--bg-card)">
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Tx Hash</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Status</th>
                                ${coin === 'ltc' ? '<th style="padding:8px 10px;text-align:right;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Amount (LTC)</th>' : ''}
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Confirmations</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${txs.map(tx => {
                                const shortHash = tx.hash ? tx.hash.slice(0, 8) + '…' + tx.hash.slice(-6) : '—';
                                const time = tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Unknown';
                                const amountCell = coin === 'ltc'
                                    ? `<td style="padding:8px 10px;text-align:right;font-family:monospace;color:${tx.amount > 0 ? 'var(--neon-green)' : tx.amount < 0 ? '#ef4444' : 'var(--text-muted)'}">${tx.amount > 0 ? '+' : ''}${tx.amount}</td>`
                                    : '';
                                return `<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">
                                    <td style="padding:8px 10px">
                                        ${tx.explorer_url
                                            ? `<a href="${App.escapeHtml(tx.explorer_url)}" target="_blank" rel="noopener" style="color:${coinColor};font-family:monospace;font-size:0.75rem;text-decoration:none" title="${App.escapeHtml(tx.hash)}">${shortHash} ↗</a>`
                                            : `<code style="font-size:0.75rem;color:${coinColor}">${shortHash}</code>`}
                                    </td>
                                    <td style="padding:8px 10px">${statusBadge(tx.status)}</td>
                                    ${amountCell}
                                    <td style="padding:8px 10px;color:var(--text-secondary)">${tx.confirmations}</td>
                                    <td style="padding:8px 10px;color:var(--text-muted);font-size:0.75rem">${time}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        } catch (err) {
            const el = document.getElementById('wallet-tx-list');
            if (el) el.innerHTML = `<span style="color:#ef4444">${App.escapeHtml(err.message || 'Failed to load transactions')}</span>`;
        }
    },

    /** Verify that all stored addresses match their HD derivation index. */
    async showVerifyReport() {
        App.showModal('Derivation Verification', `
            <div style="display:grid;gap:var(--space-md)">
                <p style="color:var(--text-muted);font-size:0.85rem;margin:0">
                    Re-derives every stored address from the seed at its recorded derivation index and compares the result. A ✓ match means you hold the keys to that address.
                </p>
                <div id="verify-report-body" style="text-align:center;padding:1.5rem;color:var(--text-muted)">Running verification…</div>
            </div>
        `);

        try {
            const data = await API.get('/api/ext/donations/admin/crypto/wallet/verify');
            const el = document.getElementById('verify-report-body');
            if (!el) return;

            const all = [
                ...(data.user_addresses || []).map(r => ({ ...r, _type: 'User' })),
                ...(data.admin_addresses || []).map(r => ({ ...r, _type: 'Admin' })),
            ];

            if (!all.length) {
                el.innerHTML = '<span style="color:var(--text-muted)">No addresses to verify.</span>';
                return;
            }

            const matchCell = (obj) => {
                if (!obj) return '<td style="padding:6px 10px;color:var(--text-muted)">—</td>';
                const ok = obj.match;
                const icon = ok ? '✓' : '✗';
                const color = ok ? 'var(--neon-green)' : '#ef4444';
                const title = ok ? `Stored: ${obj.stored}` : `Stored: ${obj.stored} | Expected: ${obj.expected}`;
                return `<td style="padding:6px 10px;color:${color};font-family:monospace;font-size:0.75rem" title="${App.escapeHtml(title)}">${icon} ${ok ? 'match' : 'MISMATCH'}</td>`;
            };

            const allOk = all.every(r => (!r.sol || r.sol.match) && (!r.ltc || r.ltc.match));
            const summaryColor = allOk ? 'var(--neon-green)' : '#ef4444';
            const summaryText = allOk ? `All ${all.length} address${all.length !== 1 ? 'es' : ''} verified ✓` : 'One or more mismatches detected!';

            el.style.textAlign = '';
            el.style.padding = '0';
            el.innerHTML = `
                <div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:${allOk ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)'};border:1px solid ${summaryColor};color:${summaryColor};font-weight:600;font-size:0.85rem">${summaryText}</div>
                <div style="overflow-x:auto;max-height:440px;overflow-y:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                        <thead>
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.08);position:sticky;top:0;background:var(--bg-card)">
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Type</th>
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Index</th>
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">SOL</th>
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">LTC</th>
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Stored SOL</th>
                                <th style="padding:6px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Stored LTC</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${all.map(r => `
                                <tr style="border-bottom:1px solid rgba(255,255,255,0.03)">
                                    <td style="padding:6px 10px;color:var(--text-muted);font-size:0.72rem">${r._type}</td>
                                    <td style="padding:6px 10px;font-family:monospace;color:var(--neon-cyan)">#${r.derivation_index}</td>
                                    ${matchCell(r.sol)}
                                    ${matchCell(r.ltc)}
                                    <td style="padding:6px 10px;font-family:monospace;font-size:0.68rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.sol?.stored || '—')}">${App.escapeHtml(r.sol?.stored?.slice(0, 20) + (r.sol?.stored?.length > 20 ? '…' : '') || '—')}</td>
                                    <td style="padding:6px 10px;font-family:monospace;font-size:0.68rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.ltc?.stored || '—')}">${App.escapeHtml(r.ltc?.stored?.slice(0, 20) + (r.ltc?.stored?.length > 20 ? '…' : '') || '—')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
        } catch (err) {
            const el = document.getElementById('verify-report-body');
            if (el) el.innerHTML = `<span style="color:#ef4444">${App.escapeHtml(err.message || 'Verification failed')}</span>`;
        }
    },

    /** Delete admin_wallet_addresses rows where the LTC address is a stringified object. */
    async cleanMalformedAddresses() {
        const confirmed = confirm('This will permanently delete admin wallet address rows where the LTC address was stored as a raw object (e.g. {"address":"..."}). These rows are unusable. Continue?');
        if (!confirmed) return;
        try {
            const data = await API.delete('/api/ext/donations/admin/crypto/wallet/admin-addresses/malformed');
            App.showToast(data.message || `Deleted ${data.deleted} malformed row(s)`, data.deleted > 0 ? 'success' : 'info');
            if (data.deleted > 0) this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Cleanup failed', 'error');
        }
    },

    // ── PAYMENT PROVIDERS (merged into renderCryptoSettings) ──

    _providerSelection: null, // tracks which card is selected before save

    async renderPaymentProviders(area) {
        // Redirected to the unified Crypto tab
        return this.renderCryptoSettings(area);
    },

    async _renderPaymentProviders_unused(area) {
        try {
            const cfg = await API.get('/api/ext/donations/admin/crypto/provider/config');
            const { active_provider, providers, config } = cfg;
            this._providerSelection = active_provider;

            const tip = (text) => `<span class="pp-tip" title="${App.escapeHtml(text)}" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,0.1);color:var(--text-muted);font-size:0.65rem;cursor:help;margin-left:4px;font-style:normal;flex-shrink:0">ℹ</span>`;

            const providerCards = providers.map(p => {
                const isActive = p.id === active_provider;
                const isConfigured = p.id === 'manual'
                    ? true  // manual doesn't need API keys
                    : (() => {
                        const pc = config[p.id];
                        if (!pc) return false;
                        return Object.values(pc).some(v => v?.set === true);
                    })();
                const badge = isConfigured
                    ? `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:rgba(74,222,128,0.1);color:var(--neon-green);font-weight:600">✓ Configured</span>`
                    : `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:rgba(255,255,255,0.06);color:var(--text-muted);font-weight:600">Not set up</span>`;

                const unsafeBadge = p.warning
                    ? `<span style="font-size:0.6rem;padding:2px 6px;border-radius:8px;background:rgba(239,68,68,0.12);color:#ef4444;font-weight:700;display:block;margin-top:6px">⚠ ${p.warning.split('.')[0]}</span>`
                    : '';

                return `
                <div class="pp-card" data-provider="${p.id}"
                    style="cursor:pointer;padding:14px 16px;border-radius:10px;border:2px solid ${isActive ? p.color : 'rgba(255,255,255,0.07)'};
                           background:${isActive ? `rgba(${p.id==='manual'?'239,68,68':'41,182,246'},0.05)` : 'rgba(255,255,255,0.02)'};
                           transition:border-color 0.2s,background 0.2s;position:relative"
                    onclick="DonationsAdminPage._selectProvider('${p.id}')">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;color:${p.color};margin-bottom:3px">${App.escapeHtml(p.name)}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted)">Fee: <strong style="color:var(--text-secondary)">${p.fee}</strong> · ${p.coins.map(c=>c.toUpperCase()).join(' + ')}</div>
                            ${unsafeBadge}
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                            ${badge}
                            ${isActive ? `<span style="font-size:0.65rem;padding:2px 7px;border-radius:10px;background:${p.color}22;color:${p.color};font-weight:700">● Active</span>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('');

            area.innerHTML = `
            <div style="display:grid;gap:1.5rem">

                <!-- Provider Selection -->
                <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                    <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06)">
                        <h2 style="margin:0;font-size:1.1rem;font-weight:700">Payment Provider</h2>
                        <p style="color:var(--text-muted);margin:4px 0 0;font-size:0.82rem">Select how crypto payments are processed. Click a card, configure its API keys below, then save.</p>
                    </div>
                    <div style="padding:1rem 1.25rem;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px" id="pp-cards">
                        ${providerCards}
                    </div>
                </div>

                <!-- Config Panel -->
                <div id="pp-config-panel" style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                    ${this._renderProviderConfigPanel(active_provider, config, providers)}
                </div>

                <!-- Actions -->
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                    <button class="mc-btn" style="background:rgba(41,182,246,0.1);color:var(--neon-cyan);border-color:rgba(41,182,246,0.3)"
                        onclick="DonationsAdminPage._testProviderConnection()">⚡ Test Connection</button>
                    <button class="mc-btn" style="background:rgba(74,222,128,0.1);color:var(--neon-green);border-color:rgba(74,222,128,0.3)"
                        onclick="DonationsAdminPage._saveProviderSettings()">💾 Save Settings</button>
                    <span id="pp-save-status" style="font-size:0.8rem;color:var(--text-muted)"></span>
                </div>

                <!-- Dashboard -->
                <div style="background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.2)">
                    <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
                        <div>
                            <h2 style="margin:0;font-size:1.1rem;font-weight:700">Provider Dashboard</h2>
                            <p style="color:var(--text-muted);margin:4px 0 0;font-size:0.82rem">Recent payments from the active provider.</p>
                        </div>
                        <button class="mc-btn" style="padding:4px 10px;font-size:0.75rem;background:rgba(255,255,255,0.04)"
                            onclick="DonationsAdminPage._loadProviderDashboard()">↻ Refresh</button>
                    </div>
                    <div id="pp-dashboard" style="padding:1rem 1.25rem">
                        <div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem">Loading dashboard…</div>
                    </div>
                </div>

            </div>`;

            this._loadProviderDashboard();
        } catch (err) {
            area.innerHTML = `<div style="padding:2rem;color:var(--neon-magenta);text-align:center">${App.escapeHtml(err.message || 'Failed to load provider settings')}</div>`;
        }
    },

    _renderProviderConfigPanel(providerId, config, providers) {
        const tip = (text) => `<span title="${App.escapeHtml(text)}" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,0.1);color:var(--text-muted);font-size:0.65rem;cursor:help;margin-left:4px;font-style:normal;flex-shrink:0">ℹ</span>`;
        const meta = (providers || []).find(p => p.id === providerId) || { name: providerId, color: '#fff', docsUrl: null, warning: null };

        const pw = (id, label, tipText, placeholder) => `
            <div style="margin-bottom:12px">
                <label style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:2px;margin-bottom:5px">
                    ${App.escapeHtml(label)}${tip(tipText)}
                </label>
                <input type="password" id="${id}" class="input-field" placeholder="${App.escapeHtml(placeholder || '••••••••')}"
                    style="max-width:380px;font-family:monospace;font-size:0.82rem">
            </div>`;

        const webhookUrl = `${window.location.origin}/api/ext/donations/crypto/webhook/${providerId}`;

        let fields = '';
        if (providerId === 'manual') {
            fields = `
                <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;border-radius:8px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
                    <span style="font-size:1.4rem;flex-shrink:0">⚠️</span>
                    <div>
                        <div style="font-weight:700;color:#ef4444;font-size:0.9rem;margin-bottom:4px">Experimental — Not Recommended for Production</div>
                        <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.5">
                            Manual HD Wallet mode runs a blockchain polling loop on your server. You are responsible for securing your seed phrase — if lost, funds are unrecoverable.
                            Verify your addresses with <strong>Solflare</strong> (SOL) and <strong>Electrum-LTC</strong> (LTC) using your mnemonic.
                        </div>
                        <div style="margin-top:8px;font-size:0.8rem;color:var(--text-muted)">
                            Manage your seed phrase in the <strong style="color:var(--text-secondary)">HD Wallet Seeds</strong> section below.
                        </div>
                    </div>
                </div>`;
        } else if (providerId === 'nowpayments') {
            const c = config?.nowpayments || {};
            fields = `
                ${pw('pp-np-api-key', 'API Key', 'Your NOWPayments API key. Find it at: nowpayments.io → My Account → API Keys', c.api_key?.set ? `✓ Set (${c.api_key.preview})` : 'Enter API key')}
                ${pw('pp-np-ipn-secret', 'IPN Secret', 'Used to verify webhook signatures. Set this in NOWPayments → API Settings → IPN Secret. Must match what you set there.', c.ipn_secret?.set ? `✓ Set (${c.ipn_secret.preview})` : 'Enter IPN secret')}
                <div style="margin-bottom:12px">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.85rem">
                        <input type="checkbox" id="pp-np-sandbox" ${config?.nowpayments?.sandbox ? 'checked' : ''} style="width:16px;height:16px">
                        Sandbox mode ${tip('Use the NOWPayments sandbox API for testing. Payments won\'t be real. Sandbox keys differ from production keys — get them at: nowpayments.io/sandbox')}
                    </label>
                </div>`;
        } else if (providerId === 'coinpayments') {
            const c = config?.coinpayments || {};
            fields = `
                ${pw('pp-cp-pub', 'Public Key', 'Your CoinPayments API public key. Get it at: coinpayments.net → Account → API Keys → Create API Key', c.public_key?.set ? `✓ Set (${c.public_key.preview})` : 'Enter public key')}
                ${pw('pp-cp-priv', 'Private Key', 'Your CoinPayments API private key (shown only once on creation). Store it securely.', c.private_key?.set ? `✓ Set (${c.private_key.preview})` : 'Enter private key')}
                ${pw('pp-cp-ipn', 'IPN Secret', 'A secret you define for IPN signature verification. Set the same value in CoinPayments → Account → Merchant Settings → IPN Secret.', c.ipn_secret?.set ? `✓ Set (${c.ipn_secret.preview})` : 'Enter IPN secret')}
                ${pw('pp-cp-merchant', 'Merchant ID', 'Your CoinPayments merchant ID. Found at: coinpayments.net → Account → Merchant Settings → Merchant ID.', c.merchant_id?.set ? `✓ Set (${c.merchant_id.preview})` : 'Enter merchant ID')}`;
        } else if (providerId === 'plisio') {
            const c = config?.plisio || {};
            fields = `
                ${pw('pp-pl-api', 'API Key', 'Your Plisio secret API key. Get it at: plisio.net → Settings → API. Grants full account access — keep it secret.', c.api_key?.set ? `✓ Set (${c.api_key.preview})` : 'Enter API key')}
                ${pw('pp-pl-ipn', 'IPN Secret / Callback Key', 'Optional separate key for IPN verification. If blank, the API key is used. Set under: plisio.net → Stores → your store → Callback URL key.', c.ipn_key?.set ? `✓ Set (${c.ipn_key.preview})` : 'Enter IPN key (optional)')}`;
        } else if (providerId === 'oxapay') {
            const c = config?.oxapay || {};
            fields = `
                ${pw('pp-ox-merchant', 'Merchant Key', 'Your Oxapay merchant API key. Get it at: oxapay.com → Merchant API → Create Merchant Key. Used to create invoices.', c.merchant_key?.set ? `✓ Set (${c.merchant_key.preview})` : 'Enter merchant key')}
                ${pw('pp-ox-api', 'API Key (Webhook Verify)', 'Used to verify incoming webhook signatures. Found at: oxapay.com → API Keys. Different from the merchant key.', c.api_key?.set ? `✓ Set (${c.api_key.preview})` : 'Enter API key')}`;
        }

        const docsLink = meta.docsUrl
            ? `<a href="${App.escapeHtml(meta.docsUrl)}" target="_blank" rel="noopener" style="font-size:0.78rem;color:var(--neon-cyan);text-decoration:none">→ View ${App.escapeHtml(meta.name)} API docs ↗</a>`
            : '';

        const webhookBlock = providerId !== 'manual' ? `
            <div style="margin-top:16px;padding:12px 14px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
                <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center;gap:4px">
                    Webhook / IPN URL ${tip('Paste this URL into your payment provider\'s dashboard as the callback/IPN/webhook URL. The provider will POST payment confirmations to this endpoint.')}
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                    <code style="font-size:0.75rem;color:var(--neon-cyan);background:rgba(0,0,0,0.3);padding:6px 10px;border-radius:6px;word-break:break-all">${App.escapeHtml(webhookUrl)}</code>
                    <button class="mc-btn" style="padding:3px 8px;font-size:0.7rem"
                        onclick="navigator.clipboard.writeText('${App.escapeHtml(webhookUrl)}').then(()=>App.showToast('Copied!','success'))">Copy</button>
                </div>
            </div>` : '';

        return `
            <div style="padding:1rem 1.25rem;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center">
                <h2 style="margin:0;font-size:1.05rem;font-weight:700;color:${meta.color}">${App.escapeHtml(meta.name)} Configuration</h2>
                ${docsLink}
            </div>
            <div style="padding:1.25rem">
                ${fields}
                ${webhookBlock}
            </div>`;
    },

    _selectProvider(id) {
        this._providerSelection = id;
        // Update card borders
        document.querySelectorAll('.pp-card').forEach(el => {
            const pid = el.dataset.provider;
            const meta = { manual:'#ef4444', nowpayments:'#29b6f6', coinpayments:'#22c55e', plisio:'#a78bfa', oxapay:'#fb923c' };
            const color = meta[pid] || '#fff';
            const active = pid === id;
            el.style.borderColor = active ? color : 'rgba(255,255,255,0.07)';
            el.style.background  = active ? `${color}0d` : 'rgba(255,255,255,0.02)';
        });
        // Re-render config panel
        const panel = document.getElementById('pp-config-panel');
        if (panel) {
            API.get('/api/ext/donations/admin/crypto/provider/config').then(cfg => {
                panel.innerHTML = this._renderProviderConfigPanel(id, cfg.config, cfg.providers);
            }).catch(() => {});
        }
        // Refresh coins grid for the selected provider
        const currentEnabled = [...document.querySelectorAll('.coin-toggle:checked')].map(el => el.value);
        this._loadCoinsGrid(id, currentEnabled.length ? currentEnabled : (this._lastCryptoConfig?.enabled_coins || ['sol','ltc']));
    },

    /** Static fallback coin lists per provider (used when API call fails or for instant display on card switch) */
    _PROVIDER_COINS: {
        manual:       ['ltc', 'sol'],
        nowpayments:  ['ada', 'bnb', 'bch', 'btc', 'dash', 'doge', 'eth', 'ltc', 'matic', 'sol', 'trx', 'usdc', 'usdt', 'xmr', 'xrp'],
        coinpayments: ['bch', 'bnb', 'btc', 'doge', 'eth', 'ltc', 'sol', 'usdc', 'usdt', 'xmr'],
        plisio:       ['bch', 'bnb', 'btc', 'dash', 'doge', 'eth', 'ltc', 'sol', 'trx', 'usdc', 'usdt', 'xmr'],
        oxapay:       ['bch', 'bnb', 'btc', 'doge', 'eth', 'ltc', 'sol', 'trx', 'usdc', 'usdt', 'xmr'],
    },

    /**
     * Load the coin list for the given provider from the server, then render checkboxes.
     * Falls back to the static list if the API call fails.
     * @param {string} providerId
     * @param {string[]} enabledCoins  — currently saved/selected coin tickers
     */
    async _loadCoinsGrid(providerId, enabledCoins) {
        const grid = document.getElementById('coins-grid');
        if (!grid) return;
        grid.innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem">Loading coins…</span>';

        let coins;
        try {
            const data = await API.get('/api/ext/donations/crypto/currencies');
            // If the provider has changed (card selected but not saved), fall back to static list
            coins = (data.provider === providerId && Array.isArray(data.currencies) && data.currencies.length)
                ? data.currencies
                : (this._PROVIDER_COINS[providerId] || ['sol', 'ltc']);
        } catch {
            coins = this._PROVIDER_COINS[providerId] || ['sol', 'ltc'];
        }

        const enabledSet = new Set((enabledCoins || []).map(c => c.toLowerCase()));

        // Coin color map (accent colours for recognisable tickers)
        const COIN_COLORS = {
            btc:'#f7931a', eth:'#627eea', sol:'#14f195', ltc:'#345d9d', bnb:'#f3ba2f',
            usdt:'#26a17b', usdc:'#2775ca', trx:'#e50915', doge:'#c3a634', bch:'#8dc351',
            xmr:'#ff6600', ada:'#0033ad', dot:'#e6007a', matic:'#8247e5', dash:'#008ce7',
            xrp:'#346aa9',
        };

        const chips = coins.map(coin => {
            const color = COIN_COLORS[coin] || '#888';
            const on = enabledSet.has(coin);
            return `<label data-coin-color="${color}" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;
                        background:${on ? color + '18' : 'rgba(255,255,255,0.03)'};
                        border:1px solid ${on ? color + '55' : 'rgba(255,255,255,0.08)'};
                        border-radius:8px;user-select:none;transition:background 0.15s,border-color 0.15s;
                        font-size:0.8rem;font-weight:600;color:${on ? color : 'var(--text-muted)'}">
                <input type="checkbox" class="coin-toggle" value="${coin}" ${on ? 'checked' : ''}
                    style="accent-color:${color};width:14px;height:14px;cursor:pointer;flex-shrink:0">
                ${coin.toUpperCase()}
            </label>`;
        }).join('');

        grid.style.display = 'flex';
        grid.style.flexWrap = 'wrap';
        grid.style.gap = '8px';
        grid.innerHTML = chips || '<span style="color:var(--text-muted);font-size:0.82rem">No coins available for this provider.</span>';

        // Use change event (fires after checkbox state is already updated) to update chip styles
        grid.addEventListener('change', e => {
            if (!e.target.classList.contains('coin-toggle')) return;
            const lbl = e.target.closest('label');
            if (!lbl) return;
            const color = lbl.dataset.coinColor || '#888';
            const on = e.target.checked;
            lbl.style.background  = on ? color + '18' : 'rgba(255,255,255,0.03)';
            lbl.style.borderColor = on ? color + '55' : 'rgba(255,255,255,0.08)';
            lbl.style.color       = on ? color : 'var(--text-muted)';
        });
    },

    _toggleAllCoins(state) {
        document.querySelectorAll('.coin-toggle').forEach(el => {
            if (el.checked !== state) el.click();
        });
    },

    async _testProviderConnection() {
        const id = this._providerSelection || 'manual';
        const btn = event?.target;
        if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
        try {
            const result = await API.get(`/api/ext/donations/admin/crypto/provider/test/${id}`);
            if (result.ok) {
                App.showToast(`✓ ${result.latency_ms}ms — connection OK`, 'success');
            } else {
                App.showToast(result.message || 'Connection failed', 'error');
            }
        } catch (err) {
            App.showToast(err.message || 'Test failed', 'error');
        }
        if (btn) { btn.disabled = false; btn.textContent = '⚡ Test Connection'; }
    },

    async _saveProviderSettings() {
        const id = this._providerSelection;
        if (!id) { App.showToast('Select a provider first', 'warning'); return; }
        const btn = event?.target;
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

        const g = (elId) => document.getElementById(elId)?.value?.trim() || undefined;
        const cb = (elId) => document.getElementById(elId)?.checked;

        const payload = { provider: id };
        if (id === 'nowpayments') {
            if (g('pp-np-api-key')) payload.nowpayments_api_key    = g('pp-np-api-key');
            if (g('pp-np-ipn-secret')) payload.nowpayments_ipn_secret = g('pp-np-ipn-secret');
            payload.nowpayments_sandbox = cb('pp-np-sandbox') || false;
        } else if (id === 'coinpayments') {
            if (g('pp-cp-pub'))  payload.coinpayments_public_key  = g('pp-cp-pub');
            if (g('pp-cp-priv')) payload.coinpayments_private_key = g('pp-cp-priv');
            if (g('pp-cp-ipn'))  payload.coinpayments_ipn_secret  = g('pp-cp-ipn');
            if (g('pp-cp-merchant')) payload.coinpayments_merchant_id = g('pp-cp-merchant');
        } else if (id === 'plisio') {
            if (g('pp-pl-api')) payload.plisio_api_key = g('pp-pl-api');
            if (g('pp-pl-ipn')) payload.plisio_ipn_key = g('pp-pl-ipn');
        } else if (id === 'oxapay') {
            if (g('pp-ox-merchant')) payload.oxapay_merchant_key = g('pp-ox-merchant');
            if (g('pp-ox-api'))      payload.oxapay_api_key      = g('pp-ox-api');
        }

        // Collect enabled coins from the grid and save alongside provider settings
        const enabledCoins = [...document.querySelectorAll('.coin-toggle:checked')].map(el => el.value);

        try {
            await Promise.all([
                API.put('/api/ext/donations/admin/crypto/provider/config', payload),
                API.put('/api/ext/donations/admin/crypto/config', {
                    enabled_coins:   enabledCoins,
                    solana_enabled:  enabledCoins.includes('sol'),
                    litecoin_enabled: enabledCoins.includes('ltc'),
                }),
            ]);
            App.showToast('Provider settings saved', 'success');
            const status = document.getElementById('pp-save-status');
            if (status) status.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
            // Reload tab to reflect new active provider
            this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Save failed', 'error');
        }
        if (btn) { btn.disabled = false; btn.textContent = '💾 Save Provider'; }
    },

    async _loadProviderDashboard() {
        const el = document.getElementById('pp-dashboard');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;font-size:0.85rem">Loading…</div>';
        try {
            const data = await API.get('/api/ext/donations/admin/crypto/provider/dashboard');
            const payments = data.recent_payments || [];

            const statusBadge = s => {
                const map = { completed:'var(--neon-green)', finished:'var(--neon-green)', confirmed:'var(--neon-green)', Paid:'var(--neon-green)',
                              pending:'#eab308', waiting:'#eab308', failed:'#ef4444', expired:'#ef4444' };
                const color = map[s] || 'var(--text-muted)';
                return `<span style="font-size:0.68rem;padding:2px 7px;border-radius:10px;background:${color}18;color:${color};font-weight:600">${App.escapeHtml(s||'—')}</span>`;
            };

            const tableRows = payments.length ? payments.map(p => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.03)">
                    <td style="padding:8px 10px;font-size:0.75rem;color:var(--text-muted)">${App.escapeHtml(p.created_at ? new Date(p.created_at).toLocaleString() : '—')}</td>
                    <td style="padding:8px 10px;font-family:monospace;color:var(--neon-green)">$${parseFloat(p.amount_usd||0).toFixed(2)}</td>
                    <td style="padding:8px 10px;font-size:0.78rem;color:var(--text-secondary)">${App.escapeHtml((p.coin||'').toUpperCase())}</td>
                    <td style="padding:8px 10px">${statusBadge(p.status)}</td>
                    <td style="padding:8px 10px;font-family:monospace;font-size:0.68rem;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(p.provider_id||'')}">
                        ${App.escapeHtml(p.provider_id ? p.provider_id.slice(0,16)+'…' : '—')}
                    </td>
                </tr>`).join('') : `<tr><td colspan="5" style="padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.85rem">No recent payments found.</td></tr>`;

            el.innerHTML = `
                <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:0.8rem">
                        <thead>
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Date</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Amount</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Coin</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Status</th>
                                <th style="padding:8px 10px;text-align:left;color:var(--text-muted);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em">Provider ID</th>
                            </tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                ${data.balance_info ? `<div style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,0.03);font-size:0.8rem;color:var(--text-secondary)">💰 Balance: ${App.escapeHtml(String(data.balance_info))}</div>` : ''}
                ${data.payout_info  ? `<div style="margin-top:6px;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.02);font-size:0.75rem;color:var(--text-muted)">ℹ ${App.escapeHtml(String(data.payout_info))}</div>` : ''}`;
        } catch (err) {
            el.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:0.85rem">${App.escapeHtml(err.message || 'Failed to load dashboard')}</div>`;
        }
    },

    /** Delete admin_wallet_addresses rows where the LTC address is a stringified object. */
    async cleanMalformedAddresses() {
        const confirmed = confirm('This will permanently delete admin wallet address rows where the LTC address was stored as a raw object (e.g. {"address":"..."}). These rows are unusable. Continue?');
        if (!confirmed) return;
        try {
            const data = await API.delete('/api/ext/donations/admin/crypto/wallet/admin-addresses/malformed');
            App.showToast(data.message || `Deleted ${data.deleted} malformed row(s)`, data.deleted > 0 ? 'success' : 'info');
            if (data.deleted > 0) this.loadTab();
        } catch (err) {
            App.showToast(err.message || 'Cleanup failed', 'error');
        }
    },
};
