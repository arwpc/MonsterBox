/**
 * Hardware Service Manager for Node.js
 * Manages Python hardware WebSocket services from within the main Node.js application
 */

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const HardwareWebSocketProxy = require('../scripts/hardware/websocket_proxy');
const WebSocket = require('ws');
const FallbackHardwareServer = require('./fallbackHardwareServer');

class HardwareServiceManager {
    constructor() {
        this.hardwareProcess = null;
        this.fallbackServer = null;
        this.isRunning = false;
        this.webSocketProxy = new HardwareWebSocketProxy();
        this.usingFallback = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 5000;
        this.healthCheckInterval = null;
        this.services = {
            registry: { port: 8770, status: 'offline' },
            main: { port: 8780, status: 'offline' },
            motor: { port: 8771, status: 'offline' },
            light: { port: 8772, status: 'offline' }
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

            // Start health monitoring
            this.startHealthMonitoring();

            // Start WebSocket proxy for browser compatibility
            const proxyStarted = await this.webSocketProxy.start();
            if (!proxyStarted) {
                logger.error('❌ Failed to start WebSocket proxy');
                return false;
            }

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
                
                // Spawn the Python hardware services process
                this.hardwareProcess = spawn('python3', [hardwareScriptPath], {
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
                    }
                });

                this.hardwareProcess.stderr.on('data', (data) => {
                    const error = data.toString().trim();
                    if (error && !error.includes('WARNING')) {
                        logger.error(`[Hardware Services Error] ${error}`);
                    } else if (error) {
                        logger.warn(`[Hardware Services Warning] ${error}`);
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

                // Give the services time to start up
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
                }, 3000);

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

            // Stop WebSocket proxy
            if (this.webSocketProxy) {
                await this.webSocketProxy.stop();
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
}

module.exports = HardwareServiceManager;
