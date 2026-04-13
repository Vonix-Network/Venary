const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const Config = require('./config');
const logger = require('./logger');

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
            scriptSrc:      ["'self'", "'unsafe-inline'"],   // SPA uses inline scripts
            styleSrc:       ["'self'", "'unsafe-inline'"],   // inline theme CSS
            imgSrc:         ["'self'", "data:", "https:", "http:"],
            connectSrc:     ["'self'", "wss:", "ws:"],
            frameSrc:       ["'self'", "https://www.youtube.com"],
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

        // ── Auth rate limiting ──────────────────────────────────────────────────
        app.use('/api/auth/login', authLimiter);
        app.use('/api/auth/register', authLimiter);
        app.use('/api/auth/forgot-password', authLimiter);
        app.use('/api/auth/reset-password', authLimiter);
        // User enumeration protection
        app.use('/api/users/search', userEnumLimiter);
        app.use('/api/users/:id', userEnumLimiter);
        // Friend request spam protection
        app.use('/api/friends/request', friendRequestLimiter);
        // General API rate limit
        app.use('/api/', apiLimiter);

        // API Routes
        app.use('/api/auth', require('./routes/auth'));
        app.use('/api/users', require('./routes/users'));
        app.use('/api/friends', require('./routes/friends'));
        app.use('/api/messages', require('./routes/messages'));
        app.use('/api/posts', require('./routes/posts'));
        app.use('/api/notifications', require('./routes/notifications'));
        app.use('/api/admin', require('./routes/admin'));
        app.use('/api/themes', require('./routes/themes'));

        // Public settings endpoint (no auth — used for theming on load)
        app.get('/api/settings', (req, res) => {
            res.json(Config.getPublicSettings());
        });

        // Initialize Discord Bot ecosystem
        const discordBot = require('./discordBot');
        await discordBot.init();

        // Make io available to extensions via app.get('io')
        app.set('io', io);

        // Load extensions (PHPBB-style module system)
        const extensionLoader = require('./extension-loader');
        await extensionLoader.loadAll(app, dbConfig);

        // Deploy Discord commands (including those registered by extensions)
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
