# Changelog

All notable changes to Venary will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Donations Extension** â€” Added a "Ranked Users" tab in the admin panel to view users with active ranks.

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
