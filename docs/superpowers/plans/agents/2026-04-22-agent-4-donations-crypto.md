# Agent 4 — Donations + Crypto Audit & Upgrade

## Status: Pending

## Context

Live production site (Ubuntu VPS, PostgreSQL). Schema compatibility mandatory — no DROP/RENAME. Use `db.run/get/all()` with `?` placeholders only. Push every commit immediately.

**Files owned:**
- `server/routes/donations.js` (1227 lines)
- `server/routes/donations-crypto.js` (1125 lines)
- `server/routes/donations-webhook.js`
- `server/services/crypto/balance.js`
- `server/services/crypto/errors.js`
- `server/services/crypto/exchange.js`
- `server/services/crypto/monitor.js`
- `server/services/crypto/wallet.js`
- `server/services/crypto/providers/index.js`
- `server/services/crypto/providers/coinpayments.js`
- `server/services/crypto/providers/nowpayments.js`
- `server/services/crypto/providers/oxapay.js`
- `server/services/crypto/providers/plisio.js`
- `server/services/crypto/providers/manual.js`
- `server/services/donations-discord.js`
- `server/services/guest-link.js`

**Read every file fully before making any changes.**

---

## Phase 1 — Security Audit

### 1.1 Stripe Webhook — Raw Body Verification
- [ ] Read `server/routes/donations-webhook.js` fully and confirm the Stripe webhook handler:
  1. Receives `express.raw({ type: 'application/json' })` body (not parsed JSON) — check `server/index.js` line 93.
  2. Calls `stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret)`.
  3. Returns `400` if signature verification throws.
- [ ] **If any of these are missing**, add them. The raw body middleware is already set in `server/index.js` — do not move it.
- [ ] **Verify** the Stripe webhook secret comes from config/env, never hardcoded.
- [ ] Commit: `git commit -m "security(donations): verify Stripe webhook raw body signature validation"`

### 1.2 Idempotency — Duplicate Webhook Processing Prevention
- [ ] In the Stripe webhook handler, check if events are deduplicated using `event.id`.
- [ ] **If not:** Add a `processed_webhook_events` table (additive — schema compatible):
  ```sql
  CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      processed_at TEXT DEFAULT (CURRENT_TIMESTAMP)
  );
  CREATE INDEX IF NOT EXISTS idx_pwe_event_id ON processed_webhook_events(event_id);
  ```
- [ ] Add this to `server/db/migrations/008_webhook_idempotency.sql`.
- [ ] In the webhook handler, before processing:
  ```js
  const already = await db.get('SELECT 1 FROM processed_webhook_events WHERE event_id = ?', [event.id]);
  if (already) return res.json({ received: true }); // already processed
  await db.run('INSERT INTO processed_webhook_events (event_id, provider) VALUES (?, ?)', [event.id, 'stripe']);
  ```
- [ ] Apply same pattern to crypto provider webhook handlers.
- [ ] Commit: `git commit -m "security(donations): add webhook idempotency via processed_webhook_events table"`

### 1.3 Crypto Provider Webhooks — HMAC Verification
- [ ] Read each provider file: `coinpayments.js`, `nowpayments.js`, `oxapay.js`, `plisio.js`.
- [ ] **For each provider's webhook handler:**
  - Verify it validates the webhook signature/HMAC before processing the payment event.
  - NowPayments uses `x-nowpayments-sig` header — verify HMAC-SHA512.
  - OxaPay uses their own signing — verify per their docs.
  - Plisio uses `verify_hash` — verify per their docs.
  - CoinPayments uses HMAC-SHA512 of the POST body with the IPN secret.
- [ ] For any provider missing signature verification, add it using `crypto.createHmac('sha512', secret).update(rawBody).digest('hex')`.
- [ ] Commit: `git commit -m "security(crypto): add HMAC signature verification to all provider webhooks"`

### 1.4 Secret Keys — Never in API Responses or Logs
- [ ] Search for any place where API keys, secrets, or wallet seeds might be logged or returned:
  ```bash
  grep -n "logger\|console\|res\.json" server/services/crypto/wallet.js server/services/crypto/providers/*.js
  ```
- [ ] **Verify:** Wallet derivation seed/mnemonic is never logged.
- [ ] **Verify:** Provider API keys are never included in any API response body.
- [ ] **Fix any leaks found.**
- [ ] Commit if needed: `git commit -m "security(crypto): prevent API key and wallet seed exposure in logs/responses"`

### 1.5 Guest Link — Single-Use and Expiry Enforcement
- [ ] Read `server/services/guest-link.js` fully.
- [ ] **Verify:** Guest donation links have an `expires_at` that is checked before use.
- [ ] **Verify:** Guest links are marked as used or deleted after one use (not reusable).
- [ ] **Fix:** If not atomic, use:
  ```js
  const result = await db.run(
      'UPDATE guest_links SET used = 1 WHERE token = ? AND used = 0 AND expires_at > ?',
      [token, Date.now()]
  );
  if (result.changes === 0) return null; // already used or expired
  ```
