#!/bin/bash

# Deploy latest code to all animatronics
# Usage: ./scripts/deploy-to-all.sh [device1] [device2] ...
#        ./scripts/deploy-to-all.sh              # Deploy to all
#        ./scripts/deploy-to-all.sh groundbreaker pumpkinhead  # Deploy to specific devices

echo "🎃 DEPLOYING TO ALL ANIMATRONICS 🎃"
echo "===================================="
echo ""

# Animatronic configurations (prefer config/animatronics.json, fallback to defaults)
declare -A ANIMATRONICS

CONFIG_FILE="$(dirname "$0")/../config/animatronics.json"
if command -v jq >/dev/null 2>&1 && [ -f "$CONFIG_FILE" ]; then
  echo "Using config from $CONFIG_FILE"
  for key in $(jq -r 'keys[]' "$CONFIG_FILE"); do
    ip=$(jq -r --arg k "$key" '.[$k].ip // .[$k].host' "$CONFIG_FILE")
    if [ -n "$ip" ] && [ "$ip" != "null" ]; then
      ANIMATRONICS[$key]="$ip"
    fi
  done
else
  echo "Using built-in defaults (config/animatronics.json missing or jq not installed)"
  ANIMATRONICS[groundbreaker]="192.168.8.200"
  ANIMATRONICS[pumpkinhead]="192.168.8.150"
  ANIMATRONICS[coffin]="192.168.8.140"
  ANIMATRONICS[orlok]="192.168.8.120"
  ANIMATRONICS[skulltalker]="192.168.8.130"
fi

USER="remote"
REMOTE_PATH="~/MonsterBox"

# Check local Git status
echo "Step 1: Checking local Git status..."
if [[ -n $(git status -s) ]]; then
  echo "⚠️  WARNING: You have uncommitted changes!"
  echo "Please commit your changes first."
  exit 1
fi
echo "✅ Local Git is clean"
echo ""

# Push to GitHub
echo "Step 2: Pushing latest code to GitHub..."
git push origin main
if [ $? -ne 0 ]; then
  echo "❌ Failed to push to GitHub"
  exit 1
fi
echo "✅ Pushed to GitHub"
echo ""

# Determine which devices to deploy to
DEVICES_TO_DEPLOY=()
if [ $# -eq 0 ]; then
  # No arguments - deploy to all
  for device in "${!ANIMATRONICS[@]}"; do
    DEVICES_TO_DEPLOY+=("$device")
  done
else
  # Deploy to specified devices
  DEVICES_TO_DEPLOY=("$@")
fi

echo "Step 3: Deploying to devices..."
echo "Devices: ${DEVICES_TO_DEPLOY[*]}"
echo ""

# Deploy to each device
SUCCESS_COUNT=0
FAIL_COUNT=0
declare -a FAILED_DEVICES

for device in "${DEVICES_TO_DEPLOY[@]}"; do
  IP="${ANIMATRONICS[$device]}"
  
  if [ -z "$IP" ]; then
    echo "❌ Unknown device: $device"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DEVICES+=("$device (unknown)")
    continue
  fi
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📡 Deploying to: $device ($IP)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Test SSH connection
  if ! ssh -o ConnectTimeout=5 -o BatchMode=yes $USER@$IP "echo 'SSH OK'" &>/dev/null; then
    echo "❌ Cannot connect to $device ($IP)"
    echo "   Check if device is online and SSH keys are configured"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DEVICES+=("$device")
    echo ""
    continue
  fi
  
  # Deploy via SSH
  ssh -o ConnectTimeout=10 $USER@$IP << 'ENDSSH'
cd ~/MonsterBox

echo "Current commit:"
git log --oneline -1
echo ""

echo "Pulling latest code from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
  echo "❌ Git pull failed"
  exit 1
fi

echo ""
echo "New commit:"
git log --oneline -1
echo ""

echo "Restarting MonsterBox service..."
pkill -f 'node.*server.js'
sleep 2

echo "Starting service..."
nohup npm start > /tmp/monsterbox.log 2>&1 &
sleep 3

echo ""
echo "Checking service status..."
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "✅ MonsterBox is running!"
else
  echo "❌ MonsterBox failed to start. Check logs:"
  echo "   tail -50 /tmp/monsterbox.log"
  exit 1
fi

ENDSSH

  if [ $? -eq 0 ]; then
    echo "✅ Successfully deployed to $device"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo "❌ Failed to deploy to $device"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_DEVICES+=("$device")
  fi
  
  echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎃 DEPLOYMENT SUMMARY 🎃"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAIL_COUNT"

if [ $FAIL_COUNT -gt 0 ]; then
  echo ""
  echo "Failed devices:"
  for failed in "${FAILED_DEVICES[@]}"; do
    echo "  • $failed"
  done
fi

echo ""
echo "🎯 TEST THE DEPLOYMENTS:"
for device in "${DEVICES_TO_DEPLOY[@]}"; do
  IP="${ANIMATRONICS[$device]}"
  if [ -n "$IP" ]; then
    echo "  • http://$device:3000/setup/calibration"
  fi
done

echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo "🎃 ALL DEPLOYMENTS SUCCESSFUL! 🎃"
  exit 0
else
  echo "⚠️  SOME DEPLOYMENTS FAILED"
  exit 1
fi

