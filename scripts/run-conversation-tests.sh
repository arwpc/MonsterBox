#!/bin/bash
#
# Conversation Mode Test Runner
# Runs all Conversation Mode tests in sequence with proper reporting
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  MonsterBox 5.5 - Conversation Mode Test Suite            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to run a test suite
run_test_suite() {
    local suite_name="$1"
    local test_command="$2"
    local is_critical="${3:-false}"
    
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Running: ${suite_name}${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    if eval "$test_command"; then
        echo ""
        echo -e "${GREEN}✅ ${suite_name} - PASSED${NC}"
        ((PASSED_TESTS++))
    else
        echo ""
        echo -e "${RED}❌ ${suite_name} - FAILED${NC}"
        ((FAILED_TESTS++))
        
        if [ "$is_critical" = "true" ]; then
            echo -e "${RED}Critical test failed. Stopping test run.${NC}"
            exit 1
        fi
    fi
    
    ((TOTAL_TESTS++))
    echo ""
}

# Check if server is running
echo -e "${BLUE}Checking if MonsterBox server is running...${NC}"
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Server not running. Starting server...${NC}"
    npm start &
    SERVER_PID=$!
    sleep 10
    
    # Wait for server to be ready
    timeout 60 bash -c 'until curl -f http://localhost:3000 > /dev/null 2>&1; do sleep 2; done' || {
        echo -e "${RED}❌ Server failed to start${NC}"
        exit 1
    }
    
    echo -e "${GREEN}✅ Server started successfully${NC}"
    CLEANUP_SERVER=true
else
    echo -e "${GREEN}✅ Server is already running${NC}"
    CLEANUP_SERVER=false
fi
echo ""

# Parse command line arguments
RUN_ALL=true
RUN_API=false
RUN_E2E=false
RUN_FEATURES=false
HEADED=false

for arg in "$@"; do
    case $arg in
        --api)
            RUN_ALL=false
            RUN_API=true
            ;;
        --e2e)
            RUN_ALL=false
            RUN_E2E=true
            ;;
        --features)
            RUN_ALL=false
            RUN_FEATURES=true
            ;;
        --headed)
            HEADED=true
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --api       Run only backend API tests"
            echo "  --e2e       Run only frontend E2E tests"
            echo "  --features  Run only Monster Features tests"
            echo "  --headed    Run tests in headed mode (visible browser)"
            echo "  --help      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all tests"
            echo "  $0 --api              # Run only API tests"
            echo "  $0 --e2e --headed     # Run E2E tests with visible browser"
            exit 0
            ;;
    esac
done

# Run test suites based on arguments
if [ "$RUN_ALL" = true ] || [ "$RUN_API" = true ]; then
    run_test_suite \
        "Backend API Tests" \
        "npx playwright test -c playwright.config.ts tests/playwright/conversation-api.spec.js --project=firefox" \
        true
fi

if [ "$RUN_ALL" = true ] || [ "$RUN_E2E" = true ]; then
    if [ "$HEADED" = true ]; then
        run_test_suite \
            "Frontend E2E Tests (Headed)" \
            "MB_E2E=1 npx playwright test -c playwright.config.ts --headed tests/playwright/conversation-mode-complete.spec.js --project=firefox" \
            false
    else
        run_test_suite \
            "Frontend E2E Tests" \
            "MB_E2E=1 npx playwright test -c playwright.config.ts tests/playwright/conversation-mode-complete.spec.js --project=firefox" \
            false
    fi
fi

if [ "$RUN_ALL" = true ] || [ "$RUN_FEATURES" = true ]; then
    run_test_suite \
        "Monster Features Tests" \
        "MB_E2E=1 npx playwright test -c playwright.config.ts tests/playwright/monster-features.spec.js --project=firefox" \
        false
fi

# Cleanup
if [ "$CLEANUP_SERVER" = true ]; then
    echo -e "${YELLOW}Stopping test server...${NC}"
    kill $SERVER_PID 2>/dev/null || true
    sleep 2
fi

# Print summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Test Summary                                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Test Suites:  ${TOTAL_TESTS}"
echo -e "${GREEN}Passed:             ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed:             ${FAILED_TESTS}${NC}"
echo -e "${YELLOW}Skipped:            ${SKIPPED_TESTS}${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✅ ALL TESTS PASSED! 🎃                                   ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ SOME TESTS FAILED                                      ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi

