#!/bin/bash

# ChatterPi Complete System Startup Script
# Starts all necessary servers for the improved ChatterPi AI system
# Author: Augment Agent
# Version: 2.0 (with improvements and calibration)

set -e  # Exit on any error

# Configuration
SERVO_PIN=${1:-18}
JAW_PORT=${2:-8765}
AI_PORT=${3:-8766}
WEB_PORT=${4:-3000}
HOST="0.0.0.0"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# PID tracking
JAW_PID=""
AI_PID=""
WEB_PID=""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down ChatterPi system...${NC}"
    
    if [ ! -z "$JAW_PID" ] && kill -0 $JAW_PID 2>/dev/null; then
        echo -e "${BLUE}🦴 Stopping Jaw WebSocket Server (PID: $JAW_PID)${NC}"
        kill $JAW_PID
        wait $JAW_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$AI_PID" ] && kill -0 $AI_PID 2>/dev/null; then
        echo -e "${PURPLE}🧠 Stopping AI WebSocket Bridge (PID: $AI_PID)${NC}"
        kill $AI_PID
        wait $AI_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$WEB_PID" ] && kill -0 $WEB_PID 2>/dev/null; then
        echo -e "${CYAN}🌐 Stopping Web Server (PID: $WEB_PID)${NC}"
        kill $WEB_PID
        wait $WEB_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN}✅ ChatterPi system shutdown complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is already in use${NC}"
        return 1
    fi
    return 0
}

# Function to wait for service to start
wait_for_service() {
    local port=$1
    local service_name=$2
    local max_attempts=10
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to start on port $port...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready${NC}"
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}❌ $service_name failed to start within $max_attempts seconds${NC}"
    return 1
}

# Header
echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    🎭 ChatterPi AI System                    ║"
echo "║                  Complete Startup Script                    ║"
echo "║                     Version 2.0                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Display configuration
echo -e "${BLUE}🔧 Configuration:${NC}"
echo -e "   Servo GPIO Pin: ${GREEN}$SERVO_PIN${NC}"
echo -e "   Jaw WebSocket Port: ${GREEN}$JAW_PORT${NC}"
echo -e "   AI WebSocket Port: ${GREEN}$AI_PORT${NC}"
echo -e "   Web Server Port: ${GREEN}$WEB_PORT${NC}"
echo -e "   Host: ${GREEN}$HOST${NC}"
echo ""

echo -e "${YELLOW}🎯 Features Enabled:${NC}"
echo -e "   ✅ Enhanced servo jitter reduction (15µs deadband)"
echo -e "   ✅ PWM idle state management"
echo -e "   ✅ Speech frequency filtering (300-3400Hz)"
echo -e "   ✅ Improved attack/release timing (50ms/150ms)"
echo -e "   ✅ 60Hz servo update rate"
echo -e "   ✅ Real-time jaw calibration"
echo -e "   ✅ OpenAI GPT-3.5-turbo integration"
echo -e "   ✅ Character-specific AI personalities"
echo ""

# Check if we're in the right directory
if [ ! -f "scripts/chatterpi/jaw_websocket_server.py" ]; then
    echo -e "${RED}❌ Error: Please run this script from the MonsterBox root directory${NC}"
    echo -e "   Current directory: $(pwd)"
    echo -e "   Expected files: scripts/chatterpi/jaw_websocket_server.py"
    exit 1
fi

# Check for required Python modules
echo -e "${BLUE}🔍 Checking dependencies...${NC}"

# Check each module individually for better error reporting
missing_modules=()

python3 -c "import websockets" 2>/dev/null || missing_modules+=("websockets")
python3 -c "import lgpio" 2>/dev/null || missing_modules+=("lgpio")
python3 -c "import openai" 2>/dev/null || missing_modules+=("openai")

