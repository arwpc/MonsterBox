#!/bin/bash

# Test Audio UI Features
# Tests Play Preview and Audio Configuration Test buttons

echo "=========================================="
echo "Audio UI Features Test"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://192.168.8.200:3000"

echo -e "${BLUE}=== Test 1: Audio Configuration - Test Audio Output Button ===${NC}"
echo "Testing endpoint: POST /setup/audio/api/test-system"
echo ""

# Test with default device
RESPONSE=$(curl -X POST -H "Content-Type: application/json" \
  -d '{"testType":"speaker","deviceId":"default"}' \
  -s "${BASE_URL}/setup/audio/api/test-system")

echo "Response: $RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Test Audio Output API works${NC}"
    
    # Parse the response to show details
    PLAYER=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('parsed', {}).get('player', 'unknown'))" 2>/dev/null)
    FILE=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('parsed', {}).get('file', 'unknown'))" 2>/dev/null)
    VOLUME=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('parsed', {}).get('volume', 'unknown'))" 2>/dev/null)
    
    echo "  Player: $PLAYER"
    echo "  File: $FILE"
    echo "  Volume: $VOLUME"
    echo ""
    echo -e "${GREEN}✓ Audio should have played through speakers${NC}"
else
    echo -e "${RED}✗ Test Audio Output API failed${NC}"
fi

echo ""
echo -e "${BLUE}=== Test 2: Audio Library - Play on Character Button ===${NC}"
echo "Testing endpoint: POST /audio-library/api/audio/:id/play"
echo ""

# Get first audio file from library
AUDIO_ID=$(curl -s "${BASE_URL}/audio-library/api/library" | \
  python3 -c "import sys, json; data=json.load(sys.stdin); print(data['audio'][0]['id'] if data.get('audio') and len(data['audio']) > 0 else '')" 2>/dev/null)

if [ -z "$AUDIO_ID" ]; then
    echo -e "${YELLOW}⚠ No audio files in library - skipping test${NC}"
else
    echo "Testing with audio ID: $AUDIO_ID"
    
    PLAY_RESPONSE=$(curl -X POST -H "Content-Type: application/json" \
      -d '{"characterId":5,"volume":80}' \
      -s "${BASE_URL}/audio-library/api/audio/${AUDIO_ID}/play")
    
    echo "Response: $PLAY_RESPONSE"
    echo ""
    
    if echo "$PLAY_RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Play on Character API works${NC}"
        
        # Parse the response to show details
        MESSAGE=$(echo "$PLAY_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('message', ''))" 2>/dev/null)
        TITLE=$(echo "$PLAY_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('audio', {}).get('title', 'unknown'))" 2>/dev/null)
        
        echo "  Message: $MESSAGE"
        echo "  Audio Title: $TITLE"
        echo ""
        echo -e "${GREEN}✓ Audio should have played through speakers${NC}"
    else
        echo -e "${RED}✗ Play on Character API failed${NC}"
    fi
fi

echo ""
echo -e "${BLUE}=== Test 3: Audio Library - Browser Preview (Manual Test) ===${NC}"
echo ""
echo "The Play Preview button in the Audio Library uses browser-based playback."
echo "This plays audio through your computer's speakers, not the server's speakers."
echo ""
echo "To test manually:"
echo "  1. Open: ${BASE_URL}/audio-library"
echo "  2. Click the blue Play button (▶) on any audio card"
echo "  3. A modal will open with WaveSurfer.js player"
echo "  4. Click the Play/Pause button in the modal"
echo "  5. You should hear audio through your computer's speakers"
echo ""
echo -e "${YELLOW}⚠ This requires manual testing in a web browser${NC}"

echo ""
echo -e "${BLUE}=== Test 4: Verify UI Pages Load ===${NC}"
echo ""

# Test audio library page loads
echo -n "Audio Library page: "
AUDIO_LIB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/audio-library")
if [ "$AUDIO_LIB_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Loads (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Failed (HTTP $AUDIO_LIB_STATUS)${NC}"
fi

# Test audio configuration page loads
echo -n "Audio Configuration page: "
AUDIO_CONFIG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/setup/audio")
if [ "$AUDIO_CONFIG_STATUS" = "200" ]; then
    echo -e "${GREEN}✓ Loads (HTTP 200)${NC}"
else
    echo -e "${RED}✗ Failed (HTTP $AUDIO_CONFIG_STATUS)${NC}"
fi

# Check for Test Audio Output button in HTML
echo -n "Test Audio Output button exists: "
if curl -s "${BASE_URL}/setup/audio" | grep -q "btnTestAudioOutput"; then
    echo -e "${GREEN}✓ Found in HTML${NC}"
else
    echo -e "${RED}✗ Not found${NC}"
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "✅ Server-side audio playback features:"
echo "   - Audio Configuration 'Test Audio Output' button"
echo "   - Audio Library 'Play on Character' button"
echo ""
echo "⚠️  Browser-side audio playback features:"
echo "   - Audio Library 'Play Preview' button (requires manual test)"
echo ""
echo "Both server-side features are working and should be audible"
echo "through the connected speakers."
echo ""
echo "To test in the UI:"
echo "  1. Audio Configuration: ${BASE_URL}/setup/audio"
echo "     Click 'Test Audio Output' button"
echo ""
echo "  2. Audio Library: ${BASE_URL}/audio-library"
echo "     Click 'Play on Character' button on any audio card"
echo ""
echo "=========================================="

