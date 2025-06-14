#!/bin/bash

# ChatterPi Quick Start Script
# Simple script to start all ChatterPi services

echo "🎭 Starting ChatterPi AI System..."

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
pkill -f "jaw_websocket_server.py" 2>/dev/null || true
pkill -f "ai_websocket_bridge.py" 2>/dev/null || true
pkill -f "http.server.*3000" 2>/dev/null || true

sleep 2

# Start services in background
echo "🦴 Starting Jaw Server..."
python3 scripts/chatterpi/jaw_websocket_server.py --host 0.0.0.0 --port 8765 &

echo "🧠 Starting AI Bridge..."
python3 scripts/chatterpi/ai_websocket_bridge.py --host 0.0.0.0 --port 8766 &

echo "🌐 Starting Web Server..."
python3 -m http.server 3000 &

sleep 3

echo ""
echo "✅ ChatterPi AI System Started!"
echo ""
echo "🌐 Open in browser: http://localhost:3000/public/chatterpi-chat.html"
echo ""
echo "🎯 Features:"
echo "  💬 Real AI conversation with Count Orlok"
echo "  🦴 Improved jaw animation (reduced jitter)"
echo "  🔧 Servo calibration button"
echo "  🎭 Multiple AI characters"
echo ""
echo "🛑 To stop: pkill -f 'jaw_websocket_server\\|ai_websocket_bridge\\|http.server.*3000'"
echo ""
