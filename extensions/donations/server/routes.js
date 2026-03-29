/* =======================================
   Donations & Ranks Extension — API Routes
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function (extDb) {
    const router = express.Router();
    const coreDb = require('../../../server/db');
    const { authenticateToken, optionalAuth } = require('../../../server/middleware/auth');
    const Config = require('../../../server/config');
    const Mailer = require('../../../server/mail');

    // ── Startup migration: ensure user_id and rank_id are nullable ──
    // Handles both SQLite (table rebuild) and PostgreSQL (ALTER COLUMN).
    (async () => {
        try {
            if (extDb.type === 'postgres') {
                // PostgreSQL: ALTER COLUMN to drop NOT NULL — safe to run repeatedly
                await extDb.run('ALTER TABLE donations ALTER COLUMN user_id DROP NOT NULL').catch(() => {});
                await extDb.run('ALTER TABLE donations ALTER COLUMN rank_id DROP NOT NULL').catch(() => {});
            } else {
                // SQLite: check via PRAGMA and rebuild table if needed
                const tableInfo = await extDb.all("PRAGMA table_info(donations)");
                const userIdCol = tableInfo.find(c => c.name === 'user_id');
                const rankIdCol = tableInfo.find(c => c.name === 'rank_id');
                if ((userIdCol && userIdCol.notnull) || (rankIdCol && rankIdCol.notnull)) {
                    await extDb.run('PRAGMA foreign_keys = OFF');
                    await extDb.run(`CREATE TABLE IF NOT EXISTS donations_new (
                        id TEXT PRIMARY KEY,
                        user_id TEXT,
                        rank_id TEXT,
                        amount REAL NOT NULL,
                        currency TEXT DEFAULT 'usd',
                        payment_type TEXT DEFAULT 'one-time',
                        stripe_session_id TEXT UNIQUE,
                        stripe_payment_intent TEXT,
                        stripe_subscription_id TEXT,
                        status TEXT DEFAULT 'pending',
                        minecraft_uuid TEXT,
                        minecraft_username TEXT,
                        discord_notified INTEGER DEFAULT 0,
                        expires_at TEXT,
                        created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                    )`);
                    await extDb.run(`INSERT OR IGNORE INTO donations_new SELECT * FROM donations`);
                    await extDb.run(`DROP TABLE donations`);
                    await extDb.run(`ALTER TABLE donations_new RENAME TO donations`);
                    await extDb.run('PRAGMA foreign_keys = ON');
                    console.log('[Donations] ✅ Migrated donations table: user_id and rank_id are now nullable');
                }
            }
        } catch (err) {
            console.error('[Donations] Migration error:', err.message);
        }
    })();

    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id]).then(u => {
            if (!u || !['admin', 'superadmin', 'moderator'].includes(u.role)) return res.status(403).json({ error: 'Admin access required' });
            next();
        }).catch(() => res.status(500).json({ error: 'Server error' }));
    }

    function getStripe() {
        const key = Config.get('stripe_secret_key');
        if (!key || key === 'YOUR_STRIPE_SECRET_KEY') return null;
        if (!getStripe._instance || getStripe._key !== key) {
            getStripe._instance = require('stripe')(key);
            getStripe._key = key;
        }
        return getStripe._instance;
    }

    // ══════════════════════════════════════════════════════
    // PUBLIC ENDPOINTS
    // ══════════════════════════════════════════════════════

    router.get('/ranks', async (req, res) => {
        try {
            const ranks = await extDb.all('SELECT id, name, price, color, icon, description, perks, sort_order FROM donation_ranks WHERE active = 1 ORDER BY sort_order ASC');
            ranks.forEach(r => { try { r.perks = JSON.parse(r.perks || '[]'); } catch { r.perks = []; } });
            res.json(ranks);
        } catch (err) {
            console.error('[Donations] Ranks error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/recent', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 10, 50);
            // Single query with LEFT JOIN to avoid N+1
            const donations = await extDb.all(
                `SELECT d.id, d.user_id, d.amount, d.currency, d.payment_type, d.created_at, d.minecraft_username,
                        r.name as rank_name, r.color as rank_color
                 FROM donations d
                 LEFT JOIN donation_ranks r ON d.rank_id = r.id
                 WHERE d.status = 'completed'
                 ORDER BY d.created_at DESC LIMIT ?`,
                [limit]
            );
            // Batch user lookup — collect unique non-null user_ids
            const userIds = [...new Set(donations.map(d => d.user_id).filter(Boolean))];
            const userMap = {};
            for (const uid of userIds) {
                const u = await coreDb.get('SELECT id, username, display_name, avatar FROM users WHERE id = ?', [uid]);
                if (u) userMap[uid] = u;
            }
            for (const d of donations) {
                const user = d.user_id ? userMap[d.user_id] : null;
                d.username = user?.display_name || user?.username || d.minecraft_username || 'Anonymous';
                d.avatar = user?.avatar || null;
                if (!d.minecraft_uuid && d.minecraft_username) d.mc_username = d.minecraft_username;
                delete d.user_id;
            }
            res.json(donations);
        } catch (err) {
            console.error('[Donations] Recent error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // AUTHENTICATED ENDPOINTS
    // ══════════════════════════════════════════════════════

    router.get('/my-rank', authenticateToken, async (req, res) => {
        try {
            const userRank = await extDb.get(
                `SELECT ur.*, r.name as rank_name, r.color as rank_color, r.icon as rank_icon, r.price as rank_price
                 FROM user_ranks ur
                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                 WHERE ur.user_id = ? AND ur.active = 1`,
                [req.user.id]
            );
            res.json(userRank || { active: false });
        } catch (err) {
            console.error('[Donations] My rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // GET /my-history — user's own donation history + receipts
    router.get('/my-history', authenticateToken, async (req, res) => {
        try {
            const donations = await extDb.all(
                `SELECT d.id, d.amount, d.currency, d.payment_type, d.status, d.created_at, d.expires_at,
                        r.name as rank_name, r.color as rank_color, r.icon as rank_icon
                 FROM donations d
                 LEFT JOIN donation_ranks r ON d.rank_id = r.id
                 WHERE d.user_id = ?
                 ORDER BY d.created_at DESC LIMIT 50`,
                [req.user.id]
            );
            const conversions = await extDb.all(
                `SELECT rc.*, 
                        fr.name as from_rank_name, fr.color as from_rank_color,
                        tr.name as to_rank_name, tr.color as to_rank_color
                 FROM rank_conversions rc
                 LEFT JOIN donation_ranks fr ON rc.from_rank_id = fr.id
                 LEFT JOIN donation_ranks tr ON rc.to_rank_id = tr.id
                 WHERE rc.user_id = ?
                 ORDER BY rc.converted_at DESC LIMIT 20`,
                [req.user.id]
            );
            res.json({ donations, conversions });
        } catch (err) {
            console.error('[Donations] My history error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /convert-rank — convert to a different rank using remaining time
    router.post('/convert-rank', authenticateToken, async (req, res) => {
        try {
            const { new_rank_id } = req.body;
            if (!new_rank_id) return res.status(400).json({ error: 'new_rank_id required' });

            const currentRank = await extDb.get(
                'SELECT * FROM user_ranks WHERE user_id = ? AND active = 1',
                [req.user.id]
            );
            if (!currentRank) return res.status(400).json({ error: 'No active rank to convert from' });
            if (currentRank.rank_id === new_rank_id) return res.status(400).json({ error: 'Already on this rank' });

            const newRank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ? AND active = 1', [new_rank_id]);
            if (!newRank) return res.status(404).json({ error: 'Target rank not found' });

            const oldRank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [currentRank.rank_id]);

            // Calculate remaining days on current rank
            let daysRemaining = 0;
            if (currentRank.expires_at) {
                const msLeft = new Date(currentRank.expires_at) - Date.now();
                daysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            }

            // Prorated value: days_remaining * (old_price / 30)
            const proratedValue = daysRemaining * ((oldRank?.price || 0) / 30);
            // New days from prorated value at new rank price
            const newDays = newRank.price > 0 ? Math.floor(proratedValue / (newRank.price / 30)) : daysRemaining;
            const newExpiry = newDays > 0
                ? new Date(Date.now() + newDays * 24 * 60 * 60 * 1000).toISOString()
                : new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(); // min 1 day

            // Log conversion
            await extDb.run(
                'INSERT INTO rank_conversions (id, user_id, from_rank_id, to_rank_id, days_remaining) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), req.user.id, currentRank.rank_id, new_rank_id, daysRemaining]
            );

            // Update user rank
            await extDb.run(
                'UPDATE user_ranks SET rank_id = ?, expires_at = ?, started_at = ? WHERE user_id = ?',
                [new_rank_id, newExpiry, new Date().toISOString(), req.user.id]
            );

            // Send conversion email
            const user = await coreDb.get('SELECT username, display_name, email FROM users WHERE id = ?', [req.user.id]);
            if (user && user.email) {
                sendConversionEmail(user, oldRank, newRank, daysRemaining, newDays, newExpiry).catch(() => {});
            }

            res.json({
                success: true,
                from_rank: oldRank?.name,
                to_rank: newRank.name,
                days_remaining: daysRemaining,
                new_days: newDays,
                new_expiry: newExpiry
            });
        } catch (err) {
            console.error('[Donations] Convert rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /checkout — create Stripe checkout session (supports guest donations via mc_username)
    router.post('/checkout', optionalAuth, async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).json({ error: 'Payment system not configured. Contact an administrator.' });

            const { rank_id } = req.body;
            if (!rank_id) return res.status(400).json({ error: 'rank_id is required' });

            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ? AND active = 1', [rank_id]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });

            // Support both authenticated users and guests (guest provides mc_username)
            const isGuest = !req.user;
            const guestMcUsername = (req.body.mc_username || '').trim().slice(0, 64);
            if (isGuest && !guestMcUsername) {
                return res.status(400).json({ error: 'Minecraft username is required for guest donations' });
            }

            let user = null;
            if (!isGuest) {
                user = await coreDb.get('SELECT username, email FROM users WHERE id = ?', [req.user.id]);
                if (!user) return res.status(401).json({ error: 'User not found' });
            }

            const siteUrl = Config.get('siteUrl', 'http://localhost:3000');

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: rank.name + ' Rank',
                            description: rank.description || `${rank.name} rank — 30 day access`,
                        },
                        unit_amount: Math.round(rank.price * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: siteUrl + '/#/donate?status=success&session_id={CHECKOUT_SESSION_ID}',
                cancel_url: siteUrl + '/#/donate?status=cancelled',
                customer_email: (!isGuest && user.email && user.email !== `${user.username.toLowerCase()}@mc.local`) ? user.email : undefined,
                metadata: {
                    user_id: isGuest ? null : req.user.id,
                    rank_id: rank.id,
                    username: isGuest ? guestMcUsername : user.username,
                    is_guest: isGuest ? '1' : '0',
                    mc_username: isGuest ? guestMcUsername : '',
                },
            });

            const donationId = uuidv4();
            let mcUuid = null, mcUsername = isGuest ? guestMcUsername : null;
            if (!isGuest) {
                try {
                    const extLoader = require('../../../server/extension-loader');
                    const mcDb = extLoader.getExtensionDb('minecraft');
                    if (mcDb) {
                        const link = await mcDb.get('SELECT minecraft_uuid, minecraft_username FROM linked_accounts WHERE user_id = ?', [req.user.id]);
                        if (link) { mcUuid = link.minecraft_uuid; mcUsername = link.minecraft_username; }
                    }
                } catch { /* minecraft ext may not be loaded */ }
            }

            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, stripe_session_id, status, minecraft_uuid, minecraft_username, expires_at)
                 VALUES (?, ?, ?, ?, 'usd', 'one-time', ?, 'pending', ?, ?, ?)`,
                [donationId, isGuest ? null : req.user.id, rank.id, rank.price, session.id, mcUuid, mcUsername,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]
            );

            res.json({ url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('[Donations] Checkout error:', err);
            res.status(500).json({ error: 'Payment error: ' + (err.message || 'Unknown') });
        }
    });

    // POST /custom-checkout — rankless custom-amount donation (guests + logged-in users)
    router.post('/custom-checkout', optionalAuth, async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).json({ error: 'Payment system not configured. Contact an administrator.' });

            const amount = parseFloat(req.body.amount);
            if (!amount || amount < 1 || amount > 10000) {
                return res.status(400).json({ error: 'Amount must be between $1 and $10,000' });
            }

            const isGuest = !req.user;
            const guestMcUsername = (req.body.mc_username || '').trim().slice(0, 64);
            if (isGuest && !guestMcUsername) {
                return res.status(400).json({ error: 'Minecraft username is required for guest donations' });
            }

            let user = null;
            if (!isGuest) {
                user = await coreDb.get('SELECT username, email FROM users WHERE id = ?', [req.user.id]);
                if (!user) return res.status(401).json({ error: 'User not found' });
            }

            const siteUrl = Config.get('siteUrl', 'http://localhost:3000');
            const displayName = isGuest ? guestMcUsername : (user.username);

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Custom Donation',
                            description: 'Thank you for supporting the server, ' + displayName + '!',
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: siteUrl + '/#/donate?status=success&session_id={CHECKOUT_SESSION_ID}',
                cancel_url: siteUrl + '/#/donate?status=cancelled',
                customer_email: (!isGuest && user.email && user.email !== (user.username.toLowerCase() + '@mc.local')) ? user.email : undefined,
                metadata: {
                    user_id: isGuest ? '' : req.user.id,
                    rank_id: '',
                    username: displayName,
                    is_guest: isGuest ? '1' : '0',
                    mc_username: isGuest ? guestMcUsername : '',
                    is_custom: '1',
                },
            });

            const donationId = uuidv4();
            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, stripe_session_id, status, minecraft_username, expires_at)
                 VALUES (?, ?, NULL, ?, 'usd', 'one-time', ?, 'pending', ?, ?)`,
                [donationId, isGuest ? null : req.user.id, amount, session.id,
                    isGuest ? guestMcUsername : null,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]
            );

            res.json({ url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('[Donations] Custom checkout error:', err);
            res.status(500).json({ error: 'Payment error: ' + (err.message || 'Unknown') });
        }
    });

    // POST /verify-session
    router.post('/verify-session', authenticateToken, async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).json({ error: 'Payment system not configured' });

            const { session_id } = req.body;
            if (!session_id) return res.status(400).json({ error: 'session_id required' });

            const session = await stripe.checkout.sessions.retrieve(session_id);
            if (session.payment_status !== 'paid') {
                return res.json({ success: false, status: session.payment_status });
            }

            await completeDonation(session.id);
            res.json({ success: true });
        } catch (err) {
            console.error('[Donations] Verify session error:', err);
            res.status(500).json({ error: 'Verification failed' });
        }
    });

    // ══════════════════════════════════════════════════════
    // STRIPE WEBHOOK
    // ══════════════════════════════════════════════════════
    router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).send('Not configured');

            const webhookSecret = Config.get('stripe_webhook_secret');
            let event;

            if (webhookSecret) {
                const sig = req.headers['stripe-signature'];
                event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            } else {
                event = req.body;
                if (typeof event === 'string') event = JSON.parse(event);
            }

            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                if (session.payment_status === 'paid') {
                    await completeDonation(session.id);
                }
            }

            res.json({ received: true });
        } catch (err) {
            console.error('[Donations] Webhook error:', err);
            res.status(400).json({ error: 'Webhook error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // MOD / SERVER API
    // ══════════════════════════════════════════════════════
    router.get('/rank-check', async (req, res) => {
        try {
            const apiKey = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
            if (!apiKey) return res.status(403).json({ error: 'API key required' });

            let validKey = false;
            try {
                const extLoader = require('../../../server/extension-loader');
                const mcDb = extLoader.getExtensionDb('minecraft');
                if (mcDb) {
                    const server = await mcDb.get('SELECT id FROM mc_servers WHERE api_key = ?', [apiKey]);
                    validKey = !!server;
                }
            } catch { /* mc ext may not be loaded */ }
            if (!validKey) return res.status(403).json({ error: 'Invalid API key' });

            const uuid = req.query.uuid;
            if (!uuid) return res.status(400).json({ error: 'uuid required' });

            // Validate UUID format before slicing
            const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
            if (!/^[0-9a-f]{32}$/.test(cleanUuid)) return res.status(400).json({ error: 'Invalid UUID format' });
            const formattedUuid = `${cleanUuid.slice(0, 8)}-${cleanUuid.slice(8, 12)}-${cleanUuid.slice(12, 16)}-${cleanUuid.slice(16, 20)}-${cleanUuid.slice(20)}`;

            let userId = null;
            try {
                const extLoader = require('../../../server/extension-loader');
                const mcDb = extLoader.getExtensionDb('minecraft');
                if (mcDb) {
                    const link = await mcDb.get('SELECT user_id FROM linked_accounts WHERE minecraft_uuid = ?', [formattedUuid]);
                    if (link) userId = link.user_id;
                }
            } catch { /* */ }

            if (!userId) return res.json({ has_rank: false, rank: null, luckperms_group: null });

            const userRank = await extDb.get(
                `SELECT ur.*, r.name, r.luckperms_group, r.color
                 FROM user_ranks ur
                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                 WHERE ur.user_id = ? AND ur.active = 1 AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
                [userId, new Date().toISOString()]
            );

            if (!userRank) return res.json({ has_rank: false, rank: null, luckperms_group: null });

            res.json({
                has_rank: true,
                rank: userRank.name,
                luckperms_group: userRank.luckperms_group,
                color: userRank.color,
                expires_at: userRank.expires_at
            });
        } catch (err) {
            console.error('[Donations] Rank check error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN ENDPOINTS
    // ══════════════════════════════════════════════════════

    router.get('/admin/donations', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 25, 100);
            const offset = (page - 1) * limit;

            const donations = await extDb.all(
                `SELECT d.*, r.name as rank_name, r.color as rank_color
                 FROM donations d
                 LEFT JOIN donation_ranks r ON d.rank_id = r.id
                 ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            for (const d of donations) {
                const user = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [d.user_id]);
                d.username = user?.display_name || user?.username || 'Unknown';
            }

            const total = await extDb.get('SELECT COUNT(*) as count FROM donations');
            res.json({ donations, total: total.count, page, limit });
        } catch (err) {
            console.error('[Donations] Admin donations error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const totalRevenue = await extDb.get("SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'completed'");
            const totalDonations = await extDb.get("SELECT COUNT(*) as count FROM donations WHERE status = 'completed'");
            const activeRanks = await extDb.get("SELECT COUNT(*) as count FROM user_ranks WHERE active = 1");
            const thisMonth = new Date();
            thisMonth.setDate(1); thisMonth.setHours(0, 0, 0, 0);
            const monthRevenue = await extDb.get("SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'completed' AND created_at >= ?", [thisMonth.toISOString()]);

            res.json({
                total_revenue: totalRevenue.total,
                total_donations: totalDonations.count,
                active_ranks: activeRanks.count,
                month_revenue: monthRevenue.total
            });
        } catch (err) {
            console.error('[Donations] Admin stats error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/admin/ranks', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const ranks = await extDb.all('SELECT * FROM donation_ranks ORDER BY sort_order ASC');
            ranks.forEach(r => { try { r.perks = JSON.parse(r.perks || '[]'); } catch { r.perks = []; } });
            res.json(ranks);
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.put('/admin/ranks/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name, price, color, icon, description, perks, luckperms_group, sort_order, active } = req.body;
            if (!name || typeof name !== 'string' || name.trim().length === 0) return res.status(400).json({ error: 'name is required' });
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice < 0) return res.status(400).json({ error: 'price must be a non-negative number' });
            const perksJson = Array.isArray(perks) ? JSON.stringify(perks) : perks;
            await extDb.run(
                `UPDATE donation_ranks SET name=?, price=?, color=?, icon=?, description=?, perks=?, luckperms_group=?, sort_order=?, active=? WHERE id=?`,
                [name.trim(), parsedPrice, color || '#ffffff', icon || '⭐', description, perksJson, luckperms_group, sort_order || 0, active ? 1 : 0, req.params.id]
            );
            const updated = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [req.params.id]);
            if (!updated) return res.status(404).json({ error: 'Rank not found' });
            try { updated.perks = JSON.parse(updated.perks || '[]'); } catch { updated.perks = []; }
            res.json(updated);
        } catch (err) {
            console.error('[Donations] Update rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/admin/ranks', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name, price, color, icon, description, perks, luckperms_group, sort_order } = req.body;
            if (!name || !price) return res.status(400).json({ error: 'name and price required' });
            const id = 'rank_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const perksJson = Array.isArray(perks) ? JSON.stringify(perks) : (perks || '[]');
            await extDb.run(
                `INSERT INTO donation_ranks (id, name, price, color, icon, description, perks, luckperms_group, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, price, color || '#ffffff', icon || '⭐', description || '', perksJson, luckperms_group || name.toLowerCase(), sort_order || 0]
            );
            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [id]);
            try { rank.perks = JSON.parse(rank.perks || '[]'); } catch { rank.perks = []; }
            res.status(201).json(rank);
        } catch (err) {
            console.error('[Donations] Create rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.delete('/admin/ranks/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM donation_ranks WHERE id = ?', [req.params.id]);
            res.json({ message: 'Rank deleted' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.put('/admin/config', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { stripe_secret_key, stripe_webhook_secret, discord_donation_webhook, siteUrl } = req.body;
            if (stripe_secret_key !== undefined) Config.set('stripe_secret_key', stripe_secret_key);
            if (stripe_webhook_secret !== undefined) Config.set('stripe_webhook_secret', stripe_webhook_secret);
            if (discord_donation_webhook !== undefined) Config.set('discord_donation_webhook', discord_donation_webhook);
            if (siteUrl !== undefined) Config.set('siteUrl', siteUrl);
            res.json({ message: 'Config updated' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.get('/admin/config', authenticateToken, requireAdmin, async (req, res) => {
        try {
            res.json({
                stripe_secret_key: Config.get('stripe_secret_key') ? '••••••••' + (Config.get('stripe_secret_key') || '').slice(-4) : '',
                stripe_webhook_secret: Config.get('stripe_webhook_secret') ? '••••••••' : '',
                discord_donation_webhook: Config.get('discord_donation_webhook') || '',
                siteUrl: Config.get('siteUrl') || 'http://localhost:3000',
            });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/admin/grant-rank', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { user_id, rank_id, duration_days } = req.body;
            if (!user_id || !rank_id) return res.status(400).json({ error: 'user_id and rank_id required' });

            let user = await coreDb.get('SELECT id FROM users WHERE id = ?', [user_id]);
            if (!user) user = await coreDb.get('SELECT id FROM users WHERE username = ? OR display_name = ?', [user_id, user_id]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const targetUserId = user.id;
            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [rank_id]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });

            const expiresAt = duration_days
                ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
                : null;

            const existing = await extDb.get('SELECT id FROM user_ranks WHERE user_id = ?', [targetUserId]);
            if (existing) {
                await extDb.run(
                    'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                    [rank_id, expiresAt, new Date().toISOString(), targetUserId]
                );
            } else {
                await extDb.run(
                    'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
                    [uuidv4(), targetUserId, rank_id, expiresAt]
                );
            }

            res.json({ message: 'Rank granted', rank: rank.name, expires_at: expiresAt });
        } catch (err) {
            console.error('[Donations] Grant rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    router.post('/admin/manual-donation', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { username, rank_id, amount, status, created_at, grant_rank } = req.body;
            if (!username || !amount) return res.status(400).json({ error: 'Username and amount required' });

            const user = await coreDb.get('SELECT id FROM users WHERE username = ? OR display_name = ?', [username, username]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const donationId = 'manual_' + uuidv4().slice(0, 8);
            const createdAt = created_at || new Date().toISOString();
            const expiresAt = new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, created_at, expires_at)
                 VALUES (?, ?, ?, ?, 'usd', 'manual', ?, ?, ?)`,
                [donationId, user.id, rank_id || null, amount, status || 'completed', createdAt, expiresAt]
            );

            if (grant_rank && (status === 'completed' || !status) && rank_id) {
                const existing = await extDb.get('SELECT id FROM user_ranks WHERE user_id = ?', [user.id]);
                if (existing) {
                    await extDb.run(
                        'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                        [rank_id, expiresAt, createdAt, user.id]
                    );
                } else {
                    await extDb.run(
                        'INSERT INTO user_ranks (id, user_id, rank_id, active, started_at, expires_at) VALUES (?, ?, ?, 1, ?, ?)',
                        [uuidv4(), user.id, rank_id, createdAt, expiresAt]
                    );
                }
            }

            res.json({ message: 'Manual donation added', donation_id: donationId });
        } catch (err) {
            console.error('[Donations] Manual donation error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // INTERNAL: Complete a donation + send receipt email
    // Idempotent — safe to call multiple times for same session.
    // ══════════════════════════════════════════════════════
    async function completeDonation(stripeSessionId) {
        const donation = await extDb.get('SELECT * FROM donations WHERE stripe_session_id = ?', [stripeSessionId]);
        if (!donation || donation.status === 'completed') return; // idempotent

        // Mark completed first to prevent double-processing under concurrent calls
        const result = await extDb.run(
            "UPDATE donations SET status = 'completed' WHERE id = ? AND status != 'completed'",
            [donation.id]
        );
        if (!result.changes) return; // another process already completed it

        // Only grant rank if this donation is tied to a rank AND a user
        if (donation.rank_id && donation.user_id) {
            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [donation.rank_id]);
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            const existing = await extDb.get('SELECT * FROM user_ranks WHERE user_id = ?', [donation.user_id]);
            if (existing) {
                // Stack time: if same rank extend, if different rank replace (switch was already handled by convert-rank)
                let newExpiry = expiresAt;
                if (existing.rank_id === donation.rank_id && existing.expires_at && new Date(existing.expires_at) > new Date()) {
                    // Same rank — stack 30 days on top of existing expiry
                    newExpiry = new Date(new Date(existing.expires_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                }
                await extDb.run(
                    'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                    [donation.rank_id, newExpiry, new Date().toISOString(), donation.user_id]
                );
            } else {
                await extDb.run(
                    'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
                    [uuidv4(), donation.user_id, donation.rank_id, expiresAt]
                );
            }

            // Send receipt email
            const user = await coreDb.get('SELECT username, display_name, email FROM users WHERE id = ?', [donation.user_id]);
            if (user && user.email) {
                sendReceiptEmail(user, donation, rank, expiresAt).catch(err => {
                    console.error('[Donations] Receipt email error:', err);
                });
            }

            await sendDiscordWebhook(donation, rank);
        } else {
            // Custom no-rank donation — just fire Discord webhook
            await sendDiscordWebhook(donation, null);
        }

        console.log(`[Donations] ✅ Donation completed: ${donation.id} — user ${donation.user_id || 'guest'}`);
    }

    // ══════════════════════════════════════════════════════
    // EMAIL TEMPLATES
    // ══════════════════════════════════════════════════════
    async function sendReceiptEmail(user, donation, rank, expiresAt) {
        const siteName = Config.get('siteName', 'Venary');
        const siteUrl = Config.get('siteUrl', 'http://localhost:3000');
        const primaryColor = Config.get('primaryColor', '#00d4ff');
        const accentColor = Config.get('accentColor', '#7b2fff');
        const rankColor = rank?.color || primaryColor;
        const displayName = user.display_name || user.username;
        const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const donationDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const receiptId = donation.id.slice(0, 8).toUpperCase();

        const perks = (() => { try { return JSON.parse(rank?.perks || '[]'); } catch { return []; } })();
        const perksHtml = perks.length > 0
            ? perks.map(p => `<tr><td style="padding:6px 0;color:#a0a0b8;font-size:0.85rem">✓ ${p}</td></tr>`).join('')
            : '';

        await Mailer.send({
            to: user.email,
            subject: `Your ${rank?.name || 'Donation'} rank receipt — ${siteName}`,
            html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,${primaryColor},${accentColor});border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <div style="font-family:monospace;font-weight:700;font-size:1.3rem;letter-spacing:3px;color:#fff">${siteName.toUpperCase()}</div>
    <div style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-top:4px">Donation Receipt</div>
  </div>

  <!-- Body -->
  <div style="background:#111827;padding:32px;border-left:1px solid #1f2937;border-right:1px solid #1f2937">
    <p style="color:#e8e8f0;font-size:1rem;margin:0 0 8px 0">Hey <strong>${displayName}</strong>,</p>
    <p style="color:#a0a0b8;font-size:0.9rem;margin:0 0 28px 0">Thank you for supporting <strong style="color:#e8e8f0">${siteName}</strong>! Your donation means a lot to us. Here's your receipt.</p>

    <!-- Rank Badge -->
    <div style="background:#0d1117;border:2px solid ${rankColor};border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center">
      <div style="font-size:2rem;margin-bottom:8px">${rank?.icon || '⭐'}</div>
      <div style="font-size:1.3rem;font-weight:700;color:${rankColor};letter-spacing:1px">${rank?.name || 'Donation'} Rank</div>
      <div style="color:#a0a0b8;font-size:0.8rem;margin-top:4px">Active until ${expiryDate}</div>
    </div>

    <!-- Transaction Details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Receipt #</td>
        <td style="padding:10px 0;color:#e8e8f0;font-size:0.85rem;text-align:right;font-family:monospace">${receiptId}</td>
      </tr>
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Date</td>
        <td style="padding:10px 0;color:#e8e8f0;font-size:0.85rem;text-align:right">${donationDate}</td>
      </tr>
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Rank</td>
        <td style="padding:10px 0;font-size:0.85rem;text-align:right;color:${rankColor};font-weight:600">${rank?.name || '—'}</td>
      </tr>
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Duration</td>
        <td style="padding:10px 0;color:#e8e8f0;font-size:0.85rem;text-align:right">30 days</td>
      </tr>
      <tr>
        <td style="padding:14px 0;color:#e8e8f0;font-size:1rem;font-weight:700">Total</td>
        <td style="padding:14px 0;color:#22c55e;font-size:1.1rem;font-weight:800;text-align:right">$${parseFloat(donation.amount).toFixed(2)} USD</td>
      </tr>
    </table>

    ${perksHtml ? `
    <!-- Perks -->
    <div style="background:#0d1117;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <div style="color:#6b7280;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px">Your Perks</div>
      <table style="width:100%;border-collapse:collapse">${perksHtml}</table>
    </div>` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin-top:8px">
      <a href="${siteUrl}/#/donate" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,${primaryColor},${accentColor});color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem">View Your Rank</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#0d1117;border:1px solid #1f2937;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center">
    <p style="color:#4b5563;font-size:0.75rem;margin:0">Questions? Contact us at ${siteUrl}</p>
    <p style="color:#374151;font-size:0.7rem;margin:8px 0 0 0">© ${new Date().getFullYear()} ${siteName}. Thank you for your support.</p>
  </div>

</div>
</body>
</html>`
        });
    }

    async function sendConversionEmail(user, fromRank, toRank, daysRemaining, newDays, newExpiry) {
        const siteName = Config.get('siteName', 'Venary');
        const siteUrl = Config.get('siteUrl', 'http://localhost:3000');
        const primaryColor = Config.get('primaryColor', '#00d4ff');
        const accentColor = Config.get('accentColor', '#7b2fff');
        const displayName = user.display_name || user.username;
        const expiryDate = new Date(newExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        await Mailer.send({
            to: user.email,
            subject: `Rank converted to ${toRank.name} — ${siteName}`,
            html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Inter,system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="background:linear-gradient(135deg,${primaryColor},${accentColor});border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <div style="font-family:monospace;font-weight:700;font-size:1.3rem;letter-spacing:3px;color:#fff">${siteName.toUpperCase()}</div>
    <div style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-top:4px">Rank Conversion</div>
  </div>
  <div style="background:#111827;padding:32px;border:1px solid #1f2937;border-top:none">
    <p style="color:#e8e8f0;font-size:1rem;margin:0 0 8px 0">Hey <strong>${displayName}</strong>,</p>
    <p style="color:#a0a0b8;font-size:0.9rem;margin:0 0 24px 0">Your rank has been successfully converted. Here's a summary of the change.</p>
    <div style="display:flex;gap:16px;margin-bottom:24px;align-items:center;justify-content:center">
      <div style="text-align:center;padding:16px;background:#0d1117;border:2px solid ${fromRank?.color || '#666'};border-radius:10px;flex:1">
        <div style="font-size:1.5rem">${fromRank?.icon || '⭐'}</div>
        <div style="color:${fromRank?.color || '#666'};font-weight:700;font-size:0.9rem;margin-top:4px">${fromRank?.name || 'Previous'}</div>
        <div style="color:#6b7280;font-size:0.75rem">${daysRemaining} days left</div>
      </div>
      <div style="color:#6b7280;font-size:1.5rem">→</div>
      <div style="text-align:center;padding:16px;background:#0d1117;border:2px solid ${toRank.color || primaryColor};border-radius:10px;flex:1">
        <div style="font-size:1.5rem">${toRank.icon || '⭐'}</div>
        <div style="color:${toRank.color || primaryColor};font-weight:700;font-size:0.9rem;margin-top:4px">${toRank.name}</div>
        <div style="color:#6b7280;font-size:0.75rem">${newDays} days</div>
      </div>
    </div>
    <p style="color:#a0a0b8;font-size:0.85rem;text-align:center;margin:0 0 24px 0">Your new rank expires on <strong style="color:#e8e8f0">${expiryDate}</strong></p>
    <div style="text-align:center">
      <a href="${siteUrl}/#/donate" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,${primaryColor},${accentColor});color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem">View Your Rank</a>
    </div>
  </div>
  <div style="background:#0d1117;border:1px solid #1f2937;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center">
    <p style="color:#374151;font-size:0.7rem;margin:0">© ${new Date().getFullYear()} ${siteName}</p>
  </div>
</div>
</body>
</html>`
        });
    }

    // ══════════════════════════════════════════════════════
    // DISCORD WEBHOOK
    // ══════════════════════════════════════════════════════
    async function sendDiscordWebhook(donation, rank) {
        const webhookUrl = Config.get('discord_donation_webhook');
        if (!webhookUrl) return;

        try {
            const user = await coreDb.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [donation.user_id]);
            const displayName = user?.display_name || user?.username || donation.minecraft_username || 'Unknown';

            let thumbnail = null;
            if (donation.minecraft_uuid) {
                thumbnail = `https://mc-heads.net/avatar/${donation.minecraft_uuid}/128`;
            } else if (user?.avatar) {
                thumbnail = user.avatar;
            }

            const colorHex = (rank?.color || '#29b6f6').replace('#', '');
            const colorInt = parseInt(colorHex, 16);

            const embed = {
                title: '💰 New Donation!',
                description: `**${displayName}** just supported the server!`,
                color: colorInt,
                fields: [
                    { name: '💵 Amount', value: `$${donation.amount.toFixed(2)} USD`, inline: true },
                    { name: '📋 Type', value: '💎 One-Time', inline: true },
                    { name: '👑 Rank', value: rank?.name || 'Unknown', inline: true },
                    { name: '⏰ Duration', value: '30 days', inline: true },
                ],
                thumbnail: thumbnail ? { url: thumbnail } : undefined,
                footer: { text: Config.get('siteName', 'Venary') },
                timestamp: new Date().toISOString(),
            };

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: Config.get('siteName', 'Venary') + ' Donations', embeds: [embed] }),
            });

            await extDb.run('UPDATE donations SET discord_notified = 1 WHERE id = ?', [donation.id]);
        } catch (err) {
            console.error('[Donations] Discord webhook error:', err);
        }
    }

    // ══════════════════════════════════════════════════════
    // RANK EXPIRY CHECK (every 5 minutes)
    // ══════════════════════════════════════════════════════
    async function checkExpiredRanks() {
        try {
            const now = new Date().toISOString();
            const expired = await extDb.all(
                'SELECT * FROM user_ranks WHERE active = 1 AND expires_at IS NOT NULL AND expires_at < ?',
                [now]
            );
            for (const ur of expired) {
                await extDb.run('UPDATE user_ranks SET active = 0 WHERE id = ?', [ur.id]);
                console.log(`[Donations] Rank expired for user ${ur.user_id}`);
            }
        } catch (err) {
            console.error('[Donations] Expiry check error:', err);
        }
    }

    setInterval(checkExpiredRanks, 5 * 60 * 1000);
    setTimeout(checkExpiredRanks, 10000);

    return router;
};
