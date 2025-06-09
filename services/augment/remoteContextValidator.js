/**
 * Remote Context Validator Service
 * 
 * Creates system to verify remote execution environment integrity
 * and ensure all operations are running in the correct SSH context
 * on remote Linux hosts rather than local Windows environment.
 */

const EventEmitter = require('events');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../../scripts/logger');

class RemoteContextValidator extends EventEmitter {
    constructor() {
        super();
        
        this.isActive = false;
        this.validationResults = [];
        this.contextCache = new Map();
        this.validationCount = 0;
        
        // Configuration
        this.config = {
            enabled: true,
            strictMode: true,
            validationInterval: 30000, // 30 seconds
            cacheTimeout: 60000, // 1 minute
            requiredEnvironmentVars: [
                'SSH_CONNECTION',
                'SSH_CLIENT'
            ],
            expectedPlatform: 'linux',
            allowedRemoteHosts: [
                '192.168.8.120',
                '192.168.8.130', 
                '192.168.8.140',
                '192.168.1.101'
            ],
            allowedRemoteUsers: [
                'remote',
                'pi',
                'ubuntu'
            ],
            validationChecks: {
                sshConnection: true,
                platformCheck: true,
                userValidation: true,
                hostValidation: true,
                environmentValidation: true,
                processValidation: true
            }
        };
        
        // Validation state
        this.lastValidation = null;
        this.validationTimer = null;
        this.isValid = false;
        
        this.initialize();
    }
    
    /**
     * Initialize the remote context validator
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Perform initial validation
            await this.performValidation();
            
            // Start periodic validation
            this.startPeriodicValidation();
            
            this.isActive = true;
            logger.info('Remote Context Validator initialized and active');
            
        } catch (error) {
            logger.error('Failed to initialize Remote Context Validator:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/remote-context-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            this.config = { ...this.config, ...loadedConfig };
            
        } catch (error) {
            logger.warn('Could not load remote context configuration, using defaults');
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/remote-context-config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save remote context configuration:', error);
        }
    }
    
    /**
     * Start periodic validation
     */
    startPeriodicValidation() {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
        }
        
        this.validationTimer = setInterval(async () => {
            await this.performValidation();
        }, this.config.validationInterval);
        
