@echo off
REM AlgoTrader Project Setup Script for Windows

echo.
echo ╔════════════════════════════════════════════════════════════════════════════╗
echo ║                     AlgoTrader Setup Script                               ║
echo ║                     Algorithmic Trading Platform                          ║
echo ╚════════════════════════════════════════════════════════════════════════════╝
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo Warning: Docker is not installed. Please install Docker first.
    echo Visit: https://docs.docker.com/get-docker/
    pause
    exit /b 1
)

echo ✓ Docker found
echo.

REM Setup backend .env
echo Setting up backend environment...
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env"
    echo ✓ Created backend\.env
) else (
    echo ! backend\.env already exists
)

REM Setup frontend .env
echo Setting up frontend environment...
if not exist "frontend\.env" (
    copy "frontend\.env.example" "frontend\.env"
    echo ✓ Created frontend\.env
) else (
    echo ! frontend\.env already exists
)

echo.
echo Starting services...
docker-compose up -d

echo.
echo ╔════════════════════════════════════════════════════════════════════════════╗
echo ║                     Setup Complete!                                        ║
echo ╚════════════════════════════════════════════════════════════════════════════╝
echo.
echo Services are starting. Please wait 30-60 seconds for them to be ready.
echo.
echo Access points:
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:5000
echo   Database:  localhost:3306 (user: algotrader, pass: algotrader)
echo.
echo Useful commands:
echo   View logs:        docker-compose logs -f
echo   Stop services:    docker-compose down
echo   Rebuild services: docker-compose build
echo.
echo Configuration files to update:
echo   Backend config:  backend\.env (Kite API credentials, secrets)
echo   Frontend config: frontend\.env
echo.
pause
