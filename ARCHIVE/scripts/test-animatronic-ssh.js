#!/usr/bin/env node

/**
 * MonsterBox Animatronic SSH Connectivity Test
 * 
 * Tests SSH connectivity and log collection for all animatronic RPIs:
 * - Orlok (192.168.1.100)
 * - Pumpkinhead (192.168.1.101)
 * - Coffin (192.168.1.102)
 * 
 * Uses environment variables for secure credential management.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const sshCredentials = require('./ssh-credentials');
const ConfigAdapter = require('./config-adapter');

// Load environment variables with override to ensure fresh values
require('dotenv').config({ override: true });

class AnimatronicSSHTester {
    constructor() {
        this.credentialsValidation = sshCredentials.validateCredentials();
        this.configAdapter = new ConfigAdapter();
        this.results = {
            timestamp: new Date().toISOString(),
            credentials: {
                validation: this.credentialsValidation,
                allCredentials: sshCredentials.getAllCredentials()
            },
            animatronics: {},
            summary: {
                total: 0,
                reachable: 0,
                sshWorking: 0,
                logsWorking: 0
            }
        };
    }

    async runTests() {
        console.log('🎃 MonsterBox Animatronic SSH Connectivity Test\n');

        // Check environment variables
        if (!this.credentialsValidation.valid) {
            console.log('❌ SSH credentials not properly configured');
            console.log(sshCredentials.getSetupInstructions());
            return;
        }

        console.log('✅ SSH credentials configured for individual animatronics');
        if (this.credentialsValidation.configured.length > 0) {
            console.log(`   Specific credentials: ${this.credentialsValidation.configured.join(', ')}`);
        }
        if (this.credentialsValidation.missing.length > 0) {
            console.log(`   Using fallback for: ${this.credentialsValidation.missing.join(', ')}`);
        }
        console.log('');

        try {
            // Load animatronic configuration from unified character config
            const config = await this.configAdapter.getEnabledAnimatronics();

            // Filter and test only enabled animatronics
            const enabledAnimatronics = Object.entries(config.animatronics)
                .filter(([id, animatronic]) => animatronic.enabled !== false);

            const disabledCount = Object.keys(config.animatronics).length - enabledAnimatronics.length;

            console.log(`📊 Animatronic Status:`);
            console.log(`   Total: ${Object.keys(config.animatronics).length}`);
            console.log(`   Enabled: ${enabledAnimatronics.length}`);
            console.log(`   Disabled: ${disabledCount}`);
            console.log('');

            if (enabledAnimatronics.length === 0) {
                console.log('⚠️  No enabled animatronics found for testing');
                return;
            }

            // Test each enabled animatronic
            for (const [id, animatronic] of enabledAnimatronics) {
                console.log(`🔍 Testing enabled animatronic: ${animatronic.name} (${animatronic.status})`);
                await this.testAnimatronic(id, animatronic);
            }

            this.printSummary();
            await this.saveResults();

        } catch (error) {
            console.error('❌ Test failed:', error.message);
            process.exit(1);
        }
    }

    async testAnimatronic(id, animatronic) {
        console.log(`🤖 Testing ${animatronic.name} (${animatronic.host})`);
        
        const result = {
            name: animatronic.name,
            host: animatronic.host,
            user: animatronic.user,
            timestamp: new Date().toISOString(),
            tests: {
                ping: { passed: false, message: '', duration: 0 },
                ssh: { passed: false, message: '', duration: 0 },
                logs: { passed: false, message: '', duration: 0, sampleLogs: '' }
            }
        };

        this.results.summary.total++;

        // Test 1: Ping connectivity
        console.log('   🔍 Testing network connectivity...');
        const pingStart = Date.now();
        
        try {
            await execAsync(`ping -n 1 -w 5000 ${animatronic.host}`);
            result.tests.ping.passed = true;
            result.tests.ping.message = 'Host is reachable';
            result.tests.ping.duration = Date.now() - pingStart;
            this.results.summary.reachable++;
            console.log('      ✅ Network connectivity successful');
        } catch (error) {
            result.tests.ping.message = 'Host is not reachable';
            result.tests.ping.duration = Date.now() - pingStart;
            console.log('      ❌ Network connectivity failed');
            this.results.animatronics[id] = result;
            return; // Skip further tests if ping fails
        }

        // Test 2: SSH connection
        console.log('   🔍 Testing SSH connection...');
        const sshStart = Date.now();

        try {
            const sshCommand = sshCredentials.buildSSHCommand(id, animatronic.host, "echo 'SSH test successful'");
            const { stdout } = await execAsync(sshCommand);
            
            if (stdout.includes('SSH test successful')) {
                result.tests.ssh.passed = true;
                result.tests.ssh.message = 'SSH connection successful';
                result.tests.ssh.duration = Date.now() - sshStart;
                this.results.summary.sshWorking++;
                console.log('      ✅ SSH connection successful');
            } else {
                result.tests.ssh.message = 'SSH test command failed';
                result.tests.ssh.duration = Date.now() - sshStart;
                console.log('      ❌ SSH test command failed');
            }
        } catch (error) {
            result.tests.ssh.message = `SSH connection failed: ${error.message}`;
            result.tests.ssh.duration = Date.now() - sshStart;
            console.log('      ❌ SSH connection failed');
            console.log(`         Error: ${error.message}`);
            
            // Provide setup instructions
            this.printSetupInstructions(animatronic, id);
        }

        // Test 3: Log collection (only if SSH works)
        if (result.tests.ssh.passed) {
            console.log('   🔍 Testing log collection...');
            const logStart = Date.now();
            
            try {
                const logCommand = sshCredentials.buildSSHCommand(id, animatronic.host, "sudo journalctl -n 10 --no-pager", { batchMode: false });
                const { stdout: logResult } = await execAsync(logCommand);
                
                if (logResult.trim()) {
                    result.tests.logs.passed = true;
                    result.tests.logs.message = 'Log collection successful';
                    result.tests.logs.duration = Date.now() - logStart;
                    result.tests.logs.sampleLogs = logResult.split('\n').slice(0, 3).join('\n'); // First 3 lines
                    this.results.summary.logsWorking++;
                    console.log('      ✅ Log collection successful');
                } else {
                    result.tests.logs.message = 'No logs returned';
                    result.tests.logs.duration = Date.now() - logStart;
                    console.log('      ❌ Log collection failed - no logs returned');
                }
            } catch (error) {
                result.tests.logs.message = `Log collection failed: ${error.message}`;
                result.tests.logs.duration = Date.now() - logStart;
                console.log('      ❌ Log collection failed');
                console.log(`         Error: ${error.message}`);
                
                // Provide sudo setup instructions
                const credentials = sshCredentials.getCredentials(id);
                console.log('      🔧 Log access setup required:');
                console.log(`         ssh ${credentials.user}@${animatronic.host}`);
                console.log(`         echo '${credentials.user} ALL=(ALL) NOPASSWD: /bin/journalctl' | sudo tee -a /etc/sudoers.d/monsterbox-logs`);
            }
        }

        this.results.animatronics[id] = result;
        console.log(''); // Empty line for readability
    }

    printSetupInstructions(animatronic, animatronicId) {
        const credentials = sshCredentials.getCredentials(animatronicId);
        console.log('      🔧 SSH Setup Instructions:');
        console.log(`         1. Connect to ${animatronic.name} directly (keyboard/monitor)`);
        console.log(`         2. Create user: sudo useradd -m -s /bin/bash ${credentials.user}`);
        console.log(`         3. Set password: sudo passwd ${credentials.user}`);
        console.log(`         4. Add to sudo group: sudo usermod -aG sudo ${credentials.user}`);
        console.log(`         5. Enable SSH: sudo systemctl enable ssh && sudo systemctl start ssh`);
        console.log(`         6. From this machine: ssh-copy-id ${credentials.user}@${animatronic.host}`);
        console.log(`         7. Test: ssh ${credentials.user}@${animatronic.host}`);
    }

    printSummary() {
        console.log('📊 Test Summary');
        console.log('================');
        console.log(`🎯 Total Animatronics: ${this.results.summary.total}`);
        console.log(`🌐 Network Reachable: ${this.results.summary.reachable}/${this.results.summary.total}`);
        console.log(`🔑 SSH Working: ${this.results.summary.sshWorking}/${this.results.summary.total}`);
        console.log(`📋 Log Collection Working: ${this.results.summary.logsWorking}/${this.results.summary.total}`);

        const successRate = this.results.summary.total > 0
            ? Math.round((this.results.summary.logsWorking / this.results.summary.total) * 100)
            : 0;
        
        console.log(`📈 Overall Success Rate: ${successRate}%`);

        if (successRate === 100) {
            console.log('\n🎉 All animatronics are fully configured and ready!');
        } else if (successRate >= 50) {
            console.log('\n⚠️  Some animatronics need attention - check the setup instructions above');
        } else {
            console.log('\n❌ Most animatronics need configuration - follow the setup instructions');
        }

        // Show detailed results
        console.log('\n📋 Detailed Results:');
        for (const [id, result] of Object.entries(this.results.animatronics)) {
            const status = result.tests.logs.passed ? '✅' : 
                          result.tests.ssh.passed ? '⚠️' : 
                          result.tests.ping.passed ? '🔧' : '❌';
            console.log(`   ${status} ${result.name} (${result.host})`);
            
            if (!result.tests.logs.passed) {
                if (!result.tests.ping.passed) {
                    console.log(`      - Network: ${result.tests.ping.message}`);
                } else if (!result.tests.ssh.passed) {
                    console.log(`      - SSH: ${result.tests.ssh.message}`);
                } else {
                    console.log(`      - Logs: ${result.tests.logs.message}`);
                }
            }
        }
    }

    async saveResults() {
        try {
            const logDir = path.join(process.cwd(), 'log');
            await fs.mkdir(logDir, { recursive: true });
            
            const filename = `animatronic-ssh-test-${new Date().toISOString().split('T')[0]}.json`;
            const filepath = path.join(logDir, filename);
            
            await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
            console.log(`\n📄 Test results saved to: ${filename}`);
            
        } catch (error) {
            console.error('Failed to save test results:', error.message);
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new AnimatronicSSHTester();
    tester.runTests().catch(console.error);
}

module.exports = AnimatronicSSHTester;
