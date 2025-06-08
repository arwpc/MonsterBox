/**
 * SSH Connection Monitor Service
 * 
 * Continuously monitors SSH connection status to all remote hosts,
 * provides real-time connection health information, and triggers
 * alerts when connections are lost or restored.
 */

const EventEmitter = require('events');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../scripts/logger');

class SSHConnectionMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.hosts = options.hosts || [
            { name: 'orlok', host: '192.168.8.120', user: 'remote' },
            { name: 'coffin', host: '192.168.8.140', user: 'remote' },
            { name: 'skulltalker', host: '192.168.8.130', user: 'remote' },
            { name: 'pumpkinhead', host: '192.168.1.101', user: 'remote' }
        ];
        
        this.monitoringInterval = options.interval || 10000; // 10 seconds
        this.connectionTimeout = options.timeout || 5000; // 5 seconds
        this.retryAttempts = options.retryAttempts || 3;
        this.isMonitoring = false;
        this.monitoringTimer = null;
        
        // Connection state tracking
        this.connectionStates = new Map();
        this.connectionHistory = [];
        this.maxHistorySize = options.maxHistorySize || 1000;
        
        // Statistics
        this.stats = {
            totalChecks: 0,
            successfulConnections: 0,
            failedConnections: 0,
            connectionRestored: 0,
            connectionLost: 0,
            startTime: new Date()
        };
        
        // Initialize connection states
        this.initializeConnectionStates();
        
        logger.info('SSH Connection Monitor initialized');
    }
    
    /**
     * Initialize connection states for all hosts
     */
    initializeConnectionStates() {
        for (const host of this.hosts) {
            this.connectionStates.set(host.name, {
                name: host.name,
                host: host.host,
                user: host.user,
                connected: false,
                lastCheck: null,
                lastConnected: null,
                lastDisconnected: null,
                consecutiveFailures: 0,
                totalChecks: 0,
                successfulChecks: 0,
                averageResponseTime: 0,
                currentStatus: 'unknown',
                error: null
            });
        }
    }
    
    /**
     * Start monitoring all SSH connections
     */
    startMonitoring() {
        if (this.isMonitoring) {
            logger.warn('SSH monitoring is already running');
            return;
        }
        
        this.isMonitoring = true;
        logger.info('Starting SSH connection monitoring');
        
        // Perform initial check
        this.performMonitoringCycle();
        
        // Schedule regular monitoring
        this.monitoringTimer = setInterval(() => {
            this.performMonitoringCycle();
        }, this.monitoringInterval);
        
        this.emit('monitoringStarted');
    }
    
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }
        
        this.isMonitoring = false;
        
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        
        logger.info('SSH connection monitoring stopped');
        this.emit('monitoringStopped');
    }
    
    /**
     * Perform a complete monitoring cycle for all hosts
     */
    async performMonitoringCycle() {
        logger.debug('Performing SSH monitoring cycle');
        
        const promises = this.hosts.map(host => this.checkHostConnection(host));
        const results = await Promise.allSettled(promises);
        
        // Process results
        results.forEach((result, index) => {
            const host = this.hosts[index];
            if (result.status === 'fulfilled') {
                this.updateConnectionState(host.name, result.value);
            } else {
                logger.error(`Monitoring check failed for ${host.name}:`, result.reason);
                this.updateConnectionState(host.name, {
                    connected: false,
                    responseTime: null,
                    error: result.reason.message
                });
            }
        });
        
        this.stats.totalChecks++;
        this.emit('monitoringCycleComplete', this.getConnectionSummary());
    }
    
    /**
     * Check connection to a specific host
     */
    async checkHostConnection(hostConfig) {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    connected: false,
                    responseTime: null,
                    error: 'Connection timeout'
                });
            }, this.connectionTimeout);
            
            // Use SSH to test connection
            const sshProcess = spawn('ssh', [
                '-o', 'ConnectTimeout=5',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'BatchMode=yes',
                '-o', 'PasswordAuthentication=no',
                '-o', 'PubkeyAuthentication=yes',
                `${hostConfig.user}@${hostConfig.host}`,
                'echo "SSH_MONITOR_TEST_SUCCESS"'
            ]);
            
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
                const responseTime = Date.now() - startTime;
                
                if (code === 0 && output.includes('SSH_MONITOR_TEST_SUCCESS')) {
                    resolve({
                        connected: true,
                        responseTime,
                        error: null
                    });
                } else {
                    resolve({
                        connected: false,
                        responseTime,
                        error: errorOutput || `SSH process exited with code ${code}`
                    });
                }
            });
            
            sshProcess.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    connected: false,
                    responseTime: Date.now() - startTime,
                    error: error.message
                });
            });
        });
    }
    
    /**
     * Update connection state for a host
     */
    updateConnectionState(hostName, checkResult) {
        const state = this.connectionStates.get(hostName);
        if (!state) return;
        
        const previouslyConnected = state.connected;
        const now = new Date();
        
        // Update state
        state.lastCheck = now;
        state.totalChecks++;
        state.error = checkResult.error;
        
        if (checkResult.connected) {
            state.connected = true;
            state.lastConnected = now;
            state.consecutiveFailures = 0;
            state.successfulChecks++;
            state.currentStatus = 'connected';
            
            // Update average response time
            if (checkResult.responseTime) {
                const totalResponseTime = state.averageResponseTime * (state.successfulChecks - 1);
                state.averageResponseTime = (totalResponseTime + checkResult.responseTime) / state.successfulChecks;
            }
            
            this.stats.successfulConnections++;
            
            // Emit connection restored event if previously disconnected
            if (!previouslyConnected) {
                this.stats.connectionRestored++;
                this.emit('connectionRestored', hostName, state);
                logger.info(`SSH connection restored to ${hostName} (${state.host})`);
            }
            
        } else {
            state.connected = false;
            state.consecutiveFailures++;
            state.currentStatus = 'disconnected';
            
            if (!state.lastDisconnected || previouslyConnected) {
                state.lastDisconnected = now;
            }
            
            this.stats.failedConnections++;
            
            // Emit connection lost event if previously connected
            if (previouslyConnected) {
                this.stats.connectionLost++;
                this.emit('connectionLost', hostName, state);
                logger.warn(`SSH connection lost to ${hostName} (${state.host}): ${checkResult.error}`);
            }
        }
        
        // Add to history
        this.addToHistory({
            timestamp: now,
            hostName,
            connected: checkResult.connected,
            responseTime: checkResult.responseTime,
            error: checkResult.error
        });
        
        // Emit state change event
        this.emit('connectionStateChanged', hostName, state);
    }
    
    /**
     * Add entry to connection history
     */
    addToHistory(entry) {
        this.connectionHistory.push(entry);
        
        // Trim history if it exceeds max size
        if (this.connectionHistory.length > this.maxHistorySize) {
            this.connectionHistory = this.connectionHistory.slice(-this.maxHistorySize);
        }
    }
    
    /**
     * Get connection summary
     */
    getConnectionSummary() {
        const summary = {
            totalHosts: this.hosts.length,
            connectedHosts: 0,
            disconnectedHosts: 0,
            unknownHosts: 0,
            hosts: {}
        };
        
        for (const [hostName, state] of this.connectionStates.entries()) {
            summary.hosts[hostName] = {
                connected: state.connected,
                status: state.currentStatus,
                lastCheck: state.lastCheck,
                responseTime: state.averageResponseTime,
                consecutiveFailures: state.consecutiveFailures,
                uptime: this.calculateUptime(state),
                error: state.error
            };
            
            if (state.connected) {
                summary.connectedHosts++;
            } else if (state.currentStatus === 'disconnected') {
                summary.disconnectedHosts++;
            } else {
                summary.unknownHosts++;
            }
        }
        
        return summary;
    }
    
    /**
     * Calculate uptime percentage for a host
     */
    calculateUptime(state) {
        if (state.totalChecks === 0) return 0;
        return (state.successfulChecks / state.totalChecks) * 100;
    }
    
    /**
     * Get detailed statistics
     */
    getStatistics() {
        const runtime = Date.now() - this.stats.startTime.getTime();
        
        return {
            ...this.stats,
            runtime: runtime,
            averageCheckInterval: this.stats.totalChecks > 0 ? runtime / this.stats.totalChecks : 0,
            successRate: this.stats.totalChecks > 0 ? 
                (this.stats.successfulConnections / this.stats.totalChecks) * 100 : 0,
            connectionSummary: this.getConnectionSummary()
        };
    }
    
    /**
     * Get connection history
     */
    getConnectionHistory(hostName = null, limit = 100) {
        let history = this.connectionHistory;
        
        if (hostName) {
            history = history.filter(entry => entry.hostName === hostName);
        }
        
        return history.slice(-limit);
    }
    
    /**
     * Force check of specific host
     */
    async forceCheck(hostName) {
        const hostConfig = this.hosts.find(h => h.name === hostName);
        if (!hostConfig) {
            throw new Error(`Host ${hostName} not found`);
        }
        
        const result = await this.checkHostConnection(hostConfig);
        this.updateConnectionState(hostName, result);
        
        return this.connectionStates.get(hostName);
    }
    
    /**
     * Get current status of all connections
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            monitoringInterval: this.monitoringInterval,
            connectionTimeout: this.connectionTimeout,
            connectionStates: Object.fromEntries(this.connectionStates),
            statistics: this.getStatistics(),
            lastUpdate: new Date()
        };
    }
}

module.exports = SSHConnectionMonitor;
