#!/bin/bash
# Gas Town Frontend - Development Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo "  Gas Town Frontend - Dev Mode"
echo "========================================"
echo ""

# Check if node_modules exist
if [ ! -d "$SCRIPT_DIR/api/node_modules" ]; then
    echo "Installing API dependencies..."
    cd "$SCRIPT_DIR/api" && npm install
fi

if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "Installing Frontend dependencies..."
    cd "$SCRIPT_DIR/frontend" && npm install
fi

echo ""
echo "Starting services..."
echo "  API:      http://localhost:3001"
echo "  Frontend: http://localhost:3000"
echo "  WebSocket: ws://localhost:3001/ws"
echo ""
echo "Press Ctrl+C to stop"
echo "========================================"
echo ""

# Start API in background
cd "$SCRIPT_DIR/api" && npm run dev &
API_PID=$!

# Start Frontend in background
cd "$SCRIPT_DIR/frontend" && npm run dev &
FRONTEND_PID=$!

# Handle shutdown
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $API_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for both processes
wait
