#!/bin/bash
#
# Install Webcam Watchdog Service
# Monitors mjpg-streamer and automatically restarts it if video feed corrupts
# Ensures webcam microphone remains accessible for Conversation Mode
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_FILE="$SCRIPT_DIR/webcam-watchdog.service"
MJPG_SERVICE_FILE="$SCRIPT_DIR/mjpg-streamer.service"

echo "=== Installing Webcam Watchdog ==="

# 1. Install improved mjpg-streamer service
echo "Installing improved mjpg-streamer service..."
sudo cp "$MJPG_SERVICE_FILE" /etc/systemd/system/mjpg-streamer.service
sudo systemctl daemon-reload
echo "✓ mjpg-streamer service updated"

# 2. Install webcam watchdog service
echo "Installing webcam watchdog service..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/webcam-watchdog.service
sudo systemctl daemon-reload
echo "✓ webcam-watchdog service installed"

# 3. Enable watchdog service
echo "Enabling webcam watchdog..."
sudo systemctl enable webcam-watchdog.service
echo "✓ webcam-watchdog enabled"

# 4. Restart mjpg-streamer with new configuration
echo "Restarting mjpg-streamer..."
sudo systemctl restart mjpg-streamer.service
sleep 2
echo "✓ mjpg-streamer restarted"

# 5. Start watchdog
echo "Starting webcam watchdog..."
sudo systemctl start webcam-watchdog.service
sleep 1
echo "✓ webcam-watchdog started"

# 6. Show status
echo ""
echo "=== Service Status ==="
echo "mjpg-streamer:"
systemctl status mjpg-streamer.service --no-pager -l | head -10
echo ""
echo "webcam-watchdog:"
systemctl status webcam-watchdog.service --no-pager -l | head -10

echo ""
echo "=== Installation Complete ==="
echo "Webcam watchdog is now monitoring mjpg-streamer"
echo "It will automatically restart the service if video feed corrupts"
echo ""
echo "To view watchdog logs:"
echo "  sudo journalctl -u webcam-watchdog -f"
echo ""
echo "To disable watchdog:"
echo "  sudo systemctl stop webcam-watchdog"
echo "  sudo systemctl disable webcam-watchdog"

