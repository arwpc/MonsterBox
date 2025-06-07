# Setup SSH Key Authentication for Skulltalker
# This script copies the SSH public key to skulltalker for passwordless authentication

param(
    [string]$Host = "192.168.8.130",
    [string]$User = "remote",
    [string]$Password = "klrklr89!"
)

Write-Host "🔑 Setting up SSH key authentication for Skulltalker" -ForegroundColor Green
Write-Host "Target: $User@$Host" -ForegroundColor Cyan

# Read the public key
$publicKeyPath = "$env:USERPROFILE\.ssh\id_rsa.pub"

if (-not (Test-Path $publicKeyPath)) {
    Write-Host "❌ SSH public key not found at $publicKeyPath" -ForegroundColor Red
    Write-Host "Please generate SSH keys first with: ssh-keygen -t rsa -b 4096" -ForegroundColor Yellow
    exit 1
}

$publicKey = Get-Content $publicKeyPath -Raw
$publicKey = $publicKey.Trim()

Write-Host "📋 Public key loaded: $($publicKey.Substring(0, 50))..." -ForegroundColor Cyan

# Create a temporary script to add the key
$tempScript = @"
#!/bin/bash
# Create .ssh directory if it doesn't exist
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Add the public key to authorized_keys
echo '$publicKey' >> ~/.ssh/authorized_keys

# Set proper permissions
chmod 600 ~/.ssh/authorized_keys

# Remove duplicates
sort ~/.ssh/authorized_keys | uniq > ~/.ssh/authorized_keys.tmp
mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys

echo "SSH key added successfully"
"@

# Save the script to a temporary file
$tempScriptPath = Join-Path $env:TEMP "setup_ssh_key.sh"
$tempScript | Out-File -FilePath $tempScriptPath -Encoding UTF8

Write-Host "📝 Created temporary setup script" -ForegroundColor Cyan

try {
    # Copy the script to skulltalker and execute it
    Write-Host "📤 Copying setup script to skulltalker..." -ForegroundColor Cyan
    
    # Use scp to copy the script (this will prompt for password)
    $scpCommand = "scp -o StrictHostKeyChecking=no `"$tempScriptPath`" $User@$Host`:~/setup_ssh_key.sh"
    Write-Host "Executing: $scpCommand" -ForegroundColor Yellow
    Write-Host "⚠️ You will be prompted for the password: $Password" -ForegroundColor Yellow
    
    $scpResult = Invoke-Expression $scpCommand
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to copy script to skulltalker"
    }
    
    Write-Host "✅ Script copied successfully" -ForegroundColor Green
    
    # Execute the script on skulltalker
    Write-Host "🔧 Executing setup script on skulltalker..." -ForegroundColor Cyan
    $sshCommand = "ssh -o StrictHostKeyChecking=no $User@$Host `"chmod +x ~/setup_ssh_key.sh && ~/setup_ssh_key.sh && rm ~/setup_ssh_key.sh`""
    Write-Host "Executing: $sshCommand" -ForegroundColor Yellow
    Write-Host "⚠️ You will be prompted for the password again: $Password" -ForegroundColor Yellow
    
    $sshResult = Invoke-Expression $sshCommand
    
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute setup script on skulltalker"
    }
    
    Write-Host "✅ SSH key setup completed" -ForegroundColor Green
    
    # Test passwordless connection
    Write-Host "🧪 Testing passwordless SSH connection..." -ForegroundColor Cyan
    $testCommand = "ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 $User@$Host `"echo 'Passwordless SSH working!'`""
    
    $testResult = Invoke-Expression $testCommand
    
    if ($LASTEXITCODE -eq 0 -and $testResult -match "Passwordless SSH working") {
        Write-Host "🎉 SUCCESS! Passwordless SSH authentication is now working!" -ForegroundColor Green
        Write-Host "✅ You can now run deployment scripts without password prompts" -ForegroundColor Green
    } else {
        Write-Host "⚠️ SSH key setup completed but test failed. You may need to try again." -ForegroundColor Yellow
        Write-Host "Test result: $testResult" -ForegroundColor Yellow
    }
    
}
catch {
    Write-Host "❌ SSH key setup failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "🔧 Manual setup instructions:" -ForegroundColor Yellow
    Write-Host "1. SSH into skulltalker: ssh $User@$Host" -ForegroundColor White
    Write-Host "2. Create .ssh directory: mkdir -p ~/.ssh; chmod 700 ~/.ssh" -ForegroundColor White
    Write-Host "3. Add this key to ~/.ssh/authorized_keys:" -ForegroundColor White
    Write-Host "   $publicKey" -ForegroundColor Gray
    Write-Host "4. Set permissions: chmod 600 ~/.ssh/authorized_keys" -ForegroundColor White
}
finally {
    # Clean up temporary file
    if (Test-Path $tempScriptPath) {
        Remove-Item $tempScriptPath -Force
        Write-Host "🧹 Cleaned up temporary files" -ForegroundColor Cyan
    }
}

Write-Host "`n📝 Next steps after SSH key setup:" -ForegroundColor Cyan
Write-Host "1. Run the deployment script: node scripts/deploy_to_skulltalker.js" -ForegroundColor White
Write-Host "2. Or use PowerShell: .\deploy-jaw-animation.ps1" -ForegroundColor White