        logger.info(`Started periodic validation every ${this.config.validationInterval}ms`);
    }
    
    /**
     * Stop periodic validation
     */
    stopPeriodicValidation() {
        if (this.validationTimer) {
            clearInterval(this.validationTimer);
            this.validationTimer = null;
        }
    }
    
    /**
     * Perform comprehensive validation
     */
    async performValidation() {
        if (!this.config.enabled) {
            return { valid: true, reason: 'Validation disabled' };
        }
        
        this.validationCount++;
        const validationId = `validation_${this.validationCount}_${Date.now()}`;
        
        logger.debug(`Performing remote context validation: ${validationId}`);
        
        const validationResult = {
            id: validationId,
            timestamp: new Date().toISOString(),
            valid: true,
            checks: {},
            errors: [],
            warnings: [],
            context: {}
        };
        
        try {
            // SSH Connection Check
            if (this.config.validationChecks.sshConnection) {
                validationResult.checks.sshConnection = await this.validateSSHConnection();
            }
            
            // Platform Check
            if (this.config.validationChecks.platformCheck) {
                validationResult.checks.platformCheck = await this.validatePlatform();
            }
            
            // User Validation
            if (this.config.validationChecks.userValidation) {
                validationResult.checks.userValidation = await this.validateUser();
            }
            
            // Host Validation
            if (this.config.validationChecks.hostValidation) {
                validationResult.checks.hostValidation = await this.validateHost();
            }
            
            // Environment Validation
            if (this.config.validationChecks.environmentValidation) {
                validationResult.checks.environmentValidation = await this.validateEnvironment();
            }
            
            // Process Validation
            if (this.config.validationChecks.processValidation) {
                validationResult.checks.processValidation = await this.validateProcessContext();
            }
            
            // Determine overall validity
            validationResult.valid = Object.values(validationResult.checks)
                .every(check => check.valid);
            
            // Collect errors and warnings
            for (const check of Object.values(validationResult.checks)) {
                if (check.errors) {
                    validationResult.errors.push(...check.errors);
                }
                if (check.warnings) {
                    validationResult.warnings.push(...check.warnings);
                }
            }
            
            // Update validation state
            this.isValid = validationResult.valid;
            this.lastValidation = validationResult;
            
            // Store validation result
            this.validationResults.push(validationResult);
            
            // Trim old results
            if (this.validationResults.length > 100) {
                this.validationResults = this.validationResults.slice(-100);
            }
            
            // Emit validation event
            this.emit('validationComplete', validationResult);
            
            if (!validationResult.valid) {
                this.emit('validationFailed', validationResult);
                logger.warn(`Remote context validation failed: ${validationResult.errors.join(', ')}`);
            } else {
                logger.debug('Remote context validation passed');
            }
            
            return validationResult;
            
        } catch (error) {
            validationResult.valid = false;
            validationResult.errors.push(`Validation error: ${error.message}`);
            
            this.emit('validationError', error);
            logger.error('Remote context validation error:', error);
            
            return validationResult;
        }
    }
    
    /**
     * Validate SSH connection
     */
    async validateSSHConnection() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            // Check SSH environment variables
            const sshConnection = process.env.SSH_CONNECTION;
            const sshClient = process.env.SSH_CLIENT;
            const sshTty = process.env.SSH_TTY;
            
            result.details = {
                SSH_CONNECTION: sshConnection,
                SSH_CLIENT: sshClient,
                SSH_TTY: sshTty
            };
            
            if (!sshConnection && !sshClient) {
                result.errors.push('No SSH connection environment variables found');
                return result;
            }
            
            // Parse SSH connection details
            if (sshConnection) {
                const parts = sshConnection.split(' ');
                if (parts.length >= 4) {
                    result.details.clientIP = parts[0];
                    result.details.clientPort = parts[1];
                    result.details.serverIP = parts[2];
                    result.details.serverPort = parts[3];
                }
            }
            
            // Validate remote host
            if (this.config.strictMode && result.details.clientIP) {
                if (!this.config.allowedRemoteHosts.includes(result.details.clientIP)) {
                    result.warnings.push(`Client IP ${result.details.clientIP} not in allowed hosts list`);
                }
            }
            
            result.valid = true;
            
        } catch (error) {
            result.errors.push(`SSH validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate platform
     */
    async validatePlatform() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            const platform = os.platform();
            const arch = os.arch();
            const release = os.release();
            
            result.details = {
                platform,
                arch,
                release,
                expected: this.config.expectedPlatform
            };
            
            if (this.config.strictMode && platform !== this.config.expectedPlatform) {
                result.errors.push(`Platform mismatch: expected ${this.config.expectedPlatform}, got ${platform}`);
                return result;
            }
            
            // Additional platform checks for Linux
            if (platform === 'linux') {
                try {
                    const { stdout } = await this.execPromise('uname -a');
                    result.details.unameOutput = stdout.trim();
                } catch (error) {
                    result.warnings.push('Could not get uname output');
                }
            }
            
            result.valid = true;
            
        } catch (error) {
            result.errors.push(`Platform validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate user context
     */
    async validateUser() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            const username = process.env.USER || process.env.USERNAME;
            const uid = process.getuid ? process.getuid() : null;
            const gid = process.getgid ? process.getgid() : null;
            
            result.details = {
                username,
                uid,
                gid,
                allowedUsers: this.config.allowedRemoteUsers
            };
            
            if (!username) {
                result.errors.push('No username found in environment');
                return result;
            }
            
            if (this.config.strictMode && !this.config.allowedRemoteUsers.includes(username)) {
                result.errors.push(`User ${username} not in allowed users list`);
                return result;
            }
            
            result.valid = true;
            
        } catch (error) {
            result.errors.push(`User validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate host context
     */
    async validateHost() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            const hostname = os.hostname();
            
            result.details = {
                hostname,
                allowedHosts: this.config.allowedRemoteHosts
            };
            
            // Try to get IP address
            try {
                const { stdout } = await this.execPromise('hostname -I');
                result.details.ipAddresses = stdout.trim().split(' ');
            } catch (error) {
                result.warnings.push('Could not get IP addresses');
            }
            
            result.valid = true;
            
        } catch (error) {
            result.errors.push(`Host validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate environment variables
     */
    async validateEnvironment() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            const envVars = {};
            
            // Check required environment variables
            for (const varName of this.config.requiredEnvironmentVars) {
                envVars[varName] = process.env[varName] || null;
                
                if (!envVars[varName]) {
                    result.errors.push(`Required environment variable ${varName} not found`);
                }
            }
            
            // Check additional relevant variables
            const additionalVars = ['TERM', 'SHELL', 'HOME', 'PWD'];
            for (const varName of additionalVars) {
                envVars[varName] = process.env[varName] || null;
            }
            
            result.details = envVars;
            
            if (result.errors.length === 0) {
                result.valid = true;
            }
            
        } catch (error) {
            result.errors.push(`Environment validation error: ${error.message}`);
        }
        
        return result;
    }
    
    /**
     * Validate process context
     */
    async validateProcessContext() {
        const result = {
            valid: false,
            errors: [],
            warnings: [],
            details: {}
        };
        
        try {
            result.details = {
                pid: process.pid,
                ppid: process.ppid,
                platform: process.platform,
                arch: process.arch,
                version: process.version,
                cwd: process.cwd()
            };
            
            // Check if running under SSH
            if (process.env.SSH_CONNECTION || process.env.SSH_CLIENT) {
                result.details.sshContext = true;
            } else {
                result.warnings.push('No SSH context detected');
            }
            
            result.valid = true;
            
        } catch (error) {
            result.errors.push(`Process validation error: ${error.message}`);
        }
        
        return result;
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
     * Get current validation status
     */
    getValidationStatus() {
        return {
            isValid: this.isValid,
            lastValidation: this.lastValidation,
            validationCount: this.validationCount,
            isActive: this.isActive
        };
    }
    
    /**
     * Get validation history
     */
    getValidationHistory(limit = 10) {
        return this.validationResults.slice(-limit);
    }
    
    /**
     * Force validation
     */
    async forceValidation() {
        return await this.performValidation();
    }
    
    /**
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfiguration();
        
        logger.info('Remote context validator configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * Get statistics
     */
    getStatistics() {
        return {
            isActive: this.isActive,
            isValid: this.isValid,
            validationCount: this.validationCount,
            validationResults: this.validationResults.length,
            config: this.config,
            lastValidation: this.lastValidation?.timestamp
        };
    }
    
    /**
     * Shutdown validator
     */
    async shutdown() {
        logger.info('Shutting down Remote Context Validator');
        
        this.stopPeriodicValidation();
        this.isActive = false;
        
        this.emit('shutdown');
    }
}

module.exports = RemoteContextValidator;
