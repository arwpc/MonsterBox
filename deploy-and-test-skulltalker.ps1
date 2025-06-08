# Deploy and Test Skulltalker Jaw Animation System
param(
    [string]$Host = "192.168.8.130",
    [string]$User = "remote",
    [string]$Password = "klrklr89!"
)

Write-Host "🦴 Deploying Jaw Animation System to Skulltalker" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

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
        $sshCmd = "echo $Password | ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $User@$Host `"$Command`""
        
        $result = cmd /c $sshCmd 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Success: $Description" -ForegroundColor Green
            return $result
        } else {
            Write-Host "❌ Failed: $Description" -ForegroundColor Red
            Write-Host "Output: $result" -ForegroundColor Red
            return $null
        }
    }
    catch {
        Write-Host "❌ Error: $Description - $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

try {
    # Step 1: Test connectivity
    Write-Host "`n🔍 Testing SSH connectivity..." -ForegroundColor Cyan
    $testResult = Invoke-SSHCommand -Command "echo 'SSH connection successful'" -Description "Testing SSH connection"
    
    if (-not $testResult) {
        throw "SSH connection failed"
    }
    
    # Step 2: Pull latest changes
    Write-Host "`n📥 Pulling latest changes..." -ForegroundColor Cyan
    $pullResult = Invoke-SSHCommand -Command "cd MonsterBox && git pull origin Skulltalker" -Description "Pulling Skulltalker branch"
    
    # Step 3: Test imports
    Write-Host "`n🧪 Testing jaw animation imports..." -ForegroundColor Cyan
    $importTest = Invoke-SSHCommand -Command "cd MonsterBox && node -e `"require('./scripts/jaw-animation/jawAnimationSystem'); console.log('Jaw animation imports OK');`"" -Description "Testing imports"
    
    if ($importTest -and $importTest -match "Jaw animation imports OK") {
        Write-Host "✅ Jaw animation imports successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Import test failed: $importTest" -ForegroundColor Red
    }
    
    # Step 4: Stop existing processes
    Write-Host "`n🔄 Stopping existing processes..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "pkill -f 'node.*app.js' || true" -Description "Stopping existing processes"
    
    Start-Sleep -Seconds 3
    
    # Step 5: Start MonsterBox
    Write-Host "`n🚀 Starting MonsterBox..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "cd MonsterBox && nohup npm start > /dev/null 2>&1 &" -Description "Starting MonsterBox"
    
    Start-Sleep -Seconds 5
    
    # Step 6: Check if server is running
    Write-Host "`n✅ Checking server status..." -ForegroundColor Cyan
    $processCheck = Invoke-SSHCommand -Command "ps aux | grep 'node.*app.js' | grep -v grep || echo 'No process found'" -Description "Checking MonsterBox process"
    
    if ($processCheck -and $processCheck -match "node" -and $processCheck -match "app.js") {
        Write-Host "✅ MonsterBox process is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️ MonsterBox process not found: $processCheck" -ForegroundColor Yellow
    }
    
    # Step 7: Test web interface
    Write-Host "`n🌐 Testing web interface..." -ForegroundColor Cyan
    try {
        $webTest = Invoke-WebRequest -Uri "http://$Host`:3000" -TimeoutSec 10 -ErrorAction Stop
        Write-Host "✅ Web interface is accessible" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Web interface not yet accessible (may still be starting)" -ForegroundColor Yellow
    }
    
    # Success report
    Write-Host "`n" + "="*80 -ForegroundColor Green
    Write-Host "🎉 DEPLOYMENT COMPLETED!" -ForegroundColor Green
    Write-Host "="*80 -ForegroundColor Green
    Write-Host "📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Access MonsterBox: http://$Host`:3000" -ForegroundColor White
    Write-Host "   2. Test Jaw Animation: http://$Host`:3000/jaw-animation/test" -ForegroundColor White
    Write-Host "   3. Select Skulltalker character (ID: 4)" -ForegroundColor White
    Write-Host "   4. Select Jaw Servo (GPIO pin 18)" -ForegroundColor White
    Write-Host "   5. Test servo movement and jaw animation" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "`n" + "="*80 -ForegroundColor Red
    Write-Host "💥 DEPLOYMENT FAILED!" -ForegroundColor Red
    Write-Host "="*80 -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}
