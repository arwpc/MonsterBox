/**
 * SSH Connection Monitor Service Integration
 * 
 * Integrates SSH connection monitoring with the MonsterBox system,
 * providing real-time connection status updates and integration
 * with the existing authentication and logging systems.
 */

const SSHConnectionMonitor = require('./connectionMonitor');
const logger = require('../../scripts/logger');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class ConnectionMonitorService extends EventEmitter {
    constructor() {
        super();
        
        this.monitor = null;
        this.isInitialized = false;
        this.statusLogPath = path.join(__dirname, '../../log/ssh-connection-status.log');
        this.alertThresholds = {
            consecutiveFailures: 3,
            uptimeBelow: 90, // percentage
            responseTimeAbove: 5000 // milliseconds
        };
        
        // Connection state cache for quick access
        this.connectionCache = new Map();
        this.lastStatusUpdate = null;
        
        this.initialize();
    }
    
    /**
     * Initialize the connection monitoring service
     */
    async initialize() {
        try {
            // Load animatronic configuration
            const animatronicsConfig = await this.loadAnimatronicsConfig();
            const hosts = this.extractHostsFromConfig(animatronicsConfig);
            
            // Create monitor instance
            this.monitor = new SSHConnectionMonitor({
                hosts: hosts,
                interval: 15000, // 15 seconds
                timeout: 8000,   // 8 seconds
                retryAttempts: 3,
                maxHistorySize: 2000
            });
            
            // Setup event handlers
            this.setupEventHandlers();
            
            // Start monitoring
            this.monitor.startMonitoring();
            
            this.isInitialized = true;
            logger.info('SSH Connection Monitor Service initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize SSH Connection Monitor Service:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load animatronics configuration
     */
    async loadAnimatronicsConfig() {
        try {
            const configPath = path.join(__dirname, '../../data/animatronics.json');
            const configData = await fs.readFile(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            logger.warn('Could not load animatronics config, using defaults');
            return this.getDefaultHosts();
        }
    }
    
    /**
     * Extract host information from animatronics config
     */
    extractHostsFromConfig(config) {
        const hosts = [];
        
        if (config && config.animatronics) {
            for (const [name, animatronic] of Object.entries(config.animatronics)) {
                if (animatronic.rpi_config && animatronic.rpi_config.host) {
                    hosts.push({
                        name: name,
                        host: animatronic.rpi_config.host,
                        user: animatronic.rpi_config.user || 'remote',
                        port: animatronic.rpi_config.port || 22
                    });
                }
            }
        }
        
        // Add default hosts if none found
        if (hosts.length === 0) {
            return this.getDefaultHosts();
        }
        
        return hosts;
    }
    
    /**
     * Get default host configuration
     */
    getDefaultHosts() {
        return [
            { name: 'orlok', host: '192.168.8.120', user: 'remote', port: 22 },
            { name: 'coffin', host: '192.168.8.140', user: 'remote', port: 22 },
            { name: 'skulltalker', host: '192.168.8.130', user: 'remote', port: 22 },
            { name: 'pumpkinhead', host: '192.168.1.101', user: 'remote', port: 22 }
        ];
    }
    
    /**
     * Setup event handlers for the monitor
     */
    setupEventHandlers() {
        this.monitor.on('connectionRestored', (hostName, state) => {
            this.handleConnectionRestored(hostName, state);
        });
        
        this.monitor.on('connectionLost', (hostName, state) => {
            this.handleConnectionLost(hostName, state);
        });
        
        this.monitor.on('connectionStateChanged', (hostName, state) => {
            this.handleConnectionStateChanged(hostName, state);
        });
        
        this.monitor.on('monitoringCycleComplete', (summary) => {
            this.handleMonitoringCycleComplete(summary);
        });
        
        this.monitor.on('monitoringStarted', () => {
            logger.info('SSH connection monitoring started');
            this.emit('monitoringStarted');
        });
        
        this.monitor.on('monitoringStopped', () => {
            logger.info('SSH connection monitoring stopped');
            this.emit('monitoringStopped');
        });
    }
    
    /**
     * Handle connection restored event
     */
    async handleConnectionRestored(hostName, state) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: 'CONNECTION_RESTORED',
            hostName,
            host: state.host,
            responseTime: state.averageResponseTime,
            consecutiveFailures: state.consecutiveFailures
        };
        
        await this.logConnectionEvent(logEntry);
        
        // Update cache
        this.connectionCache.set(hostName, {
            ...state,
            lastEventType: 'restored'
        });
        
        // Emit service-level event
        this.emit('connectionRestored', hostName, state);
        
        logger.info(`SSH connection restored to ${hostName} (${state.host})`);
    }
    
    /**
     * Handle connection lost event
     */
    async handleConnectionLost(hostName, state) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: 'CONNECTION_LOST',
            hostName,
            host: state.host,
            error: state.error,
            consecutiveFailures: state.consecutiveFailures
        };
        
        await this.logConnectionEvent(logEntry);
        
        // Update cache
        this.connectionCache.set(hostName, {
            ...state,
            lastEventType: 'lost'
        });
        
        // Check if alert threshold reached
        if (state.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
            this.emit('connectionAlert', {
                type: 'CONSECUTIVE_FAILURES',
                hostName,
                count: state.consecutiveFailures,
                threshold: this.alertThresholds.consecutiveFailures
            });
        }
        
        // Emit service-level event
        this.emit('connectionLost', hostName, state);
        
        logger.warn(`SSH connection lost to ${hostName} (${state.host}): ${state.error}`);
    }
    
    /**
     * Handle connection state change
     */
    handleConnectionStateChanged(hostName, state) {
        // Update cache
        this.connectionCache.set(hostName, state);
        
        // Check for performance alerts
        const uptime = this.monitor.calculateUptime(state);
        if (uptime < this.alertThresholds.uptimeBelow && state.totalChecks > 10) {
            this.emit('performanceAlert', {
                type: 'LOW_UPTIME',
                hostName,
                uptime,
                threshold: this.alertThresholds.uptimeBelow
            });
        }
        
        if (state.averageResponseTime > this.alertThresholds.responseTimeAbove) {
            this.emit('performanceAlert', {
                type: 'HIGH_RESPONSE_TIME',
                hostName,
                responseTime: state.averageResponseTime,
                threshold: this.alertThresholds.responseTimeAbove
            });
        }
        
        // Emit service-level event
        this.emit('connectionStateChanged', hostName, state);
    }
    
    /**
     * Handle monitoring cycle complete
     */
    async handleMonitoringCycleComplete(summary) {
        this.lastStatusUpdate = new Date();
        
        // Log summary periodically (every 10 cycles)
        const stats = this.monitor.getStatistics();
        if (stats.totalChecks % 10 === 0) {
            const summaryLogEntry = {
                timestamp: new Date().toISOString(),
                event: 'MONITORING_SUMMARY',
                summary,
                statistics: stats
            };
            
            await this.logConnectionEvent(summaryLogEntry);
        }
        
        // Emit service-level event
        this.emit('monitoringCycleComplete', summary);
    }
    
    /**
     * Log connection event to file
     */
    async logConnectionEvent(logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.statusLogPath, logLine);
        } catch (error) {
            logger.error('Failed to write connection log:', error);
        }
    }
    
    /**
     * Get current connection status for all hosts
     */
    getConnectionStatus() {
        if (!this.isInitialized || !this.monitor) {
            return { error: 'Monitor not initialized' };
        }
        
        return this.monitor.getStatus();
    }
    
    /**
     * Get connection status for specific host
     */
    getHostStatus(hostName) {
        if (!this.isInitialized || !this.monitor) {
            return { error: 'Monitor not initialized' };
        }
        
        const state = this.monitor.connectionStates.get(hostName);
        if (!state) {
            return { error: `Host ${hostName} not found` };
        }
        
        return {
            ...state,
            uptime: this.monitor.calculateUptime(state)
        };
    }
    
    /**
     * Force check of specific host
     */
    async forceCheckHost(hostName) {
        if (!this.isInitialized || !this.monitor) {
            throw new Error('Monitor not initialized');
        }
        
        return await this.monitor.forceCheck(hostName);
    }
    
    /**
     * Get connection history
     */
    getConnectionHistory(hostName = null, limit = 100) {
        if (!this.isInitialized || !this.monitor) {
            return [];
        }
        
        return this.monitor.getConnectionHistory(hostName, limit);
    }
    
    /**
     * Get monitoring statistics
     */
    getStatistics() {
        if (!this.isInitialized || !this.monitor) {
            return { error: 'Monitor not initialized' };
        }
        
        return this.monitor.getStatistics();
    }
    
    /**
     * Update alert thresholds
     */
    updateAlertThresholds(newThresholds) {
        this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
        logger.info('Alert thresholds updated:', this.alertThresholds);
    }
    
    /**
     * Check if any hosts are disconnected
     */
    hasDisconnectedHosts() {
        if (!this.isInitialized || !this.monitor) {
            return false;
        }
        
        const summary = this.monitor.getConnectionSummary();
        return summary.disconnectedHosts > 0;
    }
    
    /**
     * Get list of disconnected hosts
     */
    getDisconnectedHosts() {
        if (!this.isInitialized || !this.monitor) {
            return [];
        }
        
        const disconnected = [];
        for (const [hostName, state] of this.monitor.connectionStates.entries()) {
            if (!state.connected) {
                disconnected.push({
                    name: hostName,
                    host: state.host,
                    lastConnected: state.lastConnected,
                    consecutiveFailures: state.consecutiveFailures,
                    error: state.error
                });
            }
        }
        
        return disconnected;
    }
    
    /**
     * Stop monitoring service
     */
    stop() {
        if (this.monitor) {
            this.monitor.stopMonitoring();
        }
        this.isInitialized = false;
    }
    
    /**
     * Restart monitoring service
     */
    async restart() {
        this.stop();
        await this.initialize();
    }
}

// Create singleton instance
const connectionMonitorService = new ConnectionMonitorService();

module.exports = connectionMonitorService;
