#!/bin/bash
# Deploy motion detection functionality to all animatronics

REMOTE_USER="remote"
REMOTE_PASS="klrklr89!"
REMOTE_DIR="/home/remote/MonsterBox"

# Animatronic IPs
ANIMATRONICS=(
    "192.168.8.120:Orlok"
    "192.168.8.150:PumpkinHead"
    "192.168.8.140:Coffin"
    "192.168.8.130:Skulltalker"
    "192.168.8.200:Groundbreaker"
)

echo "🎃 Deploying Motion Detection Functionality to All Animatronics 🎃"
echo "=================================================================="
echo ""

for animatronic in "${ANIMATRONICS[@]}"; do
    IFS=':' read -r IP NAME <<< "$animatronic"
    
    echo "📡 Deploying to $NAME ($IP)..."
    
    # Pull latest changes
    sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$IP \
        "cd $REMOTE_DIR && git pull origin main" 2>&1 | grep -E "(Already up to date|Updating|Fast-forward|files changed)"
    
    if [ $? -eq 0 ]; then
        echo "  ✅ $NAME: Code updated"
        
        # Make motion_detect_cli.py executable
        sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$IP \
            "chmod +x $REMOTE_DIR/python_wrappers/motion_detect_cli.py" 2>&1
        
        # Restart MonsterBox service
        echo "  🔄 Restarting MonsterBox service on $NAME..."
        sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$IP \
            "sudo systemctl restart monsterbox" 2>&1
        
        # Wait a moment for service to start
        sleep 2
        
        # Check service status
        STATUS=$(sshpass -p "$REMOTE_PASS" ssh -o StrictHostKeyChecking=no $REMOTE_USER@$IP \
            "systemctl is-active monsterbox" 2>&1)
        
        if [ "$STATUS" = "active" ]; then
            echo "  ✅ $NAME: MonsterBox service running"
        else
            echo "  ❌ $NAME: MonsterBox service NOT running (status: $STATUS)"
        fi
    else
        echo "  ❌ $NAME: Failed to update code"
    fi
    
    echo ""
done

echo "=================================================================="
echo "✅ Deployment Complete!"
echo ""
echo "Motion Detection Features Added:"
echo "  • Read - Single instant reading"
echo "  • Detect Motion - 10-second detection with event counting"
echo "  • Start Live Test - Continuous monitoring with visual feedback"
echo ""
echo "Access calibration pages:"
echo "  • Orlok: http://192.168.8.120:3000/setup/calibration"
echo "  • PumpkinHead: http://192.168.8.150:3000/setup/calibration"
echo "  • Coffin: http://192.168.8.140:3000/setup/calibration"
echo "  • Skulltalker: http://192.168.8.130:3000/setup/calibration"
echo "  • Groundbreaker: http://192.168.8.200:3000/setup/calibration"
echo ""

