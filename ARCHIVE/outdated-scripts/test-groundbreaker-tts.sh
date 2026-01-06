#!/bin/bash

# GroundBreaker TTS Testing Script
# Comprehensive testing of Text-to-Speech functionality for GroundBreaker
# Run this script on GroundBreaker: bash scripts/test-groundbreaker-tts.sh

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() { echo -e "${BLUE}>>> $1${NC}"; }
print_error() { echo -e "${RED}>>> Error: $1${NC}"; }
print_success() { echo -e "${GREEN}>>> Success: $1${NC}"; }
print_warning() { echo -e "${YELLOW}>>> Warning: $1${NC}"; }
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

CHARACTER_ID=5
CHARACTER_NAME="Groundbreaker"
BASE_URL="http://localhost:3000"

print_header "GroundBreaker TTS Testing Suite"
print_status "Character: $CHARACTER_NAME (ID: $CHARACTER_ID)"
print_status "Base URL: $BASE_URL"
echo ""

# ============================================================================
# Test 1: Check MonsterBox is Running
# ============================================================================
print_header "Test 1: Server Status Check"

if curl -s -f "$BASE_URL" >/dev/null 2>&1; then
    print_success "MonsterBox server is running"
else
    print_error "MonsterBox server is not responding"
    print_status "Start MonsterBox with: npm start"
    exit 1
fi

echo ""

# ============================================================================
# Test 2: Check Audio System
# ============================================================================
print_header "Test 2: Audio System Check"

# Check PipeWire
if systemctl --user is-active --quiet pipewire; then
    print_success "PipeWire is running"
else
    print_warning "PipeWire is not running"
    print_status "Start with: systemctl --user start pipewire"
fi

# Check WirePlumber
if systemctl --user is-active --quiet wireplumber; then
    print_success "WirePlumber is running"
else
    print_warning "WirePlumber is not running"
    print_status "Start with: systemctl --user start wireplumber"
fi

# List audio devices
print_status "Audio playback devices:"
aplay -l 2>/dev/null | grep -E "card|device" || print_warning "Could not list audio devices"

echo ""

# ============================================================================
# Test 3: Simple TTS Test
# ============================================================================
print_header "Test 3: Simple TTS Generation and Playback"

TEST_TEXT="Hello, I am GroundBreaker. This is a test of my text to speech system."

print_status "Testing TTS with text: \"$TEST_TEXT\""
print_status "Sending request to API..."

RESPONSE=$(curl -s -X POST "$BASE_URL/api/elevenlabs/generate-and-play" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"$TEST_TEXT\",\"characterId\":$CHARACTER_ID}" \
    2>&1)

if echo "$RESPONSE" | grep -q '"success":true'; then
    print_success "TTS generation and playback successful!"
    echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
else
    print_error "TTS test failed"
    echo "$RESPONSE"
fi

echo ""
sleep 2

# ============================================================================
# Test 4: AI Agent TTS Test
# ============================================================================
print_header "Test 4: AI Agent Conversation Test"

AI_TEST_TEXT="Tell me about yourself in one sentence"

print_status "Testing AI agent with prompt: \"$AI_TEST_TEXT\""
print_status "This will use GroundBreaker's AI agent..."

RESPONSE=$(curl -s -X POST "$BASE_URL/api/elevenlabs/conversation/test" \
    -H "Content-Type: application/json" \
    -d "{\"agentId\":\"agent_4201k6s9y384f9v9hqmg67ygc645\",\"text\":\"$AI_TEST_TEXT\"}" \
    2>&1)

if echo "$RESPONSE" | grep -q '"success":true'; then
    print_success "AI conversation successful!"
    
    # Extract reply text
    REPLY=$(echo "$RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('replyText', 'No reply'))" 2>/dev/null || echo "Could not parse reply")
    print_status "AI Reply: $REPLY"
    
    # Check if agent was actually used
    if echo "$RESPONSE" | grep -q '"agentUsed":true'; then
        print_success "AI agent was used (not fallback)"
    else
        print_warning "Fallback response used (AI agent may not be working)"
    fi
else
    print_error "AI conversation test failed"
    echo "$RESPONSE"
fi

echo ""
sleep 2

