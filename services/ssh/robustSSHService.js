/**
 * Robust SSH Service
 * 
 * Integrates the Enhanced SSH Manager with MonsterBox's existing
 * SSH infrastructure, providing a unified interface for robust
 * SSH connection management across all animatronic hosts.
 */

const EnhancedSSHManager = require('./enhancedSSHManager');
const connectionMonitorService = require('./connectionMonitorService');
const logger = require('../../scripts/logger');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class RobustSSHService extends EventEmitter {
    constructor() {
        super();
        
        this.sshManager = null;
        this.isInitialized = false;
        this.hostConfigs = new Map();
        this.defaultConfig = {
            user: 'remote',
            port: 22,
            connectionTimeout: 10000,
            keepaliveInterval: 30000,
            healthCheckInterval: 60000,
            maxConnectionsPerHost: 3
        };
        
        // Service statistics
        this.serviceStats = {
            startTime: new Date(),
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            reconnections: 0,
            lastActivity: null
        };
        
        this.initialize();
    }
    
    /**
     * Initialize the robust SSH service
     */
    async initialize() {
        try {
            // Load host configurations
            await this.loadHostConfigurations();
            
            // Create enhanced SSH manager
            this.sshManager = new EnhancedSSHManager({
                maxConnectionsPerHost: 3,
                connectionTimeout: 10000,
                keepaliveInterval: 30000,
                healthCheckInterval: 60000,
                idleTimeout: 300000,
                retryPolicy: {
                    maxRetries: 3,
                    initialDelayMs: 1000,
                    maxDelayMs: 30000,
                    backoffMultiplier: 2,
                    circuitBreakerEnabled: true,
                    failureThreshold: 5,
                    recoveryTimeoutMs: 60000
                }
            });
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Test initial connections
            await this.testAllConnections();
            
            this.isInitialized = true;
            logger.info('Robust SSH Service initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize Robust SSH Service:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load host configurations from animatronics data
     */
    async loadHostConfigurations() {
        try {
            const animatronicsPath = path.join(__dirname, '../../data/animatronics.json');
            const animatronicsData = await fs.readFile(animatronicsPath, 'utf8');
            const animatronics = JSON.parse(animatronicsData);
            
            if (animatronics && animatronics.animatronics) {
                for (const [name, config] of Object.entries(animatronics.animatronics)) {
                    if (config.rpi_config && config.rpi_config.host) {
                        this.hostConfigs.set(name, {
                            ...this.defaultConfig,
                            host: config.rpi_config.host,
                            user: config.rpi_config.user || this.defaultConfig.user,
                            port: config.rpi_config.port || this.defaultConfig.port,
                            name: name
                        });
                    }
                }
            }
            
            // Add default hosts if none found
            if (this.hostConfigs.size === 0) {
                this.addDefaultHosts();
            }
            
            logger.info(`Loaded ${this.hostConfigs.size} host configurations`);
            
        } catch (error) {
            logger.warn('Could not load animatronics config, using defaults:', error);
            this.addDefaultHosts();
        }
    }
    
    /**
     * Add default host configurations
     */
    addDefaultHosts() {
        const defaultHosts = [
            { name: 'orlok', host: '192.168.8.120' },
            { name: 'coffin', host: '192.168.8.140' },
            { name: 'skulltalker', host: '192.168.8.130' },
            { name: 'pumpkinhead', host: '192.168.1.101' }
        ];
        
        for (const host of defaultHosts) {
            this.hostConfigs.set(host.name, {
                ...this.defaultConfig,
                ...host
            });
        }
    }
    
    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.sshManager.on('connectionEstablished', (stats) => {
            logger.info(`SSH connection established: ${stats.host}`);
            this.emit('connectionEstablished', stats);
        });
        
        this.sshManager.on('connectionLost', (stats) => {
            logger.warn(`SSH connection lost: ${stats.host}`);
            this.serviceStats.reconnections++;
            this.emit('connectionLost', stats);
        });
        
        this.sshManager.on('operationSuccess', (data) => {
            this.serviceStats.successfulCommands++;
            this.serviceStats.lastActivity = new Date();
            this.emit('operationSuccess', data);
        });
        
        this.sshManager.on('operationFailed', (data) => {
            this.serviceStats.failedCommands++;
            this.emit('operationFailed', data);
        });
        
        this.sshManager.on('circuitBreakerStateChange', (data) => {
            logger.info(`Circuit breaker state changed for ${data.host}: ${data.state}`);
            this.emit('circuitBreakerStateChange', data);
        });
    }
    
    /**
     * Test connections to all configured hosts
     */
    async testAllConnections() {
        const testResults = [];
        
        for (const [hostName, hostConfig] of this.hostConfigs.entries()) {
            try {
                const result = await this.sshManager.testConnection(hostConfig);
                testResults.push({
                    host: hostName,
                    success: result.success,
                    error: result.error
                });
                
                if (result.success) {
                    logger.info(`Connection test successful for ${hostName}`);
                } else {
                    logger.warn(`Connection test failed for ${hostName}: ${result.error}`);
                }
                
            } catch (error) {
                testResults.push({
                    host: hostName,
                    success: false,
                    error: error.message
                });
                logger.error(`Connection test error for ${hostName}:`, error);
            }
        }
        
        return testResults;
    }
    
    /**
     * Execute command on specific host
     */
    async executeCommand(hostName, command, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Robust SSH Service not initialized');
        }
        
        const hostConfig = this.hostConfigs.get(hostName);
        if (!hostConfig) {
            throw new Error(`Host configuration not found for ${hostName}`);
        }
        
        try {
            this.serviceStats.totalCommands++;
            const result = await this.sshManager.executeCommand(hostConfig, command, options);
            
            logger.debug(`Command executed successfully on ${hostName}: ${command}`);
            return {
                success: true,
                host: hostName,
                command: command,
                ...result
            };
            
        } catch (error) {
            logger.error(`Command execution failed on ${hostName}:`, error);
            throw error;
        }
    }
    
    /**
     * Execute command on multiple hosts
     */
    async executeCommandOnHosts(hostNames, command, options = {}) {
        const results = [];
        const promises = hostNames.map(async (hostName) => {
            try {
                const result = await this.executeCommand(hostName, command, options);
                return { hostName, ...result };
            } catch (error) {
                return {
                    hostName,
                    success: false,
                    error: error.message
                };
            }
        });
        
        const settledResults = await Promise.allSettled(promises);
        
        for (const result of settledResults) {
            if (result.status === 'fulfilled') {
                results.push(result.value);
            } else {
                results.push({
                    success: false,
                    error: result.reason.message
                });
            }
        }
        
        return results;
    }
    
    /**
     * Get service status
     */
    getStatus() {
        if (!this.isInitialized || !this.sshManager) {
            return { error: 'Service not initialized' };
        }
        
        return {
            initialized: this.isInitialized,
            hostConfigs: Array.from(this.hostConfigs.keys()),
            connectionPoolStatus: this.sshManager.getConnectionPoolStatus(),
            serviceStats: this.serviceStats,
            sshManagerStats: this.sshManager.getStatistics(),
            lastUpdate: new Date()
        };
    }
    
    /**
     * Get host configuration
     */
    getHostConfig(hostName) {
        return this.hostConfigs.get(hostName);
    }
    
    /**
     * Get all host configurations
     */
    getAllHostConfigs() {
        return Object.fromEntries(this.hostConfigs);
    }
    
    /**
     * Test connection to specific host
     */
    async testConnection(hostName) {
        const hostConfig = this.hostConfigs.get(hostName);
        if (!hostConfig) {
            throw new Error(`Host configuration not found for ${hostName}`);
        }
        
        return await this.sshManager.testConnection(hostConfig);
    }
    
    /**
     * Force reconnection to host
     */
    async forceReconnection(hostName) {
        const hostConfig = this.hostConfigs.get(hostName);
        if (!hostConfig) {
            throw new Error(`Host configuration not found for ${hostName}`);
        }
        
        // This will trigger the connection manager to create a new connection
        return await this.sshManager.getConnection(hostConfig);
    }
    
    /**
     * Get connection statistics
     */
    getConnectionStatistics() {
        if (!this.sshManager) {
            return { error: 'SSH Manager not initialized' };
        }
        
        return this.sshManager.getStatistics();
    }
    
    /**
     * Update host configuration
     */
    updateHostConfig(hostName, newConfig) {
        const existingConfig = this.hostConfigs.get(hostName);
        if (!existingConfig) {
            throw new Error(`Host configuration not found for ${hostName}`);
        }
        
        const updatedConfig = { ...existingConfig, ...newConfig };
        this.hostConfigs.set(hostName, updatedConfig);
        
        logger.info(`Host configuration updated for ${hostName}`);
        this.emit('hostConfigUpdated', hostName, updatedConfig);
    }
    
    /**
     * Shutdown service
     */
    async shutdown() {
        logger.info('Shutting down Robust SSH Service');
        
        if (this.sshManager) {
            await this.sshManager.shutdown();
        }
        
        this.isInitialized = false;
        this.emit('shutdown');
    }
}

// Create singleton instance
const robustSSHService = new RobustSSHService();

module.exports = robustSSHService;
