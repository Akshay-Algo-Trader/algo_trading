# Local Setup Guide (No Docker)

## Prerequisites Check

Before starting, ensure you have these installed:
- Python 3.9 or higher
- Node.js 18+ and npm
- MySQL 8.0

### Verify Installations

```bash
python --version
node --version
npm --version
mysql --version
```

## Database Setup

### 1. Start MySQL Service

**Linux (Debian/Ubuntu):**
```bash
sudo service mysql start
# or
sudo systemctl start mysql
```

**macOS (with Homebrew):**
```bash
brew services start mysql
```

**Windows:**
- Start MySQL from Services or MySQL Command Line Client

### 2. Create Database and User

```bash
mysql -u root -p
```

Then execute:
```sql
CREATE DATABASE algotrader CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'algotrader'@'localhost' IDENTIFIED BY 'algotrader';
GRANT ALL PRIVILEGES ON algotrader.* TO 'algotrader'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Verify:
```bash
mysql -u algotrader -palgotrader -e "USE algotrader; SHOW TABLES;"
```

## Backend Setup

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Create Virtual Environment

**Linux/macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Setup Environment Variables

```bash
cp .env.example .env
```

**Edit `backend/.env`:**
```
FLASK_APP=run.py
FLASK_ENV=development
FLASK_DEBUG=True
FLASK_PORT=5000
SECRET_KEY=dev-secret-key-change-in-production
DATABASE_URL=mysql+mysqldb://algotrader:algotrader@localhost:3306/algotrader
JWT_SECRET_KEY=jwt-secret-key-change-in-production
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-api-secret
KITE_USER_ID=your-user-id
ENCRYPTION_KEY=your-32-character-encryption-key-1234
```

### 5. Initialize Database

```bash
flask db upgrade
```

If migrations folder doesn't exist:
```bash
flask db init
flask db migrate -m "Initial migration"
flask db upgrade
```

### 6. Run Backend Server

```bash
python run.py
```

You should see:
```
WARNING: This is a development server. Do not use it in production.
 * Running on http://0.0.0.0:5000
```

Keep this terminal running.

## Frontend Setup

### 1. Open New Terminal, Navigate to Frontend

```bash
cd frontend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment Variables

```bash
cp .env.example .env
```

**Edit `frontend/.env`:**
```
VITE_API_URL=
```
(Leave empty - frontend is served from the same Flask server)

### 4. Build Frontend

```bash
npm run build
```

This builds the React app into the `backend/static` directory so both Flask servers can serve it.

### 5. Run Backend Server (Port 5000 - Homepage)

Open a new terminal:
```bash
cd backend
source venv/bin/activate
python run.py
```

You should see:
```
WARNING: This is a development server. Do not use it in production.
 * Running on http://0.0.0.0:5000
```

### 6. Run Admin Server (Port 8000 - Admin Panel)

Open another new terminal:
```bash
cd backend
source venv/bin/activate
python run_admin.py
```

You should see:
```
🔐 Admin Server running on http://0.0.0.0:8000
   Login: http://localhost:8000/admin/login
   Dashboard: http://localhost:8000/admin
```

Access the application:
- **Homepage**: http://localhost:5000
- **Admin Login**: http://localhost:8000/admin/login

## Verify Everything is Running

Open a new terminal and test:

### Test Backend & Frontend
```bash
curl http://localhost:5000
```

### Test API
```bash
curl http://localhost:5000/api/health
```

### Test Database
```bash
mysql -u algotrader -palgotrader -D algotrader -e "SELECT 1;"
```

## Access the Application

- **Homepage**: http://localhost:5000
- **Admin Login**: http://localhost:8000/admin/login
- **Admin Dashboard**: http://localhost:8000/admin
- **API Health**: http://localhost:5000/api/health

## Stopping Services

When you're done developing:

**Backend Terminal:** Press `Ctrl+C`

**Stop MySQL:**
```bash
mysql -u root -p -e "SHUTDOWN;"
# or
sudo service mysql stop
```

## Useful Commands

### Backend Commands

```bash
# Activate virtual environment (if not already active)
source venv/bin/activate  # Linux/macOS
venv\Scripts\activate     # Windows

# Run Flask shell
flask shell

# Create new migration
flask db migrate -m "description"

# Apply migrations
flask db upgrade

# Downgrade database
flask db downgrade

# View database
mysql -u algotrader -palgotrader -D algotrader
```

### Frontend Commands

```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Troubleshooting

### MySQL Connection Error
```
(2003, "Can't connect to MySQL server on 'localhost'")
```
**Solution:**
- Ensure MySQL is running: `mysql -u root -p -e "SELECT 1;"`
- Check DATABASE_URL in backend/.env
- Verify credentials: `mysql -u algotrader -palgotrader`

### ModuleNotFoundError
```
ModuleNotFoundError: No module named 'flask'
```
**Solution:**
- Activate virtual environment
- Run: `pip install -r requirements.txt`

### Port Already in Use
```
OSError: [Errno 98] Address already in use
```
**Solution:**
```bash
# Find process using port
lsof -i :5000    # Backend
lsof -i :5173    # Frontend
lsof -i :3306    # MySQL

# Kill process
kill -9 <PID>
```

### npm install Issues
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Database Migration Issues
```bash
# Reset migrations (CAUTION: deletes data)
flask db stamp head
flask db migrate
flask db upgrade
```

## Development Workflow

### Adding Backend Routes

1. Create route file in `backend/app/routes/`
2. Import and register blueprint in `backend/app/__init__.py`
3. Test with `curl` or Postman

### Adding Frontend Components

1. Create component in `frontend/src/pages/` or `frontend/src/components/`
2. Add route in `frontend/src/App.jsx`
3. Use Zustand stores for state management
4. Build frontend: `cd frontend && npm run build`
5. Restart backend server to see changes
6. Access at http://localhost:5000

### Database Changes

1. Create/modify model in `backend/app/models/`
2. Create migration: `flask db migrate -m "description"`
3. Review generated migration file
4. Apply: `flask db upgrade`

## Terminal Setup (Recommended)

Use multiple terminals for better workflow:

**Terminal 1 - MySQL:**
```bash
# Keep MySQL running in background (usually not needed)
```

**Terminal 2 - Backend (Homepage on port 5000):**
```bash
cd backend
source venv/bin/activate
python run.py
```

**Terminal 3 - Admin Server (on port 8000):**
```bash
cd backend
source venv/bin/activate
python run_admin.py
```

**Terminal 4 - Development work:**
```bash
# Use for creating files, running CLI commands, etc.
```

**Note:** Frontend is built once and served by both Flask apps, so no separate dev server needed!

## Next Steps

### Development Workflow

For **development with hot reload**, run both servers:
```bash
# Terminal 1: Backend
cd backend && source venv/bin/activate && python run.py

# Terminal 2: Frontend (in separate terminal)
cd frontend && npm run dev
```
Then access at **http://localhost:5173**

For **production**, build once and run backend only:
```bash
# Build frontend
cd frontend && npm run build

# Run backend
cd backend && python run.py
```
Then access at **http://localhost:5000**

1. Update Kite API credentials in `backend/.env`
2. Configure encryption key in `backend/.env`
3. Start implementing models and routes
4. Create frontend pages and components
5. Integrate authentication flow
