# Changelog

All notable changes to Venary will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Messenger — UI & Mobile Polish** — Full structural and visual rebuild of the messenger UI to achieve Discord/Fluxer-parity. The Friends list has been integrated directly into the main message view via a "Friends" button in the sidebar. Fully implemented mobile responsive design featuring a slide-in sidebar (toggleable via hamburger menu), adjusted touch targets (44px minimum), safe-area insets for notches/keyboards, and long-press touch support for context menus. Fixed markdown underline rendering.

### Fixed
- **Messenger Layout & Replies** — Fixed massive internal message padding by applying correct flex alignment. Aligned the layout to a cohesive block, ensuring correct text flow and timestamp placement. Timestamps are now visible on hover for follow-up messages. Restructured replies to show above the message header and implemented an interactive snippet with an anchor-link ("jump to") feature that temporarily highlights the original message.
- **Messenger Navigation & Sync** — Fixed an issue where new channels and spaces required a page refresh to display by automatically subscribing the socket to new spaces upon creation/joining and instantly rendering locally created channels.
- **Messenger URLs** — The URL hash now actively updates to reflect the current space, channel, or DM, allowing users to safely refresh the page and return to their active chat instead of the default welcome screen.
- **Messenger/Admin Performance** — Fixed an issue where the main website UI flashed before loading fullscreen apps like the Messenger or Admin Dashboard. The UI elements now immediately hide to prevent the flash. Heavy background processes (like the `ParticleEngine` and `WebGLEngine` loops) are now instantly paused when overlaying fullscreen apps to heavily optimize browser resource usage.
- **Messenger — Settings System** — Full Discord-style per-user settings modal accessible from the gear button in the messenger sidebar footer. Organised into four tabs:
  - *Privacy & Safety*: Who can DM you (Everyone / Friends Only / Nobody), Message Requests toggle, Auto-Accept Requests, Show Online Status, Show Read Receipts, Allow Friend Requests via DM.
  - *Notifications*: DM notification level (All / Mentions / Nothing), Notification Sounds, Message Preview in Notifications.
  - *Text & Appearance*: Compact Mode, Emoji Size (Small / Medium / Large), Link Previews.
  - *Advanced*: Developer Mode (Copy ID context menu items), clear local DM cache.
- **Messenger — Message Requests** — Non-friend DM attempts now route through an approval queue when the recipient has message requests enabled. A badge on the settings button shows the pending count. Senders receive a "request sent" toast; recipients can accept or decline from the Message Requests inbox. Accepting opens the conversation immediately. Real-time socket events notify both parties on accept/decline.
- **Messenger — DM Policy Enforcement** — `POST /dm` now checks the target user's privacy settings before creating a channel: `allow_dms = 'nobody'` blocks all attempts; `allow_dms = 'friends'` rejects non-friends with a clear error message.
- **Messenger — Schema** — Added `messenger_settings` and `message_requests` tables with full indices.

### Fixed
- **Messenger — User Search** — User search in the New DM modal now correctly returns all non-banned users site-wide (not just friends). Minimum query length reduced to 1 character. Exact username/display-name matches are ranked first. Server error messages are surfaced in the UI instead of showing a generic "No users found."

