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
| `JWT_SECRET` | auto-generated | JWT signing secret — also used to derive the wallet encryption key |

---

## 💰 Crypto Donations (Donations Extension)

The donations extension supports Solana (SOL) and Litecoin (LTC) payments alongside Stripe, with a USD balance system and per-user permanent addresses.

### Requirements

- Node.js **≥ 18** (native `fetch` and `AbortSignal.timeout` required)
- `@solana/web3.js`, `bip39`, `ed25519-hd-key`, `bitcoinjs-lib`, `tiny-secp256k1`, `bs58`, `qrcode` — all installed via `npm install`

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Enable chains in the admin panel**
   Navigate to `Donations Admin → Crypto Settings` and toggle Solana and/or Litecoin on.

3. **Configure wallet seed (superadmin only)**
   In `Crypto Settings → HD Wallet Setup`, either paste an existing 12/24-word BIP39 mnemonic or click **Generate New Seed**. The seed is encrypted with AES-256 using your `JWT_SECRET` and stored in `data/config.json`. **Never share or commit your seed phrase.**

4. **Set RPC endpoints** (optional — defaults to public endpoints)
   - Solana: defaults to `https://api.mainnet-beta.solana.com`
   - Litecoin: defaults to BlockCypher public API

5. **Configure webhook secrets** (optional — for faster confirmation via Helius/BlockCypher webhooks)
   Set `solana_webhook_secret` and `litecoin_webhook_secret` in Crypto Settings.

### config.json keys (`donations.crypto.*`)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `solana_enabled` | boolean | `false` | Enable Solana payments |
| `litecoin_enabled` | boolean | `false` | Enable Litecoin payments |
| `solana_seed_encrypted` | string | — | AES-256 encrypted BIP39 seed for Solana |
| `litecoin_seed_encrypted` | string | — | AES-256 encrypted BIP39 seed for Litecoin |
| `solana_rpc_primary` | string | mainnet-beta | Primary Solana RPC endpoint |
| `solana_rpc_secondary` | string | — | Fallback Solana RPC endpoint |
| `litecoin_rpc_primary` | string | BlockCypher | Primary Litecoin RPC endpoint |
| `litecoin_rpc_secondary` | string | — | Fallback Litecoin RPC endpoint |
| `solana_webhook_secret` | string | — | HMAC secret for Helius webhooks |
| `litecoin_webhook_secret` | string | — | HMAC secret for BlockCypher webhooks |
| `balance_display_currencies` | array | `["usd","sol","ltc","eur","gbp"]` | Currencies users can display balance in |
| `intent_address_counter_sol` | number | `10000` | Auto-incrementing index for SOL intent addresses |
| `intent_address_counter_ltc` | number | `10000` | Auto-incrementing index for LTC intent addresses |

### How it works

- **Payment intents**: User selects a rank → chooses SOL or LTC → receives a unique derived address + QR code with a locked price (valid 240 hours). The blockchain monitor polls every 5s (SOL) / 10s (LTC) for confirmation.
- **Anytime addresses**: Each user has a permanent unique SOL + LTC address derived from the HD wallet. Any incoming transaction is automatically detected every 3 minutes and credited to their USD balance.
- **Balance system**: Custom donations (Stripe or crypto) credit the user's USD balance. Balance can be spent on ranks directly without a new payment.
- **HD wallet**: A single BIP39 seed derives all addresses deterministically. Solana uses path `m/44'/501'/0'/0'/{index}'`, Litecoin uses `m/44'/2'/0'/0/{index}`. User anytime addresses start at index 1; payment intent addresses start at index 10000.

---

## 📄 License

MIT
