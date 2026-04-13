# Revise_Extensions_Plan.md
# Venary — Extension-to-Core Migration Plan

**Goal:** Eliminate the PHPBB-style extension system entirely. All features become
first-class citizens of the monorepo, sharing a single database, a unified route
tree, consistent middleware, and a single frontend bundle. The result is simpler,
faster, and significantly more secure.

---

## Why the Extension System Must Go

| Problem | Detail |
|---|---|
| **Fragmented databases** | Each extension gets its own isolated SQLite/PG database. Cross-feature queries (e.g., a donation rank affecting a forum badge) require in-process joins across DB connections — slow and error-prone. |
| **Dynamic `require()`** | `extension-loader.js` calls `require(path.join(EXT_DIR, entry.name, ...))` at runtime. Arbitrary code execution risk if the `extensions/` directory is ever writable by an attacker. |
| **No shared FK enforcement** | Pterodactyl schema literally documents: *"Cross-database foreign keys cannot be enforced at the DB level."* Referential integrity is left to application logic scattered across files. |
| **Route namespace pollution** | All extension routes live under `/api/ext/*`. The prefix leaks internal architecture and bypasses centralized rate-limiting/auth layering. |
| **Double CSS surface** | Extension CSS files are injected globally without scoping — class names from `donations.css`, `forum.css`, `messenger.css` etc. can collide with `main.css`. |
| **Manifest-driven JS injection** | Frontend pages are loaded by reading manifests at runtime and injecting `<script>` tags. This defeats any future bundling strategy and makes CSP harder to lock down. |
| **enable/disable via `extensions.json`** | Toggling a feature requires a server restart and reparse of the loader. There is no runtime validation that the required DB tables exist. |
| **Backup complexity** | Backing up the app requires capturing the core DB + one DB file per enabled extension. Easy to miss one. |

---

## Target Architecture

```
server/
  index.js              ← static route wiring, no dynamic loader
  config.js             ← feature flags added here (features.forum, features.donations …)
  db/
    schema.sql          ← ALL tables in one file
    index.js            ← single shared DB connection
  routes/
    auth.js             (existing)
    feed.js             (existing)
    profile.js          (existing)
    friends.js          (existing)
    chat.js             (existing)
    admin.js            (existing)
    mod.js              (existing)
    donations.js        ← migrated from extensions/donations/server/
    donations-crypto.js ← migrated from extensions/donations/server/crypto-routes.js
    forum.js            ← migrated from extensions/forum/server/
    images.js           ← migrated from extensions/images/server/
    messenger.js        ← migrated from extensions/messenger/server/
    minecraft.js        ← migrated from extensions/minecraft/server/
    pterodactyl.js      ← migrated from extensions/pterodactyl-panel/server/
  services/
    crypto/             ← migrated from extensions/donations/server/crypto/
    minecraft/          ← migrated from extensions/minecraft/server/pinger.js + discord.js
    messenger/          ← migrated from extensions/messenger/server/socket.js + permissions.js
  middleware/
    auth.js             (existing)
    validate.js         ← new: centralised Zod/manual input validation
    rateLimit.js        ← new: per-route rate limiters

public/
  js/
    pages/
      auth.js           (existing)
      feed.js           (existing)
      profile.js        (existing)
      friends.js        (existing)
      chat.js           (existing)
      admin.js          (existing)
      mod.js            (existing)
      donations.js      ← migrated
      donations-admin.js← migrated
      forum.js          ← migrated
      images-admin.js   ← migrated
      images-hook.js    ← migrated
      messenger.js      ← migrated
      minecraft.js      ← migrated
      minecraft-admin.js← migrated
      pterodactyl.js    ← migrated
      pterodactyl-admin.js← migrated
    lib/
      skin3d.umd.js     ← migrated from extensions/minecraft/public/lib/
  css/
    main.css            (existing)
    components.css      (existing)
    themes/             (existing)
    donations.css       ← migrated
    forum.css           ← migrated
    images-admin.css    ← migrated
    messenger.css       ← migrated
    minecraft.css       ← migrated
    pterodactyl.css     ← migrated
```