- **Themes & UI** — Introduced extensive new personalization options for "Glassmorphism & Opacity" (Solid, Light Glass, Heavy Glass) and "Card Borders" (Hidden, Subtle, Neon Glow), allowing users to completely customize the aesthetic of panels, cards, and dropdowns.
- **Layouts & Navigation** — Initiated Phase 1 of the Enterprise Layouts overhaul. Added 2 brand new highly animated, enterprise-grade navigational layouts: "Cyber-Float" (a glassmorphic floating sidebar) and "Neon-Bar" (an animated, edge-to-edge top navigation bar).
- **Themes & UI** — Rebuilt all color schemes from scratch, replacing the old legacy names (bame, mykd, gamon, gio, etc.) with 11 brand new beautifully crafted, unique themes (Obsidian, Nebula, Synthwave, Toxic, Magma, Solarflare, Glacier, Bubblegum, Hologram, Stealth, Cyberpunk).
- **Themes & UI** — Built a new WebGL-powered Lava Lamp background using custom shaders.
- **Themes & UI** — Restored theme customization options (Settings icons) for dynamic backgrounds like Pink Bubbles and Lava Lamp in the Personalization modal.
- **Navigation** — Built a Minecraft creeper SVG and replaced the generic grid navigation icon for the Minecraft extension.
- **Themes & UI** â€” Integrated Three.js to support WebGL animated backgrounds. Added 7 new interactive 3D themes (Cyberpunk, Matrix, Stars, Geometry, Fluid, Aurora, Particles) to the Themes Store.
- **Themes & UI** — Decoupled Layout, Color Palette, and Backgrounds into independent options inside the new Appearance Settings modal. Users can now freely mix-and-match CSS colors with any 2D canvas or 3D WebGL background engine.
- **Themes & UI** — Added two new responsive layout options: "Compact" and "Wide".
- **Themes & UI** — Added a brand new **Top Navbar** layout option. Navigation items are displayed in a simple horizontal row (up to 5 visible at once). If total nav items exceed 5, a **"More"** trigger button appears, opening a polished slide-in side panel listing overflow items. Panel closes on backdrop click or any link navigation.
- **Navigation** — `OverflowNav` singleton added: manages the 5-item visibility window, populates the overflow drawer, and re-evaluates on layout switches and extension injection. Fully replaces the problematic `NavCarousel` scroll engine.

### Fixed
- **Navigation** — Fixed the user section (avatar + action buttons) in the Sidebar layout not sticking to the bottom of the nav. Changed `.nav-user` `margin-top` from a fixed spacing value to `auto`, which correctly pushes it to the bottom of the sidebar flex column.
- **Themes & UI** — All `this.theme` references in `ParticleEngine` that controlled background *behavior* (not color) have been corrected to use `this.bgStyle`, fully decoupling color from geometry.
- **Themes & UI** — `WebGLEngine.clearScene()` now null-guards `this.scene` to prevent crash if engine was never initialized before a theme switch.
- **Themes & UI** — `WebGLEngine.getCssColor()` now catches exceptions and strips `rgba()` alpha channels before passing to `THREE.Color` to prevent parse errors.
- **Themes & UI** — Division-by-zero guards added to particle mouse repulsion and camera ray projection calculations.
- **Themes & UI** — `App.init()` now restores all three saved appearance settings (layout, color, background) on every page load, preventing resets on refresh.
- **Navigation** â€” Fixed an issue where the profile picture dropdown menu was transparent by restoring the missing `.notifications-dropdown` CSS selector.
- **Donations Extension** â€” Fixed an issue in the public donations history list where users without an avatar or Minecraft username were loading a broken image link. Now gracefully falls back to a dynamically generated initial/letter avatar.

### Changed
- **Admin Dashboard** â€” Full redesign of the Extensions management dashboard, replacing the basic list with a modern glassmorphic grid layout, active count stats, and enhanced visual hierarchy.
- **Donations Extension** â€” Redesigned the "Overview" and "Ranks" tabs in the admin panel with modern glassmorphic cards and improved visual hierarchy.

### Improved
- **Admin Dashboard** â€” Added a "Back to Site" button in the sidebar footer for easier navigation back to the feed.

## [1.7.0] - 2026-03-26

### Changed
- **Admin Dashboard Rebuild**
  - Modernized the layout with a sleek vertical sidebar and SVG icon system.
  - Redesigned all management views (Users, Reports, Extensions, Settings, Forum, Discord).
  - Implemented responsive grid-based layouts for cards and tables.
  - Enhanced theme compatibility with dedicated CSS overrides for all 7 platform themes.
  - Restored corrupted styles in `main.css` and optimized asset encoding.

