@echo off
REM AlgoTrader - Start Frontend Server (Windows)

cd /d "%~dp0frontend"

echo.
echo ==========================================
echo AlgoTrader Frontend Server
echo ==========================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo Error: .env file not found!
    echo Please run: copy .env.example .env
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    echo.
)

echo Starting Vite development server...
echo Server will run on: http://localhost:5173
echo API will connect to: http://localhost:5000/api
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev
pause
