@echo off
REM AlgoTrader - Start Backend Server (Windows)

cd /d "%~dp0backend"

echo.
echo ==========================================
echo AlgoTrader Backend Server
echo ==========================================
echo.

REM Activate virtual environment
call venv\Scripts\activate.bat

REM Check if .env exists
if not exist ".env" (
    echo Error: .env file not found!
    echo Please run: copy .env.example .env
    pause
    exit /b 1
)

echo Starting Flask backend server...
echo Server will run on: http://localhost:5000
echo API endpoints: http://localhost:5000/api
echo.
echo Press Ctrl+C to stop the server
echo.

python run.py
pause
