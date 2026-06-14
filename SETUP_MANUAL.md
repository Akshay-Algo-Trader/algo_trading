# AlgoTrader — Manual Setup Guide (Ubuntu/Debian)

This guide walks you through installing AlgoTrader on a fresh Ubuntu/Debian system without Docker. It covers system packages, Python/Node dependencies, database setup, and running all services.

---

## Prerequisites

- **Ubuntu/Debian Linux** (tested on Ubuntu 22.04 LTS, 24.04)
- **Internet connection** for package downloads
- **Sudo access** for system package installation
- **~2GB free disk space** (for dependencies, database, and code)

---

## 0. Clone the Repository

```bash
git clone https://github.com/shelkeakshay96/algo_trading.git AlgoTreding
cd AlgoTreding
```

---

## 1. Install System Packages

Update package manager and install all required dependencies:

```bash
sudo apt update
sudo apt install -y \
  python3 python3-venv python3-dev python3-pip \
  build-essential pkg-config \
  libmysqlclient-dev default-libmysqlclient-dev \
  libssl-dev libffi-dev \
  mysql-server mysql-client \
  nodejs npm git
```

### What each package is for:

| Package | Purpose |
|---------|---------|
| `python3 python3-venv python3-dev python3-pip` | Python 3 runtime, virtual environment support, development headers, and pip package manager |
| `build-essential pkg-config` | C compiler and build tools needed to compile Python packages like `mysqlclient` and `cryptography` |
| `libmysqlclient-dev default-libmysqlclient-dev` | MySQL client library headers required by `mysqlclient` Python package |
| `libssl-dev libffi-dev` | OpenSSL and FFI development headers required by `cryptography` Python package |
| `mysql-server mysql-client` | MySQL 8.0 database server and command-line client |
| `nodejs npm` | Node.js runtime (18+) and npm package manager for frontend |
| `git` | Version control system |

### If apt provides an older Node.js (< 18):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Verify installed versions:

```bash
python3 --version      # Should be 3.9 or higher (e.g., 3.12.3)
node --version         # Should be 18 or higher (e.g., v20.x)
npm --version          # Should be 9.x or higher
mysql --version        # Should be 8.0
```

---

## 2. MySQL Database Setup

### Start MySQL service:

```bash
sudo systemctl start mysql
```

### Create database and user:

```bash
sudo mysql -u root
```

Paste the following SQL commands at the `mysql>` prompt:

```sql
CREATE DATABASE algotrader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'algotrader'@'localhost' IDENTIFIED BY 'algotrader';
GRANT ALL PRIVILEGES ON algotrader.* TO 'algotrader'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Verify the setup:

```bash
mysql -u algotrader -palgotrader -e "USE algotrader; SHOW TABLES;"
```

Should print (initially empty):
```
Tables_in_algotrader
```

> **Security Note:** The default password `algotrader` is fine for local development. For production, use a strong password and update the `DATABASE_URL` environment variable in `backend/.env`.

---

## 3. Backend Setup

### Navigate to backend directory and create virtual environment:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
```

### Upgrade pip and install Python dependencies:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This installs all Flask packages, MySQL driver, scheduling, and trading API integrations. Installation may take 1-2 minutes.

### Backend Dependencies (for reference):

```
Flask==2.3.3                          # Web framework
Flask-SQLAlchemy==3.0.5               # ORM and database integration
Flask-Migrate==4.0.4                  # Database schema migrations
Flask-JWT-Extended==4.5.2             # JWT authentication
Flask-CORS==4.0.0                     # Cross-origin request handling
python-dotenv==1.0.0                  # Environment variable loading
mysqlclient==2.2.0                    # MySQL database driver
cryptography==41.0.3                  # Encryption for sensitive data
gunicorn==21.2.0                      # Production WSGI server
APScheduler==3.10.4                   # Background job scheduling
kiteconnect==4.2.0                    # Zerodha Kite trading API
requests==2.31.0                      # HTTP library
```

### Configure environment variables:

