#!/bin/bash
# Test All 5 Animatronics - MonsterBox Deployment Verification
# Tests: PumpkinHead, Mina, Orlok, Sir Dragomir, Groundbreaker

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "MonsterBox - All Animatronics Test"
echo "=========================================="
echo ""

# Character definitions
declare -A CHARACTERS
CHARACTERS[1]="PumpkinHead:192.168.8.150"
CHARACTERS[2]="Mina:192.168.8.140"
CHARACTERS[3]="Orlok:192.168.8.120"
CHARACTERS[4]="Sir Dragomir:192.168.8.130"
CHARACTERS[5]="Groundbreaker:192.168.8.200"

# Test messages
declare -A MESSAGES
MESSAGES[1]="I am PumpkinHead, guardian of the harvest."
MESSAGES[2]="I am Mina, risen from the grave."
MESSAGES[3]="I am Orlok, the ancient vampire lord."
MESSAGES[4]="I am Sir Dragomir, keeper of dark secrets."
MESSAGES[5]="I am Groundbreaker, rising from the earth."

# Track results
TOTAL=0
PASSED=0
FAILED=0

# Test each character
for char_id in {1..5}; do
    IFS=':' read -r name ip <<< "${CHARACTERS[$char_id]}"
    message="${MESSAGES[$char_id]}"
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Testing Character $char_id: $name ($ip)${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    TOTAL=$((TOTAL + 1))
    
    # Check if device is reachable
    echo -n "  Network connectivity... "
    if ! ping -c 1 -W 2 "$ip" > /dev/null 2>&1; then
        echo -e "${RED}✗ FAILED${NC}"
        echo -e "${RED}  Device not reachable at $ip${NC}"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    fi
    echo -e "${GREEN}✓ OK${NC}"
    
    # Check if service is running
    echo -n "  MonsterBox service... "
    if ! curl -s --connect-timeout 3 "http://${ip}:3000/api/elevenlabs/status" > /dev/null 2>&1; then
        echo -e "${RED}✗ FAILED${NC}"
        echo -e "${YELLOW}  Service not responding${NC}"
        FAILED=$((FAILED + 1))
        echo ""
        continue
    fi
    echo -e "${GREEN}✓ OK${NC}"
    
    # Test TTS
    echo -n "  TTS generation & playback... "
    response=$(curl -s -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${message}\",\"characterId\":${char_id}}" \
        --connect-timeout 10 \
        --max-time 30)
    
    if command -v jq >/dev/null 2>&1; then
        if echo "$response" | jq -e '.success' > /dev/null 2>&1; then
            echo -e "${GREEN}✓ OK${NC}"
            device=$(echo "$response" | jq -r '.device // "unknown"')
            voice_id=$(echo "$response" | jq -r '.voiceId // "unknown"')
            echo "    Device: $device"
            echo "    Voice ID: ${voice_id:0:20}..."
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "    Response: $response"
            FAILED=$((FAILED + 1))
        fi
    else
        # Fallback parser without jq
        if echo "$response" | grep -q '"success"\s*:\s*true'; then
            echo -e "${GREEN}✓ OK${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo "    Response: $response"
            FAILED=$((FAILED + 1))
        fi
    fi
    
    echo ""
    sleep 2  # Brief pause between tests
done

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Total animatronics tested: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL ANIMATRONICS OPERATIONAL!${NC}"
    echo ""
    echo "MonsterBox is successfully deployed to all 5 animatronics:"
    echo "  1. PumpkinHead (192.168.8.150)"
    echo "  2. Mina (192.168.8.140)"
    echo "  3. Orlok (192.168.8.120)"
    echo "  4. Sir Dragomir (192.168.8.130)"
    echo "  5. Groundbreaker (192.168.8.200)"
    echo ""
    echo "Next steps:"
    echo "  - Configure multi-animatronic communication"
    echo "  - Test inter-animatronic conversations"
    echo "  - Verify AI agent assignments"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED!${NC}"
    echo ""
    echo "Check the output above for details."
    exit 1
fi

