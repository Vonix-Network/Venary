# Agent 3 — Messenger Audit & Upgrade

## Status: Pending

## Context

Live production site (Ubuntu VPS, PostgreSQL). Schema compatibility mandatory — no DROP/RENAME. Use `db.run/get/all()` with `?` placeholders only. Push every commit immediately.

**Files owned:**
- `server/routes/messenger/index.js`
- `server/routes/messenger/spaces.js`
- `server/routes/messenger/channels.js`
- `server/routes/messenger/messages.js` (200 lines)
- `server/routes/messenger/members.js`
- `server/routes/messenger/roles.js`
- `server/routes/messenger/invites.js`
- `server/routes/messenger/dm.js` (276 lines)
- `server/routes/messenger/bots.js`
- `server/routes/messenger/webhooks.js`
- `server/routes/messenger/settings.js`
- `server/services/messenger-permissions.js`
- `server/services/messenger-socket.js`
- `server/socket.js`

**Read every file fully before making any changes.**

---

## Phase 1 — Security Audit

### 1.1 Pinned Messages — Missing Permission Check
- [ ] Read `server/routes/messenger/messages.js` lines 186–197
- [ ] **Issue:** `GET /channels/:id/pins` has `authenticateToken` but does NOT verify the user has `VIEW_CHANNEL` permission for that channel. Any authenticated user can read pins of any channel.
- [ ] **Fix:** Add permission check before returning pins:
  ```js
  router.get('/channels/:id/pins', authenticateToken, async (req, res) => {
      try {
          const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
          if (!channel) return res.status(404).json({ error: 'Channel not found' });
          const space = await db.get('SELECT * FROM spaces WHERE id = ?', [channel.space_id]);
          const perms = await computePermissions(db, channel.space_id, req.user.id, space.owner_id);
          if (!hasPermission(perms, Permissions.VIEW_CHANNEL))
              return res.status(403).json({ error: 'Missing VIEW_CHANNEL permission' });
          const messages = await db.all(
              'SELECT * FROM channel_messages WHERE channel_id = ? AND pinned = 1 AND deleted = 0 ORDER BY created_at DESC',
              [req.params.id]
          );
          res.json(messages);
      } catch (err) {
          res.status(500).json({ error: 'Failed to fetch pinned messages' });
      }
  });
  ```
- [ ] Commit: `git commit -m "security(messenger): add VIEW_CHANNEL check to GET /channels/:id/pins"`

### 1.2 Socket Events — Verify Every Event Checks Auth
- [ ] Read `server/services/messenger-socket.js` fully and `server/socket.js` fully.
- [ ] For every `socket.on('event', handler)`, verify the handler does NOT assume authentication — it must re-validate `socket.data.user` or `socket.user` is set.
- [ ] **The socket connection auth check** must happen in the `io.use()` middleware on connect (not per-event). Verify this exists. If not, add:
  ```js
  messengerNs.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));
      try {
          const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
          socket.data.user = decoded;
          next();
      } catch {
          next(new Error('Invalid token'));
      }
  });
  ```
- [ ] Commit: `git commit -m "security(messenger): enforce JWT auth middleware on socket namespace connect"`

### 1.3 Webhook Token — Prevent Exposure in List Endpoint
- [ ] Read `server/routes/messenger/webhooks.js` fully.
- [ ] **Verify:** The `GET /spaces/:id/webhooks` list endpoint does NOT return webhook tokens to unauthorized users. Only space admins (MANAGE_WEBHOOKS permission) should see webhook tokens.
- [ ] **If tokens are returned in list response:** only return them to users with MANAGE_WEBHOOKS permission, otherwise omit the `token` field.
- [ ] Commit if needed: `git commit -m "security(messenger): hide webhook tokens from non-admins"`

### 1.4 Bot Token — Prevent Exposure
- [ ] Read `server/routes/messenger/bots.js` fully.
- [ ] **Verify:** Bot tokens are never returned in list/index responses — only returned once at creation time.
- [ ] **If tokens are returned on GET requests:** Omit the `token` field, add instructions to regenerate if lost.
- [ ] Commit if needed: `git commit -m "security(messenger): hide bot tokens in GET responses"`

### 1.5 DM — Authorization on Read
- [ ] Read `server/routes/messenger/dm.js` fully.
- [ ] **Verify:** `GET /dm/:userId/messages` only returns messages where `req.user.id` is `sender_id` OR `receiver_id`.
- [ ] **Verify:** `POST /dm/:userId` (send DM) checks that a DM channel between the two users exists OR creates one — it must not allow sending to blocked users.
- [ ] **Fix any gaps.**
- [ ] Commit if needed: `git commit -m "security(messenger): enforce DM participant authorization"`

### 1.6 Members — Kick Authorization
- [ ] Read `server/routes/messenger/members.js` fully.
- [ ] **Verify:** `DELETE /spaces/:id/members/:userId` (kick member) requires KICK_MEMBERS permission.
- [ ] **Verify:** Space owner cannot be kicked by anyone.
- [ ] **Verify:** A member cannot kick someone with a higher role than themselves.
- [ ] **Fix any gaps.**
- [ ] Commit if needed: `git commit -m "security(messenger): enforce kick hierarchy and permissions"`

### 1.7 Invites — Expiry Enforcement
- [ ] Read `server/routes/messenger/invites.js` fully.
- [ ] **Verify:** When joining via invite link, the route checks `expires_at > NOW()` and `max_uses` is not exceeded.
- [ ] **Verify:** After joining, `uses` count is atomically incremented.
- [ ] **Fix any gaps** (use `UPDATE invites SET uses = uses + 1 WHERE id = ? AND (max_uses = 0 OR uses < max_uses)` and check affected rows).
- [ ] Commit if needed: `git commit -m "security(messenger): enforce invite expiry and max_uses atomically"`

