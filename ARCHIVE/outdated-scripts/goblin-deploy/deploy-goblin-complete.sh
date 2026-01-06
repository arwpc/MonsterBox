#!/bin/bash

# GOBLIN COMPLETE DEPLOYMENT SCRIPT
# This script deploys a fully working, hardened Goblin video display system
# Tested and proven on Goblin Three (192.168.8.14)
#
# Usage: ./deploy-goblin-complete.sh <IP_ADDRESS> <GOBLIN_NAME>
# Example: ./deploy-goblin-complete.sh 192.168.8.14 goblin-three

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GOBLIN_IP="${1}"
GOBLIN_NAME="${2}"
SSH_USER="remote"
SSH_PASS="klrklr89!"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Validate arguments
if [ -z "$GOBLIN_IP" ] || [ -z "$GOBLIN_NAME" ]; then
  echo -e "${RED}❌ Usage: $0 <IP_ADDRESS> <GOBLIN_NAME>${NC}"
  echo "Example: $0 192.168.8.14 goblin-three"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🎃 GOBLIN COMPLETE DEPLOYMENT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Target:${NC} $GOBLIN_NAME ($GOBLIN_IP)"
echo ""

# Step 1: Check connectivity
echo -e "${YELLOW}[1/10] Checking connectivity...${NC}"
if ! ping -c 2 -W 2 "$GOBLIN_IP" &>/dev/null; then
  echo -e "${RED}❌ Cannot reach $GOBLIN_IP${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Goblin is online${NC}"
echo ""

# Step 2: Create deployment package
echo -e "${YELLOW}[2/10] Creating deployment package...${NC}"
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/src"

# Copy source files
cp "$SCRIPT_DIR/src/mediaPlayer-optimized.js" "$TEMP_DIR/src/mediaPlayer.js"
cp "$SCRIPT_DIR/src/server.js" "$TEMP_DIR/src/" 2>/dev/null || true
cp "$SCRIPT_DIR/src/videoQueue.js" "$TEMP_DIR/src/" 2>/dev/null || true
cp "$SCRIPT_DIR/src/statusMonitor.js" "$TEMP_DIR/src/" 2>/dev/null || true
cp "$SCRIPT_DIR/src/fileManager.js" "$TEMP_DIR/src/" 2>/dev/null || true
cp "$SCRIPT_DIR/src/beaconService.js" "$TEMP_DIR/src/" 2>/dev/null || true
cp "$SCRIPT_DIR/package.json" "$TEMP_DIR/"
cp "$SCRIPT_DIR/optimize-pi3-for-video.sh" "$TEMP_DIR/"

# Create hardened systemd service file
cat > "$TEMP_DIR/goblin.service" << 'EOFSERVICE'
[Unit]
Description=MonsterBox Goblin Media Player
Documentation=https://github.com/arwpc/MonsterBox
After=network-online.target systemd-logind.service
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
User=remote
WorkingDirectory=/home/remote/goblin
Environment="GOBLIN_ID=GOBLIN_NAME_PLACEHOLDER"
Environment="GOBLIN_PORT=3001"
Environment="NODE_ENV=production"
Environment="MONSTERBOX_URL=http://192.168.8.140:3000"
Environment="XDG_RUNTIME_DIR=/run/user/1000"
Environment="XDG_SESSION_TYPE=tty"
Environment="XDG_SEAT=seat0"
Environment="LIBSEAT_BACKEND=logind"
Environment="DISPLAY="

# Pre-start cleanup (run as root via sudo in claim_display.sh)
ExecStartPre=-/usr/bin/pkill -f ffplay
ExecStartPre=-/usr/bin/pkill -f mpv
ExecStartPre=-/usr/bin/pkill -f vlc
ExecStartPre=-/usr/bin/pkill -f 'node .*goblin/src/server.js'
ExecStartPre=-/bin/bash -lc 'lsof -t -i :3001 | xargs -r kill -9'

# Setup runtime directory and device permissions (run as root)
ExecStartPre=+/usr/local/bin/setup_goblin_runtime.sh

# Claim display (run as root)
ExecStartPre=+/usr/local/bin/claim_display.sh

# Start server
ExecStart=/usr/bin/node /home/remote/goblin/src/server.js

# Restart policy - production hardened
Restart=always
RestartSec=5
TimeoutStartSec=30
TimeoutStopSec=15
KillMode=mixed

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Logging
StandardOutput=append:/home/remote/goblin/logs/goblin.log
StandardError=append:/home/remote/goblin/logs/goblin-error.log
SyslogIdentifier=goblin

# Security hardening
NoNewPrivileges=false
PrivateTmp=true

# Watchdog disabled - not needed for media playback service
# WatchdogSec=60

[Install]
WantedBy=multi-user.target
EOFSERVICE

# Replace placeholder with actual goblin name
sed -i "s/GOBLIN_NAME_PLACEHOLDER/$GOBLIN_NAME/g" "$TEMP_DIR/goblin.service"

# Create tarball
cd "$TEMP_DIR"
tar czf /tmp/goblin-complete.tar.gz .
cd - >/dev/null

echo -e "${GREEN}✅ Package created${NC}"
echo ""

# Step 3: Upload package
echo -e "${YELLOW}[3/10] Uploading package to Goblin...${NC}"
sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no /tmp/goblin-complete.tar.gz "$SSH_USER@$GOBLIN_IP:/tmp/"
echo -e "${GREEN}✅ Package uploaded${NC}"
echo ""

