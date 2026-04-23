# Agent 1 — Auth + Admin Audit & Upgrade

## Status: Pending

## Context

Live production site (Ubuntu VPS, PostgreSQL). Schema compatibility is mandatory — no DROP/RENAME. Use `db.run/get/all()` with `?` placeholders only. Push every commit immediately.

**Files owned:**
- `server/routes/auth.js` (296 lines)
- `server/routes/admin.js` (517 lines)
- `server/routes/appeals.js`
- `server/middleware/auth.js` (87 lines)
- `server/middleware/validate.js`

**Read these first before changing anything.**

---

## Phase 1 — Security Audit

### 1.1 Password Reset Token — Store Hash, Not Plaintext
- [ ] Read `server/routes/auth.js` lines 184–236
- [ ] **Issue:** `password_reset_tokens` table stores the raw token string. If DB is compromised, all tokens are immediately usable.
- [ ] **Fix:** In `POST /forgot-password`, generate token with `crypto.randomBytes(32).toString('hex')`, store `crypto.createHash('sha256').update(token).digest('hex')` in DB, send raw token in email link.
- [ ] **Fix:** In `POST /reset-password`, hash the incoming `token` with SHA-256 before looking it up in DB.
- [ ] Verify the `password_reset_tokens` table schema supports a hashed token (same column, just different value — no schema change needed).
- [ ] Commit: `git commit -m "security(auth): hash password reset tokens in DB before storage"`

### 1.2 bcrypt — Switch to Async
- [ ] Read `server/routes/auth.js` lines 73 and 227
- [ ] **Issue:** `bcrypt.hashSync()` and `bcrypt.compareSync()` block the Node.js event loop during hashing. Under load, this stalls all other requests.
- [ ] **Fix:** Replace `bcrypt.hashSync(password, 10)` with `await bcrypt.hash(password, 12)` (raise cost factor from 10→12 for better resistance).
- [ ] Replace `bcrypt.compareSync(password, user.password)` with `await bcrypt.compare(password, user.password)`.
- [ ] Apply same fix to all other `bcrypt.hashSync` calls in the file (password reset also uses hashSync).
- [ ] Commit: `git commit -m "security(auth): switch bcrypt to async with cost factor 12"`

### 1.3 JWT — Add Role to Payload, Validate on Sensitive Routes
- [ ] Read `server/middleware/auth.js`
- [ ] **Current state:** JWT payload only contains `{ id, username }`. Role is fetched from DB on every admin check — this is correct but causes extra DB queries.
- [ ] **Issue:** `requireAdmin` in `server/routes/admin.js` is a local duplicate of `requireAdmin` in `server/middleware/auth.js`. DRY violation — if one is updated, the other won't be.
- [ ] **Fix:** Remove the local `requireAdmin` and `requireSuperAdmin` functions from `server/routes/admin.js`. Import them from `server/middleware/auth.js` instead. Export `requireSuperAdmin` from auth middleware too.
- [ ] Verify `server/middleware/auth.js` already exports `requireAdmin` — it does (line 87). Add `requireSuperAdmin` export.
- [ ] Commit: `git commit -m "refactor(auth): deduplicate requireAdmin — use shared middleware"`

### 1.4 Admin Ban Route — Self-Ban Prevention
- [ ] Read `server/routes/admin.js` lines 95–130
- [ ] **Issue:** An admin could ban themselves (no self-ban check).
- [ ] **Fix:** In `POST /users/:id/ban`, add check: `if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot ban yourself' });`
- [ ] Commit: `git commit -m "security(admin): prevent self-ban"`

### 1.5 Admin Role Escalation — Protect Role Change Route
- [ ] Search admin.js for routes that change `role` field: `grep -n "role" server/routes/admin.js`
- [ ] **Verify:** Only `superadmin` can promote users to `admin` or `superadmin`. Moderators cannot promote anyone.
- [ ] If any role-change route allows moderators to set `admin` or `superadmin` roles, restrict it to superadmin only.
- [ ] Commit if changes needed: `git commit -m "security(admin): restrict role promotion to superadmin only"`

