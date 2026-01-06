#!/bin/bash

# Navigation Consistency Deployment Test
# Tests all pages for proper navigation and functionality

echo "=========================================="
echo "MonsterBox 5.3 - Navigation Deployment Test"
echo "=========================================="
echo ""

BASE_URL="http://192.168.8.200:3000"
FAILED=0
PASSED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_page() {
    local url="$1"
    local page_name="$2"
    local check_for="$3"
    
    echo -n "Testing $page_name... "
    
    response=$(curl -s -w "\n%{http_code}" "$url" 2>&1)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}FAILED${NC} (HTTP $http_code)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check for navigation component
    if ! echo "$body" | grep -q "navbar"; then
        echo -e "${RED}FAILED${NC} (No navigation found)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check for Bootstrap
    if ! echo "$body" | grep -q "bootstrap"; then
        echo -e "${YELLOW}WARNING${NC} (Bootstrap not detected)"
    fi
    
    # Check for specific content if provided
    if [ -n "$check_for" ]; then
        if ! echo "$body" | grep -q "$check_for"; then
            echo -e "${RED}FAILED${NC} (Expected content not found: $check_for)"
            FAILED=$((FAILED + 1))
            return 1
        fi
    fi
    
    echo -e "${GREEN}PASSED${NC}"
    PASSED=$((PASSED + 1))
    return 0
}

# Test API endpoint
test_api() {
    local url="$1"
    local api_name="$2"
    local method="${3:-GET}"
    local data="$4"
    
    echo -n "Testing API $api_name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" "$url" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" != "200" ]; then
        echo -e "${RED}FAILED${NC} (HTTP $http_code)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check for JSON response
    if ! echo "$body" | grep -q "{"; then
        echo -e "${RED}FAILED${NC} (Not JSON response)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    echo -e "${GREEN}PASSED${NC}"
    PASSED=$((PASSED + 1))
    return 0
}

echo "=== Testing Main Pages ==="
test_page "$BASE_URL/" "Dashboard"
test_page "$BASE_URL/conversation" "Conversation Mode" "Conversation"
test_page "$BASE_URL/orchestration" "Orchestration Control" "Orchestration"

echo ""
echo "=== Testing Setup Pages ==="
test_page "$BASE_URL/setup/system" "Setup System" "Theme Settings"
test_page "$BASE_URL/setup/characters" "Setup Characters" "Characters"
test_page "$BASE_URL/setup/parts" "Setup Parts" "Parts"
test_page "$BASE_URL/setup/poses" "Setup Poses" "Poses"
test_page "$BASE_URL/setup/calibration" "Setup Calibration" "Calibration"
test_page "$BASE_URL/setup/audio" "Setup Audio"
test_page "$BASE_URL/setup/webcam" "Setup Webcam"
test_page "$BASE_URL/setup/models" "Setup Models"
test_page "$BASE_URL/setup/super-powers" "Setup Super Powers"

echo ""
echo "=== Testing Library Pages ==="
test_page "$BASE_URL/audio-library" "Audio Library" "Audio"
test_page "$BASE_URL/video-library" "Video Library" "Video"
test_page "$BASE_URL/goblin-management" "Goblin Management" "Goblin"

echo ""
echo "=== Testing Settings Pages ==="
test_page "$BASE_URL/ai-settings" "AI Settings" "AI"
test_page "$BASE_URL/scenes" "Scenes"

echo ""
echo "=== Testing New API Endpoints ==="
test_api "$BASE_URL/api/config" "Config API"
test_api "$BASE_URL/api/system/info" "System Info API"

echo ""
echo "=== Testing Theme API ==="
# Test theme update (we'll set it back to dark after)
test_api "$BASE_URL/api/config/theme" "Theme Update API" "POST" '{"theme":"light"}'
sleep 1
test_api "$BASE_URL/api/config/theme" "Theme Restore API" "POST" '{"theme":"dark"}'

echo ""
echo "=========================================="
echo "Test Results:"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASSED${NC}"
echo -e "${RED}FAILED: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! System ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please review before deployment.${NC}"
    exit 1
fi

