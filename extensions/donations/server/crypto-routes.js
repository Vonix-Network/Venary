/* =======================================
   Crypto Donation Support — API Routes
   All /api/ext/donations/crypto/* endpoints.
   ======================================= */
'use strict';

const express = require('express');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');

module.exports = function cryptoRoutes(extDb) {
    const router = express.Router();
    const coreDb  = require('../../../server/db');
    const { authenticateToken, optionalAuth } = require('../../../server/middleware/auth');
    const Config  = require('../../../server/config');

    const wallet   = require('./crypto/wallet');
    const exchange = require('./crypto/exchange');
    const balanceMgr = require('./crypto/balance');
    const monitor  = require('./crypto/monitor');
    const {
        ExchangeRateUnavailableError,
        InsufficientBalanceError,
        InvalidMnemonicError,
        WebhookSignatureError,
    } = require('./crypto/errors');

    // ── Lazy QR code generator ──
    let _qr;
    function getQR() { if (!_qr) _qr = require('qrcode'); return _qr; }

    // ── Role middleware ──
    function requireAdmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id])
            .then(u => {
                if (!u || !['admin', 'superadmin', 'moderator'].includes(u.role))
                    return res.status(403).json({ error: 'Admin access required' });
                next();
            }).catch(err => {
                console.error('[Donations/Crypto] requireAdmin DB error:', err);
                res.status(500).json({ error: 'Database error checking permissions' });
            });
    }

    function requireSuperadmin(req, res, next) {
        coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id])
            .then(u => {
                if (!u || u.role !== 'superadmin')
                    return res.status(403).json({ error: 'Superadmin access required' });
                next();
            }).catch(err => {
                console.error('[Donations/Crypto] requireSuperadmin DB error:', err);
                res.status(500).json({ error: 'Database error checking permissions' });
            });
    }

    // ── HMAC webhook signature verification ──
    function verifyWebhookSignature(rawBody, signature, secret) {
        if (!secret) return true; // no secret configured = skip verification
        const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const sigBuf = Buffer.from(signature || '', 'hex');
        const expBuf = Buffer.from(expected, 'hex');
        if (sigBuf.length !== expBuf.length) throw new WebhookSignatureError();
        if (!crypto.timingSafeEqual(sigBuf, expBuf)) throw new WebhookSignatureError();
    }

    // ══════════════════════════════════════════════════════
    // PUBLIC — RATES
    // ══════════════════════════════════════════════════════

    /** GET /crypto/rates — current SOL/USD + LTC/USD */
    router.get('/crypto/rates', async (req, res) => {
        try {
            const rates = await exchange.getRates();
            res.json(rates);
        } catch (err) {
            if (err instanceof ExchangeRateUnavailableError)
                return res.status(503).json({ error: 'Exchange rates temporarily unavailable' });
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // PAYMENT INTENTS
    // ══════════════════════════════════════════════════════

    /** POST /crypto/intent — create a payment intent */
    router.post('/crypto/intent', optionalAuth, async (req, res) => {
        try {
            const { rank_id, amount, coin, mc_username } = req.body;
            if (!coin || !['sol', 'ltc'].includes(coin))
                return res.status(400).json({ error: 'coin must be "sol" or "ltc"' });

            const chainEnabled = Config.get(`donations.crypto.${coin === 'sol' ? 'solana' : 'litecoin'}_enabled`, false);
            if (!chainEnabled)
                return res.status(503).json({ error: `${coin.toUpperCase()} payments are not enabled` });

            // Validate rank or custom amount
            let rankRow = null, usdAmount = 0;
            if (rank_id) {
                rankRow = await extDb.get('SELECT * FROM donation_ranks WHERE id = ? AND active = 1', [rank_id]);
                if (!rankRow) return res.status(404).json({ error: 'Rank not found' });
                usdAmount = rankRow.price;
            } else if (amount) {
                usdAmount = parseFloat(amount);
                if (isNaN(usdAmount) || usdAmount < 1 || usdAmount > 10000)
                    return res.status(400).json({ error: 'Amount must be between $1 and $10,000' });
            } else {
                return res.status(400).json({ error: 'rank_id or amount required' });
            }

            // Guest requires mc_username
            const isGuest = !req.user;
            if (isGuest && !mc_username?.trim())
                return res.status(400).json({ error: 'Minecraft username required for guest donations' });

            // Enforce max 5 active intents per user
            if (req.user) {
                const activeCount = await extDb.get(
                    `SELECT COUNT(*) as c FROM crypto_payment_intents WHERE user_id = ? AND status IN ('pending','detected')`,
                    [req.user.id]
                );
                if ((activeCount?.c ?? 0) >= 5)
                    return res.status(429).json({ error: 'Too many pending payment intents. Complete or cancel existing ones first.' });
            }

            // Lock rate
            const { crypto_amount, rate_used } = await exchange.lockRate(usdAmount, coin);

            // Derive a unique intent address
            const { address, index } = wallet.deriveIntentAddress(coin, Config);

            // Build intent record
            const intentId = uuidv4();
            const expiresAt = new Date(Date.now() + 240 * 60 * 60 * 1000).toISOString(); // 240h

            await extDb.run(
                `INSERT INTO crypto_payment_intents
                 (id, user_id, rank_id, coin, sol_address, ltc_address, amount_usd, locked_crypto_amount,
                  locked_exchange_rate, status, minecraft_username, expires_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
                [
                    intentId,
                    req.user?.id || null,
                    rank_id || null,
                    coin,
                    coin === 'sol' ? address : null,
                    coin === 'ltc' ? address : null,
                    usdAmount,
                    crypto_amount,
                    rate_used,
                    isGuest ? mc_username.trim() : null,
                    expiresAt,
                    new Date().toISOString(),
                ]
            );

            // Generate QR code
            const qrData = coin === 'sol'
                ? `solana:${address}?amount=${crypto_amount}`
                : `litecoin:${address}?amount=${crypto_amount}`;
            const qrDataUri = await getQR().toDataURL(qrData);

            res.json({
                intent_id: intentId,
                address,
                coin,
                amount_usd: usdAmount,
                locked_crypto_amount: crypto_amount,
                exchange_rate: rate_used,
                expires_at: expiresAt,
                qr_data_uri: qrDataUri,
                rank: rankRow ? { id: rankRow.id, name: rankRow.name, color: rankRow.color } : null,
            });
        } catch (err) {
            if (err instanceof ExchangeRateUnavailableError)
                return res.status(503).json({ error: 'Exchange rates temporarily unavailable' });
            console.error('[Donations/Crypto] Intent creation error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    /** GET /crypto/intent/:id — poll intent status */
    router.get('/crypto/intent/:id', optionalAuth, async (req, res) => {
        try {
            const intent = await extDb.get(
                'SELECT * FROM crypto_payment_intents WHERE id = ?',
                [req.params.id]
            );
            if (!intent) return res.status(404).json({ error: 'Intent not found' });

            // Mask address for unauthenticated callers
            const address = intent.coin === 'sol' ? intent.sol_address : intent.ltc_address;
            const maskedAddress = req.user ? address : (address ? '...' + address.slice(-6) : null);

            res.json({
                id: intent.id,
                coin: intent.coin,
                address: maskedAddress,
                amount_usd: intent.amount_usd,
                locked_crypto_amount: intent.locked_crypto_amount,
                status: intent.status,
                confirmations: intent.confirmations,
                expires_at: intent.expires_at,
                detected_at: intent.detected_at,
                confirmed_at: intent.confirmed_at,
                completed_at: intent.completed_at,
                rank_id: intent.rank_id,
            });
        } catch (err) {
            console.error('[Donations/Crypto] GET /crypto/intent/:id error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    /** POST /crypto/intent/:id/cancel */
    router.post('/crypto/intent/:id/cancel', authenticateToken, async (req, res) => {
        try {
            const result = await extDb.run(
                `UPDATE crypto_payment_intents SET status = 'cancelled'
                 WHERE id = ? AND user_id = ? AND status = 'pending'`,
                [req.params.id, req.user.id]
            );
            if (!result.changes) return res.status(404).json({ error: 'Intent not found or cannot be cancelled' });
            res.json({ success: true });
        } catch (err) {
            console.error('[Donations/Crypto] POST /crypto/intent/:id/cancel error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ANYTIME ADDRESSES
    // ══════════════════════════════════════════════════════

    /** GET /crypto/my-addresses — get/derive user's permanent anytime addresses */
    router.get('/crypto/my-addresses', authenticateToken, async (req, res) => {
        try {
            const solEnabled = Config.get('donations.crypto.solana_enabled', false);
            const ltcEnabled = Config.get('donations.crypto.litecoin_enabled', false);

            if (!solEnabled && !ltcEnabled)
                return res.json({ sol_address: null, ltc_address: null, sol_qr: null, ltc_qr: null });

            const addrs = await wallet.getOrCreateUserAddresses(req.user.id, extDb, Config);

            let sol_qr = null, ltc_qr = null;
            if (addrs.sol_address && solEnabled) {
                sol_qr = await getQR().toDataURL(`solana:${addrs.sol_address}`);
            }
            if (addrs.ltc_address && ltcEnabled) {
                ltc_qr = await getQR().toDataURL(`litecoin:${addrs.ltc_address}`);
            }

            res.json({
                sol_address: solEnabled ? addrs.sol_address : null,
                ltc_address: ltcEnabled ? addrs.ltc_address : null,
                sol_qr,
                ltc_qr,
            });
        } catch (err) {
            console.error('[Donations/Crypto] Anytime address error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // BALANCE
    // ══════════════════════════════════════════════════════

    /** GET /crypto/balance — user balance + ledger */
    router.get('/crypto/balance', authenticateToken, async (req, res) => {
        try {
            const usdBalance = await balanceMgr.getBalance(req.user.id, extDb);
            const ledger     = await balanceMgr.getLedger(req.user.id, 50, extDb);
            const currency   = await balanceMgr.getDisplayCurrency(req.user.id, extDb);

            let displayBalance = usdBalance;
            let rates = null;
            try {
                rates = await exchange.getRates();
                displayBalance = await balanceMgr.convertForDisplay(usdBalance, currency, rates);
            } catch { /* fallback to USD */ }

            res.json({
                usd_balance: usdBalance,
                display_balance: displayBalance,
                display_currency: currency,
                ledger,
            });
        } catch (err) {
            console.error('[Donations/Crypto] GET /crypto/balance error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    /** POST /crypto/balance/currency — update display currency preference */
    router.post('/crypto/balance/currency', authenticateToken, async (req, res) => {
        try {
            const { currency } = req.body;
            const allowed = Config.get('donations.crypto.balance_display_currencies', ['usd', 'sol', 'ltc', 'eur', 'gbp']);
            if (!currency || !allowed.includes(currency.toLowerCase()))
                return res.status(400).json({ error: `Currency must be one of: ${allowed.join(', ')}` });
            await balanceMgr.setDisplayCurrency(req.user.id, currency, extDb);
            res.json({ success: true, currency: currency.toLowerCase() });
        } catch (err) {
            console.error('[Donations/Crypto] POST /crypto/balance/currency error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    /** POST /crypto/balance/spend — spend balance on a rank */
    router.post('/crypto/balance/spend', authenticateToken, async (req, res) => {
        try {
            const { rank_id } = req.body;
            if (!rank_id) return res.status(400).json({ error: 'rank_id required' });

            const rank = await extDb.get('SELECT * FROM donation_ranks WHERE id = ? AND active = 1', [rank_id]);
            if (!rank) return res.status(404).json({ error: 'Rank not found' });

            const balance = await balanceMgr.getBalance(req.user.id, extDb);
            if (balance < rank.price) {
                return res.status(400).json({
                    error: 'Insufficient balance',
                    balance,
                    required: rank.price,
                    shortfall: Math.round((rank.price - balance) * 100) / 100,
                });
            }

            // Debit balance
            const donationId = uuidv4();
            await balanceMgr.debit(
                req.user.id,
                rank.price,
                'rank_purchase',
                `Purchased ${rank.name} rank`,
                extDb,
                donationId
            );

            // Grant rank (same logic as completeDonation)
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
            const existing = await extDb.get('SELECT * FROM user_ranks WHERE user_id = ?', [req.user.id]);
            if (existing) {
                let newExpiry = expiresAt;
                if (existing.rank_id === rank_id && existing.expires_at && new Date(existing.expires_at) > new Date()) {
                    newExpiry = new Date(new Date(existing.expires_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
                }
                await extDb.run(
                    'UPDATE user_ranks SET rank_id = ?, active = 1, expires_at = ?, started_at = ? WHERE user_id = ?',
                    [rank_id, newExpiry, new Date().toISOString(), req.user.id]
                );
            } else {
                await extDb.run(
                    'INSERT INTO user_ranks (id, user_id, rank_id, active, expires_at) VALUES (?, ?, ?, 1, ?)',
                    [uuidv4(), req.user.id, rank_id, expiresAt]
                );
            }

            // Insert donation record
            await extDb.run(
                `INSERT INTO donations (id, user_id, rank_id, amount, currency, payment_type, status, expires_at, created_at)
                 VALUES (?, ?, ?, ?, 'usd', 'balance', 'completed', ?, ?)`,
                [donationId, req.user.id, rank_id, rank.price, expiresAt, new Date().toISOString()]
            );

            res.json({ success: true, rank: rank.name, expires_at: expiresAt, new_balance: balance - rank.price });
        } catch (err) {
            if (err instanceof InsufficientBalanceError)
                return res.status(400).json({ error: 'Insufficient balance', shortfall: err.required - err.available });
            console.error('[Donations/Crypto] Balance spend error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // ══════════════════════════════════════════════════════
    // WEBHOOKS (optional acceleration layer)
    // ══════════════════════════════════════════════════════

    /** POST /crypto/webhook/solana — Helius webhook */
    router.post('/crypto/webhook/solana', express.raw({ type: 'application/json' }), async (req, res) => {
        try {
            const secret = Config.get('donations.crypto.solana_webhook_secret', '');
            const sig    = req.headers['x-helius-signature'] || req.headers['x-webhook-signature'] || '';
            verifyWebhookSignature(req.body, sig, secret);

            const payload = JSON.parse(req.body.toString());
            const txHash  = payload?.signature || payload?.[0]?.signature;
            const address = payload?.accountData?.[0]?.account || payload?.[0]?.accountData?.[0]?.account;

            if (txHash && address) {
                const intent = await extDb.get(
                    `SELECT * FROM crypto_payment_intents WHERE sol_address = ? AND status IN ('pending','detected')`,
                    [address]
                );
                if (intent) {
                    await monitor.completeCryptoIntent(intent.id, txHash, intent.locked_crypto_amount, extDb, balanceMgr, Config, coreDb);
                }
            }

            res.json({ received: true });
        } catch (err) {
            if (err instanceof WebhookSignatureError) {
                console.warn('[Donations/Crypto] 🔒 Solana webhook signature mismatch from', req.ip);
                return res.status(401).json({ error: 'Invalid signature' });
            }
            console.error('[Donations/Crypto] Solana webhook error:', err.message);
            res.json({ received: true }); // always 200 to prevent retries on our errors
        }
    });

    /** POST /crypto/webhook/litecoin — BlockCypher webhook */
    router.post('/crypto/webhook/litecoin', express.raw({ type: 'application/json' }), async (req, res) => {
        try {
            const secret = Config.get('donations.crypto.litecoin_webhook_secret', '');
            const sig    = req.headers['x-blockcypher-signature'] || req.headers['x-webhook-signature'] || '';
            verifyWebhookSignature(req.body, sig, secret);

            const payload = JSON.parse(req.body.toString());
            const txHash  = payload?.hash;
            const outputs = payload?.outputs || [];

            for (const output of outputs) {
                for (const addr of (output.addresses || [])) {
                    const intent = await extDb.get(
                        `SELECT * FROM crypto_payment_intents WHERE ltc_address = ? AND status IN ('pending','detected')`,
                        [addr]
                    );
                    if (intent && (payload.confirmations || 0) >= 3) {
                        const received = output.value / 1e8;
                        await monitor.completeCryptoIntent(intent.id, txHash, received, extDb, balanceMgr, Config, coreDb);
                    }
                }
            }

            res.json({ received: true });
        } catch (err) {
            if (err instanceof WebhookSignatureError) {
                console.warn('[Donations/Crypto] 🔒 Litecoin webhook signature mismatch from', req.ip);
                return res.status(401).json({ error: 'Invalid signature' });
            }
            console.error('[Donations/Crypto] Litecoin webhook error:', err.message);
            res.json({ received: true });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN — CRYPTO CONFIG
    // ══════════════════════════════════════════════════════

    /** GET /admin/crypto/config */
    router.get('/admin/crypto/config', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const user = await coreDb.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            const isSuperadmin = user?.role === 'superadmin';

            const solSeedEnc = Config.get('donations.crypto.solana_seed_encrypted');
            const ltcSeedEnc = Config.get('donations.crypto.litecoin_seed_encrypted');

            res.json({
                solana_enabled:   Config.get('donations.crypto.solana_enabled', false),
                litecoin_enabled: Config.get('donations.crypto.litecoin_enabled', false),
                solana_rpc_primary:   Config.get('donations.crypto.solana_rpc_primary', ''),
                solana_rpc_secondary: Config.get('donations.crypto.solana_rpc_secondary', ''),
                litecoin_rpc_primary:   Config.get('donations.crypto.litecoin_rpc_primary', ''),
                litecoin_rpc_secondary: Config.get('donations.crypto.litecoin_rpc_secondary', ''),
                solana_webhook_secret_set:   !!Config.get('donations.crypto.solana_webhook_secret'),
                litecoin_webhook_secret_set: !!Config.get('donations.crypto.litecoin_webhook_secret'),
                balance_display_currencies: Config.get('donations.crypto.balance_display_currencies', ['usd','sol','ltc','eur','gbp']),
                // Wallet info — superadmin only
                solana_seed_configured:   !!solSeedEnc,
                litecoin_seed_configured: !!ltcSeedEnc,
                solana_seed_masked:   isSuperadmin && solSeedEnc ? wallet.getMaskedSeedDisplay(solSeedEnc) : null,
                litecoin_seed_masked: isSuperadmin && ltcSeedEnc ? wallet.getMaskedSeedDisplay(ltcSeedEnc) : null,
            });
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/crypto/config error:', err);
            res.status(500).json({ error: err.message || 'Failed to load crypto config' });
        }
    });

    /** PUT /admin/crypto/config — update RPC endpoints, webhook secrets, toggles (admin+) */
    router.put('/admin/crypto/config', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const {
                solana_enabled, litecoin_enabled,
                solana_rpc_primary, solana_rpc_secondary,
                litecoin_rpc_primary, litecoin_rpc_secondary,
                solana_webhook_secret, litecoin_webhook_secret,
                balance_display_currencies,
            } = req.body;

            if (solana_enabled !== undefined)   Config.set('donations.crypto.solana_enabled', !!solana_enabled);
            if (litecoin_enabled !== undefined) Config.set('donations.crypto.litecoin_enabled', !!litecoin_enabled);
            if (solana_rpc_primary !== undefined)    Config.set('donations.crypto.solana_rpc_primary', solana_rpc_primary);
            if (solana_rpc_secondary !== undefined)  Config.set('donations.crypto.solana_rpc_secondary', solana_rpc_secondary);
            if (litecoin_rpc_primary !== undefined)  Config.set('donations.crypto.litecoin_rpc_primary', litecoin_rpc_primary);
            if (litecoin_rpc_secondary !== undefined) Config.set('donations.crypto.litecoin_rpc_secondary', litecoin_rpc_secondary);
            if (solana_webhook_secret !== undefined)   Config.set('donations.crypto.solana_webhook_secret', solana_webhook_secret);
            if (litecoin_webhook_secret !== undefined) Config.set('donations.crypto.litecoin_webhook_secret', litecoin_webhook_secret);
            if (Array.isArray(balance_display_currencies)) Config.set('donations.crypto.balance_display_currencies', balance_display_currencies);

            res.json({ message: 'Crypto config updated' });
        } catch (err) {
            console.error('[Donations/Crypto] PUT /admin/crypto/config error:', err);
            res.status(500).json({ error: err.message || 'Failed to save crypto config' });
        }
    });

    /** PUT /admin/crypto/wallet — set/update seed phrase (superadmin only) */
    router.put('/admin/crypto/wallet', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const { solana_mnemonic, litecoin_mnemonic } = req.body;

            if (solana_mnemonic !== undefined) {
                if (!wallet.validateMnemonic(solana_mnemonic))
                    return res.status(400).json({ error: 'Invalid Solana BIP39 mnemonic' });
                Config.set('donations.crypto.solana_seed_encrypted', wallet.encryptSeed(solana_mnemonic));
            }

            if (litecoin_mnemonic !== undefined) {
                if (!wallet.validateMnemonic(litecoin_mnemonic))
                    return res.status(400).json({ error: 'Invalid Litecoin BIP39 mnemonic' });
                Config.set('donations.crypto.litecoin_seed_encrypted', wallet.encryptSeed(litecoin_mnemonic));
            }

            res.json({ message: 'Wallet seed updated successfully' });
        } catch (err) {
            console.error('[Donations/Crypto] Wallet update error:', err);
            res.status(500).json({ error: err.message || 'Failed to save wallet seed' });
        }
    });

    /** POST /admin/crypto/generate-seed — generate a new BIP39 mnemonic (superadmin only) */
    router.post('/admin/crypto/generate-seed', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const mnemonic = wallet.generateMnemonic();
            // Return plaintext ONCE — admin must save it; we do not store it here
            res.json({ mnemonic, word_count: mnemonic.split(' ').length });
        } catch (err) {
            console.error('[Donations/Crypto] generate-seed error:', err);
            res.status(500).json({ error: err.message || 'Failed to generate seed phrase' });
        }
    });

    /**
     * GET /admin/crypto/wallet/reveal — decrypt and return stored seed phrase(s).
     * Superadmin-only recovery endpoint. Every call is logged with the requesting user ID.
     */
    router.get('/admin/crypto/wallet/reveal', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const solSeedEnc = Config.get('donations.crypto.solana_seed_encrypted');
            const ltcSeedEnc = Config.get('donations.crypto.litecoin_seed_encrypted');

            if (!solSeedEnc && !ltcSeedEnc) {
                return res.status(404).json({ error: 'No seed phrases are configured' });
            }

            const result = {};
            if (solSeedEnc) result.solana_mnemonic = wallet.decryptSeed(solSeedEnc);
            if (ltcSeedEnc) {
                // Avoid redundant decryption when both coins share the same encrypted seed
                result.litecoin_mnemonic = ltcSeedEnc === solSeedEnc
                    ? result.solana_mnemonic
                    : wallet.decryptSeed(ltcSeedEnc);
            }

            console.warn(`[Donations/Crypto] 🔑 Seed reveal accessed by superadmin ${req.user.id} from ${req.ip}`);
            res.json(result);
        } catch (err) {
            console.error('[Donations/Crypto] Seed reveal error:', err.message);
            res.status(500).json({ error: 'Failed to decrypt seed phrase' });
        }
    });

    /** GET /admin/crypto/status — live blockchain connectivity */
    router.get('/admin/crypto/status', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const solEnabled = Config.get('donations.crypto.solana_enabled', false);
            const ltcEnabled = Config.get('donations.crypto.litecoin_enabled', false);
            const result = {};

            if (solEnabled) {
                try {
                    const rpcUrl = Config.get('donations.crypto.solana_rpc_primary', 'https://api.mainnet-beta.solana.com');
                    const r = await fetch(rpcUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
                        signal: AbortSignal.timeout(5000),
                    });
                    result.solana = r.ok ? 'connected' : 'degraded';
                } catch { result.solana = 'offline'; }
            } else {
                result.solana = 'disabled';
            }

            if (ltcEnabled) {
                try {
                    const r = await fetch('https://api.blockcypher.com/v1/ltc/main', { signal: AbortSignal.timeout(5000) });
                    result.litecoin = r.ok ? 'connected' : 'degraded';
                } catch { result.litecoin = 'offline'; }
            } else {
                result.litecoin = 'disabled';
            }

            res.json(result);
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/crypto/status error:', err);
            res.status(500).json({ error: err.message || 'Failed to check chain status' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN — INTENT MANAGEMENT
    // ══════════════════════════════════════════════════════

    /** GET /admin/crypto/intents — paginated intent list with filters */
    router.get('/admin/crypto/intents', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const page   = parseInt(req.query.page) || 1;
            const limit  = Math.min(parseInt(req.query.limit) || 25, 100);
            const offset = (page - 1) * limit;
            const { status, coin, date_from, date_to } = req.query;

            let where = '1=1';
            const params = [];
            if (status) { where += ' AND i.status = ?'; params.push(status); }
            if (coin)   { where += ' AND i.coin = ?';   params.push(coin); }
            if (date_from) { where += ' AND i.created_at >= ?'; params.push(date_from); }
            if (date_to)   { where += ' AND i.created_at <= ?'; params.push(date_to); }

            // users lives in coreDb — fetch intents first, then enrich with user data
            const intents = await extDb.all(
                `SELECT i.*
                 FROM crypto_payment_intents i
                 WHERE ${where}
                 ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            for (const intent of intents) {
                if (intent.user_id) {
                    const u = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [intent.user_id]);
                    intent.username = u?.username || null;
                    intent.display_name = u?.display_name || null;
                }
            }

            const total = await extDb.get(
                `SELECT COUNT(*) as c FROM crypto_payment_intents i WHERE ${where}`,
                params
            );

            res.json({ intents, total: total.c, page, limit });
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/crypto/intents error:', err);
            res.status(500).json({ error: err.message || 'Failed to load intents' });
        }
    });

    /** POST /admin/crypto/intents/:id/confirm — manual confirmation */
    router.post('/admin/crypto/intents/:id/confirm', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { tx_hash } = req.body;
            if (!tx_hash) return res.status(400).json({ error: 'tx_hash required' });

            const intent = await extDb.get('SELECT * FROM crypto_payment_intents WHERE id = ?', [req.params.id]);
            if (!intent) return res.status(404).json({ error: 'Intent not found' });

            await monitor.completeCryptoIntent(
                intent.id, tx_hash, intent.locked_crypto_amount, extDb, balanceMgr, Config, coreDb
            );

            console.log(`[Donations/Crypto] Admin ${req.user.id} manually confirmed intent ${intent.id}`);
            res.json({ success: true });
        } catch (err) {
            console.error('[Donations/Crypto] Intent confirm error:', err);
            res.status(500).json({ error: err.message || 'Failed to confirm intent' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN — BALANCE MANAGEMENT
    // ══════════════════════════════════════════════════════

    /** GET /admin/balances — paginated user balance list */
    router.get('/admin/balances', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const page   = parseInt(req.query.page) || 1;
            const limit  = Math.min(parseInt(req.query.limit) || 25, 100);
            const offset = (page - 1) * limit;
            const searchRaw = req.query.search?.trim();

            // users lives in coreDb — resolve matching IDs there first when searching
            let userIdWhere = '';
            let userIdParams = [];
            if (searchRaw) {
                const pattern = `%${searchRaw}%`;
                const matched = await coreDb.all(
                    'SELECT id FROM users WHERE username LIKE ? OR display_name LIKE ?',
                    [pattern, pattern]
                );
                if (!matched.length) return res.json({ balances: [], total: 0, page, limit });
                userIdWhere = `WHERE b.user_id IN (${matched.map(() => '?').join(',')})`;
                userIdParams = matched.map(u => u.id);
            }

            const rows = await extDb.all(
                `SELECT b.user_id, b.usd_balance, b.updated_at, p.balance_display_currency
                 FROM user_balances b
                 LEFT JOIN user_preferences p ON b.user_id = p.user_id
                 ${userIdWhere}
                 ORDER BY b.usd_balance DESC LIMIT ? OFFSET ?`,
                [...userIdParams, limit, offset]
            );

            // Enrich each row with username/display_name from coreDb
            for (const row of rows) {
                const u = await coreDb.get('SELECT username, display_name FROM users WHERE id = ?', [row.user_id]);
                row.username = u?.username || null;
                row.display_name = u?.display_name || null;
            }

            const countRow = await extDb.get(
                `SELECT COUNT(*) as c FROM user_balances b ${userIdWhere}`,
                userIdParams
            );

            res.json({ balances: rows, total: countRow.c, page, limit });
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/balances error:', err);
            res.status(500).json({ error: err.message || 'Failed to load balances' });
        }
    });

    /** POST /admin/balances/:userId/adjust — manual balance adjustment */
    router.post('/admin/balances/:userId/adjust', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const { amount, reason } = req.body;
            if (amount === undefined || amount === 0) return res.status(400).json({ error: 'Non-zero amount required' });
            if (!reason?.trim()) return res.status(400).json({ error: 'Reason is required' });

            const user = await coreDb.get('SELECT id FROM users WHERE id = ?', [req.params.userId]);
            if (!user) return res.status(404).json({ error: 'User not found' });

            await balanceMgr.adminAdjust(req.user.id, req.params.userId, parseFloat(amount), reason.trim(), extDb);

            const newBalance = await balanceMgr.getBalance(req.params.userId, extDb);
            res.json({ success: true, new_balance: newBalance });
        } catch (err) {
            if (err instanceof InsufficientBalanceError)
                return res.status(400).json({ error: 'Cannot debit below zero', shortfall: err.required - err.available });
            res.status(500).json({ error: err.message || 'Server error' });
        }
    });

    /** GET /admin/balances/:userId/ledger — user balance ledger */
    router.get('/admin/balances/:userId/ledger', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const ledger = await balanceMgr.getLedger(req.params.userId, 100, extDb);
            res.json(ledger);
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/balances/:userId/ledger error:', err);
            res.status(500).json({ error: err.message || 'Failed to load ledger' });
        }
    });

    /** GET /admin/crypto/stats — crypto donation statistics */
    router.get('/admin/crypto/stats', authenticateToken, requireAdmin, async (req, res) => {
        try {
            const pending   = await extDb.get(`SELECT COUNT(*) as c FROM crypto_payment_intents WHERE status IN ('pending','detected')`);
            const confirmed = await extDb.get(`SELECT COUNT(*) as c FROM crypto_payment_intents WHERE status = 'completed' AND DATE(completed_at) = DATE('now')`);
            const failed    = await extDb.get(`SELECT COUNT(*) as c FROM crypto_payment_intents WHERE status IN ('expired','cancelled')`);
            const totalSol  = await extDb.get(`SELECT COALESCE(SUM(amount_usd),0) as t FROM crypto_payment_intents WHERE coin='sol' AND status='completed'`);
            const totalLtc  = await extDb.get(`SELECT COALESCE(SUM(amount_usd),0) as t FROM crypto_payment_intents WHERE coin='ltc' AND status='completed'`);

            res.json({
                pending_intents: pending.c,
                confirmed_today: confirmed.c,
                failed_expired:  failed.c,
                total_sol_usd:   totalSol.t,
                total_ltc_usd:   totalLtc.t,
            });
        } catch (err) {
            console.error('[Donations/Crypto] GET /admin/crypto/stats error:', err);
            res.status(500).json({ error: err.message || 'Failed to load stats' });
        }
    });

    // ══════════════════════════════════════════════════════
    // ADMIN — WALLET VIEWER (superadmin only)
    // ══════════════════════════════════════════════════════

    /**
     * GET /admin/crypto/wallet/addresses
     * Returns all user HD wallet addresses (from user_crypto_addresses) and all
     * admin-generated standalone addresses (from admin_wallet_addresses).
     */
    router.get('/admin/crypto/wallet/addresses', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const userRows = await extDb.all(
                'SELECT * FROM user_crypto_addresses ORDER BY derivation_index ASC'
            );
            for (const row of userRows) {
                const u = await coreDb.get(
                    'SELECT username, display_name FROM users WHERE id = ?', [row.user_id]
                );
                row.username     = u?.username     || null;
                row.display_name = u?.display_name || null;
            }

            let adminRows = [];
            try {
                adminRows = await extDb.all(
                    'SELECT * FROM admin_wallet_addresses ORDER BY derivation_index ASC'
                );
            } catch { /* table not yet created — will exist after next restart */ }

            res.json({ user_addresses: userRows, admin_addresses: adminRows });
        } catch (err) {
            console.error('[Donations/Crypto] wallet/addresses error:', err);
            res.status(500).json({ error: err.message || 'Failed to load wallet addresses' });
        }
    });

    /**
     * GET /admin/crypto/wallet/address/:coin/:address/balance
     * Fetches the live on-chain balance for a single address from Solana RPC or BlockCypher.
     */
    router.get('/admin/crypto/wallet/address/:coin/:address/balance', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const { coin, address } = req.params;

            if (coin === 'sol') {
                const rpcUrl = Config.get('donations.crypto.solana_rpc_primary', 'https://api.mainnet-beta.solana.com');
                const r = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] }),
                    signal: AbortSignal.timeout(8000),
                });
                if (!r.ok) throw new Error(`Solana RPC HTTP ${r.status}`);
                const data = await r.json();
                if (data.error) throw new Error(data.error.message || 'RPC error');
                res.json({ coin, address, balance: (data?.result?.value ?? 0) / 1e9 });

            } else if (coin === 'ltc') {
                const r = await fetch(
                    `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/balance`,
                    { signal: AbortSignal.timeout(8000) }
                );
                if (!r.ok) throw new Error(`BlockCypher HTTP ${r.status}`);
                const data = await r.json();
                const satoshis = (data.balance ?? 0) + (data.unconfirmed_balance ?? 0);
                res.json({ coin, address, balance: satoshis / 1e8 });

            } else {
                res.status(400).json({ error: 'coin must be "sol" or "ltc"' });
            }
        } catch (err) {
            console.error('[Donations/Crypto] wallet/address/balance error:', err);
            res.status(500).json({ error: err.message || 'Failed to fetch balance' });
        }
    });

    /**
     * GET /admin/crypto/wallet/address/:coin/:address/transactions
     * Returns recent transactions for an address via Solana RPC (getSignaturesForAddress)
     * or BlockCypher full address endpoint.
     */
    router.get('/admin/crypto/wallet/address/:coin/:address/transactions', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const { coin, address } = req.params;
            const limit = Math.min(parseInt(req.query.limit) || 20, 50);

            if (coin === 'sol') {
                const rpcUrl = Config.get('donations.crypto.solana_rpc_primary', 'https://api.mainnet-beta.solana.com');
                const r = await fetch(rpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'getSignaturesForAddress',
                        params: [address, { limit }],
                    }),
                    signal: AbortSignal.timeout(10000),
                });
                if (!r.ok) throw new Error(`Solana RPC HTTP ${r.status}`);
                const data = await r.json();
                if (data.error) throw new Error(data.error.message || 'RPC error');
                const sigs = data?.result ?? [];
                res.json({
                    coin, address,
                    transactions: sigs.map(s => ({
                        hash:          s.signature,
                        status:        s.err ? 'failed' : (s.confirmationStatus || 'confirmed'),
                        confirmations: s.confirmationStatus === 'finalized' ? 32
                            : s.confirmationStatus === 'confirmed' ? 1 : 0,
                        timestamp:    s.blockTime ? new Date(s.blockTime * 1000).toISOString() : null,
                        explorer_url: `https://solscan.io/tx/${s.signature}`,
                    })),
                });

            } else if (coin === 'ltc') {
                const r = await fetch(
                    `https://api.blockcypher.com/v1/ltc/main/addrs/${address}/full?limit=${limit}`,
                    { signal: AbortSignal.timeout(12000) }
                );
                if (!r.ok) throw new Error(`BlockCypher HTTP ${r.status}`);
                const data = await r.json();
                res.json({
                    coin, address,
                    transactions: (data.txs || []).map(tx => {
                        const received = (tx.outputs || [])
                            .filter(o => (o.addresses || []).includes(address))
                            .reduce((sum, o) => sum + (o.value || 0), 0) / 1e8;
                        const sent = (tx.inputs || [])
                            .filter(i => (i.addresses || []).includes(address))
                            .reduce((sum, i) => sum + (i.output_value || 0), 0) / 1e8;
                        return {
                            hash:          tx.hash,
                            status:        tx.confirmed ? 'confirmed' : 'pending',
                            confirmations: tx.confirmations || 0,
                            amount:        Math.round((received - sent) * 1e8) / 1e8,
                            timestamp:     tx.confirmed || tx.received || null,
                            explorer_url:  `https://live.blockcypher.com/ltc/tx/${tx.hash}/`,
                        };
                    }),
                });

            } else {
                res.status(400).json({ error: 'coin must be "sol" or "ltc"' });
            }
        } catch (err) {
            console.error('[Donations/Crypto] wallet/address/transactions error:', err);
            res.status(500).json({ error: err.message || 'Failed to fetch transactions' });
        }
    });

    /**
     * POST /admin/crypto/wallet/derive
     * Derives the next admin wallet address (index ≥ 20000) from the stored seed,
     * persists it in admin_wallet_addresses, and returns the result.
     */
    router.post('/admin/crypto/wallet/derive', authenticateToken, requireSuperadmin, async (req, res) => {
        try {
            const solSeedEnc = Config.get('donations.crypto.solana_seed_encrypted');
            const ltcSeedEnc = Config.get('donations.crypto.litecoin_seed_encrypted');
            if (!solSeedEnc && !ltcSeedEnc)
                return res.status(400).json({ error: 'No wallet seed configured. Set up a seed phrase in Crypto Settings first.' });

            // Admin address indices start at 20000 — clear separation from user (1+) and intent (10000+) spaces
            const BASE = 20000;
            let lastRow = null;
            try { lastRow = await extDb.get('SELECT MAX(derivation_index) as m FROM admin_wallet_addresses'); } catch { /* table not yet created */ }
            const nextIndex = Math.max(BASE, (lastRow?.m ?? BASE - 1) + 1);

            let sol_address = null, ltc_address = null;
            if (solSeedEnc) {
                const { address } = wallet.deriveSolanaAddress(wallet.decryptSeed(solSeedEnc), nextIndex);
                sol_address = address;
            }
            if (ltcSeedEnc) {
                ltc_address = wallet.deriveLitecoinAddress(wallet.decryptSeed(ltcSeedEnc), nextIndex);
            }

            const label = req.body?.label?.trim() || null;
            await extDb.run(
                'INSERT INTO admin_wallet_addresses (id, derivation_index, sol_address, ltc_address, label) VALUES (?, ?, ?, ?, ?)',
                [uuidv4(), nextIndex, sol_address, ltc_address, label]
            );

            res.json({ derivation_index: nextIndex, sol_address, ltc_address, label });
        } catch (err) {
            console.error('[Donations/Crypto] wallet/derive error:', err);
            res.status(500).json({ error: err.message || 'Failed to derive address' });
        }
    });

    return router;
};
