/* =======================================
   Donations & Ranks - Public Page
   ======================================= */
window.DonationsPage = {
    currentRank: null,
    allRanks: [],
    _selectedAmount: null,
    _checkoutConfig: null,
    _stripe: null,
    _stripeElements: null,

    async render(container) {
        const params = new URLSearchParams(window.location.search);

        // Receipt screen — returned from Stripe after successful payment
        if (params.get('status') === 'success' && params.get('session_id')) {
            return this.renderReceipt(container, params.get('session_id'));
        }

        // Receipt screen — returned from a crypto payment provider
        if (params.get('status') === 'crypto_success' && params.get('intent')) {
            return this.renderCryptoReceipt(container, params.get('intent'));
        }

        // Transaction history tab — linked from profile menu
        if (params.get('tab') === 'history') {
            return this.renderHistory(container);
        }

        container.innerHTML = `
            <div class="minecraft-page donate-page-wrap">
                <h1 class="donate-page-title">Donation Ranks</h1>
                <p class="donate-page-sub">Purchase rank time to unlock exclusive perks!</p>
                <p class="donate-page-note" style="text-align:center;font-size:0.78rem;color:var(--text-muted);margin-top:-1.5rem;margin-bottom:1.5rem;max-width:600px;margin-left:auto;margin-right:auto;">All rank purchases are <strong style="color:var(--neon-cyan)">one-time payments</strong> — not subscriptions. Extend or switch ranks anytime.</p>
                <div id="donate-rank-dashboard"></div>
                <div id="donate-ranks-area"><div class="loading-spinner" style="text-align:center;padding:3rem">Loading ranks...</div></div>
                <div class="donate-onetimebox">
                    <div class="donate-onetime-header">
                        <span class="donate-onetime-icon">&#128157;</span>
                        <div>
                            <div class="donate-onetime-title">Custom Amount</div>
                            <div class="donate-onetime-sub">Choose any amount to support the server</div>
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
                        <input type="text" id="donate-onetime-mc-username" class="input-field" placeholder="Your Minecraft username" maxlength="16" style="max-width:280px">
                        <small style="display:block;margin-top:4px;font-size:0.72rem;color:var(--text-muted)">Used for your avatar in the donations list</small>
                        <label style="font-size:0.82rem;color:var(--text-secondary);display:flex;align-items:center;gap:6px;margin-top:14px;margin-bottom:6px">
                            Email
                            <span style="font-size:0.68rem;font-weight:700;background:rgba(99,102,241,0.18);color:#818cf8;border:1px solid rgba(99,102,241,0.35);border-radius:4px;padding:1px 6px;letter-spacing:.03em">Recommended</span>
                            <span title="If you later register an account with this email, your donation history and any credits will automatically be linked to your profile." style="cursor:help;color:var(--text-muted);font-size:0.85rem;line-height:1">ℹ</span>
                        </label>
                        <input type="email" id="donate-guest-email" class="input-field" placeholder="your@email.com" style="max-width:280px">
                        <small style="display:block;margin-top:4px;font-size:0.72rem;color:var(--text-muted)">Optional — used to send your receipt and link donations if you register later</small>
                    </div>
                    <button class="donate-onetime-btn" id="donate-onetime-submit" onclick="DonationsPage.submitOneTime()">Continue</button>
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
        this.loadCryptoStatus(); // async, non-blocking — populates this._cryptoStatus
        this.loadUserBalance();  // async, non-blocking — populates this._userBalance
        this.loadCheckoutConfig(); // async, non-blocking — populates this._checkoutConfig

        if (!App.currentUser) {
            const gw = document.getElementById('donate-onetime-guest-mc');
            if (gw) gw.style.display = 'block';
        }
    },

    // ── Receipt screen — shown after Stripe redirects back with ?status=success ──
    async renderReceipt(container, sessionId) {
        container.innerHTML = `
            <div class="minecraft-page donate-page-wrap" style="max-width:560px;margin:0 auto">
                <div id="donate-receipt-area" style="text-align:center;padding:3rem 1rem">
                    <div class="loading-spinner" style="margin:0 auto 1rem"></div>
                    <p style="color:var(--text-muted)">Confirming your payment...</p>
                </div>
            </div>`;

        const area = document.getElementById('donate-receipt-area');
        try {
            const result = await API.post('/api/donations/verify-session', { session_id: sessionId });
            if (!result.success) {
                area.innerHTML = `
                    <div style="color:var(--neon-magenta);font-size:2rem;margin-bottom:1rem">&#9888;</div>
                    <h2 style="margin-bottom:.5rem">Payment Pending</h2>
                    <p style="color:var(--text-muted);margin-bottom:1.5rem">Your payment is being processed. Check back shortly or contact support.</p>
                    <a href="/donate" class="donate-rank-btn" style="display:inline-block;text-decoration:none">Back to Donations</a>`;
                return;
            }

            const r = result.receipt || {};
            const expiryStr = r.expires_at
                ? new Date(r.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : null;
            const rankColor = r.rank_color || 'var(--neon-cyan)';
            const rankBlock = r.rank_name ? `
                <div style="background:${App.escapeHtml(rankColor)}18;border:1px solid ${App.escapeHtml(rankColor)}55;border-radius:10px;padding:16px 20px;margin:16px 0;display:flex;align-items:center;gap:14px">
                    <span style="font-size:2rem">${r.rank_icon || '&#11088;'}</span>
                    <div style="text-align:left">
                        <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Rank Granted</div>
                        <div style="font-size:1.2rem;font-weight:700;color:${App.escapeHtml(rankColor)}">${App.escapeHtml(r.rank_name)}</div>
                        ${expiryStr ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">Active for 30 days &mdash; expires ${expiryStr}</div>` : ''}
                    </div>
                </div>` : '';
            const amountStr = r.amount != null ? `$${parseFloat(r.amount).toFixed(2)}` : '';

            area.innerHTML = `
                <div style="font-size:3.5rem;margin-bottom:.5rem;line-height:1">&#10003;</div>
                <h1 style="margin-bottom:.3rem;color:var(--neon-cyan)">Thank You!</h1>
                <p style="color:var(--text-muted);margin-bottom:1.5rem">Your donation of <strong style="color:var(--text-primary)">${amountStr}</strong> has been received.</p>
                ${rankBlock}
                <div style="background:var(--bg-tertiary);border-radius:8px;padding:12px 16px;margin:16px 0;text-align:left;font-size:0.82rem;color:var(--text-muted)">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span>Reference</span><strong style="color:var(--text-primary);font-family:monospace">${App.escapeHtml(r.ref || '—')}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between">
                        <span>Date</span><strong style="color:var(--text-primary)">${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}</strong>
                    </div>
                    ${r.minecraft_username ? `<div style="display:flex;justify-content:space-between;margin-top:4px"><span>Minecraft</span><strong style="color:var(--text-primary)">${App.escapeHtml(r.minecraft_username)}</strong></div>` : ''}
                </div>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:1.5rem">A receipt has been sent to your email if one is on file.</p>
                <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                    <a href="/donate" class="donate-rank-btn" style="display:inline-block;text-decoration:none">Back to Donations</a>
                    ${App.currentUser ? '<a href="/donate?tab=history" class="donate-rank-btn" style="display:inline-block;text-decoration:none;background:var(--bg-tertiary);color:var(--text-primary)">View Transactions</a>' : ''}
                </div>`;
        } catch {
            area.innerHTML = `
                <div style="color:var(--text-muted);font-size:2rem;margin-bottom:1rem">&#128338;</div>
                <h2 style="margin-bottom:.5rem">Verifying Payment</h2>
                <p style="color:var(--text-muted);margin-bottom:1.5rem">Your payment is being verified. If you paid successfully, your rank will be granted shortly.</p>
                <a href="/donate" class="donate-rank-btn" style="display:inline-block;text-decoration:none">Back to Donations</a>`;
        }
    },

    // ── Transaction history — linked from profile dropdown ──
    async renderHistory(container) {
        if (!App.currentUser) {
            container.innerHTML = `<div class="minecraft-page donate-page-wrap" style="max-width:700px;margin:0 auto;text-align:center;padding:3rem 1rem">
                <p style="color:var(--text-muted)">Please log in to view your transaction history.</p>
                <a href="/donate" class="donate-rank-btn" style="display:inline-block;text-decoration:none;margin-top:1rem">Back to Donations</a>
            </div>`;
            return;
        }

        container.innerHTML = `
            <div class="minecraft-page donate-page-wrap" style="max-width:760px;margin:0 auto">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.5rem">
                    <a href="/donate" style="color:var(--text-muted);text-decoration:none;font-size:0.85rem;display:flex;align-items:center;gap:5px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        Donations
                    </a>
                    <span style="color:var(--text-muted)">/</span>
                    <h2 style="margin:0;font-size:1.2rem">My Transactions</h2>
                </div>
                <div id="donate-history-area"><div class="loading-spinner" style="text-align:center;padding:2rem"></div></div>
            </div>`;

        const area = document.getElementById('donate-history-area');
        try {
            const { donations, conversions } = await API.get('/api/donations/my-history');

            if (!donations.length && !conversions.length) {
                area.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem">No transactions yet.</p>';
                return;
            }

            let html = '';
            if (donations.length) {
                html += '<h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:.75rem">Donations</h3>';
                html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1.5rem">';
                for (const d of donations) {
                    const statusColor = d.status === 'completed' ? 'var(--neon-cyan)' : d.status === 'pending' ? '#f5a623' : 'var(--neon-magenta)';
                    const rankPart = d.rank_name
                        ? `<span style="color:${App.escapeHtml(d.rank_color || '#aaa')};font-weight:600">${App.escapeHtml(d.rank_icon || '')} ${App.escapeHtml(d.rank_name)}</span>`
                        : '<span style="color:var(--text-muted)">Custom Donation</span>';
                    html += `<div style="background:var(--bg-secondary);border-radius:10px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                        <div>
                            <div style="font-size:0.95rem">${rankPart}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${new Date(d.created_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})} &bull; <code style="font-size:0.7rem">${App.escapeHtml(d.id.slice(0,8).toUpperCase())}</code></div>
                        </div>
                        <div style="display:flex;align-items:center;gap:14px">
                            <strong style="font-size:1rem">$${parseFloat(d.amount).toFixed(2)}</strong>
                            <span style="font-size:0.72rem;font-weight:600;text-transform:uppercase;color:${statusColor};background:${statusColor}22;padding:2px 8px;border-radius:20px">${App.escapeHtml(d.status)}</span>
                        </div>
                    </div>`;
                }
                html += '</div>';
            }

            if (conversions.length) {
                html += '<h3 style="font-size:0.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:.75rem">Rank Conversions</h3>';
                html += '<div style="display:flex;flex-direction:column;gap:8px">';
                for (const c of conversions) {
                    html += `<div style="background:var(--bg-secondary);border-radius:10px;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                        <div>
                            <div style="font-size:0.9rem">
                                <span style="color:${App.escapeHtml(c.from_rank_color || '#aaa')}">${App.escapeHtml(c.from_rank_name || '?')}</span>
                                <span style="color:var(--text-muted);margin:0 6px">&rarr;</span>
                                <span style="color:${App.escapeHtml(c.to_rank_color || '#aaa')}">${App.escapeHtml(c.to_rank_name || '?')}</span>
                            </div>
                            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${new Date(c.converted_at).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}</div>
                        </div>
                        <span style="font-size:0.8rem;color:var(--text-muted)">${c.days_converted || 0} days converted</span>
                    </div>`;
                }
                html += '</div>';
            }

            area.innerHTML = html;
        } catch {
            area.innerHTML = '<p style="text-align:center;color:var(--neon-magenta);padding:2rem">Failed to load transaction history.</p>';
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
            const [rank, balance] = await Promise.all([
                API.get('/api/donations/my-rank'),
                API.get('/api/donations/crypto/balance').catch(() => ({ usd_balance: 0 }))
            ]);
            this.currentRank = rank;
            const usdBalance = parseFloat(balance?.usd_balance) || 0;
            const balanceColor = usdBalance > 0 ? '#10b981' : 'var(--text-muted)';
            const balanceHtml = '<div class="donate-dashboard-balance" style="text-align:right;margin-left:auto;padding-left:1rem;">' +
                    '<div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px">Credit Balance</div>' +
                    '<div style="font-size:1.25rem;font-weight:800;color:' + balanceColor + ';line-height:1.2">$' + usdBalance.toFixed(2) + '</div>' +
                    '<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px">' + (usdBalance > 0 ? 'Use at checkout' : 'Add funds to spend') + '</div>' +
                  '</div>';
            if (!rank || !rank.active || !rank.rank_name) {
                area.innerHTML =
                    '<div class="donate-dashboard" style="--rank-accent:var(--text-muted)">' +
                        '<div class="donate-dashboard-left">' +
                            '<div class="donate-dashboard-badge" style="opacity:0.6">&#128274;</div>' +
                            '<div class="donate-dashboard-info">' +
                                '<div class="donate-dashboard-label">Current Rank</div>' +
                                '<div class="donate-dashboard-name" style="color:var(--text-muted)">No Active Rank</div>' +
                                '<div class="donate-dashboard-time">0 days remaining</div>' +
                                '<div class="donate-dashboard-bar-wrap"><div class="donate-dashboard-bar" style="width:0%;background:var(--text-muted)"></div></div>' +
                            '</div>' +
                        '</div>' +
                        balanceHtml +
                    '</div>';
                return;
            }
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
                    balanceHtml +
                '</div>';
        } catch { area.innerHTML = ''; }
    },

    async loadRanks() {
        const area = document.getElementById('donate-ranks-area');
        if (!area) return;
        try {
            const ranks = await API.get('/api/donations/ranks');
            this.allRanks = ranks;
            if (!ranks.length) { area.innerHTML = '<p style="text-align:center;color:var(--text-muted)">No ranks available yet.</p>'; return; }
            let html = '<div class="donate-ranks-grid">';
            for (const rank of ranks) {
                const isCurrent = this.currentRank && this.currentRank.rank_id === rank.id && this.currentRank.active;
                const perks = Array.isArray(rank.perks) ? rank.perks : [];
                html += '<div class="donate-rank-card" style="--rank-accent:' + App.escapeHtml(rank.color) + ';--rank-glow:' + App.escapeHtml(rank.color) + '33">' +
                    '<div class="donate-rank-icon">' + (rank.icon || '&#11088;') + '</div>' +
                    '<div class="donate-rank-name">' + App.escapeHtml(rank.name) + '</div>' +
                    '<div class="donate-rank-price">$' + rank.price.toFixed(2) + '<span>/30 days</span></div>' +
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
            return '<button class="donate-rank-btn switch-btn" onclick="DonationsPage.showFreeSwitchConfirm(\'' + rank.id + '\',\'' + App.escapeHtml(rank.name) + '\',' + rank.price + ')">&#8644; Switch Plan</button>';
        }
        return '<button class="donate-rank-btn" onclick="DonationsPage.purchase(\'' + rank.id + '\',this)">Purchase</button>';
    },

    async purchase(rankId, btn) {
        const cs = this._cryptoStatus;
        const hasStripe = cs?.stripe_enabled;
        const hasCoins  = cs?.crypto_enabled && cs?.coins?.length;
        const hasBalance = App.currentUser && this._userBalance > 0;
        // Show picker if any payment option or balance credit is available
        if (hasStripe || hasCoins || hasBalance) {
            return this._showPaymentPicker(rankId, null, btn);
        }
        // No payment methods configured
        App.showToast('No payment methods are currently configured. Contact an administrator.', 'warning');
    },

    /** Free plan switch — converts remaining days at prorated value, no payment. */
    showFreeSwitchConfirm(rankId, rankName, rankPrice) {
        if (!this.currentRank || !this.currentRank.active) return;
        const daysLeft    = this.currentRank.expires_at
            ? Math.max(0, Math.ceil((new Date(this.currentRank.expires_at) - Date.now()) / 86400000)) : 0;
        const oldPrice    = this.currentRank.rank_price || 0;
        const convertedDays = rankPrice > 0 ? Math.floor((daysLeft * (oldPrice / 30)) / (rankPrice / 30)) : daysLeft;
        const isDowngrade = rankPrice < oldPrice;
        const fromColor   = App.escapeHtml(this.currentRank.rank_color || 'var(--text-muted)');
        const toColor     = 'var(--neon-cyan)';

        // Value summary line
        const valueNote = isDowngrade
            ? `Switching to a cheaper plan gives you <strong style="color:var(--neon-cyan)">${convertedDays} days</strong> on ${App.escapeHtml(rankName)} in exchange for your ${daysLeft} remaining days.`
            : `Your ${daysLeft} days of value convert to <strong style="color:var(--neon-cyan)">${convertedDays} days</strong> on the pricier ${App.escapeHtml(rankName)} plan.`;

        App.showModal('Switch Plan — No Charge', `
            <div class="donate-switch-modal-body">
                <p class="donate-modal-desc">
                    Switching from <strong style="color:${fromColor}">${App.escapeHtml(this.currentRank.rank_name)}</strong>
                    to <strong style="color:${toColor}">${App.escapeHtml(rankName)}</strong> —
                    your remaining time is converted at its prorated value. <strong>No payment required.</strong>
                </p>
                <div class="donate-switch-summary">
                    <div class="donate-switch-summary-row">
                        <span>Current plan</span>
                        <strong style="color:${fromColor}">${App.escapeHtml(this.currentRank.rank_name)} ($${oldPrice.toFixed(2)}/mo)</strong>
                    </div>
                    <div class="donate-switch-summary-row">
                        <span>Remaining days</span>
                        <strong>${daysLeft} days</strong>
                    </div>
                    <div class="donate-switch-summary-row">
                        <span>Prorated value</span>
                        <strong>$${((daysLeft * oldPrice) / 30).toFixed(2)}</strong>
                    </div>
                    <div class="donate-switch-summary-row">
                        <span>New plan</span>
                        <strong style="color:${toColor}">${App.escapeHtml(rankName)} ($${rankPrice.toFixed(2)}/mo)</strong>
                    </div>
                    <div class="donate-switch-summary-row total">
                        <span>Days on new plan</span>
                        <strong style="color:${toColor}">${convertedDays} days</strong>
                    </div>
                </div>
                <p style="font-size:0.78rem;color:var(--text-muted);margin-top:12px">${valueNote}</p>
                <div style="display:flex;gap:10px;margin-top:20px">
                    <button class="donate-rank-btn" style="flex:1"
                        onclick="DonationsPage._doFreeSwitch('${rankId}',this)">Confirm Switch</button>
                    <button class="donate-rank-btn donate-rank-btn--locked" style="flex:1;cursor:pointer;opacity:1"
                        onclick="App.closeModal()">Cancel</button>
                </div>
            </div>`);
    },

    async _doFreeSwitch(rankId, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Switching...'; }
        try {
            const result = await API.post('/api/donations/convert-rank', { new_rank_id: rankId });
            App.closeModal();
            App.showToast(`Switched to ${result.to_rank} — ${result.new_days} days granted!`, 'success');
            this.currentRank = null; // force refresh
            await this.loadCurrentRank();
            this.loadRanks();
        } catch (err) {
            App.showToast(err.message || 'Switch failed', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'Confirm Switch'; }
        }
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
                await API.post('/api/donations/convert-rank', { new_rank_id: rankId });
            }
            const result = await API.post('/api/donations/checkout', { rank_id: rankId });
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
        let mcUsername = '', guestEmail = '';
        if (isGuest) {
            const mcInput = document.getElementById('donate-onetime-mc-username');
            mcUsername = mcInput ? mcInput.value.trim() : '';
            if (!mcUsername) { App.showToast('Please enter your Minecraft username', 'warning'); return; }
            guestEmail = (document.getElementById('donate-guest-email')?.value || '').trim();
        }
        // Show payment picker if any method is available
        const cs = this._cryptoStatus;
        if (cs?.stripe_enabled || (cs?.crypto_enabled && cs?.coins?.length)) {
            return this._showPaymentPicker(null, amount, null, mcUsername, guestEmail);
        }
        const btn = document.getElementById('donate-onetime-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Processing...'; }
        try {
            const payload = { amount };
            if (isGuest) { payload.mc_username = mcUsername; if (guestEmail) payload.guest_email = guestEmail; }
            const result = await API.post('/api/donations/custom-checkout', payload);
            if (result.url) { window.location.href = result.url; return; }
            App.showToast('Could not create checkout session', 'error');
        } catch (err) { App.showToast(err.message || 'Payment error', 'error'); }
        if (btn) { btn.disabled = false; btn.textContent = 'Continue'; }
    },


    async loadRecent() {
        const area = document.getElementById('donate-recent-area');
        if (!area) return;
        try {
            const donations = await API.get('/api/donations/recent?limit=8');
            if (!donations.length) { area.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:1rem">No donations yet. Be the first!</p>'; return; }
            let html = '<div class="donate-recent-list">';
            for (const d of donations) {
                // Registered users: always use their site profile picture.
                // MC-Heads is only for guests who provided a Minecraft username.
                let avatarHtml = '';
                if (d.avatar) {
                    avatarHtml = '<img class="donate-recent-avatar" src="' + App.escapeHtml(d.avatar) + '" alt="">';
                } else if (d.minecraft_uuid) {
                    avatarHtml = '<img class="donate-recent-avatar" src="https://mc-heads.net/avatar/' + App.escapeHtml(d.minecraft_uuid) + '/40" alt="">';
                } else if (d.mc_username) {
                    avatarHtml = '<img class="donate-recent-avatar" src="https://mc-heads.net/avatar/' + encodeURIComponent(d.mc_username) + '/40" alt="">';
                } else {
                    const initial = App.escapeHtml((d.username || '?').charAt(0).toUpperCase());
                    avatarHtml = '<div class="avatar-placeholder donate-recent-avatar" style="font-size:1.2rem; flex-shrink:0;">' + initial + '</div>';
                }

                html += '<div class="donate-recent-item">' +
                    avatarHtml +
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
    },

    // ── Crypto payment support ──

    _cryptoStatus: null,
    _userBalance: 0,

    async loadCryptoStatus() {
        try {
            this._cryptoStatus = await API.get('/api/donations/crypto/provider-public-status');
        } catch {
            this._cryptoStatus = { crypto_enabled: false };
        }
    },

    async loadUserBalance() {
        if (!App.currentUser) { this._userBalance = 0; return; }
        try {
            const b = await API.get('/api/donations/crypto/balance');
            this._userBalance = parseFloat(b?.usd_balance) || 0;
        } catch {
            this._userBalance = 0;
        }
    },

    async loadCheckoutConfig() {
        try {
            this._checkoutConfig = await API.get('/api/donations/checkout-config');
        } catch {
            this._checkoutConfig = { stripe_enabled: false, checkout_mode: 'stripe_checkout', stripe_publishable_key: '' };
        }
    },

    isCustomCheckoutEnabled() {
        const hasKey = !!(this._checkoutConfig?.stripe_publishable_key?.startsWith('pk_'));
        return this._checkoutConfig?.stripe_enabled && this._checkoutConfig?.checkout_mode === 'custom_checkout' && hasKey;
    },

    async loadStripeJs() {
        if (window.Stripe) return window.Stripe;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = () => resolve(window.Stripe);
            script.onerror = () => reject(new Error('Failed to load Stripe.js'));
            document.head.appendChild(script);
        });
    },

    /** Display names and icons for known coin tickers */
    _COIN_META: {
        btc:  { name: 'Bitcoin',      icon: '₿',  color: '#f7931a' },
        eth:  { name: 'Ethereum',     icon: 'Ξ',  color: '#627eea' },
        sol:  { name: 'Solana',       icon: '◎',  color: '#14f195' },
        ltc:  { name: 'Litecoin',     icon: 'Ł',  color: '#345d9d' },
        bnb:  { name: 'BNB',          icon: '⬡',  color: '#f3ba2f' },
        usdt: { name: 'Tether (USDT)',icon: '₮',  color: '#26a17b' },
        usdc: { name: 'USD Coin',     icon: '$',  color: '#2775ca' },
        trx:  { name: 'TRON',         icon: '◈',  color: '#e50915' },
        doge: { name: 'Dogecoin',     icon: 'Ð',  color: '#c3a634' },
        bch:  { name: 'Bitcoin Cash', icon: 'Ƀ',  color: '#8dc351' },
        xmr:  { name: 'Monero',       icon: 'ɱ',  color: '#ff6600' },
        ada:  { name: 'Cardano',      icon: '₳',  color: '#0033ad' },
        dot:  { name: 'Polkadot',     icon: '●',  color: '#e6007a' },
        matic:{ name: 'Polygon',      icon: '⬡',  color: '#8247e5' },
        dash: { name: 'Dash',         icon: 'Đ',  color: '#008ce7' },
        xrp:  { name: 'XRP',          icon: '✕',  color: '#346aa9' },
    },

    /**
     * Show a flat payment method picker: balance section + Card (Stripe) + one button per active coin.
     * @param {string|null} rankId
     * @param {number|null} amount
     * @param {HTMLElement|null} btn
     * @param {string} [mcUsername]
     * @param {string} [prefillEmail]  — pre-fills guest email input (from one-time section)
     */
    _showPaymentPicker(rankId, amount, btn, mcUsername, prefillEmail) {
        const cs = this._cryptoStatus || {};
        const coins = cs.coins || [];
        const balance = this._userBalance || 0;
        const safeRank   = rankId   ? `'${rankId}'` : 'null';
        const safeAmt    = amount   != null ? amount : 'null';
        const safeMcUser = mcUsername ? App.escapeHtml(mcUsername) : '';
        const safeEmail  = prefillEmail ? App.escapeHtml(prefillEmail) : '';

        // Determine the price for balance math — rank lookup or custom amount
        const rankPrice = rankId
            ? (this.allRanks.find(r => r.id === rankId)?.price ?? null)
            : amount;

        // ── Balance section ──
        let balanceSection = '';
        if (App.currentUser && balance > 0 && rankPrice != null) {
            const canCover = balance >= rankPrice;
            if (canCover) {
                balanceSection = `
                    <div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:14px 16px;margin-bottom:14px">
                        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                            <span style="font-size:1.3rem">💰</span>
                            <div>
                                <div style="font-weight:700;color:#10b981;font-size:0.9rem">Credit Balance Available</div>
                                <div style="font-size:0.76rem;color:var(--text-muted)">Your balance of <strong style="color:#10b981">$${balance.toFixed(2)}</strong> covers this purchase</div>
                            </div>
                        </div>
                        <button class="mc-btn" style="width:100%;background:rgba(16,185,129,0.15);border-color:rgba(16,185,129,0.4);color:#10b981;padding:10px;font-weight:700"
                            onclick="App.closeModal?.();DonationsPage._pickBalanceFree(${safeRank})">
                            ✓ Complete for Free — use $${Math.min(balance, rankPrice).toFixed(2)} credit
                        </button>
                    </div>`;
            } else {
                // Partial — keep at least $0.50 for Stripe minimum
                const cappedApply = parseFloat(Math.min(balance, rankPrice - 0.50).toFixed(2));
                const remainder   = parseFloat(Math.max(rankPrice - cappedApply, 0.50).toFixed(2));
                balanceSection = `
                    <div style="background:rgba(251,191,36,0.07);border:1px solid rgba(251,191,36,0.25);border-radius:10px;padding:14px 16px;margin-bottom:14px">
                        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer">
                            <input type="checkbox" id="ppm-apply-balance" data-apply="${cappedApply}" data-price="${rankPrice}"
                                style="margin-top:3px;accent-color:#f59e0b"
                                onchange="DonationsPage._onBalanceToggle(this)">
                            <div>
                                <div style="font-weight:700;color:#f59e0b;font-size:0.88rem">Apply $${cappedApply.toFixed(2)} credit balance</div>
                                <div style="font-size:0.76rem;color:var(--text-muted)">Reduces payment to <span id="ppm-remainder">$${remainder.toFixed(2)}</span></div>
                            </div>
                        </label>
                    </div>`;
            }
        }

        const stripeBtn = cs.stripe_enabled ? `
            <button class="mc-btn ppm-option" style="background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.3);color:#818cf8"
                onclick="App.closeModal?.();DonationsPage._pickStripe(${safeRank},${safeAmt},DonationsPage._getBalanceApply())">
                <span class="ppm-icon">💳</span>
                <span class="ppm-label">Credit / Debit Card</span>
                <span class="ppm-sub" id="ppm-stripe-sub">Powered by Stripe</span>
            </button>` : '';

        const safeBalanceApply = 'DonationsPage._getBalanceApply()';
        const coinBtns = coins.map(c => {
            const m = this._COIN_META[c] || { name: c.toUpperCase(), icon: '◈', color: '#888' };
            return `<button class="mc-btn ppm-option" style="background:${m.color}12;border-color:${m.color}44;color:${m.color}"
                onclick="App.closeModal?.();DonationsPage.startCryptoCheckout(${safeRank},${safeAmt},'${c}','${safeMcUser}',${safeBalanceApply})">
                <span class="ppm-icon" style="font-size:1.4rem">${m.icon}</span>
                <span class="ppm-label">${App.escapeHtml(m.name)}</span>
                <span class="ppm-sub">${c.toUpperCase()}</span>
            </button>`;
        }).join('');

        const hasPaymentMethods = cs.stripe_enabled || coins.length > 0;

        // Guest email section — shown for guests only (not logged-in users)
        const guestEmailSection = !App.currentUser ? `
            <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.2);border-radius:10px;padding:14px 16px;margin-bottom:14px">
                <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;color:var(--text-secondary);margin-bottom:8px">
                    Email
                    <span style="font-size:0.66rem;font-weight:700;background:rgba(99,102,241,0.2);color:#818cf8;border:1px solid rgba(99,102,241,0.4);border-radius:4px;padding:1px 6px;letter-spacing:.03em">Recommended</span>
                    <span title="If you register an account later using this email, your donation history and any credits will automatically be transferred to your profile." style="cursor:help;color:var(--text-muted);font-size:0.9rem;line-height:1">ℹ</span>
                </label>
                <input type="email" id="ppm-guest-email" class="input-field" placeholder="your@email.com" value="${safeEmail}"
                    style="width:100%;box-sizing:border-box;font-size:0.85rem">
                <small style="display:block;margin-top:6px;font-size:0.7rem;color:var(--text-muted)">
                    Optional — we'll send your receipt here and link this purchase if you register later.
                </small>
            </div>` : '';

        App.showModal('Choose Payment Method', `
            <style>
                .ppm-option{display:flex;flex-direction:column;align-items:center;gap:5px;padding:14px 10px;height:auto;width:100%;text-align:center}
                .ppm-icon{font-size:1.6rem;line-height:1}
                .ppm-label{font-weight:700;font-size:0.9rem}
                .ppm-sub{font-size:0.7rem;color:var(--text-muted);font-weight:400}
            </style>
            ${guestEmailSection}
            ${balanceSection}
            ${hasPaymentMethods ? `
            <p style="color:var(--text-muted);font-size:0.82rem;margin:0 0 14px">Select how you'd like to pay:</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">
                ${stripeBtn}${coinBtns}
            </div>` : (!balanceSection ? '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center">No payment methods are currently configured.</p>' : '')}
        `);
        if (btn) { btn.disabled = false; btn.textContent = 'Purchase'; }
    },

    /** Returns the balance amount to apply (0 if unchecked or not rendered). */
    _getBalanceApply() {
        const cb = document.getElementById('ppm-apply-balance');
        return (cb && cb.checked) ? parseFloat(cb.dataset.apply) || 0 : 0;
    },

    /** Called when apply-balance checkbox changes — updates the remainder display and Stripe sub. */
    _onBalanceToggle(cb) {
        const apply    = parseFloat(cb.dataset.apply) || 0;
        const price    = parseFloat(cb.dataset.price) || 0;
        const remainder = cb.checked ? Math.max(price - apply, 0.50) : price;
        const remEl = document.getElementById('ppm-remainder');
        if (remEl) remEl.textContent = `$${remainder.toFixed(2)}`;
        const sub = document.getElementById('ppm-stripe-sub');
        if (sub) sub.textContent = cb.checked ? `$${remainder.toFixed(2)} after credit` : 'Powered by Stripe';
    },

    /** Full balance spend — rank or custom amount fully covered, no payment needed. */
    async _pickBalanceFree(rankId, amount) {
        try {
            App.showToast('Applying balance…', 'info');
            const payload = {};
            if (rankId) payload.rank_id = rankId;
            else if (amount) payload.amount = amount;
            else return;

            const result = await API.post('/api/donations/crypto/balance/spend', payload);

            if (rankId) {
                App.showToast('Rank granted! Your balance has been deducted.', 'success');
            } else {
                App.showToast(`Donation of $${amount.toFixed(2)} completed! Your balance has been deducted.`, 'success');
            }

            this._userBalance = 0;
            await this.loadCurrentRank();
            this.loadRanks();
            await this.loadUserBalance();
        } catch (e) { App.showToast(e.message || 'Balance spend failed', 'error'); }
    },

    async _pickStripe(rankId, amount, balanceApply) {
        const guestEmail = !App.currentUser
            ? (document.getElementById('ppm-guest-email')?.value?.trim() || document.getElementById('donate-guest-email')?.value?.trim() || '')
            : '';
        try {
            const totalPrice = rankId ? (this.allRanks.find(r => r.id === rankId)?.price ?? 0) : (amount || 0);
            const totalApply = Math.min(balanceApply || 0, totalPrice);
            const remainder = totalPrice - totalApply;

            // If balance covers full amount, use balance spend instead
            if (remainder <= 0) {
                return this._pickBalanceFree(rankId, amount);
            }

            // Check if custom checkout is enabled
            if (!this._checkoutConfig) await this.loadCheckoutConfig();
            if (this.isCustomCheckoutEnabled()) {
                return this._showCustomCheckout(rankId, amount, balanceApply, guestEmail);
            }

            // Use standard Stripe Checkout redirect
            if (rankId) {
                const body = { rank_id: rankId };
                if (totalApply > 0) body.balance_apply = totalApply;
                if (guestEmail) body.guest_email = guestEmail;
                const r = await API.post('/api/donations/checkout', body);
                if (r?.url) window.location.href = r.url;
            } else {
                const body = { amount };
                if (totalApply > 0) body.balance_apply = totalApply;
                if (guestEmail) body.guest_email = guestEmail;
                const r = await API.post('/api/donations/custom-checkout', body);
                if (r?.url) window.location.href = r.url;
            }
        } catch (e) { App.showToast(e.message || 'Payment error', 'error'); }
    },

    // ══════════════════════════════════════════════════════
    // CUSTOM CHECKOUT FORM (Stripe Elements)
    // ══════════════════════════════════════════════════════
    async _showCustomCheckout(rankId, amount, balanceApply, guestEmail) {
        const rank = rankId ? this.allRanks.find(r => r.id === rankId) : null;
        const totalPrice = rank ? rank.price : (amount || 0);
        const totalApply = Math.min(balanceApply || 0, totalPrice);
        const chargedAmount = Math.max(totalPrice - totalApply, 0);
        const displayName = rank ? rank.name : 'Custom Donation';

        // Load Stripe.js if not already loaded
        try {
            const Stripe = await this.loadStripeJs();
            const pubKey = this._checkoutConfig?.stripe_publishable_key;
            if (!pubKey || !pubKey.startsWith('pk_')) {
                App.showToast('Stripe publishable key not configured. Please contact an administrator.', 'error');
                console.error('[Custom Checkout] Missing or invalid stripe_publishable_key:', pubKey);
                return;
            }
            this._stripe = Stripe(pubKey);
        } catch (err) {
            console.error('[Custom Checkout] Stripe init error:', err);
            App.showToast('Failed to load payment system: ' + (err.message || 'Stripe initialization failed'), 'error');
            return;
        }

        // Create payment intent
        let clientSecret, donationId;
        try {
            const body = { balance_apply: totalApply };
            if (rankId) body.rank_id = rankId;
            else if (amount) body.amount = amount;
            if (guestEmail) body.guest_email = guestEmail;
            if (!App.currentUser) {
                const mcUsername = document.getElementById('donate-onetime-mc-username')?.value?.trim()
                    || document.getElementById('ppm-guest-mc')?.value?.trim();
                if (mcUsername) body.mc_username = mcUsername;
            }

            const result = await API.post('/api/donations/create-payment-intent', body);
            clientSecret = result.clientSecret;
            donationId = result.donationId;
        } catch (err) {
            App.showToast(err.message || 'Failed to initialize payment', 'error');
            return;
        }

        // Show custom checkout modal
        const isGuest = !App.currentUser;
        App.showModal('Complete Payment', `
            <div class="donate-custom-checkout" id="custom-checkout-form">
                <div class="donate-checkout-amount">
                    <div class="donate-checkout-amount-label">Total to Pay</div>
                    <div class="donate-checkout-amount-value">$${chargedAmount.toFixed(2)}</div>
                    ${totalApply > 0 ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">$${totalApply.toFixed(2)} credit applied</div>` : ''}
                </div>

                <div class="donate-checkout-card">
                    <div class="donate-checkout-card-header">
                        <div class="donate-checkout-card-icon">💳</div>
                        <div>
                            <div class="donate-checkout-card-title">Card Information</div>
                            <div class="donate-checkout-card-subtitle">Secure payment powered by Stripe</div>
                        </div>
                    </div>

                    <div class="donate-checkout-error" id="checkout-error"></div>

                    <div class="donate-checkout-form-group">
                        <label class="donate-checkout-label">Card Number</label>
                        <div class="donate-checkout-stripe-element" id="card-number-element"></div>
                    </div>

                    <div class="donate-checkout-form-row">
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">Expiry Date</label>
                            <div class="donate-checkout-stripe-element" id="card-expiry-element"></div>
                        </div>
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">CVC</label>
                            <div class="donate-checkout-stripe-element" id="card-cvc-element"></div>
                        </div>
                    </div>
                </div>

                <div class="donate-checkout-card">
                    <div class="donate-checkout-card-header">
                        <div class="donate-checkout-card-icon">📍</div>
                        <div>
                            <div class="donate-checkout-card-title">Billing Address</div>
                            <div class="donate-checkout-card-subtitle">Required for card verification</div>
                        </div>
                    </div>

                    <div class="donate-checkout-form-row">
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">First Name</label>
                            <input type="text" class="donate-checkout-input" id="billing-first-name" placeholder="John">
                        </div>
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">Last Name</label>
                            <input type="text" class="donate-checkout-input" id="billing-last-name" placeholder="Doe">
                        </div>
                    </div>

                    <div class="donate-checkout-form-group">
                        <label class="donate-checkout-label">Street Address</label>
                        <input type="text" class="donate-checkout-input" id="billing-address" placeholder="123 Main St">
                    </div>

                    <div class="donate-checkout-form-row">
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">City</label>
                            <input type="text" class="donate-checkout-input" id="billing-city" placeholder="New York">
                        </div>
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">State</label>
                            <input type="text" class="donate-checkout-input" id="billing-state" placeholder="NY">
                        </div>
                    </div>

                    <div class="donate-checkout-form-row">
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">ZIP / Postal Code</label>
                            <input type="text" class="donate-checkout-input" id="billing-zip" placeholder="10001">
                        </div>
                        <div class="donate-checkout-form-group">
                            <label class="donate-checkout-label">Country</label>
                            <select class="donate-checkout-input" id="billing-country" style="cursor:pointer">
                                <option value="US">United States</option>
                                <option value="CA">Canada</option>
                                <option value="GB">United Kingdom</option>
                                <option value="AU">Australia</option>
                                <option value="DE">Germany</option>
                                <option value="FR">France</option>
                                <option value="IT">Italy</option>
                                <option value="ES">Spain</option>
                                <option value="BR">Brazil</option>
                                <option value="MX">Mexico</option>
                                <option value="JP">Japan</option>
                                <option value="KR">South Korea</option>
                                <option value="CN">China</option>
                                <option value="IN">India</option>
                                <option value="NL">Netherlands</option>
                                <option value="SE">Sweden</option>
                                <option value="NO">Norway</option>
                                <option value="DK">Denmark</option>
                                <option value="FI">Finland</option>
                                <option value="IE">Ireland</option>
                                <option value="AT">Austria</option>
                                <option value="BE">Belgium</option>
                                <option value="CH">Switzerland</option>
                                <option value="NZ">New Zealand</option>
                                <option value="SG">Singapore</option>
                                <option value="HK">Hong Kong</option>
                                <option value="TW">Taiwan</option>
                                <option value="AE">United Arab Emirates</option>
                                <option value="SA">Saudi Arabia</option>
                                <option value="ZA">South Africa</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button class="donate-checkout-submit" id="checkout-submit-btn" onclick="DonationsPage._submitCustomCheckout('${clientSecret}', '${donationId}')">
                    <span id="checkout-btn-text">🔒 Complete Payment — $${chargedAmount.toFixed(2)}</span>
                </button>
            </div>
        `);

        // Initialize Stripe Elements
        this._initStripeElements(clientSecret);
    },

    _initStripeElements(clientSecret) {
        if (!this._stripe) return;

        const elements = this._stripe.elements({
            clientSecret: clientSecret,
            appearance: {
                theme: 'night',
                variables: {
                    colorPrimary: '#00FFFF',
                    colorBackground: 'transparent',
                    colorText: '#E0E6ED',
                    colorDanger: '#ef4444',
                    borderRadius: '8px',
                },
            },
        });

        // Create individual card elements
        const cardNumber = elements.create('cardNumber', {
            placeholder: '0000 0000 0000 0000',
            style: {
                base: {
                    fontSize: '16px',
                    color: '#E0E6ED',
                    '::placeholder': { color: 'rgba(224, 230, 237, 0.4)' },
                },
            },
        });

        const cardExpiry = elements.create('cardExpiry', {
            style: {
                base: {
                    fontSize: '16px',
                    color: '#E0E6ED',
                    '::placeholder': { color: 'rgba(224, 230, 237, 0.4)' },
                },
            },
        });

        const cardCvc = elements.create('cardCvc', {
            placeholder: '123',
            style: {
                base: {
                    fontSize: '16px',
                    color: '#E0E6ED',
                    '::placeholder': { color: 'rgba(224, 230, 237, 0.4)' },
                },
            },
        });

        // Mount elements
        cardNumber.mount('#card-number-element');
        cardExpiry.mount('#card-expiry-element');
        cardCvc.mount('#card-cvc-element');

        // Store for submission
        this._stripeElements = { cardNumber, cardExpiry, cardCvc };

        // Handle errors
        cardNumber.on('change', (event) => {
            this._showCheckoutError(event.error?.message || '');
        });
    },

    _showCheckoutError(message) {
        const errorEl = document.getElementById('checkout-error');
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.toggle('visible', !!message);
        }
    },

    async _submitCustomCheckout(clientSecret, donationId) {
        const btn = document.getElementById('checkout-submit-btn');
        const btnText = document.getElementById('checkout-btn-text');

        // Validate billing address
        const firstName = document.getElementById('billing-first-name')?.value?.trim();
        const lastName = document.getElementById('billing-last-name')?.value?.trim();
        const address = document.getElementById('billing-address')?.value?.trim();
        const city = document.getElementById('billing-city')?.value?.trim();
        const state = document.getElementById('billing-state')?.value?.trim();
        const zip = document.getElementById('billing-zip')?.value?.trim();
        const country = document.getElementById('billing-country')?.value;

        if (!firstName || !lastName || !address || !city || !state || !zip) {
            this._showCheckoutError('Please fill in all billing address fields');
            return;
        }

        if (!this._stripe || !this._stripeElements) {
            this._showCheckoutError('Payment system not initialized');
            return;
        }

        // Show loading state
        btn.disabled = true;
        btn.classList.add('processing');
        btnText.innerHTML = '<span class="donate-checkout-spinner"></span> Processing...';

        try {
            const { error, paymentIntent } = await this._stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: this._stripeElements.cardNumber,
                    billing_details: {
                        name: `${firstName} ${lastName}`,
                        address: {
                            line1: address,
                            city: city,
                            state: state,
                            postal_code: zip,
                            country: country,
                        },
                    },
                },
            });

            if (error) {
                this._showCheckoutError(error.message);
                btn.disabled = false;
                btn.classList.remove('processing');
                btnText.textContent = '🔒 Complete Payment';
                return;
            }

            if (paymentIntent.status === 'succeeded') {
                // Confirm payment with server and grant rank
                try {
                    const confirmResult = await API.post('/api/donations/confirm-payment', {
                        payment_intent_id: paymentIntent.id,
                    });

                    if (confirmResult.success) {
                        App.closeModal();
                        // Show success receipt
                        this._showCheckoutSuccess(confirmResult.receipt);
                    } else {
                        this._showCheckoutError('Payment succeeded but confirmation failed. Please contact support.');
                    }
                } catch (err) {
                    this._showCheckoutError(err.message || 'Payment succeeded but confirmation failed. Please contact support.');
                }
            } else {
                this._showCheckoutError('Payment is processing. Please wait...');
            }
        } catch (err) {
            this._showCheckoutError(err.message || 'Payment failed. Please try again.');
            btn.disabled = false;
            btn.classList.remove('processing');
            btnText.textContent = '🔒 Complete Payment';
        }
    },

    _showCheckoutSuccess(receipt) {
        const rankColor = receipt?.rank_color || 'var(--neon-cyan)';
        const rankName = receipt?.rank_name;
        const amount = receipt?.amount || 0;
        const ref = receipt?.ref || '—';

        const rankBlock = rankName ? `
            <div style="background:${rankColor}18;border:1px solid ${rankColor}55;border-radius:10px;padding:16px 20px;margin:16px 0;">
                <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em">Rank Granted</div>
                <div style="font-size:1.3rem;font-weight:700;color:${rankColor};margin-top:4px">${rankName}</div>
                ${receipt.expires_at ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Active for 30 days</div>` : ''}
            </div>
        ` : '';

        App.showModal('Payment Successful!', `
            <div class="donate-checkout-success">
                <div class="donate-checkout-success-icon">✅</div>
                <h2 style="color:var(--neon-green);margin-bottom:8px">Thank You!</h2>
                <p style="color:var(--text-muted);margin-bottom:16px">Your payment has been processed successfully.</p>

                ${rankBlock}

                <div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:14px 18px;margin-bottom:16px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                        <span style="color:var(--text-muted);font-size:0.85rem">Amount</span>
                        <span style="font-weight:700;color:var(--text-primary)">$${parseFloat(amount).toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between">
                        <span style="color:var(--text-muted);font-size:0.85rem">Reference</span>
                        <span style="font-family:monospace;color:var(--text-primary)">${ref}</span>
                    </div>
                </div>

                <button class="donate-rank-btn" onclick="App.closeModal();Router.go('/donate')" style="width:100%">
                    Continue
                </button>
            </div>
        `);

        // Refresh rank and balance
        this.loadCurrentRank();
        this.loadUserBalance();
    },

    async startCryptoCheckout(rankId, amount, coin, mcUsername, balanceApply) {
        const guestEmail = !App.currentUser
            ? (document.getElementById('ppm-guest-email')?.value?.trim() || document.getElementById('donate-guest-email')?.value?.trim() || '')
            : '';

        const totalPrice = rankId ? (this.allRanks.find(r => r.id === rankId)?.price ?? 0) : (amount || 0);
        const totalApply = Math.min(balanceApply || 0, totalPrice);
        const remainder = totalPrice - totalApply;

        // If balance covers full amount, use balance spend instead
        if (remainder <= 0) {
            return this._pickBalanceFree(rankId, amount);
        }

        App.showToast('Creating payment…', 'info');
        try {
            const payload = { coin };
            if (rankId)    payload.rank_id = rankId;
            if (amount)    payload.amount  = amount;
            if (mcUsername) payload.mc_username = mcUsername;
            if (guestEmail) payload.guest_email = guestEmail;
            if (totalApply > 0) payload.balance_apply = totalApply;

            const result = await API.post('/api/donations/crypto/intent', payload);

            if (result.checkout_url) {
                // Hosted provider — redirect to their checkout page
                window.location.href = result.checkout_url;
                return;
            }

            // Manual provider — show inline QR + address waiting screen
            this._showManualCryptoWaiting(result);
        } catch (err) {
            App.showToast(err.message || 'Failed to create crypto payment', 'error');
        }
    },

    _showManualCryptoWaiting(intent) {
        const coinLabel = intent.coin === 'sol' ? 'Solana' : 'Litecoin';
        const coinColor = intent.coin === 'sol' ? 'var(--neon-cyan)' : 'var(--neon-magenta)';
        const expires = intent.expires_at ? new Date(intent.expires_at).toLocaleString() : '—';

        App.showModal(`Pay with ${coinLabel}`, `
            <div style="display:grid;gap:16px;text-align:center">
                <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:16px">
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Send exactly</div>
                    <div style="font-size:1.6rem;font-weight:800;color:${coinColor};font-family:monospace">
                        ${intent.locked_crypto_amount} ${intent.coin?.toUpperCase()}
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">≈ $${parseFloat(intent.amount_usd||0).toFixed(2)} USD</div>
                </div>
                ${intent.qr_data_uri ? `<img src="${intent.qr_data_uri}" alt="QR code" style="width:180px;height:180px;margin:0 auto;border-radius:10px;background:#fff;padding:8px">` : ''}
                <div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">Send to address</div>
                    <div style="display:flex;align-items:center;gap:8px;justify-content:center;flex-wrap:wrap">
                        <code style="font-size:0.72rem;color:${coinColor};background:rgba(0,0,0,0.3);padding:6px 10px;border-radius:6px;word-break:break-all">${App.escapeHtml(intent.address||'')}</code>
                        <button class="mc-btn" style="padding:3px 8px;font-size:0.72rem"
                            onclick="navigator.clipboard.writeText('${App.escapeHtml(intent.address||'')}').then(()=>App.showToast('Copied!','success'))">Copy</button>
                    </div>
                </div>
                <div id="crypto-wait-status" style="font-size:0.82rem;color:var(--text-muted)">⏳ Waiting for payment… (expires ${App.escapeHtml(expires)})</div>
                <div style="font-size:0.72rem;color:var(--text-muted)">This page will update automatically when payment is detected.</div>
            </div>
        `);

        // Poll intent status every 5 seconds
        const intentId = intent.intent_id;
        const pollInterval = setInterval(async () => {
            try {
                const status = await API.get(`/api/donations/crypto/intent/${intentId}`);
                const el = document.getElementById('crypto-wait-status');
                if (status.status === 'completed') {
                    clearInterval(pollInterval);
                    if (el) el.innerHTML = '<span style="color:var(--neon-green);font-weight:700">✓ Payment confirmed!</span>';
                    setTimeout(() => {
                        App.closeModal?.();
                        Router.go(`/donate?status=crypto_success&intent=${intentId}`);
                    }, 1500);
                } else if (status.status === 'detected') {
                    if (el) el.innerHTML = '<span style="color:#eab308">⏳ Payment detected — waiting for confirmations…</span>';
                } else if (['expired','cancelled'].includes(status.status)) {
                    clearInterval(pollInterval);
                    if (el) el.innerHTML = '<span style="color:#ef4444">Payment expired or cancelled.</span>';
                }
            } catch { /* ignore poll errors */ }
        }, 5000);
    },

    async renderCryptoReceipt(container, intentId) {
        container.innerHTML = `
            <div class="minecraft-page donate-page-wrap" style="max-width:560px;margin:0 auto">
                <div id="donate-receipt-area" style="text-align:center;padding:3rem 1rem">
                    <div class="loading-spinner" style="margin:0 auto 1rem"></div>
                    <p style="color:var(--text-muted)">Confirming crypto payment…</p>
                </div>
            </div>`;

        const area = document.getElementById('donate-receipt-area');
        let attempts = 0;
        const maxAttempts = 20; // ~60s at 3s intervals

        const check = async () => {
            attempts++;
            try {
                const intent = await API.get(`/api/donations/crypto/intent/${intentId}`);
                if (intent.status === 'completed') {
                    area.innerHTML = `
                        <div style="text-align:center">
                            <div style="font-size:3rem;margin-bottom:1rem">✅</div>
                            <h2 style="color:var(--neon-green);margin-bottom:8px">Payment Confirmed!</h2>
                            <p style="color:var(--text-muted);font-size:0.9rem">
                                ${parseFloat(intent.confirmed_amount_crypto||0).toFixed(6)} ${(intent.coin||'').toUpperCase()} received
                            </p>
                            ${intent.rank ? `<p style="color:${App.escapeHtml(intent.rank?.color||'#fff')};font-weight:700;font-size:1.1rem;margin-top:12px">${App.escapeHtml(intent.rank?.name||'')} rank granted!</p>` : ''}
                            <button class="mc-btn" style="margin-top:20px" onclick="Router.go('/donate')">← Back to Donate</button>
                        </div>`;
                } else if (['expired','cancelled'].includes(intent.status)) {
                    area.innerHTML = `
                        <div style="text-align:center">
                            <div style="font-size:3rem;margin-bottom:1rem">❌</div>
                            <h2 style="color:#ef4444;margin-bottom:8px">Payment ${App.escapeHtml(intent.status)}</h2>
                            <p style="color:var(--text-muted);font-size:0.9rem">The payment was not received in time.</p>
                            <button class="mc-btn" style="margin-top:20px" onclick="Router.go('/donate')">← Try Again</button>
                        </div>`;
                } else if (attempts < maxAttempts) {
                    setTimeout(check, 3000);
                } else {
                    area.innerHTML = `
                        <div style="text-align:center">
                            <div style="font-size:3rem;margin-bottom:1rem">⏳</div>
                            <h2 style="color:#eab308;margin-bottom:8px">Payment Pending</h2>
                            <p style="color:var(--text-muted);font-size:0.9rem">Your payment was received but is still awaiting confirmations. Check back shortly.</p>
                            <button class="mc-btn" style="margin-top:20px" onclick="Router.go('/donate')">← Back to Donate</button>
                        </div>`;
                }
            } catch (err) {
                if (attempts < maxAttempts) setTimeout(check, 3000);
                else area.innerHTML = `<div style="color:#ef4444;padding:2rem">${App.escapeHtml(err.message||'Failed to load payment status')}</div>`;
            }
        };
        check();
    },
};