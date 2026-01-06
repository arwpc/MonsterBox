#!/bin/bash
# MonsterBox Clean Startup Script
# Kills old instances, verifies services, and starts MonsterBox cleanly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}>>> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

print_header "MonsterBox 5.5 Clean Startup"

# Step 1: Kill old MonsterBox instances
print_status "Step 1: Killing old MonsterBox instances..."
bash scripts/kill-monsterbox.sh
echo ""

# Step 2: Check PipeWire/WirePlumber services
print_status "Step 2: Checking audio services (PipeWire/WirePlumber)..."

# Check if running as user service
if systemctl --user is-active --quiet pipewire; then
    print_success "PipeWire is running"
else
    print_warning "PipeWire is not running, attempting to start..."
    systemctl --user start pipewire || print_error "Failed to start PipeWire"
fi

if systemctl --user is-active --quiet pipewire-pulse; then
    print_success "PipeWire-Pulse is running"
else
    print_warning "PipeWire-Pulse is not running, attempting to start..."
    systemctl --user start pipewire-pulse || print_error "Failed to start PipeWire-Pulse"
fi

if systemctl --user is-active --quiet wireplumber; then
    print_success "WirePlumber is running"
else
    print_warning "WirePlumber is not running, attempting to start..."
    systemctl --user start wireplumber || print_error "Failed to start WirePlumber"
fi

# Show audio sinks
if command -v wpctl &> /dev/null; then
    echo ""
    print_status "Available audio sinks:"
    wpctl status | grep -A 10 "Audio" | grep -E "Sinks:|├─|└─" || echo "  No sinks found"
fi

echo ""

# Step 3: Check mjpg-streamer service
print_status "Step 3: Checking mjpg-streamer service..."

if systemctl is-active --quiet mjpg-streamer; then
    print_success "mjpg-streamer is running"
    
    # Test HTTP endpoint
    if curl -s --max-time 2 -I http://localhost:8090/ | grep -q "200 OK"; then
        print_success "mjpg-streamer HTTP endpoint responding"
    else
        print_warning "mjpg-streamer HTTP endpoint not responding"
    fi
else
    print_warning "mjpg-streamer is not running, attempting to start..."
    sudo systemctl start mjpg-streamer || print_error "Failed to start mjpg-streamer"
    sleep 2
    
    if systemctl is-active --quiet mjpg-streamer; then
        print_success "mjpg-streamer started successfully"
    else
        print_error "mjpg-streamer failed to start"
        print_status "Check logs with: sudo journalctl -u mjpg-streamer -n 20"
    fi
fi

echo ""

# Step 4: Verify Node.js and npm
print_status "Step 4: Verifying Node.js environment..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js $NODE_VERSION installed"
else
    print_error "Node.js not found"
    exit 1
fi

if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm $NPM_VERSION installed"
else
    print_error "npm not found"
    exit 1
fi

echo ""

# Step 5: Check for node_modules
print_status "Step 5: Checking dependencies..."

if [ -d "node_modules" ]; then
    print_success "node_modules directory exists"
else
    print_warning "node_modules not found, running npm install..."
    npm install
fi

echo ""

# Step 6: Verify critical files
print_status "Step 6: Verifying critical files..."

CRITICAL_FILES=(
    "server.js"
    "package.json"
    "data/character-3/parts.json"
    "controllers/partsController.js"
)

ALL_FILES_OK=true
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "$file exists"
    else
        print_error "$file missing"
        ALL_FILES_OK=false
    fi
done

if [ "$ALL_FILES_OK" = false ]; then
    print_error "Critical files missing, cannot start MonsterBox"
    exit 1
fi

echo ""

# Step 7: Check for port conflicts
print_status "Step 7: Checking for port conflicts..."

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_warning "Port 3000 is in use"
    print_status "Process using port 3000:"
    lsof -Pi :3000 -sTCP:LISTEN
    print_error "Cannot start MonsterBox - port 3000 is occupied"
    exit 1
else
    print_success "Port 3000 is available"
fi

echo ""

# Step 8: Display system status summary
print_header "System Status Summary"

echo "Audio Services:"
systemctl --user is-active --quiet pipewire && echo "  ✅ PipeWire: Running" || echo "  ❌ PipeWire: Not running"
systemctl --user is-active --quiet pipewire-pulse && echo "  ✅ PipeWire-Pulse: Running" || echo "  ❌ PipeWire-Pulse: Not running"
systemctl --user is-active --quiet wireplumber && echo "  ✅ WirePlumber: Running" || echo "  ❌ WirePlumber: Not running"

echo ""
echo "Video Services:"
systemctl is-active --quiet mjpg-streamer && echo "  ✅ mjpg-streamer: Running" || echo "  ❌ mjpg-streamer: Not running"

echo ""
echo "Network:"
echo "  ✅ Port 3000: Available"

echo ""

# Step 9: Start MonsterBox
print_header "Starting MonsterBox 5.5"

print_status "Starting server on port 3000..."
echo ""
echo "Press Ctrl+C to stop MonsterBox"
echo ""

# Ensure real hardware is enabled and test mode is not accidentally inherited
unset MB_TEST_MODE
export MONSTERBOX_HARDWARE_AVAILABLE=1

# Start the server
exec node server.js