- [ ] Commit: `git commit -m "security(donations): enforce guest link single-use atomically"`

### 1.6 Donation Routes — Verify Admin-Only Routes are Protected
- [ ] Read `server/routes/donations.js` — search for routes that manage ranks, tiers, or donor records.
- [ ] **Verify:** `POST /admin/*`, `PUT /admin/*`, `DELETE /admin/*` donation admin routes require `authenticateToken` + admin role check.
- [ ] **Fix any unprotected admin routes.**
- [ ] Commit: `git commit -m "security(donations): ensure all admin donation routes require auth + admin role"`

---

## Phase 2 — Performance Audit

### 2.1 Crypto Monitor — Polling Interval and Error Recovery
- [ ] Read `server/services/crypto/monitor.js` fully.
- [ ] **Verify:** The polling loop (if any) catches errors and does not crash on a single provider failure.
- [ ] **Verify:** Failed polls are retried with exponential backoff, not tight loops.
- [ ] **Fix:** Wrap each provider poll in try/catch; log error and continue to next provider.
- [ ] Commit: `git commit -m "fix(crypto): isolate provider poll errors, prevent monitor crash"`

### 2.2 Exchange Rate Cache
- [ ] Read `server/services/crypto/exchange.js` fully.
- [ ] **Verify:** Exchange rate fetches are cached (with a TTL like 60s) rather than fetching on every donation page load.
- [ ] **If not cached:** Add a simple in-memory cache:
  ```js
  let rateCache = { data: null, fetchedAt: 0 };
  const RATE_TTL = 60 * 1000; // 60s
  async function getRates() {
      if (rateCache.data && Date.now() - rateCache.fetchedAt < RATE_TTL) return rateCache.data;
      const rates = await fetchFromProvider();
      rateCache = { data: rates, fetchedAt: Date.now() };
      return rates;
  }
  ```
- [ ] Commit: `git commit -m "perf(crypto): cache exchange rates with 60s TTL"`

### 2.3 Donations — Add DB Indices
- [ ] Check the donations schema (in `server/db/migrations/004_crypto_intent_balance.sql` or `extensions/donations/server/schema.sql`) for existing indices.
- [ ] Add missing indices in `server/db/migrations/009_donations_indices.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
  CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
  CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_ranks_user_id ON user_ranks(user_id, active);
  CREATE INDEX IF NOT EXISTS idx_guest_links_token ON guest_links(token);
  ```
- [ ] Commit: `git commit -m "perf(donations): add DB indices for donations and user_ranks tables"`

### 2.4 N+1 in Donor Listing
- [ ] In `server/routes/donations.js`, find any admin endpoint that lists donors and enriches each with user data.
- [ ] **Issue:** If it loops `for (const d of donations) { d.user = await db.get('SELECT ... FROM users WHERE id = ?', [d.user_id]); }` — that's N+1.
- [ ] **Fix:** JOIN the users table in the initial query:
  ```js
  const donors = await db.all(
      `SELECT d.*, u.username, u.display_name, u.avatar
       FROM donations d LEFT JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
  );
  ```
- [ ] Commit: `git commit -m "perf(donations): eliminate N+1 user enrichment in donor list"`

---

## Phase 3 — Code Quality

### 3.1 Crypto Errors — Consistent Error Class Usage
- [ ] Read `server/services/crypto/errors.js`.
- [ ] Verify all crypto providers throw/catch these error classes consistently.
- [ ] Any `catch (err) { console.error(...) }` should use `logger.error(...)` instead.
- [ ] Commit: `git commit -m "fix(crypto): standardize error handling and logging across providers"`

### 3.2 Wallet — Seed Rotation Warning
- [ ] Read `server/services/crypto/wallet.js`.
- [ ] The wallet seed is derived from `JWT_SECRET`. Add a startup warning if `JWT_SECRET` is the default or too short:
  ```js
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      logger.warn('SECURITY: JWT_SECRET is weak — crypto wallet addresses will be insecure');
  }
  ```
- [ ] Commit: `git commit -m "fix(crypto): warn on startup if JWT_SECRET is too weak for wallet derivation"`

### 3.3 Donations Admin — Pagination on Large Queries
- [ ] Verify every admin list endpoint in donations.js uses `LIMIT ? OFFSET ?` pagination.
- [ ] Add pagination if missing (default limit 50, max 200).
- [ ] Commit: `git commit -m "fix(donations): enforce pagination on admin list endpoints"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| CRIT | donations-webhook.js | Stripe signature verification | Pending |
| CRIT | crypto providers | Provider HMAC verification | Pending |
| HIGH | donations-webhook.js | Duplicate webhook processing | Pending |
| HIGH | guest-link.js | Guest link single-use atomicity | Pending |
| MED | wallet.js | Wallet seed exposure in logs | Pending |
| MED | exchange.js | Exchange rates not cached | Pending |
| LOW | schema | Missing donations table indices | Pending |
| LOW | donations.js | N+1 in donor listing | Pending |
