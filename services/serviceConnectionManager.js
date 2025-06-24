/**
 * Service Connection Manager for MonsterBox
 * 
 * Manages connections to various MonsterBox services including WebSocket services,
 * hardware services, AI services, and provides unified connection management.
 */

const ConnectionPool = require('./connectionManager');
const WebSocket = require('ws');
const logger = require('../scripts/logger');

class ServiceConnectionManager {
    constructor(options = {}) {
        this.connectionPool = new ConnectionPool({
            maxConnections: 100,
            connectionTimeout: 30000,
            retryInterval: 5000,
            maxRetries: 5,
            healthCheckInterval: 30000,
            ...options
        });

        this.serviceDefinitions = {
            // Hardware Services
            servoService: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8772',
                critical: true,
                autoReconnect: true,
                description: 'Unified Servo Control and Jaw Animation Service'
            },
            hardwareRegistry: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8770',
                critical: true,
                autoReconnect: true,
                description: 'Hardware Registry Service'
            },
            motorService: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8771',
                critical: false,
                autoReconnect: true,
                description: 'Motor Control Service'
            },
            lightService: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8773',
                critical: false,
                autoReconnect: true,
                description: 'Light Control Service'
            },
            mainHardware: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8780',
                critical: true,
                autoReconnect: true,
                description: 'Main Hardware Service'
            },

            // ChatterPi Services (legacy)
            jawAnimation: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8765',
                critical: false,
                autoReconnect: true,
                description: 'Legacy Jaw Animation WebSocket Server',
                deprecated: true
            },
            aibridge: {
                type: 'websocket',
                url: 'ws://127.0.0.1:8766',
                critical: false,
                autoReconnect: true,
                description: 'AI Bridge WebSocket Server'
            }
        };

        this.connectionStates = new Map();
        this.initializationPromises = new Map();
        
        // Set up event handlers
        this.setupEventHandlers();
    }

    /**
     * Initialize all service connections
     */
    async initialize() {
        logger.info('🔌 Initializing Service Connection Manager...');
        
        const initPromises = [];
        
        for (const [serviceId, definition] of Object.entries(this.serviceDefinitions)) {
            if (definition.critical) {
                // Initialize critical services first
                initPromises.push(this.initializeService(serviceId, definition));
            }
        }
        
        // Wait for critical services
        const criticalResults = await Promise.allSettled(initPromises);
        
        // Initialize non-critical services
        const nonCriticalPromises = [];
        for (const [serviceId, definition] of Object.entries(this.serviceDefinitions)) {
            if (!definition.critical) {
                nonCriticalPromises.push(this.initializeService(serviceId, definition));
            }
        }
        
        await Promise.allSettled(nonCriticalPromises);
        
        // Check if any critical services failed
        const criticalFailures = criticalResults.filter(result => result.status === 'rejected');
        if (criticalFailures.length > 0) {
            logger.warn(`${criticalFailures.length} critical services failed to initialize`);
        }
        
        logger.info('✅ Service Connection Manager initialized');
        return true;
    }

    /**
     * Initialize a specific service
     */
    async initializeService(serviceId, definition) {
        try {
            logger.info(`🔄 Initializing service: ${serviceId}`);
            
            if (definition.type === 'websocket') {
                await this.initializeWebSocketService(serviceId, definition);
            }
            
            this.connectionStates.set(serviceId, 'connected');
            logger.info(`✅ Service initialized: ${serviceId}`);
            
        } catch (error) {
            logger.error(`❌ Failed to initialize service ${serviceId}:`, error.message);
            this.connectionStates.set(serviceId, 'failed');
            
            if (definition.critical) {
                throw error;
            }
        }
    }

    /**
     * Initialize WebSocket service
     */
    async initializeWebSocketService(serviceId, definition) {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(definition.url);
            const timeout = setTimeout(() => {
                reject(new Error(`WebSocket connection timeout for ${serviceId}`));
            }, 10000);

            ws.on('open', () => {
                clearTimeout(timeout);
                
                // Add to connection pool
                this.connectionPool.addConnection(serviceId, ws, 'websocket', {
                    url: definition.url,
                    autoReconnect: definition.autoReconnect,
                    metadata: {
                        description: definition.description,
                        critical: definition.critical
                    }
                });
                
                resolve();
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * Get service connection
     */
    getServiceConnection(serviceId) {
        return this.connectionPool.getConnection(serviceId);
    }

    /**
     * Send message to service
     */
    async sendToService(serviceId, message) {
        const connection = this.getServiceConnection(serviceId);
        if (!connection) {
            throw new Error(`Service not connected: ${serviceId}`);
        }

        if (connection instanceof WebSocket && connection.readyState === WebSocket.OPEN) {
            const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
            connection.send(messageStr);
            return true;
        }
        
        throw new Error(`Service connection not ready: ${serviceId}`);
    }

    /**
     * Check service health
     */
    async checkServiceHealth(serviceId) {
        const connection = this.getServiceConnection(serviceId);
        if (!connection) {
            return { healthy: false, reason: 'Not connected' };
        }

        if (connection instanceof WebSocket) {
            if (connection.readyState === WebSocket.OPEN) {
                return { healthy: true, readyState: 'OPEN' };
            } else {
                return { 
                    healthy: false, 
                    reason: 'WebSocket not open',
                    readyState: connection.readyState 
                };
            }
        }

        return { healthy: false, reason: 'Unknown connection type' };
    }

    /**
     * Get all service statuses
     */
    async getServiceStatuses() {
        const statuses = {};
        
        for (const serviceId of Object.keys(this.serviceDefinitions)) {
            const health = await this.checkServiceHealth(serviceId);
            const state = this.connectionStates.get(serviceId) || 'unknown';
            
            statuses[serviceId] = {
                state,
                health: health.healthy,
                details: health,
                definition: this.serviceDefinitions[serviceId]
            };
        }
        
        return statuses;
    }

    /**
     * Restart service connection
     */
    async restartService(serviceId) {
        logger.info(`🔄 Restarting service: ${serviceId}`);
        
        // Remove existing connection
        await this.connectionPool.removeConnection(serviceId);
        
        // Reinitialize
        const definition = this.serviceDefinitions[serviceId];
        if (definition) {
            await this.initializeService(serviceId, definition);
            return true;
        }
        
        return false;
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.connectionPool.on('connectionError', ({ id, error, type }) => {
            logger.error(`Service connection error - ${id} (${type}):`, error.message);
        });

        this.connectionPool.on('connectionClosed', ({ id, type }) => {
            logger.warn(`Service connection closed - ${id} (${type})`);
            this.connectionStates.set(id, 'disconnected');
        });

        this.connectionPool.on('connectionReconnected', ({ id, type }) => {
            logger.info(`Service reconnected - ${id} (${type})`);
            this.connectionStates.set(id, 'connected');
        });

        this.connectionPool.on('connectionFailed', ({ id, type }) => {
            logger.error(`Service connection failed permanently - ${id} (${type})`);
            this.connectionStates.set(id, 'failed');
        });
    }

    /**
     * Get connection statistics
     */
    getConnectionStats() {
        const poolStats = this.connectionPool.getStats();
        const serviceStats = {
            totalServices: Object.keys(this.serviceDefinitions).length,
            connectedServices: 0,
            disconnectedServices: 0,
            failedServices: 0
        };

        for (const state of this.connectionStates.values()) {
            switch (state) {
                case 'connected':
                    serviceStats.connectedServices++;
                    break;
                case 'disconnected':
                    serviceStats.disconnectedServices++;
                    break;
                case 'failed':
                    serviceStats.failedServices++;
                    break;
            }
        }

        return {
            pool: poolStats,
            services: serviceStats
        };
    }

    /**
     * Shutdown all connections
     */
    async shutdown() {
        logger.info('🔌 Shutting down Service Connection Manager...');
        await this.connectionPool.cleanup();
        this.connectionStates.clear();
        logger.info('✅ Service Connection Manager shutdown complete');
    }
}

module.exports = ServiceConnectionManager;
