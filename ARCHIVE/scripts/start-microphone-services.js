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
     * Cleanup processes using microphone service ports
     */
    async cleanupMicrophonePorts() {
        logger.info('🧹 Cleaning up microphone service ports...');

        const ports = Object.values(this.serviceDefinitions).map(config => config.port);

        for (const port of ports) {
            try {
                await this.killProcessesOnPort(port);
            } catch (error) {
                logger.warn(`Warning cleaning up port ${port}:`, error.message);
            }
        }

        // Wait a moment for cleanup to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.info('✅ Port cleanup completed');
    }

    /**
     * Kill processes using a specific port
     */
    async killProcessesOnPort(port) {
        const { spawn } = require('child_process');

        return new Promise((resolve) => {
            // Use lsof to find processes using the port
            const lsofProcess = spawn('lsof', ['-ti', `:${port}`], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let pids = '';
            lsofProcess.stdout.on('data', (data) => {
                pids += data.toString();
            });

            lsofProcess.on('close', (code) => {
                if (code === 0 && pids.trim()) {
                    const pidList = pids.trim().split('\n').filter(pid => pid.trim());
                    logger.info(`Found ${pidList.length} processes using port ${port}`);

                    for (const pid of pidList) {
                        try {
                            process.kill(parseInt(pid), 'SIGTERM');
                            logger.info(`Killed process ${pid} using port ${port}`);
                        } catch (e) {
                            // Process might already be dead
                            logger.debug(`Process ${pid} already terminated`);
                        }
                    }
                } else {
                    logger.debug(`No processes found using port ${port}`);
                }
                resolve();
            });

            lsofProcess.on('error', () => {
                logger.debug(`lsof command failed for port ${port} (command might not be available)`);
                resolve(); // lsof might not be available
            });
        });
    }

    /**
     * Start all microphone services
     */
    async startAllServices() {
        logger.info('🚀 Starting microphone services...');

        // First, cleanup any existing processes on our ports
        await this.cleanupMicrophonePorts();

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
            let childProcess;

            if (config.type === 'python') {
                childProcess = spawn('python3', [scriptPath, ...config.args], {
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            } else if (config.type === 'node') {
                childProcess = spawn('node', [scriptPath, ...config.args], {
                    detached: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });
            }

            if (childProcess) {
                // Handle process output
                childProcess.stdout.on('data', (data) => {
                    logger.info(`${config.name}: ${data.toString().trim()}`);
                });

                childProcess.stderr.on('data', (data) => {
                    const message = data.toString().trim();
                    // Filter out common non-error messages and INFO logs
                    if (!this.isIgnorableMessage(message)) {
                        // Check if it's an INFO level message from Python service
                        if (message.includes('INFO:') && (message.includes('websockets.server') || message.includes('base_hardware_service'))) {
                            // Log INFO messages as debug instead of warning
                            logger.debug(`${config.name}: ${message}`);
                        } else {
                            logger.warn(`${config.name}: ${message}`);
                        }
                    }
                });

                childProcess.on('error', (error) => {
                    logger.error(`${config.name} process error:`, error);
                });

                childProcess.on('exit', (code, signal) => {
                    if (code !== 0) {
                        logger.error(`${config.name} exited with code ${code}, signal ${signal}`);
                    }
                    this.services.delete(serviceId);
                });

                childProcess.unref(); // Allow parent to exit independently
                this.services.set(serviceId, {
                    process: childProcess,
                    config: config,
                    startTime: Date.now()
                });

                // Wait for service to start (reduced timeout)
                await this.waitForService(config.port, 8000);

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
            'warning',
            'JackShmReadWritePtr',
            'Init not done for -1',
            'skipping unlock',
            'INFO:websockets.server:server listening',
            'INFO:websockets.server:connection open',
            'INFO:websockets.server:connection closed',
            'INFO:base_hardware_service:✅',
            'INFO:base_hardware_service:Client connected',
            'INFO:base_hardware_service:Client disconnected',
            'INFO:__main__:✅ PyAudio system initialized',
            'INFO:__main__:🎤 Discovered',
            'INFO:__main__:✅ Microphone hardware initialized'
        ];

        return ignorablePatterns.some(pattern =>
            message.includes(pattern)
        );
    }

    /**
     * Wait for a service to become available on a port
     */
    async waitForService(port, timeout = 8000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                // Use IPv4 address to avoid IPv6 connection issues
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

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
            // Use IPv4 address to avoid IPv6 connection issues
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);

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
