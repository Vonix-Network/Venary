# Agent 6 — Frontend SPA Audit & Upgrade

## Status: Pending

## Context

Live production site. Vanilla JS SPA with hash-based routing. No build step — files are served directly. All JS runs in the browser. Do not introduce any module bundler, framework, or npm frontend dependency.

**Files owned:**
- `public/js/app.js` (2031 lines — largest file)
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

**Read app.js fully first** — it defines shared utilities (`_esc`, `escapeHtml`, page rendering helpers) used by all pages.

---

## Phase 1 — Security Audit (XSS)

### 1.1 Identify the Escape Function
- [ ] Read `public/js/app.js` — find the existing HTML escape utility. It is likely named `_esc`, `escapeHtml`, or `sanitize`.
- [ ] The correct implementation must escape: `&`, `<`, `>`, `"`, `'`.
  ```js
  function _esc(str) {
      if (str == null) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
  }
  ```
- [ ] If the function exists but is incomplete, fix it in app.js.
- [ ] If it does not exist, add it to app.js and ensure it is globally accessible (attach to `window._esc = _esc`).
- [ ] Commit: `git commit -m "security(frontend): verify and harden HTML escape utility"`

### 1.2 Audit innerHTML in app.js
- [ ] Run:
  ```bash
  grep -n "innerHTML" public/js/app.js
  ```
- [ ] For every `innerHTML =` assignment, check whether the assigned string contains user-controlled data (username, display_name, content, bio, avatar URL, etc.).
- [ ] **Rule:** Any user-controlled value inserted into innerHTML MUST be wrapped in `_esc()`.
- [ ] **Exception:** Values set via `textContent =` are safe (no escaping needed) — prefer textContent for plain text.
- [ ] Fix every unescaped `innerHTML` assignment that includes user data.
- [ ] Commit: `git commit -m "security(frontend): escape all user content in app.js innerHTML assignments"`

### 1.3 Audit innerHTML in Each Page File
- [ ] For each page file, run:
  ```bash
  grep -n "innerHTML" public/js/pages/feed.js
  grep -n "innerHTML" public/js/pages/forum.js
  grep -n "innerHTML" public/js/pages/profile.js
  grep -n "innerHTML" public/js/pages/messenger.js
  grep -n "innerHTML" public/js/pages/chat.js
  grep -n "innerHTML" public/js/pages/admin.js
  grep -n "innerHTML" public/js/pages/mod.js
  ```
  (Repeat for all page files.)
- [ ] For each hit, verify user content is escaped. Fix all gaps.
- [ ] Group all page fixes into themed commits:
  - `git commit -m "security(frontend): escape user content in feed.js, profile.js, friends.js"`
  - `git commit -m "security(frontend): escape user content in forum.js, chat.js"`
  - `git commit -m "security(frontend): escape user content in messenger.js, admin.js, mod.js"`
  - `git commit -m "security(frontend): escape user content in donations.js, minecraft.js, pterodactyl.js"`

### 1.4 Avatar and URL Injection
- [ ] Search for places where `avatar` URL values are injected into `src=""` attributes via `innerHTML`.
  ```bash
  grep -rn "avatar\|\.src\s*=" public/js/
  ```
- [ ] **Rule:** Avatar URLs should only set `img.src` via DOM property, not via `innerHTML` string interpolation. If setting via innerHTML, verify the URL is from a trusted source (same-origin or an allowed CDN).
- [ ] **Fix pattern:** Instead of `div.innerHTML = '<img src="' + user.avatar + '">'`, use:
  ```js
  const img = document.createElement('img');
  img.src = user.avatar || '/default-avatar.png';
  div.appendChild(img);
  ```
- [ ] Commit: `git commit -m "security(frontend): use DOM property for avatar src to prevent URL injection"`

---

## Phase 2 — Performance Audit

### 2.1 Feed — No Full Rebuild on Socket Events
- [ ] Read `public/js/pages/feed.js`.
- [ ] **Find** socket event handlers (e.g., `socket.on('new_post', ...)` or similar).
- [ ] **Issue:** If the handler calls a function that fetches all posts from the API and re-renders the entire feed, this is wasteful.
- [ ] **Fix:** Patch the DOM — prepend the new post element without refetching:
  ```js
  socket.on('new_post', (post) => {
      const feedEl = document.getElementById('feed');
      if (feedEl) {
          const postEl = renderPost(post); // build element without API call
          feedEl.prepend(postEl);
      }
  });
  ```
- [ ] Commit: `git commit -m "perf(feed): patch DOM on socket events instead of full re-render"`

### 2.2 Event Listener Cleanup on Page Navigation
- [ ] Read `public/js/router.js` — understand how pages are loaded/unloaded.
- [ ] Read `public/js/app.js` — check if pages have a `destroy()` or `cleanup()` hook that removes socket listeners.
- [ ] **Issue:** If `socket.on('event', handler)` is called on every page load without `socket.off('event', handler)` on teardown, listeners accumulate across navigations — memory leak and duplicate event processing.
- [ ] **Fix pattern:** Each page module that registers socket listeners must also expose a `destroy()` function:
  ```js
  // In each page module:
  const handlers = {};
  handlers.newPost = (post) => { /* ... */ };
  socket.on('new_post', handlers.newPost);

  function destroy() {
      socket.off('new_post', handlers.newPost);
  }
  ```