## [1.6.0] - 2026-03-25

### Changed
- **Forum Extension Redesign**
  - Redesigned public areas to match a Discord + PlayStation Edition aesthetic.
  - Updated category cards, thread lists, and post layouts for a modern gaming feel.
  - Replaced generic styles with deep dark grays, Discord Blurple, and PlayStation blue accents.
  - Refactored forum CSS to use global theme variables (`--bg-card`, `--neon-cyan`, etc.) to ensure full compatibility with all custom themes.

### Added
- **Donations Extension Enhancements**
  - Rank conversion system: Users can convert between ranks with prorated time credit (e.g., 15 days on $10 rank → ~10 days on $15 rank)
  - Donation history modal on user profiles (visible to own profile only) showing transaction history and rank conversions
  - Stripe-style HTML receipt emails on donation completion with rank badge, perks list, and themed styling
  - Rank conversion confirmation emails with before/after rank comparison
  - `rank_conversions` table to audit all rank changes with timestamps
  - `/my-history` endpoint returning user's donations and conversions
  - `/convert-rank` endpoint with prorated credit calculation
  - Fixed missing `heart` icon in nav icon map (donations nav was silently falling back to grid icon)
  - Enhanced `completeDonation` function to chain receipt emails automatically
  - Dynamic site name in Discord webhook footer

### Added (Previous)
- **Database**
  - Added support for SQLite and PostgreSQL databases.
  - Automatic migration from legacy JSON data store to relational database.
- **Donations Extension**
  - Integrated Stripe checkouts for server donations and ranks.
  - Implemented Discord webhooks to broadcast donation notifications.
- **Minecraft Integration**
  - Replaced static avatar fallbacks with 3D animated player skins using the `skin3d` NPM library.

## [1.0.0] - 2026-02-27

### Added
- **Core Platform**
  - User authentication with JWT (register, login, persistent sessions)
  - User profiles with display names, bios, avatars, levels, and XP tracking
  - Social feed with post creation, likes, comments, and infinite scroll
  - Friend system with send/accept/remove requests and squad management
  - Real-time chat with Socket.io (messaging, typing indicators, presence)
  - Admin dashboard with user management, role changes, bans, and report moderation
  - Toast notifications and loading states throughout the UI

- **Extension System**
  - PHPBB-style modular extension architecture (`server/extension-loader.js`)
  - Auto-discovery of extensions from `extensions/` directory via `manifest.json`
  - Dynamic frontend loading: CSS injection, script loading, route registration
  - Dynamic sidebar nav link injection for extensions
  - Admin Extensions tab for viewing and toggling installed extensions
  - Extension enable/disable persistence via `data/extensions.json`
  - Extension Development Guide (`index.html`)

- **Design & Frontend**
  - Dark/neon gaming aesthetic with Orbitron typography
  - Interactive canvas particle engine with mouse interaction and glow effects
  - Glassmorphism cards, gradient buttons, and neon accent colors
  - Smooth page transitions and staggered animations
  - Responsive layout with mobile support
  - Hash-based SPA router with auth guards

- **Infrastructure**
  - Pure JSON file-based data store (no native compilation dependencies)
  - Express.js backend with modular route structure
  - Socket.io real-time event system with JWT auth
  - Professional `.gitignore` (extensions, data, node_modules excluded)
  - Comprehensive `README.md` with setup instructions

### Security
- JWT-based authentication with token persistence
- Password hashing with bcryptjs
- XSS protection via HTML escaping in all user-generated content
- Auth guards on all protected routes (frontend + backend)
- Role-based access control (user, moderator, admin)

[1.0.0]: https://github.com/your-org/venary/releases/tag/v1.0.0
- Role-based access control (user, moderator, admin)

[1.0.0]: https://github.com/your-org/venary/releases/tag/v1.0.0
