/**
 * Augment MCP Integration Service
 * 
 * Integrates with Augment's Model Context Protocol to enforce remote execution
 * and prevent local PowerShell fallback during AI-assisted development.
 */

const EventEmitter = require('events');
const RemoteExecutionEnforcer = require('./remoteExecutionEnforcer');
const logger = require('../../scripts/logger');
const fs = require('fs').promises;
const path = require('path');

class AugmentMCPIntegration extends EventEmitter {
    constructor() {
        super();
        this.enforcer = new RemoteExecutionEnforcer();
        this.mcpServers = new Map();
        this.activeConnections = new Map();
        this.configPath = path.join(__dirname, '../../data/augment-mcp-config.json');
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Load MCP configuration
        this.loadMCPConfiguration();
        
        logger.info('Augment MCP Integration initialized');
    }
    
    /**
     * Setup event handlers for the enforcer
     */
    setupEventHandlers() {
        this.enforcer.on('sshConnected', (host) => {
            this.emit('remoteHostConnected', host);
            this.updateMCPServerStatus(host, 'connected');
        });
        
        this.enforcer.on('sshDisconnected', (host) => {
            this.emit('remoteHostDisconnected', host);
            this.updateMCPServerStatus(host, 'disconnected');
            this.handleConnectionLoss(host);
        });
        
        this.enforcer.on('executionLogged', (logEntry) => {
            this.emit('executionEvent', logEntry);
            this.logMCPEvent(logEntry);
        });
        
        this.enforcer.on('alertThresholdReached', (count) => {
            this.emit('securityAlert', { type: 'PREVENTION_THRESHOLD', count });
            this.handleSecurityAlert(count);
        });
        
        this.enforcer.on('emergencyShutdown', () => {
            this.emit('emergencyShutdown');
            this.notifyMCPServers('EMERGENCY_SHUTDOWN');
        });
    }
    
    /**
     * Load MCP configuration
     */
    async loadMCPConfiguration() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.mcpConfig = JSON.parse(configData);
            
