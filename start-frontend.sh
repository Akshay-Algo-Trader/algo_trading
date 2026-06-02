#!/bin/bash

# AlgoTrader - Start Frontend Server
# This script starts the React + Vite frontend on port 5173

cd "$(dirname "$0")/frontend"

echo "=========================================="
echo "AlgoTrader Frontend Server"
echo "=========================================="
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please run: cp .env.example .env"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

echo "Starting Vite development server..."
echo "Server will run on: http://localhost:5173"
echo "API will connect to: http://localhost:5000/api"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
