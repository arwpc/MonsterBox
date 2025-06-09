#!/bin/bash
echo "🤖 Starting Agent 1: AI Integration Testing"
echo "=========================================="
echo "Focus: http://localhost:3000/ai-integration-test.html"
echo "Testing: AI Chat, Character Management, TTS, System Status, WebSocket"
echo ""

# Switch to agent 1 branch
git checkout agent-1-ai-fixes

# Set environment for Agent 1
export AGENT_ID="agent-1"
export AGENT_FOCUS="ai-integration"
export TEST_URL="http://localhost:3000/ai-integration-test.html"
export PATH=~/.npm-global/bin:$PATH

# Start the application on port 3000
echo "Starting MonsterBox application..."
npm run dev &
APP_PID=$!

# Wait for application to start
sleep 10

# Run Agent 1 specific tests
echo "Running AI Integration tests..."
npm test -- tests/agent-1-ai-integration.test.js

echo ""
echo "🎯 Agent 1 Instructions:"
echo "1. Open browser to: http://localhost:3000/ai-integration-test.html"
echo "2. Test all AI chat functionality with different characters"
echo "3. Verify TTS generation with TopMediai integration"
echo "4. Check WebSocket connections and real-time features"
echo "5. Monitor console for errors and fix any issues found"
echo "6. Update tests as you fix issues"
echo "7. Commit fixes to agent-1-ai-fixes branch"
echo ""
echo "Press Ctrl+C to stop the application"
wait $APP_PID
