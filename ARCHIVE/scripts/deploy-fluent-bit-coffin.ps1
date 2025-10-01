# MonsterBox Fluent Bit Deployment Script for Coffin RPI4b (PowerShell)
# Deploy the same working configuration from Orlok to Coffin

param(
    [string]$RemoteHost = "192.168.8.140",
    [string]$RemoteUser = "remote"
)

# Load environment variables
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

$AnimatronicId = "coffin"
$LogExportDir = "/home/remote/log_export"
$MonsterBoxLogDir = "/home/remote/MonsterBox/log"

Write-Host "MonsterBox Fluent Bit Deployment for $AnimatronicId" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Target: $RemoteUser@$RemoteHost" -ForegroundColor Cyan
Write-Host ""

# Function to run SSH commands with password from environment
function Invoke-SSHCommand {
    param([string]$Command)
    
    Write-Host "🔧 Executing: $Command" -ForegroundColor Yellow
    
    # Get password from environment
    $Password = $env:COFFIN_SSH_PASSWORD
    if (-not $Password) {
        $Password = $env:RPI_SSH_PASSWORD
    }
    
    if (-not $Password) {
        Write-Host "❌ No SSH password found in environment variables" -ForegroundColor Red
        Write-Host "   Set COFFIN_SSH_PASSWORD or RPI_SSH_PASSWORD in .env file" -ForegroundColor Yellow
        exit 1
    }
    
    # Create temporary script for SSH with password
    $TempScript = [System.IO.Path]::GetTempFileName() + ".ps1"
    
    $ScriptContent = @"
`$sshPassword = '$Password'
`$psi = New-Object System.Diagnostics.ProcessStartInfo
`$psi.FileName = "ssh"
`$psi.Arguments = "-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no $RemoteUser@$RemoteHost '$Command'"
`$psi.UseShellExecute = `$false
`$psi.RedirectStandardInput = `$true
`$psi.RedirectStandardOutput = `$true
`$psi.RedirectStandardError = `$true

`$process = [System.Diagnostics.Process]::Start(`$psi)
Start-Sleep -Milliseconds 500
`$process.StandardInput.WriteLine(`$sshPassword)
`$process.StandardInput.Close()

`$output = `$process.StandardOutput.ReadToEnd()
`$errorOutput = `$process.StandardError.ReadToEnd()
`$process.WaitForExit()

if (`$process.ExitCode -eq 0) {
    Write-Output `$output
} else {
    Write-Host `$errorOutput -ForegroundColor Red
    exit `$process.ExitCode
}
"@
    
    Set-Content -Path $TempScript -Value $ScriptContent
    
    try {
        $Result = & powershell -ExecutionPolicy Bypass -File $TempScript
        return $Result
    }
    finally {
        Remove-Item -Path $TempScript -Force -ErrorAction SilentlyContinue
    }
}

# Test connectivity
Write-Host "🔍 Testing connectivity to Coffin..." -ForegroundColor Cyan
if (Test-Connection -ComputerName $RemoteHost -Count 1 -Quiet) {
    Write-Host "✅ Coffin RPI is reachable" -ForegroundColor Green
} else {
    Write-Host "❌ Cannot reach Coffin RPI at $RemoteHost" -ForegroundColor Red
    exit 1
}

# Test SSH connectivity
Write-Host "🔍 Testing SSH connectivity..." -ForegroundColor Cyan
try {
    $TestResult = Invoke-SSHCommand "echo 'SSH connection successful'"
    if ($TestResult -match "SSH connection successful") {
        Write-Host "✅ SSH connection working" -ForegroundColor Green
    } else {
        throw "SSH test failed"
    }
} catch {
    Write-Host "❌ SSH connection failed: $_" -ForegroundColor Red
    exit 1
}

# Check if Fluent Bit is installed
Write-Host "📦 Checking Fluent Bit installation..." -ForegroundColor Cyan
try {
    $FluentBitCheck = Invoke-SSHCommand "which fluent-bit"
    if ($FluentBitCheck) {
        Write-Host "✅ Fluent Bit is already installed" -ForegroundColor Green
    }
} catch {
    Write-Host "📦 Installing Fluent Bit..." -ForegroundColor Yellow
    Invoke-SSHCommand "curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh"
}

# Stop Fluent Bit service if running
Write-Host "🛑 Stopping Fluent Bit service..." -ForegroundColor Cyan
Invoke-SSHCommand "sudo systemctl stop fluent-bit || true"

