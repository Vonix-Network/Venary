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

        // 1. Try exact match first (e.g. /admin/images)
        var handler = this.routes[path];
        var segments = path.split('/').filter(Boolean);
        var params = [];

        // 2. If no exact match, try base path match (e.g. /profile/123)
        if (!handler && segments.length > 0) {
            var basePath = '/' + segments[0];
            handler = this.routes[basePath];
            params = segments.slice(1);
        }

        // Check auth
        var isAuthPage = path === '/login' || path === '/register' || path === '/forgot-password' || path === '/reset-password';
        if (!API.token && !isAuthPage) {
            window.location.hash = '#/login';
            return;
        }
        if (API.token && isAuthPage) {
            window.location.hash = '#/feed';
            return;
        }

        if (!handler) {
            window.location.hash = '#/feed';
            return;
        }

        // Close mobile menu if expanded
        var mainNav = document.getElementById('main-nav');
        if (mainNav) {
            mainNav.classList.remove('mobile-expanded');
        }

        // Update nav (core + extension links)
        var activePage = segments[0] || '';
        document.querySelectorAll('.nav-link').forEach(function (link) {
            link.classList.toggle('active', link.dataset.page === activePage);
        });

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
        });

        this.currentPage = segments[0];
    },

    init() {
        var self = this;
        window.addEventListener('hashchange', function () {
            self.navigate(window.location.hash);
        });

        // Initial route
        if (!window.location.hash) {
            window.location.hash = API.token ? '#/feed' : '#/login';
        } else {
            this.navigate(window.location.hash);
        }
    }
};
