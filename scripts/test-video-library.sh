#!/bin/bash
# Video Library Test Runner
# Runs all video library tests with proper setup and reporting

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VIDEOS_DIR="./videos"
TEST_VIDEOS_DIR="./test-videos"
SERVER_PORT=3000
SERVER_PID=""

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         MonsterBox Video Library Test Runner              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    if [ ! -z "$SERVER_PID" ]; then
        echo -e "${YELLOW}🛑 Stopping test server (PID: $SERVER_PID)...${NC}"
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Check if videos directory exists
echo -e "${BLUE}📁 Checking directories...${NC}"
if [ ! -d "$VIDEOS_DIR" ]; then
    echo -e "${YELLOW}⚠️  Creating $VIDEOS_DIR directory...${NC}"
    mkdir -p "$VIDEOS_DIR"
fi

if [ ! -d "$TEST_VIDEOS_DIR" ]; then
    echo -e "${YELLOW}⚠️  Creating $TEST_VIDEOS_DIR directory...${NC}"
    mkdir -p "$TEST_VIDEOS_DIR"
fi

# Check for videos
VIDEO_COUNT=$(find "$VIDEOS_DIR" -type f \( -name "*.mp4" -o -name "*.avi" -o -name "*.mov" -o -name "*.mkv" -o -name "*.webm" \) 2>/dev/null | wc -l)
TEST_VIDEO_COUNT=$(find "$TEST_VIDEOS_DIR" -type f \( -name "*.mp4" -o -name "*.avi" -o -name "*.mov" -o -name "*.mkv" -o -name "*.webm" \) 2>/dev/null | wc -l)

echo -e "${GREEN}✅ $VIDEOS_DIR exists ($VIDEO_COUNT videos)${NC}"
echo -e "${GREEN}✅ $TEST_VIDEOS_DIR exists ($TEST_VIDEO_COUNT test videos)${NC}"

if [ $VIDEO_COUNT -eq 0 ] && [ $TEST_VIDEO_COUNT -gt 0 ]; then
    echo -e "${YELLOW}💡 Tip: Copy test videos to $VIDEOS_DIR for full test coverage:${NC}"
    echo -e "${YELLOW}   cp $TEST_VIDEOS_DIR/*.mp4 $VIDEOS_DIR/${NC}"
fi

if [ $VIDEO_COUNT -eq 0 ] && [ $TEST_VIDEO_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  No videos found. Tests will pass but with limited coverage.${NC}"
    echo -e "${YELLOW}💡 Add video files to $VIDEOS_DIR to enable full testing.${NC}"
fi

echo ""

# Check if server is already running
echo -e "${BLUE}🔍 Checking if MonsterBox server is running...${NC}"
if curl -s http://localhost:$SERVER_PORT > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is already running on port $SERVER_PORT${NC}"
    SERVER_RUNNING=true
else
    echo -e "${YELLOW}⚠️  Server not running. Starting test server...${NC}"
    SERVER_RUNNING=false
    
    # Start server in background
    MB_TEST_MODE=1 NODE_ENV=test PORT=$SERVER_PORT node server.js > /tmp/monsterbox-test-server.log 2>&1 &
    SERVER_PID=$!
    
    echo -e "${BLUE}⏳ Waiting for server to start (PID: $SERVER_PID)...${NC}"
    
    # Wait for server to be ready (max 30 seconds)
    for i in {1..30}; do
        if curl -s http://localhost:$SERVER_PORT > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server started successfully${NC}"
            break
        fi
        
        if ! kill -0 $SERVER_PID 2>/dev/null; then
            echo -e "${RED}❌ Server failed to start. Check logs:${NC}"
            tail -20 /tmp/monsterbox-test-server.log
            exit 1
        fi
        
        sleep 1
    done
    
    if ! curl -s http://localhost:$SERVER_PORT > /dev/null 2>&1; then
        echo -e "${RED}❌ Server did not start within 30 seconds${NC}"
        exit 1
    fi
fi

echo ""

# Run unit tests
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Unit Tests                              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if npm run test:video-library:unit; then
    echo -e "${GREEN}✅ Unit tests passed${NC}"
    UNIT_TESTS_PASSED=true
else
    echo -e "${RED}❌ Unit tests failed${NC}"
    UNIT_TESTS_PASSED=false
fi

echo ""

# Run UI tests
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     UI Tests                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if npm run test:video-library:ui; then
    echo -e "${GREEN}✅ UI tests passed${NC}"
    UI_TESTS_PASSED=true
else
    echo -e "${RED}❌ UI tests failed${NC}"
    UI_TESTS_PASSED=false
fi

echo ""

# Summary
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$UNIT_TESTS_PASSED" = true ]; then
    echo -e "${GREEN}✅ Unit Tests: PASSED${NC}"
else
    echo -e "${RED}❌ Unit Tests: FAILED${NC}"
fi

if [ "$UI_TESTS_PASSED" = true ]; then
    echo -e "${GREEN}✅ UI Tests: PASSED${NC}"
else
    echo -e "${RED}❌ UI Tests: FAILED${NC}"
fi

echo ""
echo -e "${BLUE}📊 Test Environment:${NC}"
echo -e "   Videos in $VIDEOS_DIR: $VIDEO_COUNT"
echo -e "   Test videos in $TEST_VIDEOS_DIR: $TEST_VIDEO_COUNT"
echo -e "   Server: http://localhost:$SERVER_PORT"

echo ""

# Exit with appropriate code
if [ "$UNIT_TESTS_PASSED" = true ] && [ "$UI_TESTS_PASSED" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              🎉 All Tests Passed! 🎉                       ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║              ❌ Some Tests Failed ❌                       ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi

