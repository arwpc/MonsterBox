#!/bin/bash

# MonsterBox Hardware Services Startup Script
# Starts all hardware WebSocket services following ChatterPi pattern

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_CMD="python3"

# PID tracking
PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down hardware services...${NC}"
    
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${BLUE}Stopping process $pid${NC}"
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait for processes to terminate
    sleep 2
    
    # Force kill if still running
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${RED}Force killing process $pid${NC}"
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ All hardware services stopped${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Print banner
echo -e "${PURPLE}"
cat << "EOF"
╭─────────────────────────────────────────────────────────────╮
│                                                             │
│  🦾 MonsterBox Hardware WebSocket Services                  │
│                                                             │
│  Following ChatterPi WebSocket Architecture Pattern        │
│                                                             │
╰─────────────────────────────────────────────────────────────╯
EOF
echo -e "${NC}"

# Check if Python is available
if ! command -v $PYTHON_CMD &> /dev/null; then
    echo -e "${RED}❌ Python3 not found. Please install Python 3.7+${NC}"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "$PROJECT_ROOT/package.json" ]; then
    echo -e "${RED}❌ Not in MonsterBox project directory${NC}"
    exit 1
fi

# Change to script directory
cd "$SCRIPT_DIR"

echo -e "${CYAN}🔧 Starting hardware services...${NC}"
echo -e "${BLUE}📁 Project root: $PROJECT_ROOT${NC}"
echo -e "${BLUE}📁 Script directory: $SCRIPT_DIR${NC}"
echo ""

# Start the main hardware server (this will start all other services)
echo -e "${GREEN}🚀 Starting Main Hardware Server...${NC}"
$PYTHON_CMD start_hardware_services.py --host 0.0.0.0 --port 8780 &
MAIN_PID=$!
PIDS+=($MAIN_PID)

# Wait a moment for services to start
sleep 3

# Check if main server started successfully
if ! kill -0 $MAIN_PID 2>/dev/null; then
    echo -e "${RED}❌ Failed to start main hardware server${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ MonsterBox Hardware Services are running!${NC}"
echo ""
echo -e "${CYAN}🌐 Service Endpoints:${NC}"
echo -e "${BLUE}📡 Service Registry:     ws://0.0.0.0:8770${NC}"
echo -e "${BLUE}🦾 Main Hardware Server: ws://0.0.0.0:8780${NC}"
echo -e "${BLUE}🔄 Motor Service:        ws://0.0.0.0:8771${NC}"
echo -e "${BLUE}💡 Light Service:        ws://0.0.0.0:8772${NC}"
echo -e "${BLUE}📹 Webcam Service:       ws://0.0.0.0:8774${NC}"
echo -e "${BLUE}🎯 Head Tracking:        ws://0.0.0.0:8778${NC}"
echo ""
echo -e "${YELLOW}🎭 Character-based service loading enabled${NC}"
echo -e "${YELLOW}📋 Using configuration from: data/characters.json${NC}"
echo -e "${YELLOW}🔧 Hardware scripts wrapped with WebSocket interface${NC}"
echo ""
echo -e "${PURPLE}Press Ctrl+C to stop all services...${NC}"

# Wait for all background processes
wait
