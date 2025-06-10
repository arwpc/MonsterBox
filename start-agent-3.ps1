# Agent 3: Main Application Comprehensive Testing - Remote RPI4b Execution
Write-Host "🤖 Starting Agent 3: Main Application Testing on Coffin RPI4b" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "Remote Target: Coffin Breaker (192.168.8.140)" -ForegroundColor Yellow
Write-Host "Focus: http://192.168.8.140:3000 (entire application)" -ForegroundColor Yellow
Write-Host "Testing: All buttons, functions, pages, hardware integration" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 3 branch locally
Write-Host "Switching to agent-3-main-app-fixes branch..." -ForegroundColor Green
git checkout agent-3-main-app-fixes

# Set environment for Agent 3
$env:AGENT_ID = "agent-3"
$env:AGENT_FOCUS = "main-application"
$env:REMOTE_HOST = "192.168.8.140"
$env:REMOTE_USER = "remote"
$env:TEST_URL = "http://192.168.8.140:3000"

# Deploy code to Coffin RPI4b and start application
Write-Host "Deploying MonsterBox to Coffin Breaker RPI4b..." -ForegroundColor Green
Write-Host "Syncing code to remote@192.168.8.140..." -ForegroundColor Yellow

# Create deployment script for remote execution
$deployScript = @"
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
"@

$deployScript | Out-File -FilePath "deploy-agent-3.sh" -Encoding UTF8

# Execute deployment on remote RPI4b
Write-Host "Executing deployment on Coffin Breaker..." -ForegroundColor Green
scp deploy-agent-3.sh remote@192.168.8.140:/tmp/
ssh remote@192.168.8.140 "chmod +x /tmp/deploy-agent-3.sh && /tmp/deploy-agent-3.sh"

Write-Host ""
Write-Host "🎯 Agent 3 Remote Testing Instructions:" -ForegroundColor Magenta
Write-Host "1. Application running on: http://192.168.8.140:3000" -ForegroundColor White
Write-Host "2. Test EVERY button, link, and function with REAL hardware" -ForegroundColor White
Write-Host "3. Test character management with actual animatronic responses" -ForegroundColor White
Write-Host "4. Test scene controls with linear actuator and sound systems" -ForegroundColor White
Write-Host "5. Verify audio/video with actual speakers and camera hardware" -ForegroundColor White
Write-Host "6. Test TTS/STT with real microphone and audio output" -ForegroundColor White
Write-Host "7. Test GPIO controls for LEDs, sensors, and actuators" -ForegroundColor White
Write-Host "8. Test I2C/SPI interfaces and hardware communication" -ForegroundColor White
Write-Host "9. Monitor RPI4b system performance and resource usage" -ForegroundColor White
Write-Host "10. Test network connectivity and remote control features" -ForegroundColor White
Write-Host "11. Verify all hardware safety and error handling" -ForegroundColor White
Write-Host "12. Update tests based on real hardware behavior" -ForegroundColor White
Write-Host "13. Commit fixes to agent-3-main-app-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Remote Access Commands:" -ForegroundColor Cyan
Write-Host "SSH to Coffin: ssh remote@192.168.8.140" -ForegroundColor White
Write-Host "View system logs: ssh remote@192.168.8.140 'tail -f /var/log/syslog'" -ForegroundColor White
Write-Host "Hardware status: ssh remote@192.168.8.140 'vcgencmd measure_temp && free -h'" -ForegroundColor White
Write-Host "GPIO status: ssh remote@192.168.8.140 'gpio readall'" -ForegroundColor White
Write-Host "Stop app: ssh remote@192.168.8.140 'pkill -f npm'" -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to continue monitoring or Ctrl+C to exit..." -ForegroundColor Red

# Keep monitoring remote application
Read-Host "Press Enter to exit"
