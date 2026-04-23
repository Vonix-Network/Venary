# Agent 5 — Forum + Minecraft + Pterodactyl + Images Audit & Upgrade

## Status: Pending

## Context

Live production site (Ubuntu VPS, PostgreSQL). Schema compatibility mandatory — no DROP/RENAME. Use `db.run/get/all()` with `?` placeholders only. Push every commit immediately.

**Files owned:**
- `server/routes/forum.js` (505 lines)
- `server/routes/minecraft.js`
- `server/routes/pterodactyl.js`
- `server/routes/images.js`
- `server/services/minecraft/discord.js`
- `server/services/minecraft/pinger.js`
- `server/services/pterodactyl-client.js`
- `server/services/forum-discord.js`

**Read every file fully before making any changes.**

---

## Phase 1 — Security Audit

### 1.1 Forum — Auth on Mutating Routes
- [ ] Read `server/routes/forum.js` fully.
- [ ] Search for every `router.post`, `router.put`, `router.patch`, `router.delete` — verify each has `authenticateToken` middleware.
  ```bash
  grep -n "router\.\(post\|put\|patch\|delete\)" server/routes/forum.js
  ```
- [ ] Cross-reference each mutating route with whether `authenticateToken` appears in the same line or middleware chain.
- [ ] **Fix any unprotected mutating routes:** Add `authenticateToken` as middleware parameter.
- [ ] Commit: `git commit -m "security(forum): ensure all mutating routes require authentication"`

### 1.2 Forum — Post and Reply Ownership on Edit/Delete
- [ ] Find `PUT` and `DELETE` routes for threads/posts/replies.
- [ ] **Verify:** Edit/delete checks `post.user_id === req.user.id` OR requester is admin/moderator.
- [ ] **Fix pattern:**
  ```js
  const thread = await db.get('SELECT * FROM forum_threads WHERE id = ?', [req.params.id]);
  if (!thread) return res.status(404).json({ error: 'Not found' });
  const requester = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
  const isOwner = thread.user_id === req.user.id;
  const isMod = ['admin', 'superadmin', 'moderator'].includes(requester.role);
  if (!isOwner && !isMod) return res.status(403).json({ error: 'Permission denied' });
  ```
- [ ] Commit: `git commit -m "security(forum): enforce ownership check on thread/post edit and delete"`

### 1.3 Forum — Content Length Limits
- [ ] **Verify:** Thread creation and reply endpoints enforce content length limits.
- [ ] Add if missing:
  ```js
  if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
  if (content.length > 50000) return res.status(400).json({ error: 'Content cannot exceed 50,000 characters' });
  if (title && title.length > 200) return res.status(400).json({ error: 'Title cannot exceed 200 characters' });
  ```
- [ ] Commit: `git commit -m "fix(forum): add content and title length validation"`

### 1.4 Pterodactyl — API Key Never in Client Responses
- [ ] Read `server/routes/pterodactyl.js` and `server/services/pterodactyl-client.js` fully.
- [ ] **Verify:** The Pterodactyl API key (from config) is NEVER included in any `res.json()` response.
- [ ] Search:
  ```bash
  grep -n "apiKey\|api_key\|panelKey\|pterodactyl.*key" server/routes/pterodactyl.js server/services/pterodactyl-client.js
  ```
- [ ] **Fix any leaks:** Remove key from all response objects.
- [ ] Commit if needed: `git commit -m "security(pterodactyl): ensure API key never exposed in client responses"`

### 1.5 Pterodactyl — Server ID Validation (SSRF Prevention)
- [ ] Find routes that accept a `serverId` or `server_id` parameter and forward it to Pterodactyl API.
- [ ] **Verify:** The server ID is validated to belong to the requesting user before proxying to Pterodactyl.
- [ ] **Pattern:**
  ```js
  const assignment = await db.get(
      'SELECT 1 FROM pterodactyl_assignments WHERE server_id = ? AND user_id = ?',
      [req.params.serverId, req.user.id]
  );
  if (!assignment) return res.status(403).json({ error: 'Access denied to this server' });
  ```
- [ ] Commit: `git commit -m "security(pterodactyl): validate server ownership before proxying API calls"`

### 1.6 Images — File Type Validation
- [ ] Read `server/routes/images.js` fully.
- [ ] **Verify:** Upload routes validate file MIME type AND magic bytes (not just extension).
- [ ] **Verify:** Executable file types (`.exe`, `.bat`, `.sh`, `.php`, `.js`) are blocked.
- [ ] **Verify:** File size limit is enforced (e.g., 10MB max).
- [ ] **Fix if using extension-only check:** Add magic byte validation using a library or manual byte check:
  ```js
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Only JPEG, PNG, GIF, and WebP images are allowed' });
  }
  // Check magic bytes
  const buf = file.buffer.slice(0, 4);
  const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
  const isPng  = buf[0] === 0x89 && buf[1] === 0x50;
  const isGif  = buf[0] === 0x47 && buf[1] === 0x49;
  const isWebp = buf[0] === 0x52 && buf[3] === 0x46; // RIFF
  if (!isJpeg && !isPng && !isGif && !isWebp) {
      return res.status(400).json({ error: 'File content does not match a valid image format' });
  }
  ```
