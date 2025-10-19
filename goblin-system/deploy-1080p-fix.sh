#!/bin/bash
#
# Deploy 1080p fix to all Goblins
#

echo "🚀 DEPLOYING 1080p FIX TO ALL GOBLINS"
echo "====================================="
echo ""

# Goblin IPs
GOBLIN_ONE="192.168.8.40"
GOBLIN_TWO="192.168.8.106"
GOBLIN_THREE="192.168.8.14"

# Check status
echo "1. Checking Goblin status:"
echo -n "  Goblin One ($GOBLIN_ONE): "
if ping -c 1 -W 2 $GOBLIN_ONE &>/dev/null; then
  echo "✅ ONLINE"
  G1_ONLINE=true
else
  echo "❌ OFFLINE"
  G1_ONLINE=false
fi

echo -n "  Goblin Two ($GOBLIN_TWO): "
if ping -c 1 -W 2 $GOBLIN_TWO &>/dev/null; then
  echo "✅ ONLINE"
  G2_ONLINE=true
else
  echo "❌ OFFLINE"
  G2_ONLINE=false
fi

echo -n "  Goblin Three ($GOBLIN_THREE): "
if ping -c 1 -W 2 $GOBLIN_THREE &>/dev/null; then
  echo "✅ ONLINE"
  G3_ONLINE=true
else
  echo "❌ OFFLINE"
  G3_ONLINE=false
fi

echo ""

# Deploy to Goblin One
if [ "$G1_ONLINE" = true ]; then
  echo "2. Deploying to Goblin One..."
  sshpass -p 'klrklr89!' scp -o StrictHostKeyChecking=no \
    /home/remote/MonsterBox/goblin-system/src/mediaPlayer-optimized.js \
    remote@$GOBLIN_ONE:/home/remote/goblin/src/mediaPlayer.js
  
  sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@$GOBLIN_ONE \
    'sudo pkill -9 node; sudo pkill -9 mpv; sudo systemctl restart goblin'
  
  echo "  ✅ Deployed"
else
  echo "2. Goblin One OFFLINE - skipping"
fi

echo ""

# Deploy to Goblin Two
if [ "$G2_ONLINE" = true ]; then
  echo "3. Deploying to Goblin Two..."
  sshpass -p 'klrklr89!' scp -o StrictHostKeyChecking=no \
    /home/remote/MonsterBox/goblin-system/src/mediaPlayer-optimized.js \
    remote@$GOBLIN_TWO:/home/remote/goblin/src/mediaPlayer.js
  
  sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@$GOBLIN_TWO \
    'sudo pkill -9 node; sudo pkill -9 mpv; sudo systemctl restart goblin'
  
  echo "  ✅ Deployed"
else
  echo "3. Goblin Two OFFLINE - skipping"
fi

echo ""

# Goblin Three already deployed
echo "4. Goblin Three already deployed ✅"

echo ""
echo "✅ DEPLOYMENT COMPLETE"
echo ""

