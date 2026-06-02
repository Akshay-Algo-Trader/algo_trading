#!/bin/bash

# AlgoTrader - Start Backend Server
# This script starts the Flask backend on port 5000

cd "$(dirname "$0")/backend"

echo "=========================================="
echo "AlgoTrader Backend Server"
echo "=========================================="
echo ""

# Activate virtual environment
source venv/bin/activate

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found!"
    echo "Please run: cp .env.example .env"
    exit 1
fi

echo "Starting Flask backend server..."
echo "Server will run on: http://localhost:5000"
echo "API endpoints: http://localhost:5000/api"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python run.py
