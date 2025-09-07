#!/usr/bin/env node

/**
 * Auto-Start New Hardware Services
 * Monitors parts.json for changes and automatically starts required WebSocket services
 * when new part types are added to any character
 */

const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

class AutoHardwareServiceStarter {
    constructor() {
        this.partsFile = 'data/parts.json';
        this.currentPartTypes = new Set();
        this.serviceMap = {
            'servo': { port: 8405, script: 'scripts/hardware/servo_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8405', '--debug'] },
            'microphone': { port: 8776, script: 'scripts/hardware/microphone_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8776'] },
            'webcam': { port: 8410, script: 'scripts/hardware/webcam_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8410'] },
            'motor': { port: 8404, script: 'scripts/hardware/motor_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8404'] },
            'light': { port: 8406, script: 'scripts/hardware/light_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8406'] },
            'led': { port: 8406, script: 'scripts/hardware/light_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8406'] }, // LEDs use light service
            'sensor': { port: 8407, script: 'scripts/hardware/sensor_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8407'] },
            'linear-actuator': { port: 8408, script: 'scripts/hardware/actuator_websocket_service.py', args: ['--host', '0.0.0.0', '--port', '8408'] }
        };
        this.runningServices = new Set();
        this.processes = new Map();
    }

    async initialize() {
        console.log('🚀 Initializing Auto Hardware Service Starter...');
        
        // Load current part types
        await this.loadCurrentPartTypes();
        
        // Check which services are already running
        await this.checkRunningServices();
        
        // Start missing services
        await this.startMissingServices();
        
        // Set up file watching
        this.setupFileWatching();
        
        console.log('✅ Auto Hardware Service Starter initialized');
        console.log(`📊 Monitoring ${this.currentPartTypes.size} part types`);
        console.log(`🔧 Running ${this.runningServices.size} services`);
    }

    async loadCurrentPartTypes() {
        try {
            if (!fs.existsSync(this.partsFile)) {
                console.log('⚠️ Parts file not found, using default services');
                this.currentPartTypes = new Set(['servo', 'microphone', 'webcam']);
                return;
            }

            const partsData = JSON.parse(fs.readFileSync(this.partsFile, 'utf8'));
            this.currentPartTypes = new Set(partsData.map(part => part.type));
            
            console.log(`📋 Found part types: ${Array.from(this.currentPartTypes).join(', ')}`);
        } catch (error) {
            console.error('❌ Error loading parts:', error.message);
            this.currentPartTypes = new Set(['servo', 'microphone', 'webcam']);
        }
    }

    async checkRunningServices() {
        console.log('🔍 Checking running services...');
        
        for (const [partType, serviceConfig] of Object.entries(this.serviceMap)) {
            const isRunning = await this.isServiceRunning(serviceConfig.port);
            if (isRunning) {
                this.runningServices.add(partType);
                console.log(`✅ ${partType} service running on port ${serviceConfig.port}`);
            }
        }
    }

    async isServiceRunning(port) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            
            ws.on('open', () => {
                ws.close();
                resolve(true);
            });
            
            ws.on('error', () => {
                resolve(false);
            });
            
            setTimeout(() => {
                if (ws.readyState === WebSocket.CONNECTING) {
                    ws.terminate();
                }
                resolve(false);
            }, 2000);
        });
    }

    async startMissingServices() {
        console.log('🔧 Starting missing services...');
        
        for (const partType of this.currentPartTypes) {
            if (!this.runningServices.has(partType) && this.serviceMap[partType]) {
                await this.startService(partType);
            }
        }
        
        // Always ensure core services are running
        const coreServices = ['servo', 'microphone', 'webcam'];
        for (const coreService of coreServices) {
            if (!this.runningServices.has(coreService)) {
                await this.startService(coreService);
            }
        }
    }

    async startService(partType) {
        const serviceConfig = this.serviceMap[partType];
        if (!serviceConfig) {
            console.log(`⚠️ No service configuration for part type: ${partType}`);
            return;
        }

        // Check if service is already running
        if (await this.isServiceRunning(serviceConfig.port)) {
            console.log(`✅ ${partType} service already running on port ${serviceConfig.port}`);
            this.runningServices.add(partType);
            return;
        }

        console.log(`🚀 Starting ${partType} service on port ${serviceConfig.port}...`);
        
        try {
            const process = spawn('python3', [serviceConfig.script, ...serviceConfig.args], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                detached: false
            });

            // Store process reference
            this.processes.set(partType, process);

            // Handle process events
            process.on('error', (error) => {
                console.error(`❌ Failed to start ${partType} service:`, error.message);
            });

            process.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output.includes('WebSocket Server running')) {
                    console.log(`✅ ${partType} service started successfully`);
                    this.runningServices.add(partType);
                }
            });

            process.stderr.on('data', (data) => {
                const error = data.toString().trim();
                if (!error.includes('ALSA lib') && !error.includes('Cannot connect to server')) {
                    console.log(`🔧 ${partType} service:`, error);
                }
            });

            // Wait a moment for service to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Verify service is running
            if (await this.isServiceRunning(serviceConfig.port)) {
                console.log(`✅ ${partType} service verified running on port ${serviceConfig.port}`);
                this.runningServices.add(partType);
            } else {
                console.log(`⚠️ ${partType} service may not have started properly`);
            }

        } catch (error) {
            console.error(`❌ Error starting ${partType} service:`, error.message);
        }
    }

    setupFileWatching() {
        console.log('👁️ Setting up file watching for automatic service management...');
        
        if (!fs.existsSync(this.partsFile)) {
            console.log('⚠️ Parts file not found, skipping file watching');
            return;
        }

        fs.watchFile(this.partsFile, { interval: 1000 }, async (curr, prev) => {
            if (curr.mtime > prev.mtime) {
                console.log('📁 Parts file changed, checking for new services needed...');
                await this.handlePartsFileChange();
            }
        });
    }

    async handlePartsFileChange() {
        try {
            // Reload part types
            const oldPartTypes = new Set(this.currentPartTypes);
            await this.loadCurrentPartTypes();
            
            // Find new part types
            const newPartTypes = new Set();
            for (const partType of this.currentPartTypes) {
                if (!oldPartTypes.has(partType)) {
                    newPartTypes.add(partType);
                }
            }
            
            if (newPartTypes.size > 0) {
                console.log(`🆕 New part types detected: ${Array.from(newPartTypes).join(', ')}`);
                
                // Start services for new part types
                for (const partType of newPartTypes) {
                    await this.startService(partType);
                }
                
                // Notify existing services to reload configurations
                await this.notifyServicesReload();
            } else {
                console.log('📋 No new part types detected, but notifying services to reload configurations...');
                await this.notifyServicesReload();
            }
            
        } catch (error) {
            console.error('❌ Error handling parts file change:', error.message);
        }
    }

    async notifyServicesReload() {
        console.log('🔄 Notifying all running services to reload configurations...');
        
        for (const partType of this.runningServices) {
            const serviceConfig = this.serviceMap[partType];
            if (serviceConfig) {
                await this.notifyServiceReload(serviceConfig.port, partType);
            }
        }
    }

    async notifyServiceReload(port, serviceName) {
        return new Promise((resolve) => {
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);
            
            ws.on('open', () => {
                console.log(`🔄 Notifying ${serviceName} service to reload...`);
                ws.send(JSON.stringify({
                    type: 'reload_configurations',
                    timestamp: new Date().toISOString()
                }));
                
                setTimeout(() => ws.close(), 1000);
            });
            
            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.status === 'success') {
                        console.log(`✅ ${serviceName} service reloaded successfully`);
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            });
            
            ws.on('error', () => {
                console.log(`⚠️ Could not notify ${serviceName} service (may not support reload)`);
            });
            
            ws.on('close', () => {
                resolve();
            });
            
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close();
                }
                resolve();
            }, 3000);
        });
    }

    async cleanup() {
        console.log('🧹 Cleaning up auto service starter...');
        
        // Stop watching file
        if (fs.existsSync(this.partsFile)) {
            fs.unwatchFile(this.partsFile);
        }
        
        // Don't kill processes - let them continue running
        console.log('✅ Cleanup complete');
    }
}

// Run the auto service starter
async function main() {
    const starter = new AutoHardwareServiceStarter();
    
    try {
        await starter.initialize();
        
        // Keep running to monitor file changes
        console.log('🔄 Monitoring for changes... Press Ctrl+C to stop');
        
        process.on('SIGINT', async () => {
            console.log('\n🛑 Received interrupt signal');
            await starter.cleanup();
            process.exit(0);
        });
        
        // Keep the process alive
        setInterval(() => {
            // Just keep alive, file watching handles the rest
        }, 10000);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AutoHardwareServiceStarter;