- [ ] Commit: `git commit -m "security(images): add magic byte validation on file uploads"`

### 1.7 Minecraft — Pinger Timeout and Error Isolation
- [ ] Read `server/services/minecraft/pinger.js` fully.
- [ ] **Verify:** The pinger sets a socket timeout (e.g., 5000ms) so an unreachable server doesn't hang a request indefinitely.
- [ ] **Verify:** Pinger errors are caught and returned as a structured error object, not an unhandled rejection that crashes the server.
- [ ] **Fix pattern:**
  ```js
  const result = await Promise.race([
      pingServer(host, port),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
  ]);
  ```
- [ ] Commit: `git commit -m "fix(minecraft): add 5s timeout and error isolation to server pinger"`

---

## Phase 2 — Performance Audit

### 2.1 Forum — N+1 Thread Listing
- [ ] In `GET /forum/threads` or equivalent listing route, check if author info is fetched per-thread in a loop.
- [ ] **Issue:** `for (const t of threads) { t.author = await db.get('SELECT ... FROM users WHERE id = ?', [t.user_id]); }` = N+1.
- [ ] **Fix:** JOIN users in the listing query:
  ```js
  const threads = await db.all(
      `SELECT t.*, u.username, u.display_name, u.avatar,
              (SELECT COUNT(*) FROM forum_replies WHERE thread_id = t.id) as reply_count
       FROM forum_threads t
       JOIN users u ON t.user_id = u.id
       WHERE t.category_id = ?
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [categoryId, limit, offset]
  );
  ```
- [ ] Commit: `git commit -m "perf(forum): eliminate N+1 author lookup in thread listing"`

### 2.2 Forum — DB Indices
- [ ] Add migration `server/db/migrations/010_forum_indices.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_forum_threads_user ON forum_threads(user_id);
  CREATE INDEX IF NOT EXISTS idx_forum_replies_thread ON forum_replies(thread_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_forum_replies_user ON forum_replies(user_id);
  ```
- [ ] Commit: `git commit -m "perf(forum): add DB indices for thread and reply queries"`

### 2.3 Minecraft — Server Status Cache
- [ ] Read `server/routes/minecraft.js`.
- [ ] **Issue:** If each page load triggers a live ping to Minecraft servers, responses are slow (200–2000ms network latency).
- [ ] **Fix:** Cache ping results for 30 seconds in memory:
  ```js
  const pingCache = new Map(); // serverId -> { result, fetchedAt }
  const PING_TTL = 30 * 1000;
  async function getCachedPing(serverId, host, port) {
      const cached = pingCache.get(serverId);
      if (cached && Date.now() - cached.fetchedAt < PING_TTL) return cached.result;
      const result = await pinger.ping(host, port).catch(() => ({ online: false }));
      pingCache.set(serverId, { result, fetchedAt: Date.now() });
      return result;
  }
  ```
- [ ] Commit: `git commit -m "perf(minecraft): cache server ping results for 30s"`

### 2.4 Pterodactyl — Response Pruning
- [ ] Read `server/services/pterodactyl-client.js`.
- [ ] **Verify:** Pterodactyl API responses are pruned before forwarding to the client — only necessary fields are passed through. Full panel API responses often include internal details that shouldn't reach the browser.
- [ ] Create a whitelist of safe fields per resource type (server, stats, console) and filter responses.
- [ ] Commit: `git commit -m "perf(pterodactyl): prune Pterodactyl API responses before forwarding to client"`

---

## Phase 3 — Code Quality

### 3.1 Images — Serve with Correct Cache Headers
- [ ] In `server/routes/images.js`, verify that image GET routes set `Cache-Control` headers for browser caching:
  ```js
  res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year for static images
  ```
- [ ] Commit: `git commit -m "perf(images): add Cache-Control headers for uploaded images"`

### 3.2 Forum Discord Integration — Error Isolation
- [ ] Read `server/services/forum-discord.js`.
- [ ] **Verify:** Discord webhook calls are wrapped in try/catch. A Discord outage must not fail a forum post.
- [ ] **Pattern:** Fire-and-forget with error logging:
  ```js
  sendDiscordNotification(data).catch(err => logger.warn('Forum Discord notify failed', { err: err.message }));
  ```
- [ ] Commit: `git commit -m "fix(forum): isolate Discord notification failures from forum post flow"`

### 3.3 Minecraft Discord — Same Isolation
- [ ] Apply same pattern to `server/services/minecraft/discord.js`.
- [ ] Commit: `git commit -m "fix(minecraft): isolate Discord integration errors"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| HIGH | forum.js | Mutating routes may lack auth | Pending |
| HIGH | images.js | Magic byte validation missing | Pending |
| HIGH | pterodactyl.js | Server ID ownership not validated (SSRF) | Pending |
| MED | forum.js | Edit/delete ownership check | Pending |
| MED | pterodactyl-client.js | API key in response | Pending |
| MED | pinger.js | No timeout on unreachable servers | Pending |
| LOW | forum.js | N+1 in thread listing | Pending |
| LOW | minecraft.js | No ping cache | Pending |
| LOW | schema | Missing forum/image indices | Pending |
