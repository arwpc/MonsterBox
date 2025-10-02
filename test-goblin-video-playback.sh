#!/bin/bash
# Test Goblin Video Playback - Deep Testing
# Tests video playback on all goblins with different videos

echo "🎃 HAPPY HALLOWEEN! Testing Goblin Video Playback 🎃"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Goblin configurations (add more as needed)
GOBLINS=("192.168.8.160:3001" "192.168.8.161:3001")
GOBLIN_NAMES=("Goblin 1" "Goblin 2")

# To add more goblins, just add to the arrays:
# GOBLINS=("192.168.8.160:3001" "192.168.8.161:3001" "192.168.8.162:3001")
# GOBLIN_NAMES=("Goblin 1" "Goblin 2" "Goblin 3")

# Test 1: Check goblin health
echo "📡 Test 1: Checking Goblin Health..."
for i in "${!GOBLINS[@]}"; do
    GOBLIN="${GOBLINS[$i]}"
    NAME="${GOBLIN_NAMES[$i]}"
    
    HEALTH=$(curl -s "http://$GOBLIN/health" 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $NAME is online"
    else
        echo -e "${RED}✗${NC} $NAME is offline"
    fi
done
echo ""

# Test 2: Get video libraries
echo "📹 Test 2: Checking Video Libraries..."
for i in "${!GOBLINS[@]}"; do
    GOBLIN="${GOBLINS[$i]}"
    NAME="${GOBLIN_NAMES[$i]}"
    
    VIDEO_COUNT=$(curl -s "http://$GOBLIN/video-library/api/videos" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('count', 0))" 2>/dev/null)
    if [ ! -z "$VIDEO_COUNT" ]; then
        echo -e "${GREEN}✓${NC} $NAME has $VIDEO_COUNT videos"
    else
        echo -e "${RED}✗${NC} $NAME video library error"
    fi
done
echo ""

# Test 3: Play different videos on each goblin
echo "🎬 Test 3: Playing Different Videos on Each Goblin..."

# Get first video from Goblin 1
VIDEO1=$(curl -s "http://${GOBLINS[0]}/video-library/api/videos" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['videos'][0]['path'] if d.get('videos') else '')" 2>/dev/null)

# Get second video from Goblin 2
VIDEO2=$(curl -s "http://${GOBLINS[1]}/video-library/api/videos" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['videos'][1]['path'] if len(d.get('videos', [])) > 1 else d['videos'][0]['path'])" 2>/dev/null)

if [ ! -z "$VIDEO1" ]; then
    echo "Playing '$VIDEO1' on Goblin 1..."
    RESULT=$(curl -s -X POST "http://${GOBLINS[0]}/play-video" \
        -H "Content-Type: application/json" \
        -d "{\"filename\": \"$VIDEO1\", \"loop\": false}" 2>/dev/null)
    
    if echo "$RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✓${NC} Goblin 1 playing: $VIDEO1"
    else
        echo -e "${RED}✗${NC} Goblin 1 playback failed"
    fi
else
    echo -e "${YELLOW}⚠${NC} No videos found on Goblin 1"
fi

sleep 2

if [ ! -z "$VIDEO2" ]; then
    echo "Playing '$VIDEO2' on Goblin 2..."
    RESULT=$(curl -s -X POST "http://${GOBLINS[1]}/play-video" \
        -H "Content-Type: application/json" \
        -d "{\"filename\": \"$VIDEO2\", \"loop\": false}" 2>/dev/null)
    
    if echo "$RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✓${NC} Goblin 2 playing: $VIDEO2"
    else
        echo -e "${RED}✗${NC} Goblin 2 playback failed"
    fi
else
    echo -e "${YELLOW}⚠${NC} No videos found on Goblin 2"
fi

echo ""
echo "⏱️  Waiting 10 seconds for playback..."
sleep 10

# Test 4: Stop all playback
echo ""
echo "🛑 Test 4: Stopping All Playback..."
for i in "${!GOBLINS[@]}"; do
    GOBLIN="${GOBLINS[$i]}"
    NAME="${GOBLIN_NAMES[$i]}"
    
    RESULT=$(curl -s -X POST "http://$GOBLIN/stop-all" 2>/dev/null)
    if echo "$RESULT" | grep -q '"success":true'; then
        echo -e "${GREEN}✓${NC} $NAME playback stopped"
    else
        echo -e "${RED}✗${NC} $NAME stop failed"
    fi
done

echo ""
echo "=================================================="
echo "🎃 Testing Complete! Check HDMI outputs for video quality 🎃"
echo ""
echo "Manual checks:"
echo "  - Did videos fade in smoothly?"
echo "  - Was there any console flash between videos?"
echo "  - Was playback smooth at 1080p?"
echo "  - Did different videos play on each goblin?"
echo ""

