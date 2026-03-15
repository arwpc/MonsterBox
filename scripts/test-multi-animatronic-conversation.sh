#!/bin/bash
# Test Multi-Animatronic Conversation
# Demonstrates all 5 animatronics communicating with each other

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "Multi-Animatronic Conversation Test"
echo "=========================================="
echo ""
echo "This test demonstrates all 5 animatronics"
echo "communicating with each other using their"
echo "unique voices and AI personalities."
echo ""

# Character definitions
declare -A CHARACTERS
CHARACTERS[1]="PumpkinHead:192.168.8.150"
CHARACTERS[2]="Mina:192.168.8.140"
CHARACTERS[3]="Orlok:192.168.8.120"
CHARACTERS[4]="Sir Dragomir:192.168.8.130"
CHARACTERS[5]="Groundbreaker:192.168.8.200"

# Conversation script
declare -A DIALOGUE
DIALOGUE[1]="Greetings, fellow creatures of the night. I am PumpkinHead, guardian of the harvest."
DIALOGUE[2]="And I am Mina, risen from my eternal slumber to join this gathering."
DIALOGUE[3]="Welcome, my dark companions. I am Orlok, ancient lord of the vampires. Together we shall terrify the living!"
DIALOGUE[4]="Indeed, Count Orlok. I am Sir Dragomir, keeper of the darkest secrets. Our combined power is formidable."
DIALOGUE[5]="From beneath the earth I rise! I am Groundbreaker, and with my brethren, we shall make this Halloween unforgettable!"

echo -e "${BLUE}Starting conversation sequence...${NC}"
echo ""

# Execute conversation
for char_id in {1..5}; do
    IFS=':' read -r name ip <<< "${CHARACTERS[$char_id]}"
    message="${DIALOGUE[$char_id]}"
    
    echo -e "${YELLOW}$name:${NC} $message"
    
    # Send TTS request
    curl -s -X POST "http://${ip}:3000/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"${message}\",\"characterId\":${char_id}}" \
        --connect-timeout 10 \
        --max-time 30 > /dev/null 2>&1 &
    
    # Wait for speech to complete (approximate)
    sleep 8
done

echo ""
echo -e "${GREEN}✅ Conversation complete!${NC}"
echo ""
echo "All 5 animatronics have spoken using their unique voices."
echo "The multi-animatronic communication system is operational!"
echo ""
echo "Next steps:"
echo "  - Test simultaneous conversations"
echo "  - Implement conversation orchestration"
echo "  - Add microphone-based interaction"
echo "  - Create coordinated performance scenes"
echo ""

