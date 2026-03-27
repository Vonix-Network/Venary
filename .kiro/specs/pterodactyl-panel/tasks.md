# Implementation Plan: Pterodactyl Panel Extension

## Overview

Build the `extensions/pterodactyl-panel/` extension from the ground up, following the existing Venary extension architecture. Tasks are ordered by dependency: schema → server infrastructure → client UI → admin integrations → surgical core edits.

## Tasks

- [-] 1. Scaffold extension directory and manifest
  - Create `extensions/pterodactyl-panel/manifest.json` with `id`, `name`, `version`, `description`, `routes`, `pages`, `css`, `nav`, and `admin_route` fields matching the minecraft extension format
  - The `nav` entry must include a `requiresAccess` or equivalent flag so the router only shows it to users with Panel_Access
  - The `admin_route` must point to `/pterodactyl-admin`
  - _Requirements: 1.1, 1.2, 1.4_

- [~] 2. Create extension database schema
  - Create `extensions/pterodactyl-panel/server/schema.sql`
  - Define `pterodactyl_access` table: `user_id TEXT PRIMARY KEY`, `granted_at TEXT`, with a FOREIGN KEY to `users.id`
  - Define `pterodactyl_settings` table: `key TEXT PRIMARY KEY`, `value TEXT` — used to store `base_url`, `api_key`, `server_id`
  - _Requirements: 3.1, 2.2, 8.1_

- [~] 3. Implement PterodactylClient class
  - Create `extensions/pterodactyl-panel/server/pterodactyl-client.js`
  - Class constructor accepts `{ baseUrl, apiKey, serverId }`
  - Implement `sendPowerAction(action)` — POST to Pterodactyl REST power endpoint with Bearer auth
  - Implement `getServerStatus()` — GET server resource state, normalize to `running | offline | starting | stopping`
  - Implement `connectConsole(onLine, onStatus, onError)` — opens WebSocket to Pterodactyl console endpoint, emits token auth frame, calls `onLine` per log line, `onStatus` per state event
  - Implement exponential backoff reconnect: base delay 1 s, multiplier 2×, max 5 attempts; call `onError` after exhausting retries
  - Buffer up to 500 recent console lines in a circular array on the instance
  - _Requirements: 5.1–5.8, 6.5, 7.2_

  - [ ]* 3.1 Write property test: backoff delay sequence is strictly non-decreasing and never exceeds 2^4 × base (16 s)
    - **Property 1: Exponential backoff bounds**
    - **Validates: Requirements 5.5**

  - [ ]* 3.2 Write property test: console line buffer never exceeds 500 entries regardless of how many lines are pushed
    - **Property 2: Console buffer capacity invariant**
    - **Validates: Requirements 5.8**

- [~] 4. Implement server routes
  - Create `extensions/pterodactyl-panel/server/routes.js` as a factory function `module.exports = function(extDb) { ... }`
  - Implement `requirePanelAccess(req, res, next)` middleware: checks JWT via `authenticateToken`, then queries `pterodactyl_access` for `req.user.id`; returns 401 if no token, 403 if no row
  - Implement `requireSuperadmin(req, res, next)` middleware: checks `users.role === 'superadmin'` via core db; returns 403 otherwise
  - `GET /status` — protected by `requirePanelAccess`; calls `PterodactylClient.getServerStatus()` using settings from db; returns `{ status }`
  - `POST /power` — protected by `requirePanelAccess`; validates `action` is one of `start|stop|kill|restart`; forwards to `PterodactylClient.sendPowerAction()`; returns 200 or 502
  - `GET /settings` — protected by `authenticateToken` + `requireAdmin`; returns `base_url` and `server_id` only (never `api_key`)
  - `POST /settings` — protected by `authenticateToken` + `requireAdmin`; validates `base_url` and `server_id` non-empty (400 if missing); persists all three fields; never echoes `api_key` in response
  - `GET /access` — protected by `authenticateToken` + `requireAdmin`; returns array of `{ user_id, granted_at }` rows
  - `POST /access/:userId` — protected by `requireSuperadmin`; inserts row into `pterodactyl_access`
  - `DELETE /access/:userId` — protected by `requireSuperadmin`; deletes row from `pterodactyl_access`
  - _Requirements: 2.1–2.6, 3.1–3.5, 4.1–4.2, 6.5–6.7, 7.2, 8.1–8.5, 10.3_

  - [ ]* 4.1 Write property test: any route called without a JWT always returns 401
    - **Property 3: Unauthenticated request rejection**
    - **Validates: Requirements 4.1**

  - [ ]* 4.2 Write property test: POST /settings with empty base_url or empty server_id always returns 400
    - **Property 4: Settings validation completeness**
    - **Validates: Requirements 2.4, 2.5**

  - [ ]* 4.3 Write property test: GET /settings response body never contains the string value of the stored api_key
    - **Property 5: API key non-disclosure**
    - **Validates: Requirements 8.2, 2.3, 2.6**

- [~] 5. Wire Socket.IO console namespace
  - In `routes.js` factory, accept the `io` instance (pass it from the extension loader or expose a `setIo(io)` method)
  - Register namespace `/pterodactyl-console`
  - On namespace `connection`: authenticate the socket via handshake token using `authenticateToken` logic; check `pterodactyl_access`; disconnect if either check fails
  - On first client connect (or on reconnect): instantiate/reuse `PterodactylClient.connectConsole()`; flush the 500-line buffer to the newly connected socket
  - Forward each `onLine` callback to `io.of('/pterodactyl-console').emit('console:line', line)`
  - Forward each `onStatus` callback to `io.of('/pterodactyl-console').emit('status:update', status)`
  - On `onError`: emit `console:error` to namespace
  - _Requirements: 5.1–5.8, 7.4_

  - [ ]* 5.1 Write property test: socket connection with invalid/missing token is always rejected (disconnect called)
    - **Property 6: Socket auth enforcement**
    - **Validates: Requirements 4.1, 4.2_

