/* =======================================
   Venary — Client-Side Router
   Supports dynamic route registration
   and wildcard sub-paths for extensions.
   ======================================= */
var Router = {
    routes: {},
    currentPage: null,

    register(path, handler) {
        this.routes[path] = handler;
    },

    async navigate(hash) {
        var fullPath = hash.replace('#', '') || '/login';
        
        // Separate path and query string for correct routing
        var queryIndex = fullPath.indexOf('?');
        var path = queryIndex !== -1 ? fullPath.substring(0, queryIndex) : fullPath;

        // Restore nav if leaving admin/messenger (only for authenticated users — auth/guest pages handle their own nav state below)
        var segments = path.split('/').filter(Boolean);
        var fullscreenPages = ['admin', 'messenger'];
        var isFullscreen = fullscreenPages.includes(segments[0]);

        var mainNav = document.getElementById('main-nav');
        var mobileBottomNav = document.getElementById('mobile-bottom-nav');
        var mobileHeader = document.getElementById('mobile-header');
        var pageContainer = document.getElementById('page-container');

        if (!isFullscreen && API.token) {
            if (mainNav) mainNav.classList.remove('hidden');
            if (mobileBottomNav) mobileBottomNav.classList.remove('hidden');
            if (pageContainer) {
                pageContainer.classList.remove('admin-fullscreen');
                pageContainer.classList.remove('full-width');
            }
        } else if (isFullscreen) {
            // Instantly hide nav elements to prevent visual flashing while loading
            if (mainNav) mainNav.classList.add('hidden');
            if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
            if (mobileHeader) mobileHeader.classList.add('hidden');
        }

        // Pause heavy background engines if in a fullscreen opaque overlay
        if (isFullscreen) {
            if (typeof ParticleEngine !== 'undefined') ParticleEngine.pause();
            if (typeof WebGLEngine !== 'undefined') WebGLEngine.pause();
        } else {
            if (typeof ParticleEngine !== 'undefined') ParticleEngine.resume();
            if (typeof WebGLEngine !== 'undefined') WebGLEngine.resume();
        }

        // 1. Try exact match first (e.g. /admin/images)
        var handler = this.routes[path];
        var params = [];

        // 2. If no exact match, try base path match (e.g. /profile/123)
        if (!handler && segments.length > 0) {
            var basePath = '/' + segments[0];
            handler = this.routes[basePath];
            params = segments.slice(1);
        }

        // Check auth
        var isAuthPage = path === '/login' || path === '/register' || path === '/forgot-password' || path === '/reset-password';
        // Always-public routes — accessible without login regardless of guestMode setting
        var alwaysPublicRoutes = ['/donate', '/feed'];
        // Additional routes unlocked when guestMode is explicitly enabled
        var guestAllowed = App.siteSettings && App.siteSettings.guestMode;
        var guestModeRoutes = ['/forum', '/servers', '/mc-leaderboard'];
        var isGuestRoute = alwaysPublicRoutes.some(function(r) { return path === r || path.startsWith(r + '/'); }) ||
            (guestAllowed && guestModeRoutes.some(function(r) { return path === r || path.startsWith(r + '/'); }));

        if (!API.token && !isAuthPage && !isGuestRoute) {
            window.location.hash = '#/login';
            return;
        }
        var isLoginRegister = path === '/login' || path === '/register';
        if (API.token && isLoginRegister) {
            window.location.hash = '#/feed';
            return;
        }

        // Hide nav on auth pages only. Guest routes and logged-in routes manage nav via onLogin/logout.
        var mainNav = document.getElementById('main-nav');
        var mobileHeader = document.getElementById('mobile-header');
        var mobileBottomNav = document.getElementById('mobile-bottom-nav');
        var pageContainer = document.getElementById('page-container');
        if (isAuthPage) {
            if (mainNav) mainNav.classList.add('hidden');
            if (mobileHeader) mobileHeader.classList.add('hidden');
            if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
            if (pageContainer) { pageContainer.classList.remove('admin-fullscreen'); pageContainer.classList.add('full-width'); }
        } else if (!API.token && isGuestRoute) {
            // Guest on a public page — show the sidebar nav, hide auth-only mobile elements
            if (mainNav) mainNav.classList.remove('hidden');
            if (mobileHeader) mobileHeader.classList.add('hidden');
            if (mobileBottomNav) mobileBottomNav.classList.add('hidden');
            if (pageContainer) { pageContainer.classList.remove('admin-fullscreen'); pageContainer.classList.remove('full-width'); }
        }

        if (!handler) {
            // Show 404 page
            var container = document.getElementById('page-container');
            container.style.opacity = '0';
            container.style.transform = 'translateY(10px)';
            
            setTimeout(function () {
                NotFoundPage.render(container, segments);
                requestAnimationFrame(function () {
                    container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                    container.style.opacity = '1';
                    container.style.transform = 'translateY(0)';
                });
            }, 150);
            return;
        }

        // Close mobile menu if expanded
        var mainNav = document.getElementById('main-nav');
        if (mainNav) {
            mainNav.classList.remove('mobile-expanded');
        }

        // Close mobile drawer if open
        if (typeof App !== 'undefined' && App.closeMobileDrawer) {
            App.closeMobileDrawer();
        }

        // Update nav (core + extension links)
        var activePage = segments[0] || '';
        document.querySelectorAll('.nav-link').forEach(function (link) {
            link.classList.toggle('active', link.dataset.page === activePage);
        });

        // Sync mobile bottom nav active state
        if (typeof App !== 'undefined' && App._syncMobileNavActive) {
            App._syncMobileNavActive();
        }

        // Page transition
        var container = document.getElementById('page-container');
        container.style.opacity = '0';
        container.style.transform = 'translateY(10px)';

        await new Promise(function (r) { setTimeout(r, 150); });

        try {
            await handler(container, params);
        } catch (err) {
            console.error('Page render error:', err);
            container.innerHTML = '<div class="empty-state"><h3>Something went wrong</h3><p>' + (err.message || 'Unknown error') + '</p></div>';
        }

        // Animate in
        requestAnimationFrame(function () {
            container.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
            setTimeout(function() {
                container.style.transform = 'none';
            }, 300);
        });

        this.currentPage = segments[0];
    },

    init() {
        var self = this;
        window.addEventListener('hashchange', function () {
            self.navigate(window.location.hash);
        });

        // Initial route — no hash means root visit. Guests land on feed (always public), logged-in users too.
        if (!window.location.hash) {
            window.location.hash = '#/feed';
        } else {
            this.navigate(window.location.hash);
        }
    }
};
