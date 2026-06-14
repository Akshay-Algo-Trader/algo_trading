#!/bin/bash
# Start both backend and admin servers

echo "🚀 Starting AlgoTrader..."
echo ""

# Check if MySQL is running
echo "Checking MySQL..."
mysql -u algotrader -palgotrader -e "SELECT 1;" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️  MySQL is not running. Please start MySQL first:"
    echo "   sudo systemctl start mysql"
    exit 1
fi

echo "✅ MySQL is running"
echo ""

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ Frontend build failed"
    exit 1
fi
echo "✅ Frontend built successfully"
echo ""

# Start backend
cd ../backend
source venv/bin/activate

echo "🌐 Starting Homepage Server (port 5000)..."
python run.py &
BACKEND_PID=$!

sleep 2

echo "🔐 Starting Admin Server (port 8000)..."
python run_admin.py &
ADMIN_PID=$!

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ AlgoTrader is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 URLs:"
echo "   Homepage: http://localhost:5000"
echo "   Admin Login: http://localhost:8000/admin/login"
echo "   Admin Dashboard: http://localhost:8000/admin"
echo ""
echo "🔐 Create an admin user with: cd backend && flask admin:user:create"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for both processes
wait $BACKEND_PID $ADMIN_PID
