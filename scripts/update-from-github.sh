#!/bin/bash

# Update MonsterBox from GitHub and restart service
# This script should be run ON the animatronic device itself
# Usage: ./scripts/update-from-github.sh

echo "🎃 UPDATING MONSTERBOX FROM GITHUB 🎃"
echo "======================================"
echo ""

# Get current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MONSTERBOX_DIR="$(dirname "$SCRIPT_DIR")"

cd "$MONSTERBOX_DIR" || exit 1

echo "MonsterBox directory: $MONSTERBOX_DIR"
echo "Current hostname: $(hostname)"
echo ""

# Check if we're in a git repository
if [ ! -d ".git" ]; then
  echo "❌ ERROR: Not in a git repository!"
  echo "   Current directory: $(pwd)"
  exit 1
fi

echo "Step 1: Checking current status..."
echo "Current commit:"
git log --oneline -1
echo ""

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
  echo "⚠️  WARNING: You have uncommitted local changes!"
  echo ""
  git status -s
  echo ""
  read -p "Do you want to stash these changes and continue? (y/N) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Stashing local changes..."
    git stash
  else
    echo "❌ Aborted. Please commit or stash your changes first."
    exit 1
  fi
fi

echo "Step 2: Pulling latest code from GitHub..."
git pull origin main

if [ $? -ne 0 ]; then
  echo "❌ Git pull failed!"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check internet connection"
  echo "  2. Verify GitHub SSH keys: ssh -T git@github.com"
  echo "  3. Check git remote: git remote -v"
  exit 1
fi

echo ""
echo "✅ Code updated successfully!"
echo ""
echo "New commit:"
git log --oneline -1
echo ""

echo "Step 3: Restarting MonsterBox service..."
echo "Stopping current service..."
pkill -f 'node.*server.js'
sleep 2

# Check if service stopped
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "⚠️  Service still running, forcing kill..."
  pkill -9 -f 'node.*server.js'
  sleep 1
fi

echo "Starting service..."
nohup npm start > /tmp/monsterbox.log 2>&1 &
sleep 3

echo ""
echo "Step 4: Checking service status..."
if pgrep -f 'node.*server.js' > /dev/null; then
  echo "✅ MonsterBox is running!"
  echo ""
  echo "Service PID: $(pgrep -f 'node.*server.js')"
  echo "Log file: /tmp/monsterbox.log"
  echo ""
  echo "🎃 UPDATE COMPLETE! 🎃"
  echo ""
  echo "Test the application:"
  echo "  • http://$(hostname):3000"
  echo "  • http://$(hostname):3000/setup/calibration"
  echo ""
  exit 0
else
  echo "❌ MonsterBox failed to start!"
  echo ""
  echo "Check the logs:"
  echo "  tail -50 /tmp/monsterbox.log"
  echo ""
  exit 1
fi

