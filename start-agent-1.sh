#!/bin/bash
echo "🤖 Starting Agent 1: AI Integration Testing on Skulltalker RPI4b"
echo "================================================================="
echo "Remote Target: Skulltalker (192.168.8.130)"
echo "Focus: http://192.168.8.130:3000/ai-integration-test.html"
echo "Testing: AI Chat, Character Management, TTS, System Status, WebSocket"
echo ""

# Switch to agent 1 branch locally
git checkout agent-1-ai-fixes

# Set environment for Agent 1
export AGENT_ID="agent-1"
export AGENT_FOCUS="ai-integration"
export REMOTE_HOST="192.168.8.130"
export REMOTE_USER="remote"
export TEST_URL="http://192.168.8.130:3000/ai-integration-test.html"

# Deploy code to Skulltalker RPI4b and start application
echo "Deploying MonsterBox to Skulltalker RPI4b..."
echo "Syncing code to remote@192.168.8.130..."

# Create deployment script for remote execution
cat > deploy-agent-1.sh << 'EOF'
#!/bin/bash
echo '🎃 Agent 1: Setting up MonsterBox on Skulltalker RPI4b'
cd /home/remote/MonsterBox || exit 1
git checkout agent-1-ai-fixes
git pull origin agent-1-ai-fixes
npm install
export AGENT_ID=agent-1
export AGENT_FOCUS=ai-integration
export NODE_ENV=development
export PORT=3000
echo 'Starting MonsterBox application...'
npm run dev &
sleep 15
echo 'Running AI Integration tests...'
npm test -- tests/agent-1-ai-integration.test.js
EOF

# Execute deployment on remote RPI4b
echo "Executing deployment on Skulltalker..."
scp deploy-agent-1.sh remote@192.168.8.130:/tmp/
ssh remote@192.168.8.130 "chmod +x /tmp/deploy-agent-1.sh && /tmp/deploy-agent-1.sh"

echo ""
echo "🎯 Agent 1 Remote Testing Instructions:"
echo "1. Application running on: http://192.168.8.130:3000/ai-integration-test.html"
echo "2. Test AI chat with all characters using Skulltalker's hardware"
echo "3. Verify TTS generation with actual audio output on RPI4b"
echo "4. Test WebSocket connections with real jaw animation hardware"
echo "5. Monitor RPI4b console logs for hardware-specific errors"
echo "6. Test GPIO, I2C, SPI, and audio interfaces"
echo "7. Verify camera/webcam functionality if available"
echo "8. Update tests based on hardware testing results"
echo "9. Commit fixes to agent-1-ai-fixes branch"
echo ""
echo "🔧 Remote Access Commands:"
echo "SSH to Skulltalker: ssh remote@192.168.8.130"
echo "View logs: ssh remote@192.168.8.130 'tail -f /home/remote/MonsterBox/log/*.log'"
echo "Stop app: ssh remote@192.168.8.130 'pkill -f npm'"
echo ""
echo "Press Enter to continue monitoring or Ctrl+C to exit..."
read