- [ ] Call `destroy()` in the router when navigating away from a page.
- [ ] Apply to feed.js, forum.js, chat.js, messenger.js, minecraft.js.
- [ ] Commit: `git commit -m "fix(frontend): clean up socket listeners on page navigation to prevent leaks"`

### 2.3 API — Abort Controller on Navigation
- [ ] Read `public/js/api.js`.
- [ ] **Issue:** If a user navigates away while an API fetch is in flight, the response is discarded but the connection is still open.
- [ ] **Fix:** Pages should use `AbortController` for API calls and abort on navigation:
  ```js
  let pageController = new AbortController();

  async function loadFeed() {
      const data = await fetch('/api/posts/feed', { signal: pageController.signal });
      // ...
  }

  function destroy() {
      pageController.abort();
      pageController = new AbortController(); // reset for next load
  }
  ```
- [ ] Add abort support to the `api.js` fetch wrapper as an optional `signal` parameter.
- [ ] Commit: `git commit -m "perf(frontend): add AbortController support to API calls on page navigation"`

### 2.4 Messenger — Cache Space/Channel State
- [ ] Read `public/js/pages/messenger.js`.
- [ ] **Issue:** If the space list or channel details are re-fetched from the API every time the user clicks a space, this is wasteful.
- [ ] **Fix:** Keep an in-memory cache with invalidation on socket events:
  ```js
  const spaceCache = new Map(); // spaceId -> { channels, members, fetchedAt }
  const CACHE_TTL = 30 * 1000;

  async function getSpaceDetails(spaceId) {
      const cached = spaceCache.get(spaceId);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached;
      const data = await api.get(`/messenger/spaces/${spaceId}`);
      spaceCache.set(spaceId, { ...data, fetchedAt: Date.now() });
      return data;
  }

  // Invalidate on socket events:
  socket.on('space:channel_created', ({ spaceId }) => spaceCache.delete(spaceId));
  socket.on('space:member_joined',   ({ spaceId }) => spaceCache.delete(spaceId));
  ```
- [ ] Commit: `git commit -m "perf(messenger): add space detail cache with socket invalidation"`

---

## Phase 3 — Code Quality

### 3.1 const/let for Browser Globals
- [ ] In each page file that is injected into the SPA (not a module), check for `const` or `let` declarations at the top level that need to be accessible as `window.PageName` or similar.
- [ ] `const`/`let` are block-scoped and do NOT attach to `window` — they cannot be accessed from other scripts.
- [ ] If a page needs to expose an API to the router (e.g., `window.FeedPage = { init, destroy }`), the exposure must be done explicitly.
- [ ] Audit `public/js/router.js` to see how it calls page init functions — ensure the pattern is consistent.
- [ ] Commit: `git commit -m "fix(frontend): ensure page modules expose init/destroy via window correctly"`

### 3.2 Missing await on Async Calls
- [ ] Search for patterns where an async function is called without `await` inside an `async` function:
  ```bash
  grep -n "^\s*[a-zA-Z].*(" public/js/pages/feed.js | grep -v "await\|return\|const\|let\|var\|//"
  ```
- [ ] Review manually for any fire-and-forget calls that should be awaited.
- [ ] Commit if fixes found: `git commit -m "fix(frontend): add missing await on async API calls"`

### 3.3 Error Feedback — Show User-Friendly Messages
- [ ] In auth.js (frontend), verify that API errors are shown to the user (not silently swallowed).
- [ ] In admin.js, mod.js — verify admin actions show success/failure feedback.
- [ ] Pattern to use where missing:
  ```js
  try {
      await api.post('/endpoint', data);
      showSuccess('Action completed successfully');
  } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
  }
  ```
- [ ] Commit: `git commit -m "fix(frontend): add user-facing error feedback on failed actions"`

### 3.4 app.js — Split Large File if Functions are Cleanly Separable
- [ ] Read `public/js/app.js` (2031 lines).
- [ ] Identify top-level groupings: auth helpers, notification helpers, UI utilities, page render helpers.
- [ ] **Only split if** the existing structure already groups these cleanly and the router loads files in the correct order.
- [ ] If the file is one large IIFE or has deep interdependencies, do NOT split — leave as-is and just fix the issues above.
- [ ] Commit if split: `git commit -m "refactor(frontend): extract UI utilities from app.js into separate included files"`

---

## Findings Log

| Severity | File | Issue | Fix Applied |
|---|---|---|---|
| HIGH | app.js + all pages | innerHTML without _esc() on user data | Pending |
| HIGH | all pages | Avatar URL injection via innerHTML | Pending |
| MED | feed.js | Full re-render on socket events | Pending |
| MED | all pages | Socket listeners not cleaned up on navigate | Pending |
| MED | messenger.js | Space details re-fetched on every click | Pending |
| LOW | api.js | No AbortController support | Pending |
| LOW | all pages | Missing await on some async calls | Pending |
| LOW | router.js | Page destroy() not called on navigation | Pending |
