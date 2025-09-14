#!/usr/bin/env node

/**
 * MonsterBox Fluent Bit Deployment Script for Coffin RPI4b
 * Deploy the same working configuration from Orlok to Coffin
 */

const sshCredentials = require('./ssh-credentials');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class CoffinFluentBitDeployer {
    constructor() {
        this.animatronicId = 'coffin';
        this.host = '192.168.8.140';
        this.logExportDir = '/home/remote/log_export';
        this.monsterBoxLogDir = '/home/remote/MonsterBox/log';
    }

    async deploy() {
        console.log('🎃 MonsterBox Fluent Bit Deployment for Coffin');
        console.log('==============================================');
        console.log(`Target: ${this.host}`);
        console.log('');

        try {
            await this.testConnectivity();
            await this.testSSH();
            await this.checkFluentBit();
            await this.stopFluentBit();
            await this.createDirectories();
            await this.deployConfiguration();
            await this.createTestLog();
            await this.testConfiguration();
            await this.startService();
            await this.verifyDeployment();
            
            console.log('');
            console.log('🎉 Fluent Bit deployment to Coffin completed successfully!');
            console.log('');
            console.log('📊 Status Summary:');
            console.log(`   • HTTP Interface: http://${this.host}:2020/`);
            console.log(`   • Log Export Directory: ${this.logExportDir}/`);
            console.log('');
            console.log('🔧 Test commands:');
            console.log(`   • curl http://${this.host}:2020/`);
            console.log(`   • ssh remote@${this.host} 'ls -la ${this.logExportDir}/'`);
            console.log('');
            console.log('✅ Coffin is now ready for MCP log collection!');
            
        } catch (error) {
            console.error('❌ Deployment failed:', error.message);
            process.exit(1);
        }
    }

    async testConnectivity() {
        console.log('🔍 Testing connectivity to Coffin...');
        try {
            await execAsync(`ping -n 1 -w 5000 ${this.host}`);
            console.log('✅ Coffin RPI is reachable');
        } catch (error) {
            throw new Error(`Cannot reach Coffin RPI at ${this.host}`);
        }
    }

    async testSSH() {
        console.log('🔍 Testing SSH connectivity...');
        try {
            const testCommand = sshCredentials.buildSSHCommand(
                this.animatronicId, 
                this.host, 
                'echo "SSH connection successful"'
            );
            const result = await execAsync(testCommand);
            if (result.stdout.includes('SSH connection successful')) {
                console.log('✅ SSH connection working');
            } else {
                throw new Error('SSH test failed');
            }
        } catch (error) {
            throw new Error(`SSH connection failed: ${error.message}`);
        }
    }

    async checkFluentBit() {
        console.log('📦 Checking Fluent Bit installation...');
        try {
            const checkCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'which fluent-bit'
            );
            await execAsync(checkCommand);
            console.log('✅ Fluent Bit is already installed');
        } catch (error) {
            console.log('📦 Installing Fluent Bit...');
            try {
                const installCommand = sshCredentials.buildSSHCommand(
                    this.animatronicId,
                    this.host,
                    'curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh'
                );
                await execAsync(installCommand);
                console.log('✅ Fluent Bit installed successfully');
            } catch (installError) {
                throw new Error(`Failed to install Fluent Bit: ${installError.message}`);
            }
        }
    }

    async stopFluentBit() {
        console.log('🛑 Stopping existing Fluent Bit service...');
        try {
            const stopCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'sudo systemctl stop fluent-bit || true'
            );
            await execAsync(stopCommand);
            console.log('✅ Stopped existing Fluent Bit service');
        } catch (error) {
            console.log('ℹ️  Note: Could not stop Fluent Bit (may not be running)');
        }
    }

    async createDirectories() {
        console.log('📁 Creating required directories...');
        
        const commands = [
            `sudo mkdir -p ${this.logExportDir}`,
            `sudo mkdir -p ${this.monsterBoxLogDir}`,
            'sudo mkdir -p /home/remote/MonsterBox/scripts/log',
            'sudo mkdir -p /tmp/flb-storage/',
            'sudo mkdir -p /etc/fluent-bit/',
            `sudo chown -R remote:remote ${this.logExportDir}`,
            'sudo chown -R remote:remote /tmp/flb-storage/',
            `sudo chmod 755 ${this.logExportDir}`,
            'sudo chmod 755 /tmp/flb-storage/'
        ];

        for (const cmd of commands) {
            try {
                const command = sshCredentials.buildSSHCommand(this.animatronicId, this.host, cmd);
                await execAsync(command);
                console.log(`   ✅ ${cmd}`);
            } catch (error) {
                console.log(`   ⚠️  ${cmd} - ${error.message}`);
            }
        }
    }

    async deployConfiguration() {
        console.log('⚙️  Deploying Fluent Bit configuration...');
        
        const fluentBitConfig = `# MonsterBox Fluent Bit Configuration for Coffin RPI4b

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

        try {
            // Deploy main configuration
            const deployConfigCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                `cat > /tmp/fluent-bit.conf << 'EOFCONFIG'
${fluentBitConfig}
EOFCONFIG
sudo mv /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf`
            );
            await execAsync(deployConfigCommand);
            console.log('✅ Deployed main configuration');

            // Deploy parsers configuration
            const parsersConfig = `[PARSER]
    Name        json
    Format      json
    Time_Key    time
    Time_Format %Y-%m-%dT%H:%M:%S.%L
    Time_Keep   On

[PARSER]
    Name        syslog
    Format      regex
    Regex       ^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\\/\\.\\-]*)(?:\\[(?<pid>[0-9]+)\\])?(?:[^\\:]*\\:)? *(?<message>.*)$
    Time_Key    time
    Time_Format %b %d %H:%M:%S`;

            const deployParsersCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                `cat > /tmp/parsers.conf << 'EOFPARSERS'
