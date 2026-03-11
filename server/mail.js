/* =======================================
   Venary — Mail / SMTP Utility
   Reads SMTP config from Config and sends
   transactional emails via Nodemailer.
   ======================================= */
const nodemailer = require('nodemailer');
const Config = require('./config');

const Mailer = {
    /**
     * Returns a transporter built from current SMTP config.
     * Returns null if SMTP is not configured or disabled.
     */
    _createTransport() {
        const smtp = Config.get('smtp', {});
        if (!smtp.enabled || !smtp.host) return null;

        return nodemailer.createTransporter({
            host: smtp.host,
            port: smtp.port || 587,
            secure: smtp.secure || false,   // true for 465, false for other ports
            auth: smtp.user ? {
                user: smtp.user,
                pass: smtp.pass
            } : undefined,
            tls: {
                rejectUnauthorized: smtp.rejectUnauthorized !== false
            }
        });
    },

    /**
     * Send a single email.
     * @param {Object} opts  – { to, subject, html, text }
     * @returns {Promise<{accepted: string[]}>}
     */
    async send({ to, subject, html, text }) {
        const transport = this._createTransport();
        if (!transport) {
            console.log(`[Mailer] SMTP not configured — skipping email to ${to} (subject: ${subject})`);
            return { skipped: true };
        }

        const smtp = Config.get('smtp', {});
        const fromName = Config.get('siteName', 'Venary');
        const fromEmail = smtp.from || smtp.user || `no-reply@venary.app`;

        return transport.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, '')
        });
    },

    /**
     * Convenience: send a test email to verify SMTP config.
     */
    async sendTest(toAddress) {
        const siteName = Config.get('siteName', 'Venary');
        return this.send({
            to: toAddress,
            subject: `✅ SMTP test from ${siteName}`,
            html: `
                <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#111;color:#e8e8f0;padding:32px;border-radius:12px">
                    <h2 style="color:#00d4ff;margin-bottom:8px">📧 SMTP Test Successful</h2>
                    <p>Your <strong>${siteName}</strong> platform is correctly configured to send emails.</p>
                    <p style="color:#888;font-size:0.85rem">Sent at: ${new Date().toUTCString()}</p>
                </div>
            `
        });
    },

    // ──────────────────────────────────────────────
    // Notification helpers
    // ──────────────────────────────────────────────

    /** Called when a user receives a new friend request */
    async notifyFriendRequest(recipientEmail, fromUser, settings) {
        if (!this._shouldSend('notifyFriendRequests', settings)) return;
        const siteName = Config.get('siteName', 'Venary');
        return this.send({
            to: recipientEmail,
            subject: `${fromUser} sent you a friend request on ${siteName}`,
            html: this._template(siteName, `
                <h2 style="color:#00d4ff">👥 New Friend Request</h2>
                <p><strong>${fromUser}</strong> wants to connect with you on ${siteName}.</p>
                <a href="#/friends" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00d4ff;color:#000;border-radius:8px;text-decoration:none;font-weight:600">View Request</a>
            `)
        });
    },

    /** Called when user receives a direct message */
    async notifyNewMessage(recipientEmail, fromUser, preview, settings) {
        if (!this._shouldSend('notifyMessages', settings)) return;
        const siteName = Config.get('siteName', 'Venary');
        return this.send({
            to: recipientEmail,
            subject: `${fromUser} sent you a message on ${siteName}`,
            html: this._template(siteName, `
                <h2 style="color:#00d4ff">💬 New Message</h2>
                <p><strong>${fromUser}</strong> sent you a message:</p>
                <blockquote style="border-left:3px solid #00d4ff;margin:12px 0;padding:8px 16px;color:#aaa;font-style:italic">${preview}</blockquote>
                <a href="#/chat" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00d4ff;color:#000;border-radius:8px;text-decoration:none;font-weight:600">Reply</a>
            `)
        });
    },

    /** Called when user's post receives a comment */
    async notifyComment(recipientEmail, fromUser, postPreview, settings) {
        if (!this._shouldSend('notifyComments', settings)) return;
        const siteName = Config.get('siteName', 'Venary');
        return this.send({
            to: recipientEmail,
            subject: `${fromUser} commented on your post on ${siteName}`,
            html: this._template(siteName, `
                <h2 style="color:#00d4ff">🗨️ New Comment</h2>
                <p><strong>${fromUser}</strong> commented on your post: <em>${postPreview}</em></p>
                <a href="#/feed" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00d4ff;color:#000;border-radius:8px;text-decoration:none;font-weight:600">View Post</a>
            `)
        });
    },

    /** Account welcome email after registration */
    async notifyWelcome(recipientEmail, username) {
        if (!Config.get('notifications.welcomeEmail', true)) return;
        const siteName = Config.get('siteName', 'Venary');
        return this.send({
            to: recipientEmail,
            subject: `Welcome to ${siteName}, ${username}! 🎮`,
            html: this._template(siteName, `
                <h2 style="color:#00d4ff">🎮 Welcome aboard, ${username}!</h2>
                <p>Your account on <strong>${siteName}</strong> is ready. Start connecting with other gamers, sharing your victories, and levelling up your profile.</p>
                <a href="#/profile" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#00d4ff;color:#000;border-radius:8px;text-decoration:none;font-weight:600">Complete Your Profile</a>
            `)
        });
    },

    // ──────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────
    _shouldSend(key, perUserSettings) {
        // Per-user settings override global defaults
        if (perUserSettings && perUserSettings[key] !== undefined) return perUserSettings[key];
        return Config.get(`notifications.${key}`, true);
    },

    _template(siteName, body) {
        return `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#111827;color:#e8e8f0;border-radius:12px;overflow:hidden">
            <div style="background:linear-gradient(135deg,#00d4ff,#7b2fff);padding:20px 24px">
                <span style="font-family:monospace;font-weight:700;font-size:1.1rem;letter-spacing:2px;color:#fff">${siteName.toUpperCase()}</span>
            </div>
            <div style="padding:28px 24px">${body}</div>
            <div style="padding:16px 24px;border-top:1px solid #1f2937;font-size:0.75rem;color:#6b7280">
                You're receiving this because you have notifications enabled on ${siteName}.
            </div>
        </div>`;
    }
};

module.exports = Mailer;
