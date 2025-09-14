# Restart MonsterBox on Skulltalker RPI4b
# PowerShell script for jaw animation debugging

param(
    [string]$TargetHost = "192.168.8.130",
    [string]$SSHUser = "remote",
    [string]$SSHPassword = "klrklr89!"
)

Write-Host "🔄 Restarting MonsterBox on Skulltalker ($TargetHost)..." -ForegroundColor Green

# Function to execute SSH command
function Invoke-SSHCommand {
    param(
        [string]$Command,
        [string]$Description = ""
    )
    
    if ($Description) {
        Write-Host "Executing: $Description" -ForegroundColor Yellow
    }
    
    try {
        # Use plink if available, otherwise try ssh
        $sshCmd = "ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $SSHUser@$TargetHost `"$Command`""
        
        Write-Host "Running: $sshCmd" -ForegroundColor Cyan
        
        $result = Invoke-Expression $sshCmd
        return $result
    }
    catch {
        Write-Host "SSH command failed: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

try {
    # Step 1: Test connectivity
    Write-Host "🔍 Testing SSH connectivity..." -ForegroundColor Yellow
    $testResult = Invoke-SSHCommand -Command "echo 'SSH connection successful'" -Description "Testing SSH connection"
    
    if ($testResult -notlike "*SSH connection successful*") {
        throw "SSH connectivity test failed"
    }
    Write-Host "✅ SSH connectivity confirmed" -ForegroundColor Green

    # Step 2: Stop existing MonsterBox processes
    Write-Host "🛑 Stopping existing MonsterBox processes..." -ForegroundColor Yellow
    Invoke-SSHCommand -Command "pkill -f 'node.*app.js' || true" -Description "Stopping MonsterBox processes"
    
    # Wait for processes to stop
    Start-Sleep -Seconds 3
    
    # Step 3: Check if processes are stopped
    $processCheck = Invoke-SSHCommand -Command "ps aux | grep 'node.*app.js' | grep -v grep || echo 'No processes found'" -Description "Checking for remaining processes"
    Write-Host "Process check result: $processCheck" -ForegroundColor Cyan

    # Step 4: Start MonsterBox
    Write-Host "🚀 Starting MonsterBox..." -ForegroundColor Yellow
    Invoke-SSHCommand -Command "cd /home/remote/MonsterBox && nohup npm start > /dev/null 2>&1 &" -Description "Starting MonsterBox"
    
    # Wait for startup
    Start-Sleep -Seconds 5
    
    # Step 5: Validate restart
    Write-Host "✅ Validating restart..." -ForegroundColor Yellow
    $newProcessCheck = Invoke-SSHCommand -Command "ps aux | grep 'node.*app.js' | grep -v grep || echo 'No process found'" -Description "Checking new MonsterBox process"
    
    if ($newProcessCheck -like "*node*" -and $newProcessCheck -like "*app.js*") {
        Write-Host "✅ MonsterBox process is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️ MonsterBox process not detected (may still be starting)" -ForegroundColor Yellow
    }
    
    # Test if port 3000 is listening
    $portCheck = Invoke-SSHCommand -Command "netstat -tlnp | grep :3000 || echo 'Port not listening'" -Description "Checking port 3000"
    
    if ($portCheck -like "*:3000*") {
        Write-Host "✅ MonsterBox is listening on port 3000" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Port 3000 not detected (may still be starting)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host "🎉 RESTART COMPLETED!" -ForegroundColor Green
    Write-Host "Access MonsterBox: http://$TargetHost`:3000" -ForegroundColor Cyan
    Write-Host "Test jaw animation: http://$TargetHost`:3000/jaw-animation/test?characterId=4" -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Restart failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual restart instructions:" -ForegroundColor Yellow
    Write-Host "1. SSH to skulltalker: ssh remote@192.168.8.130" -ForegroundColor Cyan
    Write-Host "2. Password: klrklr89!" -ForegroundColor Cyan
    Write-Host "3. Stop MonsterBox: pkill -f 'node.*app.js'" -ForegroundColor Cyan
    Write-Host "4. Start MonsterBox: cd /home/remote/MonsterBox && npm start" -ForegroundColor Cyan
    exit 1
}
