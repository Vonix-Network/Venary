/* =======================================
   Donations & Ranks - Public Page
   ======================================= */
window.DonationsPage = {
    currentRank: null,
    allRanks: [],
    _selectedAmount: null,

    async render(container) {
        container.innerHTML = `
            <div class="minecraft-page donate-page-wrap">
                <h1 class="donate-page-title">Donation Ranks</h1>
                <p class="donate-page-sub">Purchase rank time to unlock exclusive perks!</p>
                <div id="donate-rank-dashboard"></div>
                <div id="donate-ranks-area"><div class="loading-spinner" style="text-align:center;padding:3rem">Loading ranks...</div></div>
                <div class="donate-onetimebox">
                    <div class="donate-onetime-header">
                        <span class="donate-onetime-icon">&#128157;</span>
                        <div>
                            <div class="donate-onetime-title">One Time Donation</div>
                            <div class="donate-onetime-sub">Support the server without a rank</div>
                        </div>
                    </div>
                    <div class="donate-preset-row" id="donate-preset-row"></div>
                    <div id="donate-custom-input-wrap" style="display:none;margin-top:10px">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="color:var(--text-secondary);font-size:1.1rem">$</span>
                            <input type="number" id="donate-custom-amount" class="input-field" placeholder="Enter amount" min="1" max="10000" step="0.01" style="max-width:180px">
                        </div>
                    </div>
                    <div id="donate-onetime-guest-mc" style="display:none;margin-top:14px">
                        <label style="font-size:0.82rem;color:var(--text-secondary);display:block;margin-bottom:6px">Minecraft Username <span style="color:var(--neon-magenta)">*</span></label>
                        <input type="text" id="donate-onetime-mc-username" class="input-field" placeholder="Your Minecraft username" style="max-width:280px">
                        <small style="display:block;margin-top:4px;font-size:0.72rem;color:var(--text-muted)">Used for your avatar in the donations list</small>
                    </div>
                    <button class="donate-onetime-btn" id="donate-onetime-submit" onclick="DonationsPage.submitOneTime()">Donate Now</button>
                </div>
                <div class="donate-recent-section">
                    <h2 class="donate-section-label">Recent Donations</h2>
                    <div id="donate-recent-area"><div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem">Loading...</div></div>
                </div>
            </div>`;

        this._selectedAmount = null;
        this._buildPresets();
        await this.loadCurrentRank();
        this.loadRanks();
        this.loadRecent();

        if (!App.currentUser) {
            const gw = document.getElementById('donate-onetime-guest-mc');
            if (gw) gw.style.display = 'block';
        }

        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        if (params.get('status') === 'success' && params.get('session_id')) {
            this.verifySession(params.get('session_id'));
        }
    },

    _buildPresets() {
        const row = document.getElementById('donate-preset-row');
        if (!row) return;
        [5,10,15,20,40,50].forEach(a => {
            const b = document.createElement('button');
            b.className = 'donate-preset-btn';
            b.textContent = '$' + a;
            b.onclick = () => this.selectPreset(b, a);
            row.appendChild(b);
        });
        const custom = document.createElement('button');
        custom.id = 'donate-custom-toggle';
        custom.className = 'donate-preset-btn donate-preset-custom';
        custom.textContent = 'Custom';
        custom.onclick = () => this.toggleCustom();
        row.appendChild(custom);
    },

    async loadCurrentRank() {
        const area = document.getElementById('donate-rank-dashboard');
        if (!area) return;
        if (!App.currentUser) { area.innerHTML = ''; return; }
        try {
            const rank = await API.get('/api/ext/donations/my-rank');
            this.currentRank = rank;
            if (!rank || !rank.active || !rank.rank_name) { area.innerHTML = ''; return; }
            const expiresDate = rank.expires_at ? new Date(rank.expires_at) : null;
            const daysLeft = expiresDate ? Math.max(0, Math.ceil((expiresDate - Date.now()) / 86400000)) : 'Permanent';
            const pct = (expiresDate && rank.started_at)
                ? Math.min(100, Math.max(4, Math.round(((expiresDate - Date.now()) / (expiresDate - new Date(rank.started_at))) * 100)))
                : 100;
            area.innerHTML =
                '<div class="donate-dashboard" style="--rank-accent:' + App.escapeHtml(rank.rank_color) + '">' +
                    '<div class="donate-dashboard-left">' +
                        '<div class="donate-dashboard-badge">' + (rank.rank_icon || '&#11088;') + '</div>' +
                        '<div class="donate-dashboard-info">' +
                            '<div class="donate-dashboard-label">Current Rank</div>' +
                            '<div class="donate-dashboard-name" style="color:' + App.escapeHtml(rank.rank_color) + '">' + App.escapeHtml(rank.rank_name) + '</div>' +
                            '<div class="donate-dashboard-time">' + (daysLeft === 'Permanent' ? 'Permanent' : daysLeft + ' days remaining') + '</div>' +
                            '<div class="donate-dashboard-bar-wrap"><div class="donate-dashboard-bar" style="width:' + pct + '%;background:' + App.escapeHtml(rank.rank_color) + '"></div></div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
        } catch { area.innerHTML = ''; }
    },

    async loadRanks() {
        const area = document.getElementById('donate-ranks-area');
        if (!area) return;
        try {
            const ranks = await API.get('/api/ext/donations/ranks');
            this.allRanks = ranks;
            if (!ranks.length) { area.innerHTML = '<p style="text-align:center;color:var(--text-muted)">No ranks available yet.</p>'; return; }
            let html = '<div class="donate-ranks-grid">';
            for (const rank of ranks) {
                const isCurrent = this.currentRank && this.currentRank.rank_id === rank.id && this.currentRank.active;
                const perks = Array.isArray(rank.perks) ? rank.perks : [];
                html += '<div class="donate-rank-card" style="--rank-accent:' + App.escapeHtml(rank.color) + ';--rank-glow:' + App.escapeHtml(rank.color) + '33">' +
                    '<div class="donate-rank-icon">' + (rank.icon || '&#11088;') + '</div>' +
                    '<div class="donate-rank-name">' + App.escapeHtml(rank.name) + '</div>' +
                    '<div class="donate-rank-price">$' + rank.price.toFixed(2) + '<span>/month</span></div>' +
                    '<div class="donate-rank-desc">' + App.escapeHtml(rank.description || '') + '</div>' +
                    '<ul class="donate-rank-perks">' + perks.map(p => '<li>' + App.escapeHtml(p) + '</li>').join('') + '</ul>' +
                    this._renderBtn(rank, isCurrent) +
                    '</div>';
            }
            html += '</div>';
            area.innerHTML = html;
        } catch { area.innerHTML = '<p style="text-align:center;color:var(--neon-magenta)">Failed to load ranks.</p>'; }
    },

    _renderBtn(rank, isCurrent) {
        if (!App.currentUser) {
            return '<button class="donate-rank-btn donate-rank-btn--locked" disabled>Must Be Registered</button>';
        }
        if (isCurrent) {
            return '<button class="donate-rank-btn extend" onclick="DonationsPage.purchase(\'' + rank.id + '\',this)">&#9201; Extend (+30 days)</button>';
        }
        if (this.currentRank && this.currentRank.active) {
            return '<button class="donate-rank-btn switch-btn" onclick="DonationsPage.showSwitchConfirm(\'' + rank.id + '\',\'' + App.escapeHtml(rank.name) + '\',' + rank.price + ')">&#128256; Purchase &amp; Switch</button>';
        }
        return '<button class="donate-rank-btn" onclick="DonationsPage.purchase(\'' + rank.id + '\',this)">Purchase</button>';
    },

    async purchase(rankId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
        try {
            const result = await API.post('/api/ext/donations/checkout', { rank_id: rankId });
            if (result.url) { window.location.href = result.url; return; }
            App.showToast('Could not create checkout session', 'error');
        } catch (err) { App.showToast(err.message || 'Payment error', 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Purchase'; }
    },

    async showSwitchConfirm(rankId, rankName, rankPrice) {
        if (!this.currentRank || !this.currentRank.active) return this.purchase(rankId, null);
        const daysLeft = this.currentRank.expires_at
            ? Math.max(0, Math.ceil((new Date(this.currentRank.expires_at) - Date.now()) / 86400000)) : 0;
        const oldPrice = this.currentRank.rank_price || 0;
        const convertedDays = rankPrice > 0 ? Math.floor((daysLeft * (oldPrice / 30)) / (rankPrice / 30)) : daysLeft;
        const html =
            '<div class="donate-switch-modal-body">' +
            '<p class="donate-modal-desc">Switching from <strong style="color:' + App.escapeHtml(this.currentRank.rank_color) + '">' + App.escapeHtml(this.currentRank.rank_name) + '</strong> to <strong style="color:var(--neon-cyan)">' + App.escapeHtml(rankName) + '</strong>.</p>' +
            '<div class="donate-switch-summary">' +
            '<div class="donate-switch-summary-row"><span>Your remaining days</span><strong>' + daysLeft + ' days</strong></div>' +
            '<div class="donate-switch-summary-row"><span>Converted to ' + App.escapeHtml(rankName) + '</span><strong>~' + convertedDays + ' days</strong></div>' +
            '<div class="donate-switch-summary-row"><span>New purchase adds</span><strong>+30 days</strong></div>' +
            '<div class="donate-switch-summary-row total"><span>Total days on new rank</span><strong>' + (convertedDays + 30) + ' days</strong></div>' +
            '</div>' +
            '<p style="font-size:0.78rem;color:var(--text-muted);margin-top:12px">You will be charged $' + rankPrice.toFixed(2) + ' for 30 days of ' + App.escapeHtml(rankName) + '. Your remaining time is converted at a prorated rate.</p>' +
            '<div style="display:flex;gap:10px;margin-top:20px">' +
            '<button class="donate-rank-btn" style="flex:1" onclick="DonationsPage._doSwitch(\'' + rankId + '\',' + convertedDays + ',this)">Confirm &amp; Pay</button>' +
            '<button class="donate-rank-btn donate-rank-btn--locked" style="flex:1;cursor:pointer;opacity:1" onclick="App.closeModal()">Cancel</button>' +
            '</div></div>';
        App.showModal('Switch to ' + rankName, html);
    },

    async _doSwitch(rankId, convertedDays, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
        try {
            if (this.currentRank && this.currentRank.active && convertedDays > 0) {
                await API.post('/api/ext/donations/convert-rank', { new_rank_id: rankId });
            }
            const result = await API.post('/api/ext/donations/checkout', { rank_id: rankId });
            if (result.url) { App.closeModal(); window.location.href = result.url; return; }
            App.showToast('Could not create checkout session', 'error');
        } catch (err) { App.showToast(err.message || 'Switch failed', 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Confirm & Pay'; }
    },

    selectPreset(btn, amount) {
        document.querySelectorAll('.donate-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._selectedAmount = amount;
        const wrap = document.getElementById('donate-custom-input-wrap');
        if (wrap) wrap.style.display = 'none';
        const ct = document.getElementById('donate-custom-toggle');
        if (ct) ct.classList.remove('active');
    },

    toggleCustom() {
        const wrap = document.getElementById('donate-custom-input-wrap');
        const btn = document.getElementById('donate-custom-toggle');
        const open = wrap && wrap.style.display !== 'none';
        if (open) {
            if (wrap) wrap.style.display = 'none';
            if (btn) btn.classList.remove('active');
            this._selectedAmount = null;
        } else {
            document.querySelectorAll('.donate-preset-btn:not(#donate-custom-toggle)').forEach(b => b.classList.remove('active'));
            if (wrap) wrap.style.display = 'block';
            if (btn) btn.classList.add('active');
            this._selectedAmount = null;
        }
    },

    async submitOneTime() {
        const customInput = document.getElementById('donate-custom-amount');
        let amount = this._selectedAmount;
        if (!amount && customInput && customInput.value) amount = parseFloat(customInput.value);
        if (!amount || amount < 1) { App.showToast('Please select or enter a donation amount', 'warning'); return; }
        const isGuest = !App.currentUser;
        let mcUsername = '';
        if (isGuest) {
            const mcInput = document.getElementById('donate-onetime-mc-username');
            mcUsername = mcInput ? mcInput.value.trim() : '';
            if (!mcUsername) { App.showToast('Please enter your Minecraft username', 'warning'); return; }
        }
        const btn = document.getElementById('donate-onetime-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
        try {
            const payload = { amount };
            if (isGuest) payload.mc_username = mcUsername;
            const result = await API.post('/api/ext/donations/custom-checkout', payload);
            if (result.url) { window.location.href = result.url; return; }
            App.showToast('Could not create checkout session', 'error');
        } catch (err) { App.showToast(err.message || 'Payment error', 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Donate Now'; }
    },

    async verifySession(sessionId) {
        try {
            const result = await API.post('/api/ext/donations/verify-session', { session_id: sessionId });
            if (result.success) {
                App.showToast('Thank you for your donation!', 'success');
                await this.loadCurrentRank();
                this.loadRanks();
                this.loadRecent();
            }
        } catch { App.showToast('Payment verification in progress...', 'info'); }
        window.location.hash = '#/donate';
    },

    async loadRecent() {
        const area = document.getElementById('donate-recent-area');
        if (!area) return;
        try {
            const donations = await API.get('/api/ext/donations/recent?limit=8');
            if (!donations.length) { area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:1rem">No donations yet. Be the first!</p>'; return; }
            let html = '<div class="donate-recent-list">';
            for (const d of donations) {
                const avatar = d.minecraft_uuid
                    ? 'https://mc-heads.net/avatar/' + d.minecraft_uuid + '/40'
                    : (d.mc_username ? 'https://mc-heads.net/avatar/' + encodeURIComponent(d.mc_username) + '/40' : (d.avatar || '/img/default-avatar.png'));
                html += '<div class="donate-recent-item">' +
                    '<img class="donate-recent-avatar" src="' + avatar + '" alt="" onerror="this.src=\'/img/default-avatar.png\'">' +
                    '<div class="donate-recent-meta">' +
                        '<div class="donate-recent-name">' + App.escapeHtml(d.username) + '</div>' +
                        (d.rank_name ? '<div class="donate-recent-rank" style="color:' + App.escapeHtml(d.rank_color || '#aaa') + '">' + App.escapeHtml(d.rank_name) + '</div>' : '') +
                    '</div>' +
                    '<div class="donate-recent-amount">$' + d.amount.toFixed(2) + '</div>' +
                    '</div>';
            }
            html += '</div>';
            area.innerHTML = html;
        } catch { area.innerHTML = ''; }
    },

    _timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + 'h ago';
        return Math.floor(hours / 24) + 'd ago';
    }
};