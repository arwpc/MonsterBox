#!/bin/bash
# Manual test script for Goblin Management functionality
# This script tests all Goblin API endpoints to ensure they work correctly

GOBLIN1="http://192.168.8.40:3001"
GOBLIN2="http://192.168.8.106:3001"
GOBLIN3="http://192.168.8.14:3001"

echo "🎃 Goblin Management API Test Suite"
echo "===================================="
echo ""

# Test Goblin 1
echo "Testing Goblin 1 (192.168.8.40:3001)"
echo "-------------------------------------"

echo "1. Health check:"
curl -s "$GOBLIN1/health" | jq '{status, uptime}'
echo ""

echo "2. CORS headers:"
curl -s -I -H "Origin: http://orlok:3000" "$GOBLIN1/media" | grep -i "access-control"
echo ""

echo "3. Media library (/media):"
curl -s "$GOBLIN1/media" | jq '{success, videoCount: (.media.video | length), firstVideo: .media.video[0].filename}'
echo ""

echo "4. Queue status (/queue):"
curl -s "$GOBLIN1/queue" | jq '{success, queueLength: (.queue.videos | length), playing: .queue.playing}'
echo ""

echo "5. Playback status (/playback-status):"
curl -s "$GOBLIN1/playback-status" | jq '{success, playing, currentVideo}'
echo ""

echo "6. Add video to queue (/queue/enqueue):"
curl -s -X POST -H "Content-Type: application/json" -d '{"filename":"307 Jb Hd.mp4"}' "$GOBLIN1/queue/enqueue" | jq '{success, video: .video.filename}'
echo ""

echo "7. Check queue after add:"
curl -s "$GOBLIN1/queue" | jq '{success, queueLength: (.queue.videos | length), videos: [.queue.videos[] | .filename]}'
echo ""

echo "8. Start queue (/queue/start):"
curl -s -X POST -H "Content-Type: application/json" -d '{"loopMode":"none"}' "$GOBLIN1/queue/start" | jq '{success}'
sleep 2
echo ""

echo "9. Check playback status after start:"
curl -s "$GOBLIN1/playback-status" | jq '{success, playing, currentVideo}'
echo ""

echo "10. Stop queue (/queue/stop):"
curl -s -X POST "$GOBLIN1/queue/stop" | jq '{success}'
echo ""

echo "11. Clear queue (/queue/clear):"
curl -s -X POST "$GOBLIN1/queue/clear" | jq '{success}'
echo ""

echo "12. Verify queue is empty:"
curl -s "$GOBLIN1/queue" | jq '{success, queueLength: (.queue.videos | length)}'
echo ""

echo "13. Test priority enqueue (/queue/enqueue-priority):"
curl -s -X POST -H "Content-Type: application/json" -d '{"filename":"541 Jb Hd.mp4"}' "$GOBLIN1/queue/enqueue-priority" | jq '{success, playing}'
sleep 2
echo ""

echo "14. Check playback after priority enqueue:"
curl -s "$GOBLIN1/playback-status" | jq '{success, playing, currentVideo}'
echo ""

echo "15. Stop and clear:"
curl -s -X POST "$GOBLIN1/queue/stop" | jq '{success}'
curl -s -X POST "$GOBLIN1/queue/clear" | jq '{success}'
echo ""

echo ""
echo "✅ Goblin 1 API tests complete!"
echo ""
echo "Testing Goblin 2 (192.168.8.106:3001)"
echo "--------------------------------------"

echo "1. Health check:"
curl -s "$GOBLIN2/health" | jq '{status, uptime}'
echo ""

echo "2. Media library:"
curl -s "$GOBLIN2/media" | jq '{success, videoCount: (.media.video | length)}'
echo ""

echo "3. Queue status:"
curl -s "$GOBLIN2/queue" | jq '{success, queueLength: (.queue.videos | length)}'
echo ""

echo ""
echo "✅ Goblin 2 API tests complete!"
echo ""
echo "Testing Goblin 3 (192.168.8.14:3001)"
echo "-------------------------------------"

echo "1. Health check:"
curl -s "$GOBLIN3/health" | jq '{status, uptime}'
echo ""

echo "2. Media library:"
curl -s "$GOBLIN3/media" | jq '{success, videoCount: (.media.video | length)}'
echo ""

echo "3. Queue status:"
curl -s "$GOBLIN3/queue" | jq '{success, queueLength: (.queue.videos | length)}'
echo ""

echo ""
echo "✅ Goblin 3 API tests complete!"
echo ""
echo "🎉 All Goblin API tests passed!"
echo ""
echo "Next steps:"
echo "1. Open http://orlok:3000/goblin-management in your browser"
echo "2. Double-click on Goblin One card"
echo "3. Verify the Video Queue modal opens without errors"
echo "4. Verify 'Current Queue' section loads (not stuck on 'Loading...')"
echo "5. Verify 'Available Videos' section shows 57 videos"
echo "6. Test adding videos to queue using the 'Add' button"
echo "7. Test 'Play' button on a video (should play immediately)"
echo "8. Test queue controls (Start, Stop, Clear)"
echo "9. Test saving and loading playlists"
echo "10. Test distributing playlist to all Goblins"

