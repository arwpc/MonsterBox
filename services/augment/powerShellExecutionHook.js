/**
 * PowerShell Execution Hook Service
 * 
 * Implements pre-execution validation system for PowerShell commands
 * to prevent unauthorized local execution and enforce remote-only
 * command execution through SSH connections.
 */

const EventEmitter = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../scripts/logger');

class PowerShellExecutionHook extends EventEmitter {
    constructor() {
        super();
        
        this.isActive = false;
        this.hookedProcesses = new Map();
        this.executionLog = [];
        this.preventionCount = 0;
        
        // Configuration
        this.config = {
            enabled: true,
            strictMode: true,
            allowedCommands: [
                'ssh',
                'scp',
                'git',
                'node',
                'npm',
                'yarn'
            ],
            blockedCommands: [
                'powershell',
                'pwsh',
                'cmd',
                'powershell.exe',
                'pwsh.exe',
                'cmd.exe'
            ],
            allowedPaths: [
                'C:\\Program Files\\Git\\usr\\bin',
                'C:\\Program Files\\nodejs',
                'C:\\Windows\\System32\\OpenSSH'
            ],
            logRetention: 1000,
            alertThreshold: 3
        };
        
        // Hook state
        this.originalSpawn = null;
        this.originalExec = null;
        this.isHooked = false;
        
        this.initialize();
    }
    
    /**
     * Initialize the PowerShell execution hook
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Install execution hooks
            this.installExecutionHooks();
            
            // Start monitoring
            this.startMonitoring();
            
            this.isActive = true;
            logger.info('PowerShell Execution Hook initialized and active');
            
        } catch (error) {
            logger.error('Failed to initialize PowerShell Execution Hook:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/powershell-hook-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            this.config = { ...this.config, ...loadedConfig };
            
        } catch (error) {
            logger.warn('Could not load PowerShell hook configuration, using defaults');
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/powershell-hook-config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save PowerShell hook configuration:', error);
        }
    }
    
    /**
     * Install execution hooks for child_process methods
     */
    installExecutionHooks() {
        if (this.isHooked) {
            logger.warn('Execution hooks already installed');
            return;
        }
        
        // Store original methods
        this.originalSpawn = require('child_process').spawn;
        this.originalExec = require('child_process').exec;
        
        // Hook spawn method
        require('child_process').spawn = (...args) => {
            return this.hookedSpawn(...args);
        };
        
        // Hook exec method
        require('child_process').exec = (...args) => {
            return this.hookedExec(...args);
        };
        
        this.isHooked = true;
        logger.info('PowerShell execution hooks installed');
    }
    
    /**
     * Uninstall execution hooks
     */
    uninstallExecutionHooks() {
        if (!this.isHooked) {
            return;
        }
        
        // Restore original methods
        if (this.originalSpawn) {
            require('child_process').spawn = this.originalSpawn;
        }
        
        if (this.originalExec) {
            require('child_process').exec = this.originalExec;
        }
        
        this.isHooked = false;
        logger.info('PowerShell execution hooks uninstalled');
    }
    
    /**
     * Hooked spawn method with validation
     */
    hookedSpawn(command, args = [], options = {}) {
        const executionContext = {
            command,
            args,
            options,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            platform: os.platform(),
            cwd: options.cwd || process.cwd()
        };
        
        // Validate execution
        const validationResult = this.validateExecution(executionContext);
        
        if (!validationResult.allowed) {
            this.handleBlockedExecution(executionContext, validationResult.reason);
            throw new Error(`Execution blocked by PowerShell Hook: ${validationResult.reason}`);
        }
        
        // Log allowed execution
        this.logExecution(executionContext, 'ALLOWED');
        
        // Call original spawn
        const childProcess = this.originalSpawn.call(this, command, args, options);
        
        // Track the process
        this.trackChildProcess(childProcess, executionContext);
        
        return childProcess;
    }
    
    /**
     * Hooked exec method with validation
     */
    hookedExec(command, options = {}, callback) {
        // Handle different argument patterns
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        
        const executionContext = {
            command,
            options,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            platform: os.platform(),
            cwd: options.cwd || process.cwd()
        };
        
        // Validate execution
        const validationResult = this.validateExecution(executionContext);
        
        if (!validationResult.allowed) {
            this.handleBlockedExecution(executionContext, validationResult.reason);
            
            if (callback) {
                const error = new Error(`Execution blocked by PowerShell Hook: ${validationResult.reason}`);
                setImmediate(() => callback(error));
                return;
            } else {
                throw new Error(`Execution blocked by PowerShell Hook: ${validationResult.reason}`);
            }
        }
        
        // Log allowed execution
        this.logExecution(executionContext, 'ALLOWED');
        
        // Call original exec
        return this.originalExec.call(this, command, options, callback);
    }
    
    /**
     * Validate execution context
     */
    validateExecution(context) {
        if (!this.config.enabled) {
            return { allowed: true };
        }
        
        const command = context.command.toLowerCase();
        const commandPath = context.command;
        
        // Check if command is explicitly blocked
        if (this.config.blockedCommands.some(blocked => command.includes(blocked))) {
            return {
                allowed: false,
                reason: `Command '${context.command}' is in blocked commands list`
            };
        }
        
        // In strict mode, only allow explicitly allowed commands
        if (this.config.strictMode) {
            const isAllowed = this.config.allowedCommands.some(allowed => 
                command.includes(allowed.toLowerCase())
            );
            
            if (!isAllowed) {
                // Check if command is in allowed paths
                const isInAllowedPath = this.config.allowedPaths.some(allowedPath =>
                    commandPath.toLowerCase().startsWith(allowedPath.toLowerCase())
                );
                
                if (!isInAllowedPath) {
                    return {
                        allowed: false,
                        reason: `Command '${context.command}' not in allowed commands or paths (strict mode)`
                    };
                }
            }
        }
        
        // Check execution environment
        if (this.config.strictMode && os.platform() === 'win32') {
            // Verify we're in a remote SSH context
            const sshConnection = process.env.SSH_CONNECTION || process.env.SSH_CLIENT;
            if (!sshConnection) {
                return {
                    allowed: false,
                    reason: 'No SSH connection detected - local Windows execution blocked'
                };
            }
        }
        
        return { allowed: true };
    }
    