if [ ${#missing_modules[@]} -gt 0 ]; then
    echo -e "${RED}❌ Missing required Python modules: ${missing_modules[*]}${NC}"
    echo -e "   Try: ${YELLOW}sudo apt install python3-websockets${NC}"
    echo -e "   Or: ${YELLOW}pip install --break-system-packages ${missing_modules[*]}${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All dependencies available${NC}"

# Check for environment variables
if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  Warning: OPENAI_API_KEY not set. AI features may not work.${NC}"
fi

# Check ports availability
echo -e "${BLUE}🔍 Checking port availability...${NC}"
check_port $JAW_PORT || exit 1
check_port $AI_PORT || exit 1
check_port $WEB_PORT || exit 1

echo -e "${GREEN}✅ All ports available${NC}"
echo ""

# Start Jaw WebSocket Server
echo -e "${BLUE}🦴 Starting Enhanced Jaw WebSocket Server...${NC}"
python3 scripts/chatterpi/jaw_websocket_server.py --host $HOST --port $JAW_PORT --servo-pin $SERVO_PIN &
JAW_PID=$!

# Wait for jaw server to start
wait_for_service $JAW_PORT "Jaw WebSocket Server" || {
    cleanup
    exit 1
}

# Start AI WebSocket Bridge
echo -e "${PURPLE}🧠 Starting AI WebSocket Bridge...${NC}"
python3 scripts/chatterpi/ai_websocket_bridge.py --host $HOST --port $AI_PORT &
AI_PID=$!

# Wait for AI bridge to start
wait_for_service $AI_PORT "AI WebSocket Bridge" || {
    cleanup
    exit 1
}

# Start Web Server
echo -e "${CYAN}🌐 Starting Web Server...${NC}"
python3 -m http.server $WEB_PORT &
WEB_PID=$!

# Wait for web server to start
wait_for_service $WEB_PORT "Web Server" || {
    cleanup
    exit 1
}

# System ready
echo ""
echo -e "${GREEN}🎉 ChatterPi AI System is fully operational!${NC}"
echo ""
echo -e "${CYAN}📡 Service Status:${NC}"
echo -e "   🦴 Jaw WebSocket Server: ${GREEN}ws://$HOST:$JAW_PORT${NC} (PID: $JAW_PID)"
echo -e "   🧠 AI WebSocket Bridge: ${GREEN}ws://$HOST:$AI_PORT${NC} (PID: $AI_PID)"
echo -e "   🌐 Web Server: ${GREEN}http://$HOST:$WEB_PORT${NC} (PID: $WEB_PID)"
echo ""
echo -e "${YELLOW}🌐 Access the interface at:${NC}"
echo -e "   ${CYAN}http://localhost:$WEB_PORT/public/chatterpi-chat.html${NC}"
echo ""
echo -e "${BLUE}🎮 Available Features:${NC}"
echo -e "   💬 Real AI conversation with Count Orlok"
echo -e "   🦴 Jaw animation synchronized with speech"
echo -e "   🔧 Servo calibration with slow stepping"
echo -e "   🎭 Multiple AI characters (Orlok, Robot, Pirate)"
echo -e "   🔊 Text-to-speech with character voices"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services...${NC}"

# Keep script running and monitor services
while true; do
    # Check if any service has died
    if [ ! -z "$JAW_PID" ] && ! kill -0 $JAW_PID 2>/dev/null; then
        echo -e "${RED}❌ Jaw WebSocket Server has stopped unexpectedly${NC}"
        cleanup
        exit 1
    fi
    
    if [ ! -z "$AI_PID" ] && ! kill -0 $AI_PID 2>/dev/null; then
        echo -e "${RED}❌ AI WebSocket Bridge has stopped unexpectedly${NC}"
        cleanup
        exit 1
    fi
    
    if [ ! -z "$WEB_PID" ] && ! kill -0 $WEB_PID 2>/dev/null; then
        echo -e "${RED}❌ Web Server has stopped unexpectedly${NC}"
        cleanup
        exit 1
    fi
    
    sleep 5
done
