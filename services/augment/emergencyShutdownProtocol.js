/**
 * Emergency Shutdown Protocol Service
 * 
 * Implements immediate termination of local PowerShell processes
 * and emergency response procedures when unauthorized local execution
 * is detected or remote context validation fails.
 */

const EventEmitter = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../scripts/logger');

class EmergencyShutdownProtocol extends EventEmitter {
    constructor() {
        super();
        
        this.isActive = false;
        this.shutdownEvents = [];
        this.emergencyCount = 0;
        
        // Configuration
        this.config = {
            enabled: true,
            autoShutdownEnabled: true,
            shutdownThreshold: 3,
            shutdownDelay: 1000, // 1 second delay before shutdown
            processTerminationTimeout: 5000, // 5 seconds to wait for graceful termination
            forceKillEnabled: true,
            notificationEnabled: true,
            logRetention: 100,
            emergencyActions: {
                killPowerShell: true,
                killCmd: true,
                killWSL: true,
                terminateVSCode: false, // Don't kill VS Code by default
                shutdownSystem: false // Don't shutdown system by default
            },
            targetProcesses: [
                'powershell.exe',
                'pwsh.exe',
                'cmd.exe',
                'wsl.exe',
                'bash.exe'
            ],
            protectedProcesses: [
                'Code.exe',
                'node.exe',
                'ssh.exe',
                'git.exe'
            ]
        };
        
        // Shutdown state
        this.isShuttingDown = false;
        this.shutdownTimer = null;
        this.lastShutdown = null;
        
        this.initialize();
    }
    
    /**
     * Initialize the emergency shutdown protocol
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Setup event handlers
            this.setupEventHandlers();
            
            this.isActive = true;
            logger.info('Emergency Shutdown Protocol initialized and active');
            
        } catch (error) {
            logger.error('Failed to initialize Emergency Shutdown Protocol:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/emergency-shutdown-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            this.config = { ...this.config, ...loadedConfig };
            
        } catch (error) {
            logger.warn('Could not load emergency shutdown configuration, using defaults');
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/emergency-shutdown-config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save emergency shutdown configuration:', error);
        }
    }
    
    /**
     * Setup event handlers for other services
     */
    setupEventHandlers() {
        // These would be connected to other services
        this.on('unauthorizedExecution', (data) => {
            this.handleUnauthorizedExecution(data);
        });
        
        this.on('validationFailure', (data) => {
            this.handleValidationFailure(data);
        });
        
        this.on('securityBreach', (data) => {
            this.handleSecurityBreach(data);
        });
    }
    
    /**
     * Handle unauthorized execution event
     */
    async handleUnauthorizedExecution(data) {
        logger.warn('Unauthorized execution detected, evaluating emergency response');
        
        const event = {
            type: 'UNAUTHORIZED_EXECUTION',
            data,
            timestamp: new Date().toISOString(),
            severity: 'HIGH'
        };
        
        await this.evaluateEmergencyResponse(event);
    }
    
    /**
     * Handle validation failure event
     */
    async handleValidationFailure(data) {
        logger.warn('Remote context validation failed, evaluating emergency response');
        
        const event = {
            type: 'VALIDATION_FAILURE',
            data,
            timestamp: new Date().toISOString(),
            severity: 'MEDIUM'
        };
        
        await this.evaluateEmergencyResponse(event);
    }
    
    /**
     * Handle security breach event
     */
    async handleSecurityBreach(data) {
        logger.error('Security breach detected, initiating emergency response');
        
        const event = {
            type: 'SECURITY_BREACH',
            data,
            timestamp: new Date().toISOString(),
            severity: 'CRITICAL'
        };
        
        await this.evaluateEmergencyResponse(event);
    }
    
