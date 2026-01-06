#!/bin/bash
# HALLOWEEN EMERGENCY - Deploy hardware fixes to Coffin and Orlok
set -e

echo "🎃 HALLOWEEN EMERGENCY DEPLOYMENT 🎃"
echo "Deploying hardware fixes to Coffin and Orlok..."
echo ""

# Push to remote
echo "📤 Pushing fixes to GitHub..."
git push origin feature/scene-calibration-presets

echo ""
echo "🎃 Deploying to COFFIN BREAKER..."
ssh coffin.lan << 'ENDSSH'
    cd /home/remote/MonsterBox
    git fetch origin
    git checkout feature/scene-calibration-presets
    git pull origin feature/scene-calibration-presets
    sudo systemctl restart monsterbox
    echo "✅ Coffin service restarted"
    sleep 3
    sudo systemctl status monsterbox --no-pager | head -15
ENDSSH

echo ""
echo "🧛 Deploying to ORLOK..."
ssh orlok.lan << 'ENDSSH'
    cd /home/remote/MonsterBox
    git fetch origin
    git checkout feature/scene-calibration-presets
    git pull origin feature/scene-calibration-presets
    sudo systemctl restart monsterbox
    echo "✅ Orlok service restarted"
    sleep 3
    sudo systemctl status monsterbox --no-pager | head -15
ENDSSH

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "Now testing hardware on both systems..."
echo ""

echo "🎃 Testing COFFIN servos..."
ssh coffin.lan "cd /home/remote/MonsterBox && node test-hardware-fix.js"

echo ""
echo "🧛 Testing ORLOK actuators and servos..."
ssh orlok.lan "cd /home/remote/MonsterBox && node test-hardware-fix.js"

echo ""
echo "🎃🧛 ALL SYSTEMS READY FOR HALLOWEEN! 🧛🎃"
