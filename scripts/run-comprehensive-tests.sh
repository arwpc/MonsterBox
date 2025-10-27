#!/bin/bash
###############################################################################
# MonsterBox Comprehensive Test Runner
# Runs complete test suite across all animatronics
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
HOST="${1:-localhost}"
PORT="${2:-3000}"
BASE_URL="http://$HOST:$PORT"

echo -e "${BLUE}🎃 MonsterBox Comprehensive Test Suite${NC}"
echo "========================================"
echo "Target: $BASE_URL"
echo ""

# Function to run tests
run_test_suite() {
    local target=$1
    local url=$2
    
    echo -e "${YELLOW}Testing $target...${NC}"
    
    # Run Playwright tests
    BASE_URL="$url" npx playwright test tests/comprehensive --reporter=list,html
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $target tests PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $target tests FAILED${NC}"
        return 1
    fi
}

# Test local Orlok first
echo -e "${BLUE}Phase 1: Testing Orlok (Local)${NC}"
echo "================================"
run_test_suite "Orlok" "$BASE_URL"
ORLOK_RESULT=$?

# Save test results
mkdir -p test-results
echo "Orlok: $([ $ORLOK_RESULT -eq 0 ] && echo 'PASSED' || echo 'FAILED')" > test-results/comprehensive-results.txt

# Generate HTML report
echo ""
echo -e "${BLUE}Generating test report...${NC}"
npx playwright show-report playwright-report

# Summary
echo ""
echo "========================================"
echo -e "${BLUE}📊 Test Summary${NC}"
echo "========================================"
if [ $ORLOK_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ All tests PASSED!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests FAILED${NC}"
    echo "Check playwright-report/index.html for details"
    exit 1
fi
