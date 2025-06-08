# Test SSH connectivity to all MonsterBox RPI systems
param(
    [switch]$VerboseOutput
)

Write-Host "Testing SSH Connectivity for MonsterBox Systems" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green

# Define the systems to test
$systems = @(
    @{ Name = "Orlok"; Host = "orlok"; IP = "192.168.8.120" },
    @{ Name = "Skulltalker"; Host = "skulltalker"; IP = "192.168.8.130" },
    @{ Name = "Coffin"; Host = "coffin"; IP = "192.168.8.140" },
    @{ Name = "Pumpkinhead"; Host = "pumpkinhead"; IP = "192.168.1.101" }
)

$results = @()

foreach ($system in $systems) {
    Write-Host "`nTesting $($system.Name) ($($system.IP))..." -ForegroundColor Cyan

    $result = @{
        Name = $system.Name
        Host = $system.Host
        IP = $system.IP
        ConfigTest = $false
        KeyAuth = $false
        BasicSSH = $false
        Error = $null
    }

    try {
        # Test SSH Config Resolution
        Write-Host "   SSH config resolution..." -NoNewline
        $configTest = ssh -G $system.Host | Select-String "hostname $($system.IP)" -Quiet
        if ($configTest) {
            $result.ConfigTest = $true
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " FAILED" -ForegroundColor Red
        }

        # Test SSH Key Authentication
        Write-Host "   SSH key authentication..." -NoNewline
        $keyAuthResult = ssh -o PreferredAuthentications=publickey -o ConnectTimeout=5 $system.Host "echo 'KEY_AUTH_SUCCESS'" 2>$null
        if ($keyAuthResult -eq "KEY_AUTH_SUCCESS") {
            $result.KeyAuth = $true
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " FAILED" -ForegroundColor Red
        }

        # Test Basic SSH Connection
        Write-Host "   Basic SSH connection..." -NoNewline
        $basicResult = ssh -o ConnectTimeout=5 $system.Host "echo 'SSH_SUCCESS'" 2>$null
        if ($basicResult -eq "SSH_SUCCESS") {
            $result.BasicSSH = $true
            Write-Host " OK" -ForegroundColor Green
        } else {
            Write-Host " FAILED" -ForegroundColor Red
        }

    } catch {
        $result.Error = $_.Exception.Message
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }

    $results += $result
}

# Summary Report
Write-Host "`nSSH Connectivity Summary" -ForegroundColor Green
Write-Host "========================" -ForegroundColor Green

$totalSystems = $results.Count
$workingSystems = ($results | Where-Object { $_.BasicSSH }).Count
$keyAuthSystems = ($results | Where-Object { $_.KeyAuth }).Count

Write-Host "Total Systems: $totalSystems" -ForegroundColor Cyan
Write-Host "Working SSH: $workingSystems" -ForegroundColor Cyan
Write-Host "Key Auth Working: $keyAuthSystems" -ForegroundColor Cyan

foreach ($result in $results) {
    $status = if ($result.BasicSSH) { "WORKING" } else { "FAILED" }
    $keyStatus = if ($result.KeyAuth) { "Key Auth" } else { "Password Auth" }

    $color = if ($result.BasicSSH) { "Green" } else { "Red" }
    Write-Host "`n$($result.Name) ($($result.IP)): $status - $keyStatus" -ForegroundColor $color

    if ($result.Error) {
        Write-Host "  Error: $($result.Error)" -ForegroundColor Red
    }
}

# VS Code Integration Test
Write-Host "`nTesting VS Code SSH Integration..." -ForegroundColor Green
$sshConfigPath = "$env:USERPROFILE\.ssh\config"
if (Test-Path $sshConfigPath) {
    Write-Host "SSH config file exists: $sshConfigPath" -ForegroundColor Green

    $configContent = Get-Content $sshConfigPath
    $hostsInConfig = ($configContent | Select-String "^Host " | ForEach-Object { $_.Line.Split()[1] }) -join ", "
    Write-Host "Configured hosts: $hostsInConfig" -ForegroundColor Cyan
} else {
    Write-Host "SSH config file not found" -ForegroundColor Red
}

# Augment Integration Test
Write-Host "`nTesting Augment Integration..." -ForegroundColor Green
$augmentConfigPath = ".augment\config.yaml"
if (Test-Path $augmentConfigPath) {
    Write-Host "Augment config file exists: $augmentConfigPath" -ForegroundColor Green

    $augmentConfig = Get-Content $augmentConfigPath
    $agentCount = ($augmentConfig | Select-String "name:.*agent").Count
    Write-Host "Configured agents: $agentCount" -ForegroundColor Cyan
} else {
    Write-Host "Augment config file not found" -ForegroundColor Red
}

Write-Host "`nRecommendations:" -ForegroundColor Yellow
if ($keyAuthSystems -lt $workingSystems) {
    Write-Host "- Run SSH key setup for systems without key authentication" -ForegroundColor Yellow
}
if ($workingSystems -lt $totalSystems) {
    Write-Host "- Check network connectivity for failed systems" -ForegroundColor Yellow
    Write-Host "- Verify SSH service is running on remote systems" -ForegroundColor Yellow
}
Write-Host "- Use 'ssh <hostname>' to connect to any working system" -ForegroundColor Yellow
Write-Host "- VS Code Remote-SSH should work with configured hosts" -ForegroundColor Yellow

Write-Host "`nSSH connectivity test completed!" -ForegroundColor Green
