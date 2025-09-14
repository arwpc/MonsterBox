#!/usr/bin/env node

/**
 * MonsterBox MCP Status Collection (HTTP Only)
 * 
 * Collects Fluent Bit status and metrics via HTTP APIs only
 * NO SSH, NO PASSWORDS, NO SCP - just HTTP calls
 */

const fs = require('fs').promises;
const path = require('path');
const http = require('http');

class MCPStatusCollector {
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
        this.timestamp = new Date().toISOString();
    }

    async run() {
        console.log('🎃 MonsterBox MCP Status Collection (HTTP Only)');
        console.log('===============================================');
        console.log('Timestamp:', this.timestamp);
        console.log('');

        try {
            await this.setupLocalDirectories();
            await this.collectAllSystemStatus();
            await this.generateSummaryReport();
            
            console.log('');
            console.log('✅ MCP status collection completed successfully!');
            console.log('');
            console.log('📁 Status data saved to:', this.localLogDir);
            console.log('');
            console.log('🔍 Available data:');
            console.log('   • Fluent Bit health status');
            console.log('   • Processing metrics (records, bytes, errors)');
            console.log('   • System uptime information');
            console.log('   • Input/Output plugin statistics');
            console.log('');
            console.log('📋 For actual log file content, use:');
            console.log('   • VS Code Remote SSH extension');
            console.log('   • Manual SCP commands');
            console.log('   • Or the collect-log-files.ps1 script');
            
        } catch (error) {
            console.error('❌ Status collection failed:', error.message);
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

    async collectAllSystemStatus() {
        console.log('🔍 Collecting system status via HTTP APIs...');
        
        const results = {};
        
        for (const system of this.systems.filter(s => s.enabled)) {
            console.log(`\n   🤖 Checking ${system.name} (${system.host}:${system.httpPort})...`);
            
            results[system.id] = {
                name: system.name,
                host: system.host,
                timestamp: new Date().toISOString(),
                status: 'unknown',
                data: {}
            };
            
            try {
                // Test basic connectivity and Fluent Bit health
                const healthData = await this.httpGet(system.host, system.httpPort, '/');
                
                if (healthData && healthData.includes('fluent-bit')) {
                    console.log(`      ✅ Fluent Bit HTTP interface responding`);
                    results[system.id].status = 'healthy';
                    results[system.id].data.health = JSON.parse(healthData);
                    
                    // Save health data
                    const healthFile = path.join(this.localLogDir, system.id, 'health.json');
                    await fs.writeFile(healthFile, JSON.stringify(results[system.id].data.health, null, 2));
                    
                    // Collect metrics
                    await this.collectMetrics(system, results[system.id]);
                    
                    // Collect uptime
                    await this.collectUptime(system, results[system.id]);
                    
                    // Collect storage info
                    await this.collectStorage(system, results[system.id]);
                    
                } else {
                    throw new Error('Fluent Bit not responding properly');
                }
                
            } catch (error) {
                console.log(`      ❌ Failed to connect: ${error.message}`);
                results[system.id].status = 'error';
                results[system.id].error = error.message;
            }
        }
        
        // Save overall results
        const resultsFile = path.join(this.localLogDir, 'collection-results.json');
        await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
        
        return results;
    }

    async collectMetrics(system, result) {
        try {
            const metricsData = await this.httpGet(system.host, system.httpPort, '/api/v1/metrics');
            const metrics = JSON.parse(metricsData);
            result.data.metrics = metrics;
            
            // Save metrics data
            const metricsFile = path.join(this.localLogDir, system.id, 'metrics.json');
            await fs.writeFile(metricsFile, JSON.stringify(metrics, null, 2));
            
            console.log(`      ✅ Metrics collected`);
            this.displayMetrics(system.name, metrics);
            
        } catch (error) {
            console.log(`      ⚠️  Could not get metrics: ${error.message}`);
            result.data.metricsError = error.message;
        }
    }

    async collectUptime(system, result) {
        try {
            const uptimeData = await this.httpGet(system.host, system.httpPort, '/api/v1/uptime');
            const uptime = JSON.parse(uptimeData);
            result.data.uptime = uptime;
            
            // Save uptime data
            const uptimeFile = path.join(this.localLogDir, system.id, 'uptime.json');
            await fs.writeFile(uptimeFile, JSON.stringify(uptime, null, 2));
            
            console.log(`      ⏰ Uptime: ${uptime.uptime_hr}`);
            
        } catch (error) {
            console.log(`      ⚠️  Could not get uptime: ${error.message}`);
            result.data.uptimeError = error.message;
        }
    }

    async collectStorage(system, result) {
        try {
            const storageData = await this.httpGet(system.host, system.httpPort, '/api/v1/storage');
            const storage = JSON.parse(storageData);
            result.data.storage = storage;
            
            // Save storage data
            const storageFile = path.join(this.localLogDir, system.id, 'storage.json');
            await fs.writeFile(storageFile, JSON.stringify(storage, null, 2));
            
            console.log(`      💾 Storage info collected`);
            
        } catch (error) {
            console.log(`      ⚠️  Could not get storage info: ${error.message}`);
            result.data.storageError = error.message;
        }
    }

    displayMetrics(systemName, metrics) {
        console.log(`      📊 ${systemName} Processing Stats:`);
        
        if (metrics.input) {
            let totalRecords = 0;
            let totalBytes = 0;
            let activeInputs = 0;
            
            Object.entries(metrics.input).forEach(([name, input]) => {
                if (input.records) {
                    totalRecords += input.records;
                    activeInputs++;
                }
                if (input.bytes) totalBytes += input.bytes;
            });
            
            console.log(`         • Active inputs: ${activeInputs}`);
            console.log(`         • Total records: ${totalRecords.toLocaleString()}`);
            console.log(`         • Total bytes: ${Math.round(totalBytes / 1024).toLocaleString()}KB`);
        }
        
        if (metrics.output) {
            let totalOutputRecords = 0;
            let totalErrors = 0;
            let activeOutputs = 0;
            
            Object.entries(metrics.output).forEach(([name, output]) => {
                if (output.proc_records) {
                    totalOutputRecords += output.proc_records;
                    activeOutputs++;
                }
                if (output.errors) totalErrors += output.errors;
            });
            
            console.log(`         • Active outputs: ${activeOutputs}`);
            console.log(`         • Records output: ${totalOutputRecords.toLocaleString()}`);
            console.log(`         • Total errors: ${totalErrors}`);
        }
    }

    async generateSummaryReport() {
        console.log('\n📊 Generating summary report...');
        
        const summary = {
            timestamp: this.timestamp,
            systems: {},
            totals: {
                healthy: 0,
                unhealthy: 0,
                totalRecords: 0,
                totalBytes: 0,
                totalErrors: 0
            }
        };
        
        // Read results
        const resultsFile = path.join(this.localLogDir, 'collection-results.json');
        const results = JSON.parse(await fs.readFile(resultsFile, 'utf8'));
        
        for (const [systemId, data] of Object.entries(results)) {
            summary.systems[systemId] = {
                name: data.name,
                status: data.status,
                uptime: data.data.uptime?.uptime_hr || 'unknown'
            };
            
            if (data.status === 'healthy') {
                summary.totals.healthy++;
                
                if (data.data.metrics?.input) {
                    Object.values(data.data.metrics.input).forEach(input => {
                        if (input.records) summary.totals.totalRecords += input.records;
                        if (input.bytes) summary.totals.totalBytes += input.bytes;
                    });
                }
                
                if (data.data.metrics?.output) {
                    Object.values(data.data.metrics.output).forEach(output => {
                        if (output.errors) summary.totals.totalErrors += output.errors;
                    });
                }
            } else {
                summary.totals.unhealthy++;
            }
        }
        
        // Save summary
        const summaryFile = path.join(this.localLogDir, 'summary.json');
        await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
        
        console.log('✅ Summary report generated');
        console.log('');
        console.log('📋 Overall Status:');
        console.log(`   • Healthy systems: ${summary.totals.healthy}`);
        console.log(`   • Unhealthy systems: ${summary.totals.unhealthy}`);
        console.log(`   • Total records processed: ${summary.totals.totalRecords.toLocaleString()}`);
        console.log(`   • Total data processed: ${Math.round(summary.totals.totalBytes / 1024).toLocaleString()}KB`);
        console.log(`   • Total errors: ${summary.totals.totalErrors}`);
        
        console.log('');
        console.log('🤖 System Details:');
        for (const [systemId, data] of Object.entries(summary.systems)) {
            const statusIcon = data.status === 'healthy' ? '✅' : '❌';
            console.log(`   ${statusIcon} ${data.name}: ${data.status} (${data.uptime})`);
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
    const collector = new MCPStatusCollector();
    collector.run().catch(console.error);
}

module.exports = MCPStatusCollector;
