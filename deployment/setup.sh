#!/usr/bin/env bash
# AlgoTrader — Oracle Ubuntu 22.04 ARM deployment setup script
# Usage: sudo bash setup.sh
# Assumes repo is already cloned to /var/www/algotrader and .env is copied.

set -euo pipefail

REPO_DIR=/var/www/algotrader
FRONTEND_DIR=$REPO_DIR/frontend
BACKEND_DIR=$REPO_DIR/backend
VENV_DIR=$REPO_DIR/venv
LOG_DIR=/var/log/algotrader

echo "==> [1/9] System packages"
apt-get update -qq
apt-get install -y -qq \
    python3-pip python3-venv python3-dev \
    build-essential libssl-dev libffi-dev \
    mysql-server libmysqlclient-dev pkg-config \
    nginx certbot python3-certbot-nginx \
    curl git

# Node.js 20 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
    echo "==> Installing Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "==> [2/9] Python virtualenv + dependencies"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip wheel
"$VENV_DIR/bin/pip" install -r "$BACKEND_DIR/requirements.txt"
"$VENV_DIR/bin/pip" install gunicorn

echo "==> [3/9] Log directory"
mkdir -p "$LOG_DIR"
chown ubuntu:ubuntu "$LOG_DIR"

echo "==> [4/9] MySQL — create DB and user"
# Idempotent: only creates if not exists
mysql -u root <<'SQL'
CREATE DATABASE IF NOT EXISTS algotrader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'algotrader'@'localhost' IDENTIFIED BY 'changeme_in_env';
GRANT ALL PRIVILEGES ON algotrader.* TO 'algotrader'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "    NOTE: update DATABASE_URL in $BACKEND_DIR/.env with real credentials."

echo "==> [5/9] Flask DB migrations + seed"
cd "$BACKEND_DIR"
"$VENV_DIR/bin/flask" db upgrade
"$VENV_DIR/bin/python" seed.py || echo "    seed.py skipped (may already be seeded)"

echo "==> [6/9] Frontend build"
cd "$FRONTEND_DIR"
npm ci --prefer-offline
npm run build
echo "    Built to $BACKEND_DIR/static"

echo "==> [7/9] systemd services"
cp "$REPO_DIR/deployment/algotrader-backend.service" /etc/systemd/system/
cp "$REPO_DIR/deployment/algotrader-admin.service"   /etc/systemd/system/
systemctl daemon-reload
systemctl enable  algotrader-backend algotrader-admin
systemctl restart algotrader-backend algotrader-admin
echo "    Services status:"
systemctl is-active algotrader-backend && echo "    algotrader-backend: active" || echo "    algotrader-backend: FAILED"
systemctl is-active algotrader-admin   && echo "    algotrader-admin:   active" || echo "    algotrader-admin:   FAILED"

echo "==> [8/9] nginx"
cp "$REPO_DIR/deployment/nginx.conf" /etc/nginx/sites-available/algotrader
ln -sf /etc/nginx/sites-available/algotrader /etc/nginx/sites-enabled/algotrader
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> [9/9] Done!"
echo ""
echo "  Next steps:"
echo "  1. Run certbot:  certbot --nginx -d YOUR_DOMAIN"
echo "  2. Edit /etc/nginx/sites-available/algotrader and replace YOUR_DOMAIN"
echo "  3. Register static IP in Kite developer console (https://developers.kite.trade)"
echo "  4. Confirm services: systemctl status algotrader-backend algotrader-admin nginx"
