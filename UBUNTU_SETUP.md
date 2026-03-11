# 🐧 Venary Ubuntu / Linux Setup Guide

This guide helps you set up **Venary** on an Ubuntu/Debian server and resolves the common **"invalid ELF header"** error caused by platform-incompatible binary files.

## 🛠️ Prerequisites

Before installing Venary, ensure your system has the necessary build tools and Node.js installed.

### 1. Update System & Install Build Tools
Native modules like `better-sqlite3` require a C++ compiler to build correctly on Linux.
```bash
sudo apt update
sudo apt install -y build-essential python3
```

### 2. Install Node.js (Version 20+)
We recommend using NodeSource or NVM.
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 🚀 Installation

### 1. Clone the Repository
```bash
git clone <your-repo-url> /var/www/Venary
cd /var/www/Venary
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Fix "invalid ELF header"
If you see the error:
`Database connection failed: .../better_sqlite3.node: invalid ELF header`

It means the `node_modules` were likely copied from a Windows machine. You must rebuild the native dependencies for Linux:
```bash
npm run rebuild
```
*This command runs `npm rebuild --build-from-source`, which recompiles `better-sqlite3` specifically for your Ubuntu environment.*

---

## 🏃 Running Venary

### Start the Server
```bash
npm start
```

### Running in Background (Recommended)
Use **PM2** to keep the server running after you close your terminal:
```bash
sudo npm install -g pm2
pm2 start server/index.js --name "venary"
pm2 save
pm2 startup
```

---

## 🔧 Nginx Reverse Proxy (Optional)
To point your domain (e.g., `gaming.yourdomain.com`) to Venary, use an Nginx config:

```nginx
server {
    listen 80;
    server_name gaming.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔒 Permissions
Ensure the `data/` directory is writable by the user running the process:
```bash
sudo chown -R $USER:$USER /var/www/Venary/data
chmod -R 755 /var/www/Venary/data
```

## 🆘 Troubleshooting
- **Database Locked**: Ensure only one instance of Venary is running.
- **Port 3000 Busy**: Change the port in `data/config.json` after the initial setup.
