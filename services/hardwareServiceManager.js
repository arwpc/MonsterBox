/**
 * Hardware Service Manager for Node.js
 * Manages Python hardware WebSocket services from within the main Node.js application
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

const WebSocket = require('ws');
const FallbackHardwareServer = require('./fallbackHardwareServer');
const HardwareWebSocketProxy = require('../scripts/hardware/websocket_proxy');

class HardwareServiceManager {
    constructor() {
        this.hardwareProcess = null;
        this.fallbackServer = null;
        this.webSocketProxy = null;
        this.isRunning = false;

        this.usingFallback = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 5000;
        this.healthCheckInterval = null;
        this.services = {
            registry: { port: 8770, status: 'offline' },
            main: { port: 8780, status: 'offline' },
            motor: { port: 8771, status: 'offline' },
            light: { port: 8772, status: 'offline' },
            sensor: { port: 8773, status: 'offline' },
            webcam: { port: 8774, status: 'offline' },
            actuator: { port: 8775, status: 'offline' },
            head_tracking: { port: 8778, status: 'offline' }
        };
    }

    async initialize() {
        try {
            logger.info('🚀 Initializing Hardware Service Manager...');

            // Try to start Python hardware services first
            const pythonSuccess = await this.startHardwareServices();

            if (!pythonSuccess) {
                logger.warn('⚠️ Python services failed, starting fallback Node.js services...');
                await this.startFallbackServices();
            }

            // Start WebSocket proxy for browser compatibility
            await this.startWebSocketProxy();

            // Start health monitoring
            this.startHealthMonitoring();

            logger.info('✅ Hardware Service Manager initialized successfully');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Hardware Service Manager:', error);

            // Try fallback as last resort
            try {
                logger.info('🔄 Attempting fallback services as last resort...');
                await this.startFallbackServices();
                return true;
            } catch (fallbackError) {
                logger.error('❌ Fallback services also failed:', fallbackError);
                return false;
            }
        }
    }

    async startHardwareServices() {
        return new Promise((resolve, reject) => {
            try {
                logger.info('🦾 Starting Python Hardware WebSocket Services...');

                const hardwareScriptPath = path.join(__dirname, '..', 'scripts', 'hardware', 'start_hardware_services.py');

                // Spawn the Python hardware services process with character 1 (Orlok)
                this.hardwareProcess = spawn('python3', [hardwareScriptPath, '--character', '1'], {
                    cwd: path.join(__dirname, '..', 'scripts', 'hardware'),
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                // Handle process output
                this.hardwareProcess.stdout.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        logger.info(`[Hardware Services] ${output}`);

                        // Check for successful startup indicators
                        if (output.includes('WebSocket Hardware Server running')) {
                            this.isRunning = true;
                            this.updateServiceStatus('main', 'online');
                        }
                        if (output.includes('Service Registry running')) {
                            this.updateServiceStatus('registry', 'online');
                        }
                        if (output.includes('motor_service WebSocket Server running')) {
                            this.updateServiceStatus('motor', 'online');
                        }
                        if (output.includes('light_service WebSocket Server running')) {
                            this.updateServiceStatus('light', 'online');
                        }
                        if (output.includes('sensor_service WebSocket Server running')) {
                            this.updateServiceStatus('sensor', 'online');
                        }
                        if (output.includes('webcam_service WebSocket Server running')) {
                            this.updateServiceStatus('webcam', 'online');
                        }
                        if (output.includes('actuator_service WebSocket Server running')) {
                            this.updateServiceStatus('actuator', 'online');
                        }
                        if (output.includes('head_tracking_service WebSocket Server running')) {
                            this.updateServiceStatus('head_tracking', 'online');
                        }
                    }
                });

                this.hardwareProcess.stderr.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        // Split multi-line output and process each line separately
                        const lines = output.split('\n').filter(line => line.trim());
                        lines.forEach(line => {
                            this.logServiceOutput('Hardware Services', line.trim(), 'stderr');
                        });
                    }
                });

                this.hardwareProcess.on('close', (code) => {
                    logger.warn(`Hardware services process exited with code ${code}`);
                    this.isRunning = false;
                    this.updateAllServicesStatus('offline');

                    // Attempt to restart if not intentionally stopped
                    if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptRestart();
                    }
                });

                this.hardwareProcess.on('error', (error) => {
                    logger.error('Failed to start hardware services process:', error);
                    reject(error);
                });

                // Give the services more time to start up (increased from 3s to 8s)
                setTimeout(async () => {
                    if (this.hardwareProcess && !this.hardwareProcess.killed) {
                        // Test if services are actually responding
                        const isResponding = await this.testPythonServices();
                        if (isResponding) {
                            logger.info('✅ Hardware services process started successfully');
                            this.isRunning = true;
                            resolve(true);
                        } else {
                            logger.warn('⚠️ Python services started but not responding');
                            resolve(false);
                        }
                    } else {
                        logger.warn('⚠️ Hardware services process failed to start');
                        resolve(false);
                    }
                }, 8000);

            } catch (error) {
                logger.error('Error starting hardware services:', error);
                resolve(false); // Don't reject, allow fallback
            }
        });
    }

    async testPythonServices() {
        try {
            // Quick test to see if main server is responding using TCP connection
            const net = require('net');
            const socket = new net.Socket();

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    socket.destroy();
                    resolve(false);
                }, 3000);

                socket.connect(8780, 'localhost', () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(true);
                });

                socket.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
        }
    }

    async startWebSocketProxy() {
        try {
            logger.info('🌐 Starting Hardware WebSocket Proxy for browser compatibility...');

            this.webSocketProxy = new HardwareWebSocketProxy();
            const success = await this.webSocketProxy.start();

            if (success) {
                logger.info('✅ Hardware WebSocket Proxy started successfully');
                return true;
            } else {
                logger.warn('⚠️ Failed to start WebSocket proxy - browser connections may not work');
                return false;
            }
        } catch (error) {
            logger.error('❌ Error starting WebSocket proxy:', error);
            return false;
        }
    }

    async startFallbackServices() {
        try {
            logger.info('🔄 Starting Node.js fallback hardware services...');

            this.fallbackServer = new FallbackHardwareServer();
            const success = await this.fallbackServer.start();

            if (success) {
                this.isRunning = true;
                this.usingFallback = true;
                this.updateAllServicesStatus('online');
                logger.info('✅ Fallback hardware services started successfully');
                return true;
            } else {
                throw new Error('Failed to start fallback services');
            }

        } catch (error) {
            logger.error('❌ Failed to start fallback services:', error);
            throw error;
        }
    }

    async startCharacterServices(characterId) {
        try {
            logger.info(`🎭 Starting services for character ${characterId}...`);

            // The Python services automatically start with the default character
            // This method is here for future character switching functionality

            return true;
        } catch (error) {
            logger.error(`Failed to start services for character ${characterId}:`, error);
            return false;
        }
    }

    updateServiceStatus(serviceName, status) {
        if (this.services[serviceName]) {
            this.services[serviceName].status = status;
            logger.debug(`Service ${serviceName} status updated to: ${status}`);
        }
    }

    updateAllServicesStatus(status) {
        Object.keys(this.services).forEach(serviceName => {
            this.services[serviceName].status = status;
        });
    }

    startHealthMonitoring() {
        // Check service health every 60 seconds (reduced frequency)
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, 60000);

        logger.info('🏥 Hardware service health monitoring started');
    }

    async performHealthCheck() {
        try {
            // Check if main hardware server is responding
            const isMainHealthy = await this.checkServiceHealth('localhost', 8780);
            this.updateServiceStatus('main', isMainHealthy ? 'online' : 'offline');

            // Check registry service
            const isRegistryHealthy = await this.checkServiceHealth('localhost', 8770);
            this.updateServiceStatus('registry', isRegistryHealthy ? 'online' : 'offline');

            // Check motor service
            const isMotorHealthy = await this.checkServiceHealth('localhost', 8771);
            this.updateServiceStatus('motor', isMotorHealthy ? 'online' : 'offline');

            // Check light service
            const isLightHealthy = await this.checkServiceHealth('localhost', 8772);
            this.updateServiceStatus('light', isLightHealthy ? 'online' : 'offline');

            // Check sensor service
            const isSensorHealthy = await this.checkServiceHealth('localhost', 8773);
            this.updateServiceStatus('sensor', isSensorHealthy ? 'online' : 'offline');

            // Check webcam service
            const isWebcamHealthy = await this.checkServiceHealth('localhost', 8774);
            this.updateServiceStatus('webcam', isWebcamHealthy ? 'online' : 'offline');

            // Check actuator service
            const isActuatorHealthy = await this.checkServiceHealth('localhost', 8775);
            this.updateServiceStatus('actuator', isActuatorHealthy ? 'online' : 'offline');

            // Check head tracking service
            const isHeadTrackingHealthy = await this.checkServiceHealth('localhost', 8778);
            this.updateServiceStatus('head_tracking', isHeadTrackingHealthy ? 'online' : 'offline');

        } catch (error) {
            logger.debug('Health check error (this is normal):', error.message);
        }
    }

    async checkServiceHealth(host, port) {
        return new Promise((resolve) => {
            try {
                // Use a simple TCP connection check instead of WebSocket to avoid interference
                const net = require('net');
                const socket = new net.Socket();

                const timeout = setTimeout(() => {
                    socket.destroy();
                    resolve(false);
                }, 2000); // Reduced timeout to 2 seconds

                socket.connect(port, host, () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve(true);
                });

                socket.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });

            } catch (error) {
                resolve(false);
            }
        });
    }

    async attemptRestart() {
        this.reconnectAttempts++;
        logger.info(`🔄 Attempting to restart hardware services (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(async () => {
            try {
                await this.startHardwareServices();
                this.reconnectAttempts = 0; // Reset on successful restart
            } catch (error) {
                logger.error('Failed to restart hardware services:', error);
            }
        }, this.reconnectDelay);
    }

    getServiceStatus() {
        return {
            isRunning: this.isRunning,
            usingFallback: this.usingFallback,
            services: this.services,
            processId: this.hardwareProcess ? this.hardwareProcess.pid : null,
            fallbackStatus: this.fallbackServer ? this.fallbackServer.getStatus() : null
        };
    }

    async shutdown() {
        try {
            logger.info('🛑 Shutting down Hardware Service Manager...');

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }

            // Stop WebSocket proxy if running
            if (this.webSocketProxy) {
                await this.webSocketProxy.stop();
                this.webSocketProxy = null;
            }

            // Stop fallback server if running
            if (this.fallbackServer) {
                await this.fallbackServer.stop();
                this.fallbackServer = null;
            }

            // Terminate hardware services process
            if (this.hardwareProcess && !this.hardwareProcess.killed) {
                this.hardwareProcess.kill('SIGTERM');

                // Give it time to shut down gracefully
                setTimeout(() => {
                    if (this.hardwareProcess && !this.hardwareProcess.killed) {
                        this.hardwareProcess.kill('SIGKILL');
                    }
                }, 5000);
            }

            this.isRunning = false;
            this.usingFallback = false;
            this.updateAllServicesStatus('offline');

            logger.info('✅ Hardware Service Manager shutdown complete');

        } catch (error) {
            logger.error('Error during hardware service shutdown:', error);
        }
    }

    /**
     * Intelligently log service subprocess output based on content
     * @param {string} serviceName - Name of the service
     * @param {string} output - The output message from service process
     * @param {string} stream - Either 'stdout' or 'stderr'
     */
    logServiceOutput(serviceName, output, stream) {
        // Parse Python logging format: YYYY-MM-DD HH:MM:SS,mmm - LEVEL - message
        const pythonLogPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - (\w+) - (.+)$/;
        // Also handle Python logging format with module names: LEVEL:module:message
        const pythonModuleLogPattern = /^(\w+):[\w._]+:(.+)$/;
        // Handle Python logging format: YYYY-MM-DD HH:MM:SS,mmm - module - LEVEL - message
        const pythonFullLogPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} - [\w._]+ - (\w+) - (.+)$/;

        let match = output.match(pythonLogPattern);
        if (!match) {
            match = output.match(pythonModuleLogPattern);
        }
        if (!match) {
            match = output.match(pythonFullLogPattern);
        }

        if (match) {
            const [, level, message] = match;
            const logMessage = `[${serviceName}] ${message}`;

            // Map Python log levels to Winston log levels
            switch (level.toUpperCase()) {
                case 'DEBUG':
                    logger.debug(logMessage);
                    break;
                case 'INFO':
                    logger.info(logMessage);
                    break;
                case 'WARNING':
                case 'WARN':
                    logger.warn(logMessage);
                    break;
                case 'ERROR':
                    logger.error(logMessage);
                    break;
                case 'CRITICAL':
                case 'FATAL':
                    logger.error(logMessage);
                    break;
                default:
                    // Unknown level, use info for stderr, debug for stdout
                    if (stream === 'stderr') {
                        logger.info(logMessage);
                    } else {
                        logger.debug(logMessage);
                    }
            }
        } else {
            // Non-standard format - check for common patterns
            const lowerOutput = output.toLowerCase();
            const logMessage = `[${serviceName}] ${output}`;

            if (lowerOutput.includes('error') || lowerOutput.includes('failed') || lowerOutput.includes('exception')) {
                logger.error(logMessage);
            } else if (lowerOutput.includes('warning') || lowerOutput.includes('warn')) {
                logger.warn(logMessage);
            } else if (lowerOutput.includes('✅') || lowerOutput.includes('success') || lowerOutput.includes('started') || lowerOutput.includes('initialized')) {
                logger.info(logMessage);
            } else if (stream === 'stderr') {
                // For stderr without clear indicators, use info level (not error)
                logger.info(logMessage);
            } else {
                // For stdout, use debug level for general output
                logger.debug(logMessage);
            }
        }
    }
}

module.exports = HardwareServiceManager;
