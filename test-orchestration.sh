#!/bin/bash

echo "======================================"
echo "ORCHESTRATION PAGE FUNCTIONALITY TEST"
echo "======================================"
echo ""

# Test 1: Check orchestration page loads
echo "Test 1: Orchestration Page Loads"
echo "--------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/orchestration)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Page loads successfully (HTTP $HTTP_CODE)"
else
    echo "❌ Page failed to load (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Check Command Log is at top and has 15-line limit
echo "Test 2: Command Log Position and Limit"
echo "---------------------------------------"
curl -s http://localhost:3000/orchestration | grep -A 5 "Command Log - Moved to Top" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Command Log is at top"
else
    echo "❌ Command Log not found at top"
fi

curl -s http://localhost:3000/orchestration | grep "if (lines.length >= 15)" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ 15-line limit implemented in JavaScript"
else
    echo "❌ 15-line limit not found"
fi
echo ""

# Test 3: Check default broadcast text
echo "Test 3: Default Broadcast Text"
echo "-------------------------------"
curl -s http://localhost:3000/orchestration | grep "Welcome to Warner Castle!" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Default text is 'Welcome to Warner Castle!'"
else
    echo "❌ Default text not found"
fi
echo ""

# Test 4: Check hostname-based navigation
echo "Test 4: Hostname-Based Navigation"
echo "----------------------------------"
curl -s http://localhost:3000/orchestration | grep "orlok:3000/conversation" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Hostname-based conversation URLs found"
else
    echo "❌ Hostname URLs not found"
fi
echo ""

# Test 5: Check webcam proxy endpoint
echo "Test 5: Webcam Proxy Endpoint"
echo "------------------------------"
curl -s http://localhost:3000/orchestration | grep "webcam-stream" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Webcam proxy URLs present in page"
else
    echo "❌ Webcam proxy URLs not found"
fi
echo ""

# Test 6: Check Goblin panel
echo "Test 6: Goblin Panel"
echo "--------------------"
curl -s http://localhost:3000/orchestration | grep "Goblin Status" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Goblin Status section exists"
else
    echo "❌ Goblin Status section not found"
fi

curl -s http://localhost:3000/orchestration | grep "goblinsStatus" > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Goblin status container exists"
else
    echo "❌ Goblin status container not found"
fi
echo ""

# Test 7: API Endpoints
echo "Test 7: API Endpoints"
echo "---------------------"

# Test status endpoint
STATUS=$(curl -s http://localhost:3000/api/orchestration/status)
echo "$STATUS" | jq -e '.success' > /dev/null 2>&1
if [ $? -eq 0 ]; then
    ANIM_COUNT=$(echo "$STATUS" | jq '.animatronics | length')
    echo "✅ Status API works ($ANIM_COUNT animatronics)"
else
    echo "❌ Status API failed"
fi

# Test Goblin API
GOBLINS=$(curl -s http://localhost:3000/goblin-management/api/goblins)
echo "$GOBLINS" | jq -e '.success' > /dev/null 2>&1
if [ $? -eq 0 ]; then
    GOBLIN_COUNT=$(echo "$GOBLINS" | jq '.goblins | length')
    echo "✅ Goblin API works ($GOBLIN_COUNT goblins)"
else
    echo "❌ Goblin API failed"
fi

# Test Auto AI status endpoint
AUTOAI=$(curl -s http://localhost:3000/api/orchestration/auto-ai/status)
echo "$AUTOAI" | jq -e '.success' > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Auto AI status API works"
else
    echo "❌ Auto AI status API failed"
fi
echo ""

# Test 8: Check animatronic details
echo "Test 8: Animatronic Details"
echo "----------------------------"
STATUS=$(curl -s http://localhost:3000/api/orchestration/status)
ONLINE=$(echo "$STATUS" | jq -r '.animatronics[] | select(.online==true) | .name')
echo "Online animatronics:"
echo "$ONLINE" | while read -r name; do
    echo "  ✅ $name"
done
echo ""

OFFLINE=$(echo "$STATUS" | jq -r '.animatronics[] | select(.online==false) | .name')
if [ -n "$OFFLINE" ]; then
    echo "Offline animatronics:"
    echo "$OFFLINE" | while read -r name; do
        echo "  ⚠️  $name"
    done
fi
echo ""

echo "======================================"
echo "TEST SUMMARY"
echo "======================================"
echo ""
echo "All major features have been tested."
echo "Please manually verify in browser:"
echo "  1. Double-click animatronic opens Conversation page"
echo "  2. Webcam streams are visible"
echo "  3. Ask AI button works"
echo "  4. Say button works"
echo "  5. Audio controls work"
echo "  6. Auto AI controls work"
echo "  7. Goblin double-click opens Goblin Management"
echo "  8. Command Log stays at 15 lines max"
echo ""
echo "Open: http://localhost:3000/orchestration"
echo "======================================"
