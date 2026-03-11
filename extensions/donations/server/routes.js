/* =======================================
   Donations & Ranks Extension — API Routes
   Stripe payment gateway, Discord webhooks,
   rank management, and mod API.
   ======================================= */
const express = require('express');
const { v4: uuidv4 } = require('uuid');

module.exports = function (extDb) {
    const router = express.Router();
    const coreDb = require('../../../server/db');
    const { authenticateToken, optionalAuth } = require('../../../server/middleware/auth');
    const Config = require('../../../server/config');

    // ── Helpers ──────────────────────────────────────────
    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id]).then(u => {
            if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
            next();
        }).catch(() => res.status(500).json({ error: 'Server error' }));
    }

    function getStripe() {
        const key = Config.get('stripe_secret_key');
        if (!key || key === 'YOUR_STRIPE_SECRET_KEY') return null;
        return require('stripe')(key);
    }

    // ══════════════════════════════════════════════════════
    // PUBLIC ENDPOINTS
    // ══════════════════════════════════════════════════════

    // GET /ranks — list active donation ranks
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

    // GET /recent — recent donations (public, anonymized opt)
    router.get('/recent', async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 10, 50);
            const donations = await extDb.all(
                `SELECT d.id, d.amount, d.currency, d.payment_type, d.created_at, d.minecraft_username,
                        r.name as rank_name, r.color as rank_color
                 FROM donations d
                 LEFT JOIN donation_ranks r ON d.rank_id = r.id
                 WHERE d.status = 'completed'
                 ORDER BY d.created_at DESC LIMIT ?`,
                [limit]
            );
            // Get usernames from core DB
            for (const d of donations) {
                const user = await coreDb.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [d.user_id || '']);
                d.username = user?.display_name || user?.username || d.minecraft_username || 'Anonymous';
                d.avatar = user?.avatar || null;
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

    // GET /my-rank — get current user's active rank
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

    // POST /checkout — create Stripe checkout session
    router.post('/checkout', authenticateToken, async (req, res) => {
        try {
            const stripe = getStripe();
            if (!stripe) return res.status(503).json({ error: 'Payment system not configured. Contact an administrator.' });

            const { rank_id } = req.body;
            if (!rank_id) return res.status(400).json({ error: 'rank_id is required' });

            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ? AND active = 1', [rank_id]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });

            // Get user info
            const user = await coreDb.get('SELECT username, email FROM users WHERE id = ?', [req.user.id]);
            if (!user) return res.status(401).json({ error: 'User not found' });

            const siteUrl = Config.get('siteUrl', 'http://localhost:3000');

            // Create Stripe checkout session (one-time payment for 30 days)
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: rank.name + ' Rank',
                            description: rank.description || `${rank.name} rank — 30 day access`,
                        },
                        unit_amount: Math.round(rank.price * 100), // cents
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: siteUrl + '/#/donate?status=success&session_id={CHECKOUT_SESSION_ID}',
                cancel_url: siteUrl + '/#/donate?status=cancelled',
                customer_email: user.email !== `${user.username.toLowerCase()}@mc.local` ? user.email : undefined,
                metadata: {
                    user_id: req.user.id,
                    rank_id: rank.id,
                    username: user.username,
                },
            });

            // Create pending donation record
            const donationId = uuidv4();

            // Try to get MC link
            let mcUuid = null, mcUsername = null;
            try {
                const extLoader = require('../../../server/extension-loader');
                const mcDb = extLoader.getExtensionDb('minecraft');
                if (mcDb) {
                    const link = await mcDb.get('SELECT minecraft_uuid, minecraft_username FROM linked_accounts WHERE user_id = ?', [req.user.id]);
                    if (link) { mcUuid = link.minecraft_uuid; mcUsername = link.minecraft_username; }
                }
            } catch { /* minecraft ext may not be loaded */ }

            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, stripe_session_id, status, minecraft_uuid, minecraft_username, expires_at)
                 VALUES (?, ?, ?, ?, 'usd', 'one-time', ?, 'pending', ?, ?, ?)`,
                [donationId, req.user.id, rank.id, rank.price, session.id, mcUuid, mcUsername,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]
            );

            res.json({ url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('[Donations] Checkout error:', err);
            res.status(500).json({ error: 'Payment error: ' + (err.message || 'Unknown') });
        }
    });

    // POST /verify-session — verify a completed Stripe session (called by frontend after redirect)
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

            // Mark donation as completed
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
    // MOD / SERVER API (API key protected)
    // ══════════════════════════════════════════════════════

    // GET /rank-check — check a player's rank by MC UUID (for mod on join)
    router.get('/rank-check', async (req, res) => {
        try {
            // Accept API key from minecraft ext servers OR from auth header
            const apiKey = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
            if (!apiKey) return res.status(403).json({ error: 'API key required' });

            // Validate against minecraft ext servers
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

            // Format UUID
            const cleanUuid = uuid.replace(/-/g, '').toLowerCase();
            const formattedUuid = `${cleanUuid.slice(0, 8)}-${cleanUuid.slice(8, 12)}-${cleanUuid.slice(12, 16)}-${cleanUuid.slice(16, 20)}-${cleanUuid.slice(20)}`;

            // Look up linked account → user_id → active rank
            let userId = null;
            try {
                const extLoader = require('../../../server/extension-loader');
                const mcDb = extLoader.getExtensionDb('minecraft');
                if (mcDb) {
                    const link = await mcDb.get('SELECT user_id FROM linked_accounts WHERE minecraft_uuid = ?', [formattedUuid]);
                    if (link) userId = link.user_id;
                }
            } catch { /* */ }

            if (!userId) {
                return res.json({ has_rank: false, rank: null, luckperms_group: null });
            }

            const userRank = await extDb.get(
                `SELECT ur.*, r.name, r.luckperms_group, r.color
                 FROM user_ranks ur
                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                 WHERE ur.user_id = ? AND ur.active = 1 AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
                [userId, new Date().toISOString()]
            );

            if (!userRank) {
                return res.json({ has_rank: false, rank: null, luckperms_group: null });
            }

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

    // GET /admin/donations — list all donations
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

            // Enrich with usernames
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

    // GET /admin/stats — donation stats
    router.get('/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const totalRevenue = await extDb.get("SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'completed'");
            const totalDonations = await extDb.get("SELECT COUNT(*) as count FROM donations WHERE status = 'completed'");
            const activeRanks = await extDb.get("SELECT COUNT(*) as count FROM user_ranks WHERE active = 1");
            const thisMonth = new Date();
            thisMonth.setDate(1);
            thisMonth.setHours(0, 0, 0, 0);
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

    // GET /admin/ranks — list all ranks (including inactive)
    router.get('/admin/ranks', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const ranks = await extDb.all('SELECT * FROM donation_ranks ORDER BY sort_order ASC');
            ranks.forEach(r => { try { r.perks = JSON.parse(r.perks || '[]'); } catch { r.perks = []; } });
            res.json(ranks);
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT /admin/ranks/:id — update a rank
    router.put('/admin/ranks/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { name, price, color, icon, description, perks, luckperms_group, sort_order, active } = req.body;
            const perksJson = Array.isArray(perks) ? JSON.stringify(perks) : perks;

            await extDb.run(
                `UPDATE donation_ranks SET name=?, price=?, color=?, icon=?, description=?, perks=?, luckperms_group=?, sort_order=?, active=? WHERE id=?`,
                [name, price, color, icon || '⭐', description, perksJson, luckperms_group, sort_order || 0, active ? 1 : 0, req.params.id]
            );

            const updated = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [req.params.id]);
            try { updated.perks = JSON.parse(updated.perks || '[]'); } catch { updated.perks = []; }
            res.json(updated);
        } catch (err) {
            console.error('[Donations] Update rank error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // POST /admin/ranks — create a new rank
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

    // DELETE /admin/ranks/:id — delete a rank
    router.delete('/admin/ranks/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            await extDb.run('DELETE FROM donation_ranks WHERE id = ?', [req.params.id]);
            res.json({ message: 'Rank deleted' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // PUT /admin/config — update donation settings
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

    // GET /admin/config — get donation settings
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

    // POST /admin/grant-rank — manually assign a rank to a user
    router.post('/admin/grant-rank', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { user_id, rank_id, duration_days } = req.body;
            if (!user_id || !rank_id) return res.status(400).json({ error: 'user_id and rank_id required' });

            // Find user by ID first, then by username
            let user = await coreDb.get('SELECT id FROM users WHERE id = ?', [user_id]);
            if (!user) {
                user = await coreDb.get('SELECT id FROM users WHERE username = ? OR display_name = ?', [user_id, user_id]);
            }
            if (!user) return res.status(404).json({ error: 'User not found' });

            const targetUserId = user.id;
            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [rank_id]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });

            const expiresAt = duration_days
                ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
                : null;

            // Upsert user_ranks
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

    // POST /admin/manual-donation — manually add a donation record (e.g. PayPal)
    router.post('/admin/manual-donation', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { username, rank_id, amount, status, created_at, grant_rank } = req.body;
            if (!username || !amount) return res.status(400).json({ error: 'Username and amount required' });

            // Find user by username
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

            // If grant_rank is true and status is completed, also update user_ranks
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
    // INTERNAL: Complete a donation
    // ══════════════════════════════════════════════════════
    async function completeDonation(stripeSessionId) {
        const donation = await extDb.get('SELECT * FROM donations WHERE stripe_session_id = ?', [stripeSessionId]);
        if (!donation || donation.status === 'completed') return;

        // Mark as completed
        await extDb.run("UPDATE donations SET status = 'completed' WHERE id = ?", [donation.id]);

        // Activate/extend rank
        const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ?', [donation.rank_id]);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const existing = await extDb.get('SELECT * FROM user_ranks WHERE user_id = ?', [donation.user_id]);
        if (existing) {
            // If upgrading or renewing, extend from current expiry or now
            let newExpiry = expiresAt;
            if (existing.expires_at && new Date(existing.expires_at) > new Date()) {
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

        // Send Discord webhook
        await sendDiscordWebhook(donation, rank);

        console.log(`[Donations] ✅ Donation completed: ${donation.id} — ${rank?.name || 'Unknown'} for user ${donation.user_id}`);
    }

    // ══════════════════════════════════════════════════════
    // DISCORD WEBHOOK
    // ══════════════════════════════════════════════════════
    async function sendDiscordWebhook(donation, rank) {
        const webhookUrl = Config.get('discord_donation_webhook');
        if (!webhookUrl) return;

        try {
            // Get user info for the embed
            const user = await coreDb.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [donation.user_id]);
            const displayName = user?.display_name || user?.username || donation.minecraft_username || 'Unknown';

            // Determine thumbnail: MC head first, then user avatar, then default
            let thumbnail = null;
            if (donation.minecraft_uuid) {
                thumbnail = `https://mc-heads.net/avatar/${donation.minecraft_uuid}/128`;
            } else if (user?.avatar) {
                thumbnail = user.avatar;
            }

            // Color from rank (convert hex to decimal)
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
                footer: { text: 'Vonix Network' },
                timestamp: new Date().toISOString(),
            };

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'Vonix Donations',
                    embeds: [embed],
                }),
            });

            // Mark as notified
            await extDb.run('UPDATE donations SET discord_notified = 1 WHERE id = ?', [donation.id]);
        } catch (err) {
            console.error('[Donations] Discord webhook error:', err);
        }
    }

    // ══════════════════════════════════════════════════════
    // RANK EXPIRY CHECK (runs every 5 minutes)
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
