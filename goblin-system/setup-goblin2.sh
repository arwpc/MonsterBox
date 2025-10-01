#!/bin/bash

# MonsterBox Goblin-2 Setup Script
# For Raspberry Pi 5 with USB stick containing videos
# Target: goblin2 @ 192.168.8.155

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

# Configuration
GOBLIN_ID="goblin2"
GOBLIN_PORT=3001
GOBLIN_DIR="$HOME/goblin"
MEDIA_DIR="$GOBLIN_DIR/media"
USB_MOUNT_POINT="/media/usb"
MONSTERBOX_HOST="192.168.8.200"

print_status "🎃 Setting up Goblin-2 on $(hostname)"
print_status "Target IP: 192.168.8.155"
print_status "Goblin ID: $GOBLIN_ID"

# 1. Update system
print_status "Updating system packages..."
sudo apt-get update -qq

# 2. Install required packages
print_status "Installing required packages..."
sudo apt-get install -y mpv ffmpeg nodejs npm git

# 3. Create goblin directory structure
print_status "Creating directory structure..."
mkdir -p "$GOBLIN_DIR"
mkdir -p "$MEDIA_DIR/video"
mkdir -p "$MEDIA_DIR/audio"
mkdir -p "$GOBLIN_DIR/logs"

# 4. Mount USB stick
print_status "Setting up USB mount..."
sudo mkdir -p "$USB_MOUNT_POINT"

# Find USB device
USB_DEVICE=$(lsblk -l | grep -E '^sd[a-z]1' | head -1 | awk '{print $1}')
if [ -n "$USB_DEVICE" ]; then
    print_status "Found USB device: /dev/$USB_DEVICE"
    
    # Mount USB
    if ! mountpoint -q "$USB_MOUNT_POINT"; then
        sudo mount "/dev/$USB_DEVICE" "$USB_MOUNT_POINT"
        print_success "USB mounted at $USB_MOUNT_POINT"
    else
        print_success "USB already mounted at $USB_MOUNT_POINT"
    fi
    
    # Add to fstab for auto-mount
    if ! grep -q "$USB_MOUNT_POINT" /etc/fstab; then
        echo "/dev/$USB_DEVICE $USB_MOUNT_POINT vfat defaults,nofail 0 0" | sudo tee -a /etc/fstab
        print_success "Added USB to fstab for auto-mount"
    fi
    
    # Check for videos
    VIDEO_COUNT=$(find "$USB_MOUNT_POINT" -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.avi" \) 2>/dev/null | wc -l)
    print_status "Found $VIDEO_COUNT video files on USB"
else
    print_warning "No USB device found - videos will need to be added manually"
fi

# 5. Configure HDMI output for Pi 5
print_status "Configuring HDMI output..."
sudo tee -a /boot/firmware/config.txt > /dev/null << 'EOF'

# Goblin-2 HDMI Configuration (Pi 5)
hdmi_force_hotplug=1
hdmi_drive=2
hdmi_group=1
hdmi_mode=16
gpu_mem=256
EOF

print_success "HDMI configuration added"

# 6. Create systemd service
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/goblin.service > /dev/null << EOF
[Unit]
Description=MonsterBox Goblin Service
After=network.target

[Service]
Type=simple
User=remote
WorkingDirectory=$GOBLIN_DIR
ExecStart=/usr/bin/node $GOBLIN_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=append:$GOBLIN_DIR/logs/goblin.log
StandardError=append:$GOBLIN_DIR/logs/goblin.log
Environment="NODE_ENV=production"
Environment="GOBLIN_ID=$GOBLIN_ID"
Environment="PORT=$GOBLIN_PORT"
Environment="MONSTERBOX_HOST=$MONSTERBOX_HOST"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable goblin
print_success "Systemd service created and enabled"

# 7. Summary
print_success "🎉 Goblin-2 setup complete!"
echo ""
echo "📋 Configuration Summary:"
echo "  - Hostname: goblin2"
echo "  - IP: 192.168.8.155"
echo "  - Port: $GOBLIN_PORT"
echo "  - Goblin Directory: $GOBLIN_DIR"
echo "  - USB Mount: $USB_MOUNT_POINT"
echo "  - Videos Found: $VIDEO_COUNT"
echo ""
echo "📝 Next Steps:"
echo "  1. Deploy goblin system files to $GOBLIN_DIR"
echo "  2. Start service: sudo systemctl start goblin"
echo "  3. Check status: sudo systemctl status goblin"
echo "  4. View logs: tail -f $GOBLIN_DIR/logs/goblin.log"
echo "  5. Register with MonsterBox at $MONSTERBOX_HOST:3000"
echo ""
echo "🔧 Useful Commands:"
echo "  - Restart: sudo systemctl restart goblin"
echo "  - Stop: sudo systemctl stop goblin"
echo "  - Logs: journalctl -u goblin -f"
echo "  - Test video: curl http://localhost:$GOBLIN_PORT/health"

