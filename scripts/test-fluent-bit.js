#!/usr/bin/env node

/**
 * MonsterBox Fluent Bit Testing Script
 * 
 * Tests the Fluent Bit log collection setup
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sshCredentials = require('./ssh-credentials');

class FluentBitTester {
    constructor() {
        this.configPath = path.join(process.cwd(), 'data', 'fluent-bit-config.json');
        this.logDir = path.join(process.cwd(), 'log', 'aggregated');
        this.results = {
            timestamp: new Date().toISOString(),
            tests: {},
            summary: { passed: 0, failed: 0, total: 0 }
        };
    }

    async run() {
        console.log('🧪 MonsterBox Fluent Bit Testing\n');
        
        try {
            // Load configuration
            const config = await this.loadConfig();
            console.log('✅ Fluent Bit configuration loaded');
            
            // Test local log directories
            await this.testLocalDirectories();
            
            // Test Fluent Bit status on each RPI
            await this.testFluentBitStatus(config);
            
            // Test log file generation
            await this.testLogGeneration(config);
            
            // Test log collection
            await this.testLogCollection(config);
            
            // Generate test report
            await this.generateTestReport();
            
            console.log('\n✅ All Fluent Bit tests completed!');
            
        } catch (error) {
            console.error('❌ Fluent Bit testing failed:', error.message);
            process.exit(1);
        }
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            throw new Error(`Failed to load Fluent Bit config: ${error.message}`);
        }
    }

    async testLocalDirectories() {
        console.log('🔍 Testing local log directories...');

        try {
            const stats = await fs.stat(this.logDir);
            if (stats.isDirectory()) {
                this.recordTest('local_log_directory', true, 'Log directory exists');
                console.log('   ✅ Local log directory exists');
            } else {
                this.recordTest('local_log_directory', false, 'Log directory is not a directory');
                console.log('   ❌ Log directory is not a directory');
            }
        } catch (error) {
            this.recordTest('local_log_directory', false, 'Log directory does not exist');
            console.log('   ❌ Log directory does not exist');
        }

        // Test write permissions
        try {
            const testFile = path.join(this.logDir, 'test-write.tmp');
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            
            this.recordTest('log_directory_writable', true, 'Log directory is writable');
            console.log('   ✅ Log directory is writable');
        } catch (error) {
            this.recordTest('log_directory_writable', false, 'Log directory is not writable');
            console.log('   ❌ Log directory is not writable');
        }
    }

    async testFluentBitStatus(config) {
        console.log('🔍 Testing Fluent Bit status on RPI systems...');

        for (const system of config.systems.filter(s => s.enabled)) {
            console.log(`\n   🤖 Testing ${system.name} (${system.host})...`);

            try {
                // Test connectivity
                await execAsync(`ping -n 1 -w 1000 ${system.host}`);
                this.recordTest(`ping_${system.id}`, true, `${system.name} is reachable`);
                console.log(`      ✅ ${system.name} is reachable`);

                // Test Fluent Bit service status
                const statusCommand = sshCredentials.buildSSHCommand(
                    system.id, 
                    system.host, 
                    'sudo systemctl is-active fluent-bit'
                );
                
                try {
                    const { stdout } = await execAsync(statusCommand);
                    if (stdout.trim() === 'active') {
                        this.recordTest(`fluent_bit_${system.id}`, true, `Fluent Bit is running on ${system.name}`);
                        console.log(`      ✅ Fluent Bit service is active`);
                    } else {
                        this.recordTest(`fluent_bit_${system.id}`, false, `Fluent Bit is not active: ${stdout.trim()}`);
                        console.log(`      ❌ Fluent Bit service is not active: ${stdout.trim()}`);
                    }
                } catch (error) {
                    this.recordTest(`fluent_bit_${system.id}`, false, `Failed to check Fluent Bit status: ${error.message}`);
                    console.log(`      ❌ Failed to check Fluent Bit status: ${error.message}`);
                }

                // Test Fluent Bit HTTP endpoint
                try {
                    const httpCommand = sshCredentials.buildSSHCommand(
                        system.id,
                        system.host,
                        'curl -s http://localhost:2020/api/v1/health'
                    );
                    
                    const { stdout } = await execAsync(httpCommand);
                    if (stdout.includes('ok') || stdout.includes('healthy')) {
                        this.recordTest(`fluent_bit_http_${system.id}`, true, `Fluent Bit HTTP API is responding`);
                        console.log(`      ✅ Fluent Bit HTTP API is responding`);
                    } else {
                        this.recordTest(`fluent_bit_http_${system.id}`, false, `Fluent Bit HTTP API not responding properly`);
                        console.log(`      ❌ Fluent Bit HTTP API not responding properly`);
                    }
                } catch (error) {
                    this.recordTest(`fluent_bit_http_${system.id}`, false, `Fluent Bit HTTP API test failed: ${error.message}`);
                    console.log(`      ⚠️  Fluent Bit HTTP API test failed (may not be critical)`);
                }

            } catch (error) {
                this.recordTest(`connectivity_${system.id}`, false, `${system.name} is not reachable: ${error.message}`);
                console.log(`      ❌ ${system.name} is not reachable: ${error.message}`);
            }
        }
    }

    async testLogGeneration(config) {
        console.log('\n🔍 Testing log file generation...');

        for (const system of config.systems.filter(s => s.enabled)) {
            console.log(`\n   📝 Testing log generation on ${system.name}...`);

            try {
                // Generate test log entry
                const testLogCommand = sshCredentials.buildSSHCommand(
                    system.id,
                    system.host,
                    'echo "$(date): MonsterBox Fluent Bit test log entry" | sudo tee -a /var/log/monsterbox/test.log'
                );

                await execAsync(testLogCommand);
                console.log(`      ✅ Test log entry created on ${system.name}`);

                // Wait a moment for Fluent Bit to process
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Check if log files are being created
                const checkLogsCommand = sshCredentials.buildSSHCommand(
                    system.id,
                    system.host,
                    'ls -la /var/log/monsterbox/aggregated/'
                );

                try {
                    const { stdout } = await execAsync(checkLogsCommand);
                    if (stdout.includes(`${system.id}-`)) {
                        this.recordTest(`log_files_${system.id}`, true, `Log files are being generated on ${system.name}`);
                        console.log(`      ✅ Log files are being generated`);
                    } else {
                        this.recordTest(`log_files_${system.id}`, false, `No log files found on ${system.name}`);
                        console.log(`      ❌ No log files found`);
                    }
                } catch (error) {
                    this.recordTest(`log_files_${system.id}`, false, `Failed to check log files: ${error.message}`);
                    console.log(`      ❌ Failed to check log files: ${error.message}`);
                }

            } catch (error) {
                this.recordTest(`log_generation_${system.id}`, false, `Failed to generate test logs: ${error.message}`);
                console.log(`      ❌ Failed to generate test logs: ${error.message}`);
            }
        }
    }

    async testLogCollection(config) {
        console.log('\n🔍 Testing log collection from RPI systems...');

        for (const system of config.systems.filter(s => s.enabled)) {
            console.log(`\n   📥 Testing log collection from ${system.name}...`);

            try {
                // Copy log files from RPI to local system
                const remoteLogPath = '/var/log/monsterbox/aggregated/';
                const localSystemLogDir = path.join(this.logDir, system.id);
                
                // Ensure local directory exists
                await fs.mkdir(localSystemLogDir, { recursive: true });

                // Use SCP to copy log files
                const scpCommand = sshCredentials.buildSCPCommand(
                    system.id,
                    system.host,
                    `${remoteLogPath}${system.id}-*.jsonl`,
                    localSystemLogDir,
                    { recursive: false }
                );

                try {
                    await execAsync(scpCommand);
                    
                    // Check if files were copied
                    const files = await fs.readdir(localSystemLogDir);
                    const logFiles = files.filter(f => f.endsWith('.jsonl'));
                    
                    if (logFiles.length > 0) {
                        this.recordTest(`log_collection_${system.id}`, true, `Collected ${logFiles.length} log files from ${system.name}`);
                        console.log(`      ✅ Collected ${logFiles.length} log files`);
                    } else {
                        this.recordTest(`log_collection_${system.id}`, false, `No log files collected from ${system.name}`);
                        console.log(`      ❌ No log files collected`);
                    }
                } catch (error) {
                    this.recordTest(`log_collection_${system.id}`, false, `SCP failed: ${error.message}`);
                    console.log(`      ❌ Log collection failed: ${error.message}`);
                }

            } catch (error) {
                this.recordTest(`log_collection_setup_${system.id}`, false, `Log collection setup failed: ${error.message}`);
                console.log(`      ❌ Log collection setup failed: ${error.message}`);
            }
        }
    }

    recordTest(name, passed, message) {
        this.results.tests[name] = {
            passed,
            message,
            timestamp: new Date().toISOString()
        };
        
        this.results.summary.total++;
        if (passed) {
            this.results.summary.passed++;
        } else {
            this.results.summary.failed++;
        }
    }

    async generateTestReport() {
        console.log('\n📊 Test Summary');
        console.log('================');
        console.log(`✅ Passed: ${this.results.summary.passed}`);
        console.log(`❌ Failed: ${this.results.summary.failed}`);
        console.log(`📋 Total:  ${this.results.summary.total}`);
        
        const successRate = Math.round((this.results.summary.passed / this.results.summary.total) * 100);
        console.log(`📈 Success Rate: ${successRate}%`);

        if (this.results.summary.failed > 0) {
            console.log('\n❌ Failed Tests:');
            Object.entries(this.results.tests).forEach(([name, result]) => {
                if (!result.passed) {
                    console.log(`   • ${name}: ${result.message}`);
                }
            });
        }

        console.log('\n🎃 Fluent Bit Status:');
        if (successRate >= 80) {
            console.log('✅ Fluent Bit log collection is working well!');
        } else if (successRate >= 60) {
            console.log('⚠️  Fluent Bit setup is partially working - some issues need attention');
        } else {
            console.log('❌ Fluent Bit setup needs significant work before it\'s ready');
        }

        // Save results
        await this.saveResults();
    }

    async saveResults() {
        try {
            const logDir = path.join(process.cwd(), 'log');
            await fs.mkdir(logDir, { recursive: true });
            
            const filename = `fluent-bit-test-${new Date().toISOString().split('T')[0]}.json`;
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
    const tester = new FluentBitTester();
    tester.run().catch(console.error);
}

module.exports = FluentBitTester;
