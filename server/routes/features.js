'use strict';
const express = require('express');
const Config  = require('../config');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Feature metadata: human-readable names, descriptions, and nav declarations.
// This mirrors the _featureDefs structure in public/js/app.js (client-side).
const FEATURE_META = {
    images: {
        name: 'Image Uploads',
        description: 'Lets users attach images to posts and have an image gallery in their profile.',
        nav: [],
    },
    forum: {
        name: 'Forum',
        description: 'PHPBB-style threaded discussion boards with categories and moderation tools.',
        nav: [{ route: '/forum', label: 'Forum' }],
    },
    donations: {
        name: 'Donations & Ranks',
        description: 'Stripe + crypto donation flow with purchasable cosmetic ranks for supporters.',
        nav: [{ route: '/donate', label: 'Donate' }],
    },
    minecraft: {
        name: 'Minecraft Integration',
        description: 'Server status, player leaderboards, and Minecraft account linking.',
        nav: [{ label: 'Minecraft', children: ['/servers', '/mc-leaderboard', '/mc-link'] }],
    },
    pterodactyl: {
        name: 'Pterodactyl Panel',
        description: 'Embedded game-server panel with real-time console and power controls.',
        nav: [{ route: '/pterodactyl', label: 'Panel' }],
    },
    messenger: {
        name: 'Messenger',
        description: 'Discord-style spaces with channels, DMs, roles, webhooks, and bots.',
        nav: [{ route: '/messenger', label: 'Messenger' }],
    },
};

function getFeatures() {
    const cfg = Config.get('features') || {};
    return Object.entries(FEATURE_META).map(([key, meta]) => ({
        id:          key,
        name:        meta.name,
        description: meta.description,
        enabled:     cfg[key] !== false,
        nav:         meta.nav,
    }));
}

// GET /api/features — public (used by app.js to gate UI)
router.get('/', (req, res) => {
    res.json(getFeatures());
});

// POST /api/features/:name/toggle — admin only
router.post('/:name/toggle', authenticateToken, async (req, res) => {
    try {
        const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!user || user.role !== 'admin')
            return res.status(403).json({ error: 'Admin access required' });

        const name = req.params.name;
        if (!FEATURE_META[name])
            return res.status(404).json({ error: 'Unknown feature' });

        const cfg      = Config.get('features') || {};
        const current  = cfg[name] !== false;
        cfg[name]      = !current;
        Config.set('features', cfg);

        res.json({
            id:      name,
            enabled: !current,
            message: (!current ? 'Feature enabled.' : 'Feature disabled.') + ' Changes take effect on next page load.',
        });
    } catch (err) {
        console.error('Feature toggle error:', err);
        res.status(500).json({ error: 'Failed to toggle feature' });
    }
});

module.exports = router;
