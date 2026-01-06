#!/bin/bash

# Quick Loop Test - Verifies scene loop is working
# Run this anytime to test the loop functionality

echo "🔄 Quick Scene Loop Test"
echo "========================"
echo ""

# Test with scenes 1 and 2 for 20 seconds
BASE_URL="http://localhost:3000"

# Clear queue
echo "Clearing queue..."
curl -s -X POST "$BASE_URL/scenes/api/queue/clear" > /dev/null

# Add scenes
echo "Adding scenes 1 and 2..."
curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":1}' > /dev/null
curl -s -X POST "$BASE_URL/scenes/api/queue/enqueue" \
  -H "Content-Type: application/json" \
  -d '{"sceneId":2}' > /dev/null

# Start loop
echo "Starting loop..."
RESULT=$(curl -s -X POST "$BASE_URL/scenes/api/queue/start-config" \
  -H "Content-Type: application/json" \
  -d '{"mode":"loop_queue","scenes":[{"scene_id":1},{"scene_id":2}]}')

SUCCESS=$(echo "$RESULT" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo "❌ Failed to start loop!"
  echo "$RESULT" | jq '.'
  exit 1
fi

echo "✅ Loop started successfully!"
echo ""
echo "Monitoring for 20 seconds..."

# Monitor
TRANSITIONS=0
LAST=""
for i in {1..20}; do
  STATUS=$(curl -s "$BASE_URL/scenes/api/queue")
  CURRENT=$(echo "$STATUS" | jq -r '.status.nowPlaying.name // "idle"')
  
  if [ "$CURRENT" != "$LAST" ] && [ "$CURRENT" != "idle" ]; then
    TRANSITIONS=$((TRANSITIONS + 1))
    echo "  [${i}s] → $CURRENT"
    LAST="$CURRENT"
  fi
  
  sleep 1
done

echo ""
if [ $TRANSITIONS -ge 3 ]; then
  echo "✅ SUCCESS - Detected $TRANSITIONS scene transitions"
  echo "   Loop is working!"
else
  echo "⚠️  Only $TRANSITIONS transitions detected"
  echo "   (May need longer scenes to see more)"
fi

# Stop
echo ""
echo "Stopping loop..."
curl -s -X POST "$BASE_URL/scenes/api/queue/stop" > /dev/null
echo "Done!"
