#!/bin/bash
# Test conversation TTS audio playback

echo "=== CONVERSATION TTS AUDIO TEST ==="
echo ""

echo "1. Testing conversation API with TTS..."
echo "   Calling /conversation/api/say with text..."
echo ""

# Make the API call and capture response
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"text":"This is a test of the Groundbreaker text to speech system"}' \
  http://192.168.8.200:3000/conversation/api/say)

echo "   API Response: $RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "   ✓ API returned success"
  DEVICE=$(echo "$RESPONSE" | grep -o '"device":"[^"]*"' | cut -d'"' -f4)
  echo "   ✓ Device: $DEVICE"
else
  echo "   ✗ API returned error"
  ERROR=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
  echo "   ✗ Error: $ERROR"
fi

echo ""
echo "2. Checking active audio processes..."
ps aux | grep -E "(mpg123|pw-play|paplay)" | grep -v grep
echo ""

echo "3. Checking PipeWire sink status..."
wpctl status | grep -A 5 "Sinks:"
echo ""

echo "4. Testing direct speaker_cli.py playback..."
python3 python_wrappers/speaker_cli.py play public/sounds/monster-howl-85304.mp3 80 --device default
echo ""

echo "=== TEST COMPLETE ==="
echo ""
echo "QUESTIONS:"
echo "1. Did you hear audio from the conversation API call (step 1)?"
echo "2. Did you hear audio from the speaker_cli.py test (step 4)?"
echo ""
echo "If you heard step 4 but NOT step 1, then the issue is with TTS generation."
echo "If you heard neither, then the issue is with audio routing."

