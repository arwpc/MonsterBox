#!/bin/bash

# Comprehensive Functionality Test for Deployment
# Tests key functionality across the system

echo "=========================================="
echo "MonsterBox 5.3 - Functionality Test"
echo "=========================================="
echo ""

BASE_URL="http://192.168.8.200:3000"
FAILED=0
PASSED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

test_api_json() {
    local url="$1"
    local name="$2"
    local method="${3:-GET}"
    local data="$4"
    local expect_success="${5:-true}"
    
    echo -n "  Testing $name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT -H "Content-Type: application/json" -d "$data" "$url" 2>&1)
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$url" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" "$url" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" != "200" ] && [ "$http_code" != "201" ]; then
        echo -e "${RED}FAILED${NC} (HTTP $http_code)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check for JSON
    if ! echo "$body" | python3 -m json.tool > /dev/null 2>&1; then
        echo -e "${RED}FAILED${NC} (Invalid JSON)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Check for success field if expected
    if [ "$expect_success" = "true" ]; then
        if ! echo "$body" | grep -q '"success".*true'; then
            echo -e "${RED}FAILED${NC} (success: false)"
            FAILED=$((FAILED + 1))
            return 1
        fi
    fi
    
    echo -e "${GREEN}PASSED${NC}"
    PASSED=$((PASSED + 1))
    return 0
}

echo -e "${BLUE}=== Configuration & System APIs ===${NC}"
test_api_json "$BASE_URL/api/config" "Get Config"
test_api_json "$BASE_URL/api/system/info" "System Info"
test_api_json "$BASE_URL/api/config/theme" "Theme Update" "POST" '{"theme":"dark"}'

echo ""
echo -e "${BLUE}=== Parts Management ===${NC}"
test_api_json "$BASE_URL/setup/parts/api/parts" "List Parts"
# Get first part ID if available
PART_ID=$(curl -s "$BASE_URL/setup/parts/api/parts" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['parts'][0]['id'] if data.get('parts') and len(data['parts']) > 0 else '')" 2>/dev/null)
if [ -n "$PART_ID" ]; then
    test_api_json "$BASE_URL/setup/parts/api/parts/$PART_ID" "Get Part by ID"
fi

echo ""
echo -e "${BLUE}=== Poses Management ===${NC}"
test_api_json "$BASE_URL/poses/api/poses" "List Poses"

echo ""
echo -e "${BLUE}=== Scenes Management ===${NC}"
test_api_json "$BASE_URL/scenes/api/scenes" "List Scenes"

echo ""
echo -e "${BLUE}=== Character Management ===${NC}"
test_api_json "$BASE_URL/api/characters" "List Characters"

echo ""
echo -e "${BLUE}=== Audio System ===${NC}"
test_api_json "$BASE_URL/api/audio/health" "Audio Health" "GET" "" "false"
test_api_json "$BASE_URL/api/audio/info" "Audio Info" "GET" "" "false"

echo ""
echo -e "${BLUE}=== Orchestration ===${NC}"
test_api_json "$BASE_URL/api/orchestration/status" "Orchestration Status"
test_api_json "$BASE_URL/api/orchestration/animatronics" "List Animatronics"

echo ""
echo -e "${BLUE}=== Random Poses ===${NC}"
test_api_json "$BASE_URL/api/random-poses/status" "Random Pose Status"
test_api_json "$BASE_URL/api/random-poses/config" "Random Pose Config"

echo ""
echo -e "${BLUE}=== Theme Switching Test ===${NC}"
echo "  Testing theme persistence..."

# Set to light
curl -s -X POST -H "Content-Type: application/json" -d '{"theme":"light"}' "$BASE_URL/api/config/theme" > /dev/null
sleep 1

# Verify it's light
THEME=$(curl -s "$BASE_URL/api/config" | python3 -c "import sys, json; print(json.load(sys.stdin).get('config', {}).get('theme', ''))" 2>/dev/null)
if [ "$THEME" = "light" ]; then
    echo -e "  ${GREEN}Light theme set${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${RED}Failed to set light theme${NC}"
    FAILED=$((FAILED + 1))
fi

# Set back to dark
curl -s -X POST -H "Content-Type: application/json" -d '{"theme":"dark"}' "$BASE_URL/api/config/theme" > /dev/null
sleep 1

# Verify it's dark
THEME=$(curl -s "$BASE_URL/api/config" | python3 -c "import sys, json; print(json.load(sys.stdin).get('config', {}).get('theme', ''))" 2>/dev/null)
if [ "$THEME" = "dark" ]; then
    echo -e "  ${GREEN}Dark theme restored${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${RED}Failed to restore dark theme${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo -e "${BLUE}=== Navigation Consistency Check ===${NC}"
echo "  Checking all pages have consistent navigation..."

PAGES=(
    "/"
    "/conversation"
    "/orchestration"
    "/setup/system"
    "/setup/characters"
    "/setup/parts"
    "/setup/poses"
    "/setup/calibration"
    "/setup/audio"
    "/setup/webcam"
    "/setup/models"
    "/setup/super-powers"
    "/audio-library"
    "/video-library"
    "/goblin-management"
    "/ai-settings"
    "/scenes"
)

NAV_FAILED=0
for page in "${PAGES[@]}"; do
    response=$(curl -s "$BASE_URL$page")
    
    # Check for navbar
    if ! echo "$response" | grep -q "navbar"; then
        echo -e "  ${RED}✗${NC} $page - No navigation"
        NAV_FAILED=$((NAV_FAILED + 1))
        continue
    fi
    
    # Check for Bootstrap
    if ! echo "$response" | grep -q "bootstrap"; then
        echo -e "  ${YELLOW}⚠${NC} $page - Bootstrap warning"
        continue
    fi
    
    # Check for theme attribute
    if ! echo "$response" | grep -q "data-bs-theme"; then
        echo -e "  ${YELLOW}⚠${NC} $page - No theme attribute"
        continue
    fi
done

if [ $NAV_FAILED -eq 0 ]; then
    echo -e "  ${GREEN}✓ All pages have consistent navigation${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${RED}✗ $NAV_FAILED pages missing navigation${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "=========================================="
echo "Functionality Test Results:"
echo "=========================================="
echo -e "${GREEN}PASSED: $PASSED${NC}"
echo -e "${RED}FAILED: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}✓ System is READY FOR DEPLOYMENT${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "${RED}✗ Please review before deployment${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi

