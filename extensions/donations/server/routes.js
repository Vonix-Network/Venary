/* ARCHIVED — NOT LOADED BY THE SERVER. Live file: server/routes/donations.js
 * =======================================
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

    // ── Mount crypto routes (all /crypto/* endpoints) ──
    const cryptoRoutes = require('./crypto-routes');
    router.use('/', cryptoRoutes(extDb));

    // ── Start blockchain monitor after mount ──
    // Only runs in manual HD-wallet mode — payment providers use webhooks instead.
    const balanceMgr    = require('./crypto/balance');
    const monitor       = require('./crypto/monitor');
    const activeProvider = Config.get('donations.crypto.provider', 'manual');
    const solEnabled    = Config.get('donations.crypto.solana_enabled', false);
    const ltcEnabled    = Config.get('donations.crypto.litecoin_enabled', false);
    if (activeProvider === 'manual' && (solEnabled || ltcEnabled)) {
        monitor.startMonitoring(extDb, balanceMgr, Config, coreDb);
    }

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

            // ── Crypto tables migration (idempotent CREATE IF NOT EXISTS) ──
            const cryptoTables = [
                `CREATE TABLE IF NOT EXISTS user_crypto_addresses (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    derivation_index INTEGER NOT NULL,
                    sol_address TEXT,
                    ltc_address TEXT,
                    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE TABLE IF NOT EXISTS crypto_payment_intents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    rank_id TEXT,
                    coin TEXT NOT NULL,
                    sol_address TEXT,
                    ltc_address TEXT,
                    amount_usd REAL NOT NULL,
                    locked_crypto_amount REAL NOT NULL,
                    locked_exchange_rate REAL NOT NULL,
                    tolerance_pct REAL DEFAULT 5.0,
                    status TEXT DEFAULT 'pending',
                    tx_hash TEXT,
                    confirmed_amount_crypto REAL,
                    confirmations INTEGER DEFAULT 0,
                    minecraft_username TEXT,
                    expires_at TEXT NOT NULL,
                    detected_at TEXT,
                    confirmed_at TEXT,
                    completed_at TEXT,
                    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE TABLE IF NOT EXISTS anytime_address_txs (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    tx_hash TEXT NOT NULL UNIQUE,
                    coin TEXT NOT NULL,
                    crypto_amount REAL NOT NULL,
                    usd_amount REAL NOT NULL,
                    exchange_rate REAL NOT NULL,
                    status TEXT DEFAULT 'credited',
                    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE TABLE IF NOT EXISTS user_balances (
                    user_id TEXT PRIMARY KEY,
                    usd_balance REAL NOT NULL DEFAULT 0.0,
                    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE TABLE IF NOT EXISTS balance_transactions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    amount_usd REAL NOT NULL,
                    source TEXT NOT NULL,
                    description TEXT,
                    reference_id TEXT,
                    admin_id TEXT,
                    created_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT PRIMARY KEY,
                    balance_display_currency TEXT DEFAULT 'usd',
                    updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
                )`,
                `CREATE INDEX IF NOT EXISTS idx_crypto_intents_status ON crypto_payment_intents(status)`,
                `CREATE INDEX IF NOT EXISTS idx_crypto_intents_coin ON crypto_payment_intents(coin)`,
                `CREATE INDEX IF NOT EXISTS idx_crypto_intents_user ON crypto_payment_intents(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_crypto_intents_expires ON crypto_payment_intents(expires_at)`,
                `CREATE INDEX IF NOT EXISTS idx_anytime_txs_user ON anytime_address_txs(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_anytime_txs_hash ON anytime_address_txs(tx_hash)`,
                `CREATE INDEX IF NOT EXISTS idx_balance_txs_user ON balance_transactions(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_user_crypto_addr_user ON user_crypto_addresses(user_id)`,
                `CREATE INDEX IF NOT EXISTS idx_crypto_intents_provider_pid ON crypto_payment_intents(provider_payment_id)`,
            ];
            for (const sql of cryptoTables) {
                await extDb.run(sql).catch(() => {}); // each is idempotent
            }

            // ── Payment provider columns — added after initial schema, safe to run repeatedly ──
            await extDb.run(`ALTER TABLE crypto_payment_intents ADD COLUMN provider TEXT DEFAULT 'manual'`).catch(() => {});
            await extDb.run(`ALTER TABLE crypto_payment_intents ADD COLUMN provider_payment_id TEXT`).catch(() => {});

            // ── Balance-applied column for partial balance + Stripe payments ──
            await extDb.run(`ALTER TABLE donations ADD COLUMN balance_applied REAL DEFAULT 0`).catch(() => {});

            // ── Guest email — optional email address for receipt + account linking on registration ──
            await extDb.run(`ALTER TABLE donations ADD COLUMN guest_email TEXT`).catch(() => {});

            // ── Atomic intent address counter (DB-backed, avoids Config race) ──
            await extDb.run(`CREATE TABLE IF NOT EXISTS crypto_intent_counter (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 10000)`).catch(() => {});

            console.log('[Donations] ✅ Crypto tables migration complete');

            // ── donation_ranks: ensure luckperms_group column exists ──
            // Safe for both SQLite and PostgreSQL — error means column already exists, caught and ignored.
            await extDb.run(`ALTER TABLE donation_ranks ADD COLUMN luckperms_group TEXT`).catch(() => {});
            // Back-fill any rows missing a luckperms_group with a sensible default derived from the rank name.
            await extDb.run(`UPDATE donation_ranks SET luckperms_group = lower(replace(name, ' ', '_')) WHERE luckperms_group IS NULL OR luckperms_group = ''`).catch(() => {});
            console.log('[Donations] ✅ donation_ranks luckperms_group migration complete');
        } catch (err) {
            console.error('[Donations] Migration error:', err.message);
        }
    })();

    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id]).then(u => {
            if (!u || !['admin', 'superadmin'].includes(u.role)) return res.status(403).json({ error: 'Admin access required' });
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
            const extLoader = require('../../../server/extension-loader');
            const mcDb = extLoader.getExtensionDb('minecraft');
            
            for (const uid of userIds) {
                const u = await coreDb.get('SELECT id, username, display_name, avatar FROM users WHERE id = ?', [uid]);
                if (u) {
                    userMap[uid] = u;
                    if (mcDb) {
                        try {
                            const link = await mcDb.get('SELECT minecraft_uuid, minecraft_username FROM linked_accounts WHERE user_id = ?', [uid]);
                            if (link) {
                                userMap[uid].mc_uuid = link.minecraft_uuid;
                                userMap[uid].mc_username = link.minecraft_username;
                            }
                        } catch { /* ignore if no table/ext */ }
                    }
                }
            }
            for (const d of donations) {
                const user = d.user_id ? userMap[d.user_id] : null;
                d.username = user?.display_name || user?.username || d.minecraft_username || 'Anonymous';
                d.avatar = user?.avatar || null;
                
                // If donation row lacks MC data, check the linked account
                if (!d.minecraft_uuid && user?.mc_uuid) d.minecraft_uuid = user.mc_uuid;
                if (!d.minecraft_username && user?.mc_username) d.minecraft_username = user.mc_username;
                
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
            const guestMcUsername = (req.body.mc_username || '').trim().slice(0, 16); // Minecraft usernames are max 16 characters
            if (isGuest && !guestMcUsername) {
                return res.status(400).json({ error: 'Minecraft username is required for guest donations' });
            }

            // Optional guest email — used for receipt delivery and account linking on registration
            const rawGuestEmail = isGuest ? (req.body.guest_email || '').trim().toLowerCase() : '';
            const guestEmail = rawGuestEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawGuestEmail) ? rawGuestEmail : null;

            let user = null;
            if (!isGuest) {
                user = await coreDb.get('SELECT username, email FROM users WHERE id = ?', [req.user.id]);
                if (!user) return res.status(401).json({ error: 'User not found' });
            }

            // ── Partial balance application ──
            // balance_apply is the USD amount the user wants deducted from their credit balance.
            // Guests cannot apply balance. We validate against their actual balance.
            let confirmedBalanceApply = 0;
            if (!isGuest && req.body.balance_apply) {
                const requestedApply = parseFloat(req.body.balance_apply) || 0;
                if (requestedApply > 0) {
                    const balMgr = require('./crypto/balance');
                    const actualBalance = await balMgr.getBalance(req.user.id, extDb);
                    // Cap to available balance and rank price
                    confirmedBalanceApply = Math.min(requestedApply, actualBalance, rank.price);
                    confirmedBalanceApply = Math.round(confirmedBalanceApply * 100) / 100;
                }
            }

            const chargedAmount = Math.max(rank.price - confirmedBalanceApply, 0);
            if (chargedAmount === 0) {
                return res.status(400).json({ error: 'Use the balance spend endpoint for fully covered purchases' });
            }
            // Stripe minimum is $0.50
            const stripeAmount = Math.max(chargedAmount, 0.50);

            const siteUrl = Config.get('siteUrl', 'http://localhost:3000');

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: rank.name + ' Rank',
                            description: confirmedBalanceApply > 0
                                ? `${rank.name} rank — $${confirmedBalanceApply.toFixed(2)} credit applied`
                                : (rank.description || `${rank.name} rank — 30 day access`),
                        },
                        unit_amount: Math.round(stripeAmount * 100),
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: siteUrl + '/#/donate?status=success&session_id={CHECKOUT_SESSION_ID}',
                cancel_url: siteUrl + '/#/donate?status=cancelled',
                customer_email: isGuest
                    ? (guestEmail || undefined)
                    : (user.email && !user.email.endsWith('@mc.local') ? user.email : undefined),
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
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, stripe_session_id, status, minecraft_uuid, minecraft_username, expires_at, balance_applied, guest_email)
                 VALUES (?, ?, ?, ?, 'usd', 'one-time', ?, 'pending', ?, ?, ?, ?, ?)`,
                [donationId, isGuest ? null : req.user.id, rank.id, rank.price, session.id, mcUuid, mcUsername,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), confirmedBalanceApply, guestEmail]
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
            const guestMcUsername = (req.body.mc_username || '').trim().slice(0, 16); // Minecraft usernames are max 16 characters
            if (isGuest && !guestMcUsername) {
                return res.status(400).json({ error: 'Minecraft username is required for guest donations' });
            }

            // Optional guest email for receipt + account linking on registration
            const rawGuestEmailC = isGuest ? (req.body.guest_email || '').trim().toLowerCase() : '';
            const guestEmailC = rawGuestEmailC && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawGuestEmailC) ? rawGuestEmailC : null;

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
                customer_email: isGuest
                    ? (guestEmailC || undefined)
                    : (user.email && !user.email.endsWith('@mc.local') ? user.email : undefined),
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
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, stripe_session_id, status, minecraft_username, expires_at, guest_email)
                 VALUES (?, ?, NULL, ?, 'usd', 'one-time', ?, 'pending', ?, ?, ?)`,
                [donationId, isGuest ? null : req.user.id, amount, session.id,
                    isGuest ? guestMcUsername : null,
                    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), guestEmailC]
            );

            res.json({ url: session.url, sessionId: session.id });
        } catch (err) {
            console.error('[Donations] Custom checkout error:', err);
            res.status(500).json({ error: 'Payment error: ' + (err.message || 'Unknown') });
        }
    });

    // POST /verify-session — verify Stripe payment and return receipt details
    // Uses optionalAuth so guests (no JWT) can also confirm their payment.
    router.post('/verify-session', optionalAuth, async (req, res) => {
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

            // Return receipt details so the frontend can render a confirmation screen
            const donation = await extDb.get(
                `SELECT d.id, d.amount, d.currency, d.payment_type, d.expires_at, d.minecraft_username,
                        r.name as rank_name, r.color as rank_color, r.icon as rank_icon
                 FROM donations d
                 LEFT JOIN donation_ranks r ON d.rank_id = r.id
                 WHERE d.stripe_session_id = ?`,
                [session.id]
            );

            res.json({
                success: true,
                receipt: donation ? {
                    ref: donation.id.slice(0, 8).toUpperCase(),
                    amount: donation.amount,
                    currency: donation.currency || 'usd',
                    rank_name: donation.rank_name || null,
                    rank_color: donation.rank_color || null,
                    rank_icon: donation.rank_icon || null,
                    expires_at: donation.expires_at || null,
                    minecraft_username: donation.minecraft_username || null,
                } : null,
            });
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
                // ⚠️  WARNING: No stripe_webhook_secret configured.
                // Without signature verification ANY POST to this endpoint will trigger donation
                // completion. Set stripe_webhook_secret in the admin panel for production.
                console.warn('[Donations] ⚠️  Stripe webhook received without signature verification — configure stripe_webhook_secret for production!');
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

    router.get('/admin/ranked-users', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            const offset = (page - 1) * limit;

            const rankedUsers = await extDb.all(
                `SELECT ur.*, r.name as rank_name, r.color as rank_color
                 FROM user_ranks ur
                 LEFT JOIN donation_ranks r ON ur.rank_id = r.id
                 WHERE ur.active = 1
                 ORDER BY ur.started_at DESC LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            for (const ur of rankedUsers) {
                const user = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [ur.user_id]);
                ur.username = user?.display_name || user?.username || 'Unknown';
            }

            const total = await extDb.get('SELECT COUNT(*) as count FROM user_ranks WHERE active = 1');
            res.json({ users: rankedUsers, total: total.count, page, limit });
        } catch (err) {
            console.error('[Donations] Admin ranked users error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

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
                const user = d.user_id
                    ? await coreDb.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [d.user_id])
                    : null;
                d.username = user?.display_name || user?.username || d.minecraft_username || 'Guest';
                d.avatar   = user?.avatar || null; // site profile picture; null = guest, use MC-Heads on client
            }

            const total = await extDb.get('SELECT COUNT(*) as count FROM donations');
            res.json({ donations, total: total.count, page, limit });
        } catch (err) {
            console.error('[Donations] Admin donations error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    /** PATCH /admin/donations/:id — update user assignment, rank, amount, or status */
    router.patch('/admin/donations/:id', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const donation = await extDb.get('SELECT * FROM donations WHERE id = ?', [req.params.id]);
            if (!donation) return res.status(404).json({ error: 'Donation not found' });

            let userId = donation.user_id;

            // Reassign to a registered user (empty string = clear assignment to guest)
            if (req.body.username !== undefined) {
                const uname = req.body.username.trim();
                if (!uname) {
                    userId = null;
                } else {
                    const user = await coreDb.get(
                        'SELECT id FROM users WHERE username = ? OR display_name = ?',
                        [uname, uname]
                    );
                    if (!user) return res.status(404).json({ error: `No registered user found for "${uname}"` });
                    userId = user.id;
                }
            }

            const newRankId = req.body.rank_id !== undefined ? (req.body.rank_id || null) : donation.rank_id;
            const newAmount = req.body.amount  !== undefined ? parseFloat(req.body.amount)  : donation.amount;
            const newStatus = req.body.status  !== undefined ? req.body.status               : donation.status;

            if (isNaN(newAmount) || newAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
            const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
            if (!validStatuses.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });

            await extDb.run(
                'UPDATE donations SET user_id=?, rank_id=?, amount=?, status=? WHERE id=?',
                [userId, newRankId, newAmount, newStatus, donation.id]
            );

            // If now completed + rank assigned + has a real user, ensure user_ranks is up-to-date
            if (newStatus === 'completed' && newRankId && userId) {
                const expiresAt = donation.expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                const existing = await extDb.get('SELECT id FROM user_ranks WHERE user_id = ?', [userId]);
                if (existing) {
                    await extDb.run(
                        'UPDATE user_ranks SET rank_id=?, active=1, expires_at=? WHERE user_id=?',
                        [newRankId, expiresAt, userId]
                    );
                } else {
                    await extDb.run(
                        'INSERT INTO user_ranks (id, user_id, rank_id, active, started_at, expires_at) VALUES (?,?,?,1,?,?)',
                        [require('crypto').randomUUID(), userId, newRankId, new Date().toISOString(), expiresAt]
                    );
                }
            }

            res.json({ message: 'Donation updated' });
        } catch (err) {
            console.error('[Donations] PATCH donation error:', err);
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
            const lpGroup = typeof luckperms_group === 'string' ? luckperms_group.trim().toLowerCase() : null;
            await extDb.run(
                `UPDATE donation_ranks SET name=?, price=?, color=?, icon=?, description=?, perks=?, luckperms_group=?, sort_order=?, active=? WHERE id=?`,
                [name.trim(), parsedPrice, color || '#ffffff', icon || '⭐', description, perksJson, lpGroup, sort_order || 0, active ? 1 : 0, req.params.id]
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
            const lpGroup = typeof luckperms_group === 'string' && luckperms_group.trim() ? luckperms_group.trim().toLowerCase() : name.toLowerCase().replace(/\s+/g, '_');
            await extDb.run(
                `INSERT INTO donation_ranks (id, name, price, color, icon, description, perks, luckperms_group, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, name, price, color || '#ffffff', icon || '⭐', description || '', perksJson, lpGroup, sort_order || 0]
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
            const { username, mc_username, guest_mode, rank_id, amount, status, created_at, grant_rank } = req.body;
            if (!amount) return res.status(400).json({ error: 'Amount required' });

            const donationId = 'manual_' + uuidv4().slice(0, 8);
            const createdAt  = created_at || new Date().toISOString();
            const expiresAt  = new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const doneStatus = status || 'completed';

            if (guest_mode) {
                // Guest — no registered account, store by MC username only
                if (!mc_username) return res.status(400).json({ error: 'Minecraft username required for guest donations' });
                await extDb.run(
                    `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, minecraft_username, created_at, expires_at)
                     VALUES (?, NULL, ?, ?, 'usd', 'manual', ?, ?, ?, ?)`,
                    [donationId, rank_id || null, amount, doneStatus, mc_username, createdAt, expiresAt]
                );
            } else {
                // Registered user lookup
                if (!username) return res.status(400).json({ error: 'Username required' });
                const user = await coreDb.get('SELECT id FROM users WHERE username = ? OR display_name = ?', [username, username]);
                if (!user) return res.status(404).json({ error: `No registered user found for "${username}"` });

                await extDb.run(
                    `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, created_at, expires_at)
                     VALUES (?, ?, ?, ?, 'usd', 'manual', ?, ?, ?)`,
                    [donationId, user.id, rank_id || null, amount, doneStatus, createdAt, expiresAt]
                );

                if (grant_rank && doneStatus === 'completed' && rank_id) {
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

        // Deduct any pre-committed balance after Stripe confirms — safe here since the row is locked.
        if (donation.user_id && donation.balance_applied > 0) {
            try {
                const balMgr = require('./crypto/balance');
                await balMgr.debit(
                    donation.user_id,
                    donation.balance_applied,
                    'rank_purchase',
                    `Balance applied to donation #${donation.id}`,
                    extDb,
                    donation.id
                );
                console.log(`[Donations] Balance deducted: $${donation.balance_applied} from user ${donation.user_id}`);
            } catch (err) {
                console.error('[Donations] Balance deduction error (non-fatal):', err.message);
            }
        }

        // Grant rank if tied to a rank AND an authenticated user.
        // Guest rank purchases (user_id = null) are logged here; rank assignment for guests
        // happens via the Minecraft plugin polling /rank-check by minecraft_username.
        if (donation.rank_id && !donation.user_id && donation.minecraft_username) {
            console.log(`[Donations] Guest rank purchase completed: ${donation.minecraft_username} → rank ${donation.rank_id} (fulfilled via /rank-check)`);
        }
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

            // Send receipt email (skip synthetic @mc.local addresses)
            const user = await coreDb.get('SELECT username, display_name, email FROM users WHERE id = ?', [donation.user_id]);
            const hasRealEmail = user && user.email && !user.email.endsWith('@mc.local');
            if (hasRealEmail) {
                sendReceiptEmail(user, donation, rank, expiresAt).catch(err => {
                    console.error('[Donations] Receipt email error:', err);
                });
            }

            // Guest rank purchase with email — send receipt (rank granted via Minecraft plugin)
            if (!donation.user_id && donation.guest_email) {
                sendReceiptEmail(
                    { email: donation.guest_email, username: donation.minecraft_username || 'Guest', display_name: donation.minecraft_username || 'Guest' },
                    donation, rank, expiresAt
                ).catch(err => console.error('[Donations] Guest rank receipt email error:', err));
            }

            await sendDiscordWebhook(donation, rank);
        } else {
            // Custom no-rank donation OR guest rank purchase without user_id — credit balance if logged in
            if (donation.user_id) {
                try {
                    const balanceMgr = require('./crypto/balance');
                    await balanceMgr.credit(
                        donation.user_id,
                        donation.amount,
                        'stripe_custom',
                        'Custom donation via Stripe',
                        extDb,
                        donation.id
                    );
                } catch (err) {
                    console.error('[Donations] Balance credit error:', err.message);
                }

                // Send a receipt email for the custom donation too
                try {
                    const user = await coreDb.get('SELECT username, display_name, email FROM users WHERE id = ?', [donation.user_id]);
                    const hasRealEmail = user && user.email && !user.email.endsWith('@mc.local');
                    if (hasRealEmail) {
                        await sendReceiptEmail(user, donation, null, null).catch(err => {
                            console.error('[Donations] Custom donation receipt email error:', err);
                        });
                    }
                } catch (err) {
                    console.error('[Donations] Custom donation email lookup error:', err.message);
                }
            }

            // Guest custom donation with email — send receipt
            if (!donation.user_id && donation.guest_email) {
                sendReceiptEmail(
                    { email: donation.guest_email, username: donation.minecraft_username || 'Guest', display_name: donation.minecraft_username || 'Guest' },
                    donation, null, null
                ).catch(err => console.error('[Donations] Guest custom receipt email error:', err));
            }

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
        const isRankPurchase = !!rank;
        const expiryDate = isRankPurchase && expiresAt
            ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : null;
        const donationDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const receiptId = donation.id.slice(0, 8).toUpperCase();
        const balanceApplied = parseFloat(donation.balance_applied) || 0;
        const fullAmount = parseFloat(donation.amount) || 0;
        const chargedAmount = Math.max(fullAmount - balanceApplied, 0);

        const perks = (() => { try { return JSON.parse(rank?.perks || '[]'); } catch { return []; } })();
        const perksHtml = perks.length > 0
            ? perks.map(p => `<tr><td style="padding:6px 0;color:#a0a0b8;font-size:0.85rem">✓ ${p}</td></tr>`).join('')
            : '';

        await Mailer.send({
            to: user.email,
            subject: isRankPurchase
                ? `Your ${rank.name} rank receipt — ${siteName}`
                : `Your donation receipt — ${siteName}`,
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

    ${isRankPurchase ? `
    <!-- Rank Badge -->
    <div style="background:#0d1117;border:2px solid ${rankColor};border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center">
      <div style="font-size:2rem;margin-bottom:8px">${rank.icon || '⭐'}</div>
      <div style="font-size:1.3rem;font-weight:700;color:${rankColor};letter-spacing:1px">${rank.name} Rank</div>
      ${expiryDate ? `<div style="color:#a0a0b8;font-size:0.8rem;margin-top:4px">Active until ${expiryDate}</div>` : ''}
    </div>` : `
    <!-- Custom donation badge -->
    <div style="background:#0d1117;border:2px solid ${primaryColor};border-radius:12px;padding:20px 24px;margin-bottom:24px;text-align:center">
      <div style="font-size:2rem;margin-bottom:8px">💙</div>
      <div style="font-size:1.1rem;font-weight:700;color:${primaryColor}">One-Time Donation</div>
      <div style="color:#a0a0b8;font-size:0.8rem;margin-top:4px">Thank you for your generosity!</div>
    </div>`}

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
      ${isRankPurchase ? `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Rank</td>
        <td style="padding:10px 0;font-size:0.85rem;text-align:right;color:${rankColor};font-weight:600">${rank.name}</td>
      </tr>
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Duration</td>
        <td style="padding:10px 0;color:#e8e8f0;font-size:0.85rem;text-align:right">30 days</td>
      </tr>` : ''}
      ${balanceApplied > 0 ? `
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Subtotal</td>
        <td style="padding:10px 0;color:#e8e8f0;font-size:0.85rem;text-align:right">$${fullAmount.toFixed(2)} USD</td>
      </tr>
      <tr style="border-bottom:1px solid #1f2937">
        <td style="padding:10px 0;color:#6b7280;font-size:0.85rem">Credit Applied</td>
        <td style="padding:10px 0;color:#10b981;font-size:0.85rem;text-align:right">−$${balanceApplied.toFixed(2)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:14px 0;color:#e8e8f0;font-size:1rem;font-weight:700">Total Charged</td>
        <td style="padding:14px 0;color:#22c55e;font-size:1.1rem;font-weight:800;text-align:right">$${chargedAmount.toFixed(2)} USD</td>
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
      <a href="${siteUrl}/#/donate" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,${primaryColor},${accentColor});color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem">${isRankPurchase ? 'View Your Rank' : 'Back to Donations'}</a>
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