```bash
cp .env.example .env
```

Edit `backend/.env` with a text editor (nano, vi, VS Code, etc.):

```bash
nano .env
```

Update or add these values (defaults shown work for local development):

```env
# Flask Configuration
FLASK_APP=run.py
FLASK_ENV=development
FLASK_DEBUG=True
FLASK_PORT=5000
ADMIN_PORT=8000
SECRET_KEY=your-secret-key-here-change-in-production

# Database Configuration
DATABASE_URL=mysql+mysqldb://algotrader:algotrader@localhost:3306/algotrader

# JWT Configuration
JWT_SECRET_KEY=your-jwt-secret-key-here-change-in-production

# CORS Configuration
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Kite API (Zerodha) Configuration
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-api-secret
KITE_USER_ID=your-user-id

# Encryption Configuration
ENCRYPTION_KEY=your-32-character-encryption-key-1234
```

### Key environment variables explained:

| Variable | Purpose | Notes |
|----------|---------|-------|
| `FLASK_ENV` | Development vs production | Use `development` for local setup |
| `FLASK_DEBUG` | Enable debug mode with auto-reload | Set to `False` in production |
| `DATABASE_URL` | MySQL connection string | Must match created user/database |
| `SECRET_KEY` / `JWT_SECRET_KEY` | Cryptographic keys for sessions/tokens | Change to random values in production |
| `KITE_API_KEY` / `KITE_API_SECRET` / `KITE_USER_ID` | Zerodha Kite trading API credentials | Only needed for live trading; placeholder values work for backtest/paper trading |
| `ENCRYPTION_KEY` | Key to encrypt stored Kite credentials | Must be exactly 32 characters; generate with `openssl rand -hex 16` |

### Initialize the database:

```bash
flask db upgrade
```

This applies all database migrations from `backend/migrations/versions/`. Should complete in < 10 seconds.

### (Optional) Seed initial admin user and paper trading account:

```bash
python seed.py
```

Creates:
- Admin user: `admin@algotrader.com` / `Admin@123`
- Virtual paper trading account with ₹100,000 balance

> **Important:** Change the admin password after first login.

---

## 4. Frontend Setup

Open a **new terminal** (keep the backend terminal running with the venv activated):

```bash
cd frontend
npm install
```

This downloads all JavaScript dependencies (React, Vite, Tailwind CSS, etc.) and may take 1-2 minutes.

### Configure frontend environment:

```bash
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=
```

- **Leave empty** if the frontend will be served by Flask from `backend/static` (production-style).
- **Set to `http://localhost:5000/api`** if running a standalone Vite dev server on port 5173.

### Frontend Dependencies (installed by npm, for reference):

| Package | Purpose |
|---------|---------|
| `react@18.2.0`, `react-dom@18.2.0` | React library and DOM rendering |
| `react-router-dom@6.16.0` | Client-side routing |
| `zustand@4.4.1` | Lightweight state management |
| `axios@1.5.0` | HTTP client for API calls |
| `tailwindcss@3.3.4` | Utility-first CSS framework |
| `@headlessui/react@1.7.16` | Unstyled, accessible UI components |
| `recharts@2.10.2`, `lightweight-charts@5.2.0` | Charting libraries for trading data |
| `vite@5.0.0`, `@vitejs/plugin-react@4.2.0` | Development server and bundler |

### Build the frontend:

```bash
npm run build
```

Builds the React app directly into `../backend/static/` (not `frontend/dist`). This outputs:
- `backend/static/index.html`
- `backend/static/assets/` (minified JS/CSS bundles)

The backend Flask apps will serve this as a single-page application (SPA).

### (Optional) Run in development mode with hot reload:

If you want to edit frontend files and see changes live without rebuilding:

```bash
npm run dev
```

Starts Vite dev server on `http://localhost:5173` with:
- **Hot module reload** (HMR) for instant updates
- **API proxy**: `/api/*` requests forward to `http://localhost:5000`
- **Admin proxy**: `/admin/login` requests forward to `http://localhost:8000`

