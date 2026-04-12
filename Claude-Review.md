# Claude Code Review Directive

## Purpose

This document instructs Claude Code to perform a comprehensive, autonomous code review of this repository and apply optimizations in its own judgment. When asked to run a review, Claude should read this file and follow all instructions below without requiring further direction.

---

## Scope

Review **every file** in the following directories:

- `server/` — all backend routes, middleware, socket, config, DB layer
- `public/js/` — app.js, router.js, socket-client.js, api.js, all pages/
- `extensions/` — every extension: manifest, server routes, public pages, CSS
- `data/schema.sql` and any extension `schema.sql` files

---

## Review Checklist

For each file, assess and fix the following:

### 1. Correctness & Bugs
- [ ] `const`/`let` at script top-level that should be `var` (browser globals won't attach to `window`)
- [ ] Missing `await` on async calls
- [ ] Race conditions (e.g., socket events firing before DOM is ready)
- [ ] Uncaught promise rejections (`.catch()` missing on fire-and-forget chains)
- [ ] Off-by-one errors in pagination / slice logic
- [ ] SQL injection vectors — any raw string interpolation into query strings instead of `?` placeholders
- [ ] JWT / auth middleware applied inconsistently across routes (some protected, siblings not)
- [ ] Webhook/bot token endpoints accessible without rate limiting

### 2. Security
- [ ] All user-supplied strings must be HTML-escaped before insertion into the DOM (`innerHTML`). Audit every `innerHTML =` assignment for missing `_esc()` / `escapeHtml()` calls
- [ ] Verify every mutating REST endpoint (`POST`/`PUT`/`DELETE`) requires `authenticateToken`
- [ ] Confirm `DELETE /messages/:id` checks ownership OR `MANAGE_MESSAGES` permission — not just ownership
- [ ] Confirm no route leaks secret tokens (webhook token, bot token) to unauthorized callers
- [ ] Ensure file upload paths (attachments) are validated server-side before storage
- [ ] Check `CORS` configuration is not overly permissive in production

### 3. Performance
- [ ] N+1 query patterns — identify any loop that issues a DB query per iteration; consolidate with `JOIN` or `IN (...)` bulk fetch
- [ ] Missing DB indices — cross-reference schema indices against query `WHERE` clauses
- [ ] `SELECT *` on large tables — scope to required columns where identified
- [ ] Socket events that `io.emit()` to ALL clients instead of targeted rooms (global broadcasts in the feed events)
- [ ] Redundant re-renders — DOM functions that rebuild entire lists on every socket event instead of patching the single changed element
- [ ] `_loadSpaceDetails` re-fetches all channels/members on every space click — add in-memory cache with a TTL or invalidation on socket events

### 4. Code Quality
- [ ] Dead code — unreferenced functions, commented-out blocks, unused variables
- [ ] DRY violations — duplicated fetch wrappers, duplicated HTML template strings that should be extracted to a helper
- [ ] Long functions (>80 lines) — identify candidates for extraction into named helpers
- [ ] `console.log` / `console.error` calls that should be gated behind a debug flag in production
- [ ] Magic strings — hardcoded status strings (`'online'`, `'offline'`, `'admin'`) that should be constants
- [ ] Inconsistent error response shapes between routes (some return `{ error: '...' }`, others return plain strings or 500 HTML)

### 5. UX / Frontend
- [ ] Every async action in the UI must show a loading/disabled state and restore it on completion or error
- [ ] Error messages from API responses must surface to the user (toast or inline) — not silently swallowed
- [ ] `MessengerPage._loadMessages` has no loading indicator — add a spinner while fetching
- [ ] Message input should auto-focus when switching channels
- [ ] Empty member list should show a placeholder, not be silently blank
- [ ] Invite modal link should use the correct hash route format (`/#/messenger?invite=CODE`)
- [ ] `_renderMemberItem` uses `member.user_id.slice(0, 8)` as a display name — fetch real usernames from the core `users` table and join or cache them
- [ ] `destroy()` method should be called from the router on page transition away from messenger to clean up the socket connection

### 6. Messenger-Specific
- [ ] `computePermissions()` is called inside every request handler — consider caching per (userId, spaceId) with a short TTL to avoid repeated DB round-trips per request
- [ ] `dm.js` `/dm` list endpoint returns raw `GROUP_CONCAT` for member IDs but no display names — add a join or a secondary lookup
- [ ] `channel_messages` `reactions` column is a JSON blob — queries that filter by reaction (e.g., "who reacted with 👍") are full-table scans; document this limitation and consider a normalized `message_reactions` table if performance becomes an issue
- [ ] `attachConsoleNamespace` in `routes.js` will silently no-op if `io` was already passed at construction time (double-guard is fine, but log a warning)
- [ ] Socket namespace `/messenger` auth uses the same JWT middleware — confirm the secret is sourced from the same `JWT_SECRET` as the main app, not hardcoded

### 7. Extension System
- [ ] Extensions receive `io` but it may be `null` if `app.get('io')` hasn't been set yet at load time — verify load order in `server/index.js` (socket must be initialized before extensions)
- [ ] `extension-loader.js` catches errors per-extension but continues — verify a failed DB init doesn't leave `ext.db = null` and cause a runtime crash in a route handler
- [ ] `toggleExtension` API requires admin check but loads auth middleware inline — extract to a shared middleware import

---

## How to Apply Fixes

1. For each issue found, apply a **targeted edit** — do not rewrite the entire file
2. Group related fixes in a single commit per file or logical unit
3. After all fixes, run a final pass to confirm no new issues were introduced
4. Update this checklist by marking completed items with `[x]`
5. Commit with message: `fix(review): [concise description of what was fixed]`

---

## What NOT to Change

- Do not alter database schema column names or table names (breaking change)
- Do not change the extension manifest format or the `routes.prefix` convention
- Do not modify the core JWT secret derivation or auth flow
- Do not add new external npm dependencies without user approval
- Do not refactor working, correct code purely for style — only fix actual issues

---

## Output Format

After completing the review, produce a summary report with:

```
## Review Summary
- Files reviewed: N
- Issues found: N
- Issues fixed: N
- Issues deferred (require user input): N

### Fixed
- [file:line] Description of fix

### Deferred
- [file] Description of issue requiring user decision
```
