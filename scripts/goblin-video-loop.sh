#!/bin/bash

# MonsterBox 5.5 - Goblin1 5-Video Loop Script
# Cycles through 5 videos on Goblin1 display with configurable timing

GOBLIN_ENDPOINT="${GOBLIN_ENDPOINT:-http://192.168.8.160:3001}"
LOOP_DELAY="${LOOP_DELAY:-30}"  # Seconds between video changes
LOOP_COUNT="${LOOP_COUNT:-0}"   # 0 = infinite loop

# Video playlist (UUIDs from video library)
VIDEOS=(
    "c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4"
    "07610c3d-6e40-4314-9f96-2f688b445ec3.mp4"
    "da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4"
    "dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4"
    "3929fd68-49cc-4349-a817-b00bc5e4c3d8.mp4"
)

echo "🎃 MonsterBox 5.5 - Goblin1 Video Loop"
echo "======================================"
echo "Endpoint: $GOBLIN_ENDPOINT"
echo "Videos: ${#VIDEOS[@]}"
echo "Loop delay: ${LOOP_DELAY}s"
echo "Loop count: $([ $LOOP_COUNT -eq 0 ] && echo 'infinite' || echo $LOOP_COUNT)"
echo ""

# Check Goblin1 status
echo "🔍 Checking Goblin1 status..."
STATUS=$(curl -sS --connect-timeout 5 "$GOBLIN_ENDPOINT/status" 2>/dev/null)
if [ $? -ne 0 ]; then
    echo "❌ ERROR: Cannot connect to Goblin1 at $GOBLIN_ENDPOINT"
    exit 1
fi

echo "✅ Goblin1 online"
echo ""

# Function to play a video
play_video() {
    local filename="$1"
    local loop="${2:-false}"
    
    echo "🎬 Playing: $filename (loop: $loop)"
    
    RESULT=$(curl -sS -X POST "$GOBLIN_ENDPOINT/play-video" \
        -H "Content-Type: application/json" \
        -d "{\"filename\":\"$filename\",\"loop\":$loop}" 2>/dev/null)
    
    SUCCESS=$(echo "$RESULT" | jq -r '.success' 2>/dev/null)
    
    if [ "$SUCCESS" = "true" ]; then
        echo "   ✅ Started"
        return 0
    else
        ERROR=$(echo "$RESULT" | jq -r '.error' 2>/dev/null)
        echo "   ❌ Failed: $ERROR"
        return 1
    fi
}

# Function to stop video
stop_video() {
    echo "⏹️  Stopping current video..."
    curl -sS -X POST "$GOBLIN_ENDPOINT/stop-video" >/dev/null 2>&1
}

# Trap Ctrl+C to stop video on exit
trap 'echo ""; echo "🛑 Stopping..."; stop_video; exit 0' INT TERM

# Main loop
iteration=0
while true; do
    iteration=$((iteration + 1))
    
    if [ $LOOP_COUNT -gt 0 ] && [ $iteration -gt $LOOP_COUNT ]; then
        echo ""
        echo "✅ Completed $LOOP_COUNT loops"
        break
    fi
    
    echo "🔄 Loop iteration: $iteration"
    echo "---"
    
    for video in "${VIDEOS[@]}"; do
        play_video "$video" false
        
        if [ $? -eq 0 ]; then
            sleep "$LOOP_DELAY"
        else
            echo "   ⚠️  Skipping to next video"
            sleep 2
        fi
    done
    
    echo ""
done

echo "🎃 Video loop complete"

