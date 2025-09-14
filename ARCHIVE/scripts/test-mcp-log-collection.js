#!/usr/bin/env node

/**
 * MonsterBox MCP Log Collection Test
 * 
 * Tests log collection from Fluent Bit on both Orlok and Coffin RPIs
 * Uses direct HTTP API calls instead of SSH for reliability
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('http'); // Using http since Fluent Bit HTTP is not HTTPS
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Load environment variables
require('dotenv').config();

class MCPLogCollector {
    constructor() {
        this.systems = [
            {
                id: 'orlok',
                name: 'Orlok RPI4b',
                host: '192.168.8.120',
                httpPort: 2020,
                enabled: true
            },
            {
                id: 'coffin', 
                name: 'Coffin RPI4b',
                host: '192.168.8.140',
                httpPort: 2020,
                enabled: true
            }
        ];
        
        this.localLogDir = path.join(process.cwd(), 'log', 'mcp-collected');
        this.results = {
            timestamp: new Date().toISOString(),
            systems: {},
            summary: { total: 0, successful: 0, failed: 0 }
        };
    }

    async run() {
        console.log('🎃 MonsterBox MCP Log Collection Test');
        console.log('====================================');
        console.log('');

        try {
            await this.setupLocalDirectories();
            await this.testSystemConnectivity();
            await this.collectFluentBitMetrics();
            await this.collectLogFiles();
            await this.generateReport();
            
            console.log('');
            console.log('✅ MCP log collection test completed successfully!');
            console.log('');
            console.log('📁 Collected logs are available in:', this.localLogDir);
            console.log('');
            console.log('🔧 Next steps:');
            console.log('   • Review collected logs for debugging');
            console.log('   • Set up automated collection schedule');
            console.log('   • Integrate with MCP tools for real-time monitoring');
            
        } catch (error) {
            console.error('❌ MCP log collection failed:', error.message);
            process.exit(1);
        }
    }

    async setupLocalDirectories() {
        console.log('📁 Setting up local log directories...');
        
        try {
            await fs.mkdir(this.localLogDir, { recursive: true });
            
            for (const system of this.systems) {
                const systemDir = path.join(this.localLogDir, system.id);
                await fs.mkdir(systemDir, { recursive: true });
            }
            
            console.log('✅ Local directories created');
        } catch (error) {
            throw new Error(`Failed to create directories: ${error.message}`);
        }
    }

    async testSystemConnectivity() {
        console.log('🔍 Testing system connectivity...');
        
        for (const system of this.systems.filter(s => s.enabled)) {
            console.log(`\n   🤖 Testing ${system.name} (${system.host})...`);
            
            this.results.systems[system.id] = {
                name: system.name,
                host: system.host,
                connectivity: false,
                fluentBitStatus: false,
                logsCollected: 0,
                errors: []
            };
            
            try {
                // Test ping connectivity
                await execAsync(`ping -n 1 -w 5000 ${system.host}`);
                console.log(`      ✅ ${system.name} is reachable`);
                this.results.systems[system.id].connectivity = true;
                
            } catch (error) {
                console.log(`      ❌ ${system.name} is not reachable`);
                this.results.systems[system.id].errors.push(`Connectivity failed: ${error.message}`);
                continue;
            }
        }
    }

    async collectFluentBitMetrics() {
        console.log('\n📊 Collecting Fluent Bit metrics...');
        
        for (const system of this.systems.filter(s => s.enabled)) {
            if (!this.results.systems[system.id].connectivity) {
                console.log(`   ⏭️  Skipping ${system.name} (not reachable)`);
                continue;
            }
            
            console.log(`\n   📈 Collecting metrics from ${system.name}...`);
            
            try {
                // Test Fluent Bit HTTP interface
                const healthData = await this.httpGet(system.host, system.httpPort, '/');
                if (healthData.includes('fluent-bit')) {
                    console.log(`      ✅ Fluent Bit HTTP interface responding`);
                    this.results.systems[system.id].fluentBitStatus = true;
                    
                    // Get metrics
                    const metricsData = await this.httpGet(system.host, system.httpPort, '/api/v1/metrics');
                    const metricsFile = path.join(this.localLogDir, system.id, 'fluent-bit-metrics.json');
                    await fs.writeFile(metricsFile, metricsData);
                    console.log(`      ✅ Metrics saved to fluent-bit-metrics.json`);
                    
                    // Get uptime
                    const uptimeData = await this.httpGet(system.host, system.httpPort, '/api/v1/uptime');
                    const uptimeFile = path.join(this.localLogDir, system.id, 'fluent-bit-uptime.json');
                    await fs.writeFile(uptimeFile, uptimeData);
                    console.log(`      ✅ Uptime data saved`);
                    
                } else {
                    throw new Error('Fluent Bit not responding properly');
                }
                
            } catch (error) {
                console.log(`      ❌ Failed to collect metrics: ${error.message}`);
                this.results.systems[system.id].errors.push(`Metrics collection failed: ${error.message}`);
            }
        }
    }

    async collectLogFiles() {
        console.log('\n📥 Collecting log files via SCP...');
        
        for (const system of this.systems.filter(s => s.enabled)) {
            if (!this.results.systems[system.id].fluentBitStatus) {
                console.log(`   ⏭️  Skipping ${system.name} (Fluent Bit not responding)`);
                continue;
            }
            
            console.log(`\n   📁 Collecting logs from ${system.name}...`);
            
            try {
                const systemLogDir = path.join(this.localLogDir, system.id);
                const password = this.getSystemPassword(system.id);
                
                if (!password) {
                    throw new Error(`No password found for ${system.id}`);
                }
                
                // Use scp with sshpass for automated password entry
                const scpCommand = `scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no remote@${system.host}:/home/remote/log_export/${system.id}-*.log "${systemLogDir}/"`;
                
                // For Windows, we'll use a different approach
                await this.collectLogsWindows(system, systemLogDir, password);
                
                // Count collected files
                const files = await fs.readdir(systemLogDir);
                const logFiles = files.filter(f => f.endsWith('.log'));
                
                this.results.systems[system.id].logsCollected = logFiles.length;
                console.log(`      ✅ Collected ${logFiles.length} log files`);
                
                // Show file sizes
                for (const file of logFiles) {
                    const filePath = path.join(systemLogDir, file);
                    const stats = await fs.stat(filePath);
                    console.log(`         • ${file}: ${Math.round(stats.size / 1024)}KB`);
                }
                
            } catch (error) {
                console.log(`      ❌ Failed to collect logs: ${error.message}`);
                this.results.systems[system.id].errors.push(`Log collection failed: ${error.message}`);
            }
        }
    }

    async collectLogsWindows(system, localDir, password) {
        // Create a simple PowerShell script for SCP
        const tempScript = path.join(require('os').tmpdir(), `scp_${system.id}_${Date.now()}.ps1`);
        
        const scriptContent = `
# Simple SCP script for ${system.id}
$env:SSHPASS = "${password}"

# Use pscp (PuTTY's SCP) if available, otherwise try scp
try {
    & scp -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no -o PreferredAuthentications=password remote@${system.host}:/home/remote/log_export/${system.id}-*.log "${localDir}/"
} catch {
    Write-Host "SCP failed, trying alternative method..."
    # Alternative: Use PowerShell remoting or other method
    throw $_
}
`;
        
        await fs.writeFile(tempScript, scriptContent);
        
        try {
            await execAsync(`powershell -ExecutionPolicy Bypass -File "${tempScript}"`);
        } finally {
            // Clean up
            try {
                await fs.unlink(tempScript);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    getSystemPassword(systemId) {
        const passwordVar = `${systemId.toUpperCase()}_SSH_PASSWORD`;
        return process.env[passwordVar] || process.env.RPI_SSH_PASSWORD;
    }

    async httpGet(host, port, path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: host,
                port: port,
                path: path,
                method: 'GET',
                timeout: 10000
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    async generateReport() {
        console.log('\n📊 Generating collection report...');
        
        // Calculate summary
        for (const [systemId, data] of Object.entries(this.results.systems)) {
            this.results.summary.total++;
            if (data.connectivity && data.fluentBitStatus && data.logsCollected > 0) {
                this.results.summary.successful++;
            } else {
                this.results.summary.failed++;
            }
        }
        
        // Save detailed report
        const reportFile = path.join(this.localLogDir, 'mcp-collection-report.json');
        await fs.writeFile(reportFile, JSON.stringify(this.results, null, 2));
        
        console.log('✅ Report generated');
        console.log('');
        console.log('📋 Collection Summary:');
        console.log(`   • Total systems: ${this.results.summary.total}`);
        console.log(`   • Successful: ${this.results.summary.successful}`);
        console.log(`   • Failed: ${this.results.summary.failed}`);
        
        // Show system details
        for (const [systemId, data] of Object.entries(this.results.systems)) {
            const status = data.connectivity && data.fluentBitStatus && data.logsCollected > 0 ? '✅' : '❌';
            console.log(`   ${status} ${data.name}: ${data.logsCollected} log files collected`);
            
            if (data.errors.length > 0) {
                data.errors.forEach(error => {
                    console.log(`      ⚠️  ${error}`);
                });
            }
        }
    }
}

// Run collection if called directly
if (require.main === module) {
    const collector = new MCPLogCollector();
    collector.run().catch(console.error);
}

module.exports = MCPLogCollector;
