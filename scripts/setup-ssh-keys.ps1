# MonsterBox SSH Key Setup Script for Windows
# This script sets up SSH keys for all your animatronic RPIs

Write-Host "🎃 MonsterBox SSH Key Setup" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green
Write-Host ""

# Check if SSH key exists
$sshKeyPath = "$env:USERPROFILE\.ssh\id_rsa"
if (-not (Test-Path $sshKeyPath)) {
    Write-Host "🔑 Generating SSH key..." -ForegroundColor Yellow
    ssh-keygen -t rsa -b 4096 -C "monsterbox@$(hostname)" -f $sshKeyPath -N '""'
    Write-Host "✅ SSH key generated" -ForegroundColor Green
} else {
    Write-Host "✅ SSH key already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Default Animatronic IPs:" -ForegroundColor Cyan
Write-Host "   Orlok:       192.168.8.120" -ForegroundColor White
Write-Host "   Pumpkinhead: 192.168.1.101" -ForegroundColor White  
Write-Host "   Coffin:      192.168.8.149" -ForegroundColor White
Write-Host ""

# Prompt for RPI IPs
$animatronics = @()

Write-Host "🔧 Enter your animatronic RPI IP addresses (press Enter to skip):" -ForegroundColor Yellow
Write-Host ""

$orlokIP = Read-Host "Orlok RPI IP (default: 192.168.8.120)"
if ($orlokIP -eq "") { $orlokIP = "192.168.8.120" }
if ($orlokIP -ne "skip") {
    $animatronics += @{ Name = "Orlok"; IP = $orlokIP; User = "remote" }
}

$pumpkinheadIP = Read-Host "Pumpkinhead RPI IP (default: 192.168.1.101)"
if ($pumpkinheadIP -eq "") { $pumpkinheadIP = "192.168.1.101" }
if ($pumpkinheadIP -ne "skip") {
    $animatronics += @{ Name = "Pumpkinhead"; IP = $pumpkinheadIP; User = "remote" }
}

$coffinIP = Read-Host "Coffin RPI IP (default: 192.168.8.149)"
if ($coffinIP -eq "") { $coffinIP = "192.168.8.149" }
if ($coffinIP -ne "skip") {
    $animatronics += @{ Name = "Coffin"; IP = $coffinIP; User = "remote" }
}

# Additional animatronics
do {
    $additionalName = Read-Host "Additional animatronic name (or press Enter to continue)"
    if ($additionalName -ne "") {
        $additionalIP = Read-Host "IP address for $additionalName"
        $additionalUser = Read-Host "Username for $additionalName (default: remote)"
        if ($additionalUser -eq "") { $additionalUser = "remote" }
        $animatronics += @{ Name = $additionalName; IP = $additionalIP; User = $additionalUser }
    }
} while ($additionalName -ne "")

Write-Host ""
Write-Host "🚀 Setting up SSH keys for animatronics..." -ForegroundColor Green
Write-Host ""

foreach ($animatronic in $animatronics) {
    Write-Host "🔧 Setting up $($animatronic.Name) ($($animatronic.IP))..." -ForegroundColor Yellow
    
    # Test if RPI is reachable
    $pingResult = Test-Connection -ComputerName $animatronic.IP -Count 1 -Quiet
    if (-not $pingResult) {
        Write-Host "   ❌ $($animatronic.Name) is not reachable at $($animatronic.IP)" -ForegroundColor Red
        continue
    }
    
    Write-Host "   ✅ $($animatronic.Name) is reachable" -ForegroundColor Green
    
    # Copy SSH key
    try {
        Write-Host "   🔑 Copying SSH key..." -ForegroundColor Yellow
        ssh-copy-id "$($animatronic.User)@$($animatronic.IP)"
        
        # Test SSH connection
        Write-Host "   🧪 Testing SSH connection..." -ForegroundColor Yellow
        $sshTest = ssh -o ConnectTimeout=10 -o BatchMode=yes "$($animatronic.User)@$($animatronic.IP)" "echo 'SSH test successful'"
        
        if ($sshTest -eq "SSH test successful") {
            Write-Host "   ✅ SSH connection successful" -ForegroundColor Green
            
            # Setup sudo access for journalctl
            Write-Host "   🔧 Setting up log access..." -ForegroundColor Yellow
            ssh "$($animatronic.User)@$($animatronic.IP)" "echo '$($animatronic.User) ALL=(ALL) NOPASSWD: /bin/journalctl' | sudo tee -a /etc/sudoers.d/monsterbox-logs"
            
            Write-Host "   ✅ $($animatronic.Name) setup complete!" -ForegroundColor Green
        } else {
            Write-Host "   ❌ SSH test failed for $($animatronic.Name)" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ❌ Failed to setup $($animatronic.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "🎃 SSH Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "   npm run animatronic:manage    # Manage all animatronics" -ForegroundColor White
Write-Host "   npm run animatronic:view      # View animatronic status" -ForegroundColor White
Write-Host "   npm run collect:rpi-logs      # Collect logs from all RPIs" -ForegroundColor White
Write-Host "   npm run test:mcp              # Test complete MCP setup" -ForegroundColor White
Write-Host ""

# Create animatronic configuration
Write-Host "📝 Creating animatronic configuration..." -ForegroundColor Yellow

$config = @{
    animatronics = @{}
    settings = @{
        default_user = "remote"
        ssh_key_path = "~/.ssh/id_rsa"
        collection_interval = 300
        log_retention_days = 30
    }
}

foreach ($animatronic in $animatronics) {
    $id = $animatronic.Name.ToLower()
    $config.animatronics[$id] = @{
        name = $animatronic.Name
        character = $animatronic.Name
        host = $animatronic.IP
        user = $animatronic.User
        description = "$($animatronic.Name) animatronic controller"
        services = @("monsterbox", "ssh", "gpio-control")
        log_types = @("system", "auth", "kernel", "daemon")
        parts = @()
        status = "configured"
        created_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }
}

# Save configuration
$configDir = "config"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
}

$configPath = "$configDir\animatronics.json"
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath

Write-Host "✅ Configuration saved to $configPath" -ForegroundColor Green
Write-Host ""
Write-Host "🎃 Your MonsterBox animatronics are ready for Halloween! 👻" -ForegroundColor Green
