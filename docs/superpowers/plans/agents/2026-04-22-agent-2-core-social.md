# Agent 2 — Core Social Audit & Upgrade

## Status: Pending

## Context

Live production site (Ubuntu VPS, PostgreSQL). Schema compatibility mandatory — no DROP/RENAME. Use `db.run/get/all()` with `?` placeholders only. Push every commit immediately.

**Files owned:**
- `server/routes/posts.js` (463 lines)
- `server/routes/friends.js`
- `server/routes/messages.js`
- `server/routes/notifications.js`
- `server/routes/users.js` (200 lines)
- `server/routes/features.js`
- `server/routes/themes.js`

**Read every file fully before making any changes.**

---

## Phase 1 — Security Audit

### 1.1 Posts Feed — N+1 Donation Rank Loop
- [ ] Read `server/routes/posts.js` lines 126–141
- [ ] **Issue:** After fetching posts, code loops over unique `user_id`s and issues one `db.get()` per user to fetch their donation rank. This is a classic N+1 — 20 posts with 15 unique authors = 15 extra queries per feed load.
- [ ] **Fix:** Replace the loop with a single bulk query using `IN (...)`:
  ```js
  try {
      const userIds = [...new Set(posts.map(p => p.user_id))];
      if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(',');
          const ranks = await db.all(
              `SELECT ur.user_id, r.name, r.color, r.icon FROM user_ranks ur
               LEFT JOIN donation_ranks r ON ur.rank_id = r.id
               WHERE ur.user_id IN (${placeholders}) AND ur.active = 1
               AND (ur.expires_at IS NULL OR ur.expires_at > ?)`,
              [...userIds, new Date().toISOString()]
          );
          const rankMap = Object.fromEntries(ranks.map(r => [r.user_id, r]));
          posts.forEach(p => {
              const r = rankMap[p.user_id];
              if (r) p.donation_rank = { name: r.name, color: r.color, icon: r.icon };
          });
      }
  } catch { /* donations tables may not exist yet */ }
  ```
- [ ] Apply same fix to any other route in posts.js that loops per-user to fetch donation ranks.
- [ ] Commit: `git commit -m "perf(posts): replace N+1 donation rank loop with bulk IN query"`

### 1.2 Posts — Visibility Enforcement on Single Post Fetch
- [ ] Read `server/routes/posts.js` — find the `GET /:id` route.
- [ ] **Verify:** When fetching a single post by ID, the route enforces visibility: guests can only see `public` posts; authenticated users can see their own + friends' + public posts.
- [ ] **Fix if missing:** Add visibility check:
  ```js
  if (post.visibility !== 'public') {
      if (!req.user) return res.status(403).json({ error: 'Login required to view this post' });
      if (post.user_id !== req.user.id) {
          // Check friendship
          const friendship = await db.get(
              `SELECT 1 FROM friendships WHERE status = 'accepted'
               AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))`,
              [req.user.id, post.user_id, post.user_id, req.user.id]
          );
          if (!friendship) return res.status(403).json({ error: 'You do not have permission to view this post' });
      }
  }
  ```
- [ ] Commit: `git commit -m "security(posts): enforce visibility on single post fetch"`

### 1.3 Posts — Delete Ownership Check
- [ ] Find `DELETE /:id` route in posts.js.
- [ ] **Verify:** Only the post owner OR an admin/moderator can delete a post.
- [ ] **Fix if gap found:** After fetching post, check `post.user_id === req.user.id` OR fetch requester's role and allow `admin`/`moderator`.
- [ ] Commit if needed: `git commit -m "security(posts): enforce ownership check on delete"`

### 1.4 Posts — Comment Ownership on Delete
- [ ] Find `DELETE /:postId/comments/:commentId` route.
- [ ] **Verify:** Only comment owner OR post owner OR admin can delete a comment.
- [ ] **Fix any gap found.**
- [ ] Commit if needed: `git commit -m "security(posts): enforce comment delete ownership"`

### 1.5 Messages — Read Authorization
- [ ] Read `server/routes/messages.js` fully.
- [ ] **Verify:** `GET /messages/:userId` (conversation history) only returns messages where the requester is `sender_id` OR `receiver_id`. Other users cannot read private conversations.
- [ ] **Fix if gap:** Add WHERE clause: `AND (sender_id = ? OR receiver_id = ?)` with `req.user.id` twice.
- [ ] Commit if needed: `git commit -m "security(messages): enforce sender/receiver authorization on read"`

### 1.6 Users — Sensitive Field Exposure
- [ ] Read `server/routes/users.js` fully.
- [ ] **Verify:** `GET /users/:id` (public profile) does NOT return `email`, `password`, `ban_reason`, `banned_until` to non-admin callers.
- [ ] **Fix if gap:** Explicitly select only public columns: `id, username, display_name, avatar, bio, gaming_tags, level, xp, role, status, created_at`.
- [ ] Commit: `git commit -m "security(users): exclude sensitive fields from public profile endpoint"`

### 1.7 Friends — Accept/Decline Authorization
- [ ] Read `server/routes/friends.js` fully.
- [ ] **Verify:** Only the RECIPIENT of a friend request can accept/decline it (not the sender, not a third party).
- [ ] **Fix if gap:** Check `friendship.friend_id === req.user.id` before accepting/declining.
- [ ] Commit if needed: `git commit -m "security(friends): enforce recipient-only accept/decline"`