            // Register MCP servers
            for (const [serverName, serverConfig] of Object.entries(this.mcpConfig.mcpServers)) {
                this.registerMCPServer(serverName, serverConfig);
            }
            
        } catch (error) {
            logger.error('Failed to load MCP configuration:', error);
        }
    }
    
    /**
     * Register MCP server
     */
    registerMCPServer(name, config) {
        this.mcpServers.set(name, {
            ...config,
            status: 'registered',
            lastActivity: new Date(),
            enforceRemoteExecution: true
        });
        
        logger.info(`MCP server registered: ${name}`);
    }
    
    /**
     * Update MCP server status
     */
    updateMCPServerStatus(host, status) {
        for (const [serverName, serverConfig] of this.mcpServers.entries()) {
            if (serverConfig.targetHost === host) {
                serverConfig.status = status;
                serverConfig.lastActivity = new Date();
                this.emit('mcpServerStatusChanged', { serverName, status, host });
            }
        }
    }
    
    /**
     * Handle connection loss
     */
    async handleConnectionLoss(host) {
        logger.warn(`Connection lost to ${host} - implementing fallback prevention`);
        
        // Disable local execution for affected servers
        for (const [serverName, serverConfig] of this.mcpServers.entries()) {
            if (serverConfig.targetHost === host) {
                await this.disableMCPServer(serverName);
            }
        }
        
        // Attempt reconnection
        setTimeout(() => {
            this.attemptReconnection(host);
        }, 5000);
    }
    
    /**
     * Disable MCP server
     */
    async disableMCPServer(serverName) {
        const serverConfig = this.mcpServers.get(serverName);
        if (serverConfig) {
            serverConfig.status = 'disabled';
            serverConfig.disabledReason = 'Remote connection unavailable';
            logger.warn(`MCP server disabled: ${serverName}`);
            this.emit('mcpServerDisabled', serverName);
        }
    }
    
    /**
     * Attempt reconnection
     */
    async attemptReconnection(host) {
        logger.info(`Attempting reconnection to ${host}`);
        
        const isConnected = await this.enforcer.testSSHConnection(host);
        if (isConnected) {
            logger.info(`Reconnection successful to ${host}`);
            this.enableMCPServersForHost(host);
        } else {
            logger.warn(`Reconnection failed to ${host} - retrying in 10 seconds`);
            setTimeout(() => {
                this.attemptReconnection(host);
            }, 10000);
        }
    }
    
    /**
     * Enable MCP servers for host
     */
    enableMCPServersForHost(host) {
        for (const [serverName, serverConfig] of this.mcpServers.entries()) {
            if (serverConfig.targetHost === host && serverConfig.status === 'disabled') {
                serverConfig.status = 'connected';
                delete serverConfig.disabledReason;
                logger.info(`MCP server re-enabled: ${serverName}`);
                this.emit('mcpServerEnabled', serverName);
            }
        }
    }
    
    /**
     * Log MCP event
     */
    async logMCPEvent(logEntry) {
        const mcpLogEntry = {
            ...logEntry,
            source: 'augment-mcp-integration',
            mcpServers: Array.from(this.mcpServers.keys()),
            activeConnections: Array.from(this.activeConnections.keys())
        };
        
        // Write to MCP log file
        const logPath = path.join(__dirname, '../../log/augment-mcp-events.log');
        try {
            await fs.appendFile(logPath, JSON.stringify(mcpLogEntry) + '\n');
        } catch (error) {
            logger.error('Failed to write MCP log:', error);
        }
    }
    
    /**
     * Handle security alert
     */
    async handleSecurityAlert(count) {
        logger.error(`Security alert: ${count} prevention events detected`);
        
        // Disable all MCP servers temporarily
        for (const [serverName, serverConfig] of this.mcpServers.entries()) {
            if (serverConfig.status !== 'disabled') {
                await this.disableMCPServer(serverName);
                serverConfig.disabledReason = 'Security alert - too many prevention events';
            }
        }
        
        // Trigger emergency shutdown if configured
        if (this.enforcer.config.emergencyShutdownEnabled) {
            await this.enforcer.emergencyShutdown();
        }
    }
    
    /**
     * Notify MCP servers
     */
    async notifyMCPServers(eventType, data = {}) {
        const notification = {
            timestamp: new Date().toISOString(),
            eventType,
            data,
            source: 'augment-mcp-integration'
        };
        
        logger.info(`Notifying MCP servers: ${eventType}`);
        this.emit('mcpNotification', notification);
    }
    
    /**
     * Validate execution context for MCP operations
     */
    async validateExecutionContext(operation) {
        const status = this.enforcer.getStatus();
        
        // Check if any remote connections are available
        const hasActiveConnections = Object.values(status.connectionStates)
            .some(state => state.connected);
        
        if (!hasActiveConnections && this.enforcer.config.strictMode) {
            throw new Error('No remote connections available - operation blocked');
        }
        
        // Log the operation
        this.enforcer.logExecution('MCP_OPERATION', `Operation: ${operation}`);
        
        return {
            allowed: hasActiveConnections || !this.enforcer.config.strictMode,
            connectionStates: status.connectionStates,
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Get integration status
     */
    getStatus() {
        return {
            enforcer: this.enforcer.getStatus(),
            mcpServers: Object.fromEntries(this.mcpServers),
            activeConnections: Object.fromEntries(this.activeConnections),
            lastUpdate: new Date().toISOString()
        };
    }
    
    /**
     * Get MCP logs
     */
    getMCPLogs(limit = 50) {
        return this.enforcer.getLogs(limit);
    }
    
    /**
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        // Update enforcer configuration
        this.enforcer.config = { ...this.enforcer.config, ...newConfig };
        await this.enforcer.saveConfiguration();
        
        logger.info('Augment MCP configuration updated');
        this.emit('configurationUpdated', newConfig);
    }
    
    /**
     * Shutdown integration
     */
    async shutdown() {
        logger.info('Shutting down Augment MCP Integration');
        
        // Stop enforcer
        this.enforcer.stopMonitoring();
        
        // Disable all MCP servers
        for (const serverName of this.mcpServers.keys()) {
            await this.disableMCPServer(serverName);
        }
        
        this.emit('shutdown');
    }
}

module.exports = AugmentMCPIntegration;
