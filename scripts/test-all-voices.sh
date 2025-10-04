#!/bin/bash
# Test all 4 animatronic voices to verify unique voice assignments

set -e

echo "🎃 Testing All Animatronic Voices 🎃"
echo "===================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_voice() {
    local name=$1
    local ip=$2
    local char_id=$3
    local text=$4
    local expected_voice=$5
    
    echo -e "${YELLOW}Testing $name ($ip)...${NC}"
    
    response=$(curl -sS -X POST http://$ip:3000/api/elevenlabs/generate-and-play \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"$text\",\"characterId\":$char_id}" 2>&1)
    
    if echo "$response" | grep -q '"success":true'; then
        voice_id=$(echo "$response" | grep -o '"voiceId":"[^"]*"' | cut -d'"' -f4 || echo "not-shown")
        echo -e "${GREEN}✅ $name: SUCCESS${NC}"
        echo "   Response: $response"
        if [ "$voice_id" != "not-shown" ]; then
            if [ "$voice_id" == "$expected_voice" ]; then
                echo -e "${GREEN}   Voice ID matches: $voice_id${NC}"
            else
                echo -e "${RED}   ⚠️  Voice ID mismatch! Expected: $expected_voice, Got: $voice_id${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ $name: FAILED${NC}"
        echo "   Response: $response"
    fi
    echo ""
    sleep 2
}

# Test all 4 animatronics
echo "Testing Character 1: PumpkinHead"
test_voice "PumpkinHead" "192.168.8.150" "1" "I am PumpkinHead, guardian of the harvest" "5PWbsfogbLtky5sxqtBz"

echo "Testing Character 2: Coffin Breaker"
test_voice "Coffin Breaker" "192.168.8.140" "2" "I am the Coffin Breaker, risen from the grave" "wXvR48IpOq9HACltTmt7"

echo "Testing Character 3: Orlok"
test_voice "Orlok" "192.168.8.120" "3" "I am Orlok, the ancient vampire of the night" "Tj9l48J9AJbry5yCP5eW"

echo "Testing Character 4: Skulltalker"
test_voice "Skulltalker" "192.168.8.130" "4" "I am Skulltalker, keeper of dark secrets" "Z7RrOqZFTyLpIlzCgfsp"

echo "===================================="
echo -e "${GREEN}🎃 Voice Testing Complete! 🎃${NC}"

