#!/bin/bash
# Deploy PCA9685 servo fixes to all animatronics
# MonsterBox 5.3 - Unified PCA9685 Deployment
# Date: 2025-10-25

set -e

echo "🚀 Deploying PCA9685 fixes to all animatronics..."
echo "================================================"
echo ""

# Animatronics configuration
declare -A ANIMATRONICS
ANIMATRONICS[coffin]="192.168.8.140"
ANIMATRONICS[pumpkinhead]="192.168.8.150"
ANIMATRONICS[skulltalker]="192.168.8.130"
ANIMATRONICS[groundbreaker]="192.168.8.200"

# Source files (verified working on Orlok)
SOURCE_DIR="/home/remote/MonsterBox"
FILES_TO_DEPLOY=(
    "services/hardwareService/index.js"
    "python_wrappers/servo_cli.py"
    "python_wrappers/pca9685_control.py"
    "services/scenes/sceneQueue.js"
    "services/scenes/sceneExecutor.js"
)

# Deploy to each animatronic
for NAME in "${!ANIMATRONICS[@]}"; do
    IP="${ANIMATRONICS[$NAME]}"
    echo "📦 Deploying to $NAME ($IP)..."
    
    # Check if animatronic is reachable
    if ! ping -c 1 -W 2 "$IP" > /dev/null 2>&1; then
        echo "   ⚠️  $NAME is not reachable, skipping..."
        continue
    fi
    
    # Deploy each file
    for FILE in "${FILES_TO_DEPLOY[@]}"; do
        SOURCE_FILE="$SOURCE_DIR/$FILE"
        DEST_FILE="/home/remote/MonsterBox/$FILE"
        
        if [ ! -f "$SOURCE_FILE" ]; then
            echo "   ⚠️  Source file not found: $SOURCE_FILE"
            continue
        fi
        
        echo "   📄 Copying $FILE..."
        ssh -o ConnectTimeout=5 "remote@$IP" "mkdir -p $(dirname $DEST_FILE)" 2>/dev/null || true
        scp -q "$SOURCE_FILE" "remote@$IP:$DEST_FILE"
        
        if [ $? -eq 0 ]; then
            echo "   ✅ $FILE deployed successfully"
        else
            echo "   ❌ Failed to deploy $FILE"
        fi
    done
    
    # Restart MonsterBox service
    echo "   🔄 Restarting MonsterBox service..."
    ssh -o ConnectTimeout=5 "remote@$IP" "sudo systemctl restart monsterbox" 2>/dev/null || {
        echo "   ⚠️  Failed to restart service (may need manual restart)"
    }
    
    echo "   ✅ $NAME deployment complete!"
    echo ""
done

echo "================================================"
echo "✨ Deployment complete!"
echo ""
echo "📋 Summary:"
echo "   - PCA9685 servo control (Python layer)"
echo "   - Hardware service integration (Node.js layer)"
echo "   - Scene queue system with loop mode"
echo "   - Scene executor with motion sensor support"
echo ""
echo "🧪 Testing recommendations:"
echo "   1. Test PCA9685 servos on each animatronic via web UI"
echo "   2. Verify scene queue loop mode functionality"
echo "   3. Test motion sensor integration in scenes"
echo "   4. Check calibration UI for all hardware types"
echo ""
echo "📍 Web interfaces:"
for NAME in "${!ANIMATRONICS[@]}"; do
    IP="${ANIMATRONICS[$NAME]}"
    echo "   - $NAME: http://$IP:3000"
done
echo ""
