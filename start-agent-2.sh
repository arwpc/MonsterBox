#!/bin/bash
echo "🤖 Starting Agent 2: ChatterPi Interactive Chat Testing"
echo "======================================================"
echo "Focus: http://localhost:3000/chatterpi-chat.html"
echo "Testing: Real-time AI Conversation, Jaw Animation Sync, WebSocket"
echo ""

# Switch to agent 2 branch
git checkout agent-2-chatterpi-fixes

# Set environment for Agent 2
export AGENT_ID="agent-2"
export AGENT_FOCUS="chatterpi-chat"
export TEST_URL="http://localhost:3000/chatterpi-chat.html"
export PATH=~/.npm-global/bin:$PATH

# Start the application on port 3001
echo "Starting MonsterBox application..."
PORT=3001 npm run dev &
APP_PID=$!

# Wait for application to start
sleep 10

# Run Agent 2 specific tests
echo "Running ChatterPi Chat tests..."
npm test -- tests/agent-2-chatterpi-chat.test.js

echo ""
echo "🎯 Agent 2 Instructions:"
echo "1. Open browser to: http://localhost:3000/chatterpi-chat.html"
echo "2. Test real-time AI conversations with jaw animation"
echo "3. Verify WebSocket connections for jaw animation sync"
echo "4. Test audio processing and volume analysis"
echo "5. Check jaw movement visualization and timing"
echo "6. Monitor console for WebSocket and animation errors"
echo "7. Update tests as you fix issues"
echo "8. Commit fixes to agent-2-chatterpi-fixes branch"
echo ""
echo "Press Ctrl+C to stop the application"
wait $APP_PID