---

## Phase 2 — Performance Audit

### 2.1 Posts Feed — Correlated Subqueries Are Fine, But Add Indices
- [ ] Read `server/routes/posts.js` lines 86–115 (the feed query)
- [ ] The feed uses correlated subqueries for `like_count`, `comment_count`, `liked`, `is_subscribed`. These are acceptable in a single SQL statement but need DB indices to be fast.
- [ ] Read `server/db/schema.sql` — check for indices on `likes(post_id)`, `comments(post_id)`, `post_subscriptions(post_id, user_id)`, `friendships(user_id, friend_id, status)`, `posts(user_id)`, `posts(visibility, created_at)`.
- [ ] Add migration `server/db/migrations/006_social_indices.sql`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
  CREATE INDEX IF NOT EXISTS idx_likes_post_user ON likes(post_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
  CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_friendships_lookup ON friendships(user_id, friend_id, status);
  CREATE INDEX IF NOT EXISTS idx_post_subscriptions_post_user ON post_subscriptions(post_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id, created_at DESC);
  ```
- [ ] Check how existing migrations (001–005) are applied — wire 006 into the same runner.
- [ ] Commit: `git commit -m "perf(db): add indices for social feed, likes, comments, messages, notifications"`

### 2.2 Notifications — Bulk Mark-as-Read
- [ ] Read `server/routes/notifications.js` fully.
- [ ] **Check:** Is there a `PUT /notifications/read-all` that uses a single `UPDATE ... WHERE user_id = ?` rather than looping?
- [ ] If missing, add it:
  ```js
  router.put('/read-all', authenticateToken, async (req, res) => {
      await db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.user.id]);
      res.json({ success: true });
  });
  ```
- [ ] Commit if added: `git commit -m "perf(notifications): add bulk read-all endpoint"`

### 2.3 Messages — Add Index on Read Status
- [ ] Already covered by index in 2.1 above (`idx_messages_participants`). Confirm it covers `WHERE (sender_id = ? OR receiver_id = ?) AND read = 0`.
- [ ] If needed add: `CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(receiver_id, read);`

### 2.4 Users Search — LIKE Pattern Optimization
- [ ] Read `server/routes/users.js` — find search endpoint.
- [ ] **Issue:** `WHERE username LIKE '%term%'` cannot use a B-tree index (leading wildcard). For small datasets this is fine; note it in findings log.
- [ ] If PostgreSQL full-text search is available and user count is large, note as future improvement. No action needed for now unless search is visibly slow.

---

## Phase 3 — Code Quality

### 3.1 updateLevel — Avoid Re-fetch, Pass XP Directly
- [ ] Read `server/routes/posts.js` lines 11–20 (`updateLevel` function).
- [ ] **Issue:** `updateLevel` fetches `xp` from DB even though the caller just wrote it. Two round-trips per XP update.
- [ ] **Fix:** Accept XP as a parameter:
  ```js
  async function updateLevel(userId, xp) {
      const thresholds = Config.get('levelThresholds', [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000]);
      let level = 1;
      for (let i = 0; i < thresholds.length; i++) {
          if (xp >= thresholds[i]) level = i + 1;
      }
      await db.run('UPDATE users SET level = ? WHERE id = ?', [level, userId]);
  }
  ```
- [ ] Update all callers: after `UPDATE users SET xp = xp + ? WHERE id = ?`, fetch the new xp with `db.get('SELECT xp FROM users WHERE id = ?', [userId])` and pass to `updateLevel`. Or restructure to use a single `UPDATE users SET xp = xp + ?, level = ? WHERE id = ?` with pre-computed level.
- [ ] Commit: `git commit -m "perf(posts): eliminate redundant XP re-fetch in updateLevel"`

### 3.2 Uncaught Promise Rejections
- [ ] Grep all routes in this agent's files for `.then(` without `.catch(` and `async` handlers without try/catch.
  ```bash
  grep -n "\.then(" server/routes/posts.js server/routes/friends.js server/routes/messages.js server/routes/notifications.js server/routes/users.js
  ```
- [ ] Add missing `.catch(err => next(err))` or wrap in try/catch.
- [ ] Commit if any found: `git commit -m "fix(routes): add missing error handling on async chains"`

### 3.3 Content Length Limits on Comments and Messages
- [ ] Verify `POST /posts/:id/comments` enforces a max content length (e.g., 2000 chars).
- [ ] Verify `POST /messages` (DM) enforces a max content length.
- [ ] Add limits where missing:
  ```js
  if (!content || content.trim().length === 0) return res.status(400).json({ error: 'Content required' });
  if (content.length > 2000) return res.status(400).json({ error: 'Content cannot exceed 2000 characters' });
  ```
- [ ] Commit: `git commit -m "fix(validation): enforce content length limits on comments and DMs"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| HIGH | posts.js | N+1 donation rank loop in feed | Pending |
| HIGH | posts.js | Single post visibility not enforced | Pending |
| MED | messages.js | DM read authorization | Pending |
| MED | users.js | Sensitive fields in public profile | Pending |
| MED | friends.js | Accept/decline authorization | Pending |
| LOW | db/schema | Missing indices on social tables | Pending |
| LOW | posts.js | updateLevel re-fetches XP | Pending |
