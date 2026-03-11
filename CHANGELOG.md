# Changelog

All notable changes to Venary will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
