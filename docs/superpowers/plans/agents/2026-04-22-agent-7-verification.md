# Agent 7 — Verification + Production Deployment

## Status: Pending (runs AFTER all 6 agents complete)

## Context

This agent runs last. All 6 subsystem agents have committed and pushed their changes. This agent's job is to verify correctness, check for regressions, and deploy to the production VPS.

**VPS:** `root@vonix.network` via `~/.ssh/id_ed25519`
**App path:** `/var/www/Venary`
**Service:** `vonix` (systemd)

---

## Phase 1 — Schema Safety Check

- [ ] Read every migration file added by agents 1–6:
  - `server/db/migrations/005_admin_user_indices.sql`
  - `server/db/migrations/006_social_indices.sql`
  - `server/db/migrations/007_messenger_indices.sql`
  - `server/db/migrations/008_webhook_idempotency.sql`
  - `server/db/migrations/009_donations_indices.sql`
  - `server/db/migrations/010_forum_indices.sql`
- [ ] For each migration file, verify there is NO:
  - `DROP TABLE`
  - `DROP COLUMN`
  - `RENAME TABLE`
  - `RENAME COLUMN`
  - `ALTER TABLE ... DROP`
  - `TRUNCATE`
- [ ] If any destructive SQL is found, immediately edit the file to remove it and commit the fix.
- [ ] Commit: `git commit -m "fix(schema): remove destructive SQL found in migration files"`

## Phase 2 — Security Spot-Check

- [ ] Read `server/routes/auth.js` — verify bcrypt is now `await bcrypt.hash(password, 12)` and `await bcrypt.compare(...)`.
- [ ] Read `server/routes/auth.js` forgot-password — verify the stored token is now a SHA-256 hash.
- [ ] Read `server/routes/auth.js` reset-password — verify incoming token is hashed before DB lookup.
- [ ] Grep for any remaining `innerHTML` assignments in frontend pages that contain `user.username`, `user.display_name`, `user.bio`, `post.content`, `comment.content` WITHOUT `_esc()`:
  ```bash
  grep -rn "innerHTML.*user\.\|innerHTML.*\.content\|innerHTML.*\.bio" public/js/pages/
  ```
  Any hit that does NOT have `_esc(` on the same line is a remaining XSS risk — fix it.
- [ ] Read `server/routes/messenger/messages.js` — verify `GET /channels/:id/pins` has permission check.
- [ ] Read `server/routes/donations-webhook.js` — verify `processed_webhook_events` deduplication exists.
- [ ] Commit any fixes found: `git commit -m "fix(verification): address remaining security gaps found in review"`

## Phase 3 — Functional Spot-Check

- [ ] Read `server/routes/posts.js` feed route — verify the donation rank N+1 loop was replaced with a bulk query (should see `IN (${placeholders})` pattern, not a `for` loop with `await`).
- [ ] Read `server/routes/admin.js` stats route — verify `Promise.all([...])` is used.
- [ ] Read `server/services/crypto/exchange.js` — verify rate cache (`rateCache`) object exists.
- [ ] Read `server/services/minecraft/pinger.js` — verify a timeout mechanism exists.
- [ ] Read `public/js/pages/feed.js` — verify socket new-post handler does NOT re-fetch all posts.
- [ ] Note any items that were NOT completed by agents in the Findings Log below.

## Phase 4 — Git State Check

- [ ] Run: `git log --oneline -30` to see all recent commits from agents.
- [ ] Verify commits exist for all major areas: auth, admin, posts, messenger, donations, crypto, forum, images, minecraft, pterodactyl, frontend.
- [ ] Verify the branch is up to date: `git status` should show a clean working tree.
- [ ] Push any remaining changes: `git push`

## Phase 5 — Production Deployment

- [ ] SSH to VPS:
  ```bash
  ssh -i ~/.ssh/id_ed25519 root@vonix.network
  ```
- [ ] Pull latest code:
  ```bash
  cd /var/www/Venary && git pull
  ```
- [ ] Install any new dependencies (if package.json changed):
  ```bash
  npm install --production
  ```
- [ ] Restart the service:
  ```bash
  sudo systemctl restart vonix
  ```
- [ ] Wait 5 seconds, then check status:
  ```bash
  sudo systemctl status vonix
  ```
- [ ] **Verify:** Status shows `Active: active (running)`.
- [ ] **Verify:** No startup errors in journal:
  ```bash
  sudo journalctl -u vonix -n 50 --no-pager
  ```
- [ ] **If startup fails:** Read the error, identify the cause, fix the code, push, pull, restart. Do NOT declare success until the service is running.

## Phase 6 — Post-Deploy Validation

- [ ] Verify the site is reachable by checking the service is up and listening:
  ```bash
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/settings
  ```
  Expected: `200`
- [ ] Check for any errors in the last 5 minutes of logs:
  ```bash
  sudo journalctl -u vonix --since "5 minutes ago" --no-pager | grep -i "error\|fatal\|uncaught"
  ```
- [ ] If errors found: investigate, fix, redeploy.

## Phase 7 — Final Report

- [ ] Update this file's **Status** to `Complete`.
- [ ] Fill in the Findings Log below with a summary of what each agent completed and any items left outstanding.
- [ ] Commit: `git commit -m "docs: mark verification complete, production deployed"`

---

## Findings Log

| Agent | Item | Status | Notes |
|---|---|---|---|
| Agent 1 | bcrypt async + cost 12 | Pending | |
| Agent 1 | Reset token hashing | Pending | |
| Agent 1 | requireAdmin dedup | Pending | |
| Agent 1 | Self-ban prevention | Pending | |
| Agent 1 | DB indices for users | Pending | |
| Agent 2 | Feed N+1 donation ranks | Pending | |
| Agent 2 | Post visibility enforcement | Pending | |
| Agent 2 | Social table indices | Pending | |
| Agent 3 | Pins permission check | Pending | |
| Agent 3 | Socket namespace auth | Pending | |
| Agent 3 | Webhook token hiding | Pending | |
| Agent 4 | Stripe webhook idempotency | Pending | |
| Agent 4 | Crypto HMAC verification | Pending | |
| Agent 4 | Exchange rate cache | Pending | |
| Agent 5 | Forum auth on mutations | Pending | |
| Agent 5 | Image magic byte check | Pending | |
| Agent 5 | Pterodactyl SSRF prevention | Pending | |
| Agent 5 | Minecraft pinger timeout | Pending | |
| Agent 6 | XSS innerHTML escaping | Pending | |
| Agent 6 | Socket listener cleanup | Pending | |
| Agent 6 | Feed socket no re-render | Pending | |
