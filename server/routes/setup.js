/* =======================================
   Venary — Setup Routes
   Handles first-run setup wizard API.
   ======================================= */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Config = require('../config');

// GET /api/setup/status — check if setup is needed
router.get('/status', (req, res) => {
    res.json({
        setupRequired: !Config.isSetupComplete(),
        version: require('../../package.json').version
    });
});

// POST /api/setup/complete — run the initial setup
router.post('/complete', async (req, res) => {
    try {
        // Prevent re-running setup
        if (Config.isSetupComplete()) {
            return res.status(403).json({ error: 'Setup has already been completed' });
        }

        const {
            siteName,
            dbType,
            dbConnectionString,
            adminUsername,
            adminEmail,
            adminPassword,
            adminDisplayName
        } = req.body;

        // Validate
        if (!adminUsername || !adminEmail || !adminPassword) {
            return res.status(400).json({ error: 'Admin username, email, and password are required' });
        }
        if (adminUsername.length < 3 || adminUsername.length > 20) {
            return res.status(400).json({ error: 'Admin username must be 3-20 characters' });
        }
        if (adminPassword.length < 6) {
            return res.status(400).json({ error: 'Admin password must be at least 6 characters' });
        }
        if (dbType === 'postgres' && !dbConnectionString) {
            return res.status(400).json({ error: 'PostgreSQL connection string is required' });
        }

        // Test database connection
        const { createAdapter } = require('../db/factory');
        const fs = require('fs');
        const path = require('path');

        const dbOpts = {
            type: dbType || 'sqlite',
            connectionString: dbConnectionString || undefined
        };

        let adapter;
        try {
            adapter = createAdapter(dbOpts);
            const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
            await adapter.init(schemaSql);
        } catch (err) {
            return res.status(400).json({ error: 'Database connection failed: ' + err.message });
        }

        // Create admin user
        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        const adminId = uuidv4();
        const now = new Date().toISOString();

        await adapter.run(
            `INSERT INTO users (id, username, email, password, display_name, role, level, xp, created_at)
             VALUES (?, ?, ?, ?, ?, 'admin', 1, 0, ?)`,
            [adminId, adminUsername, adminEmail, hashedPassword, adminDisplayName || adminUsername, now]
        );

        await adapter.close();

        // Save configuration
        Config.save({
            siteName: siteName || 'Venary',
            database: {
                type: dbType || 'sqlite',
                connectionString: dbConnectionString || null
            },
            setup: {
                completedAt: now,
                adminUserId: adminId
            }
        });

        res.status(201).json({
            message: 'Setup complete! Restarting...',
            siteName: siteName || 'Venary'
        });

        // Graceful restart after a short delay to let the response send
        setTimeout(() => {
            console.log('  🔄 Setup complete, restarting server...');
            process.exit(0);
        }, 1000);

    } catch (err) {
        console.error('Setup error:', err);
        res.status(500).json({ error: 'Setup failed: ' + err.message });
    }
});

// POST /api/setup/test-db — test a database connection without saving
router.post('/test-db', async (req, res) => {
    if (Config.isSetupComplete()) {
        return res.status(403).json({ error: 'Setup already completed' });
    }

    const { dbType, dbConnectionString } = req.body;

    try {
        const { createAdapter } = require('../db/factory');
        const adapter = createAdapter({
            type: dbType || 'sqlite',
            connectionString: dbConnectionString || undefined
        });

        // Try a simple query
        await adapter.init('SELECT 1;');
        await adapter.close();

        res.json({ success: true, message: 'Connection successful!' });
    } catch (err) {
        res.status(400).json({ success: false, message: 'Connection failed: ' + err.message });
    }
});

module.exports = router;
