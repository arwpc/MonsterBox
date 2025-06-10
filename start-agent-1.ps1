# Agent 1: AI Integration Testing - Remote RPI4b Execution
Write-Host "🤖 Starting Agent 1: AI Integration Testing on Skulltalker RPI4b" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Remote Target: Skulltalker (192.168.8.130)" -ForegroundColor Yellow
Write-Host "Focus: http://192.168.8.130:3000/ai-integration-test.html" -ForegroundColor Yellow
Write-Host "Testing: AI Chat, Character Management, TTS, System Status, WebSocket" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 1 branch locally
Write-Host "Switching to agent-1-ai-fixes branch..." -ForegroundColor Green
git checkout agent-1-ai-fixes

# Set environment for Agent 1
$env:AGENT_ID = "agent-1"
$env:AGENT_FOCUS = "ai-integration"
$env:REMOTE_HOST = "192.168.8.130"
$env:REMOTE_USER = "remote"
$env:TEST_URL = "http://192.168.8.130:3000/ai-integration-test.html"

# Deploy code to Skulltalker RPI4b and start application
Write-Host "Deploying MonsterBox to Skulltalker RPI4b..." -ForegroundColor Green
Write-Host "Syncing code to remote@192.168.8.130..." -ForegroundColor Yellow

# Create deployment script for remote execution
$deployScript = @"
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
"@

$deployScript | Out-File -FilePath "deploy-agent-1.sh" -Encoding UTF8

# Execute deployment on remote RPI4b
Write-Host "Executing deployment on Skulltalker..." -ForegroundColor Green
scp deploy-agent-1.sh remote@192.168.8.130:/tmp/
ssh remote@192.168.8.130 "chmod +x /tmp/deploy-agent-1.sh && /tmp/deploy-agent-1.sh"

Write-Host ""
Write-Host "🎯 Agent 1 Remote Testing Instructions:" -ForegroundColor Magenta
Write-Host "1. Application running on: http://192.168.8.130:3000/ai-integration-test.html" -ForegroundColor White
Write-Host "2. Test AI chat with all characters using Skulltalker's hardware" -ForegroundColor White
Write-Host "3. Verify TTS generation with actual audio output on RPI4b" -ForegroundColor White
Write-Host "4. Test WebSocket connections with real jaw animation hardware" -ForegroundColor White
Write-Host "5. Monitor RPI4b console logs for hardware-specific errors" -ForegroundColor White
Write-Host "6. Test GPIO, I2C, SPI, and audio interfaces" -ForegroundColor White
Write-Host "7. Verify camera/webcam functionality if available" -ForegroundColor White
Write-Host "8. Update tests based on hardware testing results" -ForegroundColor White
Write-Host "9. Commit fixes to agent-1-ai-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Remote Access Commands:" -ForegroundColor Cyan
Write-Host "SSH to Skulltalker: ssh remote@192.168.8.130" -ForegroundColor White
Write-Host "View logs: ssh remote@192.168.8.130 'tail -f /home/remote/MonsterBox/log/*.log'" -ForegroundColor White
Write-Host "Stop app: ssh remote@192.168.8.130 'pkill -f npm'" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to continue monitoring or Ctrl+C to exit..." -ForegroundColor Red

# Keep monitoring remote application
Read-Host "Press Enter to exit"
