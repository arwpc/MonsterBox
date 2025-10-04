#!/bin/bash
# Deploy MonsterBox code to all animatronics

set -e

echo "🎃 Deploying MonsterBox to All Animatronics 🎃"
echo "==============================================="
echo ""

# Animatronic IPs
PUMPKINHEAD="192.168.8.150"
COFFIN_BREAKER="192.168.8.140"
SKULLTALKER="192.168.8.130"

# SSH user
SSH_USER="remote"

# Source directory (current MonsterBox)
SOURCE_DIR="/home/remote/MonsterBox"

echo "Source: $SOURCE_DIR"
echo ""

# Function to deploy to a single animatronic
deploy_to_animatronic() {
    local NAME=$1
    local IP=$2
    
    echo "📡 Deploying to $NAME ($IP)..."
    
    # Use rsync to copy files (excluding node_modules, .git, logs, etc.)
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        --exclude 'tmp' \
        --exclude 'data/character-*/poses' \
        --exclude 'data/character-*/calibration' \
        --exclude 'data/character-*/parts' \
        $SOURCE_DIR/ $SSH_USER@$IP:~/MonsterBox/
    
    if [ $? -eq 0 ]; then
        echo "   ✅ Files copied successfully"
        
        # Restart the service
        echo "   🔄 Restarting service..."
        ssh $SSH_USER@$IP "pkill -f 'node.*server.js' && cd ~/MonsterBox && nohup npm start > /tmp/monsterbox.log 2>&1 &"
        
        if [ $? -eq 0 ]; then
            echo "   ✅ Service restarted"
        else
            echo "   ❌ Service restart failed"
        fi
    else
        echo "   ❌ File copy failed"
    fi
    
    echo ""
}

# Deploy to each animatronic
deploy_to_animatronic "PumpkinHead" $PUMPKINHEAD
sleep 2

deploy_to_animatronic "Coffin Breaker" $COFFIN_BREAKER
sleep 2

deploy_to_animatronic "Skulltalker" $SKULLTALKER
sleep 2

echo "✅ Deployment complete!"
echo ""
echo "Waiting 15 seconds for services to start..."
sleep 15
echo ""

# Verify all services are running
echo "🔍 Verifying all services..."
echo ""

for NAME_IP in "PumpkinHead:$PUMPKINHEAD" "Coffin Breaker:$COFFIN_BREAKER" "Skulltalker:$SKULLTALKER"; do
    NAME=$(echo $NAME_IP | cut -d: -f1)
    IP=$(echo $NAME_IP | cut -d: -f2)
    
    echo -n "$NAME ($IP): "
    if curl -sS --connect-timeout 5 http://$IP:3000/ -I | grep -q "200 OK"; then
        echo "✅ Online"
    else
        echo "❌ Offline"
    fi
done

echo ""
echo "🎃 All animatronics updated! 🎃"