No `extensions/` directory. No `extension-loader.js`. No `extensions.json`.

---

## Migration Phases

### Phase 1 — Merge All Database Schemas
**Files touched:** `server/db/schema.sql`

1. Append every extension `schema.sql` to the core schema in dependency order:
   - Images (no FKs to core)
   - Forum (`categories`, `threads`, `posts`)
   - Donations (`donation_ranks`, `donations`, `user_ranks`, crypto tables)
   - Minecraft (`mc_servers`, `linked_accounts`, `player_stats`, `mc_players`, `uptime_history`, `link_codes`)
   - Messenger (all 20+ tables)
   - Pterodactyl (`pterodactyl_settings`, `pterodactyl_access`)

2. Add proper `FOREIGN KEY` constraints where extensions previously documented
   "cannot enforce at DB level":
   - `donations.user_id → users.id`
   - `user_ranks.user_id → users.id`
   - `linked_accounts.user_id → users.id`
   - `pterodactyl_access.user_id → users.id`
   - `forum threads/posts.user_id → users.id`
   - `messenger members.user_id → users.id` etc.

3. Add a `migrations/` versioned migration system so the schema can evolve
   without manual `CREATE TABLE IF NOT EXISTS` drift.

4. Delete all `extensions/*/server/schema.sql` files after merge is verified.

**Security gain:** Referential integrity is now enforced by the database engine,
not scattered application logic.

---

### Phase 2 — Migrate Backend Routes

For each extension, move its server code into `server/routes/` and update imports
to use the single shared `db` instance from `server/db/index.js`.

#### 2a — Images (`~384 lines`)
- Move `extensions/images/server/routes.js` → `server/routes/images.js`
- Change: `const db = ext.db` → `const db = require('../db')`
- Mount in `index.js`: `app.use('/api/images', require('./routes/images'))`

#### 2b — Forum (`~527 lines + discord.js`)
- Move `extensions/forum/server/routes.js` → `server/routes/forum.js`
- Move `extensions/forum/server/discord.js` → `server/services/forum-discord.js`
- Mount: `app.use('/api/forum', require('./routes/forum'))`

#### 2c — Minecraft (`~1020 lines + pinger.js + discord.js`)
- Move `extensions/minecraft/server/routes.js` → `server/routes/minecraft.js`
- Move `extensions/minecraft/server/pinger.js` → `server/services/minecraft/pinger.js`
- Move `extensions/minecraft/server/discord.js` → `server/services/minecraft/discord.js`
- Mount: `app.use('/api/minecraft', require('./routes/minecraft'))`

#### 2d — Pterodactyl (`~544 lines + client.js`)
- Move `extensions/pterodactyl-panel/server/routes.js` → `server/routes/pterodactyl.js`
- Move `extensions/pterodactyl-panel/server/pterodactyl-client.js` → `server/services/pterodactyl-client.js`
- Mount: `app.use('/api/pterodactyl', require('./routes/pterodactyl'))`

#### 2e — Donations (`~1392 + 1463 + crypto/* = ~5000 lines`)
- Move `extensions/donations/server/routes.js` → `server/routes/donations.js`
- Move `extensions/donations/server/crypto-routes.js` → `server/routes/donations-crypto.js`
- Move `extensions/donations/server/crypto/` → `server/services/crypto/`
- Move `extensions/donations/server/discord.js` → `server/services/donations-discord.js`
- Move `extensions/donations/server/guest-link.js` → `server/services/guest-link.js`
- Mount:
  ```js
  app.use('/api/donations',        require('./routes/donations'));
  app.use('/api/donations/crypto', require('./routes/donations-crypto'));
  ```

#### 2f — Messenger (`~49 stub + 10 sub-routes + socket.js + permissions.js`)
- Move all `extensions/messenger/server/routes/` → `server/routes/messenger/`
- Move `extensions/messenger/server/socket.js` → `server/services/messenger-socket.js`
- Move `extensions/messenger/server/permissions.js` → `server/services/messenger-permissions.js`
- Mount: `app.use('/api/messenger', require('./routes/messenger'))`
- Integrate messenger socket events into the main `server/socket.js`

