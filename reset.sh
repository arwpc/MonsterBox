#!/bin/bash

# MonsterBox Quick Update and Start Script
# Automatically detects local machine name and starts MonsterBox

set -e

echo "🎭 MonsterBox Quick Update & Start"
echo "================================="

# Get the hostname of the current machine
HOSTNAME=$(hostname)
echo "🏠 Detected hostname: $HOSTNAME"

# Stash any local changes
echo "📦 Stashing local changes..."
git stash

# Clear stash history
echo "🧹 Clearing stash history..."
git stash clear

# Pull latest changes
echo "⬇️ Pulling latest changes..."
git pull

# Start MonsterBox with character name
echo "🚀 Starting MonsterBox for character: $HOSTNAME"
sudo npm start character $HOSTNAME