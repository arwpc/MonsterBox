#!/bin/bash

# GroundBreaker Hardware Testing Script
# Comprehensive testing of all hardware components
# Run this script on GroundBreaker: bash scripts/test-groundbreaker-hardware.sh

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}>>> $1${NC}"; }
print_error() { echo -e "${RED}>>> Error: $1${NC}"; }
print_success() { echo -e "${GREEN}>>> Success: $1${NC}"; }
print_warning() { echo -e "${YELLOW}>>> Warning: $1${NC}"; }
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

CHARACTER_ID=5
CHARACTER_NAME="Groundbreaker"

print_header "GroundBreaker Hardware Testing Suite"
print_status "Character: $CHARACTER_NAME (ID: $CHARACTER_ID)"
echo ""

# ============================================================================
# Test 1: GPIO Access
# ============================================================================
print_header "Test 1: GPIO Access"

if [ -c "/dev/gpiomem" ]; then
    if [ -r "/dev/gpiomem" ] && [ -w "/dev/gpiomem" ]; then
        print_success "GPIO device accessible with read/write permissions"
    else
        print_warning "GPIO device exists but permissions may be incorrect"
        ls -l /dev/gpiomem
    fi
else
    print_error "GPIO device not found at /dev/gpiomem"
fi

echo ""

# ============================================================================
# Test 2: pigpiod Service
# ============================================================================
print_header "Test 2: pigpiod Service"

if command -v pigpiod >/dev/null 2>&1; then
    print_success "pigpiod is installed"
    
    if pgrep -x "pigpiod" > /dev/null; then
        print_success "pigpiod is running"
        print_status "Process info:"
        ps aux | grep pigpiod | grep -v grep
    else
        print_warning "pigpiod is not running"
        print_status "Starting pigpiod..."
        sudo pigpiod
        sleep 1
        if pgrep -x "pigpiod" > /dev/null; then
            print_success "pigpiod started successfully"
        else
            print_error "Failed to start pigpiod"
        fi
    fi
else
    print_error "pigpiod is not installed"
    print_status "Install with: sudo apt-get install pigpio"
fi

echo ""

# ============================================================================
# Test 3: BTS7960 Motor Driver Configuration
# ============================================================================
print_header "Test 3: BTS7960 Motor Driver"

print_status "GroundBreaker Head Motor Configuration:"
echo "  Control Board: BTS7960"
echo "  Motor Type: Jeep Wagoneer Wiper Motor"
echo "  EN Pin:   GPIO 17 (Pin 11, Brown wire)"
echo "  RPWM Pin: GPIO 27 (Pin 13, Red wire)"
echo "  LPWM Pin: GPIO 22 (Pin 15, Orange wire)"

# Check if motor test script exists
MOTOR_TEST_SCRIPT="python_wrappers/test_groundbreaker_bts7960.py"
if [ -f "$MOTOR_TEST_SCRIPT" ]; then
    print_success "Motor test script found: $MOTOR_TEST_SCRIPT"
    
    print_status "Would you like to test the motor? (y/n)"
    read -t 10 -n 1 RESPONSE || RESPONSE="n"
    echo ""
    
    if [ "$RESPONSE" = "y" ] || [ "$RESPONSE" = "Y" ]; then
        print_status "Running motor test..."
        python3 "$MOTOR_TEST_SCRIPT"
    else
        print_status "Skipping motor test"
    fi
else
    print_warning "Motor test script not found: $MOTOR_TEST_SCRIPT"
fi

