#!/bin/bash

# Deploy latest code to Groundbreaker
# Usage: ./scripts/deploy-to-groundbreaker.sh

echo "🚨 DEPLOYING TO GROUNDBREAKER 🚨"
echo "================================="
echo ""

# Groundbreaker details
HOST="192.168.8.200"
USER="remote"
REMOTE_PATH="~/MonsterBox"

echo "Step 1: Checking local Git status..."
if [[ -n $(git status -s) ]]; then
  echo "⚠️  WARNING: You have uncommitted changes!"
  echo "Please commit your changes first."
  exit 1
fi

echo "✅ Local Git is clean"
echo ""

echo "Step 2: Pushing latest code to GitHub..."
git push origin main
echo "✅ Pushed to GitHub"
echo ""

echo "Step 3: Connecting to Groundbreaker..."
echo "Host: $USER@$HOST"
echo ""

# Deploy via SSH
ssh -o StrictHostKeyChecking=no $USER@$HOST << 'ENDSSH'
cd ~/MonsterBox

echo "Current commit:"
git log --oneline -1
echo ""

echo "Pulling latest code from GitHub..."
git pull origin main

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
echo "✅ Service restarted!"
echo ""

echo "Checking service status..."
sleep 2
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "✅ MonsterBox is running!"
else
  echo "❌ MonsterBox failed to start. Check logs:"
  echo "   tail -50 /tmp/monsterbox.log"
fi

ENDSSH

echo ""
echo "🎃 DEPLOYMENT COMPLETE! 🎃"
echo ""
echo "Test the fix at: http://groundbreaker:3000/setup/calibration"
echo ""

