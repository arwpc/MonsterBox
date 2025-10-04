#!/bin/bash
# Test random pose system

set -e

HOST=${1:-"localhost"}
PORT=${2:-"3000"}
CHAR_ID=${3:-"3"}

echo "🎭 Testing Random Pose System 🎭"
echo "================================"
echo "Host: $HOST:$PORT"
echo "Character ID: $CHAR_ID"
echo ""

# Get current config
echo "1. Getting current configuration..."
curl -sS http://$HOST:$PORT/api/random-poses/config | jq '.'
echo ""

# Enable random poses
echo "2. Enabling random poses..."
curl -sS -X POST http://$HOST:$PORT/api/random-poses/enable \
  -H "Content-Type: application/json" \
  -d "{\"characterId\":$CHAR_ID,\"cooldownMs\":2000,\"minAmplitude\":0.2,\"maxAmplitude\":0.5}" | jq '.'
echo ""

# Get updated config
echo "3. Getting updated configuration..."
curl -sS http://$HOST:$PORT/api/random-poses/config | jq '.'
echo ""

# Test TTS with random pose
echo "4. Testing TTS with random pose (long text)..."
curl -sS -X POST http://$HOST:$PORT/api/elevenlabs/generate-and-play \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"This is a longer test message to trigger a random pose during speech. The animatronic should move naturally while speaking.\",\"characterId\":$CHAR_ID}" | jq '.'
echo ""

sleep 3

# Manually trigger a random pose
echo "5. Manually triggering a random pose..."
curl -sS -X POST http://$HOST:$PORT/api/random-poses/trigger \
  -H "Content-Type: application/json" \
  -d "{\"characterId\":$CHAR_ID}" | jq '.'
echo ""

# Get final config
echo "6. Getting final configuration..."
curl -sS http://$HOST:$PORT/api/random-poses/config | jq '.'
echo ""

echo "✅ Random pose testing complete!"
echo ""
echo "To disable random poses:"
echo "  curl -X POST http://$HOST:$PORT/api/random-poses/disable"

