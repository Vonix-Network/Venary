/* =======================================
   Venary — Main Application Entry
   Supports dynamic extension loading
   ======================================= */
var App = {
    currentUser: null,
    extensions: [],

    async init() {
        // Fetch + apply site settings before anything else
        await this.applySettings();

        // Initialize particle engine
        ParticleEngine.init();

        // Register core routes
        Router.register('/login', function (c) { AuthPage.render(c, false); });
        Router.register('/register', function (c) { AuthPage.render(c, true); });
        Router.register('/feed', function (c) { FeedPage.render(c); });
        Router.register('/profile', function (c, p) { ProfilePage.render(c, p); });
        Router.register('/friends', function (c) { FriendsPage.render(c); });
        Router.register('/chat', function (c, p) { ChatPage.render(c, p); });
        Router.register('/admin', function (c) { AdminPage.render(c); });
        Router.register('/mod', function (c) { ModPage.render(c); });

        // Check auth
        if (API.token) {
            try {
                this.currentUser = await API.getMe();
                this.onLogin();
            } catch (e) {
                API.setToken(null);
            }
        }

        // Load extensions before initializing router
        await this.loadExtensions();

        // Init router
        Router.init();

        // Logout handler
        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function () { App.logout(); });
        }
    },

    // ===========================================
    // Site Settings & Theming
    // ===========================================
    async applySettings() {
        try {
            var s = await fetch('/api/settings').then(function (r) { return r.json(); });
            App.siteSettings = s;

            // Page title & description
            if (s.siteName) {
                document.title = s.siteName + (s.siteTagline ? ' \u2014 ' + s.siteTagline : '');
                var brandText = document.querySelector('.brand-text');
                if (brandText) brandText.textContent = s.siteName.toUpperCase();
            }
            if (s.siteDescription) {
                var meta = document.querySelector('meta[name="description"]');
                if (meta) meta.setAttribute('content', s.siteDescription);
            }

            // Favicon
            if (s.faviconUrl) {
                var fav = document.querySelector('link[rel="icon"]') || document.createElement('link');
                fav.rel = 'icon';
                fav.href = s.faviconUrl;
                document.head.appendChild(fav);
            }

            // CSS Custom Properties for theming
            var root = document.documentElement;
            if (s.primaryColor) {
                root.style.setProperty('--neon-cyan', s.primaryColor);
                root.style.setProperty('--primary', s.primaryColor);
            }
            if (s.accentColor) {
                root.style.setProperty('--neon-magenta', s.accentColor);
                root.style.setProperty('--accent', s.accentColor);
            }

            // Maintenance page
            if (s.maintenanceMode) {
                var token = localStorage.getItem('venary_token');
                // If no token at all, show maintenance immediately
                if (!token) {
                    App._showMaintenance(s.maintenanceMessage);
                    return;
                }
                // Validate token — if user is not admin, show maintenance
                try {
                    var me = await fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(function (r) { return r.json(); });
                    if (!me || me.role !== 'admin') {
                        App._showMaintenance(s.maintenanceMessage);
                    }
                } catch (_) {
                    App._showMaintenance(s.maintenanceMessage);
                }
            }
        } catch (e) {
            console.warn('Could not load site settings:', e);
        }
    },

    _showMaintenance(message) {
        var siteName = (App.siteSettings && App.siteSettings.siteName) || 'Venary';
        document.body.innerHTML = [
            '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0f;color:#e8e8f0;font-family:Inter,sans-serif;text-align:center;padding:40px">',
            '<div style="font-size:4rem;margin-bottom:24px">\ud83d\udd27</div>',
            '<h1 style="font-family:Orbitron,sans-serif;font-size:2rem;margin-bottom:12px;background:linear-gradient(135deg,var(--neon-cyan,#00d4ff),var(--neon-magenta,#7b2fff));-webkit-background-clip:text;-webkit-text-fill-color:transparent">' + siteName + '</h1>',
            '<p style="font-size:1.1rem;color:#a0a0b8;max-width:480px;line-height:1.6">' + (message || 'We are performing scheduled maintenance. Be right back!') + '</p>',
            '<p style="margin-top:32px;font-size:0.8rem;color:#555">If you are an admin, <a href="#/login" style="color:#00d4ff" onclick="location.reload()">log in</a> to access the platform.</p>',
            '</div>'
        ].join('');
    },

    // ===========================================
    // Extension Loading System
    // ===========================================
    async loadExtensions() {
        try {
            var extensions = await API.get('/api/extensions');
            this.extensions = extensions;

            var enabledExts = extensions.filter(function (e) { return e.enabled; });
            if (enabledExts.length === 0) return;

            // Load CSS files
            enabledExts.forEach(function (ext) {
                (ext.css || []).forEach(function (cssPath) {
                    var link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = cssPath;
                    document.head.appendChild(link);
                });
            });

            // Load JS page files and register routes
            var loadPromises = [];
            enabledExts.forEach(function (ext) {
                (ext.pages || []).forEach(function (page) {
                    loadPromises.push(App._loadScript(page, ext));
                });
            });
            await Promise.all(loadPromises);

            // Inject nav links
            this._injectNavLinks(enabledExts);

            console.log('🧩 Loaded ' + enabledExts.length + ' extension(s)');
        } catch (err) {
            console.warn('Extension loading skipped (not logged in or server error):', err.message || err);
        }
    },

    _loadScript(page, ext) {
        return new Promise(function (resolve) {
            var script = document.createElement('script');
            script.src = page.src;
            script.onload = function () {
                var globalName = page.global;
                if (!globalName) {
                    var idCap = ext.id.charAt(0).toUpperCase() + ext.id.slice(1);
                    globalName = idCap + 'Page';
                }

                // If it's a page with a route, register it
                if (page.route && window[globalName] && typeof window[globalName].render === 'function') {
                    Router.register(page.route, function (c, p) {
                        window[globalName].render(c, p);
                    });
                    console.log('  🔗 Route registered: ' + page.route + ' \u2192 ' + globalName);
                }
                // If it's a global hook (no route), just confirm it loaded
                else if (window[globalName]) {
                    console.log('  ⚓ Global hook loaded: ' + globalName);
                }
                else {
                    console.warn('  \u26a0\ufe0f Global "' + globalName + '" not found after loading ' + page.src);
                }
                resolve();
            };
            script.onerror = function () {
                console.error('Failed to load extension script:', page.src);
                resolve();
            };
            document.body.appendChild(script);
        });
    },

    _injectNavLinks(extensions) {
        var navContainer = document.getElementById('ext-nav-links');
        if (!navContainer) return;

        var html = '';
        var allNavItems = [];

        extensions.forEach(function (ext) {
            (ext.nav || []).forEach(function (nav) {
                allNavItems.push({ label: nav.label, route: nav.route, icon: nav.icon, position: nav.position || 99, extId: ext.id });
            });
        });

        // Sort by position
        allNavItems.sort(function (a, b) { return a.position - b.position; });

        allNavItems.forEach(function (nav) {
            var iconSvg = App._getNavIcon(nav.icon);
            var page = nav.route.replace('/', '');
            html += '<a href="#' + nav.route + '" class="nav-link" data-page="' + page + '" id="nav-' + nav.extId + '">' +
                iconSvg + '<span>' + nav.label + '</span></a>';
        });

        navContainer.innerHTML = html;
    },

    _getNavIcon(iconName) {
        var icons = {
            'message-square': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            'users': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'home': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
            'settings': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
            'shield': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            'grid': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
        };
        return icons[iconName] || icons['grid'];
    },

    // ===========================================
    // Auth & UI
    // ===========================================
    onLogin() {
        var nav = document.getElementById('main-nav');
        var page = document.getElementById('page-container');
        if (nav) nav.classList.remove('hidden');
        if (page) page.classList.remove('full-width');

        // Update nav avatar
        var navAvatar = document.getElementById('nav-avatar');
        if (navAvatar && this.currentUser) {
            if (this.currentUser.avatar) {
                navAvatar.innerHTML = '<img src="' + this.escapeHtml(this.currentUser.avatar) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block"><span class="status-dot online"></span>';
            } else {
                navAvatar.innerHTML = '<div class="avatar-placeholder">' + this.getInitials() + '</div><span class="status-dot online"></span>';
            }
        }

        // Show mod/admin buttons
        var modShieldBtn = document.getElementById('mod-shield-btn');
        if (modShieldBtn) modShieldBtn.classList.add('hidden');

        if (this.currentUser) {
            if (this.currentUser.role === 'admin' || this.currentUser.role === 'moderator') {
                if (modShieldBtn) modShieldBtn.classList.remove('hidden');
            }
        }

        // Connect socket
        if (API.token) {
            SocketClient.connect(API.token);
        }

        // Set up presence listeners
        SocketClient.on('new_message', function () { App.updateUnreadBadge(); });
        this.updateUnreadBadge();
        this.updateFriendRequestBadge();
    },

    logout() {
        API.setToken(null);
        this.currentUser = null;
        SocketClient.disconnect();

        var nav = document.getElementById('main-nav');
        var page = document.getElementById('page-container');
        if (nav) nav.classList.add('hidden');
        if (page) page.classList.add('full-width');

        window.location.hash = '#/login';
        this.showToast('Logged out successfully', 'info');
    },

    async updateUnreadBadge() {
        try {
            var conversations = await API.getConversations();
            var totalUnread = conversations.reduce(function (sum, c) { return sum + (c.unread_count || 0); }, 0);
            var badge = document.getElementById('unread-badge');
            if (badge) {
                if (totalUnread > 0) {
                    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (e) { /* ignore */ }
    },

    async updateFriendRequestBadge() {
        try {
            var data = await API.getFriendRequests();
            var badge = document.getElementById('friend-request-badge');
            if (badge) {
                if (data.incoming && data.incoming.length > 0) {
                    badge.textContent = data.incoming.length;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (e) { /* ignore */ }
    },

    // Utilities
    getInitials() {
        if (!this.currentUser) return '?';
        var name = this.currentUser.display_name || this.currentUser.username || '?';
        return name.charAt(0).toUpperCase();
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    parseBBCode(str) {
        if (!str) return '';
        var s = this.escapeHtml(str);

        // Simple BBCode replacements
        s = s.replace(/\[b\](.*?)\[\/b\]/gi, '<strong>$1</strong>');
        s = s.replace(/\[i\](.*?)\[\/i\]/gi, '<em>$1</em>');
        s = s.replace(/\[u\](.*?)\[\/u\]/gi, '<ins>$1</ins>');
        s = s.replace(/\[s\](.*?)\[\/s\]/gi, '<del>$1</del>');
        s = s.replace(/\[url\](.*?)\[\/url\]/gi, '<a href=\"$1\" target=\"_blank\">$1</a>');
        s = s.replace(/\[url=(.*?)\](.*?)\[\/url\]/gi, '<a href=\"$1\" target=\"_blank\">$2</a>');
        s = s.replace(/\[img\](.*?)\[\/img\]/gi, '<img src=\"$1\" style=\"max-width:100%\">');
        s = s.replace(/\[quote\](.*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>');
        s = s.replace(/\[code\](.*?)\[\/code\]/gi, '<pre><code>$1</code></pre>');
        s = s.replace(/\[color=(.*?)\](.*?)\[\/color\]/gi, '<span style=\"color:$1\">$2</span>');
        s = s.replace(/\[size=(.*?)\](.*?)\[\/size\]/gi, '<span style=\"font-size:$1px\">$2</span>');

        // Handle newlines
        s = s.replace(/\n/g, '<br>');

        return s;
    },

    renderContent(str, isSocial = false) {
        if (!str) return '';
        if (!isSocial) return this.parseBBCode(str);

        var s = this.escapeHtml(str);
        // Linkify URLs
        s = s.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="social-link">$1</a>');
        // Linkify Mentions
        s = s.replace(/@([a-zA-Z0-9_]+)/g, '<a href="#/profile/$1" class="mention social-tag">@$1</a>');
        // Linkify Hashtags
        s = s.replace(/#([a-zA-Z0-9_]+)/g, '<a href="#/search?q=%23$1" class="hashtag social-tag">#$1</a>');
        // Newlines
        s = s.replace(/\n/g, '<br>');
        return s;
    },

    timeAgo(date) {
        if (!date) return '';
        var now = new Date();
        var d = new Date(date);
        var seconds = Math.floor((now - d) / 1000);
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
        return d.toLocaleDateString();
    },

    showModal(title, content) {
        // Remove existing modal if any
        this.closeModal();

        var modalHtml = `
            <div class="modal-overlay" id="app-modal-overlay">
                <div class="modal animate-fade-up">
                    <div class="modal-header">
                        <div class="modal-title">${this.escapeHtml(title)}</div>
                        <button class="modal-close" onclick="App.closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">${content}</div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Close on overlay click
        const overlay = document.getElementById('app-modal-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'app-modal-overlay') this.closeModal();
        });
    },

    closeModal() {
        const modal = document.getElementById('app-modal-overlay');
        if (modal) modal.remove();
    },

    showToast(message, type) {
        type = type || 'info';
        var container = document.getElementById('toast-container');
        if (!container) return;
        var icons = { success: '✓', error: '✗', info: 'ℹ', warning: '⚠' };
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.innerHTML = '<span style="font-size:1.2rem">' + (icons[type] || '•') + '</span> ' + this.escapeHtml(message);
        container.appendChild(toast);
        setTimeout(function () {
            toast.classList.add('toast-exit');
            setTimeout(function () { toast.remove(); }, 300);
        }, 4000);
    },

    /**
     * Render a donation rank badge next to a username.
     * @param {Object} donationRank - { name, color, icon }
     * @returns {string} HTML string for the badge (empty string if no rank)
     */
    renderRankBadge(donationRank) {
        if (!donationRank || !donationRank.name) return '';
        var color = this.escapeHtml(donationRank.color || '#29b6f6');
        var name = this.escapeHtml(donationRank.name);
        var icon = donationRank.icon || '⭐';
        return '<span class="rank-badge-inline" style="color:' + color + ';border-color:' + color + '33;background:' + color + '12" title="' + name + ' Rank">' + icon + ' ' + name + '</span>';
    },

    handleShieldClick() {
        if (!this.currentUser) return;

        if (this.currentUser.role === 'admin') {
            App.showModal('🛡️ Access Dashboard',
                '<div style="display:flex;flex-direction:column;gap:var(--space-md)">' +
                '<button class="btn btn-primary" style="width:100%" onclick="App.closeModal(); window.location.hash=\'#/mod\'">Moderator Dashboard</button>' +
                '<button class="btn btn-danger" style="width:100%" onclick="App.closeModal(); window.location.hash=\'#/admin\'">Administrator Dashboard</button>' +
                '</div>'
            );
        } else if (this.currentUser.role === 'moderator') {
            window.location.hash = '#/mod';
        }
    },

    async showThemesModal() {
        const themeId = localStorage.getItem('venary_theme') || 'default';
        let modalHtml = '<div class="modal-overlay" id="themes-modal">' +
            '<div class="modal" style="width:500px; max-width:90vw;">' +
            '<div class="modal-header">' +
            '<div class="modal-title">🎨 Themes Store</div>' +
            '<button class="btn btn-ghost modal-close" onclick="document.getElementById(\'themes-modal\').remove()">✕</button>' +
            '</div>' +
            '<div class="modal-body" id="themes-list">' +
            '<div class="loading-spinner"></div>' +
            '</div>' +
            '</div></div>';

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        try {
            const themes = await API.get('/api/themes');
            let listHtml = '<div style="display:flex;flex-direction:column;gap:12px">';

            themes.forEach(t => {
                const isActive = t.id === themeId;
                listHtml += '<div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;' + (isActive ? 'border-color:var(--neon-cyan);box-shadow:0 0 10px rgba(0,217,255,0.2)' : '') + '">' +
                    '<div>' +
                    '<div style="font-weight:bold;margin-bottom:4px">' + this.escapeHtml(t.name) + ' ' + (isActive ? '<span class="badge" style="background:var(--neon-cyan);color:#000">Active</span>' : '') + '</div>' +
                    '<div style="font-size:0.8rem;color:var(--text-muted)">' + this.escapeHtml(t.description) + '</div>' +
                    '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px">By ' + this.escapeHtml(t.author) + '</div>' +
                    '</div>' +
                    (isActive ? '' : '<button class="btn btn-primary btn-sm" onclick="App.setTheme(\'' + t.id + '\')">Apply</button>') +
                    '</div>';
            });
            listHtml += '</div>';
            document.getElementById('themes-list').innerHTML = listHtml;
        } catch (err) {
            document.getElementById('themes-list').innerHTML = '<div class="error-state">Failed to load themes</div>';
        }
    },

    setTheme(themeId) {
        document.documentElement.setAttribute('data-theme', themeId);
        localStorage.setItem('venary_theme', themeId);

        // Remove existing theme stylesheet if any
        const existing = document.getElementById('theme-stylesheet');
        if (existing) existing.remove();

        // Inject new theme stylesheet if not default
        if (themeId !== 'default') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'theme-stylesheet';
            link.href = '/themes/' + themeId + '.css';
            document.head.appendChild(link);
        }

        document.getElementById('themes-modal')?.remove();
        this.showToast('Theme updated to ' + themeId, 'success');

        if (typeof ParticleEngine !== 'undefined') {
            ParticleEngine.createRibbons();
        }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () { App.init(); });
