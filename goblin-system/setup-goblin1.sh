#!/bin/bash

# MonsterBox Goblin-1 Setup Script
# For Raspberry Pi with USB stick containing videos
# Target: goblin1 @ 192.168.8.160

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
GOBLIN_ID="goblin1"
GOBLIN_PORT=3001
GOBLIN_DIR="$HOME/goblin"
MEDIA_DIR="$GOBLIN_DIR/media"
USB_MOUNT_POINT="/media/usb"
MONSTERBOX_HOST="192.168.8.1"  # Update with actual MonsterBox IP

print_status "🎃 Setting up Goblin-1 on $(hostname)"
print_status "Target IP: 192.168.8.160"
print_status "Goblin ID: $GOBLIN_ID"

# 1. Check if running on correct hostname
CURRENT_HOSTNAME=$(hostname)
if [ "$CURRENT_HOSTNAME" != "goblin1" ]; then
    print_warning "Current hostname is '$CURRENT_HOSTNAME', expected 'goblin1'"
    print_status "Setting hostname to goblin1..."
    echo "goblin1" | sudo tee /etc/hostname > /dev/null
    sudo sed -i "s/127.0.1.1.*/127.0.1.1\tgoblin1/" /etc/hosts
    print_success "Hostname set to goblin1 (reboot required to take effect)"
fi

# 2. Check network configuration
print_status "Checking network configuration..."
CURRENT_IP=$(hostname -I | awk '{print $1}')
print_status "Current IP: $CURRENT_IP"

if [ "$CURRENT_IP" != "192.168.8.160" ]; then
    print_warning "IP address is $CURRENT_IP, expected 192.168.8.160"
    print_status "Please configure static IP in /etc/dhcpcd.conf or via router DHCP reservation"
fi

# 3. Update system packages
print_status "Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# 4. Install required dependencies
print_status "Installing dependencies..."
sudo apt-get install -y \
    vlc \
    ffmpeg \
    alsa-utils \
    v4l-utils \
    curl \
    git

# Check if Node.js and npm are already installed
print_status "Checking Node.js and npm..."
if command -v node &> /dev/null && command -v npm &> /dev/null; then
    print_success "Node.js $(node --version) and npm $(npm --version) already installed"
else
    print_warning "Node.js or npm not found. Please install Node.js 18+ manually."
fi

# Verify installations
print_status "Verifying installations..."
vlc --version | head -1
ffmpeg -version | head -1
node --version
npm --version

# 5. Create Goblin directory structure
print_status "Creating Goblin directory structure..."
mkdir -p "$GOBLIN_DIR"
mkdir -p "$MEDIA_DIR/video"
mkdir -p "$MEDIA_DIR/audio"
mkdir -p "$GOBLIN_DIR/config"
mkdir -p "$GOBLIN_DIR/logs"

# 6. Find and mount USB stick
print_status "Looking for USB stick with videos..."

# Find USB devices (use -l for list format to avoid tree characters)
USB_DEVICES=$(lsblk -l -o NAME,TYPE,SIZE,MOUNTPOINT | grep "part" | grep "sda" || true)

if [ -z "$USB_DEVICES" ]; then
    print_warning "No USB devices found. Please plug in USB stick and run this script again."
