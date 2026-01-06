#!/bin/bash

# Test script to verify scene loop functionality
# This script will:
# 1. Clear the queue
# 2. Add two scenes to the queue
# 3. Start the queue in loop mode
# 4. Monitor for 30 seconds to verify continuous looping
# 5. Stop the queue

echo "=== Scene Loop Test ==="
echo ""

# Configuration
BASE_URL="http://localhost:3000"
SCENE_1=1  # First scene ID
SCENE_2=2  # Second scene ID
MONITOR_TIME=30  # Monitor for 30 seconds

echo "1. Clearing queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/clear" | jq '.success'

echo ""
echo "2. Adding scenes to queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d "{\"sceneId\":$SCENE_1}" | jq '.success'

curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d "{\"sceneId\":$SCENE_2}" | jq '.success'

echo ""
echo "3. Current queue status:"
curl -s "$BASE_URL/scenes/api/queue" | jq '{running: .status.running, mode: .status.mode, items: .status.items | length}'

echo ""
echo "4. Starting queue in LOOP mode..."
curl -s -X POST "$BASE_URL/scenes/api/queue/start-config" \
  -H "Content-Type: application/json" \
  -d '{"mode":"loop_queue","scenes":[{"scene_id":'$SCENE_1'},{"scene_id":'$SCENE_2'}]}' | jq '.'

echo ""
echo "5. Monitoring queue for $MONITOR_TIME seconds..."
echo "   (Queue should continuously loop between scenes)"
echo ""

START_TIME=$(date +%s)
PLAY_COUNT=0
LAST_SCENE=""

while [ $(($(date +%s) - START_TIME)) -lt $MONITOR_TIME ]; do
  STATUS=$(curl -s "$BASE_URL/scenes/api/queue")
  RUNNING=$(echo "$STATUS" | jq -r '.status.running')
  NOW_PLAYING=$(echo "$STATUS" | jq -r '.status.nowPlaying.name // "idle"')
  QUEUE_LENGTH=$(echo "$STATUS" | jq -r '.status.items | length')
  MODE=$(echo "$STATUS" | jq -r '.status.mode')
  
  ELAPSED=$(($(date +%s) - START_TIME))
  
  if [ "$NOW_PLAYING" != "$LAST_SCENE" ] && [ "$NOW_PLAYING" != "null" ] && [ "$NOW_PLAYING" != "idle" ]; then
    PLAY_COUNT=$((PLAY_COUNT + 1))
    echo "[${ELAPSED}s] Playing: $NOW_PLAYING (play #$PLAY_COUNT) | Mode: $MODE | Queue: $QUEUE_LENGTH items | Running: $RUNNING"
    LAST_SCENE="$NOW_PLAYING"
  fi
  
  sleep 2
done

echo ""
echo "6. Test Results:"
echo "   Total scene plays detected: $PLAY_COUNT"
echo "   Expected: At least 2 (should loop multiple times)"

if [ $PLAY_COUNT -ge 2 ]; then
  echo "   ✅ PASS - Queue is looping!"
else
  echo "   ❌ FAIL - Queue did not loop properly"
fi

echo ""
echo "7. Final queue status:"
curl -s "$BASE_URL/scenes/api/queue" | jq '{running: .status.running, mode: .status.mode, nowPlaying: .status.nowPlaying, queueLength: .status.items | length}'

echo ""
echo "8. Stopping queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/stop" | jq '.success'

echo ""
echo "=== Test Complete ==="
