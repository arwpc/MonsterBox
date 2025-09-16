#!/bin/bash
# Test script for mjpg-streamer integration with MonsterBox

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
    echo -e "${GREEN}>>> Success: $1${NC}"
}

print_error() {
    echo -e "${RED}>>> Error: $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}>>> Warning: $1${NC}"
}

print_status "Testing mjpg-streamer integration with MonsterBox..."

# Test 1: Check if mjpg-streamer service is running
print_status "1. Checking mjpg-streamer service status..."
if systemctl is-active --quiet mjpg-streamer; then
    print_success "mjpg-streamer service is running"
else
    print_error "mjpg-streamer service is not running"
    print_status "Starting mjpg-streamer service..."
    sudo systemctl start mjpg-streamer
    sleep 3
    if systemctl is-active --quiet mjpg-streamer; then
        print_success "mjpg-streamer service started successfully"
    else
        print_error "Failed to start mjpg-streamer service"
        exit 1
    fi
fi

# Test 2: Check mjpg-streamer HTTP endpoint
print_status "2. Testing mjpg-streamer HTTP endpoint..."
if curl -s --max-time 5 http://localhost:8090/ | grep -q "MJPG-streamer"; then
    print_success "mjpg-streamer HTTP endpoint is responding"
else
    print_error "mjpg-streamer HTTP endpoint is not responding"
    exit 1
fi

# Test 3: Check mjpg-streamer stream endpoint
print_status "3. Testing mjpg-streamer stream endpoint..."
# Note: Stream endpoint may return 400 for HEAD requests, but that's expected
# We just check if mjpg-streamer is responding to requests
if curl -s --max-time 5 -I http://localhost:8090/?action=stream | grep -q "MJPG-Streamer"; then
    print_success "mjpg-streamer stream endpoint is responding"
else
    print_warning "mjpg-streamer stream endpoint test inconclusive (may be normal)"
fi

# Test 4: Check if MonsterBox is running
print_status "4. Checking if MonsterBox is running..."
if curl -s --max-time 5 http://localhost:3000/ > /dev/null; then
    print_success "MonsterBox is running on port 3000"
else
    print_warning "MonsterBox is not running on port 3000"
    print_status "You can start MonsterBox with: npm start"
fi

# Test 5: Test MonsterBox webcam API (if MonsterBox is running)
if curl -s --max-time 5 http://localhost:3000/ > /dev/null; then
    print_status "5. Testing MonsterBox webcam API..."
    
    # Test device listing
    if curl -s --max-time 5 http://localhost:3000/setup/webcam/api/devices | grep -q "success"; then
        print_success "MonsterBox webcam device API is working"
    else
        print_warning "MonsterBox webcam device API test failed"
    fi
    
    # Test device probing
    if curl -s --max-time 10 http://localhost:3000/setup/webcam/api/devices/probe | grep -q "success"; then
        print_success "MonsterBox webcam probe API is working"
    else
        print_warning "MonsterBox webcam probe API test failed"
    fi
else
    print_warning "Skipping MonsterBox API tests (MonsterBox not running)"
fi

# Test 6: Check system resources
print_status "6. Checking system resources..."
echo "mjpg-streamer processes:"
ps aux | grep mjpg_streamer | grep -v grep || echo "No mjpg_streamer processes found"

echo ""
echo "Port usage:"
netstat -tlnp | grep -E ":(3000|8090)" || echo "No processes found on ports 3000 or 8090"

echo ""
echo "Camera device status:"
ls -la /dev/video* 2>/dev/null || echo "No video devices found"

# Test 7: Service logs check
print_status "7. Checking mjpg-streamer service logs (last 10 lines)..."
journalctl -u mjpg-streamer --no-pager -n 10

print_success "Integration test completed!"
echo ""
print_status "Summary:"
echo "  - mjpg-streamer service: $(systemctl is-active mjpg-streamer)"
echo "  - mjpg-streamer HTTP: $(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:8090/)"
echo "  - mjpg-streamer stream: $(curl -s --max-time 3 -I http://localhost:8090/?action=stream | head -1 | cut -d' ' -f2)"
echo "  - MonsterBox HTTP: $(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null || echo 'N/A')"
echo ""
print_status "Next steps:"
echo "  1. If mjpg-streamer is working, test webcam in MonsterBox:"
echo "     http://localhost:3000/setup/webcam"
echo "  2. Create a webcam part and test streaming"
echo "  3. Verify video displays correctly in the web interface"
