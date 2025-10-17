#!/usr/bin/env bash
# Make all animatronics speak to verify TTS is working

echo "🎃 Making all animatronics speak..."
echo ""

echo "1. Orlok speaking..."
curl -s -X POST http://192.168.8.120:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am Count Orlok, master of the night. Welcome to my castle this Halloween!","characterId":3}' | grep -o '"success":[^,]*'
sleep 8

echo "2. PumpkinHead speaking..."
curl -s -X POST http://192.168.8.150:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I am PumpkinHead, guardian of the harvest. The spirits are restless tonight!","characterId":1}' | grep -o '"success":[^,]*'
sleep 8

echo "3. Coffin Breaker speaking..."
curl -s -X POST http://192.168.8.140:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I rise from my eternal slumber. The coffin opens and I emerge for Halloween!","characterId":2}' | grep -o '"success":[^,]*'
sleep 8

echo "4. Skulltalker speaking..."
curl -s -X POST http://192.168.8.130:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"My skull speaks from beyond the grave. Listen to my Halloween warnings!","characterId":4}' | grep -o '"success":[^,]*'
sleep 8

echo "5. Groundbreaker speaking..."
curl -s -X POST http://192.168.8.200:3000/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d '{"text":"I break through the earth to join the Halloween celebration!","characterId":5}' | grep -o '"success":[^,]*'
sleep 5

echo ""
echo "✅ All animatronics have spoken! TTS is working on all 5 units."
echo ""
echo "Next: Run reboot test with ./scripts/halloween-reboot-test.sh"

