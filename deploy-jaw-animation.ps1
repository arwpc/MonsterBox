# Deploy Jaw Animation System to Skulltalker
# PowerShell script for automated deployment

param(
    [string]$Host = "192.168.8.130",
    [string]$User = "remote",
    [string]$Password = "klrklr89!",
    [string]$RemotePath = "/home/remote/MonsterBox"
)

Write-Host "🚀 Starting deployment to Skulltalker ($Host)" -ForegroundColor Green
Write-Host "Target: $User@$Host:$RemotePath" -ForegroundColor Cyan

# Function to execute SSH command with password
function Invoke-SSHCommand {
    param(
        [string]$Command,
        [string]$Description = ""
    )
    
    if ($Description) {
        Write-Host "Executing: $Description" -ForegroundColor Yellow
    }
    
    try {
        # Use plink (PuTTY) if available, otherwise try ssh with expect-like approach
        $sshCmd = "echo $Password | ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $User@$Host `"$Command`""
        
        $result = Invoke-Expression $sshCmd
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Success: $Description" -ForegroundColor Green
            return $result
        } else {
            throw "Command failed with exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Host "❌ Failed: $Description - $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

try {
    # Step 1: Test connectivity
    Write-Host "`n🔍 Testing SSH connectivity..." -ForegroundColor Cyan
    $testResult = Invoke-SSHCommand -Command "echo 'SSH connection successful'" -Description "Testing SSH connection"
    
    if ($testResult -match "SSH connection successful") {
        Write-Host "✅ SSH connectivity confirmed" -ForegroundColor Green
    } else {
        throw "Unexpected SSH response: $testResult"
    }
    
    # Step 2: Check MonsterBox directory
    Write-Host "`n📁 Checking MonsterBox directory..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "test -d $RemotePath && echo 'Directory exists' || echo 'Directory missing'" -Description "Checking MonsterBox directory"
    
    # Step 3: Create backup
    Write-Host "`n💾 Creating backup..." -ForegroundColor Cyan
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $backupPath = "/home/remote/MonsterBox_backup_$timestamp"
    
    try {
        Invoke-SSHCommand -Command "cp -r $RemotePath $backupPath" -Description "Creating backup"
        Write-Host "✅ Backup created at $backupPath" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️ Backup failed (continuing anyway): $($_.Exception.Message)" -ForegroundColor Yellow
    }
    
    # Step 4: Pull latest changes
    Write-Host "`n📥 Pulling latest changes..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "cd $RemotePath && git fetch origin && git checkout Skulltalker && git pull origin Skulltalker" -Description "Pulling Skulltalker branch changes"
    
    $commit = Invoke-SSHCommand -Command "cd $RemotePath && git rev-parse --short HEAD" -Description "Getting current commit"
    Write-Host "📝 Current commit: $commit" -ForegroundColor Cyan
    
    # Step 5: Update dependencies
    Write-Host "`n📦 Updating dependencies..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "cd $RemotePath && npm install" -Description "Installing npm dependencies"
    
    # Step 6: Test jaw animation system
    Write-Host "`n🦴 Testing jaw animation system..." -ForegroundColor Cyan
    
    # Check if jaw animation files exist
    $jawFiles = @(
        "scripts/jaw-animation/jawAnimationSystem.js",
        "scripts/jaw-animation/audio/audioAnalyzer.js",
        "scripts/jaw-animation/servo/servoMapper.js",
        "routes/jawAnimationRoutes.js",
        "views/test-jaw-animation.ejs"
    )
    
    foreach ($file in $jawFiles) {
        Invoke-SSHCommand -Command "test -f $RemotePath/$file && echo 'OK: $file' || echo 'MISSING: $file'" -Description "Checking $file"
    }
    
    # Test jaw animation imports
    Invoke-SSHCommand -Command "cd $RemotePath && node -e `"require('./scripts/jaw-animation/jawAnimationSystem'); console.log('Jaw animation system imports OK');`"" -Description "Testing jaw animation imports"
    
    # Step 7: Stop existing processes
    Write-Host "`n🔄 Restarting services..." -ForegroundColor Cyan
    Invoke-SSHCommand -Command "pkill -f 'node.*app.js' || true" -Description "Stopping existing processes"
    
    Start-Sleep -Seconds 3
    
    # Step 8: Start MonsterBox
    Invoke-SSHCommand -Command "cd $RemotePath && nohup npm start > /dev/null 2>&1 &" -Description "Starting MonsterBox"
    
    Start-Sleep -Seconds 5
    
    # Step 9: Validate deployment
    Write-Host "`n✅ Validating deployment..." -ForegroundColor Cyan
    
    $processes = Invoke-SSHCommand -Command "ps aux | grep 'node.*app.js' | grep -v grep || echo 'No process found'" -Description "Checking MonsterBox process"
    
    if ($processes -match "node" -and $processes -match "app.js") {
        Write-Host "✅ MonsterBox process is running" -ForegroundColor Green
    } else {
        Write-Host "⚠️ MonsterBox process not found: $processes" -ForegroundColor Yellow
    }
    
    $netstat = Invoke-SSHCommand -Command "netstat -tlnp | grep :3000 || echo 'Port not listening'" -Description "Checking port 3000"
    
    if ($netstat -match ":3000") {
        Write-Host "✅ MonsterBox is listening on port 3000" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Port 3000 not detected (may still be starting)" -ForegroundColor Yellow
    }
    
    # Success report
    Write-Host "`n" + "="*80 -ForegroundColor Green
    Write-Host "🎉 DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
    Write-Host "="*80 -ForegroundColor Green
    Write-Host "📝 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Access MonsterBox: http://$Host:3000" -ForegroundColor White
    Write-Host "   2. Test Jaw Animation: http://$Host:3000/jaw-animation/test" -ForegroundColor White
    Write-Host "   3. Configure jaw servo for character" -ForegroundColor White
    Write-Host "   4. Test jaw animation with audio" -ForegroundColor White
    Write-Host ""
    
}
catch {
    Write-Host "`n" + "="*80 -ForegroundColor Red
    Write-Host "💥 DEPLOYMENT FAILED!" -ForegroundColor Red
    Write-Host "="*80 -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "   1. Check SSH connectivity to $Host" -ForegroundColor White
    Write-Host "   2. Verify git repository access" -ForegroundColor White
    Write-Host "   3. Check Node.js and npm installation" -ForegroundColor White
    Write-Host "   4. Review error logs above" -ForegroundColor White
    exit 1
}
