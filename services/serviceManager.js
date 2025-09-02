/**
 * Service Manager for MonsterBox
 * Handles starting, stopping, and monitoring of WebSocket services
 */

const { spawn, exec } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const logger = require('../scripts/logger');

class ServiceManager {
    constructor() {
        this.services = new Map();
        this.serviceDefinitions = {
            // Hardware Services
            servoService: {
                name: 'Unified Servo WebSocket Service',
                port: 8404,
                script: 'scripts/hardware/servo_websocket_service.py',
                type: 'python',
                critical: true,
                description: 'Unified servo control and jaw animation service'
            },
            microphone: {
                name: 'Microphone WebSocket Service',
                port: 8409,
                script: 'scripts/hardware/microphone_websocket_service.py',
                type: 'python',
                critical: true
            },
            audioStream: {
                name: 'Audio Stream Service',
                port: 8777,
                script: 'services/audioStreamService.js',
                type: 'node',
                critical: true
            }
        };
    }

    /**
     * Restart a specific service
     * @param {string} serviceType - Type of service to restart
     * @param {number} port - Port number of the service
     * @returns {boolean} Success status
     */
    async restartService(serviceType, port) {
        try {
            logger.info(`🔄 Restarting ${serviceType} service on port ${port}`);

            // Stop the service first
            await this.stopService(serviceType, port);

            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Start the service
            const started = await this.startService(serviceType);

            if (started) {
                logger.info(`✅ Successfully restarted ${serviceType} service`);
                return true;
            } else {
                logger.error(`❌ Failed to restart ${serviceType} service`);
                return false;
            }
        } catch (error) {
            logger.error(`Error restarting ${serviceType} service:`, error);
            return false;
        }
    }

    /**
     * Stop a service running on a specific port
     * @param {string} serviceType - Type of service
     * @param {number} port - Port number
     */
    async stopService(serviceType, port) {
        try {
            // Kill process using port
            const killCommand = process.platform === 'win32'
                ? `netstat -ano | findstr :${port} | for /f "tokens=5" %a in ('more') do taskkill /PID %a /F`
                : `lsof -ti:${port} | xargs kill -9`;

            await new Promise((resolve, reject) => {
                exec(killCommand, (error, stdout, stderr) => {
                    if (error && !error.message.includes('No such process')) {
                        logger.warn(`Warning stopping service on port ${port}:`, error.message);
                    }
                    resolve();
                });
            });

            logger.info(`🛑 Stopped service on port ${port}`);
        } catch (error) {
            logger.error(`Error stopping service on port ${port}:`, error);
        }
    }

    /**
     * Start a specific service
     * @param {string} serviceType - Type of service to start
     * @returns {boolean} Success status
     */
    async startService(serviceType) {
        try {
            const serviceConfig = this.serviceDefinitions[serviceType];
            if (!serviceConfig) {
                logger.error(`Unknown service type: ${serviceType}`);
                return false;
            }

            const scriptPath = path.join(process.cwd(), serviceConfig.script);
            let process;

            if (serviceConfig.type === 'python') {
                process = spawn('python3', [scriptPath, '--host', '0.0.0.0', '--port', serviceConfig.port.toString()], {
                    detached: true,
                    stdio: 'ignore'
                });
            } else if (serviceConfig.type === 'node') {
                process = spawn('node', [scriptPath], {
                    detached: true,
                    stdio: 'ignore'
                });
            }

            if (process) {
                process.unref(); // Allow parent to exit independently
                this.services.set(serviceType, {
                    process: process,
                    config: serviceConfig,
                    startTime: Date.now()
                });

                // Wait for service to start
                await this.waitForService(serviceConfig.port, 10000);

                logger.info(`🚀 Started ${serviceConfig.name} on port ${serviceConfig.port}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error starting ${serviceType} service:`, error);
            return false;
        }
    }

    /**
     * Wait for a service to become available on a port
     * @param {number} port - Port to check
     * @param {number} timeout - Timeout in milliseconds
     */
    async waitForService(port, timeout = 10000) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const ws = new WebSocket(`ws://127.0.0.1:${port}`);

                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        ws.close();
                        reject(new Error('Connection timeout'));
                    }, 1000);

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
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        throw new Error(`Service on port ${port} did not start within ${timeout}ms`);
    }

    /**
     * Get status of all services
     * @returns {Object} Service status information
     */
    async getServicesStatus() {
        const status = {};

        for (const [serviceType, config] of Object.entries(this.serviceDefinitions)) {
            try {
                const isRunning = await this.checkServiceStatus(config.port);
                status[serviceType] = {
                    name: config.name,
                    port: config.port,
                    running: isRunning,
                    critical: config.critical,
                    lastChecked: new Date().toISOString()
                };
            } catch (error) {
                status[serviceType] = {
                    name: config.name,
                    port: config.port,
                    running: false,
                    critical: config.critical,
                    error: error.message,
                    lastChecked: new Date().toISOString()
                };
            }
        }

        return status;
    }

    /**
     * Check if a service is running on a specific port
     * @param {number} port - Port to check
     * @returns {boolean} Service status
     */
    async checkServiceStatus(port) {
        try {
            // Use IPv4 address to avoid IPv6 connection issues
            const ws = new WebSocket(`ws://127.0.0.1:${port}`);

            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 2000);

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
     * Start all critical services
     */
    async startAllServices() {
        logger.info('🚀 Starting all MonsterBox services...');

        const results = [];
        for (const [serviceType, config] of Object.entries(this.serviceDefinitions)) {
            if (config.critical) {
                const started = await this.startService(serviceType);
                results.push({ serviceType, started });
            }
        }

        const successCount = results.filter(r => r.started).length;
        logger.info(`✅ Started ${successCount}/${results.length} critical services`);

        return results;
    }

    /**
     * Stop all services
     */
    async stopAllServices() {
        logger.info('🛑 Stopping all MonsterBox services...');

        for (const [serviceType, config] of Object.entries(this.serviceDefinitions)) {
            await this.stopService(serviceType, config.port);
        }

        this.services.clear();
        logger.info('✅ All services stopped');
    }

    /**
     * Get service health check
     */
    async healthCheck() {
        const status = await this.getServicesStatus();
        const criticalServices = Object.values(status).filter(s => s.critical);
        const runningCritical = criticalServices.filter(s => s.running);

        return {
            overall: runningCritical.length === criticalServices.length ? 'healthy' : 'degraded',
            criticalServices: criticalServices.length,
            runningCritical: runningCritical.length,
            services: status,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = ServiceManager;