**Security gains per route:**
- All routes now pass through the same centralized middleware stack (auth, rate
  limiting, request size limits, CORS) applied in `index.js` before any router.
- No route can be loaded from an attacker-writable directory.
- Route paths are static strings, auditable at a glance.

---

### Phase 3 — Migrate Frontend Pages

Move all extension public JS pages into `public/js/pages/` and all lib files
into `public/js/lib/`. Update `public/js/app.js` and `public/js/router.js` to
statically import/reference them.

| Source | Destination |
|---|---|
| `extensions/donations/public/pages/donations.js` | `public/js/pages/donations.js` |
| `extensions/donations/public/pages/donations-admin.js` | `public/js/pages/donations-admin.js` |
| `extensions/forum/public/pages/forum.js` | `public/js/pages/forum.js` |
| `extensions/images/public/images-admin.js` | `public/js/pages/images-admin.js` |
| `extensions/images/public/images-hook.js` | `public/js/pages/images-hook.js` |
| `extensions/messenger/public/pages/messenger.js` | `public/js/pages/messenger.js` |
| `extensions/minecraft/public/pages/minecraft.js` | `public/js/pages/minecraft.js` |
| `extensions/minecraft/public/pages/minecraft-admin.js` | `public/js/pages/minecraft-admin.js` |
| `extensions/minecraft/public/lib/skin3d.umd.js` | `public/js/lib/skin3d.umd.js` |
| `extensions/pterodactyl-panel/public/pages/pterodactyl.js` | `public/js/pages/pterodactyl.js` |
| `extensions/pterodactyl-panel/public/pages/pterodactyl-admin.js` | `public/js/pages/pterodactyl-admin.js` |

Update API call prefixes inside each page:
- `'/api/ext/donations/...'` → `'/api/donations/...'`
- `'/api/ext/forum/...'` → `'/api/forum/...'`
- `'/api/ext/images/...'` → `'/api/images/...'`
- `'/api/ext/messenger/...'` → `'/api/messenger/...'`
- `'/api/ext/minecraft/...'` → `'/api/minecraft/...'`
- `'/api/ext/pterodactyl-panel/...'` → `'/api/pterodactyl/...'`

**Security gain:** CSP `script-src 'self'` now covers all JS. No runtime injection
of `<script src="extensions/*/public/...">` tags that could be tampered with.

---

### Phase 4 — Migrate CSS

Move all extension CSS into `public/css/` and load them from `index.html` as
static `<link>` tags, not dynamically injected by the loader.

| Source | Destination |
|---|---|
| `extensions/donations/public/css/donations.css` | `public/css/donations.css` |
| `extensions/forum/public/css/forum.css` | `public/css/forum.css` |
| `extensions/images/public/css/images-admin.css` | `public/css/images-admin.css` |
| `extensions/messenger/public/css/messenger.css` | `public/css/messenger.css` |
| `extensions/minecraft/public/css/minecraft.css` | `public/css/minecraft.css` |
| `extensions/pterodactyl-panel/public/css/pterodactyl.css` | `public/css/pterodactyl.css` |

Audit for class name collisions with `main.css` and `components.css` during move;
prefix any colliding selectors with their feature name (e.g., `.forum-card`).

---

### Phase 5 — Add Feature Flags to Config

Replace `data/extensions.json` with a `features` block inside `data/config.json`:

```json
{
  "features": {
    "forum":       true,
    "donations":   true,
    "images":      true,
    "messenger":   true,
    "minecraft":   true,
    "pterodactyl": true
  }
}
```

In `server/index.js`, conditionally mount routes and nav items based on these flags:

```js
const { features } = config;
if (features.forum)       app.use('/api/forum',       require('./routes/forum'));
if (features.donations)   app.use('/api/donations',   require('./routes/donations'));
// … etc.
```

Frontend nav is driven by the `/api/auth/me` response — add a `features` object
to that payload so the SPA shows/hides nav items without a second request.

