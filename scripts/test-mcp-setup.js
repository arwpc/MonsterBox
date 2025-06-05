#!/usr/bin/env node

/**
 * MonsterBox MCP Setup Test Script
 * 
 * Tests the complete MCP log collection setup including:
 * - MCP server connectivity
 * - Log collection endpoints
 * - Browser log collection
 * - GitHub API integration
 * - System log access
 */

const axios = require('axios');
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sshCredentials = require('./ssh-credentials');
const ConfigAdapter = require('./config-adapter');

// Load environment variables
require('dotenv').config();

class MCPSetupTester {
    constructor() {
        this.baseURL = 'http://localhost:3000';
        this.configAdapter = new ConfigAdapter();
        this.results = {
            timestamp: new Date().toISOString(),
            tests: {},
            summary: {
                passed: 0,
                failed: 0,
                total: 0
            }
        };
    }

    async runAllTests() {
        console.log('🎃 MonsterBox MCP Setup Testing\n');
        
        try {
            await this.testServerHealth();
            await this.testLogEndpoints();
            await this.testBrowserLogCollection();
            await this.testGitHubLogCollection();
            await this.testSystemLogAccess();
            await this.testAnimatronicSSHConnectivity();
            await this.testMCPServerFiles();
            
            this.printSummary();
            
        } catch (error) {
            console.error('❌ Test suite failed:', error.message);
            process.exit(1);
        }
    }

    async testServerHealth() {
        console.log('🔍 Testing server health...');
        
        try {
            const response = await axios.get(`${this.baseURL}/health`);
            
            if (response.status === 200) {
                this.recordTest('server_health', true, 'Server is healthy');
                console.log('   ✅ Server health check passed');
            } else {
                this.recordTest('server_health', false, `Unexpected status: ${response.status}`);
            }
            
        } catch (error) {
            this.recordTest('server_health', false, `Server not responding: ${error.message}`);
            console.log('   ❌ Server health check failed');
        }
    }

