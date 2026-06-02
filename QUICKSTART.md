# 🚀 AlgoTrader - Local Setup Complete!

Your AlgoTrader project is now fully configured and ready to run locally without Docker!

## ✅ Setup Summary

All prerequisites have been installed and configured:
- ✅ Python 3.12 with virtual environment
- ✅ Node.js 18 and npm
- ✅ MySQL 8.0 with database ready
- ✅ Flask backend dependencies installed
- ✅ React + Vite frontend dependencies installed
- ✅ Database initialized and ready

## 🎯 Running the Application

### Quick Start (Easiest Way)

You'll need **3 terminal windows** to run everything:

#### Terminal 1 - Backend Server

**Linux/macOS:**
```bash
cd /var/www/AlgoTreding
./start-backend.sh
```

**Windows:**
```bash
cd \path\to\AlgoTreding
start-backend.bat
```

**Output should show:**
```
 * Running on http://0.0.0.0:5000
 * Debug mode: on
```

#### Terminal 2 - Frontend Server

**Linux/macOS:**
```bash
cd /var/www/AlgoTreding
./start-frontend.sh
```

**Windows:**
```bash
cd \path\to\AlgoTreding
start-frontend.bat
```

**Output should show:**
```
VITE v5.0.0 ready in 234ms

➜  Local:   http://localhost:5173/
```

#### Terminal 3 - Development (Optional)

Use this for file operations, git commands, running migrations, etc.

### Manual Start (If Scripts Don't Work)

#### Backend

```bash
cd backend
source venv/bin/activate        # Linux/macOS
# OR
venv\Scripts\activate           # Windows

python run.py
```

#### Frontend

```bash
cd frontend
npm run dev
```

## 🌐 Access Your Application

Once both servers are running:

| Service | URL | Purpose |
|---------|-----|---------|
| **Frontend** | http://localhost:5173 | React UI |
| **Backend** | http://localhost:5000 | Flask API |
| **API** | http://localhost:5000/api | REST endpoints |
| **Database** | localhost:3306 | MySQL database |

## 📝 Configuration Files

### Backend Configuration (`backend/.env`)

Key settings you should update:

```env
# Kite API Credentials (get from Zerodha)
KITE_API_KEY=your-api-key-here
KITE_API_SECRET=your-api-secret-here
KITE_USER_ID=your-user-id-here

# Encryption (keep as is or generate a new one)
ENCRYPTION_KEY=your-32-character-encryption-key-1234

# For production, change these:
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
```

### Frontend Configuration (`frontend/.env`)

```env
VITE_API_URL=http://localhost:5000/api
```

## 🧪 Testing the Setup

### Test Backend API

```bash
curl http://localhost:5000
```

### Test Database Connection

```bash
mysql -u algotrader -palgotrader -D algotrader -e "SELECT 1;"
```

### View Database Tables

```bash
mysql -u algotrader -palgotrader -D algotrader
SHOW TABLES;
EXIT;
```

## 📁 Project Structure

```
AlgoTreding/
├── backend/
│   ├── venv/              # Virtual environment
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── extensions.py
│   │   ├── models/
│   │   ├── routes/
│   │   └── services/
│   ├── migrations/        # Database migrations
│   ├── .env              # Environment variables
│   ├── requirements.txt
│   └── run.py
│
├── frontend/
│   ├── node_modules/     # Dependencies
│   ├── src/
│   │   ├── api/
│   │   ├── store/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env             # Environment variables
│   ├── package.json
│   └── vite.config.js
│
├── start-backend.sh     # Backend startup script
├── start-frontend.sh    # Frontend startup script
├── LOCAL_SETUP.md       # Detailed setup guide
└── README.md           # Project documentation
```

## 🔧 Useful Commands

### Backend Commands

```bash
cd backend
source venv/bin/activate

# Create a new database migration
flask db migrate -m "Add user table"

# Apply migrations
flask db upgrade

# Downgrade to previous version
flask db downgrade

# Enter Flask shell
flask shell

# Check database tables
mysql -u algotrader -palgotrader -D algotrader

# Install more packages
pip install package-name
pip freeze > requirements.txt
```

### Frontend Commands

```bash
cd frontend

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Install new package
npm install package-name
```

### Database Commands

```bash
# Connect to MySQL
mysql -u algotrader -palgotrader

# Select database
USE algotrader;

# View tables
SHOW TABLES;

# Describe a table
DESCRIBE users;

# View all databases
SHOW DATABASES;
```

## 🐛 Troubleshooting

### Port Already in Use

If you get "Address already in use" error:

```bash
# Find process using port
lsof -i :5000    # Backend
lsof -i :5173    # Frontend
lsof -i :3306    # MySQL

# Kill the process
kill -9 <PID>
```

### Database Connection Error

```
Can't connect to MySQL server on 'localhost'
```

**Solution:**
```bash
# Check if MySQL is running
sudo service mysql status

# Start MySQL if stopped
sudo service mysql start

# Test connection
mysql -u algotrader -palgotrader
```

### Module Not Found Error

```
ModuleNotFoundError: No module named 'flask'
```

**Solution:**
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### npm install Issues

```bash
cd frontend

# Clear npm cache
npm cache clean --force

# Remove old installation
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Backend Won't Start

```bash
cd backend
source venv/bin/activate

# Try running with more verbose output
python -u run.py
```

## 📚 Next Steps

1. **Update Configuration**
   - Add Kite API credentials to `backend/.env`
   - Configure encryption key
   - Test database connection

2. **Implement Features**
   - Add database models in `backend/app/models/`
   - Create API routes in `backend/app/routes/`
   - Build business logic in `backend/app/services/`
   - Create frontend pages in `frontend/src/pages/`

3. **Database Changes**
   - Modify models
   - Run migration: `flask db migrate -m "description"`
   - Apply: `flask db upgrade`

4. **Frontend Development**
   - Create components in `frontend/src/`
   - Use Zustand stores for state management
   - Add routes in `frontend/src/App.jsx`

## 📖 Documentation References

- [Flask Documentation](https://flask.palletsprojects.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)

## 🎉 You're Ready!

Your local development environment is now ready. Start the backend and frontend servers and begin building your algorithmic trading platform!

**Happy coding! 🚀**