# Check parts configuration
PARTS_FILE="data/character-5/parts.json"
if [ -f "$PARTS_FILE" ]; then
    print_status "Checking motor configuration in parts.json..."
    MOTOR_INFO=$(cat "$PARTS_FILE" | python3 -c "
import sys, json
try:
    parts = json.load(sys.stdin)
    motors = [p for p in parts if p.get('type', '').lower() == 'motor']
    if motors:
        for m in motors:
            print(f\"Motor: {m.get('name', 'Unknown')}\")
            print(f\"  Control Board: {m.get('controlBoard', 'Unknown')}\")
            print(f\"  RPWM Pin: {m.get('rpwmPin', 'N/A')}\")
            print(f\"  LPWM Pin: {m.get('lpwmPin', 'N/A')}\")
            print(f\"  EN Pin: {m.get('renPin', 'N/A')}\")
            print(f\"  Enabled: {m.get('enabled', False)}\")
    else:
        print('No motor configured')
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null)
    
    if [ -n "$MOTOR_INFO" ]; then
        echo "$MOTOR_INFO"
    else
        print_warning "Could not parse motor configuration"
    fi
else
    print_warning "Parts file not found: $PARTS_FILE"
fi

echo ""

# ============================================================================
# Test 4: Webcam
# ============================================================================
print_header "Test 4: Webcam"

if [ -c "/dev/video0" ]; then
    print_success "Webcam device found at /dev/video0"
    
    # Check permissions
    if [ -r "/dev/video0" ]; then
        print_success "Webcam device is readable"
    else
        print_warning "Webcam device permissions may be incorrect"
        ls -l /dev/video0
    fi
    
    # Check v4l2 info if available
    if command -v v4l2-ctl >/dev/null 2>&1; then
        print_status "Webcam device info:"
        v4l2-ctl --device=/dev/video0 --info 2>/dev/null || print_warning "Could not get device info"
        
        print_status "Supported formats:"
        v4l2-ctl --device=/dev/video0 --list-formats-ext 2>/dev/null | head -20 || print_warning "Could not list formats"
    else
        print_warning "v4l2-ctl not installed (install with: sudo apt-get install v4l-utils)"
    fi
else
    print_error "Webcam device not found at /dev/video0"
    print_status "Available video devices:"
    ls -l /dev/video* 2>/dev/null || print_warning "No video devices found"
fi

# Check MJPG-Streamer
if command -v mjpg_streamer >/dev/null 2>&1; then
    print_success "MJPG-Streamer is installed"
    
    if systemctl is-active --quiet mjpg-streamer; then
        print_success "MJPG-Streamer service is running"
        print_status "Stream should be available at: http://192.168.8.200:8090/?action=stream"
    else
        print_warning "MJPG-Streamer service is not running"
        print_status "Start with: sudo systemctl start mjpg-streamer"
    fi
else
    print_warning "MJPG-Streamer is not installed"
fi

# Check webcam in parts.json
if [ -f "$PARTS_FILE" ]; then
    print_status "Checking webcam configuration in parts.json..."
    WEBCAM_INFO=$(cat "$PARTS_FILE" | python3 -c "
import sys, json
try:
    parts = json.load(sys.stdin)
    webcams = [p for p in parts if p.get('type', '').lower() == 'webcam']
    if webcams:
        for w in webcams:
            print(f\"Webcam: {w.get('name', 'Unknown')}\")
            print(f\"  Device: {w.get('config', {}).get('devicePath', 'Unknown')}\")
            print(f\"  Enabled: {w.get('enabled', False)}\")
    else:
        print('No webcam configured')
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null)
    
    if [ -n "$WEBCAM_INFO" ]; then
        echo "$WEBCAM_INFO"
    fi
fi

echo ""

# ============================================================================
# Test 5: USB Speaker
# ============================================================================
print_header "Test 5: USB Speaker"

print_status "Checking for USB audio devices..."

# List all audio devices
print_status "All audio playback devices:"
aplay -l 2>/dev/null || print_warning "Could not list audio devices"

# List USB audio devices specifically
print_status "USB audio devices:"
lsusb | grep -i audio || print_warning "No USB audio devices found via lsusb"

# Check ALSA cards
print_status "ALSA sound cards:"
cat /proc/asound/cards 2>/dev/null || print_warning "Could not read /proc/asound/cards"

# Test audio playback
print_status "Testing audio playback..."
if command -v speaker-test >/dev/null 2>&1; then
    print_status "Running 2-second speaker test (you should hear white noise)..."
    timeout 2s speaker-test -t wav -c 2 2>/dev/null || print_warning "Speaker test failed or timed out"
else
    print_warning "speaker-test not available"
fi

echo ""

# ============================================================================
# Test 6: I2C (for potential future use)
# ============================================================================
print_header "Test 6: I2C Interface"

if [ -c "/dev/i2c-1" ]; then
    print_success "I2C device found at /dev/i2c-1"
    
    if command -v i2cdetect >/dev/null 2>&1; then
        print_status "Scanning I2C bus..."
        i2cdetect -y 1 2>/dev/null || print_warning "Could not scan I2C bus"
    else
        print_warning "i2cdetect not installed (install with: sudo apt-get install i2c-tools)"
    fi
else
    print_warning "I2C device not found (not needed for current GroundBreaker setup)"
fi

echo ""

# ============================================================================
# Test 7: Network Connectivity
# ============================================================================
print_header "Test 7: Network Connectivity"

print_status "Network interfaces:"
ip addr show | grep -E "inet |UP" || print_warning "Could not get network info"

print_status "Testing internet connectivity..."
if ping -c 2 8.8.8.8 >/dev/null 2>&1; then
    print_success "Internet connectivity OK"
else
    print_warning "No internet connectivity"
fi

print_status "Testing GitHub connectivity..."
if ping -c 2 github.com >/dev/null 2>&1; then
    print_success "GitHub is reachable"
else
    print_warning "Cannot reach GitHub"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
print_header "Hardware Testing Complete!"

print_status "Summary:"
echo "  ✓ GPIO access checked"
echo "  ✓ pigpiod service verified"
echo "  ✓ BTS7960 motor configuration checked"
echo "  ✓ Webcam device verified"
echo "  ✓ USB speaker checked"
echo "  ✓ I2C interface checked"
echo "  ✓ Network connectivity tested"

echo ""
print_success "Hardware testing completed!"
print_status "Review the output above for any warnings or errors."
echo ""
print_status "Next steps:"
echo "  1. Test TTS: bash scripts/test-groundbreaker-tts.sh"
echo "  2. Test motor via web: http://192.168.8.200:3000/setup/calibration"
echo "  3. Test webcam via web: http://192.168.8.200:3000/setup/webcam"
echo ""

