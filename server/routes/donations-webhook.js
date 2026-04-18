/* =======================================
   Stripe Webhook Handler — Standalone
   Mounted BEFORE express.json() to preserve raw body
   ======================================= */
'use strict';

const express = require('express');
const router = express.Router();
const Config = require('../config');
const db = require('../db');
const Mailer = require('../mail');

// Lazy Stripe instance
function getStripe() {
    const key = Config.get('stripe_secret_key');
    if (!key || key === 'YOUR_STRIPE_SECRET_KEY') return null;
    if (!getStripe._instance || getStripe._key !== key) {
        getStripe._instance = require('stripe')(key);
        getStripe._key = key;
    }
    return getStripe._instance;
}

// Complete a donation from Stripe session
async function completeDonation(stripeSessionId) {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

    const existing = await db.get('SELECT id, status FROM donations WHERE transaction_id = ?', [session.id]);
    if (existing?.status === 'completed') return existing;

    const metadata = session.metadata || {};
    const userId = metadata.user_id || null;
    const rankId = metadata.rank_id || null;
    const isGuest = metadata.is_guest === 'true';
    const guestMcUsername = metadata.guest_mc_username || null;
    const guestEmail = metadata.guest_email || null;
    const appliedBalance = parseFloat(metadata.applied_balance || '0');

    const amount = session.amount_total / 100;
    const currency = session.currency.toUpperCase();

    let donationId;
    if (existing) {
        donationId = existing.id;
        await db.run(
            `UPDATE donations SET status = 'completed', amount = ?, currency = ?, 
             payment_type = 'stripe', completed_at = datetime('now'), 
             minecraft_username = COALESCE(?, minecraft_username)
             WHERE id = ?`,
            [amount, currency, guestMcUsername, donationId]
        );
    } else {
        const result = await db.run(
            `INSERT INTO donations (user_id, rank_id, amount, currency, payment_type, status, 
             transaction_id, minecraft_username, guest_email, balance_applied, created_at, completed_at)
             VALUES (?, ?, ?, ?, 'stripe', 'completed', ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [userId, rankId, amount, currency, session.id, guestMcUsername, guestEmail, appliedBalance]
        );
        donationId = result.lastID;
    }

    const donation = await db.get('SELECT * FROM donations WHERE id = ?', [donationId]);

    if (rankId && userId) {
        const existingRank = await db.get(
            'SELECT id FROM user_ranks WHERE user_id = ? AND rank_id = ? AND active = 1',
            [userId, rankId]
        );
        if (!existingRank) {
            await db.run(
                `INSERT INTO user_ranks (user_id, rank_id, acquired_at, expires_at, active)
                 VALUES (?, ?, datetime('now'), datetime('now', '+30 days'), 1)`,
                [userId, rankId]
            );
        }
    }

    const rank = rankId ? await db.get('SELECT * FROM donation_ranks WHERE id = ?', [rankId]) : null;

    if (userId) {
        const user = await db.get('SELECT email, username, display_name FROM users WHERE id = ?', [userId]);
        if (user?.email) {
            await Mailer.sendDonationReceipt(
                user.email,
                amount,
                currency,
                donationId,
                rank?.name || 'Custom Amount',
                user.username,
                rank?.luckperms_group || null
            ).catch(err => console.error('[Donations] Receipt email error:', err));
        }
    } else if (guestEmail) {
        await Mailer.sendGuestDonationReceipt(
            guestEmail,
            amount,
            currency,
            donationId,
            rank?.name || 'Custom Amount',
            guestMcUsername || 'Unknown',
            null,
            null,
            null
        ).catch(err => console.error('[Donations] Guest receipt email error:', err));
    }

    await sendDiscordWebhook(donation, rank);
    console.log(`[Donations] ✅ Donation completed: ${donationId} — user ${userId || 'guest'}`);

    return donation;
}

async function sendDiscordWebhook(donation, rank) {
    const webhookUrl = Config.get('discord_donation_webhook');
    if (!webhookUrl) return;
    try {
        const user = donation.user_id 
            ? await db.get('SELECT username, display_name, avatar FROM users WHERE id = ?', [donation.user_id])
            : null;
        const displayName = user?.display_name || user?.username || donation.minecraft_username || 'Unknown';

        let thumbnail = null;
        if (donation.user_id && !user?.avatar) {
            const link = await db.get('SELECT minecraft_uuid FROM linked_accounts WHERE user_id = ?', [donation.user_id]);
            if (link?.minecraft_uuid) thumbnail = `https://crafatar.com/avatars/${link.minecraft_uuid}`;
        } else if (user?.avatar) {
            thumbnail = user.avatar;
        }

        const colorInt = parseInt((rank?.color || '#29b6f6').replace('#', ''), 16);
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                embeds: [{
                    title: `💎 New Donation: ${rank?.name || 'Custom Amount'}`,
                    description: `**${displayName}** donated **$${donation.amount.toFixed(2)} ${donation.currency}**`,
                    color: colorInt,
                    thumbnail: thumbnail ? { url: thumbnail } : undefined,
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Venary Donations' }
                }]
            })
        });
        await db.run('UPDATE donations SET discord_notified = 1 WHERE id = ?', [donation.id]);
    } catch (err) {
        console.error('[Donations] Discord webhook error:', err);
    }
}

// Main webhook handler
router.post('/', async (req, res) => {
    try {
        const stripe = getStripe();
        if (!stripe) return res.status(503).send('Not configured');

        const webhookSecret = Config.get('stripe_webhook_secret');
        let event;

        if (webhookSecret) {
            const sig = req.headers['stripe-signature'];
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            console.warn('[Donations] ⚠️  Stripe webhook received without signature verification — configure stripe_webhook_secret for production!');
            event = req.body;
            if (typeof event === 'string') event = JSON.parse(event);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            if (session.payment_status === 'paid') await completeDonation(session.id);
        }

        res.json({ received: true });
    } catch (err) {
        console.error('[Donations] Webhook error:', err);
        res.status(400).json({ error: 'Webhook error' });
    }
});

module.exports = router;
