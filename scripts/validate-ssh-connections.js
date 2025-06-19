#!/usr/bin/env node

/**
 * MonsterBox SSH Connection Validator
 * 
 * Tests SSH connections to all configured animatronic characters
 * and provides detailed diagnostics for troubleshooting.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// Load environment variables
require('dotenv').config();

class SSHConnectionValidator {
    constructor() {
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.results = [];
    }

    async loadCharacters() {
        try {
            const data = await fs.readFile(this.charactersPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('❌ Could not load characters.json:', error.message);
            return [];
        }
    }

    async validateAllConnections() {
        console.log('🔍 MonsterBox SSH Connection Validator');
        console.log('=====================================\n');

        const characters = await this.loadCharacters();
        const animatronicCharacters = characters.filter(char => 
            char.animatronic && 
            char.animatronic.enabled && 
            char.animatronic.rpi_config &&
            char.animatronic.rpi_config.host
        );

        if (animatronicCharacters.length === 0) {
            console.log('⚠️  No animatronic characters found with SSH configuration');
            return;
        }

        console.log(`Found ${animatronicCharacters.length} animatronic characters to test:\n`);

        for (const character of animatronicCharacters) {
            await this.validateCharacterConnection(character);
        }

        this.printSummary();
    }

    async validateCharacterConnection(character) {
        const result = {
            character: character.char_name,
            id: character.id,
            host: character.animatronic.rpi_config.host,
            user: character.animatronic.rpi_config.user || 'remote',
            tests: {
                ping: { passed: false, message: '', duration: 0 },
                ssh: { passed: false, message: '', duration: 0 },
                environment: { passed: false, message: '' }
            }
        };

        console.log(`🎭 Testing ${character.char_name} (${result.host})`);
        console.log('─'.repeat(50));

        // Test 1: Environment Variables
        await this.testEnvironmentVariables(character, result);

        // Test 2: Network Connectivity (Ping)
        await this.testPingConnectivity(result);

        // Test 3: SSH Connection
        if (result.tests.ping.passed) {
            await this.testSSHConnection(result);
        } else {
            console.log('⏭️  Skipping SSH test due to ping failure');
        }

        this.results.push(result);
        console.log('');
    }

    async testEnvironmentVariables(character, result) {
        console.log('🔧 Testing environment variables...');
        
        const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
        const userVar = `${characterKey.toUpperCase()}_SSH_USER`;
        const passwordVar = `${characterKey.toUpperCase()}_SSH_PASSWORD`;

        const user = process.env[userVar];
        const password = process.env[passwordVar];
        const fallbackUser = process.env.RPI_SSH_USER;
        const fallbackPassword = process.env.RPI_SSH_PASSWORD;

        if (user && password) {
            result.tests.environment.passed = true;
            result.tests.environment.message = `✅ Specific credentials found (${userVar}, ${passwordVar})`;
        } else if (fallbackUser && fallbackPassword) {
            result.tests.environment.passed = true;
            result.tests.environment.message = `⚠️  Using fallback credentials (RPI_SSH_USER, RPI_SSH_PASSWORD)`;
        } else {
            result.tests.environment.message = `❌ No credentials found. Missing: ${userVar}, ${passwordVar}`;
        }

        console.log(`   ${result.tests.environment.message}`);
    }

    async testPingConnectivity(result) {
        console.log('🌐 Testing network connectivity...');
        const pingStart = Date.now();

        try {
            const pingCommand = process.platform === 'win32'
                ? `ping -n 1 -w 3000 ${result.host}`
                : `ping -c 1 -W 3 ${result.host}`;
            
            await execAsync(pingCommand);
            result.tests.ping.passed = true;
            result.tests.ping.message = '✅ Host is reachable';
            result.tests.ping.duration = Date.now() - pingStart;
        } catch (error) {
            result.tests.ping.message = '❌ Host is not reachable';
            result.tests.ping.duration = Date.now() - pingStart;
        }

        console.log(`   ${result.tests.ping.message} (${result.tests.ping.duration}ms)`);
    }

    async testSSHConnection(result) {
        console.log('🔐 Testing SSH connection...');
        const sshStart = Date.now();

        try {
            // Build SSH command using the same logic as the application
            const sshCredentials = require('./ssh-credentials');
            const characterKey = result.character.toLowerCase().replace(/\s+/g, '');
            const sshCommand = sshCredentials.buildSSHCommand(characterKey, result.host, "echo 'SSH test successful'");
            
            const { stdout } = await execAsync(sshCommand);
            
            if (stdout.includes('SSH test successful')) {
                result.tests.ssh.passed = true;
                result.tests.ssh.message = '✅ SSH connection successful';
            } else {
                result.tests.ssh.message = '❌ SSH test command failed';
            }
            result.tests.ssh.duration = Date.now() - sshStart;
        } catch (error) {
            result.tests.ssh.message = `❌ SSH connection failed: ${error.message.split('\n')[0]}`;
            result.tests.ssh.duration = Date.now() - sshStart;
        }

        console.log(`   ${result.tests.ssh.message} (${result.tests.ssh.duration}ms)`);
    }

    printSummary() {
        console.log('📊 VALIDATION SUMMARY');
        console.log('====================\n');

        const totalCharacters = this.results.length;
        const workingConnections = this.results.filter(r => r.tests.ssh.passed).length;
        const networkIssues = this.results.filter(r => !r.tests.ping.passed).length;
        const sshIssues = this.results.filter(r => r.tests.ping.passed && !r.tests.ssh.passed).length;
        const envIssues = this.results.filter(r => !r.tests.environment.passed).length;

        console.log(`Total Characters: ${totalCharacters}`);
        console.log(`Working SSH Connections: ${workingConnections}/${totalCharacters}`);
        console.log(`Network Issues: ${networkIssues}`);
        console.log(`SSH Authentication Issues: ${sshIssues}`);
        console.log(`Environment Variable Issues: ${envIssues}\n`);

        if (workingConnections === totalCharacters) {
            console.log('🎉 All SSH connections are working correctly!');
        } else {
            console.log('⚠️  Some connections need attention:\n');

            this.results.forEach(result => {
                if (!result.tests.ssh.passed) {
                    console.log(`❌ ${result.character} (${result.host}):`);
                    if (!result.tests.environment.passed) {
                        console.log(`   - Environment: ${result.tests.environment.message}`);
                    }
                    if (!result.tests.ping.passed) {
                        console.log(`   - Network: ${result.tests.ping.message}`);
                    }
                    if (result.tests.ping.passed && !result.tests.ssh.passed) {
                        console.log(`   - SSH: ${result.tests.ssh.message}`);
                    }
                    console.log('');
                }
            });

            console.log('📖 For troubleshooting help, see: docs/ssh-troubleshooting-guide.md');
        }
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new SSHConnectionValidator();
    validator.validateAllConnections().catch(error => {
        console.error('❌ Validation failed:', error.message);
        process.exit(1);
    });
}

module.exports = SSHConnectionValidator;
