#!/bin/bash
# Complete installation script for mjpg-streamer integration with MonsterBox

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
    print_error "Please run as root (use sudo bash install-mjpg-streamer-integration.sh)"
    exit 1
fi

print_status "Installing mjpg-streamer integration for MonsterBox..."

# Step 1: Install mjpg-streamer if not already installed
print_status "Step 1: Checking mjpg-streamer installation..."
if ! command -v mjpg_streamer &> /dev/null; then
    print_status "mjpg-streamer not found. Installing from source..."
    
    # Install build dependencies
    apt update
    apt install -y build-essential cmake git libjpeg-dev libv4l-dev pkg-config
    
    # Build and install mjpg-streamer
    cd /tmp
    rm -rf mjpg-streamer
    git clone https://github.com/jacksonliam/mjpg-streamer.git
    cd mjpg-streamer/mjpg-streamer-experimental
    make clean all
    make install
    
    print_success "mjpg-streamer installed successfully"
else
    print_success "mjpg-streamer is already installed"
fi

# Step 2: Setup systemd service
print_status "Step 2: Setting up mjpg-streamer systemd service..."

# Stop any existing processes
pkill -f mjpg_streamer || true

# Create systemd service file
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
PrivateTmp=true
#ProtectSystem=strict
#ProtectHome=true
ReadWritePaths=/tmp

# Resource limits
LimitNOFILE=1024
MemoryMax=256M

[Install]
WantedBy=multi-user.target
EOF

print_success "Systemd service file created"

# Step 3: Configure permissions and users
print_status "Step 3: Configuring permissions..."

# Ensure remote user exists and is in video group
if id "remote" &>/dev/null; then
    usermod -a -G video remote
    print_success "Added remote user to video group"
else
    print_warning "User 'remote' not found. Please ensure the correct user is configured."
fi

# Set video device permissions
chmod 666 /dev/video* 2>/dev/null || true

# Step 4: Enable and start service
print_status "Step 4: Enabling and starting mjpg-streamer service..."

systemctl daemon-reload
systemctl enable mjpg-streamer
systemctl start mjpg-streamer

# Wait for service to start
sleep 5

# Step 5: Verify installation
print_status "Step 5: Verifying installation..."

if systemctl is-active --quiet mjpg-streamer; then
    print_success "mjpg-streamer service is running"
    
    # Test HTTP endpoint
    if curl -s --max-time 5 -I http://localhost:8090/ | grep -q "200 OK"; then
        print_success "HTTP endpoint is responding"
    else
        print_warning "HTTP endpoint test failed"
    fi
    
    # Test stream endpoint
    if curl -s --max-time 5 -I http://localhost:8090/?action=stream | grep -q "multipart"; then
        print_success "Stream endpoint is working"
    else
        print_warning "Stream endpoint test failed"
    fi
    
else
    print_error "mjpg-streamer service failed to start"
    print_status "Service logs:"
    journalctl -u mjpg-streamer --no-pager -n 20
    exit 1
fi

# Step 6: Create helper scripts
print_status "Step 6: Creating helper scripts..."

# Create restart script
cat > /home/remote/restart-mjpg-streamer.sh << 'EOF'
#!/bin/bash
echo "Restarting mjpg-streamer service..."
sudo systemctl restart mjpg-streamer
sleep 3
if systemctl is-active --quiet mjpg-streamer; then
    echo "✅ mjpg-streamer service restarted successfully"
    echo "🎥 Stream URL: http://localhost:8090/?action=stream"
else
    echo "❌ Failed to restart mjpg-streamer service"
    sudo journalctl -u mjpg-streamer --no-pager -n 10
fi
EOF

chmod +x /home/remote/restart-mjpg-streamer.sh
chown remote:remote /home/remote/restart-mjpg-streamer.sh

print_success "Helper scripts created"

print_success "mjpg-streamer integration installation completed!"
echo ""
print_status "Installation Summary:"
echo "  ✅ mjpg-streamer installed and configured"
echo "  ✅ Systemd service created and enabled"
echo "  ✅ Service running on port 8090"
echo "  ✅ Auto-start on boot enabled"
echo "  ✅ Helper scripts created"
echo ""
print_status "Service Information:"
echo "  - Stream URL: http://localhost:8090/?action=stream"
echo "  - Web interface: http://localhost:8090/"
echo "  - Service status: systemctl status mjpg-streamer"
echo "  - Service logs: journalctl -u mjpg-streamer -f"
echo "  - Restart service: sudo systemctl restart mjpg-streamer"
echo "  - Quick restart: ~/restart-mjpg-streamer.sh"
echo ""
print_status "Next Steps:"
echo "  1. Test the integration: bash scripts/test-mjpg-integration.sh"
echo "  2. Start MonsterBox: npm start"
echo "  3. Test webcam in MonsterBox: http://localhost:3000/setup/webcam"
echo "  4. Create a webcam part and verify streaming works"
echo ""
print_status "The mjpg-streamer service will automatically start on boot and restart on failure."
