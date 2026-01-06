#!/bin/bash

# Extended test to verify continuous looping
echo "=== Extended Scene Loop Test (60 seconds) ==="
echo ""

BASE_URL="http://localhost:3000"

echo "1. Clearing and setting up queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/clear" > /dev/null

curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":1}' > /dev/null

curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":2}' > /dev/null

echo "2. Starting loop..."
curl -s -X POST "$BASE_URL/scenes/api/queue/start-config" \
  -H "Content-Type: application/json" \
  -d '{"mode":"loop_queue","scenes":[{"scene_id":1},{"scene_id":2}]}' > /dev/null

echo "3. Monitoring for 60 seconds..."
echo ""

START_TIME=$(date +%s)
LAST_SCENE=""
SCENE_TRANSITIONS=0

while [ $(($(date +%s) - START_TIME)) -lt 60 ]; do
  STATUS=$(curl -s "$BASE_URL/scenes/api/queue")
  RUNNING=$(echo "$STATUS" | jq -r '.status.running')
  NOW_PLAYING=$(echo "$STATUS" | jq -r '.status.nowPlaying.name // "idle"')
  QUEUE_LENGTH=$(echo "$STATUS" | jq -r '.status.items | length')
  
  ELAPSED=$(($(date +%s) - START_TIME))
  
  if [ "$NOW_PLAYING" != "$LAST_SCENE" ] && [ "$NOW_PLAYING" != "null" ] && [ "$NOW_PLAYING" != "idle" ]; then
    SCENE_TRANSITIONS=$((SCENE_TRANSITIONS + 1))
    echo "[${ELAPSED}s] Transition #$SCENE_TRANSITIONS: Now playing '$NOW_PLAYING' | Queue: $QUEUE_LENGTH items | Running: $RUNNING"
    LAST_SCENE="$NOW_PLAYING"
  fi
  
  # If stopped unexpectedly, break
  if [ "$RUNNING" = "false" ]; then
    echo "[${ELAPSED}s] ⚠️  Queue STOPPED unexpectedly!"
    break
  fi
  
  sleep 1
done

echo ""
echo "=== Results ==="
echo "Scene transitions detected: $SCENE_TRANSITIONS"
echo ""

if [ $SCENE_TRANSITIONS -ge 4 ]; then
  echo "✅ SUCCESS - Loop is working continuously!"
  echo "   The queue played multiple complete loops."
else
  echo "❌ FAILURE - Loop stopped prematurely"
  echo "   Expected at least 4 transitions, got $SCENE_TRANSITIONS"
fi

echo ""
echo "Stopping queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/stop" > /dev/null
echo "Done."
