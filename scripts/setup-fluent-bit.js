#!/usr/bin/env node

/**
 * MonsterBox Fluent Bit Setup Script
 * 
 * Sets up Fluent Bit log collection on RPI4b systems
 * Replaces expensive Sematext with cost-effective file-based log collection
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sshCredentials = require('./ssh-credentials');
const ConfigAdapter = require('./config-adapter');

class FluentBitSetup {
    constructor() {
        this.configAdapter = new ConfigAdapter();
        this.logDir = path.join(process.cwd(), 'log', 'aggregated');
        this.configPath = path.join(process.cwd(), 'data', 'fluent-bit-config.json');
    }

    async run() {
        console.log('🎃 MonsterBox Fluent Bit Setup\n');
        
        try {
            // Create local log directories
            await this.createLogDirectories();
            
            // Get enabled animatronics
            const config = await this.configAdapter.getEnabledAnimatronics();
            const enabledAnimatronics = Object.entries(config.animatronics)
                .filter(([id, animatronic]) => animatronic.enabled !== false);

            if (enabledAnimatronics.length === 0) {
                console.log('⚠️  No enabled animatronics found. Please enable at least one animatronic first.');
                return;
            }

            console.log(`📊 Setting up Fluent Bit for ${enabledAnimatronics.length} animatronic(s):`);
            enabledAnimatronics.forEach(([id, animatronic]) => {
                console.log(`   • ${animatronic.name} (${animatronic.host})`);
            });

            // Install and configure Fluent Bit on each RPI
            for (const [id, animatronic] of enabledAnimatronics) {
                await this.setupFluentBitOnRPI(id, animatronic);
            }

            // Create local aggregation configuration
            await this.createAggregationConfig(enabledAnimatronics);

            // Update package.json scripts
            await this.updatePackageScripts();

            console.log('\n✅ Fluent Bit setup completed successfully!');
            console.log('\n📋 Next steps:');
            console.log('   1. Test the setup: npm run test:fluent-bit');
            console.log('   2. Start log collection: npm run mcp:log-collector');
            console.log('   3. View logs in VS Code using MCP tools');

        } catch (error) {
            console.error('❌ Fluent Bit setup failed:', error.message);
            process.exit(1);
        }
    }

    async createLogDirectories() {
        console.log('📁 Creating log directories...');
        
        const directories = [
            path.join(process.cwd(), 'log'),
            this.logDir,
            path.join(this.logDir, 'orlok'),
            path.join(this.logDir, 'coffin'),
            path.join(this.logDir, 'pumpkinhead'),
            path.join(process.cwd(), 'data')
        ];

        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
        }

        console.log('   ✅ Log directories created');
    }

    async setupFluentBitOnRPI(id, animatronic) {
        console.log(`\n🔧 Setting up Fluent Bit on ${animatronic.name} (${animatronic.host})...`);

        try {
            // Test connectivity first
            await execAsync(`ping -n 1 -w 1000 ${animatronic.host}`);
            console.log(`   ✅ ${animatronic.name} is reachable`);

            // Install Fluent Bit
            await this.installFluentBitOnRPI(id, animatronic);

            // Configure Fluent Bit
            await this.configureFluentBitOnRPI(id, animatronic);

            // Start Fluent Bit service
            await this.startFluentBitOnRPI(id, animatronic);

            console.log(`   ✅ Fluent Bit setup completed for ${animatronic.name}`);

        } catch (error) {
            console.error(`   ❌ Failed to setup Fluent Bit on ${animatronic.name}: ${error.message}`);
            throw error;
        }
    }

    async installFluentBitOnRPI(id, animatronic) {
        console.log(`   📦 Installing Fluent Bit on ${animatronic.name}...`);

        const installCommands = [
            'curl https://raw.githubusercontent.com/fluent/fluent-bit/master/install.sh | sh',
            'sudo systemctl enable fluent-bit',
            'sudo mkdir -p /var/log/monsterbox',
            'sudo chown $USER:$USER /var/log/monsterbox'
        ];

        for (const command of installCommands) {
            try {
                const sshCommand = sshCredentials.buildSSHCommand(id, animatronic.host, command);
                await execAsync(sshCommand);
            } catch (error) {
                console.log(`      ⚠️  Command failed (may be already installed): ${command}`);
            }
        }

        console.log(`   ✅ Fluent Bit installed on ${animatronic.name}`);
    }

    async configureFluentBitOnRPI(id, animatronic) {
        console.log(`   ⚙️  Configuring Fluent Bit on ${animatronic.name}...`);

        const config = this.generateFluentBitConfig(id, animatronic);
        const configPath = '/tmp/fluent-bit.conf';

        // Write config to temporary file
        await fs.writeFile(configPath, config);

        // Copy config to RPI
        const scpCommand = sshCredentials.buildSCPCommand(id, animatronic.host, configPath, '/tmp/fluent-bit.conf');
        await execAsync(scpCommand);

        // Move config to proper location
        const moveCommand = sshCredentials.buildSSHCommand(id, animatronic.host, 
            'sudo mv /tmp/fluent-bit.conf /etc/fluent-bit/fluent-bit.conf');
        await execAsync(moveCommand);

        // Clean up local temp file
        await fs.unlink(configPath);

        console.log(`   ✅ Fluent Bit configured on ${animatronic.name}`);
    }

    generateFluentBitConfig(id, animatronic) {
        return `[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf
    HTTP_Server   On
    HTTP_Listen   0.0.0.0
    HTTP_Port     2020
    storage.path  /tmp/flb-storage/
    storage.sync  normal
    storage.checksum off
    storage.backlog.mem_limit 5M

# MonsterBox Application Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/*.log
    Path_Key          filename
    Tag               monsterbox.app
    Parser            json
    DB                /var/log/flb_monsterbox_app.db
    Refresh_Interval  5
    Read_from_Head    true
    Multiline         On
    Multiline_Flush   2
    Parser_Firstline  multiline

# MonsterBox Utility Scripts Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/scripts/log/*.log
    Path_Key          filename
    Tag               monsterbox.utils
    Parser            json
    DB                /var/log/flb_monsterbox_utils.db
    Refresh_Interval  5
    Read_from_Head    true

# MonsterBox Error Logs
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/error*.log
    Path_Key          filename
    Tag               monsterbox.errors
    Parser            json
    DB                /var/log/flb_monsterbox_errors.db
    Refresh_Interval  2
    Read_from_Head    true

# Node.js Process Logs (if MonsterBox runs as service)
[INPUT]
    Name              tail
    Path              /home/remote/MonsterBox/log/pm2*.log
    Path_Key          filename
    Tag               monsterbox.pm2
    DB                /var/log/flb_monsterbox_pm2.db
    Refresh_Interval  5
    Read_from_Head    false

# System Services (SSH, Network, etc.)
[INPUT]
    Name              systemd
    Tag               system.services
    Systemd_Filter    _SYSTEMD_UNIT=ssh.service
    Systemd_Filter    _SYSTEMD_UNIT=networking.service
    Systemd_Filter    _SYSTEMD_UNIT=systemd-networkd.service
    Systemd_Filter    _SYSTEMD_UNIT=dhcpcd.service
    Read_From_Tail    true
    Strip_Underscores On

# MonsterBox Service (if running as systemd service)
[INPUT]
    Name              systemd
    Tag               system.monsterbox
    Systemd_Filter    _SYSTEMD_UNIT=monsterbox.service
    Read_From_Tail    true
    Strip_Underscores On

# System Logs (syslog, auth, kern)
[INPUT]
    Name              tail
    Path              /var/log/syslog
    Tag               system.syslog
    DB                /var/log/flb_syslog.db
    Refresh_Interval  10
    Read_from_Head    false
    Skip_Long_Lines   On

[INPUT]
    Name              tail
    Path              /var/log/auth.log
    Tag               system.auth
    DB                /var/log/flb_auth.db
    Refresh_Interval  5
    Read_from_Head    false

[INPUT]
    Name              tail
    Path              /var/log/kern.log
    Tag               system.kernel
    DB                /var/log/flb_kern.db
    Refresh_Interval  10
    Read_from_Head    false

# Hardware/GPIO Logs (RPI specific)
[INPUT]
    Name              tail
    Path              /var/log/daemon.log
    Tag               system.daemon
    DB                /var/log/flb_daemon.db
    Refresh_Interval  10
    Read_from_Head    false

# Network Interface Logs
[INPUT]
    Name              netif
    Tag               system.network
    Interface         eth0
    Interval_Sec      30

# CPU and Memory Metrics
[INPUT]
    Name              cpu
    Tag               metrics.cpu
    Interval_Sec      30

[INPUT]
    Name              mem
    Tag               metrics.memory
    Interval_Sec      30

# Disk Usage
[INPUT]
    Name              disk
    Tag               metrics.disk
    Interval_Sec      60

# Process Monitoring
[INPUT]
    Name              proc
    Tag               metrics.processes
    Proc_Name         node
    Interval_Sec      30

# FILTERS - Add metadata and parsing
[FILTER]
    Name              record_modifier
    Match             monsterbox.*
    Record            hostname ${id}
    Record            animatronic ${animatronic.name}
    Record            source_type monsterbox_app

[FILTER]
    Name              record_modifier
    Match             system.*
    Record            hostname ${id}
    Record            animatronic ${animatronic.name}
    Record            source_type system

[FILTER]
    Name              record_modifier
    Match             metrics.*
    Record            hostname ${id}
    Record            animatronic ${animatronic.name}
    Record            source_type metrics

# OUTPUTS - Organized by type for MCP consumption
[OUTPUT]
    Name              file
    Match             monsterbox.app
    Path              /home/remote/log_export/
    File              ${id}-monsterbox-app.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             monsterbox.utils
    Path              /home/remote/log_export/
    File              ${id}-monsterbox-utils.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             monsterbox.errors
    Path              /home/remote/log_export/
    File              ${id}-monsterbox-errors.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             monsterbox.pm2
    Path              /home/remote/log_export/
    File              ${id}-monsterbox-pm2.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.services
    Path              /home/remote/log_export/
    File              ${id}-system-services.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.monsterbox
    Path              /home/remote/log_export/
    File              ${id}-system-monsterbox.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.syslog
    Path              /home/remote/log_export/
    File              ${id}-system-syslog.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.auth
    Path              /home/remote/log_export/
    File              ${id}-system-auth.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.kernel
    Path              /home/remote/log_export/
    File              ${id}-system-kernel.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.daemon
    Path              /home/remote/log_export/
    File              ${id}-system-daemon.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             system.network
    Path              /home/remote/log_export/
    File              ${id}-system-network.jsonl
    Format            json_lines

[OUTPUT]
    Name              file
    Match             metrics.*
    Path              /home/remote/log_export/
    File              ${id}-metrics.jsonl
    Format            json_lines

# Combined output for easy MCP consumption
[OUTPUT]
    Name              file
    Match             *
    Path              /home/remote/log_export/
    File              ${id}-combined.jsonl
    Format            json_lines
`;
    }

    async startFluentBitOnRPI(id, animatronic) {
        console.log(`   🚀 Starting Fluent Bit service on ${animatronic.name}...`);

        const commands = [
            'sudo systemctl restart fluent-bit',
            'sudo systemctl status fluent-bit --no-pager'
        ];

        for (const command of commands) {
            const sshCommand = sshCredentials.buildSSHCommand(id, animatronic.host, command);
            await execAsync(sshCommand);
        }

        console.log(`   ✅ Fluent Bit service started on ${animatronic.name}`);
    }

    async createAggregationConfig(enabledAnimatronics) {
        console.log('\n📝 Creating aggregation configuration...');

        const config = {
            fluent_bit: {
                version: '3.0',
                log_sources: enabledAnimatronics.map(([id, animatronic]) => ({
                    id: id,
                    name: animatronic.name,
                    host: animatronic.host,
                    log_files: [
                        `${id}-logs.jsonl`,
                        `${id}-app.jsonl`,
                        `${id}-system.jsonl`
                    ]
                })),
                local_aggregation: {
                    enabled: true,
                    path: this.logDir,
                    retention_days: 30,
                    max_file_size: '100MB'
                }
            },
            systems: enabledAnimatronics.map(([id, animatronic]) => ({
                id: id,
                name: animatronic.name,
                host: animatronic.host,
                enabled: true,
                fluent_bit_status: 'configured',
                last_updated: new Date().toISOString()
            })),
            created_at: new Date().toISOString(),
            version: '1.0.0'
        };

        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
        console.log('   ✅ Aggregation configuration saved');
    }

    async updatePackageScripts() {
        const packagePath = path.join(process.cwd(), 'package.json');

        try {
            const packageData = await fs.readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageData);

            // Ensure Fluent Bit scripts exist
            packageJson.scripts = packageJson.scripts || {};
            if (!packageJson.scripts['setup:fluent-bit']) {
                packageJson.scripts['setup:fluent-bit'] = 'node scripts/setup-fluent-bit.js';
            }
            if (!packageJson.scripts['test:fluent-bit']) {
                packageJson.scripts['test:fluent-bit'] = 'node scripts/test-fluent-bit.js';
            }

            await fs.writeFile(packagePath, JSON.stringify(packageJson, null, 2));
            console.log('   ✅ Package.json scripts verified');

        } catch (error) {
            console.warn('   ⚠️  Could not update package.json scripts:', error.message);
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new FluentBitSetup();
    setup.run().catch(console.error);
}

module.exports = FluentBitSetup;
