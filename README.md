# Venary — Next Generation Gaming Social Platform

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.io-4.x-010101?style=for-the-badge&logo=socket.io&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

A modular, extensible gaming social platform built with Node.js. Features a PHPBB-style extension system allowing third-party modules for forums, wikis, tournaments, and more — all without touching core code.

---

## ✨ Features

**Core Platform**
- 🔐 User authentication with JWT (register, login, sessions)
- 👤 User profiles with levels, XP, and gaming stats
- 📰 Social feed with posts, likes, and comments
- 👥 Friend system with requests and squad management
- 💬 Real-time chat with typing indicators via Socket.io
- 🛡️ Admin dashboard with user management, bans, and reports
- 🎨 Dark/neon gaming aesthetic with particle animations

**Extension System**
- 🧩 PHPBB-style modular architecture
- 📦 Self-contained extensions with their own routes, pages, CSS, and data
- ⚡ Auto-discovery and hot-loading from `extensions/` directory
- 🎛️ Admin UI for enabling/disabling extensions
- 📋 Simple `manifest.json` configuration

---

## 🚀 Quick Start

```bash
git clone <your-repo-url> venary
cd venary
npm install
node server/index.js
# Open http://localhost:3000 to access the Setup Wizard!
```

The setup wizard will guide you through creating your admin account and setting up the database connection.

For detailed Ubuntu/Linux instructions, see the [Ubuntu Setup Guide](./UBUNTU_SETUP.md).

---

## 📁 Project Structure

```
venary/
├── server/                  # Backend
│   ├── index.js             # Express server entry point
│   ├── db/                  # SQLite and Postgres database adapters
│   ├── extension-loader.js  # PHPBB-style extension system
│   ├── socket.js            # Socket.io real-time events
│   ├── middleware/          # Auth middleware
│   └── routes/              # Core API routes
├── public/                  # Frontend (SPA)
│   ├── index.html           # App shell
│   ├── css/                 # Design system
│   └── js/                  # Client-side logic
│       ├── app.js           # Main app + extension loader
│       ├── router.js        # Hash-based SPA router
│       ├── api.js           # API client
│       ├── particles.js     # Canvas particle engine
│       ├── socket-client.js # Socket.io client
│       └── pages/           # Core page modules
├── extensions/              # Extension modules (gitignored)
│   └── forum/               # Example: Forum extension
├── data/                    # Runtime data (gitignored)
└── package.json
```

---

## 🧩 Extension Development

Extensions live in the `extensions/` directory (excluded from this repo). See the [Extension Development Guide](./index.html) for full documentation.

### Quick Example

```
extensions/my-extension/
├── manifest.json            # Required: metadata + declarations
├── server/
│   └── routes.js            # Express router (auto-mounted)
└── public/
    ├── pages/my-ext.js      # Frontend page logic
    └── css/my-ext.css       # Extension styles
```

### manifest.json

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "A custom Venary extension",
  "author": "Your Name",
  "enabled": true,
  "nav": [
    { "label": "My Page", "icon": "grid", "route": "/my-ext", "position": 5 }
  ],
  "routes": { "prefix": "/api/ext/my-extension", "file": "server/routes.js" },
  "pages": [
    { "route": "/my-ext", "file": "public/pages/my-ext.js", "global": "MyExtPage" }
  ],
  "css": [ "public/css/my-ext.css" ],
  "data": [ "my_ext_data" ]
}
```

---

## 🔧 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `JWT_SECRET` | auto-generated | JWT signing secret |

---

## 📄 License

MIT
