#!/bin/bash
# MonsterBox mjpg-streamer System Service Setup Script
# Creates and configures mjpg-streamer as a systemd service

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    print_error "Please run as root (use sudo bash setup-mjpg-streamer-service.sh)"
    exit 1
fi

print_status "Setting up mjpg-streamer system service for MonsterBox..."

# Verify mjpg_streamer is installed
if ! command -v mjpg_streamer &> /dev/null; then
    print_error "mjpg_streamer is not installed. Please install it first."
    exit 1
fi

print_success "mjpg_streamer found at $(which mjpg_streamer)"

# Stop any existing mjpg_streamer processes
print_status "Stopping any existing mjpg_streamer processes..."
pkill -f mjpg_streamer || true

# Create systemd service file
print_status "Creating systemd service file..."
cat > /etc/systemd/system/mjpg-streamer.service << 'EOF'
[Unit]
Description=MJPG Streamer for MonsterBox
Documentation=https://github.com/jacksonliam/mjpg-streamer
After=network.target
Wants=network.target

[Service]
Type=simple
User=remote
Group=video
WorkingDirectory=/tmp
ExecStartPre=/bin/sleep 5
ExecStart=/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 640x480 -f 15 -q 85" -o "output_http.so -p 8090 -w /usr/local/share/mjpg-streamer/www"
ExecStop=/bin/kill -TERM $MAINPID
Restart=always
RestartSec=10
TimeoutStartSec=30
TimeoutStopSec=10
Environment=HOME=/home/remote
Environment=PATH=/usr/local/bin:/usr/bin:/bin

# Security settings
NoNewPrivileges=true
PrivateTmp=false
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/tmp

# Resource limits
LimitNOFILE=1024
MemoryMax=256M

[Install]
WantedBy=multi-user.target
EOF

print_success "Systemd service file created"

# Ensure remote user is in video group
print_status "Adding remote user to video group..."
usermod -a -G video remote

# Set proper permissions for video devices
print_status "Setting video device permissions..."
chmod 666 /dev/video* 2>/dev/null || true

# Reload systemd and enable service
print_status "Reloading systemd daemon..."
systemctl daemon-reload

print_status "Enabling mjpg-streamer service..."
systemctl enable mjpg-streamer

# Start the service
print_status "Starting mjpg-streamer service..."
systemctl start mjpg-streamer

# Wait a moment for service to start
sleep 3

# Check service status
if systemctl is-active --quiet mjpg-streamer; then
    print_success "mjpg-streamer service is running"
    
    # Test the stream endpoint
    print_status "Testing stream endpoint..."
    if curl -s --max-time 5 -I http://localhost:8090/?action=stream | grep -q "multipart/x-mixed-replace"; then
        print_success "Stream endpoint is responding correctly"
    else
        print_warning "Stream endpoint test failed - service may still be starting"
    fi
    
    # Show service status
    print_status "Service status:"
    systemctl status mjpg-streamer --no-pager -l
    
else
    print_error "Failed to start mjpg-streamer service"
    print_status "Service logs:"
    journalctl -u mjpg-streamer --no-pager -l
    exit 1
fi

print_success "mjpg-streamer system service setup complete!"
echo ""
print_status "Service Information:"
echo "  - Service name: mjpg-streamer"
echo "  - Stream URL: http://localhost:8090/?action=stream"
echo "  - Web interface: http://localhost:8090/"
echo "  - Status: systemctl status mjpg-streamer"
echo "  - Logs: journalctl -u mjpg-streamer -f"
echo "  - Restart: sudo systemctl restart mjpg-streamer"
echo ""
print_status "The service will automatically start on boot and restart on failure."
