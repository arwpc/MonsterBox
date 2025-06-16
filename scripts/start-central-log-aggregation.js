#!/usr/bin/env node

/**
 * MonsterBox Central Log Aggregation Service Starter
 * Task 4.3: Central Log Aggregation Service Integration
 * 
 * Starts and manages the central log aggregation service with
 * integration to existing MonsterBox infrastructure
 */

const CentralLogAggregationService = require('../services/centralLogAggregationService');
const path = require('path');
const fs = require('fs').promises;

class LogAggregationManager {
    constructor() {
        this.service = null;
        this.config = {
            port: 8781,
            storageDir: path.join(process.cwd(), 'log', 'aggregated'),
            maxBufferSize: 1000,
            flushInterval: 5000,
            retentionDays: 30,
            compressionEnabled: true,
            indexingEnabled: true
        };
    }

    async loadConfiguration() {
        try {
            const configPath = path.join(process.cwd(), 'data', 'log-aggregation-config.json');
            
            try {
                const configData = await fs.readFile(configPath, 'utf8');
                const userConfig = JSON.parse(configData);
                this.config = { ...this.config, ...userConfig };
                console.log('✅ Loaded custom configuration');
            } catch (error) {
                console.log('ℹ️ Using default configuration (no custom config found)');
                await this.createDefaultConfig(configPath);
            }
        } catch (error) {
            console.error('❌ Failed to load configuration:', error.message);
            throw error;
        }
    }

    async createDefaultConfig(configPath) {
        const defaultConfig = {
            port: 8781,
            storageDir: "./log/aggregated",
            maxBufferSize: 1000,
            flushInterval: 5000,
            retentionDays: 30,
            compressionEnabled: true,
            indexingEnabled: true,
            sources: {
                "orlok": {
                    "host": "192.168.8.120",
                    "services": ["jaw", "ai", "registry", "motor", "light", "main"],
                    "enabled": true
                },
                "coffin": {
                    "host": "192.168.8.140", 
                    "services": ["jaw", "ai", "registry", "motor", "light", "main"],
                    "enabled": true
                }
            },
            alerting: {
                "enabled": true,
                "errorThreshold": 10,
                "warningThreshold": 50,
                "checkInterval": 60000
            }
        };

        try {
            await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
            console.log('✅ Created default configuration file');
        } catch (error) {
            console.warn('⚠️ Could not create default config file:', error.message);
        }
    }

    async start() {
        try {
            console.log('🚀 Starting MonsterBox Central Log Aggregation Service...');
            
            await this.loadConfiguration();
            
            this.service = new CentralLogAggregationService(this.config);
            
            // Setup event handlers
            this.service.on('started', () => {
                console.log('✅ Central Log Aggregation Service started successfully');
                console.log(`📡 WebSocket server listening on port ${this.config.port}`);
                console.log(`💾 Storage directory: ${this.config.storageDir}`);
                this.startLogIngestion();
            });

            this.service.on('stopped', () => {
                console.log('🛑 Central Log Aggregation Service stopped');
            });

            // Start the service
            const started = await this.service.start();
            
            if (!started) {
                throw new Error('Failed to start central log aggregation service');
            }

            // Setup graceful shutdown
            this.setupGracefulShutdown();

            return true;
        } catch (error) {
            console.error('❌ Failed to start log aggregation manager:', error.message);
            throw error;
        }
    }

    async startLogIngestion() {
        console.log('🔄 Starting log ingestion from MonsterBox sources...');
        
        // Simulate log ingestion from various sources
        this.startSimulatedIngestion();
        
        // Setup real log collection from RPi devices
        this.setupRealLogCollection();
    }

    startSimulatedIngestion() {
        // Simulate logs from different services for testing
        const animatronics = ['orlok', 'coffin'];
        const services = ['jaw', 'ai', 'registry', 'motor', 'light', 'main'];
        const levels = ['info', 'warn', 'error', 'debug'];

        setInterval(() => {
            const animatronic = animatronics[Math.floor(Math.random() * animatronics.length)];
            const service = services[Math.floor(Math.random() * services.length)];
            const level = levels[Math.floor(Math.random() * levels.length)];
            
            const logEntry = {
                source: 'websocket_service',
                animatronic: animatronic,
                service: service,
                level: level,
                message: `${service} service ${level} message from ${animatronic}`,
                metadata: {
                    port: this.getServicePort(service),
                    pid: Math.floor(Math.random() * 10000),
                    memory_usage: Math.floor(Math.random() * 100)
                }
            };

            this.service.ingestLogEntry(logEntry).catch(error => {
                console.error('Failed to ingest simulated log:', error.message);
            });
        }, 2000); // Every 2 seconds

        console.log('✅ Started simulated log ingestion');
    }

    setupRealLogCollection() {
        // This will be implemented to collect real logs from RPi devices
        console.log('ℹ️ Real log collection setup (to be implemented)');
    }

    getServicePort(service) {
        const servicePorts = {
            'jaw': 8765,
            'ai': 8766,
            'registry': 8770,
            'motor': 8771,
            'light': 8772,
            'main': 8780
        };
        return servicePorts[service] || 8000;
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
            
            if (this.service) {
                await this.service.stop();
            }
            
            console.log('👋 Goodbye!');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }

    async stop() {
        if (this.service) {
            await this.service.stop();
        }
    }

    getStatus() {
        if (!this.service) {
            return { status: 'not_started' };
        }
        
        return {
            status: 'running',
            service: this.service.getStatus(),
            config: this.config
        };
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];
    const manager = new LogAggregationManager();

    switch (command) {
        case 'start':
            try {
                await manager.start();
                console.log('🎯 Log aggregation service is running. Press Ctrl+C to stop.');
                
                // Keep the process alive
                process.stdin.resume();
            } catch (error) {
                console.error('❌ Failed to start:', error.message);
                process.exit(1);
            }
            break;

        case 'status':
            try {
                const status = manager.getStatus();
                console.log('📊 Service Status:');
                console.log(JSON.stringify(status, null, 2));
            } catch (error) {
                console.error('❌ Failed to get status:', error.message);
                process.exit(1);
            }
            break;

        case 'test':
            try {
                console.log('🧪 Testing log aggregation service...');
                await manager.start();
                
                // Run for 30 seconds then stop
                setTimeout(async () => {
                    console.log('🏁 Test completed, stopping service...');
                    await manager.stop();
                    process.exit(0);
                }, 30000);
            } catch (error) {
                console.error('❌ Test failed:', error.message);
                process.exit(1);
            }
            break;

        default:
            console.log(`
🎃 MonsterBox Central Log Aggregation Service

Usage:
  node start-central-log-aggregation.js <command>

Commands:
  start    Start the central log aggregation service
  status   Show service status
  test     Run a 30-second test of the service

Examples:
  node start-central-log-aggregation.js start
  node start-central-log-aggregation.js status
  node start-central-log-aggregation.js test
            `);
            break;
    }
}

// Start if run directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}

module.exports = LogAggregationManager;
