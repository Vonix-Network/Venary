# extensions/ — Archived Reference Only

This directory is **not loaded by the server** and is kept solely as a historical reference.

## Why it still exists

All extension code has been migrated into the main codebase:

| What | Old location | Live location |
|---|---|---|
| API routes | `extensions/*/server/routes.js` | `server/routes/*.js` |
| Services | `extensions/*/server/discord.js` etc. | `server/services/` |
| DB schema | `extensions/*/server/schema.sql` | `server/db/schema.sql` |
| Frontend pages | ~~`extensions/*/public/`~~ removed | `public/js/pages/`, `public/css/` |

`server/index.js` mounts all routes directly from `server/routes/` — no extension loader is called.

## Minecraft backward compatibility

Old Minecraft mods that POST to `/api/ext/minecraft/…` still work.
`server/index.js` mounts `server/routes/minecraft.js` at **both**:
- `/api/minecraft/` (primary)
- `/api/ext/minecraft/` (mod backward compat)

## Do not edit files here

Changes made in `extensions/` have **no effect** on the running site.
Edit the live files in `public/` and `server/` instead.
