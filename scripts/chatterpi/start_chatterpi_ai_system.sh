#!/bin/bash

# ChatterPi AI System Startup Script
# Starts both the Jaw WebSocket Server and AI WebSocket Bridge

echo "🎬 Starting ChatterPi AI System..."

# Change to the MonsterBox directory
cd "$(dirname "$0")/../.."

# Function to detect jaw servos
detect_jaw_servos() {
    echo "🔍 Detecting jaw servos from parts configuration..."

    if [ ! -f "data/parts.json" ]; then
        echo "⚠️ Parts configuration not found: data/parts.json"
        return 1
    fi

    # Use Python to parse JSON and detect jaw servos
    python3 -c "
import json
import sys

try:
    with open('data/parts.json', 'r') as f:
        parts = json.load(f)

    jaw_servos = []
    for part in parts:
        if (part.get('type') == 'servo' and
            'jaw' in part.get('name', '').lower() and
            part.get('pin') is not None):
            jaw_servos.append({
                'name': part.get('name'),
                'pin': part.get('pin'),
                'characterId': part.get('characterId')
            })

    if jaw_servos:
        print('✅ Detected jaw servos:')
        for servo in jaw_servos:
            print(f'   - {servo[\"name\"]} (GPIO {servo[\"pin\"]}, Character {servo[\"characterId\"]})')
    else:
        print('⚠️ No jaw servos detected in parts configuration')

except Exception as e:
    print(f'❌ Error detecting jaw servos: {e}')
"
}

# Detect jaw servos
detect_jaw_servos

# Function to cleanup processes on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down ChatterPi AI System..."
    if [ ! -z "$JAW_PID" ]; then
        echo "Stopping Jaw WebSocket Server (PID: $JAW_PID)..."
        kill $JAW_PID 2>/dev/null
    fi
    if [ ! -z "$AI_PID" ]; then
        echo "Stopping AI WebSocket Bridge (PID: $AI_PID)..."
        kill $AI_PID 2>/dev/null
    fi
    echo "✅ ChatterPi AI System stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "🦴 Starting Jaw WebSocket Server on port 8765..."
python3 scripts/chatterpi/gpio_jaw_server_robust.py --host 0.0.0.0 --port 8765 &
JAW_PID=$!

# Wait longer for jaw server to fully initialize
echo "⏳ Waiting for jaw server to initialize..."
sleep 5

echo "🧠 Starting AI WebSocket Bridge on port 8766..."
python3 scripts/chatterpi/ai_websocket_bridge.py --host 0.0.0.0 --port 8766 &
AI_PID=$!

# Wait a moment for AI bridge to start
sleep 2

echo ""
echo "✅ ChatterPi AI System is running!"
echo "🦴 Jaw WebSocket Server: ws://0.0.0.0:8765 (PID: $JAW_PID)"
echo "🧠 AI WebSocket Bridge: ws://0.0.0.0:8766 (PID: $AI_PID)"
echo "🌐 Web Interface: http://$(hostname -I | awk '{print $1}'):3000/chatterpi-chat.html"
echo ""
echo "Press Ctrl+C to stop all services..."

# Wait for processes to finish
wait $JAW_PID $AI_PID