${parsersConfig}
EOFPARSERS
sudo mv /tmp/parsers.conf /etc/fluent-bit/parsers.conf`
            );
            await execAsync(deployParsersCommand);
            console.log('✅ Deployed parsers configuration');

        } catch (error) {
            throw new Error(`Failed to deploy configuration: ${error.message}`);
        }
    }

    async createTestLog() {
        console.log('📝 Creating test log entries...');
        try {
            const testLogCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'echo "{\\"timestamp\\":\\"$(date -Iseconds)\\",\\"level\\":\\"info\\",\\"message\\":\\"Coffin Fluent Bit deployment test\\",\\"component\\":\\"deployment\\",\\"animatronic\\":\\"coffin\\"}" > /home/remote/MonsterBox/log/test.log'
            );
            await execAsync(testLogCommand);
            console.log('✅ Created test log file');
        } catch (error) {
            console.log(`⚠️  Could not create test log: ${error.message}`);
        }
    }

    async testConfiguration() {
        console.log('🧪 Testing Fluent Bit configuration...');
        try {
            const testConfigCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'sudo /opt/fluent-bit/bin/fluent-bit -c /etc/fluent-bit/fluent-bit.conf --dry-run'
            );
            await execAsync(testConfigCommand);
            console.log('✅ Configuration test passed');
        } catch (error) {
            throw new Error(`Configuration test failed: ${error.message}`);
        }
    }

    async startService() {
        console.log('🚀 Starting Fluent Bit service...');
        try {
            const enableCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'sudo systemctl enable fluent-bit'
            );
            await execAsync(enableCommand);

            const startCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'sudo systemctl start fluent-bit'
            );
            await execAsync(startCommand);

            console.log('✅ Service commands executed');

            // Wait for startup
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Check status
            const statusCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'sudo systemctl is-active fluent-bit'
            );
            const statusResult = await execAsync(statusCommand);

            if (statusResult.stdout.trim() === 'active') {
                console.log('✅ Fluent Bit service is running');
            } else {
                throw new Error(`Service status: ${statusResult.stdout.trim()}`);
            }

        } catch (error) {
            throw new Error(`Failed to start service: ${error.message}`);
        }
    }

    async verifyDeployment() {
        console.log('🔍 Verifying deployment...');

        // Test HTTP interface
        try {
            const httpTestCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                'curl -s http://localhost:2020/'
            );
            const httpResult = await execAsync(httpTestCommand);
            if (httpResult.stdout.includes('fluent-bit')) {
                console.log('✅ HTTP interface is responding');
            } else {
                console.log('⚠️  HTTP interface test inconclusive');
            }
        } catch (error) {
            console.log('⚠️  HTTP interface test failed (may not be critical)');
        }

        // Check log files after a moment
        await new Promise(resolve => setTimeout(resolve, 3000));
        try {
            const logCheckCommand = sshCredentials.buildSSHCommand(
                this.animatronicId,
                this.host,
                `ls -la ${this.logExportDir}/coffin-*.log`
            );
            const logResult = await execAsync(logCheckCommand);
            if (logResult.stdout.includes('coffin-')) {
                console.log('✅ Log files are being generated');
            } else {
                console.log('⚠️  No log files found yet (may need more time)');
            }
        } catch (error) {
            console.log('⚠️  Could not check log files (may need more time)');
        }
    }
}

// Run deployment if called directly
if (require.main === module) {
    const deployer = new CoffinFluentBitDeployer();
    deployer.deploy().catch(console.error);
}

module.exports = CoffinFluentBitDeployer;
