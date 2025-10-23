#!/bin/bash
# Fix Goblin DRM display issues - unbind fbcon and update boot config
# This script fixes the issue where fbcon holds the DRM plane preventing MPV from displaying video

set -e

GOBLIN_IP="${1:-}"
GOBLIN_PASS="klrklr89!"

if [ -z "$GOBLIN_IP" ]; then
    echo "Usage: $0 <goblin_ip>"
    echo "Example: $0 192.168.8.14"
    exit 1
fi

echo "=== Fixing DRM Display on Goblin at $GOBLIN_IP ==="

# Deploy updated goblin-setup.sh
echo "Deploying updated goblin-setup.sh..."
sshpass -p "$SSH_PASS" scp -q \
    goblin/goblin-setup.sh remote@$GOBLIN_IP:/tmp/goblin-setup.sh

# Install and configure
sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP << 'EOFREMOTE'
# Install updated setup script
sudo cp /tmp/goblin-setup.sh /usr/local/bin/goblin-setup.sh
sudo chmod +x /usr/local/bin/goblin-setup.sh

# Update cmdline.txt to disable console on tty1 (move to tty3)
if grep -q "console=tty1" /boot/firmware/cmdline.txt; then
    echo "Updating boot cmdline to disable fbcon on tty1..."
    sudo cp /boot/firmware/cmdline.txt /boot/firmware/cmdline.txt.backup
    sudo sed -i 's/console=tty1/console=tty3/g' /boot/firmware/cmdline.txt
    echo "Boot cmdline updated (console moved to tty3)"
else
    echo "Boot cmdline already configured"
fi

# Run the setup script immediately
echo "Running setup script..."
sudo /usr/local/bin/goblin-setup.sh

# Restart goblin service
echo "Restarting goblin service..."
sudo systemctl restart goblin

sleep 3

# Check status
echo "Checking status..."
curl -s http://localhost:3001/health | jq -r '.status.mpvRunning' | grep -q true && echo "✓ MPV is running" || echo "✗ MPV not running"

EOFREMOTE

echo ""
echo "=== Fix Complete ==="
echo "Video should now be displaying on Goblin at $GOBLIN_IP"
echo "If not visible, reboot the Goblin:"
echo "  sshpass -p 'klrklr89!' ssh remote@$GOBLIN_IP 'sudo reboot'"