    /**
     * Evaluate whether emergency response is needed
     */
    async evaluateEmergencyResponse(event) {
        if (!this.config.enabled) {
            logger.debug('Emergency shutdown protocol disabled');
            return;
        }
        
        this.emergencyCount++;
        this.shutdownEvents.push(event);
        
        // Trim old events
        if (this.shutdownEvents.length > this.config.logRetention) {
            this.shutdownEvents = this.shutdownEvents.slice(-this.config.logRetention);
        }
        
        logger.warn(`Emergency event ${this.emergencyCount}: ${event.type} (${event.severity})`);
        
        // Check if immediate shutdown is required
        const shouldShutdown = this.shouldTriggerShutdown(event);
        
        if (shouldShutdown) {
            await this.initiateEmergencyShutdown(event);
        } else {
            logger.info('Emergency threshold not reached, continuing monitoring');
        }
        
        this.emit('emergencyEventEvaluated', {
            event,
            emergencyCount: this.emergencyCount,
            shutdownTriggered: shouldShutdown
        });
    }
    
    /**
     * Determine if shutdown should be triggered
     */
    shouldTriggerShutdown(event) {
        if (!this.config.autoShutdownEnabled) {
            return false;
        }
        
        // Immediate shutdown for critical events
        if (event.severity === 'CRITICAL') {
            return true;
        }
        
        // Shutdown if threshold reached
        if (this.emergencyCount >= this.config.shutdownThreshold) {
            return true;
        }
        
        // Check for rapid succession of events
        const recentEvents = this.shutdownEvents.filter(e => {
            const eventTime = new Date(e.timestamp).getTime();
            const now = Date.now();
            return (now - eventTime) < 60000; // Last minute
        });
        
        if (recentEvents.length >= 3) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Initiate emergency shutdown
     */
    async initiateEmergencyShutdown(triggerEvent) {
        if (this.isShuttingDown) {
            logger.warn('Emergency shutdown already in progress');
            return;
        }
        
        this.isShuttingDown = true;
        this.lastShutdown = new Date();
        
        logger.error(`🚨 INITIATING EMERGENCY SHUTDOWN - Trigger: ${triggerEvent.type}`);
        
        const shutdownId = `emergency_${Date.now()}`;
        
        try {
            // Send notification
            if (this.config.notificationEnabled) {
                await this.sendEmergencyNotification(triggerEvent, shutdownId);
            }
            
            // Wait for shutdown delay
            if (this.config.shutdownDelay > 0) {
                logger.warn(`Waiting ${this.config.shutdownDelay}ms before emergency shutdown`);
                await this.sleep(this.config.shutdownDelay);
            }
            
            // Execute emergency actions
            await this.executeEmergencyActions(shutdownId);
            
            // Log shutdown completion
            logger.error(`🛑 Emergency shutdown ${shutdownId} completed`);
            
            this.emit('emergencyShutdownComplete', {
                shutdownId,
                triggerEvent,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`Emergency shutdown ${shutdownId} failed:`, error);
            this.emit('emergencyShutdownFailed', {
                shutdownId,
                triggerEvent,
                error: error.message
            });
        } finally {
            this.isShuttingDown = false;
        }
    }
    
    /**
     * Execute emergency actions
     */
    async executeEmergencyActions(shutdownId) {
        const actions = this.config.emergencyActions;
        const results = [];
        
        // Kill PowerShell processes
        if (actions.killPowerShell) {
            const result = await this.killProcessesByName(['powershell.exe', 'pwsh.exe']);
            results.push({ action: 'killPowerShell', ...result });
        }
        
        // Kill CMD processes
        if (actions.killCmd) {
            const result = await this.killProcessesByName(['cmd.exe']);
            results.push({ action: 'killCmd', ...result });
        }
        
        // Kill WSL processes
        if (actions.killWSL) {
            const result = await this.killProcessesByName(['wsl.exe', 'bash.exe']);
            results.push({ action: 'killWSL', ...result });
        }
        
        // Terminate VS Code (if enabled)
        if (actions.terminateVSCode) {
            const result = await this.killProcessesByName(['Code.exe']);
            results.push({ action: 'terminateVSCode', ...result });
        }
        
        // Kill all target processes
        const targetResult = await this.killProcessesByName(this.config.targetProcesses);
        results.push({ action: 'killTargetProcesses', ...targetResult });
        
        // System shutdown (if enabled)
        if (actions.shutdownSystem) {
            const result = await this.shutdownSystem();
            results.push({ action: 'shutdownSystem', ...result });
        }
        
        logger.info(`Emergency actions completed for ${shutdownId}:`, results);
        return results;
    }
    
    /**
     * Kill processes by name
     */
    async killProcessesByName(processNames) {
        if (os.platform() !== 'win32') {
            return { success: false, reason: 'Not Windows platform' };
        }
        
        const results = [];
        
        for (const processName of processNames) {
            try {
                // Check if process exists
                const { stdout } = await this.execPromise(`tasklist /FI "IMAGENAME eq ${processName}" /FO CSV`);
                const lines = stdout.split('\n').filter(line => line.includes(processName));
                
                if (lines.length > 1) { // More than header
                    logger.warn(`Killing ${lines.length - 1} instances of ${processName}`);
                    
                    // Try graceful termination first
                    try {
                        await this.execPromise(`taskkill /IM ${processName}`);
                        results.push({ process: processName, method: 'graceful', success: true });
                    } catch (error) {
                        // Force kill if graceful fails
                        if (this.config.forceKillEnabled) {
                            await this.execPromise(`taskkill /F /IM ${processName}`);
                            results.push({ process: processName, method: 'force', success: true });
                        } else {
                            results.push({ process: processName, method: 'graceful', success: false, error: error.message });
                        }
                    }
                } else {
                    results.push({ process: processName, method: 'none', success: true, reason: 'not running' });
                }
                
            } catch (error) {
                results.push({ process: processName, method: 'error', success: false, error: error.message });
            }
        }
        
        return { success: true, results };
    }
    
    /**
     * Shutdown system
     */
    async shutdownSystem() {
        try {
            logger.error('🔥 INITIATING SYSTEM SHUTDOWN');
            
            if (os.platform() === 'win32') {
                await this.execPromise('shutdown /s /t 30 /c "Emergency shutdown initiated by MonsterBox security system"');
            } else {
                await this.execPromise('sudo shutdown -h +1 "Emergency shutdown initiated by MonsterBox security system"');
            }
            
            return { success: true };
            
        } catch (error) {
            logger.error('System shutdown failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Send emergency notification
     */
    async sendEmergencyNotification(triggerEvent, shutdownId) {
        const notification = {
            type: 'EMERGENCY_SHUTDOWN',
            shutdownId,
            triggerEvent,
            timestamp: new Date().toISOString(),
            system: {
                platform: os.platform(),
                hostname: os.hostname(),
                pid: process.pid
            }
        };
        
        logger.error('🚨 EMERGENCY NOTIFICATION:', JSON.stringify(notification, null, 2));
        
        // Emit notification event for other systems to handle
        this.emit('emergencyNotification', notification);
        
        // Could also send email, webhook, etc. here
    }
    
    /**
     * Promisified exec
     */
    execPromise(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }
    
    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Trigger manual emergency shutdown
     */
    async triggerManualShutdown(reason = 'Manual trigger') {
        const event = {
            type: 'MANUAL_TRIGGER',
            data: { reason },
            timestamp: new Date().toISOString(),
            severity: 'CRITICAL'
        };
        
        await this.initiateEmergencyShutdown(event);
    }
    
    /**
     * Reset emergency counter
     */
    resetEmergencyCounter() {
        this.emergencyCount = 0;
        this.shutdownEvents = [];
        logger.info('Emergency counter reset');
        this.emit('emergencyCounterReset');
    }
    
    /**
     * Get emergency statistics
     */
    getStatistics() {
        return {
            isActive: this.isActive,
            isShuttingDown: this.isShuttingDown,
            emergencyCount: this.emergencyCount,
            shutdownEvents: this.shutdownEvents.length,
            lastShutdown: this.lastShutdown,
            config: this.config
        };
    }
    
    /**
     * Get shutdown history
     */
    getShutdownHistory(limit = 10) {
        return this.shutdownEvents.slice(-limit);
    }
    
    /**
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfiguration();
        
        logger.info('Emergency shutdown protocol configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * Shutdown protocol service
     */
    async shutdown() {
        logger.info('Shutting down Emergency Shutdown Protocol');
        
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
        }
        
        this.isActive = false;
        this.emit('shutdown');
    }
}

module.exports = EmergencyShutdownProtocol;
