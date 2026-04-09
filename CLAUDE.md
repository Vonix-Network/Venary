# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm start          # Production server (node server/index.js)
npm run dev        # Development with hot reload (nodemon watches server/ and extensions/)
npm run rebuild    # Rebuild native dependencies from source
```

No test or lint scripts are defined. First run serves a setup wizard; after setup, `data/config.json` is created and the app runs normally.

---

## Architecture

**Venary** is a gaming social platform — Express.js backend with a vanilla JS hash-based SPA frontend and a PHPBB-style extension system.

### Backend (`server/`)

- `index.js` — Entry point. Detects if setup is complete (checks `data/config.json`), serves setup wizard if not, otherwise boots the full app.
- `config.js` — Reads/writes `data/config.json`. All runtime config (DB settings, JWT secret, site name, SMTP, etc.) lives here — no `.env` file.
- `db/factory.js` — Selects PostgreSQL or SQLite adapter based on config. `db/index.js` exposes a unified interface. Schema in `db/schema.sql`.
- `extension-loader.js` — Discovers and mounts extensions from `extensions/`. Each extension declares routes, pages, CSS, DB schema, and nav items via `manifest.json`.
- `middleware/auth.js` — JWT verification middleware used across protected routes.
- `socket.js` — Socket.io real-time events (chat messages, typing indicators, notifications).
- `discordBot.js` — Discord bot integration (rank sync, webhooks).

### Frontend (`public/`)

- `js/app.js` — App init and extension page loader.
- `js/router.js` — Hash-based SPA router (`/#/page`).
- `js/api.js` — Fetch wrapper for all backend API calls.
- `js/socket-client.js` — Socket.io client setup.
- `js/pages/` — Core page modules (auth, feed, profile, friends, chat, admin, mod).

### Extension System (`extensions/`)

Extensions are self-contained modules. Each has:
- `manifest.json` — Declares routes, frontend pages, CSS, isolated DB schema, nav items.
- `server/` — Express router(s) mounted under `/api/[extension]/`.
- `public/` — Frontend page JS injected into the SPA.
- `data/` — Isolated SQLite DB or extension-specific data (gitignored).

Current extensions include: `donations` (Stripe + Solana/Litecoin crypto), `forum`, `minecraft`, `pterodactyl-panel`. Extensions are enabled/disabled via `data/extensions.json`.

### Data Flow

Authentication is JWT-based. Tokens are issued on login (`/api/auth/login`) and verified via `middleware/auth.js`. Crypto wallet addresses are derived deterministically using BIP39/ed25519 HD wallets — the seed is derived from `JWT_SECRET` in config.

---

## Key Conventions

### Git & Commits

After every logical block, bug fix, or feature:
1. `git add .`
2. `git commit -m "[type]: [concise description]"`
3. `git push` (on failure: `git pull --rebase` then re-push)

### Code Integrity

- Use targeted edits — never full-file overwrites on existing source.
- Preserve all existing author credits, license headers, and `@authored` tags.
- Scan for existing logic before adding new utilities (DRY).

### Architecture Rules

- Group related logic into unified modules; reduce file fragmentation.
- Eliminate dead code and redundant dependencies immediately.
- Prefer native language features over external libraries when measurable gains exist.
- Update `README.md` if architectural changes or new config keys are introduced.
