#!/bin/bash
#
# Deploy Optimized Goblin Video System
# Deploys rock-solid video playback system to Raspberry Pi 3B+
#
# Usage: ./deploy-optimized-goblin.sh <goblin-ip> <goblin-name>
# Example: ./deploy-optimized-goblin.sh 192.168.8.40 goblin-one
#

set -e

GOBLIN_IP="$1"
GOBLIN_NAME="$2"
SSH_USER="remote"
SSH_PASS="klrklr89!"

if [ -z "$GOBLIN_IP" ] || [ -z "$GOBLIN_NAME" ]; then
    echo "Usage: $0 <goblin-ip> <goblin-name>"
    echo "Example: $0 192.168.8.40 goblin-one"
    exit 1
fi

echo "🎃 Deploying Optimized Goblin System"
echo "====================================="
echo "Target: $GOBLIN_NAME ($GOBLIN_IP)"
echo ""

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo "❌ sshpass not found. Installing..."
    sudo apt-get update && sudo apt-get install -y sshpass
fi

# Test connectivity
echo "1. Testing connectivity..."
if ! ping -c 1 -W 2 "$GOBLIN_IP" &> /dev/null; then
    echo "❌ Cannot reach $GOBLIN_IP"
    exit 1
fi
echo "  ✅ Goblin is reachable"
echo ""

# Test SSH
echo "2. Testing SSH access..."
if ! sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$SSH_USER@$GOBLIN_IP" "echo 'SSH OK'" &> /dev/null; then
    echo "❌ Cannot SSH to $GOBLIN_IP"
    exit 1
fi
echo "  ✅ SSH access confirmed"
echo ""

# Create deployment package
echo "3. Creating deployment package..."
TEMP_DIR=$(mktemp -d)
PACKAGE_FILE="$TEMP_DIR/goblin-optimized.tar.gz"

# Copy goblin-system files
cp -r src "$TEMP_DIR/"
cp package.json "$TEMP_DIR/"
cp optimize-pi3-for-video.sh "$TEMP_DIR/"

# Replace mediaPlayer.js with optimized version
cp src/mediaPlayer-optimized.js "$TEMP_DIR/src/mediaPlayer.js"

# Create systemd service file
cat > "$TEMP_DIR/goblin.service" << 'EOF'
[Unit]
Description=Goblin Video Display Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
Environment=NODE_ENV=production
Environment=GOBLIN_ID=GOBLIN_NAME_PLACEHOLDER
Environment=DISPLAY=:0
ExecStart=/usr/bin/node /home/remote/goblin/src/server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/remote/goblin/logs/goblin.log
StandardError=append:/home/remote/goblin/logs/goblin-error.log

[Install]
WantedBy=multi-user.target
EOF

# Replace placeholder with actual goblin name
sed -i "s/GOBLIN_NAME_PLACEHOLDER/$GOBLIN_NAME/" "$TEMP_DIR/goblin.service"

# Create tarball
cd "$TEMP_DIR"
tar czf "$PACKAGE_FILE" .
cd - > /dev/null

echo "  ✅ Package created: $(du -h $PACKAGE_FILE | cut -f1)"
echo ""

# Deploy to Goblin
echo "4. Deploying to Goblin..."
sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no "$PACKAGE_FILE" "$SSH_USER@$GOBLIN_IP:/tmp/goblin-optimized.tar.gz"
echo "  ✅ Package uploaded"
echo ""

# Install on Goblin
echo "5. Installing on Goblin..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
set -e

echo "  📦 Extracting package..."
mkdir -p /home/remote/goblin
cd /home/remote/goblin
tar xzf /tmp/goblin-optimized.tar.gz
rm /tmp/goblin-optimized.tar.gz

echo "  📁 Creating directories..."
mkdir -p logs
mkdir -p media/video
mkdir -p media/audio

echo "  📦 Installing Node.js dependencies..."
npm install --production --silent

echo "  🔧 Installing systemd service..."
sudo cp goblin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable goblin.service

echo "  ✅ Installation complete"
ENDSSH

echo "  ✅ Goblin software installed"
echo ""

# Apply Pi optimizations
echo "6. Applying Pi3 optimizations..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
set -e

cd /home/remote/goblin
chmod +x optimize-pi3-for-video.sh
sudo ./optimize-pi3-for-video.sh

echo "  ✅ Pi3 optimizations applied"
ENDSSH

echo "  ✅ Hardware optimizations complete"
echo ""

# Install mpv if not present
echo "7. Installing video players..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
set -e

# Check for mpv
if ! command -v mpv &> /dev/null; then
    echo "  📦 Installing mpv..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq mpv
    echo "  ✅ mpv installed"
else
    echo "  ✅ mpv already installed"
fi

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "  📦 Installing ffmpeg..."
    sudo apt-get install -y -qq ffmpeg
    echo "  ✅ ffmpeg installed"
else
    echo "  ✅ ffmpeg already installed"
fi
ENDSSH

echo "  ✅ Video players ready"
echo ""

# Clean up
rm -rf "$TEMP_DIR"

echo "✅ DEPLOYMENT COMPLETE"
echo ""
echo "📋 Summary:"
echo "  - Goblin: $GOBLIN_NAME"
echo "  - IP: $GOBLIN_IP"
echo "  - Software: Installed"
echo "  - Service: Enabled (not started)"
echo "  - Pi3 optimizations: Applied"
echo "  - Video players: mpv, ffmpeg"
echo ""
echo "⚠️  REBOOT REQUIRED for Pi3 optimizations to take effect"
echo ""
echo "Next steps:"
echo "  1. Reboot Goblin: sshpass -p '$SSH_PASS' ssh $SSH_USER@$GOBLIN_IP 'sudo reboot'"
echo "  2. Wait 60 seconds for boot"
echo "  3. Check service: sshpass -p '$SSH_PASS' ssh $SSH_USER@$GOBLIN_IP 'sudo systemctl status goblin'"
echo "  4. Check logs: sshpass -p '$SSH_PASS' ssh $SSH_USER@$GOBLIN_IP 'tail -f /home/remote/goblin/logs/goblin.log'"
echo "  5. Test video: curl -X POST http://$GOBLIN_IP:3001/play-video -H 'Content-Type: application/json' -d '{\"filename\":\"test.mp4\",\"loop\":true}'"
echo ""

