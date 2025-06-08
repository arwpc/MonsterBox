# PowerShell script to set up SSH keys for MonsterBox RPI systems
# This enables passwordless SSH authentication

param(
    [Parameter(Mandatory=$false)]
    [string[]]$Hosts = @("192.168.8.120", "192.168.8.130", "192.168.8.140"),  # Active animatronics (Pumpkinhead offline)
    [Parameter(Mandatory=$false)]
    [string]$User = "remote",
    [Parameter(Mandatory=$false)]
    [string]$Password = "klrklr89!",
    [Parameter(Mandatory=$false)]
    [switch]$TestOnly,
    [Parameter(Mandatory=$false)]
    [switch]$IncludePumpkinhead  # Add Pumpkinhead back when it's online
)

Write-Host "Setting up SSH keys for MonsterBox Animatronics" -ForegroundColor Green
Write-Host "   Orlok (192.168.8.120), Skulltalker (192.168.8.130), Coffin (192.168.8.140)" -ForegroundColor Cyan
Write-Host "   Pumpkinhead (192.168.1.101) - OFFLINE" -ForegroundColor DarkGray

if ($IncludePumpkinhead) {
    $Hosts += "192.168.1.101"
    Write-Host "   Including Pumpkinhead in setup" -ForegroundColor Yellow
}

if ($TestOnly) {
    Write-Host "TEST MODE - No changes will be made" -ForegroundColor Yellow
}

# Check if SSH key exists (prefer ed25519, fallback to rsa)
$sshKeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
if (-not (Test-Path $sshKeyPath)) {
    $sshKeyPath = "$env:USERPROFILE\.ssh\id_rsa.pub"
}
if (-not (Test-Path $sshKeyPath)) {
    Write-Host "❌ SSH public key not found at $sshKeyPath" -ForegroundColor Red
    Write-Host "   Run ssh-keygen first to generate SSH keys" -ForegroundColor Yellow
    exit 1
}

# Read the public key
$publicKey = Get-Content $sshKeyPath -Raw
Write-Host "SSH public key loaded" -ForegroundColor Green

# Function to copy SSH key to RPI
function Copy-SSHKey {
    param(
        [string]$TargetHost,
        [string]$Username,
        [string]$Pass,
        [string]$PubKey
    )

    Write-Host "Setting up SSH key for $TargetHost..." -ForegroundColor Cyan

    try {
        # Create .ssh directory and authorized_keys file on remote host
        $setupCommands = @(
            "mkdir -p ~/.ssh",
            "chmod 700 ~/.ssh",
            "touch ~/.ssh/authorized_keys",
            "chmod 600 ~/.ssh/authorized_keys"
        )

        foreach ($cmd in $setupCommands) {
            & plink -ssh -l $Username -pw $Pass -batch $TargetHost $cmd 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to execute: $cmd"
            }
        }

        # Add public key to authorized_keys (avoid duplicates)
        $addKeyCmd = "grep -qxF `"$PubKey`" ~/.ssh/authorized_keys || echo `"$PubKey`" >> ~/.ssh/authorized_keys"
        & plink -ssh -l $Username -pw $Pass -batch $TargetHost $addKeyCmd 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to add SSH key to authorized_keys"
        }

        # Test SSH key authentication
        $testResult = & ssh -o ConnectTimeout=5 -o BatchMode=yes -o PasswordAuthentication=no "$Username@$TargetHost" "echo SSH_KEY_SUCCESS" 2>$null
        if ($testResult -eq "SSH_KEY_SUCCESS") {
            Write-Host "   ✅ SSH key authentication working for $TargetHost" -ForegroundColor Green
            return $true
        } else {
            Write-Host "   ⚠️ SSH key added but authentication test failed for $TargetHost" -ForegroundColor Yellow
            return $false
        }

    } catch {
        Write-Host "   ❌ Failed to set up SSH key for $TargetHost`: $_" -ForegroundColor Red
        return $false
    }
}

# Set up SSH keys for each host
$successCount = 0
$totalHosts = $Hosts.Count

# Animatronic name mapping for better output
$AnimatronicNames = @{
    "192.168.8.120" = "Orlok"
    "192.168.8.130" = "Skulltalker"
    "192.168.8.140" = "Coffin"
    "192.168.1.101" = "Pumpkinhead"
}

foreach ($targetHost in $Hosts) {
    $animatronicName = $AnimatronicNames[$targetHost]
    if ($animatronicName) {
        Write-Host "Setting up $animatronicName ($targetHost)..." -ForegroundColor Magenta
    }

    if ($TestOnly) {
        Write-Host "   Would install SSH key on $animatronicName" -ForegroundColor Yellow
        continue
    }

    $success = Copy-SSHKey -TargetHost $targetHost -Username $User -Pass $Password -PubKey $publicKey.Trim()
    if ($success) {
        $successCount++
    }
}

Write-Host ""
Write-Host "SSH Key Setup Summary:" -ForegroundColor Cyan
Write-Host "   Total hosts: $totalHosts" -ForegroundColor White
Write-Host "   Successful: $successCount" -ForegroundColor Green
Write-Host "   Failed: $($totalHosts - $successCount)" -ForegroundColor Red

if ($successCount -eq $totalHosts) {
    Write-Host ""
    Write-Host "All SSH keys set up successfully!" -ForegroundColor Green
    Write-Host "   You can now use passwordless SSH to connect to the RPI systems" -ForegroundColor White
    Write-Host "   Test with: ssh orlok" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "Some SSH key setups failed. Check the errors above." -ForegroundColor Yellow
}
