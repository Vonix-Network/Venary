/* =======================================
   Venary — Configuration Manager
   Reads/writes data/config.json.
   Detects first-run state.
   ======================================= */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');

// Default site settings applied on fresh installs / missing keys
const DEFAULTS = {
    siteName: 'Venary',
    siteTagline: 'Your Gaming Social Platform',
    siteDescription: 'Connect with gamers, share victories, and build your gaming community.',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#00d4ff',
    accentColor: '#7b2fff',
    darkMode: true,
    registrationOpen: true,
    requireEmailVerification: false,
    maxUsernameLength: 32,
    maxBioLength: 300,
    xpPerPost: 10,
    xpPerComment: 5,
    xpPerLike: 1,
    levelThresholds: [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000],
    maintenanceMode: false,
    maintenanceMessage: 'We are performing scheduled maintenance. Be right back!',
    footerText: '',
    smtp: {
        enabled: false,
        host: '',
        port: 587,
        secure: false,
        user: '',
        pass: '',
        from: '',
        rejectUnauthorized: true
    },
    notifications: {
        welcomeEmail: true,
        notifyFriendRequests: true,
        notifyMessages: false,
        notifyComments: true,
        digestEnabled: false
    },
    database: { type: 'sqlite' },
    setupComplete: false
};

let configCache = null;

const Config = {
    /**
     * Check whether setup has been completed.
     */
    isSetupComplete() {
        return fs.existsSync(CONFIG_PATH);
    },

    /**
     * Load config from disk (always fresh — no stale cache issue).
     */
    load() {
        if (!fs.existsSync(CONFIG_PATH)) return null;
        try {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            // Merge defaults so new keys are always present
            return Object.assign({}, DEFAULTS, raw);
        } catch {
            return Object.assign({}, DEFAULTS);
        }
    },

    /**
     * Save config to disk.
     * @param {Object} cfg
     */
    save(cfg) {
        fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        configCache = null; // Bust cache
    },

    /**
     * Get a config value by dot-separated key path.
     * @param {string} key - e.g. 'database.type'
     * @param {*} defaultVal
     */
    get(key, defaultVal) {
        const cfg = this.load();
        const fallback = defaultVal !== undefined ? defaultVal : DEFAULTS[key];
        if (!cfg) return fallback;
        const parts = key.split('.');
        let val = cfg;
        for (const p of parts) {
            if (val == null || typeof val !== 'object') return fallback;
            val = val[p];
        }
        return val !== undefined ? val : fallback;
    },

    /**
     * Set a config value and save.
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        const cfg = this.load() || Object.assign({}, DEFAULTS);
        const parts = key.split('.');
        let obj = cfg;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
                obj[parts[i]] = {};
            }
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
        this.save(cfg);
    },

    /**
     * Update multiple settings at once.
     * @param {Object} updates - flat or nested object
     */
    update(updates) {
        const cfg = this.load() || Object.assign({}, DEFAULTS);
        const merged = deepMerge(cfg, updates);
        this.save(merged);
        return merged;
    },

    /**
     * Get the full database config object.
     */
    getDatabaseConfig() {
        return {
            type: this.get('database.type', 'sqlite'),
            connectionString: this.get('database.connectionString', null),
            sqlitePath: this.get('database.sqlitePath', null)
        };
    },

    /**
     * Get all public-safe settings (for exposure via API).
     */
    getPublicSettings() {
        const cfg = this.load() || Object.assign({}, DEFAULTS);
        return {
            siteName: cfg.siteName || DEFAULTS.siteName,
            siteTagline: cfg.siteTagline || DEFAULTS.siteTagline,
            siteDescription: cfg.siteDescription || DEFAULTS.siteDescription,
            logoUrl: cfg.logoUrl || '',
            faviconUrl: cfg.faviconUrl || '',
            primaryColor: cfg.primaryColor || DEFAULTS.primaryColor,
            accentColor: cfg.accentColor || DEFAULTS.accentColor,
            darkMode: cfg.darkMode !== false,
            registrationOpen: cfg.registrationOpen !== false,
            maintenanceMode: !!cfg.maintenanceMode,
            maintenanceMessage: cfg.maintenanceMessage || DEFAULTS.maintenanceMessage,
            footerText: cfg.footerText || '',
            xpPerPost: cfg.xpPerPost ?? DEFAULTS.xpPerPost,
            xpPerComment: cfg.xpPerComment ?? DEFAULTS.xpPerComment,
            xpPerLike: cfg.xpPerLike ?? DEFAULTS.xpPerLike,
            levelThresholds: cfg.levelThresholds || DEFAULTS.levelThresholds,
            smtpEnabled: !!(cfg.smtp && cfg.smtp.enabled && cfg.smtp.host)
        };
    }
};

function deepMerge(target, source) {
    const out = Object.assign({}, target);
    for (const key of Object.keys(source)) {
        if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            out[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            out[key] = source[key];
        }
    }
    return out;
}

module.exports = Config;
