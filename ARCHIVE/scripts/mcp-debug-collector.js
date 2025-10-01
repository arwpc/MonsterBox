#!/usr/bin/env node

/**
 * MonsterBox MCP Debug Log Collector
 * 
 * Collects comprehensive debug information from Orlok RPI4b
 * for analysis in Augment using MCP resources
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Load environment and dependencies
require('dotenv').config({ override: true });
const logger = require('./logger');
const sshCredentials = require('./ssh-credentials');

class MCPDebugCollector {
    constructor() {
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        this.outputDir = `./mcp-debug-${this.timestamp}`;
        this.orlokHost = '192.168.8.120';
        this.results = {
            timestamp: new Date().toISOString(),
            host: this.orlokHost,
            collections: {},
            summary: {
                total: 0,
                successful: 0,
                failed: 0
            }
        };
    }

    async initialize() {
        console.log('🎃 MonsterBox MCP Debug Collector');
        console.log('==================================');
        console.log(`Output directory: ${this.outputDir}`);
        
        await fs.mkdir(this.outputDir, { recursive: true });
        
        // Create subdirectories
        const subdirs = ['logs', 'configs', 'system', 'tests', 'fluent-bit'];
        for (const subdir of subdirs) {
            await fs.mkdir(path.join(this.outputDir, subdir), { recursive: true });
        }
    }

    async collectAll() {
        await this.initialize();
        
        console.log('\n📊 Collecting debug information...\n');
        
        // Collection tasks
        const collections = [
            { name: 'System Info', method: 'collectSystemInfo' },
            { name: 'Test Results', method: 'collectTestResults' },
            { name: 'Application Logs', method: 'collectApplicationLogs' },
            { name: 'Fluent Bit Status', method: 'collectFluentBitStatus' },
            { name: 'Service Status', method: 'collectServiceStatus' },
            { name: 'GPIO Status', method: 'collectGPIOStatus' },
            { name: 'Network Status', method: 'collectNetworkStatus' },
            { name: 'Configuration Files', method: 'collectConfigFiles' },
            { name: 'Error Logs', method: 'collectErrorLogs' },
            { name: 'Performance Metrics', method: 'collectPerformanceMetrics' }
        ];

        for (const collection of collections) {
            try {
                console.log(`📋 Collecting: ${collection.name}`);
                await this[collection.method]();
                this.results.collections[collection.name] = { status: 'success' };
                this.results.summary.successful++;
            } catch (error) {
                console.log(`❌ Failed: ${collection.name} - ${error.message}`);
                this.results.collections[collection.name] = { 
                    status: 'failed', 
                    error: error.message 
                };
                this.results.summary.failed++;
            }
            this.results.summary.total++;
        }

        await this.generateSummaryReport();
        this.printSummary();
    }

    async collectSystemInfo() {
        const commands = [
            'uname -a',
            'cat /proc/cpuinfo | head -20',
            'free -h',
            'df -h',
            'lsusb',
            'lsmod | grep gpio',
            'cat /boot/config.txt | grep -v "^#" | grep -v "^$"'
        ];

        let systemInfo = '';
        for (const cmd of commands) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(this.orlokHost, cmd);
                const { stdout } = await execAsync(sshCmd);
                systemInfo += `\n=== ${cmd} ===\n${stdout}\n`;
            } catch (error) {
                systemInfo += `\n=== ${cmd} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'system', 'system-info.txt'),
            systemInfo
        );
    }

    async collectTestResults() {
        const testCommands = [
            'npm run check-config',
            'npm run test:rpi',
            'npm run check-api-keys',
            'npm run test:mcp',
            'npm run test:fluent-bit'
        ];

        for (const cmd of testCommands) {
            try {
                const testName = cmd.replace('npm run ', '').replace(':', '-');
                const sshCmd = sshCredentials.buildSSHCommandByHost(
                    this.orlokHost, 
                    `cd /home/remote/MonsterBox && ${cmd}`
                );
                const { stdout, stderr } = await execAsync(sshCmd);
                
                await fs.writeFile(
                    path.join(this.outputDir, 'tests', `${testName}.log`),
                    `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`
                );
            } catch (error) {
                const testName = cmd.replace('npm run ', '').replace(':', '-');
                await fs.writeFile(
                    path.join(this.outputDir, 'tests', `${testName}.log`),
                    `ERROR: ${error.message}\nSTDOUT: ${error.stdout || ''}\nSTDERR: ${error.stderr || ''}`
                );
            }
        }
    }

    async collectApplicationLogs() {
        const logPaths = [
            '/home/remote/MonsterBox/log/*.log',
            '/home/remote/log_export/*.log',
            '/home/remote/log_export/*.jsonl',
            '/var/log/monsterbox/*.log'
        ];

        for (const logPath of logPaths) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(
                    this.orlokHost,
                    `find ${logPath} -type f -mtime -1 -exec tail -100 {} \\; 2>/dev/null || echo "No logs found at ${logPath}"`
                );
                const { stdout } = await execAsync(sshCmd);
                
                const pathName = logPath.replace(/[\/\*]/g, '_');
                await fs.writeFile(
                    path.join(this.outputDir, 'logs', `${pathName}.log`),
                    stdout
                );
            } catch (error) {
                console.log(`Warning: Could not collect logs from ${logPath}: ${error.message}`);
            }
        }
    }

    async collectFluentBitStatus() {
        const commands = [
            'systemctl status fluent-bit --no-pager',
            'journalctl -u fluent-bit -n 50 --no-pager',
            'curl -s http://localhost:2020/api/v1/metrics',
            'ls -la /home/remote/log_export/',
            'cat /etc/fluent-bit/fluent-bit.conf'
        ];

        let fluentBitInfo = '';
        for (const cmd of commands) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(this.orlokHost, cmd);
                const { stdout } = await execAsync(sshCmd);
                fluentBitInfo += `\n=== ${cmd} ===\n${stdout}\n`;
            } catch (error) {
                fluentBitInfo += `\n=== ${cmd} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'fluent-bit', 'status.txt'),
            fluentBitInfo
        );
    }

    async collectServiceStatus() {
        const services = ['monsterbox', 'nginx', 'ssh', 'fluent-bit', 'systemd-resolved'];
        
        let serviceInfo = '';
        for (const service of services) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(
                    this.orlokHost,
                    `systemctl status ${service} --no-pager`
                );
                const { stdout } = await execAsync(sshCmd);
                serviceInfo += `\n=== ${service} ===\n${stdout}\n`;
            } catch (error) {
                serviceInfo += `\n=== ${service} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'system', 'services.txt'),
            serviceInfo
        );
    }

    async collectGPIOStatus() {
        try {
            const sshCmd = sshCredentials.buildSSHCommandByHost(
                this.orlokHost,
                'cd /home/remote/MonsterBox && python3 scripts/test_gpio.py status'
            );
            const { stdout } = await execAsync(sshCmd);
            
            await fs.writeFile(
                path.join(this.outputDir, 'system', 'gpio-status.txt'),
                stdout
            );
        } catch (error) {
            await fs.writeFile(
                path.join(this.outputDir, 'system', 'gpio-status.txt'),
                `ERROR: ${error.message}`
            );
        }
    }

    async collectNetworkStatus() {
        const commands = [
            'ip addr show',
            'netstat -tuln',
            'ss -tuln',
            'ping -c 3 8.8.8.8'
        ];

        let networkInfo = '';
        for (const cmd of commands) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(this.orlokHost, cmd);
                const { stdout } = await execAsync(sshCmd);
                networkInfo += `\n=== ${cmd} ===\n${stdout}\n`;
            } catch (error) {
                networkInfo += `\n=== ${cmd} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'system', 'network.txt'),
            networkInfo
        );
    }

    async collectConfigFiles() {
        const configFiles = [
            '/home/remote/MonsterBox/.env',
            '/home/remote/MonsterBox/package.json',
            '/home/remote/MonsterBox/data/orlok.json',
            '/etc/fluent-bit/fluent-bit.conf'
        ];

        for (const configFile of configFiles) {
            try {
                const fileName = path.basename(configFile);
                const sshCmd = sshCredentials.buildSSHCommandByHost(
                    this.orlokHost,
                    `cat ${configFile}`
                );
                const { stdout } = await execAsync(sshCmd);
                
                await fs.writeFile(
                    path.join(this.outputDir, 'configs', fileName),
                    stdout
                );
            } catch (error) {
                console.log(`Warning: Could not collect config ${configFile}: ${error.message}`);
            }
        }
    }

    async collectErrorLogs() {
        const commands = [
            'journalctl -p err -n 50 --no-pager',
            'dmesg | tail -50',
            'tail -50 /var/log/syslog'
        ];

        let errorInfo = '';
        for (const cmd of commands) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(this.orlokHost, cmd);
                const { stdout } = await execAsync(sshCmd);
                errorInfo += `\n=== ${cmd} ===\n${stdout}\n`;
            } catch (error) {
                errorInfo += `\n=== ${cmd} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'logs', 'system-errors.txt'),
            errorInfo
        );
    }

    async collectPerformanceMetrics() {
        const commands = [
            'top -bn1 | head -20',
            'iostat -x 1 1',
            'vmstat 1 1',
            'cat /proc/loadavg',
            'cat /proc/meminfo | head -10'
        ];

        let perfInfo = '';
        for (const cmd of commands) {
            try {
                const sshCmd = sshCredentials.buildSSHCommandByHost(this.orlokHost, cmd);
                const { stdout } = await execAsync(sshCmd);
                perfInfo += `\n=== ${cmd} ===\n${stdout}\n`;
            } catch (error) {
                perfInfo += `\n=== ${cmd} ===\nERROR: ${error.message}\n`;
            }
        }

        await fs.writeFile(
            path.join(this.outputDir, 'system', 'performance.txt'),
            perfInfo
        );
    }

    async generateSummaryReport() {
        const summary = {
            collection_info: {
                timestamp: this.results.timestamp,
                host: this.orlokHost,
                output_directory: this.outputDir
            },
            results: this.results.collections,
            statistics: this.results.summary,
            files_generated: []
        };

        // List all generated files
        const walkDir = async (dir) => {
            const files = await fs.readdir(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory()) {
                    await walkDir(filePath);
                } else {
                    summary.files_generated.push({
                        path: filePath.replace(this.outputDir + path.sep, ''),
                        size: stat.size,
                        modified: stat.mtime
                    });
                }
            }
        };

        await walkDir(this.outputDir);

        await fs.writeFile(
            path.join(this.outputDir, 'collection-summary.json'),
            JSON.stringify(summary, null, 2)
        );

        // Also create a human-readable summary
        const readableSummary = `
MonsterBox MCP Debug Collection Summary
======================================

Collection Time: ${this.results.timestamp}
Target Host: ${this.orlokHost}
Output Directory: ${this.outputDir}

Results:
- Total Collections: ${this.results.summary.total}
- Successful: ${this.results.summary.successful}
- Failed: ${this.results.summary.failed}
- Success Rate: ${((this.results.summary.successful / this.results.summary.total) * 100).toFixed(1)}%

Files Generated: ${summary.files_generated.length}

Collection Status:
${Object.entries(this.results.collections).map(([name, result]) => 
    `- ${name}: ${result.status}${result.error ? ` (${result.error})` : ''}`
).join('\n')}

Generated Files:
${summary.files_generated.map(file => `- ${file.path} (${file.size} bytes)`).join('\n')}
`;

        await fs.writeFile(
            path.join(this.outputDir, 'README.txt'),
            readableSummary
        );
    }

    printSummary() {
        console.log('\n🎉 MCP Debug Collection Complete!');
        console.log('==================================');
        console.log(`📁 Output Directory: ${this.outputDir}`);
        console.log(`📊 Total Collections: ${this.results.summary.total}`);
        console.log(`✅ Successful: ${this.results.summary.successful}`);
        console.log(`❌ Failed: ${this.results.summary.failed}`);
        console.log(`📈 Success Rate: ${((this.results.summary.successful / this.results.summary.total) * 100).toFixed(1)}%`);
        console.log('\n📋 Check the collection-summary.json and README.txt files for details.');
    }
}

// Run if called directly
if (require.main === module) {
    const collector = new MCPDebugCollector();
    collector.collectAll().catch(error => {
        console.error('❌ Collection failed:', error);
        process.exit(1);
    });
}

module.exports = MCPDebugCollector;
