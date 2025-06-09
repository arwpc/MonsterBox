#!/bin/bash
echo "🤖 Starting Agent 3: Main Application Comprehensive Testing"
echo "=========================================================="
echo "Focus: http://localhost:3000 (entire application)"
echo "Testing: All buttons, functions, pages, console errors"
echo ""

# Switch to agent 3 branch
git checkout agent-3-main-app-fixes

# Set environment for Agent 3
export AGENT_ID="agent-3"
export AGENT_FOCUS="main-application"
export TEST_URL="http://localhost:3000"
export PATH=~/.npm-global/bin:$PATH

# Start the application on port 3002
echo "Starting MonsterBox application..."
PORT=3002 npm run dev &
APP_PID=$!

# Wait for application to start
sleep 10

# Run Agent 3 comprehensive tests
echo "Running Main Application comprehensive tests..."
npm test -- tests/agent-3-main-application.test.js

echo ""
echo "🎯 Agent 3 Instructions:"
echo "1. Open browser to: http://localhost:3000"
echo "2. Test EVERY button, link, and function in the application"
echo "3. Navigate through all pages and check for errors"
echo "4. Test character management, scene controls, hardware interfaces"
echo "5. Verify audio, video, TTS, STT, and automation functionality"
echo "6. Monitor console continuously for any JavaScript errors"
echo "7. Test on both Windows and Raspberry Pi environments if possible"
echo "8. Update tests as you fix issues"
echo "9. Commit fixes to agent-3-main-app-fixes branch"
echo ""
echo "Press Ctrl+C to stop the application"
wait $APP_PID
