#!/usr/bin/env node

/**
 * MonsterBox Animatronic Manager
 * 
 * Manages multiple animatronic RPIs:
 * - Orlok
 * - Pumpkinhead  
 * - Coffin
 * - Future animatronics
 */

const inquirer = require('inquirer').default || require('inquirer');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const sshCredentials = require('./ssh-credentials');

// Load environment variables
require('dotenv').config();

class AnimatronicManager {
    constructor() {
        this.configPath = path.join(process.cwd(), 'config', 'animatronics.json');
        this.animatronics = {};
    }

    async run() {
        console.log('🎃 MonsterBox Animatronic Manager\n');
        
        await this.loadAnimatronics();
        
        const action = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: '➕ Add New Animatronic', value: 'add' },
                { name: '🔧 Configure Existing Animatronic', value: 'configure' },
                { name: '📊 View All Animatronics', value: 'view' },
                { name: '🧪 Test Animatronic Connection', value: 'test' },
                { name: '📋 Collect Logs from All', value: 'collect' },
                { name: '🔑 Setup SSH Keys for All', value: 'setup-ssh' },
                { name: '❌ Remove Animatronic', value: 'remove' }
            ]
        }]);

        switch (action.action) {
            case 'add':
                await this.addAnimatronic();
                break;
            case 'configure':
                await this.configureAnimatronic();
                break;
            case 'view':
                await this.viewAnimatronics();
                break;
            case 'test':
                await this.testAnimatronic();
                break;
            case 'collect':
                await this.collectAllLogs();
                break;
            case 'setup-ssh':
                await this.setupSSHForAll();
                break;
            case 'remove':
                await this.removeAnimatronic();
                break;
        }
    }

    async loadAnimatronics() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            this.animatronics = JSON.parse(data);
        } catch (error) {
            // Create default animatronics config
            this.animatronics = {
                animatronics: {
                    orlok: {
                        name: "Orlok",
                        character: "Count Orlok",
                        host: "192.168.8.120",
                        user: sshCredentials.getCredentials('orlok').user,
                        description: "Vampire animatronic with moving arms and glowing eyes",
                        services: ["monsterbox", "ssh", "gpio-control", "servo-control"],
                        log_types: ["system", "auth", "kernel", "daemon"],
                        parts: ["Right Arm of Satan", "Left Arm of Manipulation", "Hand of Azura", "Eye of Orlok"],
                        status: "not_configured"
                    },
                    pumpkinhead: {
                        name: "Pumpkinhead",
                        character: "Pumpkinhead Demon",
                        host: "192.168.1.101",
                        user: sshCredentials.getCredentials('pumpkinhead').user,
                        description: "Pumpkin-headed demon with articulated limbs",
                        services: ["monsterbox", "ssh", "gpio-control", "led-control"],
                        log_types: ["system", "auth", "kernel"],
                        parts: [],
                        status: "not_configured"
                    },
                    coffin: {
                        name: "Coffin",
                        character: "Coffin Dweller",
                        host: "192.168.8.149",
                        user: sshCredentials.getCredentials('coffin').user,
                        description: "Coffin with opening lid and emerging figure",
                        services: ["monsterbox", "ssh", "linear-actuator", "sound"],
                        log_types: ["system", "auth", "daemon"],
                        parts: [],
                        status: "not_configured"
                    }
                },
                settings: {
                    default_user: sshCredentials.getCredentials('orlok').user,
                    ssh_key_path: "~/.ssh/id_rsa",
                    collection_interval: 300,
                    log_retention_days: 30
                }
            };
            await this.saveAnimatronics();
        }
    }

    async saveAnimatronics() {
        await fs.mkdir(path.dirname(this.configPath), { recursive: true });
        await fs.writeFile(this.configPath, JSON.stringify(this.animatronics, null, 2));
    }

    async addAnimatronic() {
        console.log('\n➕ Adding New Animatronic\n');
        
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'id',
                message: 'Animatronic ID (lowercase, no spaces):',
                validate: (input) => {
                    if (!input.match(/^[a-z0-9_]+$/)) {
                        return 'ID must be lowercase letters, numbers, and underscores only';
                    }
                    if (this.animatronics.animatronics[input]) {
                        return 'This animatronic already exists';
                    }
                    return true;
                }
            },
            {
                type: 'input',
                name: 'name',
                message: 'Display Name:',
                validate: (input) => input.length > 0 || 'Name is required'
            },
            {
                type: 'input',
                name: 'character',
                message: 'Character Name:',
                validate: (input) => input.length > 0 || 'Character name is required'
            },
            {
                type: 'input',
                name: 'host',
                message: 'RPI IP Address:',
                validate: (input) => {
                    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    return ipRegex.test(input) || 'Please enter a valid IP address';
                }
            },
            {
                type: 'input',
                name: 'user',
                message: 'SSH Username:',
                default: 'pi'
            },
            {
                type: 'input',
                name: 'description',
                message: 'Description:'
            },
            {
                type: 'checkbox',
                name: 'services',
                message: 'Services to monitor:',
                choices: [
                    { name: 'MonsterBox Service', value: 'monsterbox', checked: true },
                    { name: 'SSH', value: 'ssh', checked: true },
                    { name: 'GPIO Control', value: 'gpio-control', checked: true },
                    { name: 'Servo Control', value: 'servo-control', checked: false },
                    { name: 'LED Control', value: 'led-control', checked: false },
                    { name: 'Linear Actuator', value: 'linear-actuator', checked: false },
                    { name: 'Sound System', value: 'sound', checked: false },
                    { name: 'Camera', value: 'camera', checked: false }
                ]
            },
            {
                type: 'checkbox',
                name: 'log_types',
                message: 'Log types to collect:',
                choices: [
                    { name: 'System Logs', value: 'system', checked: true },
                    { name: 'Authentication Logs', value: 'auth', checked: true },
                    { name: 'Kernel Logs', value: 'kernel', checked: true },
                    { name: 'Daemon Logs', value: 'daemon', checked: true },
                    { name: 'User Logs', value: 'user', checked: false }
                ]
            }
        ]);

        this.animatronics.animatronics[answers.id] = {
            ...answers,
            parts: [],
            status: 'not_configured',
            created_at: new Date().toISOString()
        };

        await this.saveAnimatronics();
        
        console.log(`\n✅ Animatronic "${answers.name}" added successfully!`);
        
        // Offer to test connection
        const testNow = await inquirer.prompt([{
            type: 'confirm',
            name: 'test',
            message: 'Would you like to test the connection now?',
            default: true
        }]);

        if (testNow.test) {
            await this.testConnection(answers.id);
        }
    }

    async configureAnimatronic() {
        const choices = Object.entries(this.animatronics.animatronics).map(([id, config]) => ({
            name: `${config.name} (${config.host}) - ${config.status}`,
            value: id
        }));

        if (choices.length === 0) {
            console.log('❌ No animatronics configured yet. Add one first.');
            return;
        }

        const { animatronicId } = await inquirer.prompt([{
            type: 'list',
            name: 'animatronicId',
            message: 'Which animatronic would you like to configure?',
            choices
        }]);

        const animatronic = this.animatronics.animatronics[animatronicId];
        
        const updates = await inquirer.prompt([
            {
                type: 'input',
                name: 'host',
                message: 'IP Address:',
                default: animatronic.host
            },
            {
                type: 'input',
                name: 'user',
                message: 'SSH Username:',
                default: animatronic.user
            },
            {
                type: 'checkbox',
                name: 'services',
                message: 'Services to monitor:',
                choices: [
                    { name: 'MonsterBox Service', value: 'monsterbox', checked: animatronic.services.includes('monsterbox') },
                    { name: 'SSH', value: 'ssh', checked: animatronic.services.includes('ssh') },
                    { name: 'GPIO Control', value: 'gpio-control', checked: animatronic.services.includes('gpio-control') },
                    { name: 'Servo Control', value: 'servo-control', checked: animatronic.services.includes('servo-control') },
                    { name: 'LED Control', value: 'led-control', checked: animatronic.services.includes('led-control') },
                    { name: 'Linear Actuator', value: 'linear-actuator', checked: animatronic.services.includes('linear-actuator') },
                    { name: 'Sound System', value: 'sound', checked: animatronic.services.includes('sound') },
                    { name: 'Camera', value: 'camera', checked: animatronic.services.includes('camera') }
                ]
            }
        ]);

        Object.assign(animatronic, updates);
        animatronic.updated_at = new Date().toISOString();
        
        await this.saveAnimatronics();
        console.log(`✅ ${animatronic.name} configuration updated!`);
    }

    async viewAnimatronics() {
        console.log('\n📊 MonsterBox Animatronics\n');
        
        if (Object.keys(this.animatronics.animatronics).length === 0) {
            console.log('❌ No animatronics configured yet.');
            return;
        }

        Object.entries(this.animatronics.animatronics).forEach(([id, config]) => {
            const statusIcon = config.status === 'configured' ? '✅' : 
                              config.status === 'error' ? '❌' : '⚠️';
            
            console.log(`${statusIcon} ${config.name} (${id})`);
            console.log(`   Character: ${config.character}`);
            console.log(`   Host: ${config.host}`);
            console.log(`   Status: ${config.status}`);
            console.log(`   Services: ${config.services.join(', ')}`);
            console.log(`   Parts: ${config.parts.length} configured`);
            console.log('');
        });
    }

    async testAnimatronic() {
        const choices = Object.entries(this.animatronics.animatronics).map(([id, config]) => ({
            name: `${config.name} (${config.host})`,
            value: id
        }));

        if (choices.length === 0) {
            console.log('❌ No animatronics configured yet.');
            return;
        }

        const { animatronicId } = await inquirer.prompt([{
            type: 'list',
            name: 'animatronicId',
            message: 'Which animatronic would you like to test?',
            choices
        }]);

        await this.testConnection(animatronicId);
    }

    async testConnection(animatronicId) {
        const animatronic = this.animatronics.animatronics[animatronicId];
        console.log(`\n🧪 Testing connection to ${animatronic.name} (${animatronic.host})...`);

        try {
            // Test SSH connection using individual credentials
            const sshCommand = sshCredentials.buildSSHCommand(animatronicId, animatronic.host, "echo 'SSH test successful'");
            const { stdout: sshResult } = await execAsync(sshCommand);

            if (sshResult.includes('SSH test successful')) {
                console.log('✅ SSH connection successful');

                // Test log access
                const logCommand = sshCredentials.buildSSHCommand(animatronicId, animatronic.host, "sudo journalctl -n 5 --no-pager", { batchMode: false });
                const { stdout: logResult } = await execAsync(logCommand);
                
                if (logResult.trim()) {
                    console.log('✅ Log access successful');
                    animatronic.status = 'configured';
                    animatronic.last_tested = new Date().toISOString();
                } else {
                    console.log('⚠️  SSH works but log access failed');
                    animatronic.status = 'partial';
                }
            }
            
        } catch (error) {
            console.log('❌ Connection failed:', error.message);
            console.log('\n🔧 Setup instructions:');
            console.log(`   1. ssh-copy-id ${animatronic.user}@${animatronic.host}`);
            console.log(`   2. ssh ${animatronic.user}@${animatronic.host}`);
            console.log(`   3. sudo visudo`);
            console.log(`   4. Add: ${animatronic.user} ALL=(ALL) NOPASSWD: /bin/journalctl`);
            
            animatronic.status = 'error';
            animatronic.last_error = error.message;
        }

        await this.saveAnimatronics();
    }

    async setupSSHForAll() {
        console.log('\n🔑 Setting up SSH keys for all animatronics...\n');
        
        for (const [id, animatronic] of Object.entries(this.animatronics.animatronics)) {
            console.log(`\n🔧 Setting up SSH for ${animatronic.name}:`);
            console.log(`   ssh-copy-id ${animatronic.user}@${animatronic.host}`);
            console.log(`   # Then test: ssh ${animatronic.user}@${animatronic.host}`);
        }
        
        console.log('\n📋 After setting up SSH keys, run:');
        console.log('   npm run animatronic:test-all');
    }

    async collectAllLogs() {
        console.log('\n📋 Collecting logs from all configured animatronics...\n');
        
        const results = [];
        
        for (const [id, animatronic] of Object.entries(this.animatronics.animatronics)) {
            if (animatronic.status === 'configured') {
                try {
                    console.log(`📊 Collecting logs from ${animatronic.name}...`);
                    const logs = await this.collectAnimatronicLogs(id);
                    results.push({ id, name: animatronic.name, success: true, logs });
                    console.log(`✅ ${animatronic.name} logs collected`);
                } catch (error) {
                    console.log(`❌ ${animatronic.name} log collection failed:`, error.message);
                    results.push({ id, name: animatronic.name, success: false, error: error.message });
                }
            } else {
                console.log(`⚠️  Skipping ${animatronic.name} (status: ${animatronic.status})`);
            }
        }
        
        console.log(`\n📊 Collection Summary:`);
        console.log(`✅ Successful: ${results.filter(r => r.success).length}`);
        console.log(`❌ Failed: ${results.filter(r => !r.success).length}`);
    }

    async collectAnimatronicLogs(animatronicId) {
        const animatronic = this.animatronics.animatronics[animatronicId];
        const logs = {};
        
        // Collect system logs using individual credentials
        for (const logType of animatronic.log_types) {
            const journalCmd = `sudo journalctl -${logType === 'system' ? '' : 'u ' + logType} -n 50 --no-pager --since '1 hour ago'`;
            const command = sshCredentials.buildSSHCommand(animatronicId, animatronic.host, journalCmd, { batchMode: false });
            try {
                const { stdout } = await execAsync(command);
                logs[logType] = stdout.split('\n').filter(line => line.trim());
            } catch (error) {
                logs[logType] = { error: error.message };
            }
        }
        
        return logs;
    }

    async removeAnimatronic() {
        const choices = Object.entries(this.animatronics.animatronics).map(([id, config]) => ({
            name: `${config.name} (${config.host})`,
            value: id
        }));

        if (choices.length === 0) {
            console.log('❌ No animatronics to remove.');
            return;
        }

        const { animatronicId } = await inquirer.prompt([{
            type: 'list',
            name: 'animatronicId',
            message: 'Which animatronic would you like to remove?',
            choices
        }]);

        const animatronic = this.animatronics.animatronics[animatronicId];
        
        const confirm = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove ${animatronic.name}?`,
            default: false
        }]);

        if (confirm.confirm) {
            delete this.animatronics.animatronics[animatronicId];
            await this.saveAnimatronics();
            console.log(`✅ ${animatronic.name} removed successfully`);
        }
    }
}

// CLI usage
if (require.main === module) {
    const manager = new AnimatronicManager();

    // Check for command line arguments
    const args = process.argv.slice(2);

    if (args.includes('view')) {
        manager.loadAnimatronics().then(() => {
            manager.viewAnimatronics();
        }).catch(console.error);
    } else {
        manager.run().catch(console.error);
    }
}

module.exports = AnimatronicManager;
