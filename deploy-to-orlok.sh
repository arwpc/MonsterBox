#!/bin/bash
# Deploy to Orlok from Coffin
set -e

echo "🧛 Deploying hardware fix to ORLOK..."

# First, commit and push the test script fix
cd /home/remote/MonsterBox
git add test-hardware-fix.js
git commit -m "Fix test script for ES modules" || true
git push origin feature/scene-calibration-presets

# Use scp to copy the updated files directly
echo "Copying files to Orlok..."
scp -o StrictHostKeyChecking=no services/hardwareService/index.js remote@orlok.lan:/home/remote/MonsterBox/services/hardwareService/
scp -o StrictHostKeyChecking=no test-hardware-fix.js remote@orlok.lan:/home/remote/MonsterBox/

# Restart service on Orlok
echo "Restarting MonsterBox on Orlok..."
ssh -o StrictHostKeyChecking=no remote@orlok.lan 'sudo systemctl restart monsterbox && sleep 3 && sudo systemctl status monsterbox --no-pager | head -15'

echo ""
echo "Testing Orlok hardware..."
ssh -o StrictHostKeyChecking=no remote@orlok.lan 'cd /home/remote/MonsterBox && node test-hardware-fix.js'

echo ""
echo "✅ ORLOK DEPLOYMENT COMPLETE!"
