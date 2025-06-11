# ChatterPi Restart and Test Script for Skulltalker RPI4b
Write-Host "🎃 Restarting ChatterPi on Skulltalker RPI4b..." -ForegroundColor Green

$remoteHost = "192.168.8.130"
$remoteUser = "remote"

Write-Host "📡 Testing SSH connectivity..." -ForegroundColor Yellow
try {
    ssh ${remoteUser}@${remoteHost} 'echo "SSH OK"'
    Write-Host "✅ SSH connection successful" -ForegroundColor Green
} catch {
    Write-Host "❌ SSH connection failed" -ForegroundColor Red
    exit 1
}

Write-Host "🔄 Stopping any existing MonsterBox processes..." -ForegroundColor Yellow
ssh ${remoteUser}@${remoteHost} "pkill -f 'node.*app.js' 2>/dev/null || true; pkill -f 'npm.*dev' 2>/dev/null || true"

Write-Host "🚀 Starting MonsterBox application..." -ForegroundColor Yellow
ssh ${remoteUser}@${remoteHost} "cd /home/remote/MonsterBox && nohup npm run dev > app.log 2>&1 &"

Write-Host "⏳ Waiting 15 seconds for application to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "🧪 Testing ChatterPi pages..." -ForegroundColor Yellow

# Test main application
try {
    $response = Invoke-WebRequest -Uri "http://${remoteHost}:3000" -Method Head -TimeoutSec 10
    Write-Host "✅ Main application is running (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "❌ Main application is not accessible" -ForegroundColor Red
}

# Test ChatterPi Chat page
try {
    $response = Invoke-WebRequest -Uri "http://${remoteHost}:3000/chatterpi-chat.html" -Method Head -TimeoutSec 10
    Write-Host "✅ ChatterPi Chat page is accessible (Status: $($response.StatusCode))" -ForegroundColor Green
    Write-Host "🎯 PRIMARY URL: http://${remoteHost}:3000/chatterpi-chat.html" -ForegroundColor Cyan
} catch {
    Write-Host "❌ ChatterPi Chat page is not accessible" -ForegroundColor Red
}

# Test ChatterPi AI Chat page
try {
    $response = Invoke-WebRequest -Uri "http://${remoteHost}:3000/chatterpi-ai-chat.html" -Method Head -TimeoutSec 10
    Write-Host "✅ ChatterPi AI Chat page is accessible (Status: $($response.StatusCode))" -ForegroundColor Green
    Write-Host "🎯 ALTERNATIVE URL: http://${remoteHost}:3000/chatterpi-ai-chat.html" -ForegroundColor Cyan
} catch {
    Write-Host "❌ ChatterPi AI Chat page is not accessible" -ForegroundColor Red
}

Write-Host "📊 Application status check..." -ForegroundColor Yellow
ssh ${remoteUser}@${remoteHost} "cd /home/remote/MonsterBox && ps aux | grep node | grep -v grep && echo '---' && netstat -tlnp | grep :3000"

Write-Host ""
Write-Host "🎃 ChatterPi Restart Complete!" -ForegroundColor Green
Write-Host "🦴 Try these URLs for jaw animation testing:" -ForegroundColor Yellow
Write-Host "   http://192.168.8.130:3000/chatterpi-chat.html" -ForegroundColor White
Write-Host "   http://192.168.8.130:3000/chatterpi-ai-chat.html" -ForegroundColor White
