#!/bin/bash
# Start ChatterPi with GPIO Jaw Control
# Comprehensive startup script for RPI4b

echo "🎯 Starting ChatterPi with GPIO Jaw Control"
echo "============================================"

# Set project directory
PROJECT_DIR="$HOME/MonsterBox"
SCRIPTS_DIR="$PROJECT_DIR/scripts/chatterpi"

cd "$PROJECT_DIR"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Kill existing processes
log "🔄 Stopping existing processes..."
pkill -f "node.*app" 2>/dev/null
pkill -f "jaw.*server" 2>/dev/null
pkill -f "gpio_jaw" 2>/dev/null
pkill -f "ai.*bridge" 2>/dev/null
sleep 3

# Check and install dependencies
log "📦 Checking dependencies..."

# Check Python packages
python3 -c "import RPi.GPIO" 2>/dev/null || {
    log "Installing RPi.GPIO..."
    pip3 install RPi.GPIO --user
}

python3 -c "import websockets" 2>/dev/null || {
    log "Installing websockets..."
    pip3 install websockets --user
}

# Start MonsterBox main app
log "🚀 Starting MonsterBox main application..."
nohup node --no-deprecation app.js > app.log 2>&1 &
APP_PID=$!

# Wait for app to start
sleep 5

# Check if app started
if netstat -tln | grep -q ":3000"; then
    log "✅ MonsterBox app started successfully (PID: $APP_PID)"
else
    log "❌ MonsterBox app failed to start"
    exit 1
fi

# Start GPIO Jaw Server
log "🦴 Starting GPIO Jaw Server..."
cd "$SCRIPTS_DIR"
nohup python3 gpio_jaw_server.py --host 0.0.0.0 --port 8765 --servo-pin 18 > gpio_jaw.log 2>&1 &
JAW_PID=$!

# Wait for jaw server to start
sleep 3

# Check if jaw server started
if netstat -tln | grep -q ":8765"; then
    log "✅ GPIO Jaw Server started successfully (PID: $JAW_PID)"
else
    log "❌ GPIO Jaw Server failed to start"
    log "Checking log..."
    tail -10 gpio_jaw.log
    exit 1
fi

# Start AI Bridge
log "🤖 Starting AI WebSocket Bridge..."
nohup python3 ai_websocket_bridge.py --host 0.0.0.0 --port 8766 --jaw-host localhost --jaw-port 8765 > ai_bridge.log 2>&1 &
AI_PID=$!

# Wait for AI bridge to start
sleep 3

# Check if AI bridge started
if netstat -tln | grep -q ":8766"; then
    log "✅ AI Bridge started successfully (PID: $AI_PID)"
else
    log "❌ AI Bridge failed to start"
    log "Checking log..."
    tail -10 ai_bridge.log
    exit 1
fi

# Final status check
log "🔍 Final system status check..."
echo ""
echo "📊 SYSTEM STATUS:"
echo "=================="

# Check ports
echo "🔌 Listening Ports:"
netstat -tln | grep -E ":(3000|8765|8766)" | while read line; do
    if echo "$line" | grep -q ":3000"; then
        echo "   ✅ Port 3000 (MonsterBox App)"
    elif echo "$line" | grep -q ":8765"; then
        echo "   ✅ Port 8765 (GPIO Jaw Server)"
    elif echo "$line" | grep -q ":8766"; then
        echo "   ✅ Port 8766 (AI Bridge)"
    fi
done

# Check processes
echo ""
echo "⚙️ Running Processes:"
ps aux | grep -E "(node.*app|gpio_jaw|ai.*bridge)" | grep -v grep | while read line; do
    if echo "$line" | grep -q "node.*app"; then
        echo "   ✅ MonsterBox App"
    elif echo "$line" | grep -q "gpio_jaw"; then
        echo "   ✅ GPIO Jaw Server"
    elif echo "$line" | grep -q "ai.*bridge"; then
        echo "   ✅ AI Bridge"
    fi
done

echo ""
echo "🎉 ChatterPi System Started Successfully!"
echo "========================================"
echo ""
echo "🌐 Access URLs:"
echo "   Basic ChatterPi: http://$(hostname -I | awk '{print $1}'):3000/chatterpi-chat.html"
echo "   AI ChatterPi: http://$(hostname -I | awk '{print $1}'):3000/chatterpi-ai-chat.html"
echo ""
echo "🔧 Features Available:"
echo "   ✅ GPIO Servo Control (Pin 18)"
echo "   ✅ Character Voices"
echo "   ✅ Real-time Jaw Animation"
echo "   ✅ AI Conversation"
echo ""
echo "🧪 Test the system:"
echo "   1. Open the web interface"
echo "   2. Select GPIO 18 from servo dropdown"
echo "   3. Click 'Test Movement' button"
echo "   4. Servo should move!"
echo ""

# Keep script running to monitor
log "👁️ Monitoring system (Ctrl+C to stop)..."
while true; do
    sleep 30
    
    # Check if services are still running
    if ! netstat -tln | grep -q ":3000"; then
        log "⚠️ MonsterBox app stopped, restarting..."
        cd "$PROJECT_DIR"
        nohup node --no-deprecation app.js > app.log 2>&1 &
    fi
    
    if ! netstat -tln | grep -q ":8765"; then
        log "⚠️ GPIO Jaw Server stopped, restarting..."
        cd "$SCRIPTS_DIR"
        nohup python3 gpio_jaw_server.py --host 0.0.0.0 --port 8765 --servo-pin 18 > gpio_jaw.log 2>&1 &
    fi
    
    if ! netstat -tln | grep -q ":8766"; then
        log "⚠️ AI Bridge stopped, restarting..."
        cd "$SCRIPTS_DIR"
        nohup python3 ai_websocket_bridge.py --host 0.0.0.0 --port 8766 > ai_bridge.log 2>&1 &
    fi
done
