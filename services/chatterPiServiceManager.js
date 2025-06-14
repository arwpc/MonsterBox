/**
 * ChatterPi Service Manager
 * Consolidated service management for all ChatterPi components
 * Integrates jaw animation, AI bridge, and real-time audio processing
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../scripts/logger');

class ChatterPiServiceManager {
    constructor() {
        this.services = new Map();
        this.webSockets = new Map();
        this.isInitialized = false;
        this.config = {
            jawServerPort: 8765,
            aiServerPort: 8766,
            realTimeMode: true,
            autoRestart: true,
            maxRestartAttempts: 3
        };
        
        // Service definitions with real-time optimizations
        this.serviceDefinitions = {
            enhancedJawAnimator: {
                name: 'Enhanced Jaw Animator',
                script: 'scripts/chatterpi/enhanced_audio_jaw_animator.py',
                args: ['--real-time'],
                port: 8765,
                healthCheck: () => this.checkWebSocketConnection('jawAnimator'),
                critical: true
            },
            audioServoBridge: {
                name: 'Audio-Servo Bridge',
                script: 'scripts/chatterpi/audio_servo_bridge.py',
                args: ['--websocket-url', 'ws://localhost:3000'],
                port: null,
                healthCheck: () => this.checkServiceHealth('audioServoBridge'),
                critical: true
            },
            jawControlSystem: {
                name: 'Jaw Control System',
                script: 'scripts/chatterpi/gpio_jaw_server.py',
                args: ['--host', '0.0.0.0', '--port', '8765', '--servo-pin', '18'],
                port: 8765,
                healthCheck: () => this.checkWebSocketConnection('jawControl'),
                critical: true
            }
        };
        
        logger.info('ChatterPi Service Manager initialized');
    }
    
    /**
     * Initialize all ChatterPi services with real-time configuration
     */
    async initialize() {
        if (this.isInitialized) {
            logger.info('ChatterPi services already initialized');
            return true;
        }
        
        try {
            logger.info('🚀 Initializing ChatterPi services with real-time optimizations...');
            
            // Apply real-time configuration first
            await this.applyRealTimeConfiguration();
            
            // Start services in optimal order
            const startupOrder = ['enhancedJawAnimator', 'audioServoBridge'];
            
            for (const serviceId of startupOrder) {
                const success = await this.startService(serviceId);
                if (!success && this.serviceDefinitions[serviceId].critical) {
                    throw new Error(`Failed to start critical service: ${serviceId}`);
                }
                
                // Brief delay between service starts
                await this.delay(1000);
            }
            
            // Setup WebSocket connections
            await this.setupWebSocketConnections();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            this.isInitialized = true;
            logger.info('✅ ChatterPi services initialized successfully');
            
            return true;
            
        } catch (error) {
            logger.error('❌ Failed to initialize ChatterPi services:', error);
            await this.cleanup();
            return false;
        }
    }
    
    /**
     * Apply real-time timing configuration
     */
    async applyRealTimeConfiguration() {
        try {
            logger.info('⚙️ Applying real-time timing configuration...');
            
            const configScript = path.join(process.cwd(), 'scripts/chatterpi/apply_real_time_fix.py');
            
            if (await this.fileExists(configScript)) {
                const configProcess = spawn('python3', [configScript], {
                    cwd: process.cwd(),
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                await this.waitForProcess(configProcess, 'Real-time config application');
                logger.info('✅ Real-time configuration applied');
            } else {
                logger.warn('Real-time config script not found, using default settings');
            }
            
        } catch (error) {
            logger.error('Failed to apply real-time configuration:', error);
            // Continue anyway - not critical for basic operation
        }
    }
    
    /**
     * Start a specific service
     */
    async startService(serviceId) {
        const serviceDef = this.serviceDefinitions[serviceId];
        if (!serviceDef) {
            logger.error(`Unknown service: ${serviceId}`);
            return false;
        }
        
        try {
            logger.info(`🔄 Starting ${serviceDef.name}...`);
            
            const scriptPath = path.join(process.cwd(), serviceDef.script);
            
            if (!(await this.fileExists(scriptPath))) {
                logger.error(`Service script not found: ${scriptPath}`);
                return false;
            }
            
            const childProcess = spawn('python3', [scriptPath, ...serviceDef.args], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            // Setup process monitoring
            this.setupProcessMonitoring(serviceId, childProcess, serviceDef);

            // Store service info
            this.services.set(serviceId, {
                process: childProcess,
                definition: serviceDef,
                startTime: Date.now(),
                restartCount: 0,
                status: 'starting'
            });
            
            // Wait for service to be ready
            await this.waitForServiceReady(serviceId);
            
            logger.info(`✅ ${serviceDef.name} started successfully (PID: ${process.pid})`);
            return true;
            
        } catch (error) {
            logger.error(`❌ Failed to start ${serviceDef.name}:`, error);
            return false;
        }
    }
    
    /**
     * Setup process monitoring for auto-restart
     */
    setupProcessMonitoring(serviceId, process, serviceDef) {
        process.stdout.on('data', (data) => {
            logger.info(`[${serviceDef.name}] ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
            logger.error(`[${serviceDef.name}] ${data.toString().trim()}`);
        });
        
        process.on('close', (code) => {
            logger.warn(`${serviceDef.name} process exited with code ${code}`);
            this.handleServiceExit(serviceId, code);
        });
        
        process.on('error', (error) => {
            logger.error(`${serviceDef.name} process error:`, error);
            this.handleServiceExit(serviceId, -1);
        });
    }
    
    /**
     * Handle service exit and auto-restart if needed
     */
    async handleServiceExit(serviceId, exitCode) {
        const service = this.services.get(serviceId);
        if (!service) return;
        
        service.status = 'stopped';
        
        if (this.config.autoRestart && service.restartCount < this.config.maxRestartAttempts) {
            logger.info(`🔄 Auto-restarting ${service.definition.name} (attempt ${service.restartCount + 1})`);
            
            service.restartCount++;
            
            // Brief delay before restart
            await this.delay(2000);
            
            await this.startService(serviceId);
        } else {
            logger.error(`❌ ${service.definition.name} failed permanently or restart limit reached`);
        }
    }
    
    /**
     * Setup WebSocket connections to services
     */
    async setupWebSocketConnections() {
        logger.info('🔌 Setting up WebSocket connections...');
        
        // Connect to jaw animator
        await this.connectWebSocket('jawAnimator', 'ws://localhost:8765');
        
        logger.info('✅ WebSocket connections established');
    }
    
    /**
     * Connect to a WebSocket service
     */
    async connectWebSocket(connectionId, url) {
        try {
            const ws = new WebSocket(url);
            
            ws.on('open', () => {
                logger.info(`✅ Connected to ${connectionId} at ${url}`);
                this.webSockets.set(connectionId, ws);
            });
            
            ws.on('error', (error) => {
                logger.error(`❌ WebSocket error for ${connectionId}:`, error.message);
            });
            
            ws.on('close', () => {
                logger.warn(`🔌 WebSocket disconnected: ${connectionId}`);
                this.webSockets.delete(connectionId);
                
                // Auto-reconnect after delay
                if (this.config.autoRestart) {
                    setTimeout(() => this.connectWebSocket(connectionId, url), 5000);
                }
            });
            
            // Wait for connection
            await this.waitForWebSocketConnection(ws, 5000);
            
        } catch (error) {
            logger.error(`Failed to connect WebSocket ${connectionId}:`, error);
        }
    }
    
    /**
     * Get WebSocket connection for external use
     */
    getWebSocket(connectionId) {
        const ws = this.webSockets.get(connectionId);
        return (ws && ws.readyState === WebSocket.OPEN) ? ws : null;
    }
    
    /**
     * Send message to jaw animation system
     */
    sendJawCommand(command) {
        const ws = this.getWebSocket('jawAnimator');
        if (ws) {
            ws.send(JSON.stringify(command));
            return true;
        }
        logger.warn('Jaw animator WebSocket not available');
        return false;
    }
    
    /**
     * Get service status
     */
    getServiceStatus() {
        const status = {
            initialized: this.isInitialized,
            services: {},
            webSockets: {},
            timestamp: new Date().toISOString()
        };
        
        // Service status
        for (const [serviceId, service] of this.services) {
            status.services[serviceId] = {
                name: service.definition.name,
                status: service.status,
                pid: service.process ? service.process.pid : null,
                uptime: Date.now() - service.startTime,
                restartCount: service.restartCount
            };
        }
        
        // WebSocket status
        for (const [connectionId, ws] of this.webSockets) {
            status.webSockets[connectionId] = {
                connected: ws.readyState === WebSocket.OPEN,
                readyState: ws.readyState
            };
        }
        
        return status;
    }
    
    /**
     * Cleanup all services
     */
    async cleanup() {
        logger.info('🧹 Cleaning up ChatterPi services...');
        
        // Close WebSocket connections
        for (const [connectionId, ws] of this.webSockets) {
            try {
                ws.close();
            } catch (error) {
                logger.error(`Error closing WebSocket ${connectionId}:`, error);
            }
        }
        this.webSockets.clear();
        
        // Stop all services
        for (const [serviceId, service] of this.services) {
            try {
                if (service.process && !service.process.killed) {
                    service.process.kill('SIGTERM');
                    
                    // Force kill after timeout
                    setTimeout(() => {
                        if (!service.process.killed) {
                            service.process.kill('SIGKILL');
                        }
                    }, 5000);
                }
            } catch (error) {
                logger.error(`Error stopping service ${serviceId}:`, error);
            }
        }
        this.services.clear();
        
        this.isInitialized = false;
        logger.info('✅ ChatterPi services cleaned up');
    }
    
    // Utility methods
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async waitForProcess(process, name) {
        return new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`${name} exited with code ${code}`));
                }
            });
        });
    }
    
    async waitForServiceReady(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) return false;
        
        // Wait up to 10 seconds for service to be ready
        for (let i = 0; i < 20; i++) {
            await this.delay(500);
            
            if (service.definition.healthCheck && await service.definition.healthCheck()) {
                service.status = 'running';
                return true;
            }
        }
        
        service.status = 'failed';
        return false;
    }
    
    async waitForWebSocketConnection(ws, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, timeout);
            
            ws.on('open', () => {
                clearTimeout(timer);
                resolve();
            });
            
            ws.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    
    async checkWebSocketConnection(connectionId) {
        const ws = this.webSockets.get(connectionId);
        return ws && ws.readyState === WebSocket.OPEN;
    }
    
    async checkServiceHealth(serviceId) {
        const service = this.services.get(serviceId);
        return service && service.process && !service.process.killed;
    }
    
    startHealthMonitoring() {
        // Health check every 30 seconds
        setInterval(() => {
            this.performHealthCheck();
        }, 30000);
    }
    
    async performHealthCheck() {
        for (const [serviceId, service] of this.services) {
            if (service.definition.healthCheck) {
                const healthy = await service.definition.healthCheck();
                if (!healthy && service.status === 'running') {
                    logger.warn(`Health check failed for ${service.definition.name}`);
                    service.status = 'unhealthy';
                }
            }
        }
    }
}

module.exports = ChatterPiServiceManager;
