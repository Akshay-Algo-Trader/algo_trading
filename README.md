# AlgoTrader - Algorithmic Trading Platform

A complete full-stack algorithmic trading platform built with Flask backend, React + Vite frontend, and MySQL database.

## Project Structure

```
algotrader/
├── backend/                    # Flask API
│   ├── app/
│   │   ├── __init__.py        # App factory
│   │   ├── config.py          # Configuration
│   │   ├── extensions.py      # Extensions (db, jwt, cors)
│   │   ├── models/            # Database models
│   │   ├── routes/            # API routes
│   │   └── services/          # Business logic
│   ├── run.py                 # Entry point
│   ├── requirements.txt       # Dependencies
│   ├── .env.example          # Example environment variables
│   └── Dockerfile            # Backend Docker image
│
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── store/            # Zustand stores
│   │   ├── layouts/          # Layout components
│   │   ├── pages/            # Page components
│   │   ├── App.jsx           # Root component
│   │   ├── main.jsx          # Entry point
│   │   └── index.css         # Tailwind CSS
│   ├── index.html            # HTML template
│   ├── package.json          # Dependencies
│   ├── vite.config.js        # Vite configuration
│   ├── tailwind.config.js    # Tailwind configuration
│   ├── .env.example          # Example environment variables
│   └── Dockerfile            # Frontend Docker image
│
├── docker-compose.yml         # Docker Compose configuration
├── .gitignore                # Git ignore rules
└── README.md                 # This file
```

## Prerequisites

- Docker and Docker Compose
- Or locally:
  - Python 3.9+
  - Node.js 18+
  - MySQL 8.0+

## Getting Started

### Option 1: Using Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   cd /var/www/AlgoTreding
   ```

2. **Set up environment variables**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   
   Edit the `.env` files with your actual configuration (Kite API credentials, secret keys, etc.)

3. **Build and start containers**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000
   - Database: localhost:3306

### Option 2: Local Setup

#### Backend Setup

1. **Create virtual environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Initialize database**
   ```bash
   flask db upgrade
   ```

5. **Run the server**
   ```bash
   python run.py
   ```

#### Frontend Setup

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Run development server**
   ```bash
   npm run dev
   ```

#### Database Setup

- Ensure MySQL is running
- Create database and user as per `.env` configuration
- Backend migrations will create tables automatically

## Technology Stack

### Backend
- **Framework**: Flask 2.3.3
- **ORM**: SQLAlchemy
- **Migrations**: Flask-Migrate
- **Authentication**: Flask-JWT-Extended
- **API**: Flask-CORS
- **Broker Integration**: KiteConnect (Zerodha)
- **Encryption**: cryptography
- **Scheduling**: APScheduler
- **Server**: Gunicorn

### Frontend
- **Framework**: React 18.2.0
- **Build Tool**: Vite 5.0.0
- **Routing**: React Router v6
- **State Management**: Zustand
- **HTTP Client**: Axios
- **UI Framework**: Tailwind CSS
- **Component Library**: Headless UI

### Database
- **MySQL**: 8.0

## Environment Variables

### Backend (.env)
```
FLASK_APP=run.py
FLASK_ENV=development
DATABASE_URL=mysql+mysqldb://user:pass@host:3306/dbname
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
KITE_API_KEY=your-kite-api-key
KITE_API_SECRET=your-kite-api-secret
ENCRYPTION_KEY=your-encryption-key
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
```

## Development Workflow

### Adding Backend Routes

1. Create route file in `backend/app/routes/`
2. Create blueprint and register in `app/__init__.py`
3. Add business logic in `backend/app/services/`

### Adding Frontend Pages

1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.jsx`
3. Use Zustand stores for state management

### Database Models

1. Create model in `backend/app/models/`
2. Create migration: `flask db migrate -m "description"`
3. Apply migration: `flask db upgrade`

## API Documentation

Routes will be documented as they are implemented.

## Stopping Services

```bash
docker-compose down          # Stop and remove containers
docker-compose down -v       # Also remove volumes
```

## Troubleshooting

### Database Connection Error
- Ensure MySQL is running
- Check credentials in `.env`
- Verify DATABASE_URL format

### Port Already in Use
- Change ports in `docker-compose.yml` or local config
- Kill existing processes on ports 3306, 5000, 5173

### Module Not Found
- Backend: Ensure `pip install -r requirements.txt`
- Frontend: Ensure `npm install`

## Notes

- This is a development scaffold - configure production settings in `app/config.py`
- Update SECRET_KEY and JWT_SECRET_KEY for production
- Add proper error handling and validation before deployment
- Implement database backups for production

## License

MIT License
