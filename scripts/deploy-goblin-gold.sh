#!/bin/bash

# MonsterBox Goblin GOLD Release Deployment Script
# Deploys optimized video playback to Goblin RPis

echo "🎃 MonsterBox Goblin GOLD Release Deployment"
echo "============================================"
echo ""

# Goblin IPs
GOBLIN1="192.168.8.160"
GOBLIN2="192.168.8.161"
PASSWORD="klrklr89!"

# Function to deploy to a goblin
deploy_to_goblin() {
    local GOBLIN_IP=$1
    local GOBLIN_NAME=$2
    
    echo "🎯 Deploying to $GOBLIN_NAME ($GOBLIN_IP)..."
    echo ""
    
    # Copy goblin-system directory
    echo "📦 Copying goblin-system files..."
    sshpass -p "$PASSWORD" scp -r goblin-system/ remote@$GOBLIN_IP:/home/remote/MonsterBox/
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to copy files to $GOBLIN_NAME"
        return 1
    fi
    
    echo "✅ Files copied successfully"
    echo ""
    
    # Install service
    echo "🔧 Installing systemd service..."
    sshpass -p "$PASSWORD" ssh remote@$GOBLIN_IP << 'EOF'
cd /home/remote/MonsterBox/goblin-system
sudo ./install-service.sh
EOF
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install service on $GOBLIN_NAME"
        return 1
    fi
    
    echo "✅ Service installed successfully"
    echo ""
    
    # Generate thumbnails
    echo "🖼️  Generating thumbnails..."
    sshpass -p "$PASSWORD" ssh remote@$GOBLIN_IP << 'EOF'
cd /home/remote/MonsterBox/goblin-system
./generate-thumbnails.sh
EOF
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Thumbnail generation failed (may not have videos yet)"
    else
        echo "✅ Thumbnails generated successfully"
    fi
    
    echo ""
    echo "✅ $GOBLIN_NAME deployment complete!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo "❌ sshpass not found"
    echo "   Install with: sudo apt-get install sshpass"
    exit 1
fi

# Deploy to Goblin 1
echo "🎃 Deploying to Goblin 1..."
echo ""
deploy_to_goblin "$GOBLIN1" "Goblin 1"

# Deploy to Goblin 2
echo "🎃 Deploying to Goblin 2..."
echo ""
deploy_to_goblin "$GOBLIN2" "Goblin 2"

# Summary
echo ""
echo "🎉 GOLD Release Deployment Complete!"
echo "===================================="
echo ""
echo "✅ Both goblins updated with:"
echo "   - Optimized video playback (720p60)"
echo "   - Loop forever by default"
echo "   - No console text (redirected to logs)"
echo "   - Auto-play first video on boot"
echo "   - Thumbnail generation"
echo ""
echo "📋 Next Steps:"
echo "   1. Check Goblin 1 status: sshpass -p '$PASSWORD' ssh remote@$GOBLIN1 'sudo systemctl status goblin'"
echo "   2. Check Goblin 2 status: sshpass -p '$PASSWORD' ssh remote@$GOBLIN2 'sudo systemctl status goblin'"
echo "   3. View logs: sshpass -p '$PASSWORD' ssh remote@$GOBLIN1 'tail -f /var/log/goblin.log'"
echo "   4. Test video playback in Video Library"
echo ""
echo "🎃 Ready for GOLD Release! 🎃"

