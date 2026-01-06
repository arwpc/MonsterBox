#!/bin/bash
# deploy-monsterbox-v5.4.sh
# Deploys MonsterBox 5.4 to all animatronics

set +e  # Don't exit on errors, handle them individually

ANIMATRONICS=(
  "orlok:192.168.8.120"
  "coffin:192.168.8.150"
  "groundbreaker:192.168.8.157"
  "skulltalker:192.168.8.130"
)

echo "========================================================"
echo "MonsterBox 5.4 Deployment to All Animatronics"
echo "========================================================"
echo ""

for ANIM in "${ANIMATRONICS[@]}"; do
  NAME="${ANIM%%:*}"
  IP="${ANIM##*:}"
  
  echo "========================================================"
  echo "Deploying to $NAME ($IP)..."
  echo "========================================================"
  
  # Check connectivity
  if ! ping -c 1 -W 2 "$IP" >/dev/null 2>&1; then
    echo "❌ $NAME is not reachable at $IP"
    echo ""
    continue
  fi
  
  echo "✅ $NAME is reachable"
  
  # Stop MonsterBox
  echo "🛑 Stopping MonsterBox on $NAME..."
  ssh -o StrictHostKeyChecking=no remote@$IP "pkill -f 'node.*server.js' || true" 2>/dev/null || true
  
  sleep 2
  
  # Pull latest from git
  echo "📥 Pulling v5.4.0 from git..."
  if ! ssh -o StrictHostKeyChecking=no remote@$IP "cd /home/remote/MonsterBox && git fetch && git checkout v5.4.0" 2>&1 | tail -3; then
    echo "⚠️  Git checkout had issues, but continuing..."
  fi
  
  # Install dependencies (if package.json changed)
  echo "📦 Installing dependencies..."
  ssh -o StrictHostKeyChecking=no remote@$IP "cd /home/remote/MonsterBox && npm ci > /tmp/npm-ci.log 2>&1" &
  NPM_PID=$!
  echo "   npm ci running in background (PID $NPM_PID)..."
  
  # Wait for npm ci with timeout
  for i in {1..180}; do
    if ! kill -0 $NPM_PID 2>/dev/null; then
      echo "   npm ci completed"
      break
    fi
    if [ $i -eq 180 ]; then
      echo "   npm ci timeout reached"
      kill $NPM_PID 2>/dev/null || true
    fi
    sleep 1
  done
  
  # Restart MonsterBox
  echo "🚀 Starting MonsterBox..."
  ssh -o StrictHostKeyChecking=no remote@$IP "cd /home/remote/MonsterBox && nohup node server.js > /tmp/monsterbox.log 2>&1 < /dev/null &" 2>/dev/null
  
  echo "   Waiting 10 seconds for server to start..."
  sleep 10
  
  # Verify health
  echo "🔍 Checking health endpoint..."
  if curl -s --connect-timeout 5 "http://$IP:3000/health" >/dev/null 2>&1; then
    echo "✅ $NAME deployed successfully"
  else
    echo "⚠️  $NAME deployment may have issues - health check failed"
  fi
  
  echo ""
done

echo "========================================================"
echo "Deployment Complete!"
echo "========================================================"
echo ""
echo "Next steps:"
echo "1. Test each animatronic dashboard"
echo "2. Verify calibration page loads"
echo "3. Execute a test pose on each"
echo ""
