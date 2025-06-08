/**
 * Enhanced SSH Connection Manager
 * 
 * Provides robust SSH connection management with connection pooling,
 * keepalive settings, health monitoring, and automatic reconnection
 * for reliable remote execution on Raspberry Pi hosts.
 */

const EventEmitter = require('events');
const { spawn } = require('child_process');
const SSHRetryManager = require('./sshRetryManager');
const logger = require('../../scripts/logger');
const fs = require('fs').promises;
const path = require('path');

class SSHConnection extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.isConnected = false;
        this.lastActivity = null;
        this.connectionId = `${config.host}_${Date.now()}`;
        this.keepaliveInterval = null;
        this.healthCheckInterval = null;
        this.connectionProcess = null;
        this.commandQueue = [];
        this.isExecuting = false;
        
        // Connection statistics
        this.stats = {
            connectTime: null,
            lastUsed: null,
            commandsExecuted: 0,
            errors: 0,
            keepalivesSent: 0,
            keepalivesReceived: 0
        };
    }
    
    /**
     * Establish SSH connection
     */
    async connect() {
        try {
            logger.info(`Establishing SSH connection to ${this.config.host}`);
            
            // Test connection first
            const testResult = await this.testConnection();
            if (!testResult.success) {
                throw new Error(`Connection test failed: ${testResult.error}`);
            }
            
            this.isConnected = true;
            this.stats.connectTime = new Date();
            this.lastActivity = new Date();
            
            // Start keepalive
            this.startKeepalive();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            this.emit('connected', this.connectionId);
            logger.info(`SSH connection established to ${this.config.host}`);
            
            return true;
            
        } catch (error) {
            this.isConnected = false;
            this.emit('connectionError', error);
            logger.error(`Failed to connect to ${this.config.host}:`, error);
            throw error;
        }
    }
    
    /**
     * Test SSH connection
     */
    async testConnection() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({ success: false, error: 'Connection timeout' });
            }, this.config.connectionTimeout || 10000);
            
            const sshArgs = [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'BatchMode=yes',
                '-o', 'PasswordAuthentication=no',
                '-o', 'PubkeyAuthentication=yes',
                `${this.config.user}@${this.config.host}`,
                'echo "SSH_CONNECTION_TEST_SUCCESS"'
            ];
            
            const sshProcess = spawn('ssh', sshArgs);
            let output = '';
            let errorOutput = '';
            
            sshProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            sshProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            sshProcess.on('close', (code) => {
                clearTimeout(timeout);
                
                if (code === 0 && output.includes('SSH_CONNECTION_TEST_SUCCESS')) {
                    resolve({ success: true });
                } else {
                    resolve({ 
                        success: false, 
                        error: errorOutput || `Process exited with code ${code}` 
                    });
                }
            });
            
            sshProcess.on('error', (error) => {
                clearTimeout(timeout);
                resolve({ success: false, error: error.message });
            });
        });
    }
    
    /**
     * Execute command on SSH connection
     */
    async executeCommand(command, options = {}) {
        if (!this.isConnected) {
            throw new Error('SSH connection not established');
        }
        
        return new Promise((resolve, reject) => {
            const timeout = options.timeout || 30000;
            const timeoutHandle = setTimeout(() => {
                reject(new Error('Command execution timeout'));
            }, timeout);
            
            const sshArgs = [
                '-o', 'ConnectTimeout=10',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'BatchMode=yes',
                '-o', 'PasswordAuthentication=no',
                '-o', 'PubkeyAuthentication=yes',
                '-o', 'ServerAliveInterval=30',
                '-o', 'ServerAliveCountMax=3',
                `${this.config.user}@${this.config.host}`,
                command
            ];
            
            const sshProcess = spawn('ssh', sshArgs);
            let stdout = '';
            let stderr = '';
            
            sshProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            sshProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            sshProcess.on('close', (code) => {
                clearTimeout(timeoutHandle);
                
                this.stats.commandsExecuted++;
                this.stats.lastUsed = new Date();
                this.lastActivity = new Date();
                
                if (code === 0) {
                    resolve({
                        success: true,
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        exitCode: code
                    });
                } else {
                    this.stats.errors++;
                    reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
                }
            });
            
            sshProcess.on('error', (error) => {
                clearTimeout(timeoutHandle);
                this.stats.errors++;
                reject(error);
            });
        });
    }
    
    /**
     * Start keepalive mechanism
     */
    startKeepalive() {
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
        }
        
        this.keepaliveInterval = setInterval(async () => {
            try {
                await this.sendKeepalive();
            } catch (error) {
                logger.warn(`Keepalive failed for ${this.config.host}:`, error);
                this.handleConnectionLoss();
            }
        }, this.config.keepaliveInterval || 30000);
    }
    
    /**
     * Send keepalive ping
     */
    async sendKeepalive() {
        this.stats.keepalivesSent++;
        
        try {
            await this.executeCommand('echo "keepalive"', { timeout: 5000 });
            this.stats.keepalivesReceived++;
            this.emit('keepaliveSuccess');
        } catch (error) {
            this.emit('keepaliveFailure', error);
            throw error;
        }
    }
    
    /**
     * Start health monitoring
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.healthCheckInterval || 60000);
    }
    
    /**
     * Perform health check
     */
    async performHealthCheck() {
        try {
            const result = await this.testConnection();
            if (!result.success) {
                this.handleConnectionLoss();
            } else {
                this.emit('healthCheckSuccess');
            }
        } catch (error) {
            logger.warn(`Health check failed for ${this.config.host}:`, error);
            this.handleConnectionLoss();
        }
    }
    
    /**
     * Handle connection loss
     */
    handleConnectionLoss() {
        this.isConnected = false;
        this.emit('connectionLost', this.connectionId);
        logger.warn(`SSH connection lost to ${this.config.host}`);
        
        // Stop intervals
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
    
    /**
     * Disconnect SSH connection
     */
    async disconnect() {
        this.isConnected = false;
        
        // Stop intervals
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
        
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        
        this.emit('disconnected', this.connectionId);
        logger.info(`SSH connection disconnected from ${this.config.host}`);
    }
    
    /**
     * Get connection statistics
     */
    getStatistics() {
        return {
            connectionId: this.connectionId,
            host: this.config.host,
            isConnected: this.isConnected,
            lastActivity: this.lastActivity,
            ...this.stats
        };
    }
}

class EnhancedSSHManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.connectionPool = new Map();
        this.retryManager = new SSHRetryManager(options.retryPolicy);
        this.maxConnectionsPerHost = options.maxConnectionsPerHost || 3;
        this.connectionTimeout = options.connectionTimeout || 10000;
        this.keepaliveInterval = options.keepaliveInterval || 30000;
        this.healthCheckInterval = options.healthCheckInterval || 60000;
        this.idleTimeout = options.idleTimeout || 300000; // 5 minutes
        
        // Connection management
        this.connectionCounter = 0;
        this.cleanupInterval = null;
        
        // Statistics
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            failedConnections: 0,
            commandsExecuted: 0,
            reconnections: 0
        };
        
        this.setupEventHandlers();
        this.startCleanupScheduler();
        
        logger.info('Enhanced SSH Manager initialized');
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.retryManager.on('operationSuccess', (data) => {
            this.emit('operationSuccess', data);
        });
        
        this.retryManager.on('operationFailed', (data) => {
            this.emit('operationFailed', data);
        });
        
        this.retryManager.on('circuitBreakerStateChange', (data) => {
            this.emit('circuitBreakerStateChange', data);
        });
    }
    
    /**
     * Get or create SSH connection
     */
    async getConnection(hostConfig) {
        const hostKey = `${hostConfig.host}:${hostConfig.port || 22}`;
        
        // Check for existing healthy connection
        const existingConnections = this.connectionPool.get(hostKey) || [];
        const healthyConnection = existingConnections.find(conn => conn.isConnected);
        
        if (healthyConnection) {
            return healthyConnection;
        }
        
        // Create new connection if under limit
        if (existingConnections.length < this.maxConnectionsPerHost) {
            const connection = await this.createConnection(hostConfig);
            
            if (!this.connectionPool.has(hostKey)) {
                this.connectionPool.set(hostKey, []);
            }
            this.connectionPool.get(hostKey).push(connection);
            
            return connection;
        }
        
        throw new Error(`Maximum connections reached for host ${hostConfig.host}`);
    }
    
    /**
     * Create new SSH connection
     */
    async createConnection(hostConfig) {
        const config = {
            ...hostConfig,
            connectionTimeout: this.connectionTimeout,
            keepaliveInterval: this.keepaliveInterval,
            healthCheckInterval: this.healthCheckInterval
        };
        
        const connection = new SSHConnection(config);
        
        // Setup event handlers
        connection.on('connected', () => {
            this.stats.totalConnections++;
            this.stats.activeConnections++;
            this.emit('connectionEstablished', connection.getStatistics());
        });
        
        connection.on('connectionLost', () => {
            this.stats.activeConnections--;
            this.emit('connectionLost', connection.getStatistics());
            this.scheduleReconnection(hostConfig);
        });
        
        connection.on('disconnected', () => {
            this.stats.activeConnections--;
            this.removeConnection(connection);
        });
        
        await connection.connect();
        return connection;
    }
    
    /**
     * Execute command with retry logic
     */
    async executeCommand(hostConfig, command, options = {}) {
        const operationId = `cmd_${++this.connectionCounter}`;
        
        return await this.retryManager.executeWithRetry(async () => {
            const connection = await this.getConnection(hostConfig);
            const result = await connection.executeCommand(command, options);
            this.stats.commandsExecuted++;
            return result;
        }, operationId, hostConfig.host);
    }
    
    /**
     * Schedule reconnection
     */
    scheduleReconnection(hostConfig) {
        setTimeout(async () => {
            try {
                await this.createConnection(hostConfig);
                this.stats.reconnections++;
                logger.info(`Reconnected to ${hostConfig.host}`);
            } catch (error) {
                logger.error(`Failed to reconnect to ${hostConfig.host}:`, error);
                // Schedule another attempt
                this.scheduleReconnection(hostConfig);
            }
        }, 5000); // Wait 5 seconds before reconnecting
    }
    
    /**
     * Remove connection from pool
     */
    removeConnection(connection) {
        for (const [hostKey, connections] of this.connectionPool.entries()) {
            const index = connections.findIndex(conn => conn.connectionId === connection.connectionId);
            if (index !== -1) {
                connections.splice(index, 1);
                if (connections.length === 0) {
                    this.connectionPool.delete(hostKey);
                }
                break;
            }
        }
    }
    
    /**
     * Start cleanup scheduler
     */
    startCleanupScheduler() {
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, 60000); // Cleanup every minute
    }
    
    /**
     * Perform cleanup of idle connections
     */
    performCleanup() {
        const now = Date.now();
        
        for (const [hostKey, connections] of this.connectionPool.entries()) {
            const connectionsToRemove = [];
            
            for (const connection of connections) {
                if (!connection.isConnected || 
                    (connection.lastActivity && now - connection.lastActivity.getTime() > this.idleTimeout)) {
                    connectionsToRemove.push(connection);
                }
            }
            
            for (const connection of connectionsToRemove) {
                connection.disconnect();
            }
        }
    }
    
    /**
     * Get manager statistics
     */
    getStatistics() {
        const connectionStats = [];
        for (const [hostKey, connections] of this.connectionPool.entries()) {
            for (const connection of connections) {
                connectionStats.push(connection.getStatistics());
            }
        }

        return {
            ...this.stats,
            connectionPool: connectionStats,
            retryManagerStats: this.retryManager.getStatistics()
        };
    }

    /**
     * Test connection to host
     */
    async testConnection(hostConfig) {
        const connection = new SSHConnection(hostConfig);
        return await connection.testConnection();
    }

    /**
     * Get connection pool status
     */
    getConnectionPoolStatus() {
        const poolStatus = {};

        for (const [hostKey, connections] of this.connectionPool.entries()) {
            poolStatus[hostKey] = {
                totalConnections: connections.length,
                activeConnections: connections.filter(conn => conn.isConnected).length,
                connections: connections.map(conn => ({
                    id: conn.connectionId,
                    connected: conn.isConnected,
                    lastActivity: conn.lastActivity,
                    stats: conn.stats
                }))
            };
        }

        return poolStatus;
    }
    
    /**
     * Shutdown manager
     */
    async shutdown() {
        // Stop cleanup
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Disconnect all connections
        for (const [hostKey, connections] of this.connectionPool.entries()) {
            for (const connection of connections) {
                await connection.disconnect();
            }
        }
        
        this.connectionPool.clear();
        logger.info('Enhanced SSH Manager shutdown complete');
    }
}

module.exports = EnhancedSSHManager;