You'll see output like:
```
  VITE v5.0.0  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Press q to quit
```

---

## 5. Run the Backend Services

You'll need **at least two terminals** to run both services. Keep them running while developing.

### Terminal A — Customer API Server (port 5000)

```bash
cd backend
source venv/bin/activate
python run.py
```

Expected output:
```
WARNING: This is a development server. Do not use it in production.
 * Running on http://0.0.0.0:5000
 * Debug mode: on
```

This runs:
- Customer API endpoints (`/api/...`)
- Serves the built frontend (if `backend/static/` exists from `npm run build`)
- Background job scheduler (APScheduler) for market-close and token-refresh jobs

### Terminal B — Admin API Server (port 8000)

```bash
cd backend
source venv/bin/activate
python run_admin.py
```

Expected output:
```
🔐 Admin Server running on http://0.0.0.0:8000
   Login: http://localhost:8000/admin/login
   Dashboard: http://localhost:8000/admin
```

This runs:
- Admin API endpoints (`/admin/...`)
- Admin login and dashboard

### (Optional) Terminal C — Frontend Dev Server (port 5173)

Only run this if you're actively developing the frontend and want hot reload:

```bash
cd frontend
npm run dev
```

---

## 6. Verify Installation

### Check backend health:

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{"status": "ok", "message": "AlgoTrader Backend is running"}
```

### Check database connection:

```bash
mysql -u algotrader -palgotrader -D algotrader -e "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema='algotrader';"
```

Should show the number of tables created by migrations (e.g., 15+).

### Open the application in a browser:

- **Customer Portal (built frontend):** http://localhost:5000
- **Customer Portal (dev with hot reload):** http://localhost:5173 (if running Vite dev server)
- **Admin Login:** http://localhost:8000/admin/login
- **Admin Dashboard:** http://localhost:8000/admin

---

## 7. Common Issues and Solutions

### ModuleNotFoundError: No module named 'flask'

**Cause:** Python virtual environment not activated.

**Solution:**
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### MySQL connection error: (2003, "Can't connect to MySQL server on 'localhost'")

**Cause:** MySQL not running or incorrect credentials.

**Solution:**
```bash
# Check if MySQL is running
sudo systemctl status mysql

# If not running, start it
sudo systemctl start mysql

# Verify credentials
mysql -u algotrader -palgotrader

# Check DATABASE_URL in backend/.env
grep DATABASE_URL backend/.env
```

### mysqlclient build failure: "fatal error: mysql.h: No such file or directory"

**Cause:** Missing MySQL development headers.

**Solution:**
```bash
sudo apt install -y libmysqlclient-dev pkg-config build-essential
# Then retry:
pip install -r requirements.txt
```

### cryptography build failure: "error: could not compile the C extension module"

**Cause:** Missing OpenSSL/FFI development headers.

**Solution:**
```bash
sudo apt install -y libssl-dev libffi-dev
# Then retry:
pip install -r requirements.txt
```

### OSError: [Errno 98] Address already in use

**Cause:** Port 5000, 8000, 5173, or 3306 is already in use.

**Solution:**
```bash
# Find the process using the port
lsof -i :5000    # Port 5000
lsof -i :8000    # Port 8000
lsof -i :5173    # Port 5173
lsof -i :3306    # Port 3306

# Kill the process
kill -9 <PID>

