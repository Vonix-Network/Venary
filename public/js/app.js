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

        // Initialize engines
        ParticleEngine.init();
        if (typeof WebGLEngine !== 'undefined') WebGLEngine.init();

        // Restore saved appearance (layout, color, background) on page load
        {
            const savedLayout = localStorage.getItem('venary_layout') || 'default';
            const savedColor = localStorage.getItem('venary_color') || localStorage.getItem('venary_theme') || 'default';
            const savedBg = localStorage.getItem('venary_bg') || localStorage.getItem('venary_theme') || 'default';
            this.applyAppearance(savedLayout, savedColor, savedBg);
        }

        // Register core routes
        Router.register('/login', function (c) { AuthPage.render(c, 'login'); });
        Router.register('/register', function (c) { AuthPage.render(c, 'register'); });
        Router.register('/forgot-password', function (c) { AuthPage.render(c, 'forgot'); });
        Router.register('/reset-password', function (c) { AuthPage.render(c, 'reset'); });
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
                this.onGuest();
            }
        } else {
            this.onGuest();
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

            // Fetch per-extension access grants for the current user.
            // Currently only pterodactyl-panel gates its nav behind a DB permission.
            var pteroAccess = false;
            var hasPtero = enabledExts.some(function (e) { return e.id === 'pterodactyl-panel'; });
            if (hasPtero && API.token) {
                try {
                    var ar = await API.get('/api/ext/pterodactyl-panel/access/me');
                    pteroAccess = !!ar.granted;
                } catch { pteroAccess = false; }
            }
            this._extAccessMap = { 'pterodactyl-panel': pteroAccess };

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

            // Inject nav links (access-gated entries filtered here)
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
        var accessMap = App._extAccessMap || {};

        extensions.forEach(function (ext) {
            // Skip nav entirely if this extension requires an access grant the user doesn't have
            if (accessMap.hasOwnProperty(ext.id) && !accessMap[ext.id]) return;

            (ext.nav || []).forEach(function (nav) {
                var item = { ...nav, extId: ext.id };
                allNavItems.push(item);
            });
        });

        // Sort by position
        allNavItems.sort(function (a, b) { return (a.position || 99) - (b.position || 99); });

        allNavItems.forEach(function (nav) {
            var iconSvg = App._getNavIcon(nav.icon);

            if (nav.dropdown && nav.children) {
                html += '<div class="nav-dropdown-group">';
                html += '<button class="nav-link dropdown-toggle" onclick="App.toggleDropdown(this, event)">' +
                    iconSvg + '<span>' + nav.label + '</span>' +
                    '<svg class="dropdown-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>' +
                    '</button>';
                html += '<div class="dropdown-menu">';
                nav.children.forEach(function (child) {
                    var childIcon = App._getNavIcon(child.icon);
                    var page = child.route.replace('/', '');
                    html += '<a href="#' + child.route + '" class="nav-link dropdown-item" data-page="' + page + '" id="nav-' + nav.extId + '-' + page + '">' +
                        childIcon + '<span>' + child.label + '</span></a>';
                });
                html += '</div></div>';
            } else {
                var page = nav.route ? nav.route.replace('/', '') : '';
                html += '<a href="#' + nav.route + '" class="nav-link" data-page="' + page + '" id="nav-' + nav.extId + '">' +
                    iconSvg + '<span>' + nav.label + '</span></a>';
            }
        });

        navContainer.innerHTML = html;

        // If top-nav, re-run OverflowNav so new extension items are counted
        if (document.documentElement.classList.contains('layout-top-nav')) {
            requestAnimationFrame(() => OverflowNav.init());
        }

    },

    _getNavIcon(iconName) {
        var icons = {
            'message-square': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            'users': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'home': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
            'settings': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
            'shield': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            'minecraft': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><path fill="currentColor" stroke="none" d="M6 6h4v4H6zM14 6h4v4h-4zM10 10h4v2h2v6h-2v-2h-4v2H8v-6h2v-2z"/></svg>',
            'grid': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
            'heart': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
            'server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>'
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

        var userSection = document.getElementById('nav-user-info');
        if (userSection) userSection.classList.remove('hidden');
        var notifBtn = document.getElementById('notifications-btn');
        if (notifBtn) notifBtn.classList.remove('hidden');
        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.classList.remove('hidden');

        if (document.getElementById('guest-actions')) document.getElementById('guest-actions').classList.add('hidden');
        if (document.getElementById('mbn-login')) document.getElementById('mbn-login').classList.add('hidden');

        ['mbn-friends', 'mbn-chat', 'mbn-profile'].forEach(id => {
            var el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        });

        // Update nav avatar
        var navAvatar = document.getElementById('nav-avatar');
        if (navAvatar && this.currentUser) {
            if (this.currentUser.avatar) {
                navAvatar.innerHTML = '<img src="' + this.escapeHtml(this.currentUser.avatar) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block"><span class="status-dot online"></span>';
            } else {
                navAvatar.innerHTML = '<div class="avatar-placeholder">' + this.getInitials() + '</div><span class="status-dot online"></span>';
            }
        }

        // Close profile menu on outside click
        document.addEventListener('click', function (e) {
            var dropdown = document.getElementById('profile-menu-dropdown');
            var avatar = document.getElementById('nav-avatar');
            if (dropdown && !dropdown.classList.contains('hidden') && avatar && !dropdown.contains(e.target) && !avatar.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        // Show mod/admin buttons
        var modShieldBtn = document.getElementById('mod-shield-btn');
        if (modShieldBtn) modShieldBtn.classList.add('hidden');

        if (this.currentUser) {
            if (this.currentUser.role === 'admin' || this.currentUser.role === 'superadmin' || this.currentUser.role === 'moderator') {
                if (modShieldBtn) modShieldBtn.classList.remove('hidden');
            }
        }

        // Initialize mobile UI
        this._initMobileNav();

        // Connect socket
        if (API.token) {
            SocketClient.connect(API.token);
        }

        // Set up presence listeners
        SocketClient.on('new_message', function () { App.updateUnreadBadge(); });
        SocketClient.on('new_notification', function () { App.updateUnreadBadge(); });
        this.updateUnreadBadge();
        this.updateFriendRequestBadge();
    },

    // ===========================================
    // Mobile Nav & Drawer
    // ===========================================
    _initMobileNav() {
        var u = this.currentUser;
        if (!u) return;

        // Show mobile UI
        var mobileHeader = document.getElementById('mobile-header');
        var mobileBottomNav = document.getElementById('mobile-bottom-nav');
        if (mobileHeader) mobileHeader.classList.remove('hidden');
        if (mobileBottomNav) mobileBottomNav.classList.remove('hidden');

        // Sync avatar in mobile header
        var mobileAvatarInner = document.getElementById('mobile-avatar-inner');
        if (mobileAvatarInner) {
            if (u.avatar) {
                mobileAvatarInner.outerHTML = '<img src="' + this.escapeHtml(u.avatar) + '" style="width:34px;height:34px;border-radius:50%;object-fit:cover;display:block" id="mobile-avatar-inner">';
            } else {
                mobileAvatarInner.textContent = this.getInitials();
            }
        }

        // Sync avatar in bottom tab
        var mbnAvatarTab = document.getElementById('mbn-avatar-tab');
        if (mbnAvatarTab) {
            if (u.avatar) {
                mbnAvatarTab.innerHTML = '<img src="' + this.escapeHtml(u.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
            } else {
                mbnAvatarTab.textContent = this.getInitials();
            }
        }

        // Sync drawer user info
        var drawerAvatar = document.getElementById('mobile-drawer-avatar');
        var drawerUsername = document.getElementById('mobile-drawer-username');
        var drawerRole = document.getElementById('mobile-drawer-role');
        if (drawerAvatar) {
            if (u.avatar) {
                drawerAvatar.outerHTML = '<img src="' + this.escapeHtml(u.avatar) + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover" id="mobile-drawer-avatar">';
            } else {
                drawerAvatar.textContent = this.getInitials();
            }
        }
        if (drawerUsername) drawerUsername.textContent = u.display_name || u.username;
        if (drawerRole) drawerRole.textContent = u.role;

        // Show admin button in drawer if applicable
        var drawerAdminBtn = document.getElementById('mobile-drawer-admin-btn');
        if (drawerAdminBtn) {
            if (['admin', 'superadmin', 'moderator'].includes(u.role)) {
                drawerAdminBtn.classList.remove('hidden');
            }
        }
    },

    toggleMobileDrawer() {
        var overlay = document.getElementById('mobile-drawer-overlay');
        var drawer = document.getElementById('mobile-drawer');
        if (!drawer) return;

        var isHidden = drawer.classList.contains('hidden');
        if (isHidden) {
            // Populate drawer with extension links
            this._populateMobileDrawer();
            overlay.classList.remove('hidden');
            drawer.classList.remove('hidden');
            // Mark "more" tab as active
            document.querySelectorAll('.mbn-tab').forEach(function (t) { t.classList.remove('active'); });
            var moreBtn = document.getElementById('mbn-more-btn');
            if (moreBtn) moreBtn.classList.add('active');
        } else {
            this.closeMobileDrawer();
        }
    },

    closeMobileDrawer() {
        var overlay = document.getElementById('mobile-drawer-overlay');
        var drawer = document.getElementById('mobile-drawer');
        if (overlay) overlay.classList.add('hidden');
        if (drawer) drawer.classList.add('hidden');
        // Remove active from more btn, restore current page active
        var moreBtn = document.getElementById('mbn-more-btn');
        if (moreBtn) moreBtn.classList.remove('active');
        this._syncMobileNavActive();
    },

    _populateMobileDrawer() {
        var container = document.getElementById('mobile-drawer-links');
        if (!container) return;

        var html = '';
        var accessMap = this._extAccessMap || {};

        // Extension nav links
        (this.extensions || []).forEach(function (ext) {
            if (!ext.enabled) return;
            if (accessMap.hasOwnProperty(ext.id) && !accessMap[ext.id]) return;
            (ext.nav || []).forEach(function (nav) {
                if (nav.dropdown && nav.children) {
                    nav.children.forEach(function (child) {
                        var icon = App._getNavIcon(child.icon || nav.icon);
                        var page = child.route.replace('/', '');
                        html += '<a href="#' + child.route + '" class="nav-link" data-page="' + page + '" onclick="App.closeMobileDrawer()">' + icon + '<span>' + child.label + '</span></a>';
                    });
                } else {
                    var icon = App._getNavIcon(nav.icon);
                    var page = nav.route ? nav.route.replace('/', '') : '';
                    html += '<a href="#' + nav.route + '" class="nav-link" data-page="' + page + '" onclick="App.closeMobileDrawer()">' + icon + '<span>' + nav.label + '</span></a>';
                }
            });
        });

        container.innerHTML = html || '<div style="padding:12px 14px;color:var(--text-muted);font-size:0.85rem">No additional pages</div>';
    },

    _syncMobileNavActive() {
        var hash = window.location.hash || '#/feed';
        var path = hash.replace('#/', '');
        var page = path.split('/')[0];

        document.querySelectorAll('.mbn-tab').forEach(function (tab) {
            tab.classList.toggle('active', tab.dataset.page === page);
        });

        // Update mobile header title
        var titleEl = document.getElementById('mobile-page-title');
        if (titleEl) {
            var titles = { feed: 'Feed', friends: 'Friends', chat: 'Chat', profile: 'Profile', admin: 'Admin', mod: 'Moderation' };
            titleEl.textContent = titles[page] || (App.siteSettings && App.siteSettings.siteName) || 'Venary';
        }
    },

    onGuest() {
        var nav = document.getElementById('main-nav');
        var page = document.getElementById('page-container');
        if (nav) nav.classList.remove('hidden');
        if (page) page.classList.remove('full-width');

        var userSection = document.getElementById('nav-user-info');
        if (userSection) userSection.classList.add('hidden');
        var notifBtn = document.getElementById('notifications-btn');
        if (notifBtn) notifBtn.classList.add('hidden');
        var logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        var modShield = document.getElementById('mod-shield-btn');
        if (modShield) modShield.classList.add('hidden');

        var navUser = document.querySelector('.nav-user');
        if (navUser && !document.getElementById('guest-actions')) {
            var actions = document.createElement('div');
            actions.id = 'guest-actions';
            actions.style.display = 'flex';
            actions.style.gap = '10px';
            actions.style.marginRight = '10px';
            actions.innerHTML = `
                <button class="btn btn-ghost" onclick="window.location.hash='#/login'">Login</button>
                <button class="btn btn-primary" onclick="window.location.hash='#/register'">Register</button>
            `;
            var themeBtn = document.getElementById('theme-btn');
            if (themeBtn) navUser.insertBefore(actions, themeBtn);
            else navUser.appendChild(actions);
        } else if (document.getElementById('guest-actions')) {
            document.getElementById('guest-actions').classList.remove('hidden');
        }

        var mobileHeader = document.getElementById('mobile-header');
        if (mobileHeader) mobileHeader.classList.remove('hidden');
        var mobileAvatar = document.getElementById('mobile-avatar');
        if (mobileAvatar) mobileAvatar.classList.add('hidden');

        var mobileBottomNav = document.getElementById('mobile-bottom-nav');
        if (mobileBottomNav) {
            mobileBottomNav.classList.remove('hidden');
            ['mbn-friends', 'mbn-chat', 'mbn-profile'].forEach(id => {
                var el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            if (!document.getElementById('mbn-login')) {
                var loginTab = document.createElement('a');
                loginTab.href = '#/login';
                loginTab.className = 'mbn-tab';
                loginTab.id = 'mbn-login';
                loginTab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg><span>Login</span>';
                mobileBottomNav.appendChild(loginTab);
            } else {
                document.getElementById('mbn-login').classList.remove('hidden');
            }
        }
    },

    logout() {
        API.setToken(null);
        this.currentUser = null;
        SocketClient.disconnect();

        this.onGuest();
        this.closeMobileDrawer();

        window.location.hash = '#/login';
        this.showToast('Logged out successfully', 'info');
    },

    async updateUnreadBadge() {
        try {
            var counts = await API.get('/api/notifications/counts');

            // Chat Message Badge — desktop + mobile
            var chatBadge = document.getElementById('unread-badge');
            var mbnChatBadge = document.getElementById('mbn-chat-badge');
            if (counts.unread_messages > 0) {
                var chatTxt = counts.unread_messages > 99 ? '99+' : counts.unread_messages;
                if (chatBadge) { chatBadge.textContent = chatTxt; chatBadge.classList.remove('hidden'); }
                if (mbnChatBadge) { mbnChatBadge.textContent = chatTxt; mbnChatBadge.classList.remove('hidden'); }
            } else {
                if (chatBadge) chatBadge.classList.add('hidden');
                if (mbnChatBadge) mbnChatBadge.classList.add('hidden');
            }

            // Notification Bell Badge — desktop + mobile header
            var notifBadge = document.getElementById('notification-badge');
            var mobileNotifBadge = document.getElementById('mobile-notif-badge');
            if (counts.unread_notifications > 0) {
                var notifTxt = counts.unread_notifications > 99 ? '99+' : counts.unread_notifications;
                if (notifBadge) { notifBadge.textContent = notifTxt; notifBadge.classList.remove('hidden'); }
                if (mobileNotifBadge) { mobileNotifBadge.textContent = notifTxt; mobileNotifBadge.classList.remove('hidden'); }
            } else {
                if (notifBadge) notifBadge.classList.add('hidden');
                if (mobileNotifBadge) mobileNotifBadge.classList.add('hidden');
            }
        } catch (e) { /* ignore */ }
    },

    async updateFriendRequestBadge() {
        try {
            var data = await API.getFriendRequests();
            var count = data.incoming && data.incoming.length > 0 ? data.incoming.length : 0;
            // Desktop badge
            var badge = document.getElementById('friend-request-badge');
            if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
            // Mobile bottom nav badge
            var mbnBadge = document.getElementById('mbn-friend-badge');
            if (mbnBadge) { mbnBadge.textContent = count; mbnBadge.classList.toggle('hidden', count === 0); }
        } catch (e) { /* ignore */ }
    },

    // ===========================================
    // Notifications Dropdown System
    // ===========================================
    isNotificationsOpen: false,

    toggleProfileMenu(e) {
        if (e) e.stopPropagation();
        var dropdown = document.getElementById('profile-menu-dropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('hidden');
    },

    closeProfileMenu() {
        var dropdown = document.getElementById('profile-menu-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
    },

    async toggleNotifications(e) {
        if (e) e.stopPropagation();
        const dropdown = document.getElementById('notifications-dropdown');
        if (!dropdown) return;

        this.isNotificationsOpen = !this.isNotificationsOpen;

        if (this.isNotificationsOpen) {
            dropdown.classList.remove('hidden');
            await this.fetchNotifications();
        } else {
            dropdown.classList.add('hidden');
        }
    },

    async fetchNotifications() {
        const list = document.getElementById('notifications-list');
        if (!list) return;
        list.innerHTML = '<div style="padding: 20px; text-align: center;"><div class="loading-spinner"></div></div>';

        try {
            const data = await API.get('/api/notifications');
            // Update badges behind the scenes since we have the data
            this.updateUnreadBadgeFromData(data);

            if (!data.notifications || data.notifications.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No recent notifications</div>';
                return;
            }

            let html = '';
            data.notifications.forEach(n => {
                const unreadClass = n.read ? '' : 'unread';
                const avatar = n.actor_avatar
                    ? `<img src="${this.escapeHtml(n.actor_avatar)}" class="notification-avatar">`
                    : '<div class="avatar-placeholder notification-avatar" style="font-size:12px">?</div>';

                html += `
                    <div class="notification-item ${unreadClass}" onclick="App.handleNotificationClick('${n.id}', '${n.type}', '${n.reference_id}')">
                        ${avatar}
                        <div class="notification-content">
                            <div>${this.escapeHtml(n.message)}</div>
                            <div class="notification-time">${this.timeAgo(n.created_at)}</div>
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        } catch (err) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--neon-magenta);">Failed to load notifications</div>';
        }
    },

    updateUnreadBadgeFromData(counts) {
        // Chat Message Badge
        var chatBadge = document.getElementById('unread-badge');
        if (chatBadge) {
            if (counts.unread_messages > 0) {
                chatBadge.textContent = counts.unread_messages > 99 ? '99+' : counts.unread_messages;
                chatBadge.classList.remove('hidden');
            } else {
                chatBadge.classList.add('hidden');
            }
        }
        // Notification Bell Badge
        var notifBadge = document.getElementById('notification-badge');
        if (notifBadge) {
            if (counts.unread_notifications > 0) {
                notifBadge.textContent = counts.unread_notifications > 99 ? '99+' : counts.unread_notifications;
                notifBadge.classList.remove('hidden');
            } else {
                notifBadge.classList.add('hidden');
            }
        }
    },

    async handleNotificationClick(id, type, referenceId) {
        try {
            await API.post('/api/notifications/read', { id });
            this.updateUnreadBadge(); // refresh badges
            this.isNotificationsOpen = false;
            document.getElementById('notifications-dropdown').classList.add('hidden');

            if (type === 'comment' || type === 'like') {
                window.location.hash = '#/feed';
                // Note: a more complex app would jump straight to the specific post or thread.
            }
        } catch (err) {
            console.error('Failed marking read:', err);
        }
    },

    async markAllNotificationsRead() {
        try {
            await API.post('/api/notifications/read', {});
            this.fetchNotifications(); // re-render list
        } catch (err) {
            this.showToast('Failed to mark all as read', 'error');
        }
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
            .replace(/'/g, '&#39;');
    },

    /**
     * Renders a username, applying rank-specific glow or color.
     */
    renderUsername(userObj, noClass = false) {
        if (!userObj) return 'Unknown';

        let color = '';
        let glow = '';
        if (userObj.donation_rank && userObj.donation_rank.color) {
            color = this.escapeHtml(userObj.donation_rank.color);
        } else if (userObj.role === 'admin' || userObj.role === 'superadmin') {
            color = 'var(--neon-magenta)';
        } else if (userObj.role === 'moderator') {
            color = 'var(--neon-cyan)';
        }

        let name = this.escapeHtml(userObj.display_name || userObj.username);
        if (color) {
            glow = 'text-shadow: 0 0 8px ' + color + '; color: ' + color + '; font-weight: bold;';
        }

        return '<span ' + (noClass ? '' : 'class="username"') + ' style="' + glow + '">' + name + '</span>';
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
        s = s.replace(/(^|\s)#([a-zA-Z0-9_]+)/g, '$1<a href="#/search?q=%23$2" class="hashtag social-tag">#$2</a>');
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

    showImageGuide(e) {
        if (e) e.preventDefault();
        this.showModal('🖼️ Image Upload Guide',
            '<div style="line-height: 1.6; color: var(--text-primary);">' +
            '<p style="margin-bottom: var(--space-md);">To share images, you need to provide a <strong>direct link</strong> to the image.</p>' +
            '<ol style="margin-left: var(--space-lg); margin-bottom: var(--space-md);">' +
            '<li style="margin-bottom: var(--space-sm);">Go to a free image hosting site like <a href="https://postimg.cc/" target="_blank" style="color: var(--neon-cyan);">Postimg.cc</a>.</li>' +
            '<li style="margin-bottom: var(--space-sm);">Upload your image.</li>' +
            '<li style="margin-bottom: var(--space-sm);">Copy the <strong>Direct Link</strong> (it should end in .png, .jpg, or .gif). <em>Note: Imgur album links (like imgur.com/a/...) will not embed directly.</em></li>' +
            '<li style="margin-bottom: var(--space-sm);">Paste the link directly into the text box.</li>' +
            '</ol>' +
            '<div style="margin-top: var(--space-lg); text-align: right;">' +
            '<button class="btn btn-primary" onclick="App.closeModal()">Got it</button>' +
            '</div>' +
            '</div>'
        );
    },

    confirm(title, message) {
        return new Promise((resolve) => {
            this.showModal(title, `
                <div style="display:flex; flex-direction: column; gap: 15px;">
                    <div style="color: var(--text-primary); line-height: 1.5;">${this.escapeHtml(message)}</div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-ghost" id="app-confirm-cancel">Cancel</button>
                        <button class="btn btn-primary" id="app-confirm-ok">OK</button>
                    </div>
                </div>
            `);
            document.getElementById('app-confirm-cancel').onclick = () => { this.closeModal(); resolve(false); };
            document.getElementById('app-confirm-ok').onclick = () => { this.closeModal(); resolve(true); };

            // Override close behavior to resolve false
            const overlay = document.getElementById('app-modal-overlay');
            overlay.onclick = (e) => {
                if (e.target.id === 'app-modal-overlay') { this.closeModal(); resolve(false); }
            };
            const closeBtn = document.querySelector('#app-modal-overlay .modal-close');
            if (closeBtn) closeBtn.onclick = () => { this.closeModal(); resolve(false); };
        });
    },

    prompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            this.showModal(title, `
                <div style="display:flex; flex-direction: column; gap: 15px;">
                    <div style="color: var(--text-primary); line-height: 1.5;">${this.escapeHtml(message)}</div>
                    <input type="text" class="input-field" id="app-prompt-input" value="${this.escapeHtml(defaultValue)}" style="width: 100%;">
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-ghost" id="app-prompt-cancel">Cancel</button>
                        <button class="btn btn-primary" id="app-prompt-ok">OK</button>
                    </div>
                </div>
            `);
            const input = document.getElementById('app-prompt-input');
            input.focus();

            document.getElementById('app-prompt-cancel').onclick = () => { this.closeModal(); resolve(null); };
            document.getElementById('app-prompt-ok').onclick = () => { this.closeModal(); resolve(input.value); };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') { this.closeModal(); resolve(input.value); }
            };

            // Override close behavior to resolve null
            const overlay = document.getElementById('app-modal-overlay');
            overlay.onclick = (e) => {
                if (e.target.id === 'app-modal-overlay') { this.closeModal(); resolve(null); }
            };
            const closeBtn = document.querySelector('#app-modal-overlay .modal-close');
            if (closeBtn) closeBtn.onclick = () => { this.closeModal(); resolve(null); };
        });
    },

    alert(title, message) {
        return new Promise((resolve) => {
            this.showModal(title, `
                <div style="display:flex; flex-direction: column; gap: 15px;">
                    <div style="color: var(--text-primary); line-height: 1.5;">${this.escapeHtml(message)}</div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-primary" id="app-alert-ok">OK</button>
                    </div>
                </div>
            `);
            document.getElementById('app-alert-ok').onclick = () => { this.closeModal(); resolve(); };

            // Override close behavior to resolve
            const overlay = document.getElementById('app-modal-overlay');
            overlay.onclick = (e) => {
                if (e.target.id === 'app-modal-overlay') { this.closeModal(); resolve(); }
            };
            const closeBtn = document.querySelector('#app-modal-overlay .modal-close');
            if (closeBtn) closeBtn.onclick = () => { this.closeModal(); resolve(); };
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

        if (this.currentUser.role === 'admin' || this.currentUser.role === 'superadmin') {
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


    async showAppearanceModal() {
        const layoutId = localStorage.getItem('venary_layout') || 'default';
        const colorId = localStorage.getItem('venary_color') || localStorage.getItem('venary_theme') || 'default';
        const bgId = localStorage.getItem('venary_bg') || localStorage.getItem('venary_theme') || 'default';
        const radiusId = localStorage.getItem('venary_radius') || 'medium';
        const customObj = JSON.parse(localStorage.getItem('venary_custom_colors')) || {
            bgPrimary: '#05060a',
            bgCard: '#0a0c14',
            textPrimary: '#f0f2f5',
            neon1: '#29b6f6',
            neon2: '#ab47bc'
        };

        let modalHtml = `
            <div class="modal-overlay" id="themes-modal">
                <div class="modal" style="width:700px; max-width:95vw;">
                    <div class="modal-header">
                        <div class="modal-title">🎨 Personalization</div>
                        <button class="btn btn-ghost modal-close" onclick="App.cancelAppearance()">✕</button>
                    </div>
                    <div class="modal-body" id="appearance-modal-body" style="padding-top:10px;">
                        <div class="loading-spinner"></div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        try {
            const themes = await API.get('/api/themes');
            
            // Build Tabs
            let tabsHtml = `
                <div class="appearance-tabs">
                    <button class="appearance-tab active" onclick="App.switchAppearanceTab('presets', this)">Presets</button>
                    <button class="appearance-tab" onclick="App.switchAppearanceTab('layout', this)">Layout</button>
                    <button class="appearance-tab" onclick="App.switchAppearanceTab('colors', this)">Colors</button>
                    <button class="appearance-tab" onclick="App.switchAppearanceTab('background', this)">Background</button>
                    <button class="appearance-tab" onclick="App.switchAppearanceTab('style', this)">Style</button>
                </div>
            `;

            // Presets Pane
            let presetsHtml = `
                <div id="pane-presets" class="appearance-pane active">
                    <p style="color:var(--text-secondary); margin-bottom:15px;">One-click templates that completely overhaul the layout and colors.</p>
                    <div class="appearance-grid">
                        <div class="appearance-card" onclick="App.applyPreset('default')">
                            <div class="card-preview" style="background:#05060A; border-left:15px solid #29b6f6;"></div>
                            <span>Venary Original</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('obsidian')">
                            <div class="card-preview" style="background:#0F0F11; border-left:15px solid #FF0033;"></div>
                            <span>Obsidian (Esports)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('synthwave')">
                            <div class="card-preview" style="background:#0B0C10; overflow:hidden;"><div style="width:100%;height:100%;margin:5px;background:#FF007F"></div></div>
                            <span>Synthwave (Broadcast)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('toxic')">
                            <div class="card-preview" style="background:#101210; border-left:15px solid #39FF14;"></div>
                            <span>Toxic (Zombie)</span>
                        </div>
                        <div class="appearance-card" onclick="App.applyPreset('cyberpunk')">
                            <div class="card-preview" style="background:#010A0B; border-top:15px solid #FCE205; border-radius:0;"></div>
                            <span>Cyberpunk (NFT)</span>
                        </div>
                    </div>
                </div>
            `;

            // Layouts Pane
            let layoutsHtml = `
                <div id="pane-layout" class="appearance-pane">
                    <div class="appearance-grid">
                        <div class="appearance-card ${layoutId === 'default' ? 'selected' : ''}" onclick="App.selectAppearanceObj('layout', 'default', this)">
                            <div class="card-preview" style="background:#1a1a24; border-left:30px solid #2a2a35"></div>
                            <span>Sidebar (Default)</span>
                        </div>
                        <div class="appearance-card ${layoutId === 'compact' ? 'selected' : ''}" onclick="App.selectAppearanceObj('layout', 'compact', this)">
                            <div class="card-preview" style="background:#1a1a24; border-left:15px solid #2a2a35"></div>
                            <span>Compact Sidebar</span>
                        </div>
                        <div class="appearance-card ${layoutId === 'wide' ? 'selected' : ''}" onclick="App.selectAppearanceObj('layout', 'wide', this)">
                            <div class="card-preview" style="background:#1a1a24; overflow:hidden;"><div style="width:100%;height:100%;margin:5px;background:#2a2a35"></div></div>
                            <span>Wide View</span>
                        </div>
                        <div class="appearance-card ${layoutId === 'top-nav' ? 'selected' : ''}" onclick="App.selectAppearanceObj('layout', 'top-nav', this)">
                            <div class="card-preview" style="background:#1a1a24; border-top:15px solid #2a2a35"></div>
                            <span>Top Navbar</span>
                        </div>
                    </div>
                </div>
            `;

            // Colors Pane
            let colorsHtml = `
                <div id="pane-colors" class="appearance-pane">
                    <div class="swatch-grid">
                        <!-- Custom Theme Option -->
                        <div class="color-swatch-wrapper ${colorId === 'custom' ? 'selected' : ''}" onclick="App.selectAppearanceObj('color', 'custom', this)">
                            <div class="color-swatch" style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red)"></div>
                            <span style="font-size:0.75rem;margin-top:4px">Custom</span>
                        </div>
                        <div class="color-swatch-wrapper ${colorId === 'default' ? 'selected' : ''}" onclick="App.selectAppearanceObj('color', 'default', this)">
                            <div class="color-swatch" style="background: linear-gradient(135deg, #00f0ff, #ff0055)"></div>
                            <span style="font-size:0.75rem;margin-top:4px">Neon Default</span>
                        </div>
            `;
            themes.forEach(t => {
                if (t.id === 'default') return;
                let bgStyle = 'background: #555';
                if(t.id === 'obsidian') bgStyle = 'background: linear-gradient(135deg, #FF0033, #99001F)';
                else if(t.id === 'nebula') bgStyle = 'background: linear-gradient(135deg, #00FFFF, #FF00FF)';
                else if(t.id === 'synthwave') bgStyle = 'background: linear-gradient(135deg, #FF007F, #00F0FF)';
                else if(t.id === 'toxic') bgStyle = 'background: linear-gradient(135deg, #39FF14, #00B800)';
                else if(t.id === 'magma') bgStyle = 'background: linear-gradient(135deg, #FF4500, #FFD700)';
                else if(t.id === 'solarflare') bgStyle = 'background: linear-gradient(135deg, #FFCC00, #FF6600)';
                else if(t.id === 'glacier') bgStyle = 'background: linear-gradient(135deg, #00FFFF, #88FFFF)';
                else if(t.id === 'bubblegum') bgStyle = 'background: linear-gradient(135deg, #FF70A6, #FF9770)';
                else if(t.id === 'hologram') bgStyle = 'background: linear-gradient(135deg, #00FFFF, #BF00FF)';
                else if(t.id === 'stealth') bgStyle = 'background: linear-gradient(135deg, #AAAAAA, #445588)';
                else if(t.id === 'cyberpunk') bgStyle = 'background: linear-gradient(135deg, #FCE205, #FF0055)';
                
                colorsHtml += `
                    <div class="color-swatch-wrapper ${colorId === t.id ? 'selected' : ''}" onclick="App.selectAppearanceObj('color', '${t.id}', this)">
                        <div class="color-swatch" style="${bgStyle}"></div>
                        <span style="font-size:0.75rem;margin-top:4px">${this.escapeHtml(t.name)}</span>
                    </div>
                `;
            });
            colorsHtml += `</div>`;

            // Custom Colors Builder
            colorsHtml += `
                    <div id="custom-color-builder" style="display:${colorId === 'custom' ? 'block' : 'none'}; margin-top:20px; padding:15px; border:1px solid var(--border-light); border-radius:var(--radius-md); background:var(--bg-secondary)">
                        <h4 style="margin-bottom:15px; color:var(--text-primary)">Build Custom Theme</h4>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                            <div class="input-group">
                                <label>Background Primary</label>
                                <input type="color" id="cf_bgPrimary" class="input-field" style="padding:0; height:40px" value="${customObj.bgPrimary}" onchange="App.previewAppearance()">
                            </div>
                            <div class="input-group">
                                <label>Interface Card</label>
                                <input type="color" id="cf_bgCard" class="input-field" style="padding:0; height:40px" value="${customObj.bgCard}" onchange="App.previewAppearance()">
                            </div>
                            <div class="input-group">
                                <label>Text Primary</label>
                                <input type="color" id="cf_textPrimary" class="input-field" style="padding:0; height:40px" value="${customObj.textPrimary}" onchange="App.previewAppearance()">
                            </div>
                            <div class="input-group">
                                <label>Neon Accent 1</label>
                                <input type="color" id="cf_neon1" class="input-field" style="padding:0; height:40px" value="${customObj.neon1}" onchange="App.previewAppearance()">
                            </div>
                            <div class="input-group">
                                <label>Neon Accent 2</label>
                                <input type="color" id="cf_neon2" class="input-field" style="padding:0; height:40px" value="${customObj.neon2}" onchange="App.previewAppearance()">
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Backgrounds Pane
            let bgsHtml = `
                <div id="pane-background" class="appearance-pane">
                    <h4 style="margin-bottom:10px; color:var(--text-secondary)">Static & 2D Environments</h4>
                    <div class="appearance-grid" style="margin-bottom:20px">
                        <div class="appearance-card ${bgId === 'none' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'none', this)">
                            <div class="card-preview"></div><span>Solid Dark</span>
                        </div>
                        <div class="appearance-card ${bgId === 'default' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'default', this)">
                            <div class="card-preview" style="background:#111; position:relative"><div style="position:absolute;width:2px;height:2px;background:#fff;border-radius:50%;top:50%;left:50%;box-shadow: 10px 10px #fff, -10px -5px #fff"></div></div>
                            <span>Classic Dust</span>
                        </div>
                        <div class="appearance-card ${bgId === 'pink' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'pink', this)">
                            <div class="card-preview" style="background:linear-gradient(45deg, #2a0a18, #110008)"></div><span>Pink Bubbles</span>
                        </div>
                        <div class="appearance-card ${bgId === 'lavalamp' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'lavalamp', this)">
                            <div class="card-preview" style="background:linear-gradient(180deg, #330000, #000)"></div><span>Lava Lamp</span>
                        </div>
                    </div>
                    <h4 style="margin-bottom:10px; color:var(--neon-cyan)">3D WebGL Experiences</h4>
                    <div class="appearance-grid">
                        <div class="appearance-card ${bgId === 'webgl-cyber' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'webgl-cyber', this)">
                            <div class="card-preview" style="background:linear-gradient(180deg, #001122, #003344)"></div><span>Cyber Grid</span>
                        </div>
                        <div class="appearance-card ${bgId === 'webgl-matrix' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'webgl-matrix', this)">
                            <div class="card-preview" style="background:#001100"></div><span>Matrix Rain</span>
                        </div>
                        <div class="appearance-card ${bgId === 'webgl-stars' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'webgl-stars', this)">
                            <div class="card-preview" style="background:#000"></div><span>Hyperjump</span>
                        </div>
                        <div class="appearance-card ${bgId === 'webgl-fluid' ? 'selected' : ''}" onclick="App.selectAppearanceObj('bg', 'webgl-fluid', this)">
                            <div class="card-preview" style="background:linear-gradient(45deg, #002233, #000)"></div><span>Fluid Waves</span>
                        </div>
                    </div>
                </div>
            `;

            // Style Pane
            let styleHtml = `
                <div id="pane-style" class="appearance-pane">
                    <h4 style="margin-bottom:10px; color:var(--text-secondary)">UI Corner Radius</h4>
                    <div class="appearance-grid">
                        <div class="appearance-card ${radiusId === 'sharp' ? 'selected' : ''}" onclick="App.selectAppearanceObj('radius', 'sharp', this)">
                            <div class="card-preview" style="border-radius:0; border:2px solid #fff"></div><span>Sharp (0px)</span>
                        </div>
                        <div class="appearance-card ${radiusId === 'medium' ? 'selected' : ''}" onclick="App.selectAppearanceObj('radius', 'medium', this)">
                            <div class="card-preview" style="border-radius:6px; border:2px solid #fff"></div><span>Modern (6px)</span>
                        </div>
                        <div class="appearance-card ${radiusId === 'round' ? 'selected' : ''}" onclick="App.selectAppearanceObj('radius', 'round', this)">
                            <div class="card-preview" style="border-radius:16px; border:2px solid #fff"></div><span>Soft (16px)</span>
                        </div>
                        <div class="appearance-card ${radiusId === 'pill' ? 'selected' : ''}" onclick="App.selectAppearanceObj('radius', 'pill', this)">
                            <div class="card-preview" style="border-radius:30px; border:2px solid #fff"></div><span>Pill (Max)</span>
                        </div>
                    </div>
                </div>
            `;

            // Hidden states
            let stateHtml = `
                <input type="hidden" id="sel-layout" value="${layoutId}">
                <input type="hidden" id="sel-color" value="${colorId}">
                <input type="hidden" id="sel-bg" value="${bgId}">
                <input type="hidden" id="sel-radius" value="${radiusId}">
            `;

            let footerHtml = `
                <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px; border-top:1px solid var(--border-subtle); padding-top:16px;">
                    <button class="btn btn-secondary" onclick="App.cancelAppearance()">Cancel</button>
                    <button class="btn btn-primary" onclick="App.saveAppearance()">Save & Apply</button>
                </div>
            `;

            document.getElementById('appearance-modal-body').innerHTML = stateHtml + tabsHtml + presetsHtml + layoutsHtml + colorsHtml + bgsHtml + styleHtml + footerHtml;
        } catch (err) {
            console.error(err);
            document.getElementById('appearance-modal-body').innerHTML = '<div class="error-state">Failed to load appearance settings.</div>';
        }
    },

    applyPreset(presetId) {
        let layout, color, bg, radius;
        if (presetId === 'default') {
            layout = 'default'; color = 'default'; bg = 'default'; radius = 'medium';
        } else if (presetId === 'obsidian') {
            layout = 'default'; color = 'obsidian'; bg = 'default'; radius = 'medium';
        } else if (presetId === 'synthwave') {
            layout = 'wide'; color = 'synthwave'; bg = 'none'; radius = 'round';
        } else if (presetId === 'toxic') {
            layout = 'compact'; color = 'toxic'; bg = 'none'; radius = 'sharp';
        } else if (presetId === 'cyberpunk') {
            layout = 'top-nav'; color = 'cyberpunk'; bg = 'webgl-matrix'; radius = 'sharp';
        }

        document.getElementById('sel-layout').value = layout;
        document.getElementById('sel-color').value = color;
        document.getElementById('sel-bg').value = bg;
        document.getElementById('sel-radius').value = radius;

        // Auto-update DOM to reflect preset changes
        this.selectAppearanceObj('layout', layout, document.querySelector('#pane-layout .appearance-card:nth-child(' + (layout==='default'?1:layout==='compact'?2:layout==='wide'?3:4) + ')'));
        this.selectAppearanceObj('color', color, document.querySelector('.color-swatch-wrapper[onclick*="'+color+'"]'));
        let bgChild = 1;
        if(bg==='none') bgChild=1; else if(bg==='default') bgChild=2; else if(bg==='webgl-matrix') bgChild=2;
        if(bg==='webgl-matrix') {
             this.selectAppearanceObj('bg', bg, document.querySelectorAll('#pane-background .appearance-grid')[1].children[1]);
        } else {
             this.selectAppearanceObj('bg', bg, document.querySelectorAll('#pane-background .appearance-grid')[0].children[bgChild-1]);
        }
        this.selectAppearanceObj('radius', radius, document.querySelector('#pane-style .appearance-card:nth-child(' + (radius==='sharp'?1:radius==='medium'?2:radius==='round'?3:4) + ')'));
    },

    switchAppearanceTab(paneId, btnElem) {
        document.querySelectorAll('.appearance-tab').forEach(b => b.classList.remove('active'));
        btnElem.classList.add('active');
        document.querySelectorAll('.appearance-pane').forEach(p => p.classList.remove('active'));
        document.getElementById('pane-' + paneId).classList.add('active');
    },

    selectAppearanceObj(type, value, cardElem) {
        document.getElementById('sel-' + type).value = value;
        if (cardElem) {
            const siblings = cardElem.parentElement.querySelectorAll(type === 'color' ? '.color-swatch-wrapper' : '.appearance-card');
            siblings.forEach(el => el.classList.remove('selected'));
            cardElem.classList.add('selected');
        }
        
        // Show/hide custom builder
        if (type === 'color') {
            document.getElementById('custom-color-builder').style.display = (value === 'custom') ? 'block' : 'none';
        }

        this.previewAppearance();
    },

    cancelAppearance() {
        // Revert to originally stored values
        const layoutId = localStorage.getItem('venary_layout') || 'default';
        const colorId = localStorage.getItem('venary_color') || localStorage.getItem('venary_theme') || 'default';
        const bgId = localStorage.getItem('venary_bg') || localStorage.getItem('venary_theme') || 'default';
        const radiusId = localStorage.getItem('venary_radius') || 'medium';
        this.applyAppearance(layoutId, colorId, bgId, radiusId);
        document.getElementById('themes-modal').remove();
    },

    previewAppearance() {
        const layout = document.getElementById('sel-layout').value;
        const color = document.getElementById('sel-color').value;
        const bg = document.getElementById('sel-bg').value;
        const radius = document.getElementById('sel-radius').value;
        
        let customObj = null;
        if (color === 'custom') {
            customObj = {
                bgPrimary: document.getElementById('cf_bgPrimary') ? document.getElementById('cf_bgPrimary').value : '#05060a',
                bgCard: document.getElementById('cf_bgCard') ? document.getElementById('cf_bgCard').value : '#0a0c14',
                textPrimary: document.getElementById('cf_textPrimary') ? document.getElementById('cf_textPrimary').value : '#fff',
                neon1: document.getElementById('cf_neon1') ? document.getElementById('cf_neon1').value : '#00E5FF',
                neon2: document.getElementById('cf_neon2') ? document.getElementById('cf_neon2').value : '#7C4DFF',
            };
        }
        
        this.applyAppearance(layout, color, bg, radius, customObj);
    },

    saveAppearance() {
        const layout = document.getElementById('sel-layout').value;
        const color = document.getElementById('sel-color').value;
        const bg = document.getElementById('sel-bg').value;
        const radius = document.getElementById('sel-radius').value;

        localStorage.setItem('venary_layout', layout);
        localStorage.setItem('venary_color', color);
        localStorage.setItem('venary_bg', bg);
        localStorage.setItem('venary_radius', radius);
        
        let customObj = null;
        if (color === 'custom') {
            customObj = {
                bgPrimary: document.getElementById('cf_bgPrimary').value,
                bgCard: document.getElementById('cf_bgCard').value,
                textPrimary: document.getElementById('cf_textPrimary').value,
                neon1: document.getElementById('cf_neon1').value,
                neon2: document.getElementById('cf_neon2').value
            };
            localStorage.setItem('venary_custom_colors', JSON.stringify(customObj));
        }

        this.applyAppearance(layout, color, bg, radius, customObj);

        document.getElementById('themes-modal').remove();
        this.showToast('Appearance settings saved!', 'success');
    },

    applyAppearance(layout, color, bg, radius, customObj = null) {
        // 1. Layout
        document.documentElement.classList.remove('layout-default', 'layout-compact', 'layout-wide', 'layout-top-nav');
        if (layout !== 'default') {
            document.documentElement.classList.add('layout-' + layout);
        }

        // Boot / tear down the overflow nav engine based on layout
        // Use rAF so the new layout class has applied before measuring
        requestAnimationFrame(() => {
            if (layout === 'top-nav') {
                if (typeof OverflowNav !== 'undefined') OverflowNav.init();
            } else {
                if (typeof OverflowNav !== 'undefined') OverflowNav.destroy();
            }
        });

        // 2. Styling (Radius)
        document.documentElement.classList.remove('radius-sharp', 'radius-medium', 'radius-round', 'radius-pill');
        if (radius !== 'medium') {
            document.documentElement.classList.add('radius-' + radius);
        }

        // 3. Color Scheme
        document.documentElement.setAttribute('data-theme', color);
        const existing = document.getElementById('theme-stylesheet');
        const existingCustom = document.getElementById('theme-custom');
        if (existing) existing.remove();
        if (existingCustom) existingCustom.remove();

        let themeLink = null;
        if (color === 'custom') {
             if (!customObj) customObj = JSON.parse(localStorage.getItem('venary_custom_colors')) || {
                 bgPrimary: '#05060A', bgCard: '#0A0C14', textPrimary: '#FFF', neon1: '#29b6f6', neon2: '#ab47bc'
             };
             
             const customCss = `
                 :root {
                     --bg-primary: ${customObj.bgPrimary};
                     --bg-secondary: ${customObj.bgPrimary}dd;
                     --bg-tertiary: ${customObj.bgPrimary}aa;
                     --bg-card: ${customObj.bgCard};
                     --bg-card-hover: ${customObj.bgCard}ee;
                     --bg-input: ${customObj.bgCard}cc;
                     --text-primary: ${customObj.textPrimary};
                     --neon-cyan: ${customObj.neon1};
                     --neon-magenta: ${customObj.neon2};
                     --text-highlight: ${customObj.neon1};
                     --border-subtle: ${customObj.neon1}22;
                     --border-light: ${customObj.neon1}44;
                     --border-accent: ${customObj.neon1}99;
                     --gradient-primary: linear-gradient(135deg, ${customObj.neon1} 0%, ${customObj.neon2} 100%);
                     --gradient-accent: linear-gradient(135deg, ${customObj.neon2} 0%, ${customObj.neon1} 100%);
                     --shadow-neon: 0 0 20px ${customObj.neon1}33;
                 }
             `;
             const style = document.createElement('style');
             style.id = 'theme-custom';
             style.textContent = customCss;
             document.head.appendChild(style);
        } else if (color !== 'default') {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'theme-stylesheet';
            link.href = '/themes/' + color + '.css';
            document.head.appendChild(link);
            themeLink = link;
        }

        // 4. Background Engine Map (Deferred to allow CSS variables to load)
        const updateEngines = () => {
            const webGLThemes = ['webgl-cyber', 'webgl-matrix', 'webgl-stars', 'webgl-geometry', 'webgl-fluid', 'webgl-aurora', 'webgl-particles', 'webgl-lavalamp'];
            const isWebGL = webGLThemes.includes(bg);

            const particleCanvas = document.getElementById('particle-canvas');
            const webglCanvas = document.getElementById('webgl-canvas');

            if (bg === 'none') {
                if (particleCanvas) particleCanvas.classList.add('hidden');
                if (webglCanvas) webglCanvas.classList.add('hidden');
                if (typeof ParticleEngine !== 'undefined') ParticleEngine.destroy();
                if (typeof WebGLEngine !== 'undefined') WebGLEngine.clearScene();
            } else if (isWebGL) {
                if (particleCanvas) particleCanvas.classList.add('hidden');
                if (webglCanvas) webglCanvas.classList.remove('hidden');
                if (typeof ParticleEngine !== 'undefined') ParticleEngine.destroy();
                if (typeof WebGLEngine !== 'undefined') WebGLEngine.refreshTheme(bg);
            } else {
                if (particleCanvas) particleCanvas.classList.remove('hidden');
                if (webglCanvas) webglCanvas.classList.add('hidden');
                if (typeof WebGLEngine !== 'undefined') WebGLEngine.clearScene();
                if (typeof ParticleEngine !== 'undefined') ParticleEngine.refreshTheme(bg);
            }
        };

        if (themeLink) {
            themeLink.onload = updateEngines;
            // Fallback in case onload fails to fire or is cached
            setTimeout(updateEngines, 150);
        } else {
            // Need a slight tick for style tag to apply
            setTimeout(updateEngines, 10);
        }
    },
    setTheme(themeId) {
        // Legacy setter wrapper
        this.applyAppearance('default', themeId, themeId);
        localStorage.setItem('venary_color', themeId);
        localStorage.setItem('venary_bg', themeId);
        this.showToast('Theme updated to ' + themeId, 'success');
    },

    openThemeSettings(themeId) {
        if (themeId === 'pink') {
            const cfg = JSON.parse(localStorage.getItem('venary_bg_pink')) || { preset: 'pink', style: 'bubbles', colors: ['#ff70a6', '#ff9770'] };
            if (!cfg.colors || cfg.colors.length < 2) cfg.colors = ['#ff70a6', '#ff9770'];

            let html = '<div class="modal-overlay" id="theme-settings-modal"><div class="modal" style="width:400px; max-width:90vw;"><div class="modal-header"><div class="modal-title">⚙ Pink Theme Settings</div><button class="btn btn-ghost modal-close" onclick="document.getElementById(\'theme-settings-modal\').remove()">✕</button></div><div class="modal-body auth-form">';
            html += '<div class="input-group"><label>Particle Style</label><select id="ts-style" class="input-field"><option value="bubbles"' + (cfg.style === 'bubbles' ? ' selected' : '') + '>Bubbles</option><option value="ribbons"' + (cfg.style === 'ribbons' ? ' selected' : '') + '>Neon Ribbons</option></select></div>';
            html += '<div class="input-group"><label>Color Preset</label><select id="ts-preset" class="input-field"><option value="pink"' + (cfg.preset === 'pink' ? ' selected' : '') + '>Original Pink</option><option value="purple"' + (cfg.preset === 'purple' ? ' selected' : '') + '>Purple (Legacy)</option><option value="custom"' + (cfg.preset === 'custom' ? ' selected' : '') + '>Custom Colors</option></select></div>';

            html += '<div id="ts-custom-colors" style="display:' + (cfg.preset === 'custom' ? 'block' : 'none') + '; margin-top: 10px;">';
            html += '<div class="input-group"><label>Primary Particle Color</label><input type="color" id="ts-c1" class="input-field" value="' + cfg.colors[0] + '"></div>';
            html += '<div class="input-group"><label>Secondary Particle Color</label><input type="color" id="ts-c2" class="input-field" value="' + cfg.colors[1] + '"></div>';
            html += '</div>';

            html += '<button class="btn btn-primary" onclick="App.saveThemeSettings(\'pink\')" style="margin-top: 20px;">Save Settings</button>';
            html += '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend', html);

            document.getElementById('ts-preset').onchange = (e) => {
                document.getElementById('ts-custom-colors').style.display = e.target.value === 'custom' ? 'block' : 'none';
            };
        } else if (themeId === 'lavalamp') {
            const cfg = JSON.parse(localStorage.getItem('venary_bg_lavalamp')) || { primary: '#ff3300', secondary: '#ff9900' };
            let html = '<div class="modal-overlay" id="theme-settings-modal"><div class="modal" style="width:400px; max-width:90vw;"><div class="modal-header"><div class="modal-title">⚙ Lava Lamp Settings</div><button class="btn btn-ghost modal-close" onclick="document.getElementById(\'theme-settings-modal\').remove()">✕</button></div><div class="modal-body auth-form">';
            html += '<div class="input-group"><label>Lava Color 1</label><input type="color" id="ts-lava-c1" class="input-field" value="' + cfg.primary + '"></div>';
            html += '<div class="input-group"><label>Lava Color 2</label><input type="color" id="ts-lava-c2" class="input-field" value="' + cfg.secondary + '"></div>';
            html += '<div style="display:flex;gap:10px;margin-top:20px;">';
            html += '<button class="btn btn-primary" onclick="App.saveThemeSettings(\'lavalamp\')" style="flex:1;">Save Settings</button>';
            html += '<button class="btn btn-secondary" onclick="localStorage.removeItem(\'venary_bg_lavalamp\'); if(typeof WebGLEngine !== \'undefined\') WebGLEngine.refreshTheme(\'webgl-lavalamp\'); document.getElementById(\'theme-settings-modal\').remove(); App.showToast(\'Reset to Default\',\'success\');" title="Reset to Defaults">Reset</button>';
            html += '</div></div></div></div>';
            document.body.insertAdjacentHTML('beforeend', html);
        }
    },

    saveThemeSettings(themeId) {
        if (themeId === 'pink') {
            const cfg = {
                style: document.getElementById('ts-style').value,
                preset: document.getElementById('ts-preset').value,
                colors: [document.getElementById('ts-c1').value, document.getElementById('ts-c2').value]
            };
            localStorage.setItem('venary_bg_pink', JSON.stringify(cfg));
        } else if (themeId === 'lavalamp') {
            const cfg = {
                primary: document.getElementById('ts-lava-c1').value,
                secondary: document.getElementById('ts-lava-c2').value
            };
            localStorage.setItem('venary_bg_lavalamp', JSON.stringify(cfg));
        }
        document.getElementById('theme-settings-modal')?.remove();
        const currentBg = localStorage.getItem('venary_bg') || localStorage.getItem('venary_theme') || 'default';
        const webGLThemes = ['webgl-cyber', 'webgl-matrix', 'webgl-stars', 'webgl-geometry', 'webgl-fluid', 'webgl-aurora', 'webgl-particles', 'webgl-lavalamp'];
        if (webGLThemes.includes(currentBg)) {
            if (typeof WebGLEngine !== 'undefined') WebGLEngine.refreshTheme(currentBg);
        } else {
            if (typeof ParticleEngine !== 'undefined') ParticleEngine.refreshTheme(currentBg);
        }
        App.showToast('Theme settings applied automatically!', 'success');
    },

    toggleEmojiPicker(buttonElem, inputId) {
        let container = document.getElementById('global-emoji-picker');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-emoji-picker';
            container.style.position = 'absolute';
            container.style.zIndex = '9999';
            container.style.display = 'none';

            const picker = document.createElement('emoji-picker');
            picker.classList.add('dark');
            picker.addEventListener('emoji-click', event => {
                const targetId = container.dataset.targetInput;
                const input = document.getElementById(targetId);
                if (input) {
                    const start = input.selectionStart || input.value.length;
                    const end = input.selectionEnd || input.value.length;
                    input.value = input.value.substring(0, start) + event.detail.unicode + input.value.substring(end);
                    input.focus();
                    input.setSelectionRange(start + event.detail.unicode.length, start + event.detail.unicode.length);
                    // Hide after select? The user might want multi-emoji. We won't hide by default.
                }
            });
            container.appendChild(picker);
            document.body.appendChild(container);

            document.addEventListener('click', e => {
                const btn = e.target.closest('.emoji-btn');
                if (btn) return;
                if (!container.contains(e.target)) {
                    container.style.display = 'none';
                }
            });
        }

        if (container.style.display === 'block' && container.dataset.targetInput === inputId) {
            container.style.display = 'none';
            return;
        }

        container.dataset.targetInput = inputId;
        const rect = buttonElem.getBoundingClientRect();

        container.style.display = 'block';
        let leftPx = rect.left + window.scrollX - 250;
        if (leftPx < 10) leftPx = 10;
        if (leftPx + 320 > window.innerWidth) leftPx = window.innerWidth - 320;
        container.style.left = leftPx + 'px';

        let topPx = rect.bottom + window.scrollY + 10;
        if (topPx + 400 > window.scrollY + window.innerHeight) {
            topPx = rect.top + window.scrollY - 400; // open upward if clipping bottom
        }
        container.style.top = topPx + 'px';
    },

    /**
     * Scroll the top navigation carousel
     * @param {number} dir - Direction (-1 for prev, 1 for next)
     */

    toggleDropdown(btn, event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        
        const group = btn.parentElement;
        const menu = group.querySelector('.dropdown-menu');
        if (!menu) return;

        const isOpen = group.classList.contains('open');

        // Close all other dropdowns first
        document.querySelectorAll('.nav-dropdown-group.open').forEach(g => {
            if (g !== group) {
                g.classList.remove('open');
                const m = g.querySelector('.dropdown-menu');
                if (m) m.style.position = '';
            }
        });

        if (isOpen) {
            group.classList.remove('open');
            menu.style.position = '';
            menu.style.top = '';
            menu.style.left = '';
            menu.style.zIndex = '';
        } else {
            group.classList.add('open');
            
            // Portal logic: If in top-nav, we absolutely position it to escape clipping
            const isTopNav = document.documentElement.classList.contains('layout-top-nav');
            if (isTopNav) {
                const rect = btn.getBoundingClientRect();
                menu.style.position = 'fixed';
                menu.style.top = (rect.bottom + 10) + 'px';
                menu.style.left = rect.left + 'px';
                menu.style.zIndex = '99999';
                menu.style.minWidth = rect.width + 'px'; // match width of button
            } else {
                // In sidebar, standard inline works best
                menu.style.position = 'relative';
                menu.style.top = '';
                menu.style.left = '';
            }
        }
    },

    scrollNavCarousel() { /* no-op: carousel replaced by OverflowNav */ },

};

/* ========================================================
   OverflowNav — Top Nav overflow drawer
   Shows first 5 nav items in the bar; hides the rest and
   reveals a slide-in panel via the "More" button.
   ======================================================== */
const OverflowNav = {
    VISIBLE: 5,
    _enabled: false,
    _resizeObserver: null,

    /* Called by applyAppearance() and after _injectNavLinks() */
    init() {
        if (!document.documentElement.classList.contains('layout-top-nav')) {
            this.destroy();
            return;
        }
        this._enabled = true;
        this.close(true); // ensure panel is closed, no animation
        this._update();
        this._bindResize();
    },

    /* Count top-level nav items (not dropdown children, not mobile btn) */
    _getItems() {
        const container = document.getElementById('nav-center-links');
        if (!container) return [];
        return Array.from(container.querySelectorAll(
            '.nav-links > a.nav-link, .nav-links > .nav-dropdown-group, ' +
            '.ext-nav > a.nav-link, .ext-nav > .nav-dropdown-group'
        ));
    },

    _update() {
        const items   = this._getItems();
        const moreBtn = document.getElementById('nav-more-btn');
        const hasOverflow = items.length > this.VISIBLE;

        /* Show first VISIBLE, hide the rest */
        items.forEach((item, i) => {
            item.style.display = (i < this.VISIBLE) ? '' : 'none';
        });

        /* More button visibility */
        if (moreBtn) {
            if (hasOverflow) {
                moreBtn.classList.remove('hidden');
                moreBtn.style.display = 'flex';
            } else {
                moreBtn.classList.add('hidden');
                moreBtn.style.display = 'none';
            }
        }

        /* Populate overflow panel with hidden items */
        this._populatePanel(items.slice(this.VISIBLE));
    },

    _populatePanel(hiddenItems) {
        const list = document.getElementById('nav-overflow-list');
        if (!list) return;
        list.innerHTML = '';

        if (!hiddenItems.length) return;

        hiddenItems.forEach(item => {
            const clone = item.cloneNode(true);
            clone.style.display = ''; // unhide clone
            /* Close panel on any link click */
            clone.querySelectorAll('a').forEach(a => {
                a.addEventListener('click', () => this.close());
            });
            if (clone.tagName === 'A') {
                clone.addEventListener('click', () => this.close());
            }
            list.appendChild(clone);
        });
    },

    open() {
        const panel = document.getElementById('nav-overflow-panel');
        if (!panel) return;
        panel.setAttribute('aria-hidden', 'false');
        /* rAF ensures visibility:visible is applied before transform transition */
        requestAnimationFrame(() => panel.classList.add('open'));
    },

    close(instant = false) {
        const panel = document.getElementById('nav-overflow-panel');
        if (!panel) return;
        panel.classList.remove('open');
        panel.setAttribute('aria-hidden', 'true');
    },

    _bindResize() {
        if (this._resizeObserver) return;
        const container = document.getElementById('nav-center-links');
        if (!container || !window.ResizeObserver) return;
        this._resizeObserver = new ResizeObserver(() => {
            if (this._enabled) this._update();
        });
        this._resizeObserver.observe(container);
    },

    destroy() {
        this._enabled = false;
        this.close(true);
        if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
        /* Re-show all items */
        this._getItems().forEach(item => item.style.display = '');
        const moreBtn = document.getElementById('nav-more-btn');
        if (moreBtn) { moreBtn.classList.add('hidden'); moreBtn.style.display = 'none'; }
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () { App.init(); });

// Global click handler for closing dropdowns
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('notifications-dropdown');
    const btn = document.getElementById('notifications-btn');
    if (App.isNotificationsOpen && dropdown && btn) {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.add('hidden');
            App.isNotificationsOpen = false;
        }
    }
});

document.addEventListener('click', function(e) {
    if (!e.target.closest('.nav-dropdown-group')) {
        document.querySelectorAll('.nav-dropdown-group.open').forEach(g => {
            g.classList.remove('open');
            const m = g.querySelector('.dropdown-menu');
            if (m) m.style.position = '';
        });
    }
    /* Close overflow panel on outside click */
    const panel = document.getElementById('nav-overflow-panel');
    if (panel && panel.classList.contains('open')) {
        const drawer = document.getElementById('nav-overflow-drawer');
        const moreBtn = document.getElementById('nav-more-btn');
        if (drawer && !drawer.contains(e.target) && moreBtn && !moreBtn.contains(e.target)) {
            OverflowNav.close();
        }
    }
});
