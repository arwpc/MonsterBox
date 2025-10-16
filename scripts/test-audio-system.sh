#!/bin/bash

# MonsterBox Audio System Diagnostic and Test Script
# Tests all audio playback methods and provides troubleshooting information

echo "=========================================="
echo "MonsterBox Audio System Diagnostic"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check audio tools
echo -e "${BLUE}=== Checking Audio Tools ===${NC}"
echo -n "pw-play: "
if which pw-play > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

echo -n "paplay: "
if which paplay > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed (REQUIRED - install with: sudo apt-get install pulseaudio-utils)${NC}"
fi

echo -n "mpg123: "
if which mpg123 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

echo -n "ffmpeg: "
if which ffmpeg > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

echo -n "aplay: "
if which aplay > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Installed${NC}"
else
    echo -e "${RED}✗ Not installed${NC}"
fi

echo ""
echo -e "${BLUE}=== PipeWire Status ===${NC}"
wpctl status | head -30

echo ""
echo -e "${BLUE}=== Audio Devices ===${NC}"
wpctl status | grep -A 20 "Sinks:"

echo ""
echo -e "${BLUE}=== Default Sink ===${NC}"
DEFAULT_SINK=$(wpctl status | grep "Sinks:" -A 10 | grep "\*" | head -1 | awk '{print $2}' | tr -d '.')
if [ -n "$DEFAULT_SINK" ]; then
    echo "Default sink ID: $DEFAULT_SINK"
    wpctl get-volume $DEFAULT_SINK
else
    echo -e "${RED}No default sink found${NC}"
fi

echo ""
echo -e "${BLUE}=== Testing Audio Playback ===${NC}"

# Test 1: System test tone with aplay
echo -n "Test 1 - System test tone (aplay): "
if [ -f "/usr/share/sounds/alsa/Front_Center.wav" ]; then
    if timeout 5 aplay /usr/share/sounds/alsa/Front_Center.wav > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Success${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test file not found${NC}"
fi

# Test 2: MonsterBox API test
echo -n "Test 2 - MonsterBox API test: "
RESULT=$(curl -X POST -s http://192.168.8.200:3000/api/audio/test)
if echo "$RESULT" | grep -q '"success":true'; then
    echo -e "${GREEN}✓ Success${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "Response: $RESULT"
fi

# Test 3: Play audio from library
echo -n "Test 3 - Audio Library playback: "
AUDIO_ID=$(curl -s http://192.168.8.200:3000/audio-library/api/library | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['audio'][0]['id'] if data.get('audio') and len(data['audio']) > 0 else '')" 2>/dev/null)
if [ -n "$AUDIO_ID" ]; then
    PLAY_RESULT=$(curl -X POST -H "Content-Type: application/json" -d '{"characterId":5,"volume":80}' -s "http://192.168.8.200:3000/audio-library/api/audio/$AUDIO_ID/play")
    if echo "$PLAY_RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Success${NC}"
        echo "  Played: $(echo "$PLAY_RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', ''))" 2>/dev/null)"
    else
        echo -e "${RED}✗ Failed${NC}"
        echo "  Response: $PLAY_RESULT"
    fi
else
    echo -e "${YELLOW}⚠ No audio files in library${NC}"
fi

# Test 4: Direct pw-play test
echo -n "Test 4 - Direct pw-play test: "
if [ -f "/usr/share/sounds/alsa/Front_Center.wav" ]; then
    if timeout 5 pw-play /usr/share/sounds/alsa/Front_Center.wav > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Success${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Test file not found${NC}"
fi

# Test 5: Direct paplay test (if available)
if which paplay > /dev/null 2>&1; then
    echo -n "Test 5 - Direct paplay test: "
    if [ -f "/usr/share/sounds/alsa/Front_Center.wav" ]; then
        if timeout 5 paplay /usr/share/sounds/alsa/Front_Center.wav > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Success${NC}"
        else
            echo -e "${RED}✗ Failed${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Test file not found${NC}"
    fi
fi

echo ""
echo -e "${BLUE}=== Volume Levels ===${NC}"
if [ -n "$DEFAULT_SINK" ]; then
    VOLUME=$(wpctl get-volume $DEFAULT_SINK | awk '{print $2}')
    VOLUME_PCT=$(echo "$VOLUME * 100" | bc)
    echo "Default sink volume: ${VOLUME_PCT}%"
    
    if (( $(echo "$VOLUME < 0.1" | bc -l) )); then
        echo -e "${RED}⚠ Volume is very low! Increase with: wpctl set-volume $DEFAULT_SINK 0.9${NC}"
    elif (( $(echo "$VOLUME < 0.5" | bc -l) )); then
        echo -e "${YELLOW}⚠ Volume is low. Consider increasing with: wpctl set-volume $DEFAULT_SINK 0.9${NC}"
    else
        echo -e "${GREEN}✓ Volume level is good${NC}"
    fi
fi

echo ""
echo -e "${BLUE}=== Troubleshooting Tips ===${NC}"
echo "1. If no sound is heard:"
echo "   - Check physical speaker connections"
echo "   - Verify speakers are powered on"
echo "   - Check volume levels: wpctl get-volume <sink-id>"
echo "   - Increase volume: wpctl set-volume <sink-id> 0.9"
echo ""
echo "2. If paplay is missing:"
echo "   - Install with: sudo apt-get install pulseaudio-utils"
echo "   - Restart MonsterBox: sudo systemctl restart monsterbox"
echo ""
echo "3. To change default audio device:"
echo "   - List devices: wpctl status"
echo "   - Set default: wpctl set-default <sink-id>"
echo ""
echo "4. To test specific audio file:"
echo "   - WAV: pw-play /path/to/file.wav"
echo "   - MP3: mpg123 /path/to/file.mp3"
echo ""
echo "5. Check MonsterBox logs:"
echo "   - journalctl -u monsterbox -f"
echo ""

echo "=========================================="
echo "Diagnostic Complete"
echo "=========================================="

