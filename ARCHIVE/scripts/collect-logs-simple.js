#!/usr/bin/env node

/**
 * Simple MCP Log Collection
 * 
 * Collects logs from Fluent Bit systems using HTTP APIs only
 * No SSH required - just HTTP calls to get metrics and status
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');

// Load environment variables
require('dotenv').config();

class SimpleLogCollector {
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
        
        this.localLogDir = path.join(process.cwd(), 'log', 'mcp-status');
    }

    async run() {
        console.log('🎃 MonsterBox MCP Log Status Collection');
        console.log('======================================');
        console.log('');

        try {
            await this.setupLocalDirectories();
            await this.collectSystemStatus();
            
            console.log('');
            console.log('✅ MCP status collection completed!');
            console.log('');
            console.log('📁 Status data saved to:', this.localLogDir);
            console.log('');
            console.log('🔧 To collect actual log files, use:');
            console.log('   • Manual SCP: scp remote@192.168.8.120:/home/remote/log_export/*.log ./log/');
            console.log('   • Or set up automated collection via VS Code Remote SSH');
            
        } catch (error) {
            console.error('❌ Collection failed:', error.message);
            process.exit(1);
        }
    }

    async setupLocalDirectories() {
        console.log('📁 Setting up local directories...');
        
        await fs.mkdir(this.localLogDir, { recursive: true });
        
        for (const system of this.systems) {
            const systemDir = path.join(this.localLogDir, system.id);
            await fs.mkdir(systemDir, { recursive: true });
        }
        
        console.log('✅ Directories created');
    }

    async collectSystemStatus() {
        console.log('🔍 Collecting system status via HTTP...');
        
        for (const system of this.systems.filter(s => s.enabled)) {
            console.log(`\n   🤖 Checking ${system.name} (${system.host})...`);
            
            try {
                // Test Fluent Bit HTTP interface
                const healthData = await this.httpGet(system.host, system.httpPort, '/');
                if (healthData.includes('fluent-bit')) {
                    console.log(`      ✅ Fluent Bit HTTP interface responding`);
                    
                    // Save health data
                    const healthFile = path.join(this.localLogDir, system.id, 'health.json');
                    await fs.writeFile(healthFile, healthData);
                    
                    // Get and save metrics
                    try {
                        const metricsData = await this.httpGet(system.host, system.httpPort, '/api/v1/metrics');
                        const metricsFile = path.join(this.localLogDir, system.id, 'metrics.json');
                        await fs.writeFile(metricsFile, metricsData);
                        console.log(`      ✅ Metrics collected`);
                        
                        // Parse and display key metrics
                        const metrics = JSON.parse(metricsData);
                        this.displayMetrics(system.name, metrics);
                        
                    } catch (error) {
                        console.log(`      ⚠️  Could not get metrics: ${error.message}`);
                    }
                    
                    // Get uptime
                    try {
                        const uptimeData = await this.httpGet(system.host, system.httpPort, '/api/v1/uptime');
                        const uptimeFile = path.join(this.localLogDir, system.id, 'uptime.json');
                        await fs.writeFile(uptimeFile, uptimeData);
                        
                        const uptime = JSON.parse(uptimeData);
                        console.log(`      ⏰ Uptime: ${uptime.uptime_hr}`);
                        
                    } catch (error) {
                        console.log(`      ⚠️  Could not get uptime: ${error.message}`);
                    }
                    
                } else {
                    throw new Error('Fluent Bit not responding properly');
                }
                
            } catch (error) {
                console.log(`      ❌ Failed to connect: ${error.message}`);
            }
        }
    }

    displayMetrics(systemName, metrics) {
        console.log(`      📊 ${systemName} Metrics:`);
        
        if (metrics.input) {
            let totalRecords = 0;
            let totalBytes = 0;
            
            Object.values(metrics.input).forEach(input => {
                if (input.records) totalRecords += input.records;
                if (input.bytes) totalBytes += input.bytes;
            });
            
            console.log(`         • Total records processed: ${totalRecords.toLocaleString()}`);
            console.log(`         • Total bytes processed: ${Math.round(totalBytes / 1024).toLocaleString()}KB`);
        }
        
        if (metrics.output) {
            let totalOutputRecords = 0;
            let totalErrors = 0;
            
            Object.values(metrics.output).forEach(output => {
                if (output.proc_records) totalOutputRecords += output.proc_records;
                if (output.errors) totalErrors += output.errors;
            });
            
            console.log(`         • Total records output: ${totalOutputRecords.toLocaleString()}`);
            console.log(`         • Total errors: ${totalErrors}`);
        }
    }

    async httpGet(host, port, path) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: host,
                port: port,
                path: path,
                method: 'GET',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
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
}

// Run collection if called directly
if (require.main === module) {
    const collector = new SimpleLogCollector();
    collector.run().catch(console.error);
}

module.exports = SimpleLogCollector;