**Security gain:** Feature toggling is now a config value, not a file-system
scan. No risk of loading untrusted code from unexpected directories.

---

### Phase 6 — Add Centralised Security Middleware

Create `server/middleware/validate.js` and apply it before all feature routes:

```
Input validation  →  Auth check  →  Rate limit  →  Route handler
```

Key additions:
- **Request body size limits** per route type (e.g., 10 KB for text posts, 10 MB
  for image uploads) — currently inconsistent across extensions.
- **Parameterized query audit** — grep all migrated route files for raw string
  interpolation into SQL; replace every instance with `?` / `$1` placeholders.
- **Rate limiting** — apply `express-rate-limit` per logical resource:
  - Auth endpoints: 10 req/min
  - Donation checkout: 5 req/min
  - Forum post creation: 20 req/min
  - Minecraft stat sync (server-to-server): 60 req/min with API key check
- **Output sanitization** — ensure user-generated content (forum posts, chat
  messages, display names) is HTML-escaped before being sent to the frontend.
- **Helmet CSP tightening** — once JS injection is static, `script-src-attr`
  can be removed from `'unsafe-inline'` for non-personalization scripts.

---

### Phase 7 — Remove the Extension System

After all phases above are verified working:

1. Delete `server/extension-loader.js`
2. Delete `extensions/` directory (all content migrated)
3. Delete `data/extensions.json`
4. Remove `ExtensionLoader` from `server/index.js`
5. Remove the nav item injection loop (nav items are now hardcoded / config-driven)
6. Remove extension CSS injection from the HTML template generator
7. Remove extension `<script>` injection from the HTML template generator
8. Update `CLAUDE.md` to reflect the new architecture

---

## Execution Order & Dependencies

```
Phase 1 (Schema merge)
    └─→ Phase 2 (Backend routes)       ← depends on unified DB
            └─→ Phase 3 (Frontend pages)  ← depends on new API paths
            └─→ Phase 4 (CSS)             ← independent, can run in parallel with 3
Phase 5 (Feature flags)                ← can run after Phase 2
Phase 6 (Security middleware)          ← run after Phase 2, before production
Phase 7 (Delete extension system)      ← run last, after all phases verified
```

Each phase should be its own atomic commit. Do not batch phases.

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| DB migration breaks existing data | Write an idempotent migration script that copies data from extension SQLite files into the unified DB before dropping them. |
| API path changes break clients (Discord bots, MC plugins) | Keep `/api/ext/*` as alias redirects (301) for one release cycle, then remove. |
| Missed SQL injection in migrated code | Run `grep -rn "db.run\|db.all\|db.get" server/routes/` after migration; manually audit any line that concatenates user input. |
| CSS class collisions | Run a diff of all extension CSS selectors against `main.css` before copying. Prefix clashes during move. |
| Messenger socket integration conflicts | Messenger socket currently lives in `extensions/messenger/server/socket.js` separate from the core `server/socket.js`. Merge carefully — namespace messenger events under `messenger:*` to prevent collisions. |

---

## What Does NOT Change

- Frontend SPA routing (`/#/page` hash router) — unchanged
- JWT authentication flow — unchanged
- PostgreSQL / SQLite dual-DB support — unchanged (just one DB now)
- Setup wizard — unchanged
- Theme / personalization system — unchanged
- Discord bot (`server/discordBot.js`) — unchanged
- Admin and mod pages — unchanged

---

## Success Criteria

- [ ] `extensions/` directory does not exist
- [ ] `server/extension-loader.js` does not exist  
- [ ] `data/extensions.json` does not exist
- [ ] All API routes respond identically to pre-migration (verified by manual test
      of each feature's golden path)
- [ ] Single `server/db/schema.sql` contains all table definitions
- [ ] All cross-feature foreign keys are enforced at the database level
- [ ] `grep -r "require.*extensions" server/` returns no results
- [ ] `grep -r "/api/ext/" public/` returns no results
- [ ] Server starts with zero dynamic file-system scanning
