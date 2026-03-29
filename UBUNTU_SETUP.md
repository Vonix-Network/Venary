# 🐧 Venary Ubuntu / Linux Setup Guide

A complete guide for deploying **Venary** on a fresh Ubuntu 22.04 LTS VPS with Nginx, SSL via Let's Encrypt, and PM2 for process management.

---

## � Prerequisites

- A fresh Ubuntu 22.04 LTS VPS
- A domain name pointed to your VPS IP (A record)
- Root or sudo access

---

## 1. Initial Server Hardening

```bash
# Update system
sudo apt update && sudo apt upgrade -y

z# Create a non-root deploy user (recommended)
sudo adduser deploy
sudo usermod -aG sudo deploy

# Switch to deploy user for the rest of the setup
su - deploy
```

---

## 2. Install Build Tools & Node.js 20

Native modules like `better-sqlite3` require a C++ compiler.

```bash
# Install build essentials
sudo apt install -y build-essential python3 git curl ufw

# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # should be v20.x.x
npm -v
```

---

## 3. Configure Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

---

## 4. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 5. Install Certbot (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## 5b. Alternative: Run in Screen (instead of PM2)

If you prefer to see live console output with `screen -r`, use this instead of PM2.

### Install Screen

```bash
sudo apt install -y screen
```

### Create a systemd service that runs in Screen

```bash
sudo nano /etc/systemd/system/venary.service
```

```ini
[Unit]
Description=Venary Node.js Application
After=network.target

[Service]
Type=forking
User=deploy
WorkingDirectory=/var/www/venary
ExecStart=/usr/bin/screen -dmS venary node server/index.js
ExecStop=/usr/bin/screen -S venary -X quit
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable venary
sudo systemctl start venary

# Check status
sudo systemctl status venary
```

### Using Screen

```bash
# Attach to see live output
screen -r venary

# Detach: press Ctrl+A, then D

# List running screens
screen -ls
```

---

## 7. Clone & Install Venary

```bash
# Clone the repo
sudo mkdir -p /var/www/venary
sudo chown deploy:deploy /var/www/venary
git clone <your-repo-url> /var/www/venary
cd /var/www/venary

# Install dependencies
npm install

# If you see "invalid ELF header" (modules copied from Windows), rebuild:
npm run rebuild
```

---

## 8. Configure Venary

Run the app once to trigger setup, or manually create your config:

```bash
npm start
# Follow the setup wizard at http://<your-ip>:3000/setup
# Then stop it with Ctrl+C
```

---

## 9. Set Up PM2 (Process Manager)

PM2 keeps Venary running after you close your terminal and restarts it on crash.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start Venary
pm2 start server/index.js --name "venary"

# Save the process list
pm2 save

# Generate and enable the startup script
pm2 startup systemd -u deploy --hp /home/deploy
# PM2 will print a command — copy and run it, e.g.:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u deploy --hp /home/deploy

# Verify it's running
pm2 status
pm2 logs venary
```

---

## 10. Configure Nginx Reverse Proxy

Replace `gaming.yourdomain.com` with your actual domain.

```bash
sudo nano /etc/nginx/sites-available/venary
```

Paste the following:

```nginx
server {
    listen 80;
    server_name gaming.yourdomain.com;

    # Increase upload limit if using the images extension
    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/venary /etc/nginx/sites-enabled/

# Remove default site (optional but clean)
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## 11. Enable HTTPS with Let's Encrypt

Make sure your domain's DNS A record is pointing to your VPS IP before running this.

```bash
sudo certbot --nginx -d gaming.yourdomain.com

# Follow the prompts:
# - Enter your email
# - Agree to ToS
# - Choose option 2 to redirect HTTP → HTTPS (recommended)
```

Certbot will automatically modify your Nginx config to handle SSL and set up auto-renewal.

### Verify Auto-Renewal

```bash
sudo certbot renew --dry-run
```

Certbot installs a systemd timer that renews certificates automatically before they expire. No cron job needed.

---

## 12. Fix Permissions

```bash
sudo chown -R deploy:deploy /var/www/venary
chmod -R 755 /var/www/venary/data
```

---

## 13. Verify Everything

```bash
# Check PM2
pm2 status

# Check Nginx
sudo systemctl status nginx

# Check your site
curl -I https://gaming.yourdomain.com
```

---

## 14. Updating Venary

```bash
cd /var/www/venary
git pull
npm install
pm2 restart venary
```

---

## 15. Troubleshooting

| Issue | Fix |
|---|---|
| `invalid ELF header` | Run `npm run rebuild` to recompile native modules for Linux |
| Database locked | Ensure only one PM2 instance is running: `pm2 list` |
| Port 3000 busy | Change port in `data/config.json`, then `pm2 restart venary` |
| 502 Bad Gateway | Venary isn't running — check `pm2 logs venary` or `screen -r venary` |
| SSL cert not renewing | Check `sudo systemctl status certbot.timer` |
| Nginx config error | Run `sudo nginx -t` to diagnose |

---

## 16. Key Paths

| Path | Purpose |
|---|---|
| `/var/www/venary` | Application root |
| `/var/www/venary/data/` | Config, database, uploads |
| `/etc/nginx/sites-available/venary` | Nginx site config |
| `/etc/letsencrypt/live/` | SSL certificates |
