# Venary Full Audit & Upgrade — Design Spec
**Date:** 2026-04-22
**Status:** Approved

## Context

Venary is a live gaming social platform running on an Ubuntu VPS with PostgreSQL. The codebase has ~150 source files across a Node.js/Express backend, vanilla JS SPA frontend, and 6 extensions (messenger, donations, forum, minecraft, pterodactyl, images). The goal is a balanced security + performance upgrade via parallel subsystem agents while preserving full backward compatibility with the existing PostgreSQL schema.

## Schema Compatibility Contract

All agents must adhere to these rules without exception:

- **No destructive schema changes:** no `DROP TABLE`, `DROP COLUMN`, `RENAME TABLE`, `RENAME COLUMN`
- **Additive only:** new columns must have `DEFAULT` values so existing rows remain valid
- **New tables/indices** are permitted freely
- **Query interface:** always use `db.run()`, `db.get()`, `db.all()` wrappers — never raw `pg.query()`
- **Placeholders:** use `?` style (the db adapter normalizes to `$1` for PostgreSQL)

## Agent Subsystem Map

### Agent 1 — Auth + Admin
**Files:**
- `server/routes/auth.js`
- `server/routes/admin.js`
- `server/routes/appeals.js`
- `server/middleware/auth.js`
- `server/middleware/validate.js`

**Key risks to address:**
- Privilege escalation (role checks server-side, not JWT claim)
- JWT lifecycle (expiry, algorithm pinning, no secret logging)
- Brute-force resistance (rate limit + slow-down coverage)
- Token leak in error responses or logs
- Password reset token security (expiry, single-use)
- Appeal system authorization

---

### Agent 2 — Core Social
**Files:**
- `server/routes/posts.js`
- `server/routes/friends.js`
- `server/routes/messages.js`
- `server/routes/notifications.js`
- `server/routes/users.js`
- `server/routes/features.js`
- `server/routes/themes.js`

**Key risks to address:**
- N+1 query patterns (loop DB calls → JOIN / IN bulk fetch)
- Missing ownership checks on mutating routes
- Missing DB indices for common WHERE clauses
- `SELECT *` on large tables — scope to required columns
- XSS surface in content fields (stored content returned to frontend)
- Notification fan-out efficiency

---

### Agent 3 — Messenger
**Files:**
- `server/routes/messenger/index.js`
- `server/routes/messenger/spaces.js`
- `server/routes/messenger/channels.js`
- `server/routes/messenger/messages.js`
- `server/routes/messenger/members.js`
- `server/routes/messenger/roles.js`
- `server/routes/messenger/invites.js`
- `server/routes/messenger/dm.js`
- `server/routes/messenger/bots.js`
- `server/routes/messenger/webhooks.js`
- `server/routes/messenger/settings.js`
- `server/services/messenger-permissions.js`
- `server/services/messenger-socket.js`
- `server/socket.js`

**Key risks to address:**
- Socket event authentication (every event must verify JWT)
- Permission model gaps (member can act as owner, missing MANAGE_MESSAGES check)
- Webhook/bot token exposure to unauthorized callers
- Message delete: verify ownership OR MANAGE_MESSAGES permission
- Channel/space creation rate limiting
- Socket broadcast scope (targeted rooms, not global `io.emit()`)
- DM permission enforcement

---

### Agent 4 — Donations + Crypto
**Files:**
- `server/routes/donations.js`
- `server/routes/donations-crypto.js`
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

**Key risks to address:**
- Stripe webhook signature verification (raw body preserved)
- Crypto provider webhook trust (HMAC verification per provider)
- Payment race conditions (double-spend, duplicate webhook processing)
- Idempotency on webhook handlers
- No secret keys leaked in API responses or logs
- Guest link security (expiry, single-use enforcement)
- Crypto wallet derivation security

---

### Agent 5 — Forum + Minecraft + Pterodactyl
**Files:**
- `server/routes/forum.js`
- `server/routes/minecraft.js`
- `server/routes/pterodactyl.js`
- `server/services/minecraft/discord.js`
- `server/services/minecraft/pinger.js`
- `server/services/pterodactyl-client.js`
- `server/services/forum-discord.js`
- `server/routes/images.js`

**Key risks to address:**
- Missing `authenticateToken` on mutating forum routes
- External API key (Pterodactyl) not leaked in client responses
- Server-side validation of Pterodactyl server IDs (SSRF risk)
- Minecraft server pinger timeout/error handling (no crash on unreachable host)
- Forum post/thread ownership checks on edit/delete
- N+1 queries in forum thread listing

---

### Agent 6 — Frontend SPA
**Files:**
- `public/js/app.js` (2031 lines)
- `public/js/router.js`
- `public/js/api.js`
- `public/js/socket-client.js`
- `public/js/pages/admin.js`
- `public/js/pages/appeal.js`
- `public/js/pages/auth.js`
- `public/js/pages/chat.js`
- `public/js/pages/donations.js`
- `public/js/pages/donations-admin.js`
- `public/js/pages/feed.js`
- `public/js/pages/forum.js`
- `public/js/pages/friends.js`
- `public/js/pages/images-admin.js`
- `public/js/pages/images-hook.js`
- `public/js/pages/messenger.js`
- `public/js/pages/minecraft.js`
- `public/js/pages/minecraft-admin.js`
- `public/js/pages/mod.js`
- `public/js/pages/profile.js`
- `public/js/pages/pterodactyl.js`
- `public/js/pages/pterodactyl-admin.js`
- `public/js/pages/notfound.js`

**Key risks to address:**
- Every `innerHTML =` assignment audited for missing `escapeHtml()` / `_esc()` on user content
- N+1 API calls from frontend (loop fetches → batch endpoints)
- Dead event listeners not cleaned up on page navigation
- Race conditions: socket events firing before DOM ready
- Redundant full-list rebuilds on every socket event (patch instead)
- Missing `await` on async calls
- `const`/`let` at module top-level that must attach to `window` for SPA

---

## Per-Agent Workflow (Checklist Style)

Each agent writes and maintains a plan file at:
`docs/superpowers/plans/agents/YYYY-MM-DD-agent-N-<name>.md`

The plan file is a living checklist the agent updates as it works through findings and fixes. Structure:

```
## Status: [In Progress | Complete]

### Phase 1 — Security Audit
- [ ] Item
- [x] Completed item

### Phase 2 — Performance Audit
- [ ] Item

### Phase 3 — Code Quality
- [ ] Item

### Findings Log
| Severity | File | Issue | Fix Applied |
|---|---|---|---|
```

## Final Verification Pass (Agent 7)

After all 6 agents complete:
1. Read every changed file
2. Verify schema compatibility (no destructive SQL)
3. Verify no secrets in responses/logs
4. SSH to VPS, pull, restart service, verify `systemctl status vonix` is active
5. Report any regressions found

## Deployment

Per `CLAUDE.md` continuous deployment protocol:
1. Each agent pushes to GitHub after completing their subsystem
2. Agent 7 performs the VPS pull + restart after all agents are done
3. Startup failures are resolved before the audit is declared complete