### 1.8 Spaces — Only Owner Can Transfer / Delete
- [ ] Read `server/routes/messenger/spaces.js` fully.
- [ ] **Verify:** `DELETE /spaces/:id` requires the requester to be the space owner (not just admin role).
- [ ] **Verify:** Ownership transfer (`PUT /spaces/:id/owner`) is only callable by the current owner.
- [ ] **Fix any gaps.**
- [ ] Commit if needed: `git commit -m "security(messenger): enforce owner-only space delete and transfer"`

---

## Phase 2 — Performance Audit

### 2.1 Channel Messages — Add Indices
- [ ] Read the messenger schema SQL (check `server/routes/messenger/index.js` or `extensions/messenger/server/schema.sql` for schema).
- [ ] Verify indices exist on:
  - `channel_messages(channel_id, deleted, created_at DESC)`
  - `channel_messages(author_id)`
  - `channel_messages(pinned)` where pinned = 1
  - `space_members(space_id, user_id)`
  - `space_members(user_id)`
  - `dm_channels(user1_id, user2_id)`
  - `dm_messages(channel_id, created_at DESC)`
- [ ] Add any missing indices in a new migration file `server/db/migrations/007_messenger_indices.sql`.
- [ ] Commit: `git commit -m "perf(messenger): add indices for channel messages and space members"`

### 2.2 Space Load — Reduce Queries with JOIN
- [ ] Read `server/routes/messenger/spaces.js` — find the route that returns a space's channels + members.
- [ ] **Issue:** If channels and members are fetched as separate sequential queries, consider `Promise.all` to parallelize them.
- [ ] **Fix:** Replace sequential `await` with:
  ```js
  const [channels, members] = await Promise.all([
      db.all('SELECT * FROM channels WHERE space_id = ? ORDER BY position ASC', [spaceId]),
      db.all('SELECT sm.*, u.username, u.display_name, u.avatar FROM space_members sm JOIN users u ON sm.user_id = u.id WHERE sm.space_id = ?', [spaceId]),
  ]);
  ```
- [ ] Commit: `git commit -m "perf(messenger): parallelize space channel+member fetches"`

### 2.3 Socket — Target Rooms, Not Global Broadcasts
- [ ] Read `server/services/messenger-socket.js` and `server/socket.js`.
- [ ] Search for any `io.emit(` or `ns.emit(` calls (without `.to(room)`). These broadcast to ALL connected clients.
  ```bash
  grep -n "io\.emit\|ns\.emit" server/services/messenger-socket.js server/socket.js
  ```
- [ ] Replace every global emit with targeted room emit:
  - Channel events → `ns.to('channel:' + channelId).emit(...)`
  - Space events → `ns.to('space:' + spaceId).emit(...)`
  - User events → `ns.to('user:' + userId).emit(...)`
- [ ] Commit: `git commit -m "perf(messenger): replace global socket broadcasts with targeted room emits"`

### 2.4 Messages — Select Only Needed Columns
- [ ] In `GET /channels/:id/messages`, replace `SELECT *` with explicit columns:
  `id, channel_id, author_id, content, reply_to_id, attachments, reactions, pinned, edited_at, created_at, deleted`
- [ ] In DM message routes, do the same.
- [ ] Commit: `git commit -m "perf(messenger): scope SELECT columns in message queries"`

---

## Phase 3 — Code Quality

### 3.1 Error Responses — Add Consistent Logging
- [ ] Verify every catch block in messenger routes logs the error via `logger.error(...)` (not just `res.status(500)`).
- [ ] The pattern should be:
  ```js
  } catch (err) {
      logger.error('Messenger [action] error', { err: err.message });
      res.status(500).json({ error: 'Internal server error' });
  }
  ```
- [ ] Commit: `git commit -m "fix(messenger): add structured error logging to catch blocks"`

### 3.2 Socket — Disconnect Cleanup
- [ ] In `server/services/messenger-socket.js`, verify `socket.on('disconnect', ...)` cleans up any per-socket state (typing indicators, presence).
- [ ] Ensure disconnecting a socket removes the user from typing indicator maps and broadcasts a `user:offline` presence event to relevant rooms.
- [ ] Commit if missing: `git commit -m "fix(messenger): clean up presence and typing state on socket disconnect"`

### 3.3 Rate Limit on Message Send Socket Event
- [ ] Check if the socket send-message handler has any rate limiting per user.
- [ ] If not, add a simple per-user sliding window in memory:
  ```js
  const msgRateMap = new Map(); // userId -> [timestamps]
  function checkMsgRate(userId) {
      const now = Date.now();
      const times = (msgRateMap.get(userId) || []).filter(t => now - t < 5000);
      if (times.length >= 10) return false; // 10 msg per 5s
      times.push(now);
      msgRateMap.set(userId, times);
      return true;
  }
  ```
- [ ] Call `checkMsgRate(socket.data.user.id)` before processing `channel:send_message`. Emit `channel:error` with rate limit message if exceeded.
- [ ] Commit: `git commit -m "fix(messenger): add per-user socket message rate limiting"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| HIGH | messages.js | GET /pins missing VIEW_CHANNEL check | Pending |
| HIGH | messenger-socket.js | Socket events may lack per-event auth | Pending |
| HIGH | webhooks.js | Webhook tokens may be exposed in list | Pending |
| MED | invites.js | Invite max_uses may not be atomic | Pending |
| MED | dm.js | DM participant authorization | Pending |
| MED | members.js | Kick hierarchy check | Pending |
| LOW | schema | Missing messenger table indices | Pending |
| LOW | messenger-socket.js | Global socket broadcasts | Pending |
| LOW | messenger-socket.js | No socket message rate limiting | Pending |
