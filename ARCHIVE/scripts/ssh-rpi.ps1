# PowerShell script to execute commands on MonsterBox RPI systems using SSH
# Uses SSH config file for automatic authentication
param(
    [Parameter(Mandatory=$true)]
    [string]$Command,
    [Parameter(Mandatory=$false)]
    [string]$TargetHost = "orlok",  # Default to Orlok, can also use: coffin, pumpkinhead, or IP addresses
    [Parameter(Mandatory=$false)]
    [switch]$ShowOutput = $true
)

# Function to get character info from host
function Get-CharacterInfo {
    param([string]$TargetHost)
    
    $hostMap = @{
        "orlok" = @{ Name = "Orlok"; IP = "192.168.8.120" }
        "coffin" = @{ Name = "Coffin Breaker"; IP = "192.168.8.140" }
        "pumpkinhead" = @{ Name = "Pumpkinhead"; IP = "192.168.1.101" }
        "192.168.8.120" = @{ Name = "Orlok"; IP = "192.168.8.120" }
        "192.168.8.140" = @{ Name = "Coffin Breaker"; IP = "192.168.8.140" }
        "192.168.1.101" = @{ Name = "Pumpkinhead"; IP = "192.168.1.101" }
    }
    
    if ($hostMap.ContainsKey($TargetHost)) {
        return $hostMap[$TargetHost]
    } else {
        return @{ Name = "Unknown"; IP = $TargetHost }
    }
}

# Get character information
$charInfo = Get-CharacterInfo -TargetHost $TargetHost

if ($ShowOutput) {
    Write-Host "🎃 Executing command on $($charInfo.Name) ($($charInfo.IP)): $Command" -ForegroundColor Green
}

# Test SSH connectivity first
try {
    $testResult = ssh -o ConnectTimeout=5 -o BatchMode=yes $TargetHost "echo 'SSH_TEST_SUCCESS'" 2>$null
    if ($testResult -ne "SSH_TEST_SUCCESS") {
        throw "SSH connectivity test failed"
    }
} catch {
    Write-Host "❌ SSH connection failed to $($charInfo.Name) ($($charInfo.IP))" -ForegroundColor Red
    Write-Host "   Make sure the RPI is powered on and network accessible" -ForegroundColor Yellow
    Write-Host "   You can also connect manually using: ssh $TargetHost" -ForegroundColor Yellow
    exit 1
}

# Execute the command
try {
    $result = ssh $TargetHost $Command
    $exitCode = $LASTEXITCODE
    
    if ($ShowOutput -and $result) {
        Write-Output $result
    }
    
    if ($exitCode -ne 0) {
        Write-Host "❌ Command failed with exit code: $exitCode" -ForegroundColor Red
        exit $exitCode
    }
    
    if ($ShowOutput) {
        Write-Host "✅ Command executed successfully on $($charInfo.Name)" -ForegroundColor Green
    }
    
    return $result
} catch {
    Write-Host "❌ Error executing command: $_" -ForegroundColor Red
    exit 1
}
