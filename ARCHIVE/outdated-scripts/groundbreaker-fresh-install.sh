#!/bin/bash

# GroundBreaker Fresh Installation Script
# Complete fresh install for GroundBreaker (Character ID 5, IP 192.168.8.200)
# Run this script directly on GroundBreaker: bash scripts/groundbreaker-fresh-install.sh
#
# This script performs:
# 1. OS-level setup (if needed)
# 2. MonsterBox application setup
# 3. Hardware configuration (BTS7960 motor, webcam, USB speaker)
# 4. Service configuration
# 5. AI/TTS testing

set -e  # Exit on any error

# Color output functions
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}>>> $1${NC}"
}

print_error() {
    echo -e "${RED}>>> Error: $1${NC}"
}

print_success() {
    echo -e "${GREEN}>>> Success: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}>>> Warning: $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Get current user and directory
CURRENT_USER=$(whoami)
CURRENT_DIR=$(pwd)
CHARACTER_ID=5
CHARACTER_NAME="Groundbreaker"

print_header "GroundBreaker Fresh Installation"
print_status "User: $CURRENT_USER"
print_status "Directory: $CURRENT_DIR"
print_status "Character: $CHARACTER_NAME (ID: $CHARACTER_ID)"
echo ""

# Check if we're in MonsterBox directory
if [ ! -f "package.json" ] || [ ! -f "server.js" ]; then
    print_error "This doesn't appear to be a MonsterBox directory"
    print_error "Please navigate to ~/MonsterBox and run this script again"
    exit 1
fi

# ============================================================================
# STEP 1: System Dependencies Check
# ============================================================================
print_header "Step 1: Checking System Dependencies"

# Check Node.js
if command -v node >/dev/null 2>&1; then
    NODE_VERSION=$(node --version)
    print_success "Node.js installed: $NODE_VERSION"
else
    print_error "Node.js not installed. Please run install.sh first"
    exit 1
fi

# Check Python
if command -v python3 >/dev/null 2>&1; then
    PYTHON_VERSION=$(python3 --version)
    print_success "Python installed: $PYTHON_VERSION"
else
    print_error "Python not installed. Please run install.sh first"
    exit 1
fi

# Check pigpiod
if command -v pigpiod >/dev/null 2>&1; then
    print_success "pigpiod installed"
    # Start pigpiod if not running
    if ! pgrep -x "pigpiod" > /dev/null; then
        print_status "Starting pigpiod..."
        sudo pigpiod
        sleep 1
        print_success "pigpiod started"
    else
        print_success "pigpiod already running"
    fi
else
    print_warning "pigpiod not installed. Motor control may not work"
fi

# Check MJPG-Streamer
if command -v mjpg_streamer >/dev/null 2>&1; then
    print_success "MJPG-Streamer installed"
else
    print_warning "MJPG-Streamer not installed. Webcam streaming may not work"
fi

echo ""

# ============================================================================
# STEP 2: Kill Old MonsterBox Instances
# ============================================================================
print_header "Step 2: Cleaning Up Old Instances"

print_status "Stopping old MonsterBox processes..."
pkill -f 'node.*server.js' || true
pkill -f 'npm.*start' || true
sleep 2
print_success "Old processes stopped"

echo ""

# ============================================================================
# STEP 3: Update Code from GitHub
# ============================================================================
print_header "Step 3: Updating Code from GitHub"

print_status "Fetching latest code..."
git fetch origin main

print_status "Current commit:"
git log --oneline -1

print_status "Pulling latest changes..."
git pull origin main

print_status "New commit:"
git log --oneline -1

print_success "Code updated"

echo ""

# ============================================================================
# STEP 4: Install Dependencies
# ============================================================================
print_header "Step 4: Installing Dependencies"

print_status "Installing Node.js dependencies..."
npm install
print_success "Node.js dependencies installed"

print_status "Installing Python dependencies..."
if [ -f "utils/requirements.txt" ]; then
    python3 -m pip install --user -r utils/requirements.txt
else
    python3 -m pip install --user websockets pyaudio opencv-python pyserial
fi
print_success "Python dependencies installed"

# Set Python wrapper permissions
chmod +x python_wrappers/*.py 2>/dev/null || true

echo ""

# ============================================================================
# STEP 5: Hardware Configuration
# ============================================================================
print_header "Step 5: Configuring Hardware"

# Check GPIO access
if [ -c "/dev/gpiomem" ]; then
    print_success "GPIO device accessible"
else
    print_warning "GPIO device not found"
fi

# Check webcam
if [ -c "/dev/video0" ]; then
    print_success "Webcam device accessible (/dev/video0)"
else
    print_warning "Webcam device not found at /dev/video0"
fi

# Check I2C (for potential future servo use)
if [ -c "/dev/i2c-1" ]; then
    print_success "I2C device accessible"
else
    print_warning "I2C device not found"
fi

# Verify GroundBreaker parts configuration
PARTS_FILE="data/character-5/parts.json"
if [ -f "$PARTS_FILE" ]; then
    print_success "Parts configuration found: $PARTS_FILE"
    print_status "Parts configured:"
    cat "$PARTS_FILE" | python3 -m json.tool | grep -E '"name"|"type"' | head -10
else
    print_warning "Parts configuration not found: $PARTS_FILE"
fi

echo ""

# ============================================================================
# STEP 6: Audio Configuration
# ============================================================================
print_header "Step 6: Configuring Audio System"

# Check PipeWire/WirePlumber
if systemctl --user is-active --quiet pipewire; then
    print_success "PipeWire is running"
else
    print_warning "PipeWire is not running, attempting to start..."
    systemctl --user start pipewire || print_error "Failed to start PipeWire"
fi

if systemctl --user is-active --quiet wireplumber; then
    print_success "WirePlumber is running"
else
    print_warning "WirePlumber is not running, attempting to start..."
    systemctl --user start wireplumber || print_error "Failed to start WirePlumber"
fi

# List audio devices
print_status "Available audio devices:"
aplay -l 2>/dev/null | grep -E "card|device" || print_warning "Could not list audio devices"

echo ""

# ============================================================================
# STEP 7: Service Configuration
# ============================================================================
print_header "Step 7: Configuring Services"

# Start MJPG-Streamer if installed
if command -v mjpg_streamer >/dev/null 2>&1; then
    if systemctl is-active --quiet mjpg-streamer; then
        print_success "MJPG-Streamer service running"
    else
        print_status "Starting MJPG-Streamer..."
        sudo systemctl start mjpg-streamer || print_warning "Failed to start MJPG-Streamer"
    fi
fi

# Ensure pigpiod is enabled
if command -v pigpiod >/dev/null 2>&1; then
    sudo systemctl enable pigpiod 2>/dev/null || true
    if ! pgrep -x "pigpiod" > /dev/null; then
        sudo pigpiod
    fi
    print_success "pigpiod service configured"
fi

echo ""

# ============================================================================
# STEP 8: Start MonsterBox
# ============================================================================
print_header "Step 8: Starting MonsterBox"

print_status "Starting MonsterBox server..."
nohup npm start > /tmp/monsterbox.log 2>&1 &
MONSTERBOX_PID=$!

print_status "Waiting for server to start..."
sleep 5

# Check if server is running
if pgrep -f 'node.*server.js' > /dev/null; then
    print_success "MonsterBox server started (PID: $MONSTERBOX_PID)"
else
    print_error "MonsterBox failed to start. Check logs: tail -50 /tmp/monsterbox.log"
    exit 1
fi

# Wait a bit more for full initialization
sleep 3

# Test server response
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    print_success "MonsterBox web interface is accessible"
else
    print_warning "MonsterBox web interface may not be fully ready yet"
fi

echo ""

print_header "Installation Complete!"
print_success "GroundBreaker is now running MonsterBox 5.2"
print_status "Web Interface: http://192.168.8.200:3000"
print_status "Character: $CHARACTER_NAME (ID: $CHARACTER_ID)"
echo ""
print_status "Next Steps:"
echo "  1. Test TTS: curl -X POST http://localhost:3000/api/elevenlabs/generate-and-play -H 'Content-Type: application/json' -d '{\"text\":\"Hello, I am GroundBreaker\",\"characterId\":5}'"
echo "  2. Test motor: Visit http://192.168.8.200:3000/setup/calibration"
echo "  3. Test webcam: Visit http://192.168.8.200:3000/setup/webcam"
echo "  4. Test AI conversation: Visit http://192.168.8.200:3000/conversation"
echo ""
print_status "Logs: tail -f /tmp/monsterbox.log"
echo ""

