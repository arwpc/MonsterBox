# MonsterBox Log File Collection Script
# Collects actual log files from Fluent Bit systems using credentials from .env

param(
    [string[]]$Systems = @("orlok", "coffin"),
    [string]$LocalLogDir = "log\collected"
)

# Load environment variables from .env file
if (Test-Path ".env") {
    Write-Host "Loading environment variables from .env..." -ForegroundColor Cyan
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            if ($name -like "*PASSWORD*") {
                Write-Host "  Loaded: $name = [HIDDEN]" -ForegroundColor Green
            } else {
                Write-Host "  Loaded: $name = $value" -ForegroundColor Green
            }
        }
    }
    Write-Host ""
} else {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    exit 1
}

# System configuration
$SystemConfig = @{
    "orlok" = @{
        Name = "Orlok RPI4b"
        Host = "192.168.8.120"
        User = $env:ORLOK_SSH_USER
        Password = $env:ORLOK_SSH_PASSWORD
    }
    "coffin" = @{
        Name = "Coffin RPI4b" 
        Host = "192.168.8.140"
        User = $env:COFFIN_SSH_USER
        Password = $env:COFFIN_SSH_PASSWORD
    }
}

# Fallback credentials
$FallbackUser = $env:RPI_SSH_USER
$FallbackPassword = $env:RPI_SSH_PASSWORD

Write-Host "🎃 MonsterBox Log File Collection" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""

# Create local directory
Write-Host "📁 Creating local log directory: $LocalLogDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $LocalLogDir -Force | Out-Null

foreach ($SystemId in $Systems) {
    $Config = $SystemConfig[$SystemId]
    if (-not $Config) {
        Write-Host "❌ Unknown system: $SystemId" -ForegroundColor Red
        continue
    }
    
    Write-Host "🤖 Collecting logs from $($Config.Name) ($($Config.Host))..." -ForegroundColor Yellow
    
    # Use system-specific credentials or fallback
    $User = if ($Config.User) { $Config.User } else { $FallbackUser }
    $Password = if ($Config.Password) { $Config.Password } else { $FallbackPassword }
    
    if (-not $User -or -not $Password) {
        Write-Host "   ❌ No credentials found for $SystemId" -ForegroundColor Red
        Write-Host "      Check .env file for ${SystemId.ToUpper()}_SSH_USER and ${SystemId.ToUpper()}_SSH_PASSWORD" -ForegroundColor Yellow
        continue
    }
    
    # Test connectivity
    Write-Host "   🔍 Testing connectivity..." -ForegroundColor Cyan
    if (-not (Test-Connection -ComputerName $Config.Host -Count 1 -Quiet)) {
        Write-Host "   ❌ Cannot reach $($Config.Host)" -ForegroundColor Red
        continue
    }
    Write-Host "   ✅ Host is reachable" -ForegroundColor Green
    
    # Create system-specific directory
    $SystemLogDir = Join-Path $LocalLogDir $SystemId
    New-Item -ItemType Directory -Path $SystemLogDir -Force | Out-Null
    
    # Create temporary expect script for automated password entry
    $TempScript = [System.IO.Path]::GetTempFileName() + ".ps1"
    
    $ScriptContent = @"
# Automated SCP script for $SystemId
`$SecurePassword = ConvertTo-SecureString "$Password" -AsPlainText -Force
`$Credential = New-Object System.Management.Automation.PSCredential("$User", `$SecurePassword)

# Try using pscp (PuTTY's SCP) with password
try {
    # Method 1: Try pscp if available
    if (Get-Command pscp -ErrorAction SilentlyContinue) {
        Write-Host "Using pscp for file transfer..."
        `$env:PUTTY_PASSWORD = "$Password"
        & pscp -batch -pw "$Password" -r "$User@$($Config.Host):/home/remote/log_export/$SystemId-*.log" "$SystemLogDir\"
    } else {
        # Method 2: Use scp with expect-like behavior
        Write-Host "Using scp for file transfer..."
        
        `$psi = New-Object System.Diagnostics.ProcessStartInfo
        `$psi.FileName = "scp"
        `$psi.Arguments = "-o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no -r `"$User@$($Config.Host):/home/remote/log_export/$SystemId-*.log`" `"$SystemLogDir\`""
        `$psi.UseShellExecute = `$false
        `$psi.RedirectStandardInput = `$true
        `$psi.RedirectStandardOutput = `$true
        `$psi.RedirectStandardError = `$true
        
        `$process = [System.Diagnostics.Process]::Start(`$psi)
        
        # Send password when prompted
        Start-Sleep -Milliseconds 1000
        `$process.StandardInput.WriteLine("$Password")
        `$process.StandardInput.Close()
        
        # Wait for completion
        `$output = `$process.StandardOutput.ReadToEnd()
        `$errorOutput = `$process.StandardError.ReadToEnd()
        `$process.WaitForExit()
        
        if (`$process.ExitCode -eq 0) {
            Write-Host "SCP completed successfully"
            Write-Output `$output
        } else {
            Write-Host "SCP failed with exit code `$(`$process.ExitCode)" -ForegroundColor Red
            Write-Host `$errorOutput -ForegroundColor Red
            throw "SCP failed"
        }
    }
} catch {
    Write-Host "File transfer failed: `$_" -ForegroundColor Red
    throw `$_
}
"@
    
    try {
        Set-Content -Path $TempScript -Value $ScriptContent
        
        Write-Host "   📥 Collecting log files..." -ForegroundColor Cyan
        & powershell -ExecutionPolicy Bypass -File $TempScript
        
        # Check what was collected
        $CollectedFiles = Get-ChildItem -Path $SystemLogDir -Filter "*.log" -ErrorAction SilentlyContinue
        if ($CollectedFiles) {
            Write-Host "   ✅ Collected $($CollectedFiles.Count) log files:" -ForegroundColor Green
            foreach ($File in $CollectedFiles) {
                $SizeKB = [math]::Round($File.Length / 1024, 1)
                Write-Host "      • $($File.Name): ${SizeKB}KB" -ForegroundColor White
            }
        } else {
            Write-Host "   ⚠️  No log files collected (check if files exist on remote system)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "   ❌ Failed to collect logs: $_" -ForegroundColor Red
    } finally {
        # Clean up temporary script
        if (Test-Path $TempScript) {
            Remove-Item $TempScript -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-Host ""
}

Write-Host "🎉 Log collection completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Collected logs are in: $LocalLogDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔧 Next steps:" -ForegroundColor Yellow
Write-Host "   • Review collected logs for debugging information" -ForegroundColor White
Write-Host "   • Analyze error patterns and system behavior" -ForegroundColor White
Write-Host "   • Set up automated collection schedule if needed" -ForegroundColor White
