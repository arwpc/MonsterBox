#!/bin/bash
# deploy-goblin-stability-fix.sh
# Comprehensive fix for CLI visibility and stability issues on Goblins
#
# Issues Fixed:
# 1. CLI visible between MPV process transitions
# 2. Console not staying blanked during video playback
# 3. Getty service interference with tty1
# 4. fbcon rebinding to framebuffer after boot
#
# Solution:
# - Deploy persistent console blanking service
# - Update mpvController.js with pre-playback blanking
# - Ensure getty@tty1 stays disabled
# - Add console blanking between video transitions

set -e

GOBLIN_PASS="klrklr89!"
GOBLIN_IP="$1"

if [ -z "$GOBLIN_IP" ]; then
    echo "Usage: $0 <goblin-ip>"
    echo "Example: $0 192.168.8.40"
    exit 1
fi

echo "========================================================"
echo "Goblin Stability Fix Deployment"
echo "========================================================"
echo "Target: $GOBLIN_IP"
echo ""

# Check connectivity
if ! ping -c 1 -W 2 "$GOBLIN_IP" >/dev/null 2>&1; then
    echo "❌ Goblin is not reachable at $GOBLIN_IP"
    exit 1
fi

echo "✅ Goblin is reachable"
echo ""

# 1. Deploy console blanker script
echo "📦 Deploying console blanker script..."
sshpass -p "$GOBLIN_PASS" scp -o StrictHostKeyChecking=no \
    goblin-gold/scripts/console-blanker.sh \
    remote@$GOBLIN_IP:/tmp/console-blanker.sh

sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP << 'EOF'
sudo mv /tmp/console-blanker.sh /usr/local/bin/console-blanker.sh
sudo chmod +x /usr/local/bin/console-blanker.sh
echo "✅ Console blanker script installed"
EOF

# 2. Deploy console blanker systemd service
echo "📦 Deploying console blanker service..."
sshpass -p "$GOBLIN_PASS" scp -o StrictHostKeyChecking=no \
    goblin-gold/systemd/console-blanker.service \
    remote@$GOBLIN_IP:/tmp/console-blanker.service

sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP << 'EOF'
sudo mv /tmp/console-blanker.service /etc/systemd/system/console-blanker.service
sudo systemctl daemon-reload
sudo systemctl enable console-blanker.service
echo "✅ Console blanker service installed and enabled"
EOF

# 3. Deploy updated mpvController.js with pre-playback blanking
echo "📦 Deploying updated mpvController.js..."
sshpass -p "$GOBLIN_PASS" scp -o StrictHostKeyChecking=no \
    goblin-gold/src/mpvController.js \
    remote@$GOBLIN_IP:/home/remote/goblin/src/mpvController.js

echo "✅ mpvController.js updated"
echo ""

# 4. Start console blanker service
echo "🚀 Starting console blanker service..."
sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP << 'EOF'
sudo systemctl start console-blanker.service
sleep 1
if systemctl is-active console-blanker.service >/dev/null 2>&1; then
    echo "✅ Console blanker service is running"
else
    echo "⚠️  Console blanker service failed to start"
    exit 1
fi
EOF

# 5. Restart goblin service
echo "🔄 Restarting goblin service..."
sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP \
    'sudo systemctl restart goblin.service'

sleep 3

# 6. Verify services
echo "🔍 Verifying services..."
sshpass -p "$GOBLIN_PASS" ssh -o StrictHostKeyChecking=no remote@$GOBLIN_IP << 'EOF'
if systemctl is-active goblin.service >/dev/null 2>&1; then
    echo "✅ Goblin service is active"
else
    echo "❌ Goblin service is not active"
    exit 1
fi

if systemctl is-active console-blanker.service >/dev/null 2>&1; then
    echo "✅ Console blanker service is active"
else
    echo "❌ Console blanker service is not active"
    exit 1
fi
EOF

# 7. Check health endpoint
echo "🔍 Checking health endpoint..."
if curl -s --connect-timeout 5 "http://$GOBLIN_IP:3001/health" >/dev/null 2>&1; then
    echo "✅ Health check passed"
else
    echo "⚠️  Health check failed"
    exit 1
fi

echo ""
echo "========================================================"
echo "🎉 Deployment Complete!"
echo "========================================================"
echo ""
echo "The following fixes have been applied:"
echo "  ✅ Console blanker service (continuous blanking)"
echo "  ✅ Updated mpvController.js (pre-playback blanking)"
echo "  ✅ All services verified and running"
echo ""
echo "The console should now stay blank during:"
echo "  - Video playback"
echo "  - Video transitions"
echo "  - Queue operations"
echo "  - Service restarts"
echo ""
