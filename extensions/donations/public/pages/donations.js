/* =======================================
   Donations & Ranks — Public Page
   ======================================= */
window.DonationsPage = {
    currentRank: null,
    allRanks: [],

    async render(container) {
        container.innerHTML = `
            <div class="minecraft-page" style="max-width:1100px;margin:0 auto">
                <h1 style="text-align:center;margin-bottom:4px">Donation Ranks</h1>
                <p style="text-align:center;color:var(--text-secondary);margin-bottom:2rem">Purchase rank time to unlock exclusive perks!</p>
                <div id="donate-current-rank-area"></div>
                <div id="donate-convert-area"></div>
                <div id="donate-ranks-area"><div class="loading-spinner" style="text-align:center;padding:3rem">Loading ranks...</div></div>
                <h2 style="margin-top:2.5rem;margin-bottom:0.5rem;font-size:1.1rem;color:var(--text-secondary)">Recent Donations</h2>
                <div id="donate-recent-area"><div class="loading-spinner" style="text-align:center;padding:1rem;font-size:0.85rem;color:var(--text-muted)">Loading...</div></div>
            </div>`;

        await this.loadCurrentRank();
        this.loadRanks();
        this.loadRecent();

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
                    <div class="rank-info" style="flex:1">
                        <h3 style="color:${App.escapeHtml(rank.rank_color)}">Active Rank: ${App.escapeHtml(rank.rank_name)}</h3>
                        <p>${daysLeft === '∞' ? 'Permanent' : daysLeft + ' days remaining'}</p>
                    </div>
                    <button class="donate-rank-btn" style="width:auto;padding:8px 18px;font-size:0.8rem" onclick="DonationsPage.showConvertModal()">🔄 Convert Rank</button>
                </div>`;
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
            // Guest view: MC username required to donate; shown with MC-Heads preview
            var rid = rank.id;
            return '<div class="donate-guest-purchase" data-rank-id="' + rid + '">' +
                '<p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;text-align:center">' +
                'Enter your Minecraft username to donate as a guest</p>' +
                '<div style="margin-bottom:8px">' +
                '<input type="text" class="input-field donate-mc-username" placeholder="Minecraft username (required)"' +
                ' style="font-size:0.8rem;padding:6px 10px;text-align:center"' +
                ' title="Your Minecraft username — used for rank delivery and avatar">' +
                '<small style="display:block;margin-top:4px;font-size:0.7rem;color:var(--text-muted);text-align:center">' +
                'Used for rank delivery and MC-Heads.net avatar</small>' +
                '</div>' +
                '<button class="donate-rank-btn" onclick="DonationsPage.purchaseAsGuest(\''+rid+'\', this)">' +
                'Donate as Guest</button>' +
                '</div>';
        }
        // If user has a rank already, show convert option
        if (this.currentRank && this.currentRank.active) {
            return `<button class="donate-rank-btn" onclick="DonationsPage.showConvertConfirm('${rank.id}', '${App.escapeHtml(rank.name)}', ${rank.price})">Convert to This</button>`;
        }
        return `<button class="donate-rank-btn" onclick="DonationsPage.purchase('${rank.id}', this)">Purchase</button>`;
    },

    async showConvertModal() {
        if (!this.currentRank || !this.currentRank.active) return;
        const ranks = this.allRanks.filter(r => r.id !== this.currentRank.rank_id);
        if (!ranks.length) { App.showToast('No other ranks available to convert to.', 'info'); return; }

        const daysLeft = this.currentRank.expires_at
            ? Math.max(0, Math.ceil((new Date(this.currentRank.expires_at) - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0;

        let html = `<p style="color:var(--text-secondary);margin-bottom:1rem;font-size:0.9rem">
            You have <strong style="color:var(--text-primary)">${daysLeft} days</strong> remaining on <strong style="color:${App.escapeHtml(this.currentRank.rank_color)}">${App.escapeHtml(this.currentRank.rank_name)}</strong>.
            Your remaining time will be converted to the new rank at a prorated rate.
        </p>
        <div style="display:flex;flex-direction:column;gap:10px">`;

        for (const r of ranks) {
            const oldPrice = this.currentRank.rank_price || 0;
            const proratedValue = daysLeft * (oldPrice / 30);
            const newDays = r.price > 0 ? Math.floor(proratedValue / (r.price / 30)) : daysLeft;
            html += `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-card);border:1px solid var(--border-subtle);border-radius:var(--radius-md)">
                    <div>
                        <span style="color:${App.escapeHtml(r.color)};font-weight:700">${r.icon || '⭐'} ${App.escapeHtml(r.name)}</span>
                        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px">→ ~${newDays} days</span>
                    </div>
                    <button class="donate-rank-btn" style="width:auto;padding:6px 14px;font-size:0.8rem" onclick="DonationsPage.convertRank('${r.id}', this)">Convert</button>
                </div>`;
        }
        html += '</div>';
        App.showModal('🔄 Convert Rank', html);
    },

    async showConvertConfirm(rankId, rankName, rankPrice) {
        if (!this.currentRank || !this.currentRank.active) {
            return this.purchase(rankId, null);
        }
        const daysLeft = this.currentRank.expires_at
            ? Math.max(0, Math.ceil((new Date(this.currentRank.expires_at) - Date.now()) / (1000 * 60 * 60 * 24)))
            : 0;
        const oldPrice = this.currentRank.rank_price || 0;
        const proratedValue = daysLeft * (oldPrice / 30);
        const newDays = rankPrice > 0 ? Math.floor(proratedValue / (rankPrice / 30)) : daysLeft;

        const confirmed = await App.confirm(
            `Convert to ${rankName}?`,
            `Your ${daysLeft} remaining days on ${this.currentRank.rank_name} will convert to approximately ${newDays} days on ${rankName}. This cannot be undone.`
        );
        if (!confirmed) return;
        await this.convertRank(rankId, null);
    },

    async convertRank(rankId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Converting...'; }
        try {
            const result = await API.post('/api/ext/donations/convert-rank', { new_rank_id: rankId });
            App.closeModal();
            App.showToast(`✅ Converted to ${result.to_rank}! You have ${result.new_days} days remaining.`, 'success');
            await this.loadCurrentRank();
            this.loadRanks();
        } catch (err) {
            App.showToast(err.message || 'Conversion failed', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Convert'; }
        }
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

    /** Guest donation: sends mc_username to server instead of auth token. */
    async purchaseAsGuest(rankId, btn) {
        var card = btn.closest('.donate-guest-purchase');
        var mcInput = card ? card.querySelector('.donate-mc-username') : null;
        var mcUsername = mcInput ? mcInput.value.trim() : '';
        if (!mcUsername) { App.showToast('Please enter your Minecraft username', 'warning'); return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
        try {
            var result = await API.post('/api/ext/donations/checkout', { rank_id: rankId, mc_username: mcUsername });
            if (result.url) {
                window.location.href = result.url;
            } else {
                App.showToast('Could not create checkout session', 'error');
                if (btn) { btn.disabled = false; btn.textContent = 'Donate as Guest'; }
            }
        } catch (err) {
            App.showToast(err.message || 'Payment error', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Donate as Guest'; }
        }
    },

    async verifySession(sessionId) {
        try {
            const result = await API.post('/api/ext/donations/verify-session', { session_id: sessionId });
            if (result.success) {
                App.showToast('🎉 Thank you for your donation!', 'success');
                await this.loadCurrentRank();
                this.loadRanks();
                this.loadRecent();
            }
        } catch {
            App.showToast('Payment verification in progress...', 'info');
        }
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
                        <img class="donate-recent-avatar" src="${d.minecraft_uuid ? 'https://mc-heads.net/avatar/' + d.minecraft_uuid + '/32' : (d.mc_username ? 'https://mc-heads.net/avatar/' + encodeURIComponent(d.mc_username) + '/32' : (d.avatar || '/img/default-avatar.png'))}" alt="" onerror="this.src='/img/default-avatar.png'">
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
        return Math.floor(hours / 24) + 'd ago';
    }
};