- [ ] 6. Checkpoint — server layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [~] 7. Implement panel UI page
  - Create `extensions/pterodactyl-panel/public/pages/pterodactyl.js` exporting `PterodactylPage` global
  - `init()`: call `GET /api/ext/pterodactyl-panel/status`; if 401/403 render access-denied message and return early (no console or buttons rendered)
  - Render console output area: `<pre>` or `<div>` using `var(--font-mono)` and `var(--bg-tertiary)` background, scrollable, `animate-fade-up`
  - Render power buttons: Start, Stop (with Kill secondary action), Restart using `btn` classes; disable all three while a request is in-flight
  - Render status badge using `badge` class with color mapping: `running`→`badge-online`, `offline`→`badge-offline`, `starting`/`stopping`→`badge-level`
  - Connect to Socket.IO namespace `/pterodactyl-console`; append `console:line` events to output area; auto-scroll unless user has manually scrolled up; update badge on `status:update`; show error banner on `console:error`
  - Power button click handlers: POST to `/api/ext/pterodactyl-panel/power` with `{ action }`; show success/error toast; re-enable buttons on completion
  - _Requirements: 4.3–4.4, 5.1–5.4, 5.7, 6.1–6.9, 7.1, 7.3, 7.5, 9.1–9.5_

  - [ ]* 7.1 Write property test: appending N lines to the console DOM never causes the scroll position to jump when the user has scrolled up
    - **Property 7: Auto-scroll suppression invariant**
    - **Validates: Requirements 5.4**

- [~] 8. Implement admin settings page
  - Create `extensions/pterodactyl-panel/public/pages/pterodactyl-admin.js` exporting `PterodactylAdminPage` global
  - `init()`: fetch `GET /api/ext/pterodactyl-panel/settings`; populate `base_url` and `server_id` fields; leave `api_key` input empty
  - Render form with three `input-field` inputs: Base URL, API Key (type=password, placeholder only), Server ID; submit button using `btn btn-primary`
  - On submit: POST to `/api/ext/pterodactyl-panel/settings` with all three fields; show success/error toast; clear the API Key field after successful save
  - Use `admin-settings-card` CSS class for the card wrapper
  - _Requirements: 2.1–2.3, 8.3, 9.1–9.2_

- [~] 9. Create extension CSS
  - Create `extensions/pterodactyl-panel/public/css/pterodactyl.css`
  - Style the console output area: `background: var(--bg-tertiary)`, `font-family: var(--font-mono)`, `color: var(--neon-cyan)`, `overflow-y: auto`, `max-height: 400px`, `border-radius` consistent with existing cards
  - Style the power controls row: flex layout, gap, responsive wrap at 360 px
  - Style the error banner: `background: var(--danger)` or equivalent, visible, dismissible
  - Style the Kill secondary button as a smaller variant attached to the Stop button
  - _Requirements: 9.1–9.4_

- [~] 10. Surgical edit — admin.js Panel Access toggle
  - In `public/js/pages/admin.js`, inside the `loadUsers()` user row map function, add a Panel Access toggle cell
  - Check `App.extensions.some(e => e.id === 'pterodactyl-panel' && e.enabled)` before rendering the toggle (same pattern as the Minecraft UUID button)
  - Fetch current access state from `GET /api/ext/pterodactyl-panel/access` once before rendering the table; build a Set of granted user IDs
  - Render a `<label class="toggle">` (or equivalent existing toggle component) per row; set `checked` if user ID is in the granted set
  - Toggle is `disabled` unless `App.currentUser.role === 'superadmin'`
  - `onchange` handler calls `POST` or `DELETE /api/ext/pterodactyl-panel/access/:userId` and reverts the toggle on error
  - _Requirements: 3.2–3.4, 10.3–10.4_

- [~] 11. Surgical edit — admin_menu.js superadmin demote option
  - In `admin_menu.js`, add menu option 7 "Demote Superadmin to Admin" and renumber the current "Exit" from 7 to 8
  - Update the prompt string to show options 1–8
  - Implement case `'7'`: prompt for username; fetch user; if role is `superadmin` confirm then `UPDATE users SET role = 'admin'`; else print info message
  - Update case `'8'` (was `'7'`) to call `process.exit(0)`
  - _Requirements: 10.2_

- [~] 12. Surgical edit — superadmin protection on core ban/role-change routes
  - Locate the ban and role-change route handlers in `server/routes/` (or `server/index.js`)
  - Add a guard: if the target user's role is `superadmin`, return 403 before executing the ban or role update
  - This applies to: ban user, unban user, change role, delete user endpoints
  - Do not modify the `requireAdmin` middleware itself; add the guard inline in each affected handler
  - _Requirements: 10.6_

  - [ ]* 12.1 Write property test: ban/role-change/delete endpoints always return 403 when target user role is `superadmin`
    - **Property 8: Superadmin immutability via web**
    - **Validates: Requirements 10.6**

- [ ] 13. Final checkpoint — full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The `requireSuperadmin` middleware (task 4) is the single enforcement point for Panel_Access toggle endpoints — do not duplicate the check elsewhere
- The API key must never appear in any HTTP response, Socket.IO payload, or console log; enforce this at the route layer, not just the client
- Property tests should use a property-based testing library already present in `package.json` (e.g. `fast-check`); if none exists, add it as a dev dependency
