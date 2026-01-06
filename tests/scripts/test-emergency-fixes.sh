#!/bin/bash
# Emergency diagnostic and fix script for Halloween 2025

echo "🎃 MonsterBox Emergency Diagnostic - Halloween 2025"
echo "===================================================="
echo ""

# Test 1: Audio Library Access
echo "📚 Test 1: Audio Library Access"
echo "--------------------------------"
echo "Local (Coffin): /home/remote/MonsterBox/data/audio-library/files"
ls -1 /home/remote/MonsterBox/data/audio-library/files | wc -l
echo "files found"
echo ""

echo "Orlok audio files:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "ls -1 /home/remote/MonsterBox/data/audio-library/files | wc -l"
echo "files found on Orlok"
echo ""

# Test 2: Audio Library API
echo "📡 Test 2: Audio Library API Response"
echo "--------------------------------------"
echo "Testing local API:"
curl -s http://localhost:3000/audio-library/api/library | jq -r '.totalFiles'
echo "total files reported by API"
echo ""

echo "Testing Orlok API:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "curl -s http://localhost:3000/audio-library/api/library | jq -r '.totalFiles'"
echo "total files reported by Orlok API"
echo ""

# Test 3: Linear Actuator Hardware
echo "🔧 Test 3: Linear Actuator Control (Orlok)"
echo "-------------------------------------------"
echo "Part 1 (Right Arm):"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "cd /home/remote/MonsterBox && python3 python_wrappers/linear_actuator_control_v2.py '{\"controlBoard\": \"MDD10A\", \"directionPin\": 23, \"pwmPin\": 12, \"direction\": \"forward\", \"speed\": 50, \"duration\": 1000}' | grep success"
echo ""

echo "Part 2 (Left Arm):"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "cd /home/remote/MonsterBox && python3 python_wrappers/linear_actuator_control_v2.py '{\"controlBoard\": \"MDD10A\", \"directionPin\": 18, \"pwmPin\": 13, \"direction\": \"forward\", \"speed\": 50, \"duration\": 1000}' | grep success"
echo ""

# Test 4: Calibration API
echo "🎯 Test 4: Unified Calibration API"
echo "-----------------------------------"
echo "Testing nudge command on Orlok part 1:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "curl -s -X POST http://localhost:3000/api/calibration/1/nudge -H 'Content-Type: application/json' -d '{\"delta\": 0.05, \"speedPct\": 50, \"durationMs\": 1000}'" | jq '.success'
echo ""

# Test 5: Check for common issues
echo "🔍 Test 5: Configuration Checks"
echo "--------------------------------"
echo "Orlok selected character:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "cat /home/remote/MonsterBox/config/app-config.json | jq '.selectedCharacter'"
echo ""

echo "Orlok character data path:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "cat /home/remote/MonsterBox/config/app-config.json | jq -r '.dataPath'"
echo ""

echo "Parts available for character 3:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "cat /home/remote/MonsterBox/data/character-3/parts.json | jq '[.[] | select(.type == \"linear_actuator\") | {id, name, enabled}]'"
echo ""

# Test 6: Server Status
echo "🖥️  Test 6: Server Status"
echo "-------------------------"
echo "Coffin MonsterBox process:"
ps aux | grep "node.*server.js" | grep -v grep | wc -l
echo "process(es) running"
echo ""

echo "Orlok MonsterBox process:"
sshpass -p 'klrklr89!' ssh remote@orlok.lan "ps aux | grep 'node.*server.js' | grep -v grep | wc -l"
echo "process(es) running"
echo ""

echo "✅ Diagnostic Complete"
echo "======================"
echo ""
echo "If audio files show 0, run: npm run sync-audio"
echo "If actuators show success=false, check GPIO permissions"
echo "If API returns errors, check server logs: journalctl -u monsterbox -f"
