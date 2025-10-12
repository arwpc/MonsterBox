#!/bin/bash

echo "🎃 Testing all 5 animatronics talking..."
echo ""

# Test PumpkinHead
echo "1. PumpkinHead speaking..."
curl -s -X POST http://192.168.8.150:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am PumpkinHead, guardian of the harvest. MonsterBox 5.3 is operational.","characterId":1}' 2>&1 | head -1
sleep 3

# Test Coffin Breaker
echo "2. Coffin Breaker speaking..."
curl -s -X POST http://192.168.8.140:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Coffin Breaker, risen from the grave. MonsterBox 5.3 is ready.","characterId":2}' 2>&1 | head -1
sleep 3

# Test Orlok
echo "3. Orlok speaking..."
curl -s -X POST http://localhost:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Orlok, master of shadows. MonsterBox 5.3 is complete.","characterId":3}' 2>&1 | head -1
sleep 3

# Test Skulltalker
echo "4. Skulltalker speaking..."
curl -s -X POST http://192.168.8.130:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Skulltalker, keeper of dark secrets. MonsterBox 5.3 is online.","characterId":4}' 2>&1 | head -1
sleep 3

# Test Groundbreaker
echo "5. Groundbreaker speaking..."
curl -s -X POST http://192.168.8.200:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Groundbreaker, rising from the earth. MonsterBox 5.3 is alive.","characterId":5}' 2>&1 | head -1

echo ""
echo "✅ All 5 animatronics have spoken!"

