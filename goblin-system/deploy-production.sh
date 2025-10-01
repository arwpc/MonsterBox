#!/bin/bash

# MonsterBox Goblin Production Deployment Script
# Deploys goblin system to make it production-ready like MonsterBox 5.0 Gold
# Auto-starts on boot, auto-registers with MonsterBox, plug-and-play ready

set -e  # Exit on any error

# Color output functions
print_status() {
    echo -e "\e[1;34m>>> $1\e[0m"
}

print_error() {
    echo -e "\e[1;31m>>> Error: $1\e[0m"
}

print_success() {
    echo -e "\e[1;32m>>> Success: $1\e[0m"
}

print_warning() {
    echo -e "\e[1;33m>>> Warning: $1\e[0m"
}

# Configuration - Auto-detect or use environment variables
GOBLIN_ID="${GOBLIN_ID:-$(hostname)}"
GOBLIN_PORT="${GOBLIN_PORT:-3001}"
GOBLIN_DIR="${GOBLIN_DIR:-$HOME/goblin}"
MEDIA_DIR="$GOBLIN_DIR/media"
USB_MOUNT_POINT="${USB_MOUNT_POINT:-/media/usb}"
MONSTERBOX_HOST="${MONSTERBOX_HOST:-192.168.8.200}"

print_status "🎃 MonsterBox Goblin Production Deployment"
print_status "==========================================="
print_status "Goblin ID: $GOBLIN_ID"
print_status "Port: $GOBLIN_PORT"
print_status "Directory: $GOBLIN_DIR"
print_status "MonsterBox Host: $MONSTERBOX_HOST"
echo ""

# 1. Check prerequisites
print_status "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

NODE_VERSION=$(node --version)
print_success "Node.js found: $NODE_VERSION"

# 2. Create directory structure
print_status "Creating directory structure..."
mkdir -p "$GOBLIN_DIR"
mkdir -p "$MEDIA_DIR/video"
mkdir -p "$MEDIA_DIR/audio"
mkdir -p "$GOBLIN_DIR/logs"
mkdir -p "$GOBLIN_DIR/config"
print_success "Directory structure created"

# 3. Copy Goblin system files
print_status "Copying Goblin system files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -d "$SCRIPT_DIR/src" ]; then
    cp -r "$SCRIPT_DIR/src/"* "$GOBLIN_DIR/"
    print_success "Goblin system files copied"
else
    print_error "Source files not found in $SCRIPT_DIR/src"
    exit 1
fi

# 4. Copy package.json
if [ -f "$SCRIPT_DIR/package.json" ]; then
    cp "$SCRIPT_DIR/package.json" "$GOBLIN_DIR/"
    print_success "package.json copied"
else
    print_error "package.json not found"
    exit 1
fi

# 5. Install Node.js dependencies
print_status "Installing Node.js dependencies..."
cd "$GOBLIN_DIR"
npm install --production --quiet
print_success "Dependencies installed"

# 6. Create configuration file
print_status "Creating Goblin configuration..."
CURRENT_IP=$(hostname -I | awk '{print $1}')

cat > "$GOBLIN_DIR/config/goblin.json" << EOF
{
  "goblinId": "$GOBLIN_ID",
  "version": "1.0.0",
  "deployment": {
    "timestamp": "$(date -Iseconds)",
    "deployedBy": "$USER",
    "hostname": "$(hostname)",
    "ip": "$CURRENT_IP"
  },
  "settings": {
    "port": $GOBLIN_PORT,
    "autoStart": true,
    "autoRegister": true,
    "scanFrequency": 10000,
    "maxVideoResolution": "1080p",
    "audioOutput": "HDMI",
    "monsterboxHost": "$MONSTERBOX_HOST",
    "mediaDir": "$MEDIA_DIR",
    "usbMountPoint": "$USB_MOUNT_POINT"
  }
}
EOF

print_success "Configuration written to $GOBLIN_DIR/config/goblin.json"

