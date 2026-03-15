#!/bin/bash
# Test All Animatronics TTS
# Usage: ./scripts/test-all-animatronics.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "Testing All Animatronics TTS"
echo "=========================================="
echo ""

# Character definitions
declare -A CHARACTERS
CHARACTERS[1]="PumpkinHead:192.168.8.150"
CHARACTERS[2]="Mina:192.168.8.140"
CHARACTERS[3]="Orlok:192.168.8.120"
CHARACTERS[4]="Sir Dragomir:192.168.8.130"

# Test messages
declare -A MESSAGES
MESSAGES[1]="I am PumpkinHead, guardian of the harvest."
MESSAGES[2]="I am Mina, risen from the grave."
MESSAGES[3]="I am Orlok, the ancient vampire lord."
MESSAGES[4]="I am Sir Dragomir, keeper of dark secrets."

# Test each character
for char_id in {1..4}; do
    IFS=':' read -r name ip <<< "${CHARACTERS[$char_id]}"
    message="${MESSAGES[$char_id]}"
    
    echo -e "${BLUE}Testing Character $char_id: $name ($ip)${NC}"
    echo "Message: $message"
    
    # Check if device is reachable
    if ! ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        echo -e "${RED}✗${NC} Device not reachable at $ip"
        echo ""
        continue
    fi
    echo -e "${GREEN}✓${NC} Device reachable"
    
    # Check if service is running
    if ! curl -s --connect-timeout 3 "http://${ip}:3000/api/elevenlabs/status" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠${NC} MonsterBox service not responding"
        echo ""
        continue
    fi
    echo -e "${GREEN}✓${NC} Service responding"
    
    # Test TTS
    echo "Sending TTS request..."
    response=$(curl -s -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${message}\",\"characterId\":${char_id}}" \
        --connect-timeout 10 \
        --max-time 30)
    
    if command -v jq >/dev/null 2>&1; then
        if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} TTS generation and playback successful"
            device=$(echo "$response" | jq -r '.device // "unknown"')
            voice_id=$(echo "$response" | jq -r '.voiceId // "unknown"')
            echo "  Device: $device"
            echo "  Voice ID: $voice_id"
        else
            echo -e "${RED}✗${NC} TTS generation or playback failed"
            echo "Response: $response"
        fi
    else
        # Fallback parser without jq
        if echo "$response" | grep -q '"success"\s*:\s*true'; then
            echo -e "${GREEN}✓${NC} TTS generation and playback successful"
            echo "  Device: $(echo "$response" | sed -n 's/.*"device"\s*:\s*"\([^"]*\)".*/\1/p' | head -n1 | sed 's/.*/&/;t;d' || echo unknown)"
            echo "  Voice ID: $(echo "$response" | sed -n 's/.*"voiceId"\s*:\s*"\([^"]*\)".*/\1/p' | head -n1 | sed 's/.*/&/;t;d' || echo unknown)"
        else
            echo -e "${RED}✗${NC} TTS generation or playback failed"
            echo "Response: $response"
        fi
    fi
    
    echo ""
    sleep 2  # Brief pause between tests
done

echo "=========================================="
echo "Test Complete"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Check if you heard audio from each animatronic"
echo "- Verify each used correct speaker device"
echo "- Confirm voice IDs are appropriate for each character"
echo ""
echo "Next steps:"
echo "1. If any failed, check logs on that device"
echo "2. Verify speaker routing in parts.json"
echo "3. Test ConvAI WebSocket streaming"
echo "4. Assign unique voices to each character"
echo ""

