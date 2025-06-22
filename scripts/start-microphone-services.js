#!/usr/bin/env node
/**
 * Microphone Services Startup Script
 * Ensures all microphone-related WebSocket services are running
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const logger = require('../scripts/logger');

class MicrophoneServicesStarter {
    constructor() {
        this.services = new Map();
        this.serviceDefinitions = {
            microphoneService: {
                name: 'Microphone WebSocket Service',
                port: 8776,
                script: 'scripts/hardware/microphone_websocket_service.py',
                type: 'python',
                args: ['--host', '0.0.0.0', '--port', '8776']
            },
            audioStreamService: {
                name: 'Audio Stream Service',
                port: 8777,
                script: 'services/audioStreamService.js',
                type: 'node',
                args: []
            }
        };
    }

    /**
     * Start all microphone services
     */
    async startAllServices() {
        logger.info('🚀 Starting microphone services...');
        
        const results = [];
        for (const [serviceId, config] of Object.entries(this.serviceDefinitions)) {
            try {
                const isRunning = await this.checkServiceStatus(config.port);
                if (isRunning) {
                    logger.info(`✅ ${config.name} already running on port ${config.port}`);
                    results.push({ serviceId, started: true, alreadyRunning: true });
                } else {
                    const started = await this.startService(serviceId, config);
                    results.push({ serviceId, started, alreadyRunning: false });
                }
            } catch (error) {
                logger.error(`❌ Failed to start ${config.name}:`, error);
                results.push({ serviceId, started: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.started).length;
        logger.info(`✅ ${successCount}/${results.length} microphone services running`);
        
        return results;
    }

    /**
     * Start a specific service
     */
    async startService(serviceId, config) {
        try {
            logger.info(`🚀 Starting ${config.name}...`);

            const scriptPath = path.join(process.cwd(), config.script);
            let process;

            if (config.type === 'python') {
                process = spawn('python3', [scriptPath, ...config.args], {
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } else if (config.type === 'node') {
                process = spawn('node', [scriptPath, ...config.args], {
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            }

            if (process) {
                // Handle process output
                process.stdout.on('data', (data) => {
                    logger.info(`${config.name}: ${data.toString().trim()}`);
                });

                process.stderr.on('data', (data) => {
                    const message = data.toString().trim();
                    // Filter out common non-error messages
                    if (!this.isIgnorableMessage(message)) {
                        logger.warn(`${config.name}: ${message}`);
                    }
                });

                process.on('error', (error) => {
                    logger.error(`${config.name} process error:`, error);
                });

                process.on('exit', (code, signal) => {
                    if (code !== 0) {
                        logger.error(`${config.name} exited with code ${code}, signal ${signal}`);
                    }
                    this.services.delete(serviceId);
                });

                process.unref(); // Allow parent to exit independently
                this.services.set(serviceId, {
                    process: process,
                    config: config,
                    startTime: Date.now()
                });

                // Wait for service to start
                await this.waitForService(config.port, 15000);
                
                logger.info(`✅ ${config.name} started successfully on port ${config.port}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error starting ${config.name}:`, error);
            return false;
        }
    }

    /**
     * Check if a message should be ignored (not logged as error)
     */
    isIgnorableMessage(message) {
        const ignorablePatterns = [
            'ALSA lib',
            'jack server',
            'PulseAudio server',
            'Expression \'ret\' failed',
            'Cannot connect to server',
            'bt_audio_service_open',
            'deprecation',
            'warning'
        ];

        return ignorablePatterns.some(pattern => 
            message.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Wait for a service to become available on a port
     */
    async waitForService(port, timeout = 15000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                const ws = new WebSocket(`ws://localhost:${port}`);
                
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        ws.close();
                        reject(new Error('Connection timeout'));
                    }, 2000);

                    ws.on('open', () => {
                        clearTimeout(timer);
                        ws.close();
                        resolve();
                    });

                    ws.on('error', () => {
                        clearTimeout(timer);
                        reject(new Error('Connection failed'));
                    });
                });

                // Service is available
                return true;
            } catch (error) {
                // Service not ready yet, wait and retry
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error(`Service on port ${port} did not start within ${timeout}ms`);
    }

    /**
     * Check if a service is running on a specific port
     */
    async checkServiceStatus(port) {
        try {
            const ws = new WebSocket(`ws://localhost:${port}`);
            
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 3000);

                ws.on('open', () => {
                    clearTimeout(timer);
                    ws.close();
                    resolve(true);
                });

                ws.on('error', () => {
                    clearTimeout(timer);
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    /**
     * Stop all services
     */
    async stopAllServices() {
        logger.info('🛑 Stopping microphone services...');
        
        for (const [serviceId, serviceInfo] of this.services) {
            try {
                if (serviceInfo.process && !serviceInfo.process.killed) {
                    serviceInfo.process.kill('SIGTERM');
                    logger.info(`🛑 Stopped ${serviceInfo.config.name}`);
                }
            } catch (error) {
                logger.error(`Error stopping ${serviceInfo.config.name}:`, error);
            }
        }

        this.services.clear();
        logger.info('✅ All microphone services stopped');
    }

    /**
     * Get status of all services
     */
    async getServicesStatus() {
        const status = {};

        for (const [serviceId, config] of Object.entries(this.serviceDefinitions)) {
            try {
                const isRunning = await this.checkServiceStatus(config.port);
                const serviceInfo = this.services.get(serviceId);
                
                status[serviceId] = {
                    name: config.name,
                    port: config.port,
                    running: isRunning,
                    startTime: serviceInfo?.startTime,
                    lastChecked: new Date().toISOString()
                };
            } catch (error) {
                status[serviceId] = {
                    name: config.name,
                    port: config.port,
                    running: false,
                    error: error.message,
                    lastChecked: new Date().toISOString()
                };
            }
        }

        return status;
    }

    /**
     * Restart a specific service
     */
    async restartService(serviceId) {
        const config = this.serviceDefinitions[serviceId];
        if (!config) {
            throw new Error(`Unknown service: ${serviceId}`);
        }

        logger.info(`🔄 Restarting ${config.name}...`);

        // Stop the service if running
        const serviceInfo = this.services.get(serviceId);
        if (serviceInfo && serviceInfo.process && !serviceInfo.process.killed) {
            serviceInfo.process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Start the service
        return await this.startService(serviceId, config);
    }
}

// Export for use as module
module.exports = MicrophoneServicesStarter;

// Run directly if called as script
if (require.main === module) {
    const starter = new MicrophoneServicesStarter();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        logger.info('Received SIGINT, shutting down gracefully...');
        await starter.stopAllServices();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Received SIGTERM, shutting down gracefully...');
        await starter.stopAllServices();
        process.exit(0);
    });

    // Start services
    starter.startAllServices().catch(error => {
        logger.error('Failed to start microphone services:', error);
        process.exit(1);
    });
}
