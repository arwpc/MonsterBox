#!/bin/bash
echo "🤖 Starting Agent 3: Main Application Testing on Coffin RPI4b"
echo "============================================================="
echo "Remote Target: Coffin Breaker (192.168.8.140)"
echo "Focus: http://192.168.8.140:3000 (entire application)"
echo "Testing: All buttons, functions, pages, hardware integration"
echo ""

# Switch to agent 3 branch locally
git checkout agent-3-main-app-fixes

# Set environment for Agent 3
export AGENT_ID="agent-3"
export AGENT_FOCUS="main-application"
export REMOTE_HOST="192.168.8.140"
export REMOTE_USER="remote"
export TEST_URL="http://192.168.8.140:3000"

# Deploy code to Coffin RPI4b and start application
echo "Deploying MonsterBox to Coffin Breaker RPI4b..."
echo "Syncing code to remote@192.168.8.140..."

# Create deployment script for remote execution
cat > deploy-agent-3.sh << 'EOF'
#!/bin/bash
echo '⚰️ Agent 3: Setting up MonsterBox on Coffin Breaker RPI4b'
cd /home/remote/MonsterBox || exit 1
git checkout agent-3-main-app-fixes
git pull origin agent-3-main-app-fixes
npm install
export AGENT_ID=agent-3
export AGENT_FOCUS=main-application
export NODE_ENV=development
export PORT=3000
echo 'Starting MonsterBox application with full hardware integration...'
npm run dev &
sleep 15
echo 'Running comprehensive application tests with real hardware...'
npm test -- tests/agent-3-main-application.test.js
EOF

# Execute deployment on remote RPI4b
echo "Executing deployment on Coffin Breaker..."
scp deploy-agent-3.sh remote@192.168.8.140:/tmp/
ssh remote@192.168.8.140 "chmod +x /tmp/deploy-agent-3.sh && /tmp/deploy-agent-3.sh"

echo ""
echo "🎯 Agent 3 Remote Testing Instructions:"
echo "1. Application running on: http://192.168.8.140:3000"
echo "2. Test EVERY button, link, and function with REAL hardware"
echo "3. Test character management with actual animatronic responses"
echo "4. Test scene controls with linear actuator and sound systems"
echo "5. Verify audio/video with actual speakers and camera hardware"
echo "6. Test TTS/STT with real microphone and audio output"
echo "7. Test GPIO controls for LEDs, sensors, and actuators"
echo "8. Test I2C/SPI interfaces and hardware communication"
echo "9. Monitor RPI4b system performance and resource usage"
echo "10. Test network connectivity and remote control features"
echo "11. Verify all hardware safety and error handling"
echo "12. Update tests based on real hardware behavior"
echo "13. Commit fixes to agent-3-main-app-fixes branch"
echo ""
echo "🔧 Remote Access Commands:"
echo "SSH to Coffin: ssh remote@192.168.8.140"
echo "View system logs: ssh remote@192.168.8.140 'tail -f /var/log/syslog'"
echo "Hardware status: ssh remote@192.168.8.140 'vcgencmd measure_temp && free -h'"
echo "GPIO status: ssh remote@192.168.8.140 'gpio readall'"
echo "Stop app: ssh remote@192.168.8.140 'pkill -f npm'"
echo ""
echo "Press Enter to continue monitoring or Ctrl+C to exit..."
read
