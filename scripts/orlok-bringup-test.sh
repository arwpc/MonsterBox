#!/bin/bash
# Orlok Bring-Up Test Script
# Run this on Orlok (192.168.8.120) to verify TTS and audio configuration
# Usage: ./scripts/orlok-bringup-test.sh

set -e

echo "=========================================="
echo "Orlok Bring-Up Test Script"
echo "Character ID: 3"
echo "IP: 192.168.8.120"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check ElevenLabs API Key File
echo "Test 1: Checking ElevenLabs API key file..."
if [ -f /etc/monsterbox/elevenlabs.key ]; then
    PERMS=$(stat -c %a /etc/monsterbox/elevenlabs.key)
    if [ "$PERMS" = "600" ]; then
        echo -e "${GREEN}✓${NC} Key file exists with correct permissions (600)"
    else
        echo -e "${YELLOW}⚠${NC} Key file exists but permissions are $PERMS (should be 600)"
        echo "  Run: sudo chmod 600 /etc/monsterbox/elevenlabs.key"
    fi
    
    # Test key validity (mask the key in output)
    KEY=$(cat /etc/monsterbox/elevenlabs.key)
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "xi-api-key: $KEY" \
        https://api.elevenlabs.io/v1/user)
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓${NC} ElevenLabs API key is valid (HTTP $HTTP_CODE)"
    else
        echo -e "${RED}✗${NC} ElevenLabs API key test failed (HTTP $HTTP_CODE)"
        echo "  Expected: 200, Got: $HTTP_CODE"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Key file not found: /etc/monsterbox/elevenlabs.key"
    echo "  Create it with: echo 'sk_YOUR_KEY_HERE' | sudo tee /etc/monsterbox/elevenlabs.key"
    echo "  Then: sudo chmod 600 /etc/monsterbox/elevenlabs.key"
    exit 1
fi
echo ""

# Test 2: Check MonsterBox Service
echo "Test 2: Checking MonsterBox service status..."
if pgrep -f "node.*MonsterBox" > /dev/null; then
    echo -e "${GREEN}✓${NC} MonsterBox service is running"
    
    # Check if API is responding
    if curl -s http://127.0.0.1:3000/api/elevenlabs/status > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} MonsterBox API is responding on port 3000"
    else
        echo -e "${YELLOW}⚠${NC} MonsterBox API not responding on port 3000"
    fi
else
    echo -e "${YELLOW}⚠${NC} MonsterBox service not running"
    echo "  Start with: cd ~/MonsterBox && npm start"
fi
echo ""

# Test 3: Check PipeWire Audio Sinks
echo "Test 3: Checking PipeWire audio sinks..."
if command -v wpctl > /dev/null; then
    echo "Available audio sinks:"
    wpctl status | sed -n '/Sinks:/,/Sources:/p' | head -n 25
    echo ""
    echo -e "${YELLOW}Note:${NC} Verify the correct sink for Orlok's speaker"
    echo "  Update data/character-3/parts.json speaker part (id 24) with correct outputDevice"
else
    echo -e "${YELLOW}⚠${NC} wpctl not found (PipeWire tools not installed)"
fi
echo ""

# Test 4: Check Character TTS Config
echo "Test 4: Checking Orlok TTS configuration..."
TTS_CONFIG="data/character-3/ai-config/tts-config.json"
if [ -f "$TTS_CONFIG" ]; then
    echo -e "${GREEN}✓${NC} TTS config exists: $TTS_CONFIG"
    echo "Content:"
    cat "$TTS_CONFIG" | jq '.' 2>/dev/null || cat "$TTS_CONFIG"
else
    echo -e "${RED}✗${NC} TTS config not found: $TTS_CONFIG"
fi
echo ""

# Test 5: Check Speaker Part Configuration
echo "Test 5: Checking Orlok speaker part configuration..."
PARTS_FILE="data/character-3/parts.json"
if [ -f "$PARTS_FILE" ]; then
    echo -e "${GREEN}✓${NC} Parts file exists: $PARTS_FILE"
    echo "Speaker parts for character 3:"
    cat "$PARTS_FILE" | jq '[.[] | select(.type == "speaker")]' 2>/dev/null || \
        grep -A 10 '"type": "speaker"' "$PARTS_FILE" | head -n 20
else
    echo -e "${RED}✗${NC} Parts file not found: $PARTS_FILE"
fi
echo ""

# Test 6: Test TTS Generation and Playback
echo "Test 6: Testing TTS generation and playback..."
echo "Sending test message to Orlok..."

RESPONSE=$(curl -s -X POST http://127.0.0.1:3000/api/elevenlabs/generate-and-play \
    -H "Content-Type: application/json" \
    -d '{"text":"Orlok voice check. I am the ancient vampire.","characterId":3}')

if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} TTS generation and playback successful"
    echo "Response:"
    echo "$RESPONSE" | jq '.'
    echo ""
    echo -e "${GREEN}Did you hear audio from Orlok's speaker?${NC}"
else
    echo -e "${RED}✗${NC} TTS generation or playback failed"
    echo "Response:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
fi
echo ""

# Test 7: Check Logs for Errors
echo "Test 7: Checking recent logs for errors..."
if [ -f /tmp/monsterbox.out ]; then
    echo "Recent ElevenLabs/TTS related logs:"
    egrep -i "(elevenlabs|tts|mpg123|error)" /tmp/monsterbox.out | tail -n 30 || echo "No matching logs found"
else
    echo -e "${YELLOW}⚠${NC} Log file not found: /tmp/monsterbox.out"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "1. ElevenLabs API key: Check above"
echo "2. MonsterBox service: Check above"
echo "3. PipeWire sinks: Check above"
echo "4. TTS config: Check above"
echo "5. Speaker parts: Check above"
echo "6. TTS playback: Check above"
echo "7. Logs: Check above"
echo ""
echo "Next steps:"
echo "1. If audio didn't play, verify speaker sink in parts.json"
echo "2. Check logs for specific errors"
echo "3. Test ConvAI WebSocket streaming (port 8795)"
echo ""
echo "For ConvAI test, use the web UI at http://192.168.8.120:3000"
echo "=========================================="