    /**
     * Handle blocked execution
     */
    handleBlockedExecution(context, reason) {
        this.preventionCount++;
        
        const blockEvent = {
            ...context,
            reason,
            preventionCount: this.preventionCount,
            blocked: true
        };
        
        this.logExecution(blockEvent, 'BLOCKED');
        
        logger.warn(`Blocked execution: ${context.command} - ${reason}`);
        
        // Emit prevention event
        this.emit('executionBlocked', blockEvent);
        
        // Check alert threshold
        if (this.preventionCount >= this.config.alertThreshold) {
            this.emit('alertThresholdReached', {
                count: this.preventionCount,
                threshold: this.config.alertThreshold
            });
        }
    }
    
    /**
     * Track child process
     */
    trackChildProcess(childProcess, context) {
        const processId = `${childProcess.pid}_${Date.now()}`;
        
        this.hookedProcesses.set(processId, {
            process: childProcess,
            context,
            startTime: new Date()
        });
        
        // Clean up when process exits
        childProcess.on('exit', (code, signal) => {
            const processInfo = this.hookedProcesses.get(processId);
            if (processInfo) {
                const duration = Date.now() - processInfo.startTime.getTime();
                
                this.logExecution({
                    ...context,
                    exitCode: code,
                    signal,
                    duration
                }, 'COMPLETED');
                
                this.hookedProcesses.delete(processId);
            }
        });
        
        // Handle process errors
        childProcess.on('error', (error) => {
            this.logExecution({
                ...context,
                error: error.message
            }, 'ERROR');
        });
    }
    
    /**
     * Log execution event
     */
    logExecution(context, type) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            ...context
        };
        
        this.executionLog.push(logEntry);
        
        // Trim log if too large
        if (this.executionLog.length > this.config.logRetention) {
            this.executionLog = this.executionLog.slice(-this.config.logRetention);
        }
        
        // Emit log event
        this.emit('executionLogged', logEntry);
    }
    
    /**
     * Start monitoring system
     */
    startMonitoring() {
        // Monitor for PowerShell processes every 10 seconds
        setInterval(() => {
            this.checkForPowerShellProcesses();
        }, 10000);
        
        // Monitor hooked processes every 30 seconds
        setInterval(() => {
            this.cleanupStaleProcesses();
        }, 30000);
    }
    
    /**
     * Check for unauthorized PowerShell processes
     */
    async checkForPowerShellProcesses() {
        if (os.platform() !== 'win32') {
            return;
        }
        
        try {
            const { stdout } = await this.execPromise('tasklist /FI "IMAGENAME eq powershell.exe" /FO CSV');
            const lines = stdout.split('\n').filter(line => line.includes('powershell.exe'));
            
            if (lines.length > 1) { // More than header
                logger.warn(`Detected ${lines.length - 1} PowerShell processes`);
                
                this.emit('unauthorizedProcessDetected', {
                    processType: 'powershell',
                    count: lines.length - 1,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Ignore errors in process checking
        }
    }
    
    /**
     * Clean up stale process tracking
     */
    cleanupStaleProcesses() {
        const now = Date.now();
        const staleThreshold = 5 * 60 * 1000; // 5 minutes
        
        for (const [processId, processInfo] of this.hookedProcesses.entries()) {
            if (now - processInfo.startTime.getTime() > staleThreshold) {
                this.hookedProcesses.delete(processId);
            }
        }
    }
    
    /**
     * Promisified exec
     */
    execPromise(command) {
        return new Promise((resolve, reject) => {
            this.originalExec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
    
    /**
     * Get hook statistics
     */
    getStatistics() {
        return {
            isActive: this.isActive,
            isHooked: this.isHooked,
            preventionCount: this.preventionCount,
            activeProcesses: this.hookedProcesses.size,
            logEntries: this.executionLog.length,
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
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfiguration();
        
        logger.info('PowerShell hook configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * Emergency shutdown - kill all PowerShell processes
     */
    async emergencyShutdown() {
        if (os.platform() !== 'win32') {
            return;
        }
        
        try {
            logger.warn('Emergency shutdown: Terminating PowerShell processes');
            
            await this.execPromise('taskkill /F /IM powershell.exe');
            await this.execPromise('taskkill /F /IM pwsh.exe');
            
            this.logExecution({
                command: 'emergencyShutdown',
                timestamp: new Date().toISOString()
            }, 'EMERGENCY_SHUTDOWN');
            
            this.emit('emergencyShutdown');
            
        } catch (error) {
            logger.error('Emergency shutdown failed:', error);
        }
    }
    
    /**
     * Shutdown the hook system
     */
    async shutdown() {
        logger.info('Shutting down PowerShell Execution Hook');
        
        this.uninstallExecutionHooks();
        this.isActive = false;
        
        this.emit('shutdown');
    }
}

module.exports = PowerShellExecutionHook;
