#!/usr/bin/env node

/**
 * MonsterBox RPI4b Logging Setup Script
 * 
 * Interactive setup for RPI4b system log collection
 */

const inquirer = require('inquirer');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class RPiSetup {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config', 'rpi-config.json');
    }

    async run() {
        console.log('🎃 MonsterBox RPI4b Logging Setup\n');
        
        try {
            const answers = await this.promptForRPiInfo();
            await this.testConnection(answers);
            await this.updateConfig(answers);
            await this.testLogCollection(answers);
            
            console.log('\n✅ RPI4b logging setup complete!');
            console.log('\n🚀 Next steps:');
            console.log('   npm run collect:rpi-logs  # Test log collection');
            console.log('   npm run test:mcp          # Test full MCP setup');
            
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
            process.exit(1);
        }
    }

    async promptForRPiInfo() {
        const questions = [
            {
                type: 'input',
                name: 'host',
                message: 'What is your RPI4b IP address?',
                default: '192.168.1.100',
                validate: (input) => {
                    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    return ipRegex.test(input) || 'Please enter a valid IP address';
                }
            },
            {
                type: 'input',
                name: 'user',
                message: 'What is the username for your RPI4b?',
                default: 'pi'
            },
            {
                type: 'input',
                name: 'name',
                message: 'What would you like to call this RPI system?',
                default: 'MonsterBox-RPI4b'
            },
            {
                type: 'checkbox',
                name: 'services',
                message: 'Which services would you like to monitor?',
                choices: [
                    { name: 'SSH (ssh)', value: 'ssh', checked: true },
                    { name: 'System Resolved (systemd-resolved)', value: 'systemd-resolved', checked: true },
                    { name: 'Bluetooth (bluetooth)', value: 'bluetooth', checked: false },
                    { name: 'MonsterBox Service (monsterbox)', value: 'monsterbox', checked: true },
                    { name: 'Nginx Web Server (nginx)', value: 'nginx', checked: false },
                    { name: 'GPIO Control (gpio-control)', value: 'gpio-control', checked: true }
                ]
            },
            {
                type: 'checkbox',
                name: 'logTypes',
                message: 'Which log types would you like to collect?',
                choices: [
                    { name: 'System logs', value: 'system', checked: true },
                    { name: 'Authentication logs', value: 'auth', checked: true },
                    { name: 'Kernel logs', value: 'kernel', checked: true },
                    { name: 'Daemon logs', value: 'daemon', checked: true },
                    { name: 'User logs', value: 'user', checked: false }
                ]
            }
        ];

        return await inquirer.prompt(questions);
    }

    async testConnection(config) {
        console.log(`\n🔍 Testing SSH connection to ${config.host}...`);
        
        try {
            const command = `ssh -o ConnectTimeout=10 -o BatchMode=yes ${config.user}@${config.host} "echo 'Connection successful'"`;
            const { stdout } = await execAsync(command);
            
            if (stdout.includes('Connection successful')) {
                console.log('✅ SSH connection successful');
            } else {
                throw new Error('SSH test failed');
            }
            
        } catch (error) {
            console.log('❌ SSH connection failed');
            console.log('\n🔧 To fix this, run these commands:');
            console.log(`   ssh-keygen -t rsa -b 4096 -C "monsterbox@$(hostname)"`);
            console.log(`   ssh-copy-id ${config.user}@${config.host}`);
            console.log(`   ssh ${config.user}@${config.host} "sudo systemctl enable ssh"`);
            
            const retry = await inquirer.prompt([{
                type: 'confirm',
                name: 'continue',
                message: 'Have you set up SSH keys? Continue anyway?',
                default: false
            }]);
            
            if (!retry.continue) {
                throw new Error('SSH setup required');
            }
        }
    }

    async updateConfig(answers) {
        console.log('\n📝 Updating RPI configuration...');
        
        try {
            // Load existing config or create new one
            let config;
            try {
                const configData = await fs.readFile(this.configPath, 'utf8');
                config = JSON.parse(configData);
            } catch (error) {
                // Create default config
                config = {
                    rpi_systems: [],
                    ubuntu_systems: [],
                    collection_settings: {
                        default_lines: 100,
                        default_since: "1 hour ago",
                        retry_attempts: 3,
                        timeout_seconds: 30,
                        compress_logs: true,
                        store_raw_logs: true
                    }
                };
            }

            // Update or add RPI system
            const existingIndex = config.rpi_systems.findIndex(s => s.name === answers.name);
            const rpiConfig = {
                name: answers.name,
                host: answers.host,
                user: answers.user,
                description: `MonsterBox RPI4b controller at ${answers.host}`,
                services: answers.services,
                log_types: answers.logTypes,
                collection_interval: 300,
                max_lines: 1000
            };

            if (existingIndex >= 0) {
                config.rpi_systems[existingIndex] = rpiConfig;
            } else {
                config.rpi_systems.push(rpiConfig);
            }

            // Ensure config directory exists
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            
            // Save config
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            
            console.log('✅ Configuration updated');
            
        } catch (error) {
            throw new Error(`Failed to update configuration: ${error.message}`);
        }
    }

    async testLogCollection(config) {
        console.log('\n🧪 Testing log collection...');
        
        try {
            const command = `ssh ${config.user}@${config.host} "sudo journalctl -n 5 --no-pager"`;
            const { stdout } = await execAsync(command);
            
            if (stdout.trim()) {
                console.log('✅ Log collection test successful');
                console.log('📋 Sample logs:');
                console.log(stdout.split('\n').slice(0, 3).map(line => `   ${line}`).join('\n'));
            } else {
                throw new Error('No logs returned');
            }
            
        } catch (error) {
            console.log('⚠️  Log collection test failed:', error.message);
            console.log('🔧 You may need to configure sudo access for journalctl');
            console.log(`   ssh ${config.user}@${config.host}`);
            console.log('   sudo visudo');
            console.log(`   Add: ${config.user} ALL=(ALL) NOPASSWD: /bin/journalctl`);
        }
    }

    async showCurrentConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            
            console.log('\n📋 Current RPI Configuration:');
            config.rpi_systems.forEach((system, index) => {
                console.log(`\n${index + 1}. ${system.name}`);
                console.log(`   Host: ${system.host}`);
                console.log(`   User: ${system.user}`);
                console.log(`   Services: ${system.services.join(', ')}`);
                console.log(`   Log Types: ${system.log_types.join(', ')}`);
            });
            
        } catch (error) {
            console.log('📋 No RPI configuration found yet');
        }
    }
}

// CLI usage
if (require.main === module) {
    const setup = new RPiSetup();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--show-config')) {
        setup.showCurrentConfig();
    } else {
        setup.run().catch(console.error);
    }
}

module.exports = RPiSetup;
