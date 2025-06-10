# Agent 3: Main Application Comprehensive Testing - PowerShell Script
Write-Host "🤖 Starting Agent 3: Main Application Comprehensive Testing" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Focus: http://localhost:3000 (entire application)" -ForegroundColor Yellow
Write-Host "Testing: All buttons, functions, pages, console errors" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 3 branch
Write-Host "Switching to agent-3-main-app-fixes branch..." -ForegroundColor Green
git checkout agent-3-main-app-fixes

# Set environment for Agent 3
$env:AGENT_ID = "agent-3"
$env:AGENT_FOCUS = "main-application"
$env:TEST_URL = "http://localhost:3000"
$env:PORT = "3002"

# Start the application on port 3002
Write-Host "Starting MonsterBox application on port 3002..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "dev"

# Wait for application to start
Write-Host "Waiting for application to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Run Agent 3 comprehensive tests
Write-Host "Running Main Application comprehensive tests..." -ForegroundColor Green
npm test -- tests/agent-3-main-application.test.js

Write-Host ""
Write-Host "🎯 Agent 3 Instructions:" -ForegroundColor Magenta
Write-Host "1. Open browser to: http://localhost:3000" -ForegroundColor White
Write-Host "2. Test EVERY button, link, and function in the application" -ForegroundColor White
Write-Host "3. Navigate through all pages and check for errors" -ForegroundColor White
Write-Host "4. Test character management, scene controls, hardware interfaces" -ForegroundColor White
Write-Host "5. Verify audio, video, TTS, STT, and automation functionality" -ForegroundColor White
Write-Host "6. Monitor console continuously for any JavaScript errors" -ForegroundColor White
Write-Host "7. Test on both Windows and Raspberry Pi environments if possible" -ForegroundColor White
Write-Host "8. Update tests as you fix issues" -ForegroundColor White
Write-Host "9. Commit fixes to agent-3-main-app-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the application" -ForegroundColor Red

# Keep the script running
Read-Host "Press Enter to exit"