### 1.6 Appeals — Authorization Check
- [ ] Read `server/routes/appeals.js` fully
- [ ] **Verify:** Users can only read their own appeals (not other users' appeals). The GET route must filter by `req.user.id`.
- [ ] **Verify:** Admins can read all appeals for moderation.
- [ ] **Fix any gaps found.**
- [ ] Commit if changes needed: `git commit -m "security(appeals): enforce per-user appeal isolation"`

### 1.7 Admin Stats — Avoid Parallel DB Storms
- [ ] Read `server/routes/admin.js` lines 29–50
- [ ] **Issue:** `/stats` fires 6 sequential `await db.get()` calls. Each waits for the previous.
- [ ] **Fix:** Use `Promise.all()` to run all 6 count queries in parallel:
  ```js
  const [totalUsers, onlineUsers, totalPosts, pendingReports, bannedUsers, totalMessages] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM users'),
      db.get("SELECT COUNT(*) as count FROM users WHERE status = 'online'"),
      db.get('SELECT COUNT(*) as count FROM posts'),
      db.get("SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"),
      db.get('SELECT COUNT(*) as count FROM users WHERE banned = 1'),
      db.get('SELECT COUNT(*) as count FROM messages'),
  ]);
  ```
- [ ] Commit: `git commit -m "perf(admin): parallelize stats count queries with Promise.all"`

---

## Phase 2 — Performance Audit

### 2.1 Auth /me — Scope SELECT Columns
- [ ] Read `server/routes/auth.js` lines 241–274
- [ ] **Issue:** `SELECT * FROM users WHERE id = ?` fetches all columns including `password` hash — wasteful and a security smell.
- [ ] **Fix:** Scope the query to only needed columns:
  ```js
  const user = await db.get(
      `SELECT id, username, email, display_name, avatar, bio, gaming_tags,
              level, xp, games_played, achievements, role, status,
              banned, ban_reason, banned_until, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
  );
  ```
- [ ] Apply same scoping to `POST /login` — the `SELECT *` on line 111 also fetches the password (needed for compare) but also all other columns. After compare, only pick needed fields.
- [ ] Commit: `git commit -m "perf(auth): scope SELECT columns, avoid fetching password hash in /me"`

### 2.2 Admin /users — Add Index for Common Filter Queries
- [ ] Read `server/db/schema.sql` — check if `users` table has indices on `username`, `email`, `role`, `status`, `created_at`.
- [ ] If missing, add a migration file `server/db/migrations/005_admin_user_indices.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned);
  CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
  ```
- [ ] Wire the migration into `server/db/index.js` or the migration runner (check how 001–004 are applied).
- [ ] Commit: `git commit -m "perf(db): add indices on users(role, status, banned, created_at)"`

### 2.3 Password Reset Tokens — Add Index
- [ ] Check if `password_reset_tokens` has an index on `token` (the lookup column).
- [ ] If not, add to migration 005: `CREATE INDEX IF NOT EXISTS idx_prt_token ON password_reset_tokens(token);`
- [ ] Commit with 2.2 above.

---

## Phase 3 — Code Quality

### 3.1 requireAdmin — Add try/catch
- [ ] In `server/middleware/auth.js`, the `requireAdmin` function has a try/catch but check `requireNonBanned` — ensure all DB calls are wrapped.
- [ ] Verify error responses don't leak stack traces (they should only return `{ error: 'Server error' }`).

### 3.2 Validate Middleware — Audit Coverage
- [ ] Read `server/middleware/validate.js` fully.
- [ ] Check which routes use it vs which do inline validation.
- [ ] No action needed if inline validation is sufficient — just confirm.

### 3.3 Expired Token Cleanup Job
- [ ] Check if there's a periodic cleanup of expired `password_reset_tokens` rows.
- [ ] If not, add a `setInterval` in `server/index.js` after DB init:
  ```js
  setInterval(async () => {
      try { await db.run('DELETE FROM password_reset_tokens WHERE expires_at < ?', [Date.now()]); } catch {}
  }, 60 * 60 * 1000); // hourly
  ```
- [ ] Commit: `git commit -m "fix(auth): add hourly cleanup of expired password reset tokens"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| HIGH | auth.js | Password reset token stored plaintext | Pending |
| HIGH | auth.js | bcrypt.hashSync blocks event loop | Pending |
| MED | admin.js | requireAdmin duplicated from middleware | Pending |
| MED | admin.js | Self-ban not prevented | Pending |
| MED | auth.js | SELECT * fetches password in /me | Pending |
| LOW | admin.js | Stats queries sequential | Pending |
| LOW | schema | Missing indices on users table | Pending |
