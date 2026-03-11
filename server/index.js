const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const Config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE']
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

async function start() {
    // Always mount setup routes (they self-guard against re-running)
    app.use('/api/setup', require('./routes/setup'));

    if (!Config.isSetupComplete()) {
        // =====================================
        // SETUP MODE — serve wizard only
        // =====================================
        console.log('  ⚡ First run detected — starting setup wizard');

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
                        const decoded = jwt.verify(token, JWT_SECRET);
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

        // API Routes
        app.use('/api/auth', require('./routes/auth'));
        app.use('/api/users', require('./routes/users'));
        app.use('/api/friends', require('./routes/friends'));
        app.use('/api/messages', require('./routes/messages'));
        app.use('/api/posts', require('./routes/posts'));
        app.use('/api/admin', require('./routes/admin'));
        app.use('/api/themes', require('./routes/themes'));

        // Public settings endpoint (no auth — used for theming on load)
        app.get('/api/settings', (req, res) => {
            res.json(Config.getPublicSettings());
        });

        // Initialize Discord Bot ecosystem
        const discordBot = require('./discordBot');
        await discordBot.init();

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
    console.error('Failed to start Venary:', err);
    process.exit(1);
});