# 7. Setup USB auto-mount (if USB stick is present)
print_status "Checking for USB media..."
if [ -d "$USB_MOUNT_POINT" ] && [ "$(ls -A $USB_MOUNT_POINT 2>/dev/null)" ]; then
    VIDEO_COUNT=$(find "$USB_MOUNT_POINT" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null | wc -l)
    print_success "Found $VIDEO_COUNT video files on USB"
    
    # Create symlink to USB videos
    if [ ! -L "$MEDIA_DIR/usb-videos" ]; then
        ln -s "$USB_MOUNT_POINT" "$MEDIA_DIR/usb-videos"
        print_success "Created symlink to USB videos"
    fi
else
    print_warning "No USB media found at $USB_MOUNT_POINT"
fi

# 8. Configure audio output (HDMI by default)
print_status "Configuring audio output..."
if command -v amixer &> /dev/null; then
    amixer cset numid=3 2 &> /dev/null || true  # 2 = HDMI
    print_success "Audio output set to HDMI"
else
    print_warning "amixer not found, skipping audio configuration"
fi

# 9. Create systemd service for auto-start
print_status "Creating systemd service for auto-start on boot..."
sudo tee /etc/systemd/system/goblin.service > /dev/null << EOF
[Unit]
Description=MonsterBox Goblin Media Player - Production
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$GOBLIN_DIR
Environment="GOBLIN_ID=$GOBLIN_ID"
Environment="GOBLIN_PORT=$GOBLIN_PORT"
Environment="NODE_ENV=production"
Environment="MONSTERBOX_HOST=$MONSTERBOX_HOST"
ExecStart=/usr/bin/node $GOBLIN_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=append:$GOBLIN_DIR/logs/goblin.log
StandardError=append:$GOBLIN_DIR/logs/goblin-error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# 10. Enable and start the service
print_status "Enabling and starting Goblin service..."
sudo systemctl daemon-reload
sudo systemctl enable goblin.service
sudo systemctl restart goblin.service

# Wait for service to start
sleep 3

# 11. Check service status
if sudo systemctl is-active --quiet goblin.service; then
    print_success "Goblin service is running!"
else
    print_error "Goblin service failed to start"
    print_status "Checking logs..."
    sudo journalctl -u goblin.service -n 20 --no-pager
    exit 1
fi

# 12. Display service information
print_success "🎉 Goblin Production Deployment Complete!"
echo ""
echo "📋 Configuration Summary:"
echo "  - Goblin ID: $GOBLIN_ID"
echo "  - Hostname: $(hostname)"
echo "  - IP Address: $CURRENT_IP"
echo "  - Port: $GOBLIN_PORT"
echo "  - Endpoint: http://$CURRENT_IP:$GOBLIN_PORT"
echo "  - Goblin Directory: $GOBLIN_DIR"
echo "  - Media Directory: $MEDIA_DIR"
echo "  - MonsterBox Host: $MONSTERBOX_HOST"
echo ""
echo "🔧 Service Management:"
echo "  - Status: sudo systemctl status goblin"
echo "  - Restart: sudo systemctl restart goblin"
echo "  - Stop: sudo systemctl stop goblin"
echo "  - Logs: sudo journalctl -u goblin -f"
echo "  - Log file: tail -f $GOBLIN_DIR/logs/goblin.log"
echo ""
echo "🎬 Production Features:"
echo "  ✅ Auto-starts on boot"
echo "  ✅ Auto-registers with MonsterBox"
echo "  ✅ Auto-reconnects on network issues"
echo "  ✅ Plug-and-play ready"
echo "  ✅ Production logging enabled"
echo ""
echo "🔍 The Goblin will automatically:"
echo "  1. Start when the system boots"
echo "  2. Scan the network for MonsterBox"
echo "  3. Register itself with MonsterBox"
echo "  4. Wait for video playback commands"
echo ""
echo "🎃 Your Goblin is now production-ready like MonsterBox 5.0 Gold!"

