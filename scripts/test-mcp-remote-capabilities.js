#!/usr/bin/env node

/**
 * MonsterBox MCP Remote Capabilities Test
 * 
 * Tests the two new MCP capabilities:
 * 1. Remote Command Execution on animatronic RPI4b systems
 * 2. Comprehensive Log Collection from animatronic RPI4b systems
 * 
 * Only tests Orlok (192.168.8.120) and Coffin (192.168.8.140)
 * Excludes Pumpkinhead (192.168.1.101) as requested
 */

const { spawn } = require('child_process');
const path = require('path');

class MCPRemoteCapabilitiesTest {
    constructor() {
        this.mcpServerPath = path.join(__dirname, '..', 'mcp-servers', 'log-collector-server.js');
        this.testResults = {
            timestamp: new Date().toISOString(),
            tests: {},
            summary: { passed: 0, failed: 0, total: 0 }
        };
    }

    async runAllTests() {
        console.log('🎃 MonsterBox MCP Remote Capabilities Testing\n');
        
        try {
            await this.testRemoteCommandExecution();
            await this.testComprehensiveLogCollection();
            
            this.printSummary();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        }
    }

    async testRemoteCommandExecution() {
        console.log('🔍 Testing Remote Command Execution...\n');
        
        const hosts = [
            { name: 'Orlok', host: '192.168.8.120' },
            { name: 'Coffin', host: '192.168.8.140' }
        ];

        const testCommands = [
            { name: 'system_info', command: 'uname -a', description: 'Get system information' },
            { name: 'disk_usage', command: 'df -h', description: 'Check disk usage' },
            { name: 'memory_info', command: 'free -h', description: 'Check memory usage' },
            { name: 'process_list', command: 'ps aux | head -10', description: 'List running processes' }
        ];

        for (const hostInfo of hosts) {
            console.log(`   🤖 Testing ${hostInfo.name} (${hostInfo.host})...`);
            
            for (const testCmd of testCommands) {
                try {
                    const result = await this.callMCPTool('execute_remote_command', {
                        host: hostInfo.host,
                        command: testCmd.command,
                        timeout: 15
                    });

                    if (result.success) {
                        this.recordTest(`${hostInfo.name.toLowerCase()}_${testCmd.name}`, true, `${testCmd.description} successful`);
                        console.log(`      ✅ ${testCmd.description} - Success`);
                    } else {
                        this.recordTest(`${hostInfo.name.toLowerCase()}_${testCmd.name}`, false, `${testCmd.description} failed`);
                        console.log(`      ❌ ${testCmd.description} - Failed`);
                    }
                } catch (error) {
                    this.recordTest(`${hostInfo.name.toLowerCase()}_${testCmd.name}`, false, `Error: ${error.message}`);
                    console.log(`      ❌ ${testCmd.description} - Error: ${error.message}`);
                }
            }
            console.log('');
        }
    }

    async testComprehensiveLogCollection() {
        console.log('🔍 Testing Comprehensive Log Collection...\n');
        
        const hosts = [
            { name: 'Orlok', host: '192.168.8.120' },
            { name: 'Coffin', host: '192.168.8.140' }
        ];

        const logTests = [
            { name: 'application_logs', logTypes: ['application'], description: 'MonsterBox application logs' },
            { name: 'system_logs', logTypes: ['system'], description: 'System logs' },
            { name: 'error_logs', logTypes: ['error'], description: 'Error logs' },
            { name: 'service_logs', logTypes: ['service'], description: 'Service logs' },
            { name: 'comprehensive_logs', logTypes: ['all'], description: 'All log types' }
        ];

        for (const hostInfo of hosts) {
            console.log(`   🤖 Testing ${hostInfo.name} (${hostInfo.host})...`);
            
            for (const logTest of logTests) {
                try {
                    const result = await this.callMCPTool('collect_comprehensive_rpi_logs', {
                        host: hostInfo.host,
                        logTypes: logTest.logTypes,
                        lines: 50,
                        since: '30 minutes ago'
                    });

                    if (result.success) {
                        this.recordTest(`${hostInfo.name.toLowerCase()}_${logTest.name}`, true, `${logTest.description} collection successful`);
                        console.log(`      ✅ ${logTest.description} - Success`);
                    } else {
                        this.recordTest(`${hostInfo.name.toLowerCase()}_${logTest.name}`, false, `${logTest.description} collection failed`);
                        console.log(`      ❌ ${logTest.description} - Failed`);
                    }
                } catch (error) {
                    this.recordTest(`${hostInfo.name.toLowerCase()}_${logTest.name}`, false, `Error: ${error.message}`);
                    console.log(`      ❌ ${logTest.description} - Error: ${error.message}`);
                }
            }
            console.log('');
        }
    }

    async callMCPTool(toolName, args) {
        return new Promise((resolve, reject) => {
            const mcpProcess = spawn('node', [this.mcpServerPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            mcpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            mcpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            mcpProcess.on('close', (code) => {
                if (code === 0 && output.includes('success')) {
                    resolve({ success: true, output });
                } else {
                    resolve({ success: false, output, error: errorOutput });
                }
            });

            mcpProcess.on('error', (error) => {
                reject(error);
            });

            // Send MCP request
            const request = {
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args
                }
            };

            mcpProcess.stdin.write(JSON.stringify(request) + '\n');
            mcpProcess.stdin.end();

            // Timeout after 30 seconds
            setTimeout(() => {
                mcpProcess.kill();
                reject(new Error('MCP call timeout'));
            }, 30000);
        });
    }

    recordTest(name, passed, message) {
        this.testResults.tests[name] = {
            passed,
            message,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.summary.total++;
        if (passed) {
            this.testResults.summary.passed++;
        } else {
            this.testResults.summary.failed++;
        }
    }

    printSummary() {
        console.log('\n📊 MCP Remote Capabilities Test Summary');
        console.log('=========================================');
        console.log(`✅ Passed: ${this.testResults.summary.passed}`);
        console.log(`❌ Failed: ${this.testResults.summary.failed}`);
        console.log(`📋 Total:  ${this.testResults.summary.total}`);
        
        const successRate = Math.round((this.testResults.summary.passed / this.testResults.summary.total) * 100);
        console.log(`📈 Success Rate: ${successRate}%`);

        if (this.testResults.summary.failed > 0) {
            console.log('\n❌ Failed Tests:');
            Object.entries(this.testResults.tests).forEach(([name, result]) => {
                if (!result.passed) {
                    console.log(`   • ${name}: ${result.message}`);
                }
            });
        }

        console.log('\n🎃 MCP Remote Capabilities Status:');
        if (successRate >= 80) {
            console.log('✅ Remote command execution and log collection are ready for use!');
        } else if (successRate >= 60) {
            console.log('⚠️  Some capabilities are working - check failed tests for issues');
        } else {
            console.log('❌ Remote capabilities need attention before they\'re ready');
        }

        console.log('\n📝 Available MCP Tools:');
        console.log('   • execute_remote_command - Execute shell commands on Orlok/Coffin');
        console.log('   • collect_comprehensive_rpi_logs - Collect all log types from RPIs');
        console.log('   • collect_rpi_console_logs - Basic RPI console logs');
        console.log('   • collect_ubuntu_system_logs - Ubuntu system logs');
        console.log('   • collect_monsterbox_logs - Local MonsterBox application logs');
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new MCPRemoteCapabilitiesTest();
    tester.runAllTests().catch(console.error);
}

module.exports = MCPRemoteCapabilitiesTest;
