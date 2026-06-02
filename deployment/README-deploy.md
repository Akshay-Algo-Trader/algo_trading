# AlgoTrader — Production Deployment Guide
**Target:** Oracle Cloud Ubuntu 22.04 ARM (Ampere A1) instance

---

## Prerequisites

- Oracle VM with public IP (static reserved in Oracle Console)
- Domain name pointed at that IP (A record)
- Port 80 and 443 open in Oracle Security List **and** OS firewall (`sudo ufw allow 80,443/tcp`)
- Kite developer account at https://developers.kite.trade

---

## Step 1 — SSH into Oracle VM

```bash
ssh -i ~/.ssh/oracle_key ubuntu@YOUR_VM_IP
```

---

## Step 2 — Clone the repository

```bash
sudo mkdir -p /var/www/algotrader
sudo chown ubuntu:ubuntu /var/www/algotrader
git clone https://github.com/YOUR_ORG/algotreder.git /var/www/algotrader
```

---

## Step 3 — Copy environment file

```bash
cp /var/www/algotrader/backend/.env.example /var/www/algotrader/backend/.env
nano /var/www/algotrader/backend/.env
```

Update these values:

| Variable | Description |
|---|---|
| `SECRET_KEY` | Long random string (use `python3 -c "import secrets; print(secrets.token_hex(32))"`) |
| `JWT_SECRET_KEY` | Another long random string |
| `DATABASE_URL` | `mysql+mysqldb://algotrader:YOUR_DB_PASS@localhost/algotrader` |
| `ENCRYPTION_KEY` | 32-character string for API key encryption |
| `KITE_API_KEY` | From Kite developer console |
| `KITE_API_SECRET` | From Kite developer console |
| `CORS_ORIGINS` | `https://YOUR_DOMAIN` |

---

## Step 4 — Run setup script

```bash
cd /var/www/algotrader
sudo bash deployment/setup.sh
```

This will:
- Install Python 3, Node.js 20, MySQL, nginx, certbot
- Create Python virtualenv and install dependencies
- Run Flask DB migrations (`flask db upgrade`)
- Run seed script (`python seed.py`)
- Build React frontend to `backend/static/`
- Install and start systemd services
- Configure nginx

---

## Step 5 — Issue SSL certificate (Let's Encrypt)

```bash
sudo certbot --nginx -d YOUR_DOMAIN
```

Follow the prompts. Certbot will automatically modify your nginx config with cert paths.

Auto-renewal is set up by certbot. Verify:

```bash
sudo certbot renew --dry-run
```

---

## Step 6 — Register static IP in Kite developer console

1. Go to https://developers.kite.trade → your app → Settings
2. Set **Redirect URL** to `https://YOUR_DOMAIN/api/customer/kite/callback`
3. Set **Postback URL** (optional) to `https://YOUR_DOMAIN/api/customer/kite/postback`
4. Save. The static Oracle IP must match the registered IP.

---

## Step 7 — Verify everything works

```bash
# Service status
sudo systemctl status algotrader-backend algotrader-admin nginx

# Logs
sudo journalctl -u algotrader-backend -f
sudo tail -f /var/log/algotrader/error.log

# Test API
curl https://YOUR_DOMAIN/api/auth/me
# Should return 401 (no token) — means Flask is reachable

# Test frontend
curl -I https://YOUR_DOMAIN/
# Should return 200 with text/html
```

---

## Ongoing operations

### Redeploy after code changes

```bash
cd /var/www/algotrader
git pull
source venv/bin/activate
pip install -r backend/requirements.txt
flask db upgrade          # if there are new migrations
deactivate

cd frontend && npm ci && npm run build

sudo systemctl restart algotrader-backend algotrader-admin
```

### View logs

```bash
# Gunicorn logs
tail -f /var/log/algotrader/access.log
tail -f /var/log/algotrader/error.log

# Systemd journal
journalctl -u algotrader-backend --since "1 hour ago"
```

### Reset virtual account (paper trading)

From the Admin panel at `https://YOUR_DOMAIN/admin/dashboard` → Customers → Reset Virtual Account.

---

## Architecture overview

```
Internet
   │
   ▼
nginx :443 (SSL termination)
   ├── /api/*       → Gunicorn :5000  (Flask main app — customer API)
   ├── /admin/login → Gunicorn :8000  (Flask admin app)
   └── /*           → /var/www/algotrader/backend/static  (React SPA)
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `systemctl status algotrader-backend` — is Gunicorn running? |
| React app shows blank page | `cat /var/log/algotrader/error.log` for JS build errors |
| Login fails | Check `JWT_SECRET_KEY` is identical in `.env` |
| Kite OAuth fails | Confirm redirect URL in Kite console matches your domain exactly |
| DB connection error | `mysql -u algotrader -p algotrader` to test credentials |
