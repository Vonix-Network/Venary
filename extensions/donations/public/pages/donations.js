/* =======================================
   Donations & Ranks — Public Page
   ======================================= */
window.DonationsPage = {
    currentRank: null,

    async render(container) {
        container.innerHTML = `
            <div class="minecraft-page" style="max-width:1100px;margin:0 auto">
                <h1 style="text-align:center;margin-bottom:4px">Donation Ranks</h1>
                <p style="text-align:center;color:var(--text-secondary);margin-bottom:2rem">Purchase rank time to unlock exclusive perks!</p>
                <div id="donate-current-rank-area"></div>
                <div id="donate-ranks-area"><div class="loading-spinner" style="text-align:center;padding:3rem">Loading ranks...</div></div>
                <h2 style="margin-top:2.5rem;margin-bottom:0.5rem;font-size:1.1rem;color:var(--text-secondary)">Recent Donations</h2>
                <div id="donate-recent-area"><div class="loading-spinner" style="text-align:center;padding:1rem;font-size:0.85rem;color:var(--text-muted)">Loading...</div></div>
            </div>`;

        this.loadCurrentRank();
        this.loadRanks();
        this.loadRecent();

        // Handle success redirect from Stripe
        const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
        if (params.get('status') === 'success' && params.get('session_id')) {
            this.verifySession(params.get('session_id'));
        }
    },

    async loadCurrentRank() {
        const area = document.getElementById('donate-current-rank-area');
        if (!area || !App.currentUser) { if (area) area.innerHTML = ''; return; }

        try {
            const rank = await API.get('/api/ext/donations/my-rank');
            this.currentRank = rank;
            if (!rank || !rank.active || !rank.rank_name) { area.innerHTML = ''; return; }

            const expiresDate = rank.expires_at ? new Date(rank.expires_at) : null;
            const daysLeft = expiresDate ? Math.max(0, Math.ceil((expiresDate - Date.now()) / (1000 * 60 * 60 * 24))) : '∞';

            area.innerHTML = `
                <div class="donate-current-rank" style="--rank-accent:${App.escapeHtml(rank.rank_color)}">
                    <div class="rank-badge">${rank.rank_icon || '⭐'}</div>
                    <div class="rank-info">
                        <h3 style="color:${App.escapeHtml(rank.rank_color)}">Active Rank: ${App.escapeHtml(rank.rank_name)}</h3>
                        <p>${daysLeft === '∞' ? 'Permanent' : daysLeft + ' days remaining'}</p>
                    </div>
                </div>`;
        } catch { area.innerHTML = ''; }
    },

    async loadRanks() {
        const area = document.getElementById('donate-ranks-area');
        if (!area) return;

        try {
            const ranks = await API.get('/api/ext/donations/ranks');
            if (!ranks.length) { area.innerHTML = '<p style="text-align:center;color:var(--text-muted)">No ranks available yet.</p>'; return; }

            let html = '<div class="donate-ranks-grid">';
            for (const rank of ranks) {
                const isCurrentRank = this.currentRank && this.currentRank.rank_id === rank.id && this.currentRank.active;
                const perks = Array.isArray(rank.perks) ? rank.perks : [];

                html += `
                    <div class="donate-rank-card" style="--rank-accent:${App.escapeHtml(rank.color)};--rank-glow:${App.escapeHtml(rank.color)}33">
                        <div class="donate-rank-icon">${rank.icon || '⭐'}</div>
                        <div class="donate-rank-name">${App.escapeHtml(rank.name)}</div>
                        <div class="donate-rank-price">$${rank.price.toFixed(2)}<span>/month</span></div>
                        <div class="donate-rank-desc">${App.escapeHtml(rank.description || '')}</div>
                        <ul class="donate-rank-perks">
                            ${perks.map(p => `<li>${App.escapeHtml(p)}</li>`).join('')}
                        </ul>
                        ${this._renderPurchaseButton(rank, isCurrentRank)}
                    </div>`;
            }
            html += '</div>';
            area.innerHTML = html;
        } catch (err) {
            area.innerHTML = '<p style="text-align:center;color:var(--neon-magenta)">Failed to load ranks.</p>';
        }
    },

    _renderPurchaseButton(rank, isCurrent) {
        if (isCurrent) {
            return `<button class="donate-rank-btn current" disabled>Current Rank</button>`;
        }
        if (!App.currentUser) {
            return `<button class="donate-rank-btn" onclick="App.showAuthModal('login')">Login to Purchase</button>`;
        }
        return `<button class="donate-rank-btn" onclick="DonationsPage.purchase('${rank.id}', this)">Purchase</button>`;
    },

    async purchase(rankId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }

        try {
            const result = await API.post('/api/ext/donations/checkout', { rank_id: rankId });
            if (result.url) {
                window.location.href = result.url;
            } else {
                App.showToast('Could not create checkout session', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Purchase'; }
            }
        } catch (err) {
            App.showToast(err.message || 'Payment error', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Purchase'; }
        }
    },

    async verifySession(sessionId) {
        try {
            const result = await API.post('/api/ext/donations/verify-session', { session_id: sessionId });
            if (result.success) {
                App.showToast('🎉 Thank you for your donation!', 'success');
                // Reload ranks to update state
                this.loadCurrentRank();
                this.loadRanks();
                this.loadRecent();
            }
        } catch {
            App.showToast('Payment verification in progress...', 'info');
        }
        // Clean URL
        window.location.hash = '#/donate';
    },

    async loadRecent() {
        const area = document.getElementById('donate-recent-area');
        if (!area) return;

        try {
            const donations = await API.get('/api/ext/donations/recent?limit=5');
            if (!donations.length) { area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted)">No donations yet. Be the first!</p>'; return; }

            let html = '<div class="donate-recent-list">';
            for (const d of donations) {
                const timeAgo = this._timeAgo(d.created_at);
                html += `
                    <div class="donate-recent-item">
                        <img class="donate-recent-avatar" src="${d.avatar || '/img/default-avatar.png'}" alt="" onerror="this.src='/img/default-avatar.png'">
                        <div class="donate-recent-info">
                            <div class="donate-recent-name">${App.escapeHtml(d.username)}</div>
                            <div class="donate-recent-rank" style="color:${App.escapeHtml(d.rank_color || '#fff')}">${App.escapeHtml(d.rank_name || '')}</div>
                        </div>
                        <div style="text-align:right">
                            <div class="donate-recent-amount">$${d.amount.toFixed(2)}</div>
                            <div class="donate-recent-time">${timeAgo}</div>
                        </div>
                    </div>`;
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
        const days = Math.floor(hours / 24);
        return days + 'd ago';
    }
};
