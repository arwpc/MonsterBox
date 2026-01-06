#!/bin/bash
echo "Testing audio output on all 4 animatronics..."
echo ""
echo "If you hear them speak, audio is working!"
echo ""

# Test each one with a simple message
echo "1. Testing Coffin Breaker..."
wget -q -O- --post-data='{"text":"Test one","characterId":2}' --header='Content-Type: application/json' http://192.168.8.140:3000/api/elevenlabs/generate-and-play &
sleep 4

echo "2. Testing Orlok..."
wget -q -O- --post-data='{"text":"Test two","characterId":3}' --header='Content-Type: application/json' http://localhost:3000/api/elevenlabs/generate-and-play &
sleep 4

echo "3. Testing Skulltalker..."
wget -q -O- --post-data='{"text":"Test three","characterId":4}' --header='Content-Type: application/json' http://192.168.8.130:3000/api/elevenlabs/generate-and-play &
sleep 4

echo "4. Testing Groundbreaker..."
wget -q -O- --post-data='{"text":"Test four","characterId":5}' --header='Content-Type: application/json' http://192.168.8.200:3000/api/elevenlabs/generate-and-play &

wait
echo ""
echo "All tests sent!"

