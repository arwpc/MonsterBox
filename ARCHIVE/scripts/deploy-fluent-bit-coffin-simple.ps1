# Simple Fluent Bit Deployment for Coffin RPI4b
# Uses Node.js SSH credentials module for authentication

param(
    [string]$RemoteHost = "192.168.8.140"
)

Write-Host "MonsterBox Fluent Bit Deployment for Coffin" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "Target: $RemoteHost" -ForegroundColor Cyan
Write-Host ""

# Test connectivity first
Write-Host "Testing connectivity to Coffin..." -ForegroundColor Cyan
if (Test-Connection -ComputerName $RemoteHost -Count 1 -Quiet) {
    Write-Host "Coffin RPI is reachable" -ForegroundColor Green
} else {
    Write-Host "Cannot reach Coffin RPI at $RemoteHost" -ForegroundColor Red
    exit 1
}

# Use Node.js script to deploy
Write-Host "Running Node.js deployment script..." -ForegroundColor Cyan

$DeployScript = @'
const sshCredentials = require('./scripts/ssh-credentials');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

async function deployCoffin() {
    const animatronicId = 'coffin';
    const host = '192.168.8.140';
    
    console.log('Deploying Fluent Bit to Coffin...');
    
    // Test SSH connection
    try {
        const testCommand = sshCredentials.buildSSHCommand(animatronicId, host, 'echo "SSH test successful"');
        const result = await execAsync(testCommand);
        console.log('SSH connection successful');
    } catch (error) {
        console.error('SSH connection failed:', error.message);
        process.exit(1);
    }
    
    // Stop existing Fluent Bit
    try {
        const stopCommand = sshCredentials.buildSSHCommand(animatronicId, host, 'sudo systemctl stop fluent-bit || true');
        await execAsync(stopCommand);
        console.log('Stopped existing Fluent Bit service');
    } catch (error) {
        console.log('Note: Could not stop Fluent Bit (may not be installed)');
    }
    
    // Create directories
    const commands = [
        'sudo mkdir -p /home/remote/log_export',
        'sudo mkdir -p /home/remote/MonsterBox/log',
        'sudo mkdir -p /tmp/flb-storage',
        'sudo chown -R remote:remote /home/remote/log_export',
        'sudo chown -R remote:remote /tmp/flb-storage',
        'sudo chmod 755 /home/remote/log_export'
    ];
    
    for (const cmd of commands) {
        try {
            const command = sshCredentials.buildSSHCommand(animatronicId, host, cmd);
            await execAsync(command);
            console.log(`Executed: ${cmd}`);
        } catch (error) {
            console.log(`Warning: ${cmd} failed: ${error.message}`);
        }
    }
    
    // Create Fluent Bit config
    const configContent = `# MonsterBox Fluent Bit Configuration for Coffin RPI4b

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
    Match             *`;
    
    // Deploy config
    try {
        const deployConfigCommand = sshCredentials.buildSSHCommand(
            animatronicId, 
            host, 
            `cat > /tmp/fluent-bit.conf << 'EOFCONFIG'
${configContent}
EOFCONFIG
sudo mv /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf`
        );
        await execAsync(deployConfigCommand);
        console.log('Deployed Fluent Bit configuration');
    } catch (error) {
        console.error('Failed to deploy config:', error.message);
        process.exit(1);
    }
    
    // Create test log
    try {
        const testLogCommand = sshCredentials.buildSSHCommand(
            animatronicId,
            host,
            'echo "{\\"timestamp\\":\\"$(date -Iseconds)\\",\\"level\\":\\"info\\",\\"message\\":\\"Coffin Fluent Bit deployment test\\",\\"component\\":\\"deployment\\"}" > /home/remote/MonsterBox/log/test.log'
        );
        await execAsync(testLogCommand);
        console.log('Created test log file');
    } catch (error) {
        console.log('Warning: Could not create test log:', error.message);
    }
    
    // Test configuration
    try {
        const testConfigCommand = sshCredentials.buildSSHCommand(
            animatronicId,
            host,
            'sudo /opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf --dry-run'
        );
        await execAsync(testConfigCommand);
        console.log('Configuration test passed');
    } catch (error) {
        console.error('Configuration test failed:', error.message);
        process.exit(1);
    }
    
    // Start service
    try {
        const startCommands = [
            'sudo systemctl enable fluent-bit',
            'sudo systemctl start fluent-bit'
        ];
        
        for (const cmd of startCommands) {
            const command = sshCredentials.buildSSHCommand(animatronicId, host, cmd);
            await execAsync(command);
        }
        console.log('Started Fluent Bit service');
        
        // Wait and check status
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const statusCommand = sshCredentials.buildSSHCommand(animatronicId, host, 'sudo systemctl is-active fluent-bit');
        const statusResult = await execAsync(statusCommand);
        
        if (statusResult.stdout.trim() === 'active') {
            console.log('Fluent Bit service is running successfully');
        } else {
            throw new Error(`Service status: ${statusResult.stdout.trim()}`);
        }
        
    } catch (error) {
        console.error('Failed to start service:', error.message);
        process.exit(1);
    }
    
    // Test HTTP interface
    try {
        const httpTestCommand = sshCredentials.buildSSHCommand(animatronicId, host, 'curl -s http://localhost:2020/');
        const httpResult = await execAsync(httpTestCommand);
        if (httpResult.stdout.includes('fluent-bit')) {
            console.log('HTTP interface is responding');
        }
    } catch (error) {
        console.log('HTTP interface test failed (may not be critical)');
    }
    
    console.log('');
    console.log('Fluent Bit deployment to Coffin completed successfully!');
    console.log('');
    console.log('Status:');
    console.log(`  - HTTP Interface: http://${host}:2020/`);
    console.log(`  - Log Export Directory: /home/remote/log_export/`);
    console.log('');
    console.log('Test commands:');
    console.log(`  - curl http://${host}:2020/`);
    console.log(`  - ssh remote@${host} 'ls -la /home/remote/log_export/'`);
}

deployCoffin().catch(console.error);
'@

# Write the Node.js script to a temporary file
$TempScript = [System.IO.Path]::GetTempFileName() + ".js"
Set-Content -Path $TempScript -Value $DeployScript

try {
    # Run the Node.js deployment script
    $Result = node $TempScript
    Write-Host $Result -ForegroundColor White
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "Deployment completed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Deployment failed with exit code $LASTEXITCODE" -ForegroundColor Red
    }
}
finally {
    # Clean up temporary file
    Remove-Item -Path $TempScript -Force -ErrorAction SilentlyContinue
}
