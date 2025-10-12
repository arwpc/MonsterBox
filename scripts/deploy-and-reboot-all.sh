#!/bin/bash

echo "🎃 Deploying latest repo to all animatronics and rebooting..."
echo ""

# PumpkinHead
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PumpkinHead (192.168.8.150)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.150 'cd ~/MonsterBox && git fetch origin && git reset --hard origin/main && npm install' && echo "✓ PumpkinHead updated"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.150 'sudo reboot' &
echo ""

# Coffin Breaker
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Coffin Breaker (192.168.8.140)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.140 'cd ~/MonsterBox && git fetch origin && git reset --hard origin/main && npm install' && echo "✓ Coffin Breaker updated"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.140 'sudo reboot' &
echo ""

# Skulltalker
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Skulltalker (192.168.8.130)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.130 'cd ~/MonsterBox && git fetch origin && git reset --hard origin/main && npm install' && echo "✓ Skulltalker updated"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.130 'sudo reboot' &
echo ""

# Groundbreaker
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Groundbreaker (192.168.8.200)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.200 'cd ~/MonsterBox && git fetch origin && git reset --hard origin/main && npm install' && echo "✓ Groundbreaker updated"
sshpass -p 'klrklr89!' ssh -o StrictHostKeyChecking=no remote@192.168.8.200 'sudo reboot' &
echo ""

# Orlok (local)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Orlok (192.168.8.120 - LOCAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd ~/MonsterBox && git fetch origin && git reset --hard origin/main && npm install && echo "✓ Orlok updated"
echo ""

echo "All animatronics updated and rebooting..."
echo "Waiting 60 seconds for reboot..."
sleep 60

echo ""
echo "Rebooting Orlok (local)..."
sudo reboot

