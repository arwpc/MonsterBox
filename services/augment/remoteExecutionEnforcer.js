/**
 * Augment Remote Execution Enforcer
 * 
 * This service enforces remote execution for all Augment MCP operations,
 * preventing local PowerShell fallback and ensuring all code execution
 * happens on remote Linux hosts via SSH.
 */

const EventEmitter = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../scripts/logger');

class RemoteExecutionEnforcer extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.monitoringInterval = null;
        this.connectionStates = new Map();
        this.executionLog = [];
        this.preventionCount = 0;
        this.configPath = path.join(__dirname, '../../data/augment-remote-enforcement.json');
        
        // Load configuration
        this.loadConfiguration();
        
        // Start monitoring
        this.startMonitoring();
        
        logger.info('Remote Execution Enforcer initialized');
    }
    
    /**
     * Load enforcement configuration
     */
    async loadConfiguration() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            // Create default configuration
            this.config = {
                enabled: true,
                strictMode: true,
                allowedHosts: ['orlok', 'coffin', 'skulltalker', 'pumpkinhead'],
                blockedCommands: ['powershell', 'cmd', 'pwsh'],
                monitoringInterval: 5000,
                logRetention: 1000,
                alertThreshold: 5
            };
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save enforcement configuration
     */
    async saveConfiguration() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save enforcement configuration:', error);
        }
    }
    
    /**
     * Start monitoring system
     */
    startMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        this.isActive = true;
        this.monitoringInterval = setInterval(() => {
            this.performMonitoringCheck();
        }, this.config.monitoringInterval);
        
        // Monitor process creation
        this.setupProcessMonitoring();
        
        logger.info('Remote execution monitoring started');
    }
    
    /**
     * Stop monitoring system
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        this.isActive = false;
        logger.info('Remote execution monitoring stopped');
    }
    
    /**
     * Perform periodic monitoring check
     */
    async performMonitoringCheck() {
        try {
            // Check SSH connections
            await this.checkSSHConnections();
            
            // Validate remote context
            await this.validateRemoteContext();
            
            // Check for PowerShell processes
            await this.checkPowerShellProcesses();
            
            // Clean up old logs
            this.cleanupLogs();
            
        } catch (error) {
            logger.error('Monitoring check failed:', error);
        }
    }
    
    /**
     * Check SSH connection status
     */
    async checkSSHConnections() {
        for (const host of this.config.allowedHosts) {
            try {
                const isConnected = await this.testSSHConnection(host);
                const previousState = this.connectionStates.get(host);
                
                this.connectionStates.set(host, {
                    connected: isConnected,
                    lastCheck: new Date(),
                    previousState: previousState?.connected || false
                });
                
                // Emit events for state changes
                if (previousState && previousState.connected !== isConnected) {
                    if (isConnected) {
                        this.emit('sshConnected', host);
                        logger.info(`SSH connection restored to ${host}`);
                    } else {
                        this.emit('sshDisconnected', host);
                        logger.warn(`SSH connection lost to ${host}`);
                    }
                }
                
            } catch (error) {
                logger.error(`SSH connection check failed for ${host}:`, error);
                this.connectionStates.set(host, {
                    connected: false,
                    lastCheck: new Date(),
                    error: error.message
                });
            }
        }
    }
    
    /**
     * Test SSH connection to host
     */
    async testSSHConnection(host) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, 5000);
            
            const sshProcess = spawn('ssh', [
                '-o', 'ConnectTimeout=5',
                '-o', 'StrictHostKeyChecking=no',
                '-o', 'BatchMode=yes',
                `remote@${host}`,
                'echo "SSH_TEST_SUCCESS"'
            ]);
            
            let output = '';
            sshProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            sshProcess.on('close', (code) => {
                clearTimeout(timeout);
                resolve(code === 0 && output.includes('SSH_TEST_SUCCESS'));
            });
        });
    }
    
    /**
     * Validate remote execution context
     */
    async validateRemoteContext() {
        // Check if we're running in a remote SSH session
        const sshConnection = process.env.SSH_CONNECTION || process.env.SSH_CLIENT;
        const remoteHost = process.env.SSH_CLIENT?.split(' ')[0];
        
        if (!sshConnection && this.config.strictMode) {
            logger.warn('No SSH connection detected - potential local execution');
            this.logExecution('CONTEXT_VALIDATION_FAILED', 'No SSH connection detected');
        }
        
        // Validate platform
        if (os.platform() === 'win32' && this.config.strictMode) {
            logger.warn('Windows platform detected - should be running on Linux');
            this.logExecution('PLATFORM_VALIDATION_FAILED', 'Windows platform detected');
        }
    }
    
    /**
     * Check for unauthorized PowerShell processes
     */
    async checkPowerShellProcesses() {
        return new Promise((resolve) => {
            if (os.platform() !== 'win32') {
                resolve();
                return;
            }
            
            exec('tasklist /FI "IMAGENAME eq powershell.exe" /FO CSV', (error, stdout) => {
                if (error) {
                    resolve();
                    return;
                }
                
                const lines = stdout.split('\n').filter(line => line.includes('powershell.exe'));
                if (lines.length > 1) { // More than header line
                    logger.warn(`Detected ${lines.length - 1} PowerShell processes`);
                    this.logExecution('POWERSHELL_DETECTED', `${lines.length - 1} processes found`);
                    this.preventionCount++;
                    
                    if (this.preventionCount >= this.config.alertThreshold) {
                        this.emit('alertThresholdReached', this.preventionCount);
                    }
                }
                resolve();
            });
        });
    }
    
    /**
     * Setup process monitoring
     */
    setupProcessMonitoring() {
        // Override child_process methods to intercept execution
        const originalSpawn = require('child_process').spawn;
        const originalExec = require('child_process').exec;
        
        require('child_process').spawn = (...args) => {
            const command = args[0];
            if (this.shouldBlockCommand(command)) {
                this.logExecution('COMMAND_BLOCKED', `Blocked command: ${command}`);
                throw new Error(`Command blocked by Remote Execution Enforcer: ${command}`);
            }
            return originalSpawn.apply(this, args);
        };
        
        require('child_process').exec = (...args) => {
            const command = args[0];
            if (this.shouldBlockCommand(command)) {
                this.logExecution('COMMAND_BLOCKED', `Blocked command: ${command}`);
                throw new Error(`Command blocked by Remote Execution Enforcer: ${command}`);
            }
            return originalExec.apply(this, args);
        };
    }
    
    /**
     * Check if command should be blocked
     */
    shouldBlockCommand(command) {
        if (!this.config.enabled) return false;
        
        const lowerCommand = command.toLowerCase();
        return this.config.blockedCommands.some(blocked => 
            lowerCommand.includes(blocked.toLowerCase())
        );
    }
    
    /**
     * Log execution event
     */
    logExecution(type, details) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            details,
            platform: os.platform(),
            hostname: os.hostname(),
            sshConnection: process.env.SSH_CONNECTION || null
        };
        
        this.executionLog.push(logEntry);
        this.emit('executionLogged', logEntry);
        
        logger.info(`Remote Execution Enforcer: ${type} - ${details}`);
    }
    
    /**
     * Clean up old logs
     */
    cleanupLogs() {
        if (this.executionLog.length > this.config.logRetention) {
            this.executionLog = this.executionLog.slice(-this.config.logRetention);
        }
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            active: this.isActive,
            connectionStates: Object.fromEntries(this.connectionStates),
            preventionCount: this.preventionCount,
            logCount: this.executionLog.length,
            config: this.config
        };
    }
    
    /**
     * Get execution logs
     */
    getLogs(limit = 50) {
        return this.executionLog.slice(-limit);
    }
    
    /**
     * Force emergency shutdown of local processes
     */
    async emergencyShutdown() {
        logger.warn('Emergency shutdown initiated - terminating local processes');
        
        if (os.platform() === 'win32') {
            // Kill PowerShell processes
            exec('taskkill /F /IM powershell.exe', (error) => {
                if (!error) {
                    logger.info('PowerShell processes terminated');
                }
            });
            
            exec('taskkill /F /IM pwsh.exe', (error) => {
                if (!error) {
                    logger.info('PowerShell Core processes terminated');
                }
            });
        }
        
        this.logExecution('EMERGENCY_SHUTDOWN', 'Local processes terminated');
        this.emit('emergencyShutdown');
    }
}

module.exports = RemoteExecutionEnforcer;