else
    print_status "Found USB devices:"
    echo "$USB_DEVICES"

    # Try to find the USB stick (usually /dev/sda1)
    USB_DEVICE=$(lsblk -l -o NAME,TYPE | grep "part" | grep "sda" | head -1 | awk '{print "/dev/"$1}')

    if [ -n "$USB_DEVICE" ]; then
        print_status "Using USB device: $USB_DEVICE"
        
        # Create mount point
        sudo mkdir -p "$USB_MOUNT_POINT"
        
        # Check if already mounted
        if mountpoint -q "$USB_MOUNT_POINT"; then
            print_success "USB stick already mounted at $USB_MOUNT_POINT"
        else
            # Try to mount
            print_status "Mounting USB stick..."
            sudo mount "$USB_DEVICE" "$USB_MOUNT_POINT" || {
                print_error "Failed to mount USB stick"
                print_status "Trying with different filesystem types..."
                sudo mount -t vfat "$USB_DEVICE" "$USB_MOUNT_POINT" || \
                sudo mount -t exfat "$USB_DEVICE" "$USB_MOUNT_POINT" || \
                sudo mount -t ntfs "$USB_DEVICE" "$USB_MOUNT_POINT" || {
                    print_error "Could not mount USB stick with any filesystem type"
                    exit 1
                }
            }
            print_success "USB stick mounted at $USB_MOUNT_POINT"
        fi
        
        # List video files on USB
        print_status "Scanning for video files on USB stick..."
        VIDEO_COUNT=$(find "$USB_MOUNT_POINT" -type f \( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" \) 2>/dev/null | wc -l)
        print_success "Found $VIDEO_COUNT video files on USB stick"
        
        # Create symlink to USB videos (don't copy, just link)
        print_status "Creating symlink to USB videos..."
        if [ -L "$MEDIA_DIR/video/usb-videos" ]; then
            rm "$MEDIA_DIR/video/usb-videos"
        fi
        ln -s "$USB_MOUNT_POINT" "$MEDIA_DIR/video/usb-videos"
        print_success "USB videos accessible at: $MEDIA_DIR/video/usb-videos/"
        
        # Add to fstab for auto-mount on boot
        print_status "Configuring auto-mount on boot..."
        if ! grep -q "$USB_DEVICE" /etc/fstab; then
            echo "$USB_DEVICE $USB_MOUNT_POINT auto defaults,nofail,x-systemd.device-timeout=1 0 0" | sudo tee -a /etc/fstab > /dev/null
            print_success "Added USB auto-mount to /etc/fstab"
        else
            print_status "USB auto-mount already configured in /etc/fstab"
        fi
    fi
fi

# 7. Configure HDMI output
print_status "Configuring HDMI output..."

# Force HDMI audio
sudo amixer cset numid=3 2 2>/dev/null || print_warning "Could not set HDMI audio"

# Check GPU memory
GPU_MEM=$(vcgencmd get_mem gpu | cut -d= -f2 | cut -dM -f1)
print_status "Current GPU memory: ${GPU_MEM}M"

if [ "$GPU_MEM" -lt 128 ]; then
    print_warning "GPU memory is ${GPU_MEM}M, recommend 128M+ for smooth video playback"
    print_status "Adding gpu_mem=128 to /boot/config.txt..."
    
    if ! grep -q "^gpu_mem=" /boot/config.txt; then
        echo "gpu_mem=128" | sudo tee -a /boot/config.txt > /dev/null
        print_success "GPU memory set to 128M (reboot required)"
    fi
fi

# Ensure HDMI is forced on
if ! grep -q "^hdmi_force_hotplug=1" /boot/config.txt; then
    echo "hdmi_force_hotplug=1" | sudo tee -a /boot/config.txt > /dev/null
    print_status "Added hdmi_force_hotplug=1 to /boot/config.txt"
fi

if ! grep -q "^hdmi_drive=2" /boot/config.txt; then
    echo "hdmi_drive=2" | sudo tee -a /boot/config.txt > /dev/null
    print_status "Added hdmi_drive=2 to /boot/config.txt"
fi

# 8. Copy Goblin system files
print_status "Installing Goblin system files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp -r "$SCRIPT_DIR/src"/* "$GOBLIN_DIR/"
cp "$SCRIPT_DIR/package.json" "$GOBLIN_DIR/"
cp "$SCRIPT_DIR/package-lock.json" "$GOBLIN_DIR/" 2>/dev/null || true

# 9. Install Node.js dependencies
print_status "Installing Node.js dependencies..."
cd "$GOBLIN_DIR"
npm install --production

# 10. Create configuration file
print_status "Creating Goblin configuration..."
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

# 11. Create systemd service for auto-start
print_status "Creating systemd service..."
sudo tee /etc/systemd/system/goblin.service > /dev/null << EOF
[Unit]
Description=MonsterBox Goblin Media Player
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$GOBLIN_DIR
Environment="GOBLIN_ID=$GOBLIN_ID"
Environment="GOBLIN_PORT=$GOBLIN_PORT"
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node $GOBLIN_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=append:$GOBLIN_DIR/logs/goblin.log
StandardError=append:$GOBLIN_DIR/logs/goblin-error.log

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable goblin.service
print_success "Goblin service created and enabled"

# 12. Test video playback
print_status "Testing video playback capability..."

# Find a test video
TEST_VIDEO=$(find "$USB_MOUNT_POINT" -type f \( -iname "*.mp4" -o -iname "*.avi" \) 2>/dev/null | head -1)

if [ -n "$TEST_VIDEO" ]; then
    print_status "Found test video: $(basename "$TEST_VIDEO")"
    print_status "You can test playback with: vlc --fullscreen --loop \"$TEST_VIDEO\""
else
    print_warning "No test video found on USB stick"
fi

# 13. Display summary
print_success "🎃 Goblin-1 setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Goblin Configuration Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Goblin ID:        $GOBLIN_ID"
echo "  Hostname:         $(hostname)"
echo "  IP Address:       $CURRENT_IP"
echo "  Port:             $GOBLIN_PORT"
echo "  Goblin Directory: $GOBLIN_DIR"
echo "  Media Directory:  $MEDIA_DIR"
echo "  USB Mount Point:  $USB_MOUNT_POINT"
echo "  Video Count:      $VIDEO_COUNT videos"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Start Goblin service:  sudo systemctl start goblin"
echo "  2. Check status:          sudo systemctl status goblin"
echo "  3. View logs:             tail -f $GOBLIN_DIR/logs/goblin.log"
echo "  4. Test API:              curl http://localhost:$GOBLIN_PORT/health"
echo "  5. List videos:           curl http://localhost:$GOBLIN_PORT/media"
echo ""
echo "If you changed hostname or GPU settings, reboot now: sudo reboot"
echo ""

