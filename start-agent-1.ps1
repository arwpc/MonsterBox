# Agent 1: AI Integration Testing - PowerShell Script
Write-Host "🤖 Starting Agent 1: AI Integration Testing" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Focus: http://localhost:3000/ai-integration-test.html" -ForegroundColor Yellow
Write-Host "Testing: AI Chat, Character Management, TTS, System Status, WebSocket" -ForegroundColor Yellow
Write-Host ""

# Switch to agent 1 branch
Write-Host "Switching to agent-1-ai-fixes branch..." -ForegroundColor Green
git checkout agent-1-ai-fixes

# Set environment for Agent 1
$env:AGENT_ID = "agent-1"
$env:AGENT_FOCUS = "ai-integration"
$env:TEST_URL = "http://localhost:3000/ai-integration-test.html"

# Start the application on port 3000
Write-Host "Starting MonsterBox application..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "dev"

# Wait for application to start
Write-Host "Waiting for application to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Run Agent 1 specific tests
Write-Host "Running AI Integration tests..." -ForegroundColor Green
npm test -- tests/agent-1-ai-integration.test.js

Write-Host ""
Write-Host "🎯 Agent 1 Instructions:" -ForegroundColor Magenta
Write-Host "1. Open browser to: http://localhost:3000/ai-integration-test.html" -ForegroundColor White
Write-Host "2. Test all AI chat functionality with different characters" -ForegroundColor White
Write-Host "3. Verify TTS generation with TopMediai integration" -ForegroundColor White
Write-Host "4. Check WebSocket connections and real-time features" -ForegroundColor White
Write-Host "5. Monitor console for errors and fix any issues found" -ForegroundColor White
Write-Host "6. Update tests as you fix issues" -ForegroundColor White
Write-Host "7. Commit fixes to agent-1-ai-fixes branch" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop the application" -ForegroundColor Red

# Keep the script running
Read-Host "Press Enter to exit"
