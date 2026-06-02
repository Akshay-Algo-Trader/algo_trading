# Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- Or locally: Python 3.9+, Node.js 18+, MySQL 8.0+

## Quick Start with Docker (Recommended)

### Linux/macOS:
```bash
chmod +x setup.sh
./setup.sh
```

### Windows:
```cmd
setup.bat
```

## What This Does

1. Creates `.env` files from `.env.example` templates
2. Builds Docker images for backend and frontend
3. Starts all services (MySQL, Flask backend, React frontend)
4. Creates database and tables automatically

## Verify Installation

After running setup script, services should be running at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Database**: localhost:3306

Check status:
```bash
docker-compose ps
```

## Manual Setup (Without Docker)

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   flask db upgrade
   ```

6. **Run backend**
   ```bash
   python run.py
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   ```

4. **Run frontend**
   ```bash
   npm run dev
   ```

## Important Configuration

### Backend (.env file)

Update these values in `backend/.env`:

```
# Kite API Credentials (from Zerodha)
KITE_API_KEY=your-api-key-here
KITE_API_SECRET=your-api-secret-here
KITE_USER_ID=your-user-id-here

# Encryption Key (32 bytes, base64 encoded)
ENCRYPTION_KEY=your-encryption-key-here

# Change these for production
SECRET_KEY=your-production-secret-key
JWT_SECRET_KEY=your-production-jwt-key
```

## Useful Commands

```bash
# View logs from all services
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop all services
docker-compose down

# Remove all containers and volumes
docker-compose down -v

# Rebuild images
docker-compose build

# Restart a service
docker-compose restart backend
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port (Linux/macOS)
lsof -i :5173  # Frontend
lsof -i :5000  # Backend
lsof -i :3306  # Database

# Kill process
kill -9 <PID>
```

### Database Connection Error
1. Ensure MySQL container is running: `docker-compose ps`
2. Check database exists: `docker-compose exec db mysql -u algotrader -palgotrader -e "SHOW DATABASES;"`
3. Check credentials in `.env` files

### Module Not Found Errors
- Backend: `pip install -r requirements.txt`
- Frontend: `npm install`

### Frontend Can't Connect to Backend
1. Ensure backend is running and accessible
2. Check `VITE_API_URL` in `frontend/.env`
3. Verify backend is listening on port 5000

## Next Steps

1. Update all configuration values in `.env` files
2. Implement authentication routes
3. Add database models
4. Create API endpoints
5. Build frontend pages

For detailed structure information, see [README.md](README.md)
