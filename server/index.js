const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Config = require('./config');
const logger = require('./logger');
const { hppProtection, authSlowDown, resetSlowDown, uploadSlowDown } = require('./middleware/security');

const app = express();
const server = http.createServer(app);

// ── Security headers ────────────────────────────────────────────────────────
// Note: upgradeInsecureRequests is intentionally omitted — it breaks HTTP
// deployments by silently blocking all sub-resource loads. HSTS is sent
// only when the app is behind HTTPS (via the HTTPS redirect middleware below).
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'"],   // SPA inline scripts; no external CDNs
            scriptSrcAttr:  ["'unsafe-inline'"],             // allow inline event handlers (onclick, onchange, etc.) in SPA templates
            styleSrc:       ["'self'", "'unsafe-inline'"],   // inline theme CSS; fonts served locally
            fontSrc:        ["'self'", "data:"],
            imgSrc:         ["'self'", "data:", "https:", "http:"],
            connectSrc:     ["'self'", "wss:", "ws:"],
            frameSrc:       ["'self'", "https://www.youtube.com", "http:", "https:"],
            objectSrc:      ["'none'"],
            baseUri:        ["'self'"],
            formAction:     ["'self'"],
            frameAncestors: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false,   // keep Socket.io compatible
    hsts: false,                        // only enable HSTS when TLS is confirmed (set via reverse proxy)
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    noSniff: true,
    xssFilter: true,
    frameguard: { action: 'sameorigin' }
}));

// ── CORS — restrict to configured site URL ──────────────────────────────────
const allowedOrigin = Config.isSetupComplete()
    ? (Config.get('siteUrl') || '*')
    : 'http://localhost:3000';  // restrict setup wizard to localhost only
const corsOptions = { origin: allowedOrigin, credentials: true };

const io = new Server(server, {
    cors: corsOptions
});

// ── Rate limiting ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait 15 minutes before trying again.' }
});
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' }
});
// Tighter limit for user enumeration endpoints
const userEnumLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many lookups. Please wait before searching again.' }
});
// Limit friend request spam
const friendRequestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many friend requests. Please slow down.' }
});

// Middleware
app.use(cors(corsOptions));
app.use(hppProtection);                           // HTTP Parameter Pollution protection
app.use(express.json({ limit: '100kb' }));

