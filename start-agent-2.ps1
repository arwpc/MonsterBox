# Agent 2: ChatterPi Interactive Chat Testing - Remote RPI4b Execution
Write-Host "🤖 Starting Agent 2: ChatterPi Chat Testing on Orlok RPI4b" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Remote Target: Count Orlok (192.168.8.120)" -ForegroundColor Yellow
Write-Host "Focus: http://192.168.8.120:3000/chatterpi-chat.html" -ForegroundColor Yellow
Write-Host "Testing: Real-time AI Conversation, Jaw Animation Sync, WebSocket" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 2 branch locally
Write-Host "Switching to agent-2-chatterpi-fixes branch..." -ForegroundColor Green
git checkout agent-2-chatterpi-fixes

# Set environment for Agent 2
$env:AGENT_ID = "agent-2"
$env:AGENT_FOCUS = "chatterpi-chat"
$env:REMOTE_HOST = "192.168.8.120"
$env:REMOTE_USER = "remote"
$env:TEST_URL = "http://192.168.8.120:3000/chatterpi-chat.html"

# Deploy code to Orlok RPI4b and start application
Write-Host "Deploying MonsterBox to Orlok RPI4b..." -ForegroundColor Green
Write-Host "Syncing code to remote@192.168.8.120..." -ForegroundColor Yellow

# Create deployment script for remote execution
$deployScript = @"
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
"@

$deployScript | Out-File -FilePath "deploy-agent-2.sh" -Encoding UTF8

# Execute deployment on remote RPI4b
Write-Host "Executing deployment on Orlok..." -ForegroundColor Green
scp deploy-agent-2.sh remote@192.168.8.120:/tmp/
ssh remote@192.168.8.120 "chmod +x /tmp/deploy-agent-2.sh && /tmp/deploy-agent-2.sh"

Write-Host ""
Write-Host "🎯 Agent 2 Remote Testing Instructions:" -ForegroundColor Magenta
Write-Host "1. Application running on: http://192.168.8.120:3000/chatterpi-chat.html" -ForegroundColor White
Write-Host "2. Test real-time AI conversations with ACTUAL jaw servo movement" -ForegroundColor White
Write-Host "3. Verify WebSocket jaw commands control physical servo on GPIO18" -ForegroundColor White
Write-Host "4. Test audio processing with real speakers and microphone" -ForegroundColor White
Write-Host "5. Monitor jaw servo timing and synchronization with audio" -ForegroundColor White
Write-Host "6. Test volume analysis with actual audio input/output" -ForegroundColor White
Write-Host "7. Verify LED eye controls and other GPIO features" -ForegroundColor White
Write-Host "8. Monitor RPI4b hardware performance during operation" -ForegroundColor White
Write-Host "9. Update tests based on real hardware behavior" -ForegroundColor White
Write-Host "10. Commit fixes to agent-2-chatterpi-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Remote Access Commands:" -ForegroundColor Cyan
Write-Host "SSH to Orlok: ssh remote@192.168.8.120" -ForegroundColor White
Write-Host "View jaw logs: ssh remote@192.168.8.120 'tail -f /home/remote/MonsterBox/log/jaw-animation.log'" -ForegroundColor White
Write-Host "GPIO status: ssh remote@192.168.8.120 'gpio readall'" -ForegroundColor White
Write-Host "Stop app: ssh remote@192.168.8.120 'pkill -f npm'" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to continue monitoring or Ctrl+C to exit..." -ForegroundColor Red

# Keep monitoring remote application
Read-Host "Press Enter to exit"