# Or change the port in backend/.env (FLASK_PORT, ADMIN_PORT) and vite.config.js
```

### Frontend not loading at http://localhost:5000

**Cause:** Frontend not built into `backend/static/`.

**Solution:**
```bash
cd frontend
npm run build
# Then refresh browser at http://localhost:5000
```

### npm install fails with network errors

**Cause:** npm registry connectivity or corrupted cache.

**Solution:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Flask db upgrade fails with "No such column" errors

**Cause:** Migration files out of sync with database state.

**Solution (careful: this deletes all data):**
```bash
cd backend
flask db stamp head
flask db migrate -m "Reset migrations"
flask db upgrade
python seed.py  # Recreate admin user and virtual account
```

---

## 8. Development Workflow

### Making backend changes:

1. Edit files in `backend/app/routes/`, `backend/app/models/`, or `backend/app/services/`
2. If you modified models or the database schema, create a migration:
   ```bash
   cd backend
   source venv/bin/activate
   flask db migrate -m "Description of changes"
   flask db upgrade
   ```
3. Flask auto-reloads when files change (if `FLASK_DEBUG=True`)
4. Test with `curl` or API client (Postman, Insomnia)

### Making frontend changes:

1. **With hot reload (recommended for development):**
   - Run `npm run dev` in `frontend/` terminal
   - Edit files in `frontend/src/`
   - Changes appear instantly at `http://localhost:5173`

2. **Without hot reload (production-style):**
   - Edit files in `frontend/src/`
   - Run `npm run build`
   - Restart backend (`python run.py`)
   - Refresh `http://localhost:5000`

### Adding a new Flask route:

```bash
# 1. Create route file: backend/app/routes/customer/new_feature.py
# 2. Register blueprint in backend/app/__init__.py
# 3. Test: curl http://localhost:5000/api/new-endpoint
```

### Adding a new React component:

```bash
# 1. Create component: frontend/src/components/NewComponent.jsx
# 2. Import and use in frontend/src/pages/ or frontend/src/App.jsx
# 3. See changes live at http://localhost:5173 (if using npm run dev)
```

---

## 9. Database Commands

### Useful Flask-Migrate / MySQL commands:

```bash
cd backend
source venv/bin/activate

# View current database schema
flask db current

# Create a new migration file (after changing models)
flask db migrate -m "Description of changes"

# Apply pending migrations
flask db upgrade

# Undo the last migration
flask db downgrade

# View migration history
flask db history

# Enter Flask shell for interactive testing
flask shell

# View database tables
mysql -u algotrader -palgotrader -D algotrader
> SHOW TABLES;
> DESCRIBE strategy;
> SELECT COUNT(*) FROM user;
```

---

## 10. Security Notes

### Local Development:

- Default passwords (`algotrader`/`algotrader`) and secret keys are fine for local dev.
- `FLASK_DEBUG=True` auto-reloads on file changes — disable in production.
- Placeholder Kite API credentials won't affect backtest/paper trading.

### Before Production:

1. Change `SECRET_KEY` and `JWT_SECRET_KEY` to random values:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```

2. Generate a 32-character `ENCRYPTION_KEY`:
   ```bash
   openssl rand -hex 16
   ```

3. Use a strong MySQL password and restrict database access.

4. Set `FLASK_ENV=production` and `FLASK_DEBUG=False`.

5. Use a production WSGI server (Gunicorn) instead of Flask's development server.

6. See `deployment/README-deploy.md` for full production deployment steps (nginx, systemd, Let's Encrypt).

### Important: Root `.env` File

The repo root contains a file `/var/www/AlgoTreding/.env` (distinct from `backend/.env` and `frontend/.env`):
- This file may contain sensitive credentials (GitHub tokens, etc.)
- It's covered by `.gitignore`, so it won't be committed
- **Do not copy this file to a new system** — if exposed, rotate any tokens immediately
- This file is **not** part of the application setup — the app only needs `backend/.env` and `frontend/.env`

---

## 11. Next Steps

- **For trading:** Add your Zerodha Kite API credentials to `backend/.env`
- **For development:** Use the frontend dev server (`npm run dev`) for faster iteration
- **For testing:** Run `cd backend && pytest` (if test files exist)
- **For deployment:** Follow `deployment/README-deploy.md` for production setup

---

## 12. Getting Help

- Check the [Troubleshooting](#7-common-issues-and-solutions) section above
- Review `README.md` for project architecture and tech stack
- Check `LOCAL_SETUP.md` for additional details
- Review `CLAUDE.md` for codebase structure and conventions

---

**Happy trading! 🚀**