# Step 4: Kill zombie processes
echo -e "${YELLOW}[4/10] Killing zombie processes...${NC}"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
sudo pkill -9 node || true
sudo pkill -9 mpv || true
sudo pkill -9 vlc || true
sudo lsof -t -i :3001 | xargs -r sudo kill -9 || true
sleep 2
ENDSSH
echo -e "${GREEN}✅ Zombie processes killed${NC}"
echo ""

# Step 5: Install software
echo -e "${YELLOW}[5/10] Installing Goblin software...${NC}"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
set -e

# Extract package
mkdir -p /home/remote/goblin
cd /home/remote/goblin
tar xzf /tmp/goblin-complete.tar.gz
rm /tmp/goblin-complete.tar.gz

# Create directories
mkdir -p logs media/video media/audio media/thumbnails

# Install setup_goblin_runtime helper (runs as root via systemd)
cat >/tmp/setup_goblin_runtime.sh <<'EOS'
#!/bin/bash
# Setup runtime directory and device permissions for Goblin video output
# This script runs as root via systemd ExecStartPre=+

# Create XDG runtime directory for user 1000 (remote)
mkdir -p /run/user/1000 2>/dev/null || true
chown remote:remote /run/user/1000 2>/dev/null || true
chmod 700 /run/user/1000 2>/dev/null || true

# Set device permissions for video output
chmod 666 /dev/fb0 2>/dev/null || true
chmod 666 /dev/tty1 2>/dev/null || true
if [ -e /dev/dri/card0 ]; then chmod 666 /dev/dri/card0 2>/dev/null || true; fi
if [ -e /dev/dri/card1 ]; then chmod 666 /dev/dri/card1 2>/dev/null || true; fi
if [ -e /dev/dri/renderD128 ]; then chmod 666 /dev/dri/renderD128 2>/dev/null || true; fi

exit 0
EOS
sudo mv /tmp/setup_goblin_runtime.sh /usr/local/bin/setup_goblin_runtime.sh
sudo chmod +x /usr/local/bin/setup_goblin_runtime.sh

# Install claim_display helper (runs as root via systemd)
cat >/tmp/claim_display.sh <<'EOS'
#!/bin/bash
# Claim display for video output
# This script runs as root via systemd ExecStartPre=+

# Kill any processes on tty1
pkill -t tty1 2>/dev/null || true

# Switch VT to release DRM master
chvt 2 2>/dev/null || true
sleep 0.5
chvt 1 2>/dev/null || true

# Clear framebuffer
dd if=/dev/zero of=/dev/fb0 bs=1M count=1 2>/dev/null || true

exit 0
EOS
sudo mv /tmp/claim_display.sh /usr/local/bin/claim_display.sh
sudo chmod +x /usr/local/bin/claim_display.sh

# Ensure user has access to video devices
sudo usermod -aG video,render remote || true

# Install dependencies
npm install --production --silent 2>&1 | grep -v 'npm WARN' || true

# Install systemd service
sudo cp goblin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable goblin.service

echo "✅ Software installed"
ENDSSH
echo -e "${GREEN}✅ Goblin software installed${NC}"
echo ""

# Step 6: Disable getty on tty1 (CRITICAL for video display)
echo -e "${YELLOW}[6/10] Disabling getty on tty1...${NC}"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
sudo systemctl disable getty@tty1 || true
sudo systemctl mask getty@tty1 || true
sudo pkill -t tty1 || true
echo "✅ getty disabled"
ENDSSH
echo -e "${GREEN}✅ getty on tty1 disabled${NC}"
echo ""

# Step 7: Apply Pi3 optimizations
echo -e "${YELLOW}[7/10] Applying Pi3 optimizations...${NC}"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
cd /home/remote/goblin
chmod +x optimize-pi3-for-video.sh
sudo ./optimize-pi3-for-video.sh 2>&1 | tail -10
echo "✅ Pi3 optimizations applied"
ENDSSH
echo -e "${GREEN}✅ Pi3 optimizations applied${NC}"
echo ""

# Step 8: Skip installing mpv (VLC-only per requirements)
echo -e "${YELLOW}[8/10] Skipping mpv installation (VLC-only) ...${NC}"
echo -e "${GREEN}✅ Proceeding with VLC-only stack${NC}"
echo ""

# Step 9: Start service
echo -e "${YELLOW}[9/10] Starting Goblin service...${NC}"
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" << 'ENDSSH'
sudo systemctl restart goblin
sleep 5
echo "✅ Service started"
ENDSSH
echo -e "${GREEN}✅ Service started${NC}"
echo ""

# Step 10: Verify deployment
echo -e "${YELLOW}[10/10] Verifying deployment...${NC}"

# Check service status
echo -n "  Service status: "
if sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_USER@$GOBLIN_IP" 'sudo systemctl is-active goblin' | grep -q 'active'; then
  echo -e "${GREEN}✅ Running${NC}"
else
  echo -e "${RED}❌ Not running${NC}"
fi

# Check API
echo -n "  API health: "
if curl -s --connect-timeout 3 "http://$GOBLIN_IP:3001/health" | grep -q 'healthy'; then
  echo -e "${GREEN}✅ Responding${NC}"
else
  echo -e "${RED}❌ Not responding${NC}"
fi

# Cleanup
rm -rf "$TEMP_DIR"
rm -f /tmp/goblin-complete.tar.gz

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Test video playback:"
echo "     curl -X POST http://$GOBLIN_IP:3001/play-video \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"filename\": \"<video-file.mp4>\", \"loop\": true}'"
echo ""
echo "  2. Check logs:"
echo "     ssh $SSH_USER@$GOBLIN_IP 'tail -f /home/remote/goblin/logs/goblin.log'"
echo ""
echo "  3. Reboot to apply all optimizations:"
echo "     ssh $SSH_USER@$GOBLIN_IP 'sudo reboot'"
echo ""

