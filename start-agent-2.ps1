# Agent 2: ChatterPi Interactive Chat Testing - PowerShell Script
Write-Host "🤖 Starting Agent 2: ChatterPi Interactive Chat Testing" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Focus: http://localhost:3000/chatterpi-chat.html" -ForegroundColor Yellow
Write-Host "Testing: Real-time AI Conversation, Jaw Animation Sync, WebSocket" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 2 branch
Write-Host "Switching to agent-2-chatterpi-fixes branch..." -ForegroundColor Green
git checkout agent-2-chatterpi-fixes

# Set environment for Agent 2
$env:AGENT_ID = "agent-2"
$env:AGENT_FOCUS = "chatterpi-chat"
$env:TEST_URL = "http://localhost:3000/chatterpi-chat.html"
$env:PORT = "3001"

# Start the application on port 3001
Write-Host "Starting MonsterBox application on port 3001..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "dev"

# Wait for application to start
Write-Host "Waiting for application to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Run Agent 2 specific tests
Write-Host "Running ChatterPi Chat tests..." -ForegroundColor Green
npm test -- tests/agent-2-chatterpi-chat.test.js

Write-Host ""
Write-Host "🎯 Agent 2 Instructions:" -ForegroundColor Magenta
Write-Host "1. Open browser to: http://localhost:3000/chatterpi-chat.html" -ForegroundColor White
Write-Host "2. Test real-time AI conversations with jaw animation" -ForegroundColor White
Write-Host "3. Verify WebSocket connections for jaw animation sync" -ForegroundColor White
Write-Host "4. Test audio processing and volume analysis" -ForegroundColor White
Write-Host "5. Check jaw movement visualization and timing" -ForegroundColor White
Write-Host "6. Monitor console for WebSocket and animation errors" -ForegroundColor White
Write-Host "7. Update tests as you fix issues" -ForegroundColor White
Write-Host "8. Commit fixes to agent-2-chatterpi-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the application" -ForegroundColor Red

# Keep the script running
Read-Host "Press Enter to exit"