# Create required directories
Write-Host "📁 Creating required directories..." -ForegroundColor Cyan
Invoke-SSHCommand "sudo mkdir -p $LogExportDir"
Invoke-SSHCommand "sudo mkdir -p $MonsterBoxLogDir"
Invoke-SSHCommand "sudo mkdir -p /home/remote/MonsterBox/scripts/log"
Invoke-SSHCommand "sudo mkdir -p /tmp/flb-storage/"
Invoke-SSHCommand "sudo mkdir -p /etc/fluent-bit/"

# Set correct permissions
Write-Host "🔐 Setting directory permissions..." -ForegroundColor Cyan
Invoke-SSHCommand "sudo chown -R $RemoteUser`:$RemoteUser $LogExportDir"
Invoke-SSHCommand "sudo chown -R $RemoteUser`:$RemoteUser /tmp/flb-storage/"
Invoke-SSHCommand "sudo chmod 755 $LogExportDir"
Invoke-SSHCommand "sudo chmod 755 /tmp/flb-storage/"

# Create Fluent Bit configuration
Write-Host "⚙️  Creating Fluent Bit configuration..." -ForegroundColor Cyan

$FluentBitConfig = @'
# MonsterBox Fluent Bit Configuration for Coffin RPI4b

[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020
    storage.path  /tmp/flb-storage/
    storage.sync  normal
    storage.checksum off
    storage.backlog.mem_limit 5M

[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/*.log
    Path_Key          filename
    Tag               monsterbox.app
    DB                /var/log/flb_monsterbox_app.db
    Refresh_Interval  5
    Read_from_Head    true

[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/scripts/log/*.log
    Path_Key          filename
    Tag               monsterbox.utils
    DB                /var/log/flb_monsterbox_utils.db
    Refresh_Interval  5
    Read_from_Head    true

[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/error*.log
    Path_Key          filename
    Tag               monsterbox.errors
    DB                /var/log/flb_monsterbox_errors.db
    Refresh_Interval  2
    Read_from_Head    true

[INPUT]
    Name              tail
    Path              /var/log/syslog
    Tag               system.syslog
    DB                /var/log/flb_syslog.db
    Refresh_Interval  10
    Read_from_Head    false
    Skip_Long_Lines   On

[INPUT]
    Name              cpu
    Tag               metrics.cpu
    Interval_Sec      30

[INPUT]
    Name              mem
    Tag               metrics.memory
    Interval_Sec      30

[FILTER]
    Name              record_modifier
    Match             monsterbox.*
    Record            hostname coffin
    Record            source_type monsterbox_app

[FILTER]
    Name              record_modifier
    Match             system.*
    Record            hostname coffin
    Record            source_type system

[FILTER]
    Name              record_modifier
    Match             metrics.*
    Record            hostname coffin
    Record            source_type metrics

[OUTPUT]
    Name              file
    Match             monsterbox.app
    Path              /home/remote/log_export/
    File              coffin-monsterbox-app.log

[OUTPUT]
    Name              file
    Match             monsterbox.utils
    Path              /home/remote/log_export/
    File              coffin-monsterbox-utils.log

[OUTPUT]
    Name              file
    Match             monsterbox.errors
    Path              /home/remote/log_export/
    File              coffin-monsterbox-errors.log

[OUTPUT]
    Name              file
    Match             system.syslog
    Path              /home/remote/log_export/
    File              coffin-system-syslog.log

[OUTPUT]
    Name              file
    Match             metrics.*
    Path              /home/remote/log_export/
    File              coffin-metrics.log

[OUTPUT]
    Name              file
    Match             *
    Path              /home/remote/log_export/
    File              coffin-combined.log

[OUTPUT]
    Name              stdout
    Match             *
'@

# Deploy configuration
Write-Host "📋 Deploying configuration..." -ForegroundColor Cyan
$TempConfigFile = [System.IO.Path]::GetTempFileName()
Set-Content -Path $TempConfigFile -Value $FluentBitConfig

# Copy config file (simplified approach)
Invoke-SSHCommand "cat > /tmp/fluent-bit.conf << 'EOF'`n$FluentBitConfig`nEOF"
Invoke-SSHCommand "sudo mv /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf"

# Create parsers.conf
$ParsersConfig = @'
[PARSER]
    Name        json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L
    Time_Keep   On

[PARSER]
    Name        syslog
    Format      regex
    Regex       ^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$
    Time_Key    time
    Time_Format %b %d %H:%M:%S
'@

Invoke-SSHCommand "cat > /tmp/parsers.conf << 'EOF'`n$ParsersConfig`nEOF"
Invoke-SSHCommand "sudo mv /tmp/parsers.conf /etc/fluent-bit/parsers.conf"

# Create test log
Write-Host "📝 Creating test log entries..." -ForegroundColor Cyan
Invoke-SSHCommand "mkdir -p $MonsterBoxLogDir"
Invoke-SSHCommand 'echo "{\"timestamp\":\"$(date -Iseconds)\",\"level\":\"info\",\"message\":\"Coffin MonsterBox startup test\",\"component\":\"app\",\"animatronic\":\"coffin\"}" > /home/remote/MonsterBox/log/test.log'

# Test configuration
Write-Host "🧪 Testing Fluent Bit configuration..." -ForegroundColor Cyan
try {
    Invoke-SSHCommand "sudo /opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf --dry-run"
    Write-Host "✅ Configuration test passed" -ForegroundColor Green
} catch {
    Write-Host "❌ Configuration test failed" -ForegroundColor Red
    exit 1
}

# Start Fluent Bit service
Write-Host "🚀 Starting Fluent Bit service..." -ForegroundColor Cyan
Invoke-SSHCommand "sudo systemctl enable fluent-bit"
Invoke-SSHCommand "sudo systemctl start fluent-bit"

Start-Sleep -Seconds 5

# Check service status
Write-Host "🔍 Checking Fluent Bit status..." -ForegroundColor Cyan
try {
    $ServiceStatus = Invoke-SSHCommand "sudo systemctl is-active fluent-bit"
    if ($ServiceStatus -match "active") {
        Write-Host "✅ Fluent Bit service is running" -ForegroundColor Green
    } else {
        throw "Service not active: $ServiceStatus"
    }
} catch {
    Write-Host "❌ Fluent Bit service failed to start" -ForegroundColor Red
    Write-Host "📋 Checking logs..." -ForegroundColor Yellow
    Invoke-SSHCommand "sudo journalctl -u fluent-bit -n 10 --no-pager"
    exit 1
}

# Test HTTP interface
Write-Host "🌐 Testing HTTP monitoring interface..." -ForegroundColor Cyan
Start-Sleep -Seconds 2
try {
    $HttpTest = Invoke-SSHCommand "curl -s http://localhost:2020/"
    if ($HttpTest -match "fluent-bit") {
        Write-Host "✅ HTTP interface is responding" -ForegroundColor Green
    } else {
        Write-Host "⚠️  HTTP interface test failed (may not be critical)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  HTTP interface test failed (may not be critical)" -ForegroundColor Yellow
}

# Check log generation
Write-Host "📊 Checking log generation..." -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
    $LogFiles = Invoke-SSHCommand "ls -la $LogExportDir/coffin-*.log"
    if ($LogFiles) {
        Write-Host "✅ Log files are being generated" -ForegroundColor Green
        Invoke-SSHCommand "find $LogExportDir -name 'coffin-*.log' -exec wc -l {} \;"
    }
} catch {
    Write-Host "⚠️  No log files found yet (may need more time)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Fluent Bit deployment to Coffin completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Status Summary:" -ForegroundColor Cyan
$Status = Invoke-SSHCommand "sudo systemctl is-active fluent-bit"
Write-Host "   • Service: $Status" -ForegroundColor White
Write-Host "   • HTTP Interface: http://$RemoteHost`:2020/" -ForegroundColor White
Write-Host "   • Log Export Directory: $LogExportDir/" -ForegroundColor White
Write-Host ""
Write-Host "🔧 Useful commands:" -ForegroundColor Cyan
Write-Host "   • Check status: ssh $RemoteUser@$RemoteHost 'sudo systemctl status fluent-bit'" -ForegroundColor White
Write-Host "   • View logs: ssh $RemoteUser@$RemoteHost 'sudo journalctl -u fluent-bit -f'" -ForegroundColor White
Write-Host "   • Test HTTP: curl http://$RemoteHost`:2020/" -ForegroundColor White
Write-Host "   • Check exports: ssh $RemoteUser@$RemoteHost 'ls -la $LogExportDir/'" -ForegroundColor White
Write-Host ""
Write-Host "✅ Coffin is now ready for MCP log collection!" -ForegroundColor Green
