/**
 * Connection Manager for MonsterBox
 * 
 * Manages all external connections including WebSockets, file handles,
 * service connections, and provides connection pooling, retry mechanisms,
 * and health monitoring.
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

class ConnectionPool extends EventEmitter {
    constructor(options = {}) {
        super();
        this.connections = new Map();
        this.healthChecks = new Map();
        this.retryAttempts = new Map();
        this.config = {
            maxConnections: options.maxConnections || 50,
            connectionTimeout: options.connectionTimeout || 30000,
            retryInterval: options.retryInterval || 5000,
            maxRetries: options.maxRetries || 3,
            healthCheckInterval: options.healthCheckInterval || 60000,
            ...options
        };
        
        // Start health check monitoring
        this.startHealthMonitoring();
    }

    /**
     * Add a connection to the pool
     */
    addConnection(id, connection, type, options = {}) {
        if (this.connections.size >= this.config.maxConnections) {
            throw new Error(`Connection pool limit reached (${this.config.maxConnections})`);
        }

        const connectionInfo = {
            id,
            connection,
            type,
            status: 'connected',
            createdAt: Date.now(),
            lastUsed: Date.now(),
            retryCount: 0,
            options,
            metadata: options.metadata || {}
        };

        this.connections.set(id, connectionInfo);
        this.retryAttempts.set(id, 0);
        
        // Set up connection event handlers
        this.setupConnectionHandlers(connectionInfo);
        
        logger.info(`Connection added to pool: ${id} (${type})`);
        this.emit('connectionAdded', connectionInfo);
        
        return connectionInfo;
    }

    /**
     * Get a connection from the pool
     */
    getConnection(id) {
        const connectionInfo = this.connections.get(id);
        if (connectionInfo) {
            connectionInfo.lastUsed = Date.now();
            return connectionInfo.connection;
        }
        return null;
    }

    /**
     * Remove a connection from the pool
     */
    async removeConnection(id) {
        const connectionInfo = this.connections.get(id);
        if (!connectionInfo) return false;

        try {
            // Close connection gracefully
            await this.closeConnection(connectionInfo);
            
            this.connections.delete(id);
            this.retryAttempts.delete(id);
            this.healthChecks.delete(id);
            
            logger.info(`Connection removed from pool: ${id}`);
            this.emit('connectionRemoved', { id, type: connectionInfo.type });
            
            return true;
        } catch (error) {
            logger.error(`Error removing connection ${id}:`, error);
            return false;
        }
    }

    /**
     * Setup connection event handlers
     */
    setupConnectionHandlers(connectionInfo) {
        const { connection, type, id } = connectionInfo;

        if (type === 'websocket' && connection instanceof WebSocket) {
            connection.on('error', (error) => {
                logger.error(`WebSocket error for ${id}:`, error);
                this.handleConnectionError(id, error);
            });

            connection.on('close', () => {
                logger.warn(`WebSocket closed: ${id}`);
                this.handleConnectionClose(id);
            });

            connection.on('pong', () => {
                // Update health status on pong response
                this.updateHealthStatus(id, true);
            });
        }

        // Add file handle monitoring for file connections
        if (type === 'file') {
            // File handles don't have events, but we can monitor them
            this.scheduleFileHealthCheck(id);
        }
    }

    /**
     * Handle connection errors
     */
    async handleConnectionError(id, error) {
        const connectionInfo = this.connections.get(id);
        if (!connectionInfo) return;

        connectionInfo.status = 'error';
        connectionInfo.lastError = error;
        
        this.emit('connectionError', { id, error, type: connectionInfo.type });

        // Attempt retry if configured
        if (connectionInfo.options.autoRetry !== false) {
            await this.retryConnection(id);
        }
    }

    /**
     * Handle connection close
     */
    async handleConnectionClose(id) {
        const connectionInfo = this.connections.get(id);
        if (!connectionInfo) return;

        connectionInfo.status = 'closed';
        
        this.emit('connectionClosed', { id, type: connectionInfo.type });

        // Attempt reconnection if configured
        if (connectionInfo.options.autoReconnect !== false) {
            await this.retryConnection(id);
        }
    }

    /**
     * Retry connection
     */
    async retryConnection(id) {
        const connectionInfo = this.connections.get(id);
        if (!connectionInfo) return;

        const retryCount = this.retryAttempts.get(id) || 0;
        if (retryCount >= this.config.maxRetries) {
            logger.error(`Max retries exceeded for connection ${id}`);
            connectionInfo.status = 'failed';
            this.emit('connectionFailed', { id, type: connectionInfo.type });
            return;
        }

        this.retryAttempts.set(id, retryCount + 1);
        
        logger.info(`Retrying connection ${id} (attempt ${retryCount + 1})`);
        
        setTimeout(async () => {
            try {
                await this.reconnectConnection(connectionInfo);
            } catch (error) {
                logger.error(`Retry failed for connection ${id}:`, error);
                await this.retryConnection(id); // Recursive retry
            }
        }, this.config.retryInterval);
    }

    /**
     * Reconnect a connection
     */
    async reconnectConnection(connectionInfo) {
        const { id, type, options } = connectionInfo;

        if (type === 'websocket') {
            const newConnection = new WebSocket(options.url);
            await this.waitForWebSocketConnection(newConnection);
            
            connectionInfo.connection = newConnection;
            connectionInfo.status = 'connected';
            connectionInfo.retryCount = this.retryAttempts.get(id);
            
            this.setupConnectionHandlers(connectionInfo);
            this.retryAttempts.set(id, 0); // Reset retry count on success
            
            logger.info(`Successfully reconnected WebSocket: ${id}`);
            this.emit('connectionReconnected', { id, type });
        }
    }

    /**
     * Wait for WebSocket connection
     */
    waitForWebSocketConnection(ws, timeout = this.config.connectionTimeout) {
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

    /**
     * Close a connection gracefully
     */
    async closeConnection(connectionInfo) {
        const { connection, type } = connectionInfo;

        if (type === 'websocket' && connection.readyState === WebSocket.OPEN) {
            connection.close();
        } else if (type === 'file' && connection.close) {
            await connection.close();
        }
    }

    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);
    }

    /**
     * Perform health checks on all connections
     */
    async performHealthChecks() {
        for (const [id, connectionInfo] of this.connections) {
            try {
                await this.checkConnectionHealth(id, connectionInfo);
            } catch (error) {
                logger.error(`Health check failed for ${id}:`, error);
            }
        }
    }

    /**
     * Check health of a specific connection
     */
    async checkConnectionHealth(id, connectionInfo) {
        const { connection, type } = connectionInfo;

        if (type === 'websocket') {
            if (connection.readyState === WebSocket.OPEN) {
                // Send ping to check responsiveness
                connection.ping();
                this.scheduleHealthTimeout(id);
            } else {
                this.updateHealthStatus(id, false);
            }
        } else if (type === 'file') {
            // Check if file is still accessible
            try {
                await fs.access(connectionInfo.options.path);
                this.updateHealthStatus(id, true);
            } catch {
                this.updateHealthStatus(id, false);
            }
        }
    }

    /**
     * Schedule health check timeout
     */
    scheduleHealthTimeout(id) {
        setTimeout(() => {
            if (!this.healthChecks.get(id)) {
                this.updateHealthStatus(id, false);
                logger.warn(`Health check timeout for connection: ${id}`);
            }
        }, 5000);
    }

    /**
     * Update health status
     */
    updateHealthStatus(id, healthy) {
        this.healthChecks.set(id, healthy);
        const connectionInfo = this.connections.get(id);
        if (connectionInfo) {
            connectionInfo.healthy = healthy;
            connectionInfo.lastHealthCheck = Date.now();
        }
    }

    /**
     * Get connection statistics
     */
    getStats() {
        const stats = {
            totalConnections: this.connections.size,
            connectionsByType: {},
            healthyConnections: 0,
            unhealthyConnections: 0
        };

        for (const connectionInfo of this.connections.values()) {
            const type = connectionInfo.type;
            stats.connectionsByType[type] = (stats.connectionsByType[type] || 0) + 1;
            
            if (connectionInfo.healthy) {
                stats.healthyConnections++;
            } else {
                stats.unhealthyConnections++;
            }
        }

        return stats;
    }

    /**
     * Cleanup all connections
     */
    async cleanup() {
        logger.info('Cleaning up connection pool...');
        
        const cleanupPromises = [];
        for (const [id] of this.connections) {
            cleanupPromises.push(this.removeConnection(id));
        }
        
        await Promise.all(cleanupPromises);
        logger.info('Connection pool cleanup completed');
    }
}

module.exports = ConnectionPool;
