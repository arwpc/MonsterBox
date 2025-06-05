# Deploy MonsterBox to Orlok RPI
param(
    [string]$TargetHost = "192.168.8.120",
    [string]$SSHUser = "remote",
    [string]$SSHPassword = "klrklr89!"
)

Write-Host "🎃 Deploying MonsterBox to Orlok ($TargetHost)..." -ForegroundColor Green

# Create SSH command with password
$sshCommand = "cd /home/remote/MonsterBox && echo 'Current directory:' && pwd && echo 'Git status:' && git status && echo 'Pulling latest changes:' && git pull && echo 'Starting MonsterBox:' && npm start"

# Use plink (PuTTY) if available, otherwise try ssh with expect-like behavior
try {
    # Try using plink first (more reliable on Windows)
    $plinkPath = Get-Command plink -ErrorAction SilentlyContinue
    if ($plinkPath) {
        Write-Host "Using plink for SSH connection..." -ForegroundColor Yellow
        & plink -ssh -l $SSHUser -pw $SSHPassword -batch $TargetHost $sshCommand
    } else {
        Write-Host "plink not found, trying alternative method..." -ForegroundColor Yellow
        
        # Create a temporary expect-like script
        $expectScript = @"
spawn ssh -o StrictHostKeyChecking=no $SSHUser@$TargetHost "$sshCommand"
expect "password:"
send "$SSHPassword\r"
interact
"@
        
        # Save and execute expect script if expect is available
        $expectScript | Out-File -FilePath "temp_ssh.exp" -Encoding ASCII
        
        # Try to run with expect
        try {
            & expect temp_ssh.exp
        } catch {
            Write-Host "Expect not available. Please manually SSH to Orlok and run:" -ForegroundColor Red
            Write-Host "ssh remote@192.168.8.120" -ForegroundColor Cyan
            Write-Host "Password: klrklr89!" -ForegroundColor Cyan
            Write-Host "Then run: cd /home/remote/MonsterBox && git pull && npm start" -ForegroundColor Cyan
        } finally {
            # Clean up temp file
            if (Test-Path "temp_ssh.exp") {
                Remove-Item "temp_ssh.exp" -Force
            }
        }
    }
} catch {
    Write-Host "Error during SSH deployment: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Please manually SSH to Orlok and run the deployment commands." -ForegroundColor Yellow
}
