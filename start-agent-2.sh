#!/bin/bash
echo "🤖 Starting Agent 2: ChatterPi Chat Testing on Orlok RPI4b"
echo "=========================================================="
echo "Remote Target: Count Orlok (192.168.8.120)"
echo "Focus: http://192.168.8.120:3000/chatterpi-chat.html"
echo "Testing: Real-time AI Conversation, Jaw Animation Sync, WebSocket"
echo ""

# Switch to agent 2 branch locally
git checkout agent-2-chatterpi-fixes

# Set environment for Agent 2
export AGENT_ID="agent-2"
export AGENT_FOCUS="chatterpi-chat"
export REMOTE_HOST="192.168.8.120"
export REMOTE_USER="remote"
export TEST_URL="http://192.168.8.120:3000/chatterpi-chat.html"

# Deploy code to Orlok RPI4b and start application
echo "Deploying MonsterBox to Orlok RPI4b..."
echo "Syncing code to remote@192.168.8.120..."

# Create deployment script for remote execution
cat > deploy-agent-2.sh << 'EOF'
#!/bin/bash
echo '🧛 Agent 2: Setting up MonsterBox on Orlok RPI4b'
cd /home/remote/MonsterBox || exit 1
git checkout agent-2-chatterpi-fixes
git pull origin agent-2-chatterpi-fixes
npm install
export AGENT_ID=agent-2
export AGENT_FOCUS=chatterpi-chat
export NODE_ENV=development
export PORT=3000
echo 'Starting MonsterBox application with jaw animation...'
npm run dev &
sleep 15
echo 'Running ChatterPi Chat tests with real hardware...'
npm test -- tests/agent-2-chatterpi-chat.test.js
EOF

# Execute deployment on remote RPI4b
echo "Executing deployment on Orlok..."
scp deploy-agent-2.sh remote@192.168.8.120:/tmp/
ssh remote@192.168.8.120 "chmod +x /tmp/deploy-agent-2.sh && /tmp/deploy-agent-2.sh"

echo ""
echo "🎯 Agent 2 Remote Testing Instructions:"
echo "1. Application running on: http://192.168.8.120:3000/chatterpi-chat.html"
echo "2. Test real-time AI conversations with ACTUAL jaw servo movement"
echo "3. Verify WebSocket jaw commands control physical servo on GPIO18"
echo "4. Test audio processing with real speakers and microphone"
echo "5. Monitor jaw servo timing and synchronization with audio"
echo "6. Test volume analysis with actual audio input/output"
echo "7. Verify LED eye controls and other GPIO features"
echo "8. Monitor RPI4b hardware performance during operation"
echo "9. Update tests based on real hardware behavior"
echo "10. Commit fixes to agent-2-chatterpi-fixes branch"
echo ""
echo "🔧 Remote Access Commands:"
echo "SSH to Orlok: ssh remote@192.168.8.120"
echo "View jaw logs: ssh remote@192.168.8.120 'tail -f /home/remote/MonsterBox/log/jaw-animation.log'"
echo "GPIO status: ssh remote@192.168.8.120 'gpio readall'"
echo "Stop app: ssh remote@192.168.8.120 'pkill -f npm'"
echo ""
echo "Press Enter to continue monitoring or Ctrl+C to exit..."
read
