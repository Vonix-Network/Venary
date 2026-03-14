/* =======================================
   Venary — Extension Loader
   PHPBB-style modular extension system.
   Each extension gets its own isolated database.
   ======================================= */
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createDatabase } = require('./db/factory');

const EXT_DIR = path.join(__dirname, '..', 'extensions');
const CONFIG_PATH = path.join(__dirname, '..', 'data', 'extensions.json');

class ExtensionLoader {
    constructor() {
        this.extensions = new Map();
        this.config = this._loadConfig();
    }

    _loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            }
        } catch { /* ignore */ }
        return {};
    }

    _saveConfig() {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    }

    /**
     * Discover and load all extensions.
     * @param {express.Application} app
     * @param {Object} dbConfig - { type, connectionString } from platform config
     */
    async loadAll(app, dbConfig = {}) {
        if (!fs.existsSync(EXT_DIR)) {
            fs.mkdirSync(EXT_DIR, { recursive: true });
            console.log('  📁 Created extensions/ directory');
            return;
        }

        const entries = fs.readdirSync(EXT_DIR, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const manifestPath = path.join(EXT_DIR, entry.name, 'manifest.json');
            if (!fs.existsSync(manifestPath)) continue;

            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                this._validateManifest(manifest, entry.name);

                const isEnabled = this.config[manifest.id] !== undefined
                    ? this.config[manifest.id].enabled
                    : manifest.enabled !== false;

                const ext = {
                    manifest,
                    dir: path.join(EXT_DIR, entry.name),
                    enabled: isEnabled,
                    db: null // Will hold extension's own database
                };

                this.extensions.set(manifest.id, ext);

                if (isEnabled) {
                    // Initialize extension's isolated database
                    await this._initExtensionDb(ext, dbConfig);
                    this._mountExtension(app, ext);
                    console.log('  ✅ Extension loaded: ' + manifest.name + ' v' + manifest.version);
                } else {
                    console.log('  ⏸️  Extension disabled: ' + manifest.name);
                }
            } catch (err) {
                console.error('  ❌ Failed to load extension ' + entry.name + ':', err.message);
            }
        }

        // Mount extension management API
        this._mountManagementAPI(app);
    }

    /**
     * Initialize an extension's own isolated database.
     */
    async _initExtensionDb(ext, dbConfig) {
        const schemaPath = path.join(ext.dir, 'server', 'schema.sql');
        if (!fs.existsSync(schemaPath)) return;

        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        const dbName = 'ext_' + ext.manifest.id;

        ext.db = await createDatabase({
            type: dbConfig.type || 'sqlite',
            name: dbName,
            connectionString: dbConfig.connectionString || undefined,
            sqlitePath: dbConfig.sqlitePath
                ? path.join(path.dirname(dbConfig.sqlitePath), dbName + '.db')
                : undefined
        }, schemaSql);

        console.log('    📂 Extension DB initialized: ' + dbName);
    }

    _validateManifest(manifest, dirName) {
        if (!manifest.id) throw new Error('Missing "id" in manifest');
        if (!manifest.name) throw new Error('Missing "name" in manifest');
        if (!manifest.version) throw new Error('Missing "version" in manifest');
        if (manifest.id !== dirName) {
            console.warn('  ⚠️  Extension id "' + manifest.id + '" does not match directory "' + dirName + '"');
        }
    }

    _mountExtension(app, ext) {
        const { manifest, dir } = ext;

        // Mount backend routes
        if (manifest.routes && manifest.routes.file) {
            const routeFile = path.join(dir, manifest.routes.file);
            if (fs.existsSync(routeFile)) {
                const routeFactory = require(routeFile);
                let router;

                // If the routes file exports a function, call it with the extension's db
                if (typeof routeFactory === 'function') {
                    router = routeFactory(ext.db);
                } else {
                    router = routeFactory;
                }

                const prefix = manifest.routes.prefix || '/api/ext/' + manifest.id;
                app.use(prefix, router);
            }
        }

        // Mount Discord bot integration (if available)
        const discordFile = path.join(dir, 'server', 'discord.js');
        if (fs.existsSync(discordFile)) {
            try {
                const discordModule = require(discordFile);
                const discordBot = require('./discordBot');
                if (typeof discordModule === 'function') {
                    discordModule(discordBot, ext.db);
                    console.log('    🤖 Discord integration loaded for: ' + manifest.id);
                }
            } catch (err) {
                console.error('    ❌ Failed to load Discord integration for ' + manifest.id + ':', err.message);
            }
        }

        // Serve extension's public directory
        const publicDir = path.join(dir, 'public');
        if (fs.existsSync(publicDir)) {
            app.use('/ext/' + manifest.id, express.static(publicDir));
        }
    }

    /**
     * Mount the /api/extensions management endpoints.
     */
    _mountManagementAPI(app) {
        const self = this;

        app.get('/api/extensions', (req, res) => {
            const list = [];
            for (const [id, ext] of self.extensions) {
                const m = ext.manifest;
                list.push({
                    id: m.id,
                    name: m.name,
                    version: m.version,
                    description: m.description || '',
                    author: m.author || '',
                    enabled: ext.enabled,
                    hasOwnDb: !!ext.db,
                    nav: ext.enabled ? (m.nav || []) : [],
                    pages: ext.enabled ? (m.pages || []).map(p => ({
                        route: p.route,
                        src: '/ext/' + m.id + '/' + p.file.replace(/^public\//, '') + '?v=' + m.version,
                        global: p.global || null
                    })) : [],
                    css: ext.enabled ? (m.css || []).map(c => '/ext/' + m.id + '/' + c.replace(/^public\//, '') + '?v=' + m.version) : [],
                    admin_route: ext.enabled ? (m.admin_route || null) : null
                });
            }
            res.json(list);
        });

        app.post('/api/extensions/:id/toggle', async (req, res) => {
            const { authenticateToken } = require('./middleware/auth');
            authenticateToken(req, res, async function () {
                const db = require('./db');
                const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
                if (!user || user.role !== 'admin') {
                    return res.status(403).json({ error: 'Admin access required' });
                }

                const ext = self.extensions.get(req.params.id);
                if (!ext) return res.status(404).json({ error: 'Extension not found' });

                ext.enabled = !ext.enabled;
                self.config[req.params.id] = { enabled: ext.enabled };
                self._saveConfig();

                res.json({
                    id: req.params.id,
                    enabled: ext.enabled,
                    message: ext.enabled
                        ? 'Extension enabled. Restart server to apply.'
                        : 'Extension disabled. Restart server to apply.'
                });
            });
        });
    }

    /**
     * Get an extension's database instance.
     */
    getExtensionDb(extId) {
        const ext = this.extensions.get(extId);
        return ext ? ext.db : null;
    }

    getEnabledExtensions() {
        const result = [];
        for (const [id, ext] of this.extensions) {
            if (ext.enabled) result.push(ext);
        }
        return result;
    }
}

module.exports = new ExtensionLoader();
