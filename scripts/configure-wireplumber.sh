#!/bin/bash
#
# WirePlumber/PipeWire Configuration Script for MonsterBox
# Implements comprehensive audio system reliability for Raspberry Pi
#
# This script configures PipeWire and WirePlumber to start reliably at boot
# by using user services with proper dependencies and timing controls.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TARGET_USER="${1:-remote}"  # Default to 'remote' user, can override with argument
USER_HOME=$(eval echo ~$TARGET_USER)
USER_ID=$(id -u $TARGET_USER)

echo "=================================================="
echo "MonsterBox WirePlumber Configuration Script"
echo "=================================================="
echo "Target User: $TARGET_USER"
echo "User Home: $USER_HOME"
echo "User ID: $USER_ID"
echo ""

# Step 1: Verify user is in correct groups
echo -e "${YELLOW}Step 1: Verifying user groups...${NC}"
if ! groups $TARGET_USER | grep -q audio; then
    echo "Adding $TARGET_USER to audio group..."
    sudo usermod -aG audio $TARGET_USER
    echo -e "${GREEN}✓ Added to audio group${NC}"
else
    echo -e "${GREEN}✓ Already in audio group${NC}"
fi

if ! groups $TARGET_USER | grep -q video; then
    echo "Adding $TARGET_USER to video group..."
    sudo usermod -aG video $TARGET_USER
    echo -e "${GREEN}✓ Added to video group${NC}"
else
    echo -e "${GREEN}✓ Already in video group${NC}"
fi
echo ""

# Step 2: Disable PulseAudio completely
echo -e "${YELLOW}Step 2: Disabling PulseAudio...${NC}"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user stop pulseaudio.socket pulseaudio.service 2>/dev/null || true
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user disable pulseaudio.socket pulseaudio.service 2>/dev/null || true
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user mask pulseaudio.socket pulseaudio.service 2>/dev/null || true
echo -e "${GREEN}✓ PulseAudio disabled${NC}"
echo ""

# Step 3: Enable loginctl linger
echo -e "${YELLOW}Step 3: Enabling loginctl linger for $TARGET_USER...${NC}"
sudo loginctl enable-linger $TARGET_USER
echo -e "${GREEN}✓ Linger enabled${NC}"
echo ""

# Step 4: Create systemd override directories
echo -e "${YELLOW}Step 4: Creating systemd override directories...${NC}"
sudo -u $TARGET_USER mkdir -p "$USER_HOME/.config/systemd/user/pipewire.service.d"
sudo -u $TARGET_USER mkdir -p "$USER_HOME/.config/systemd/user/wireplumber.service.d"
echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Step 5: Create PipeWire override configuration
echo -e "${YELLOW}Step 5: Creating PipeWire override configuration...${NC}"
sudo -u $TARGET_USER tee "$USER_HOME/.config/systemd/user/pipewire.service.d/override.conf" > /dev/null <<'EOF'
[Unit]
After=dbus.service
ConditionUser=!root

[Service]
Restart=always
RestartSec=2
EOF
echo -e "${GREEN}✓ PipeWire override created${NC}"
echo ""

# Step 6: Create WirePlumber override configuration
echo -e "${YELLOW}Step 6: Creating WirePlumber override configuration...${NC}"
sudo -u $TARGET_USER tee "$USER_HOME/.config/systemd/user/wireplumber.service.d/override.conf" > /dev/null <<'EOF'
[Unit]
After=pipewire.service dbus.service
Requires=pipewire.service
ConditionUser=!root

[Service]
Restart=always
RestartSec=2
EOF
echo -e "${GREEN}✓ WirePlumber override created${NC}"
echo ""

# Step 7: Create startup script
echo -e "${YELLOW}Step 7: Creating audio startup script...${NC}"
sudo -u $TARGET_USER tee "$USER_HOME/start-audio.sh" > /dev/null <<'EOF'
#!/bin/bash
# MonsterBox Audio Startup Script
# Ensures PipeWire and WirePlumber start reliably at boot

# Wait for system to settle
sleep 5

# Start audio services
systemctl --user start pipewire pipewire-pulse wireplumber