    async testLogEndpoints() {
        console.log('🔍 Testing log collection endpoints...');
        
        const endpoints = [
            '/logs',
            '/logs/system',
            '/logs/application',
            '/health/api-keys'
        ];

        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(`${this.baseURL}${endpoint}`);
                
                if (response.status === 200) {
                    this.recordTest(`endpoint_${endpoint.replace(/\//g, '_')}`, true, 'Endpoint accessible');
                    console.log(`   ✅ ${endpoint} - accessible`);
                } else {
                    this.recordTest(`endpoint_${endpoint.replace(/\//g, '_')}`, false, `Status: ${response.status}`);
                    console.log(`   ❌ ${endpoint} - failed`);
                }
                
            } catch (error) {
                this.recordTest(`endpoint_${endpoint.replace(/\//g, '_')}`, false, error.message);
                console.log(`   ❌ ${endpoint} - error: ${error.message}`);
            }
        }
    }

    async testBrowserLogCollection() {
        console.log('🔍 Testing browser log collection...');
        
        try {
            // Test browser log endpoint with sample data
            const sampleLogs = [
                {
                    type: 'console',
                    level: 'info',
                    message: 'MCP test log entry',
                    timestamp: new Date().toISOString(),
                    url: 'http://localhost:3000/test'
                }
            ];

            const response = await axios.post(`${this.baseURL}/logs/browser`, {
                logs: sampleLogs,
                session: {
                    sessionId: 'test-session-' + Date.now()
                },
                timestamp: new Date().toISOString()
            });

            if (response.status === 200 && response.data.success) {
                this.recordTest('browser_log_collection', true, 'Browser logs accepted');
                console.log('   ✅ Browser log collection working');
            } else {
                this.recordTest('browser_log_collection', false, 'Unexpected response');
                console.log('   ❌ Browser log collection failed');
            }
            
        } catch (error) {
            this.recordTest('browser_log_collection', false, error.message);
            console.log('   ❌ Browser log collection error:', error.message);
        }
    }

    async testGitHubLogCollection() {
        console.log('🔍 Testing GitHub log collection...');
        
        try {
            const GitHubLogCollector = require('./github-log-collector');
            const collector = new GitHubLogCollector();
            
            // Test rate limit check (doesn't require token)
            const rateLimit = await collector.checkRateLimit();
            
            if (rateLimit) {
                this.recordTest('github_api_access', true, `Rate limit: ${rateLimit.remaining}/${rateLimit.limit}`);
                console.log(`   ✅ GitHub API accessible (${rateLimit.remaining}/${rateLimit.limit} requests remaining)`);
            } else {
                this.recordTest('github_api_access', false, 'Rate limit check failed');
                console.log('   ❌ GitHub API access failed');
            }

            // Test repository info
            const repoInfo = await collector.getRepositoryInfo();
            
            if (repoInfo) {
                this.recordTest('github_repo_access', true, `Repository: ${repoInfo.full_name}`);
                console.log(`   ✅ Repository accessible: ${repoInfo.full_name}`);
            } else {
                this.recordTest('github_repo_access', false, 'Repository info failed');
                console.log('   ❌ Repository access failed');
            }
            
        } catch (error) {
            this.recordTest('github_log_collection', false, error.message);
            console.log('   ❌ GitHub log collection error:', error.message);
        }
    }

    async testSystemLogAccess() {
        console.log('🔍 Testing system log access...');

        try {
            // Test if we can access local logs
            const logDir = path.join(process.cwd(), 'log');
            const files = await fs.readdir(logDir);

            if (files.length > 0) {
                this.recordTest('local_log_access', true, `Found ${files.length} log files`);
                console.log(`   ✅ Local logs accessible (${files.length} files)`);
            } else {
                this.recordTest('local_log_access', false, 'No log files found');
                console.log('   ⚠️  No log files found');
            }

            // Test system log commands (basic check)
            try {
                await execAsync('echo "test" > nul'); // Windows equivalent of /dev/null

                this.recordTest('system_command_access', true, 'System commands accessible');
                console.log('   ✅ System commands accessible');

            } catch (error) {
                this.recordTest('system_command_access', false, 'System commands failed');
                console.log('   ❌ System commands failed');
            }

        } catch (error) {
            this.recordTest('system_log_access', false, error.message);
            console.log('   ❌ System log access error:', error.message);
        }
    }

    async testAnimatronicSSHConnectivity() {
        console.log('🔍 Testing animatronic SSH connectivity...');

        try {
            // Load animatronic configuration from unified character config
            const config = await this.configAdapter.getEnabledAnimatronics();

            const credentialsValidation = sshCredentials.validateCredentials();

            // Test environment variables
            if (!credentialsValidation.valid) {
                this.recordTest('ssh_env_vars', false, 'SSH credentials not properly configured');
                console.log('   ❌ SSH environment variables not properly configured');
                console.log('   ' + sshCredentials.getSetupInstructions().split('\n')[0]);
                return;
            } else {
                this.recordTest('ssh_env_vars', true, 'SSH credentials configured for individual animatronics');
                console.log('   ✅ SSH environment variables configured for individual animatronics');
                if (credentialsValidation.configured.length > 0) {
                    console.log(`      Specific credentials: ${credentialsValidation.configured.join(', ')}`);
                }
                if (credentialsValidation.missing.length > 0) {
                    console.log(`      Using fallback for: ${credentialsValidation.missing.join(', ')}`);
                }
            }

            // Filter and test only enabled animatronics
            const enabledAnimatronics = Object.entries(config.animatronics)
                .filter(([id, animatronic]) => animatronic.enabled !== false);

            const disabledCount = Object.keys(config.animatronics).length - enabledAnimatronics.length;

            console.log(`\n   📊 Animatronic Status:`);
            console.log(`      Total: ${Object.keys(config.animatronics).length}`);
            console.log(`      Enabled: ${enabledAnimatronics.length}`);
            console.log(`      Disabled: ${disabledCount}`);

            if (enabledAnimatronics.length === 0) {
                console.log('   ⚠️  No enabled animatronics found for testing');
                return;
            }

            // Test each enabled animatronic
            for (const [id, animatronic] of enabledAnimatronics) {
                console.log(`\n   🤖 Testing ${animatronic.name} (${animatronic.host})...`);

                try {
                    // Test basic connectivity (ping)
                    try {
                        await execAsync(`ping -n 1 -w 1000 ${animatronic.host}`);
                        this.recordTest(`ping_${id}`, true, `${animatronic.name} is reachable`);
                        console.log(`      ✅ ${animatronic.name} is reachable`);
                    } catch (error) {
                        this.recordTest(`ping_${id}`, false, `${animatronic.name} is not reachable`);
                        console.log(`      ❌ ${animatronic.name} is not reachable`);
                        continue; // Skip SSH test if ping fails
                    }

                    // Test SSH connection using individual credentials
                    const sshCommand = sshCredentials.buildSSHCommand(id, animatronic.host, "echo 'SSH test successful'");

                    try {
                        const { stdout } = await execAsync(sshCommand);

                        if (stdout.includes('SSH test successful')) {
                            this.recordTest(`ssh_${id}`, true, `SSH connection to ${animatronic.name} successful`);
                            console.log(`      ✅ SSH connection successful`);

                            // Test log collection
                            try {
                                const logCommand = sshCredentials.buildSSHCommand(id, animatronic.host, "sudo journalctl -n 5 --no-pager", { batchMode: false });
                                const { stdout: logResult } = await execAsync(logCommand);

                                if (logResult.trim()) {
                                    this.recordTest(`logs_${id}`, true, `Log collection from ${animatronic.name} successful`);
                                    console.log(`      ✅ Log collection successful`);
                                } else {
                                    this.recordTest(`logs_${id}`, false, `Log collection from ${animatronic.name} failed`);
                                    console.log(`      ❌ Log collection failed`);
                                }
                            } catch (logError) {
                                this.recordTest(`logs_${id}`, false, `Log collection error: ${logError.message}`);
                                console.log(`      ❌ Log collection error: ${logError.message}`);
                            }

                        } else {
                            this.recordTest(`ssh_${id}`, false, `SSH test command failed for ${animatronic.name}`);
                            console.log(`      ❌ SSH test command failed`);
                        }

                    } catch (sshError) {
                        this.recordTest(`ssh_${id}`, false, `SSH connection failed: ${sshError.message}`);
                        console.log(`      ❌ SSH connection failed: ${sshError.message}`);

                        // Provide setup instructions
                        const credentials = sshCredentials.getCredentials(id);
                        console.log(`      🔧 Setup instructions for ${animatronic.name}:`);
                        console.log(`         1. Ensure SSH is enabled on the RPI`);
                        console.log(`         2. Create user: sudo useradd -m -s /bin/bash ${credentials.user}`);
                        console.log(`         3. Set password: sudo passwd ${credentials.user}`);
                        console.log(`         4. Add to sudo group: sudo usermod -aG sudo ${credentials.user}`);
                        console.log(`         5. Setup SSH keys: ssh-copy-id ${credentials.user}@${animatronic.host}`);
                        console.log(`         6. Configure sudo access for journalctl`);
                    }

                } catch (error) {
                    this.recordTest(`animatronic_${id}`, false, `General error testing ${animatronic.name}: ${error.message}`);
                    console.log(`      ❌ Error testing ${animatronic.name}: ${error.message}`);
                }
            }

        } catch (error) {
            this.recordTest('animatronic_ssh_connectivity', false, error.message);
            console.log('   ❌ Animatronic SSH connectivity test error:', error.message);
        }
    }

    async testMCPServerFiles() {
        console.log('🔍 Testing MCP server files...');
        
        const files = [
            'mcp-servers/log-collector-server.js',
            '.cursor/mcp.json',
            'public/js/log-collector.js'
        ];

        for (const file of files) {
            try {
                await fs.access(path.join(process.cwd(), file));
                this.recordTest(`file_${file.replace(/[\/\.]/g, '_')}`, true, 'File exists');
                console.log(`   ✅ ${file} - exists`);
                
            } catch (error) {
                this.recordTest(`file_${file.replace(/[\/\.]/g, '_')}`, false, 'File missing');
                console.log(`   ❌ ${file} - missing`);
            }
        }

        // Test MCP configuration
        try {
            const mcpConfig = JSON.parse(await fs.readFile('.cursor/mcp.json', 'utf8'));
            
            if (mcpConfig.mcpServers && mcpConfig.mcpServers['monsterbox-log-collector']) {
                this.recordTest('mcp_config', true, 'MCP log collector configured');
                console.log('   ✅ MCP log collector configured');
            } else {
                this.recordTest('mcp_config', false, 'MCP log collector not configured');
                console.log('   ❌ MCP log collector not configured');
            }
            
        } catch (error) {
            this.recordTest('mcp_config', false, 'MCP config error');
            console.log('   ❌ MCP config error:', error.message);
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

    printSummary() {
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

        console.log('\n🎃 MCP Setup Status:');
        if (successRate >= 80) {
            console.log('✅ MCP log collection is ready for use!');
        } else if (successRate >= 60) {
            console.log('⚠️  MCP setup is partially working - some issues need attention');
        } else {
            console.log('❌ MCP setup needs significant work before it\'s ready');
        }

        // Save results
        this.saveResults();
    }

    async saveResults() {
        try {
            const logDir = path.join(process.cwd(), 'log');
            await fs.mkdir(logDir, { recursive: true });
            
            const filename = `mcp-test-${new Date().toISOString().split('T')[0]}.json`;
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
    const tester = new MCPSetupTester();
    tester.runAllTests().catch(console.error);
}

module.exports = MCPSetupTester;
