# PowerShell script to fix SSH configuration issues for MonsterBox
# This script addresses the UTF-8 BOM issue and creates proper SSH config

Write-Host "🔧 Fixing SSH Configuration for MonsterBox" -ForegroundColor Green

# Define SSH directory and config file paths
$sshDir = "$env:USERPROFILE\.ssh"
$configFile = "$sshDir\config"

# Create SSH directory if it doesn't exist
if (-not (Test-Path $sshDir)) {
    Write-Host "📁 Creating SSH directory: $sshDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}

# Remove existing config file if it has issues
if (Test-Path $configFile) {
    Write-Host "🗑️ Removing existing SSH config file with issues" -ForegroundColor Yellow
    Remove-Item $configFile -Force
}

# Create new SSH config file without UTF-8 BOM
$sshConfig = @"
# MonsterBox SSH Configuration
# This file configures SSH access to animatronic RPI systems

# Orlok Animatronic (Primary Development System)
Host orlok
    HostName 192.168.8.120
    User remote
    Port 22
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ConnectTimeout 10
    ServerAliveInterval 60
    ServerAliveCountMax 3
    PasswordAuthentication yes
    PubkeyAuthentication yes
    PreferredAuthentications publickey,password

# Coffin Animatronic (Secondary System)
Host coffin
    HostName 192.168.8.140
    User remote
    Port 22
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ConnectTimeout 10
    ServerAliveInterval 60
    ServerAliveCountMax 3
    PasswordAuthentication yes
    PubkeyAuthentication yes
    PreferredAuthentications publickey,password

# Pumpkinhead Animatronic (Currently Offline)
Host pumpkinhead
    HostName 192.168.1.101
    User remote
    Port 22
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ConnectTimeout 10
    ServerAliveInterval 60
    ServerAliveCountMax 3
    PasswordAuthentication yes
    PubkeyAuthentication yes
    PreferredAuthentications publickey,password

# Generic RPI host for development (VS Code Remote SSH)
Host 190fb5aa-f1b9-50b1-9bd2-1d3da626e3b6
    HostName 192.168.8.120
    User remote
    Port 22
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
    ConnectTimeout 10
    ServerAliveInterval 60
    ServerAliveCountMax 3
    PasswordAuthentication yes
    PubkeyAuthentication yes
    PreferredAuthentications publickey,password

# Default settings for all hosts
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_rsa
"@

# Write config file using ASCII encoding to avoid UTF-8 BOM issues
Write-Host "📝 Creating new SSH config file" -ForegroundColor Yellow
[System.IO.File]::WriteAllText($configFile, $sshConfig, [System.Text.Encoding]::ASCII)

# Set proper permissions on SSH directory and config file
Write-Host "🔒 Setting SSH file permissions" -ForegroundColor Yellow
icacls $sshDir /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F" /T | Out-Null
icacls $configFile /inheritance:r /grant:r "$env:USERNAME:F" | Out-Null

# Generate SSH key if it doesn't exist
$sshKeyPath = "$sshDir\id_rsa"
if (-not (Test-Path $sshKeyPath)) {
    Write-Host "🔑 Generating SSH key pair" -ForegroundColor Yellow
    ssh-keygen -t rsa -b 4096 -f $sshKeyPath -N '""' -C "monsterbox@$(hostname)"
}

Write-Host "✅ SSH configuration fixed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Test SSH connectivity: npm run test:animatronic-ssh" -ForegroundColor White
Write-Host "2. Copy SSH keys to animatronics (if needed):" -ForegroundColor White
Write-Host "   ssh-copy-id remote@192.168.8.120  # Orlok" -ForegroundColor Gray
Write-Host "   ssh-copy-id remote@192.168.8.140  # Coffin" -ForegroundColor Gray
Write-Host "3. Try VS Code Remote SSH connection again" -ForegroundColor White