# ============================================================================
# Test 5: Multiple TTS Tests with Different Phrases
# ============================================================================
print_header "Test 5: Multiple TTS Phrases"

PHRASES=(
    "Welcome to the haunted house"
    "I am rising from the grave"
    "Beware all who enter here"
    "The spirits are restless tonight"
)

for i in "${!PHRASES[@]}"; do
    PHRASE="${PHRASES[$i]}"
    print_status "Test $((i+1))/${#PHRASES[@]}: \"$PHRASE\""
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"$PHRASE\",\"characterId\":$CHARACTER_ID}" \
        2>&1)
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        print_success "✓ Phrase $((i+1)) played successfully"
    else
        print_error "✗ Phrase $((i+1)) failed"
    fi
    
    sleep 3  # Wait between phrases
done

echo ""

# ============================================================================
# Test 6: Volume Test
# ============================================================================
print_header "Test 6: Volume Level Test"

print_status "Testing different volume levels..."

for VOLUME in 50 75 100; do
    print_status "Testing volume: $VOLUME%"
    
    RESPONSE=$(curl -s -X POST "$BASE_URL/api/elevenlabs/generate-and-play" \
        -H "Content-Type: application/json" \
        -d "{\"text\":\"Testing volume at $VOLUME percent\",\"characterId\":$CHARACTER_ID,\"volume\":$VOLUME}" \
        2>&1)
    
    if echo "$RESPONSE" | grep -q '"success":true'; then
        print_success "✓ Volume $VOLUME% test passed"
    else
        print_error "✗ Volume $VOLUME% test failed"
    fi
    
    sleep 3
done

echo ""

# ============================================================================
# Test 7: Speaker Device Check
# ============================================================================
print_header "Test 7: Speaker Configuration Check"

PARTS_FILE="data/character-5/parts.json"

if [ -f "$PARTS_FILE" ]; then
    print_status "Checking speaker configuration in $PARTS_FILE..."
    
    SPEAKER_INFO=$(cat "$PARTS_FILE" | python3 -c "
import sys, json
try:
    parts = json.load(sys.stdin)
    speakers = [p for p in parts if p.get('type', '').lower() == 'speaker']
    if speakers:
        for s in speakers:
            print(f\"Speaker: {s.get('name', 'Unknown')}\")
            print(f\"  Device: {s.get('config', {}).get('outputDevice', 'default')}\")
    else:
        print('No speaker configured')
except:
    print('Error parsing parts file')
" 2>/dev/null)
    
    if [ -n "$SPEAKER_INFO" ]; then
        echo "$SPEAKER_INFO"
    else
        print_warning "No speaker part found in configuration"
        print_status "Add a speaker part via the web interface: $BASE_URL/setup/calibration"
    fi
else
    print_warning "Parts file not found: $PARTS_FILE"
fi

echo ""

# ============================================================================
# Test 8: Audio Config Check
# ============================================================================
print_header "Test 8: Audio Configuration Check"

AUDIO_CONFIG="data/character-5/audio-config.json"

if [ -f "$AUDIO_CONFIG" ]; then
    print_success "Audio config found: $AUDIO_CONFIG"
    print_status "Current audio settings:"
    cat "$AUDIO_CONFIG" | python3 -m json.tool | grep -E '"microphone"|"enabled"|"sensitivity"' | head -10
else
    print_warning "Audio config not found: $AUDIO_CONFIG"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
print_header "TTS Testing Complete!"

print_status "Summary:"
echo "  ✓ Server status checked"
echo "  ✓ Audio system verified"
echo "  ✓ Simple TTS tested"
echo "  ✓ AI agent tested"
echo "  ✓ Multiple phrases tested"
echo "  ✓ Volume levels tested"
echo "  ✓ Configuration checked"

echo ""
print_success "All TTS tests completed!"
print_status "If you heard audio output, TTS is working correctly."
print_status "If not, check:"
echo "  1. USB speaker is connected and recognized"
echo "  2. PipeWire/WirePlumber are running"
echo "  3. Speaker part is configured in MonsterBox"
echo "  4. Volume is not muted"
echo ""
print_status "Web Interface: $BASE_URL"
print_status "Conversation Page: $BASE_URL/conversation"
echo ""

