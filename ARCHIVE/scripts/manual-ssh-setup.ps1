# Manual SSH Key Setup for MonsterBox Animatronics
# Run this step-by-step to set up passwordless SSH

Write-Host "MonsterBox SSH Key Manual Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check for SSH key
$KeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
if (-not (Test-Path $KeyPath)) {
    $KeyPath = "$env:USERPROFILE\.ssh\id_rsa.pub"
}

if (-not (Test-Path $KeyPath)) {
    Write-Host "ERROR: No SSH key found!" -ForegroundColor Red
    Write-Host "Generate one with: ssh-keygen -t ed25519 -C 'monsterbox@yourname'" -ForegroundColor Yellow
    exit 1
}

$PublicKey = Get-Content $KeyPath -Raw
$PublicKey = $PublicKey.Trim()

Write-Host "Found SSH key: $($PublicKey.Substring(0, 50))..." -ForegroundColor Green

# Active animatronics (Pumpkinhead is offline)
$Animatronics = @(
    @{ Name = "Orlok"; Host = "192.168.8.120" },
    @{ Name = "Skulltalker"; Host = "192.168.8.130" },
    @{ Name = "Coffin"; Host = "192.168.8.140" }
)

Write-Host "`nSetting up 3 active animatronics..." -ForegroundColor Magenta
Write-Host "Pumpkinhead (192.168.1.101) is offline - skipping" -ForegroundColor DarkGray

foreach ($Animatronic in $Animatronics) {
    $Name = $Animatronic.Name
    $HostIP = $Animatronic.Host

    Write-Host "`n$Name ($HostIP)" -ForegroundColor Yellow
    Write-Host "   Copy and run these commands manually:" -ForegroundColor Gray

    Write-Host "   [1] Connect to ${Name}:" -ForegroundColor Cyan
    Write-Host "      ssh remote@$HostIP" -ForegroundColor White

    Write-Host "   [2] Create SSH directory:" -ForegroundColor Cyan
    Write-Host "      mkdir -p ~/.ssh && chmod 700 ~/.ssh" -ForegroundColor White

    Write-Host "   [3] Add your public key:" -ForegroundColor Cyan
    Write-Host "      echo '$PublicKey' >> ~/.ssh/authorized_keys" -ForegroundColor White

    Write-Host "   [4] Set permissions:" -ForegroundColor Cyan
    Write-Host "      chmod 600 ~/.ssh/authorized_keys" -ForegroundColor White

    Write-Host "   [5] Exit and test:" -ForegroundColor Cyan
    Write-Host "      exit" -ForegroundColor White
    Write-Host "      ssh $Name" -ForegroundColor White
    
    Write-Host "   >> Press Enter when done with ${Name}..." -ForegroundColor Yellow
    Read-Host
}

Write-Host "`nManual setup complete!" -ForegroundColor Green
Write-Host "Test your connections:" -ForegroundColor Cyan
Write-Host "   ssh orlok" -ForegroundColor White
Write-Host "   ssh skulltalker" -ForegroundColor White
Write-Host "   ssh coffin" -ForegroundColor White

Write-Host "`nWhen Pumpkinhead comes online, run:" -ForegroundColor Yellow
Write-Host "   .\scripts\setup-ssh-keys.ps1 -Hosts @('192.168.1.101') -IncludePumpkinhead" -ForegroundColor White
