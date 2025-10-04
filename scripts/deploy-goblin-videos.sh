#!/bin/bash
# Deploy videos to Goblin displays for Halloween
# Usage: ./deploy-goblin-videos.sh <goblin-ip>

set -e

GOBLIN_IP=${1:-"192.168.8.160"}
GOBLIN_PORT=3001
VIDEO_DIR="data/video-library/files"

echo "🎃 MonsterBox Goblin Video Deployment 🎃"
echo "========================================"
echo "Target Goblin: $GOBLIN_IP:$GOBLIN_PORT"
echo ""

# Check if Goblin is online
echo "Checking Goblin status..."
if ! curl -sS --connect-timeout 5 http://$GOBLIN_IP:$GOBLIN_PORT/health > /dev/null 2>&1; then
    echo "❌ Goblin is offline or not responding"
    echo ""
    echo "To start the Goblin service:"
    echo "  ssh remote@$GOBLIN_IP"
    echo "  cd ~/goblin"
    echo "  npm start"
    echo ""
    echo "Or start as systemd service:"
    echo "  ssh remote@$GOBLIN_IP sudo systemctl start monsterbox-goblin"
    exit 1
fi

echo "✅ Goblin is online"
echo ""

# Get Goblin info
echo "Goblin Information:"
curl -sS http://$GOBLIN_IP:$GOBLIN_PORT/info | jq '.'
echo ""

# Select 5 videos from the library
echo "Selecting videos to deploy..."
VIDEOS=(
    "c1efa5eb-4ff4-4112-9c84-15d99f6ec955.mp4"  # fire
    "07610c3d-6e40-4314-9f96-2f688b445ec3.mp4"  # water
    "da542d7d-7b9c-415a-adb7-cc1b3c725b66.mp4"  # fire_test
    "dad5cf71-097d-42a8-b310-fa6c95fd28e1.mp4"  # water_test
    "3929fd68-49cc-4349-a817-b00bc5e4c3d8.mp4"  # test-video
)

# Deploy each video
for video in "${VIDEOS[@]}"; do
    video_path="$VIDEO_DIR/$video"
    
    if [ ! -f "$video_path" ]; then
        echo "⚠️  Video not found: $video_path"
        continue
    fi
    
    echo "📤 Uploading $video..."
    
    # Upload video to Goblin
    response=$(curl -sS -X POST http://$GOBLIN_IP:$GOBLIN_PORT/upload-video \
        -F "file=@$video_path" 2>&1)
    
    if echo "$response" | grep -q '"success":true'; then
        echo "✅ Uploaded: $video"
    else
        echo "❌ Failed to upload: $video"
        echo "   Response: $response"
    fi
    
    sleep 1
done

echo ""
echo "Setting up video loop..."

# Create a playlist of all videos
PLAYLIST_JSON='{"videos":['
for i in "${!VIDEOS[@]}"; do
    if [ $i -gt 0 ]; then
        PLAYLIST_JSON+=","
    fi
    PLAYLIST_JSON+="\"${VIDEOS[$i]}\""
done
PLAYLIST_JSON+='],"loop":true}'

echo "Playlist: $PLAYLIST_JSON"

# Start video loop on Goblin
echo "Starting video loop..."
curl -sS -X POST http://$GOBLIN_IP:$GOBLIN_PORT/play-video \
    -H "Content-Type: application/json" \
    -d '{"filename":"'${VIDEOS[0]}'","loop":true}' | jq '.'

echo ""
echo "✅ Goblin video deployment complete!"
echo ""
echo "To verify:"
echo "  curl http://$GOBLIN_IP:$GOBLIN_PORT/status | jq '.'"
echo ""
echo "To stop video:"
echo "  curl -X POST http://$GOBLIN_IP:$GOBLIN_PORT/stop-video"
echo ""
echo "To play different video:"
echo "  curl -X POST http://$GOBLIN_IP:$GOBLIN_PORT/play-video \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"filename\":\"video.mp4\",\"loop\":true}'"