# Wait for audio system to be ready (up to 20 seconds)
for i in {1..10}; do
    if wpctl status &>/dev/null; then
        echo "$(date): Audio system ready" >> ~/audio-startup.log
        exit 0
    fi
    sleep 2
done

echo "$(date): Audio system failed to start" >> ~/audio-startup.log
exit 1
EOF

sudo chmod +x "$USER_HOME/start-audio.sh"
sudo chown $TARGET_USER:$TARGET_USER "$USER_HOME/start-audio.sh"
echo -e "${GREEN}✓ Startup script created${NC}"
echo ""

# Step 8: Add crontab entry
echo -e "${YELLOW}Step 8: Adding crontab entry...${NC}"
# Check if crontab entry already exists
if sudo -u $TARGET_USER crontab -l 2>/dev/null | grep -q "start-audio.sh"; then
    echo -e "${GREEN}✓ Crontab entry already exists${NC}"
else
    # Add new crontab entry
    (sudo -u $TARGET_USER crontab -l 2>/dev/null || true; echo "@reboot $USER_HOME/start-audio.sh >> $USER_HOME/audio-startup.log 2>&1") | sudo -u $TARGET_USER crontab -
    echo -e "${GREEN}✓ Crontab entry added${NC}"
fi
echo ""

# Step 9: Reload systemd and enable services
echo -e "${YELLOW}Step 9: Enabling PipeWire services...${NC}"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user daemon-reload
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user enable pipewire pipewire-pulse wireplumber
echo -e "${GREEN}✓ Services enabled${NC}"
echo ""

# Step 10: Start services now
echo -e "${YELLOW}Step 10: Starting PipeWire services...${NC}"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user start pipewire pipewire-pulse wireplumber
sleep 3
echo -e "${GREEN}✓ Services started${NC}"
echo ""

# Step 11: Verify services are running
echo -e "${YELLOW}Step 11: Verifying services...${NC}"
echo ""
echo "PipeWire status:"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user status pipewire --no-pager || true
echo ""
echo "PipeWire-Pulse status:"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user status pipewire-pulse --no-pager || true
echo ""
echo "WirePlumber status:"
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID systemctl --user status wireplumber --no-pager || true
echo ""

# Step 12: Test audio system
echo -e "${YELLOW}Step 12: Testing audio system...${NC}"
if sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID wpctl status &>/dev/null; then
    echo -e "${GREEN}✓ WirePlumber is responding${NC}"
    echo ""
    echo "Audio devices:"
    sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$USER_ID wpctl status | head -30
else
    echo -e "${RED}✗ WirePlumber is not responding${NC}"
fi
echo ""

# Summary
echo "=================================================="
echo -e "${GREEN}Configuration Complete!${NC}"
echo "=================================================="
echo ""
echo "What was configured:"
echo "  ✓ User $TARGET_USER added to audio and video groups"
echo "  ✓ PulseAudio disabled and masked"
echo "  ✓ Loginctl linger enabled for $TARGET_USER"
echo "  ✓ PipeWire systemd override created"
echo "  ✓ WirePlumber systemd override created"
echo "  ✓ Audio startup script created at $USER_HOME/start-audio.sh"
echo "  ✓ Crontab entry added for automatic startup"
echo "  ✓ PipeWire services enabled and started"
echo ""
echo "Next steps:"
echo "  1. Reboot the system to test automatic startup"
echo "  2. After reboot, check: systemctl --user status wireplumber"
echo "  3. Test audio: aplay /usr/share/sounds/alsa/Front_Center.wav"
echo "  4. Check logs: cat ~/audio-startup.log"
echo "  5. Monitor: journalctl --user -u wireplumber -f"
echo ""
echo "Troubleshooting commands:"
echo "  systemctl --user status pipewire pipewire-pulse wireplumber"
echo "  wpctl status"
echo "  journalctl --user -u wireplumber -f"
echo "  ls -la /run/user/$USER_ID/pipewire-0"
echo ""
echo "To test now without rebooting:"
echo "  $USER_HOME/start-audio.sh"
echo ""

