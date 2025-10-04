#!/bin/bash
# Play 5 Halloween videos on Goblin displays
# Videos are stored locally on Goblins at /home/remote/goblin/media/video/

set -e

GOBLIN_IP=${1:-"192.168.8.161"}
GOBLIN_PORT=3001

echo "🎃 MonsterBox Goblin Video Player 🎃"
echo "====================================="
echo "Target Goblin: $GOBLIN_IP:$GOBLIN_PORT"
echo ""

# Check if Goblin is online
echo "Checking Goblin status..."
if ! curl -sS --connect-timeout 5 http://$GOBLIN_IP:$GOBLIN_PORT/health > /dev/null 2>&1; then
    echo "❌ Goblin is offline or not responding"
    exit 1
fi

echo "✅ Goblin is online"
echo ""

# 5 Halloween videos (stored locally on Goblin)
VIDEOS=(
    "Poltergeist/PHA_Poltergeist_AmpedUp_Win_H.mp4"
    "fire/559_JB_HD.mov"
    "ethereal/312_JB_HD.mov"
    "Poltergeist/PHA_Poltergeist_ElecrticSlide_Win_H.mp4"
    "ethereal/407_JB_HD.mov"
)

# Play mode: single video with loop or cycle through all
MODE=${2:-"cycle"}

if [ "$MODE" = "single" ]; then
    # Play first video on loop
    echo "🎬 Playing single video on loop: ${VIDEOS[0]}"
    curl -X POST http://$GOBLIN_IP:$GOBLIN_PORT/play-video \
        -H "Content-Type: application/json" \
        -d "{\"filename\":\"${VIDEOS[0]}\",\"loop\":true}" \
        -s | jq '.'
    
    echo ""
    echo "✅ Video playing on loop"
    echo ""
    echo "To stop: curl -X POST http://$GOBLIN_IP:$GOBLIN_PORT/stop-video"
    
elif [ "$MODE" = "cycle" ]; then
    # Cycle through all videos
    echo "🎬 Cycling through 5 videos..."
    echo ""
    
    for i in "${!VIDEOS[@]}"; do
        video="${VIDEOS[$i]}"
        echo "[$((i+1))/5] Playing: $video"
        
        curl -X POST http://$GOBLIN_IP:$GOBLIN_PORT/play-video \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"$video\",\"loop\":false}" \
            -s | jq -r '.message'
        
        # Wait 30 seconds before next video (adjust as needed)
        if [ $i -lt $((${#VIDEOS[@]} - 1)) ]; then
            echo "   Waiting 30 seconds..."
            sleep 30
        fi
    done
    
    echo ""
    echo "✅ All videos played!"
    echo ""
    echo "To loop, run: $0 $GOBLIN_IP single"
    
else
    echo "❌ Invalid mode: $MODE"
    echo "Usage: $0 <goblin-ip> [single|cycle]"
    exit 1
fi

echo ""
echo "📊 Current status:"
curl -s http://$GOBLIN_IP:$GOBLIN_PORT/status | jq '.playback'