async function start() {
    // Always mount setup routes (they self-guard against re-running)
    app.use('/api/setup', require('./routes/setup'));

    if (!Config.isSetupComplete()) {
        // =====================================
        // SETUP MODE — serve wizard only
        // =====================================
        logger.info('  ⚡ First run detected — starting setup wizard');

        // Serve setup.html for everything
        app.use(express.static(path.join(__dirname, '..', 'public')));
        app.get('*', (req, res) => {
            if (!req.path.startsWith('/api')) {
                res.sendFile(path.join(__dirname, '..', 'public', 'setup.html'));
            }
        });
    } else {
        // =====================================
        // NORMAL MODE — full platform
        // =====================================
        const dbConfig = Config.getDatabaseConfig();

        // Initialize the database using config
        const db = require('./db');
        await db.init(dbConfig);

        // Maintenance mode middleware — blocks non-admins if enabled
        app.use(async (req, res, next) => {
            // Always allow setup, auth login, and the public settings endpoint
            const alwaysAllow = ['/api/setup', '/api/auth/login', '/api/auth/register', '/api/settings'];
            if (alwaysAllow.some(p => req.path.startsWith(p))) return next();

            if (Config.get('maintenanceMode', false)) {
                // Allow admin users through
                if (req.headers.authorization) {
                    try {
                        const { authenticateToken } = require('./middleware/auth');
                        const { JWT_SECRET } = require('./middleware/auth');
                        const jwt = require('jsonwebtoken');
                        const token = req.headers.authorization.replace('Bearer ', '');
                        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
                        const db = require('./db');
                        const user = await db.get('SELECT role FROM users WHERE id = ?', [decoded.id]);
                        if (user && user.role === 'admin') return next();
                    } catch (_) { /* fall through */ }
                }
                // For non-API routes, let the SPA handle it (frontend will show maintenance page)
                if (!req.path.startsWith('/api')) return next();
                return res.status(503).json({
                    error: 'maintenance',
                    message: Config.get('maintenanceMessage', 'The platform is under maintenance. Please check back soon.')
                });
            }
            next();
        });

        // ── HTTPS redirect in production ────────────────────────────────────────
        if (process.env.NODE_ENV === 'production') {
            app.use((req, res, next) => {
                if (req.header('x-forwarded-proto') !== 'https') {
                    return res.redirect(301, 'https://' + req.get('host') + req.url);
                }
                next();
            });
        }

        // ── Auth rate limiting + progressive slow-down ──────────────────────────
        app.use('/api/auth/login',           authSlowDown,  authLimiter);
        app.use('/api/auth/register',        authSlowDown,  authLimiter);
        app.use('/api/auth/forgot-password', resetSlowDown, authLimiter);
        app.use('/api/auth/reset-password',  resetSlowDown, authLimiter);
        // User enumeration protection
        app.use('/api/users/search', userEnumLimiter);
        app.use('/api/users/:id',    userEnumLimiter);
        // Friend request spam protection
        app.use('/api/friends/request', friendRequestLimiter);
        // Upload flood protection
        app.use('/api/images/upload', uploadSlowDown);
        // General API rate limit
        app.use('/api/', apiLimiter);

        // API Routes — core
        app.use('/api/auth',          require('./routes/auth'));
        app.use('/api/users',         require('./routes/users'));
        app.use('/api/friends',       require('./routes/friends'));
        app.use('/api/messages',      require('./routes/messages'));
        app.use('/api/posts',         require('./routes/posts'));
        app.use('/api/notifications', require('./routes/notifications'));
        app.use('/api/admin',         require('./routes/admin'));
        app.use('/api/appeals',       require('./routes/appeals'));
        app.use('/api/themes',        require('./routes/themes'));
        app.use('/api/features',      require('./routes/features'));

        // Public settings endpoint (no auth — used for theming on load)
        app.get('/api/settings', (req, res) => {
            res.json(Config.getPublicSettings());
        });

        // ── Feature routes — dual-mounted for backward compatibility ─────────────
        // Primary: /api/{feature}/   Compat alias: /api/ext/{feature}/

        const features = Config.get('features', {});

        if (features.images !== false) {
            const imagesRouter = require('./routes/images');
            app.use('/api/images',     imagesRouter);
            app.use('/api/ext/images', imagesRouter);
        }

        if (features.forum !== false) {
            const forumRouter = require('./routes/forum');
            app.use('/api/forum',     forumRouter);
            app.use('/api/ext/forum', forumRouter);
        }

        if (features.donations !== false) {
            const donationsRouter = require('./routes/donations');
            app.use('/api/donations',     donationsRouter);
            app.use('/api/ext/donations', donationsRouter);
        }

        if (features.minecraft !== false) {
            const minecraftRouter = require('./routes/minecraft');
            app.use('/api/minecraft',     minecraftRouter);
            app.use('/api/ext/minecraft', minecraftRouter); // mod backward compat
        }

        if (features.pterodactyl !== false) {
            const pterodactylRouter = require('./routes/pterodactyl');
            app.use('/api/pterodactyl',     pterodactylRouter);
            app.use('/api/ext/pterodactyl', pterodactylRouter);
            // Attach Socket.IO console namespace after io is initialised
            app._pterodactylRouter = pterodactylRouter;
        }

        if (features.messenger !== false) {
            const messengerRouter = require('./routes/messenger');
            app.use('/api/messenger',     messengerRouter);
            app.use('/api/ext/messenger', messengerRouter);
            app._messengerRouter = messengerRouter;
        }

        // Initialize Discord Bot ecosystem
        const discordBot = require('./discordBot');
        await discordBot.init();

        // Register feature-level Discord integrations
        if (features.donations !== false) {
            try { require('./services/donations-discord')(discordBot, require('./db')); } catch { /* optional */ }
        }
        if (features.minecraft !== false) {
            try { require('./services/minecraft/discord')(discordBot, require('./db')); } catch { /* optional */ }
        }

        // Make io available globally
        app.set('io', io);

        // Deploy Discord commands
        await discordBot.deployCommands();

        // Serve node modules (for UI libraries like skin3d)
        app.use('/node_modules', express.static(path.join(__dirname, '..', 'node_modules')));

        // Serve static files
        app.use(express.static(path.join(__dirname, '..', 'public')));

        // SPA fallback - serve index.html for all non-API routes
        app.get('*', (req, res) => {
            if (!req.path.startsWith('/api')) {
                res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
            }
        });

        // Initialize Socket.io
        const { initializeSocket } = require('./socket');
        initializeSocket(io);

        // Attach Pterodactyl console namespace (needs io to be ready)
        if (app._pterodactylRouter?.attachConsoleNamespace) {
            app._pterodactylRouter.attachConsoleNamespace(io);
        }

        // Attach Messenger Socket.IO namespace (needs io to be ready)
        if (app._messengerRouter?.attachNamespace) {
            app._messengerRouter.attachNamespace(io);
        }
    }

    // Start server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        const siteName = Config.get('siteName', 'Venary');
        console.log(`
  ╔══════════════════════════════════════════╗
  ║     🎮 ${siteName.padEnd(30)} ║
  ║     Server running on port ${PORT}          ║
  ║     http://localhost:${PORT}               ║
  ╚══════════════════════════════════════════╝
  `);
    });
}

start().catch(err => {
    logger.error('Failed to start Venary:', { err: err.message, stack: err.stack });
    process.exit(1);
});
