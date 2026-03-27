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
                html += '<button class="nav-link dropdown-toggle" onclick="this.parentElement.classList.toggle(\'open\')">' +
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
    },

    _getNavIcon(iconName) {
        var icons = {
            'message-square': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            'users': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
            'home': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
            'settings': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
            'shield': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
            'grid': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
            'heart': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
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
            var counts = await API.get('/api/notifications/counts');
            
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
                const supportsSettings = t.id === 'pink' || t.id === 'lavalamp';
                const settingsBtn = supportsSettings ? '<button class="btn btn-secondary btn-sm" onclick="App.openThemeSettings(\'' + t.id + '\')" title="Theme Settings" style="padding: 0 8px;">⚙</button>' : '';
                const actionBtn = isActive ? '' : '<button class="btn btn-primary btn-sm" onclick="App.setTheme(\'' + t.id + '\')">Apply</button>';
                
                listHtml += '<div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;' + (isActive ? 'border-color:var(--neon-cyan);box-shadow:0 0 10px rgba(0,217,255,0.2)' : '') + '">' +
                    '<div>' +
                    '<div style="font-weight:bold;margin-bottom:4px">' + this.escapeHtml(t.name) + ' ' + (isActive ? '<span class="badge" style="background:var(--neon-cyan);color:#000">Active</span>' : '') + '</div>' +
                    '<div style="font-size:0.8rem;color:var(--text-muted)">' + this.escapeHtml(t.description) + '</div>' +
                    '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px">By ' + this.escapeHtml(t.author) + '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px">' + settingsBtn + actionBtn + '</div>' +
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
            if (themeId === 'default' || themeId === 'warp' || themeId === 'galaxy' || themeId === 'vonix' || themeId === 'ocean' || themeId === 'prism' || themeId === 'purple' || themeId === 'pink' || themeId === 'lavalamp') {
                ParticleEngine.refreshTheme();
            }
        }
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
            html += '<button class="btn btn-secondary" onclick="localStorage.removeItem(\'venary_bg_lavalamp\'); if(typeof ParticleEngine !== \'undefined\') ParticleEngine.refreshTheme(); document.getElementById(\'theme-settings-modal\').remove(); App.showToast(\'Reset to Default\',\'success\');" title="Reset to Defaults">Reset</button>';
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
        if (typeof ParticleEngine !== 'undefined') ParticleEngine.refreshTheme();
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
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function () { App.init(); });

// Global click handler for closing dropdowns
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('notifications-dropdown');
    const btn = document.getElementById('notifications-btn');
    if (App.isNotificationsOpen && dropdown && btn) {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.add('hidden');
            App.isNotificationsOpen = false;
        }
    }
});
