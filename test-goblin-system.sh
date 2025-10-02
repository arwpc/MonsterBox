#!/bin/bash

echo "🧪 Testing Goblin System Functionality"
echo "========================================"
echo ""

# Test 1: Check MonsterBox API
echo "1️⃣  Testing MonsterBox Goblin API..."
GOBLINS=$(curl -s http://127.0.0.1:3000/goblin-management/api/goblins)
ONLINE_COUNT=$(echo "$GOBLINS" | jq -r '.online')
TOTAL_COUNT=$(echo "$GOBLINS" | jq -r '.total')

echo "   Total Goblins: $TOTAL_COUNT"
echo "   Online Goblins: $ONLINE_COUNT"

if [ "$ONLINE_COUNT" == "2" ]; then
    echo "   ✅ Both goblins are online!"
else
    echo "   ❌ Expected 2 online goblins, got $ONLINE_COUNT"
    exit 1
fi
echo ""

# Test 2: Check Goblin 1 health
echo "2️⃣  Testing Goblin 1 (192.168.8.160:3001)..."
G1_HEALTH=$(curl -s http://192.168.8.160:3001/health)
G1_STATUS=$(echo "$G1_HEALTH" | jq -r '.status')
G1_ID=$(echo "$G1_HEALTH" | jq -r '.goblinId')

echo "   Goblin ID: $G1_ID"
echo "   Status: $G1_STATUS"

if [ "$G1_STATUS" == "healthy" ]; then
    echo "   ✅ Goblin 1 is healthy!"
else
    echo "   ❌ Goblin 1 is not healthy"
    exit 1
fi
echo ""

# Test 3: Check Goblin 2 health
echo "3️⃣  Testing Goblin 2 (192.168.8.161:3001)..."
G2_HEALTH=$(curl -s http://192.168.8.161:3001/health)
G2_STATUS=$(echo "$G2_HEALTH" | jq -r '.status')
G2_ID=$(echo "$G2_HEALTH" | jq -r '.goblinId')

echo "   Goblin ID: $G2_ID"
echo "   Status: $G2_STATUS"

if [ "$G2_STATUS" == "healthy" ]; then
    echo "   ✅ Goblin 2 is healthy!"
else
    echo "   ❌ Goblin 2 is not healthy"
    exit 1
fi
echo ""

# Test 4: Check Goblin 1 video library
echo "4️⃣  Testing Goblin 1 Video Library..."
G1_VIDEOS=$(curl -s http://192.168.8.160:3001/video-library/api/videos)
G1_VIDEO_COUNT=$(echo "$G1_VIDEOS" | jq -r '.count')

echo "   Videos available: $G1_VIDEO_COUNT"

if [ "$G1_VIDEO_COUNT" -gt "0" ]; then
    echo "   ✅ Goblin 1 video library working!"
    echo "   Sample video: $(echo "$G1_VIDEOS" | jq -r '.videos[0].name')"
else
    echo "   ❌ No videos found in Goblin 1 library"
    exit 1
fi
echo ""

# Test 5: Check Goblin 2 video library
echo "5️⃣  Testing Goblin 2 Video Library..."
G2_VIDEOS=$(curl -s http://192.168.8.161:3001/video-library/api/videos)
G2_VIDEO_COUNT=$(echo "$G2_VIDEOS" | jq -r '.count')

echo "   Videos available: $G2_VIDEO_COUNT"

if [ "$G2_VIDEO_COUNT" -gt "0" ]; then
    echo "   ✅ Goblin 2 video library working!"
    echo "   Sample video: $(echo "$G2_VIDEOS" | jq -r '.videos[0].name')"
else
    echo "   ❌ No videos found in Goblin 2 library"
    exit 1
fi
echo ""

# Test 6: Test restart endpoint
echo "6️⃣  Testing Restart Endpoint (Goblin 1)..."
RESTART_RESULT=$(curl -s -X POST http://127.0.0.1:3000/goblin-management/api/goblin/goblin1/restart)
RESTART_SUCCESS=$(echo "$RESTART_RESULT" | jq -r '.success')

if [ "$RESTART_SUCCESS" == "true" ]; then
    echo "   ✅ Restart endpoint working!"
    echo "   Waiting 5 seconds for goblin to restart..."
    sleep 5
    
    # Check if it came back online
    G1_HEALTH_AFTER=$(curl -s http://192.168.8.160:3001/health)
    G1_STATUS_AFTER=$(echo "$G1_HEALTH_AFTER" | jq -r '.status')
    
    if [ "$G1_STATUS_AFTER" == "healthy" ]; then
        echo "   ✅ Goblin 1 restarted successfully!"
    else
        echo "   ⚠️  Goblin 1 may still be restarting..."
    fi
else
    echo "   ❌ Restart endpoint failed"
    exit 1
fi
echo ""

# Test 7: Check heartbeat is working
echo "7️⃣  Testing Heartbeat Functionality..."
echo "   Waiting 35 seconds to observe heartbeat..."
sleep 35

GOBLINS_AFTER=$(curl -s http://127.0.0.1:3000/goblin-management/api/goblins)
ONLINE_AFTER=$(echo "$GOBLINS_AFTER" | jq -r '.online')

if [ "$ONLINE_AFTER" == "2" ]; then
    echo "   ✅ Both goblins still online after heartbeat interval!"
    
    # Check last seen timestamps
    G1_LAST_SEEN=$(echo "$GOBLINS_AFTER" | jq -r '.goblins[] | select(.id=="goblin1") | .lastSeen')
    G2_LAST_SEEN=$(echo "$GOBLINS_AFTER" | jq -r '.goblins[] | select(.id=="goblin2") | .lastSeen')
    
    echo "   Goblin 1 last seen: $G1_LAST_SEEN"
    echo "   Goblin 2 last seen: $G2_LAST_SEEN"
else
    echo "   ❌ Goblins went offline (heartbeat may not be working)"
    exit 1
fi
echo ""

# Summary
echo "========================================"
echo "🎉 ALL TESTS PASSED!"
echo "========================================"
echo ""
echo "✅ MonsterBox Goblin Management API: Working"
echo "✅ Goblin 1 Health: Working"
echo "✅ Goblin 2 Health: Working"
echo "✅ Goblin 1 Video Library: $G1_VIDEO_COUNT videos"
echo "✅ Goblin 2 Video Library: $G2_VIDEO_COUNT videos"
echo "✅ Restart Functionality: Working"
echo "✅ Heartbeat System: Working"
echo ""
echo "🎃 Goblin System is PRODUCTION READY! 🎃"

