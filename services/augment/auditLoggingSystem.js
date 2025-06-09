/**
 * Audit Logging System
 * 
 * Creates comprehensive logging for all execution attempts and prevention events
 * with detailed audit trails, security event tracking, and compliance reporting
 * for the PowerShell fallback prevention system.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('../../scripts/logger');

class AuditLoggingSystem extends EventEmitter {
    constructor() {
        super();
        
        this.isActive = false;
        this.auditEntries = [];
        this.logFiles = new Map();
        
        // Configuration
        this.config = {
            enabled: true,
            logLevel: 'info',
            logRetention: 10000,
            fileRotationSize: 10 * 1024 * 1024, // 10MB
            maxLogFiles: 10,
            enableEncryption: false,
            enableIntegrityCheck: true,
            enableRealTimeAlerts: true,
            logDirectory: path.join(__dirname, '../../log/audit'),
            logCategories: {
                execution: true,
                prevention: true,
                validation: true,
                security: true,
                system: true,
                emergency: true
            },
            alertThresholds: {
                preventionEvents: 5,
                securityEvents: 3,
                emergencyEvents: 1
            }
        };
        
        // Audit state
        this.sessionId = this.generateSessionId();
        this.auditCount = 0;
        this.alertCounts = new Map();
        
        this.initialize();
    }
    
    /**
     * Initialize the audit logging system
     */
    async initialize() {
        try {
            // Load configuration
            await this.loadConfiguration();
            
            // Create log directory
            await this.createLogDirectory();
            
            // Initialize log files
            await this.initializeLogFiles();
            
            // Start session
            await this.startAuditSession();
            
            this.isActive = true;
            logger.info('Audit Logging System initialized and active');
            
        } catch (error) {
            logger.error('Failed to initialize Audit Logging System:', error);
            this.emit('initializationError', error);
        }
    }
    
    /**
     * Load configuration from file
     */
    async loadConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/audit-logging-config.json');
            const configData = await fs.readFile(configPath, 'utf8');
            const loadedConfig = JSON.parse(configData);
            
            this.config = { ...this.config, ...loadedConfig };
            
        } catch (error) {
            logger.warn('Could not load audit logging configuration, using defaults');
            await this.saveConfiguration();
        }
    }
    
    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const configPath = path.join(__dirname, '../../data/audit-logging-config.json');
            await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            logger.error('Failed to save audit logging configuration:', error);
        }
    }
    
    /**
     * Create log directory
     */
    async createLogDirectory() {
        try {
            await fs.mkdir(this.config.logDirectory, { recursive: true });
        } catch (error) {
            logger.error('Failed to create audit log directory:', error);
            throw error;
        }
    }
    
    /**
     * Initialize log files
     */
    async initializeLogFiles() {
        const categories = Object.keys(this.config.logCategories);
        
        for (const category of categories) {
            if (this.config.logCategories[category]) {
                const logFile = path.join(this.config.logDirectory, `${category}-audit.log`);
                this.logFiles.set(category, {
                    path: logFile,
                    size: 0,
                    entries: 0
                });
            }
        }
    }
    
    /**
     * Start audit session
     */
    async startAuditSession() {
        const sessionStart = {
            type: 'SESSION_START',
            sessionId: this.sessionId,
            timestamp: new Date().toISOString(),
            system: {
                platform: os.platform(),
                arch: os.arch(),
                hostname: os.hostname(),
                pid: process.pid,
                nodeVersion: process.version
            },
            environment: {
                SSH_CONNECTION: process.env.SSH_CONNECTION,
                SSH_CLIENT: process.env.SSH_CLIENT,
                USER: process.env.USER || process.env.USERNAME
            }
        };
        
        await this.logAuditEvent('system', sessionStart);
        logger.info(`Audit session started: ${this.sessionId}`);
    }
    
    /**
     * Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        return `audit_${timestamp}_${random}`;
    }
    
    /**
     * Log audit event
     */
    async logAuditEvent(category, eventData) {
        if (!this.config.enabled || !this.config.logCategories[category]) {
            return;
        }
        
        this.auditCount++;
        
        const auditEntry = {
            id: this.auditCount,
            sessionId: this.sessionId,
            category,
            timestamp: new Date().toISOString(),
            ...eventData
        };
        
        // Add integrity hash if enabled
        if (this.config.enableIntegrityCheck) {
            auditEntry.hash = this.generateIntegrityHash(auditEntry);
        }
        
        // Store in memory
        this.auditEntries.push(auditEntry);
        
        // Trim memory if too large
        if (this.auditEntries.length > this.config.logRetention) {
            this.auditEntries = this.auditEntries.slice(-this.config.logRetention);
        }
        
        // Write to file
        await this.writeToLogFile(category, auditEntry);
        
        // Check for alerts
        this.checkAlertThresholds(category, auditEntry);
        
        // Emit event
        this.emit('auditEventLogged', auditEntry);
        
        return auditEntry;
    }
    
    /**
     * Generate integrity hash for audit entry
     */
    generateIntegrityHash(entry) {
        const entryString = JSON.stringify(entry, Object.keys(entry).sort());
        return crypto.createHash('sha256').update(entryString).digest('hex');
    }
    
    /**
     * Write audit entry to log file
     */
    async writeToLogFile(category, entry) {
        const logFileInfo = this.logFiles.get(category);
        if (!logFileInfo) {
            return;
        }
        
        try {
            const logLine = JSON.stringify(entry) + '\n';
            
            // Check if file rotation is needed
            if (logFileInfo.size > this.config.fileRotationSize) {
                await this.rotateLogFile(category);
            }
            
            // Write to file
            await fs.appendFile(logFileInfo.path, logLine);
            
            // Update file info
            logFileInfo.size += logLine.length;
            logFileInfo.entries++;
            
        } catch (error) {
            logger.error(`Failed to write audit log for category ${category}:`, error);
        }
    }
    
    /**
     * Rotate log file
     */
    async rotateLogFile(category) {
        const logFileInfo = this.logFiles.get(category);
        if (!logFileInfo) {
            return;
        }
        
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedPath = logFileInfo.path.replace('.log', `-${timestamp}.log`);
            
            // Move current file
            await fs.rename(logFileInfo.path, rotatedPath);
            
            // Reset file info
            logFileInfo.size = 0;
            logFileInfo.entries = 0;
            
            // Clean up old files
            await this.cleanupOldLogFiles(category);
            
            logger.info(`Rotated audit log file for category: ${category}`);
            
        } catch (error) {
            logger.error(`Failed to rotate log file for category ${category}:`, error);
        }
    }
    
    /**
     * Clean up old log files
     */
    async cleanupOldLogFiles(category) {
        try {
            const files = await fs.readdir(this.config.logDirectory);
            const categoryFiles = files
                .filter(file => file.startsWith(`${category}-audit-`) && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.logDirectory, file),
                    stat: null
                }));
            
            // Get file stats
            for (const file of categoryFiles) {
                try {
                    file.stat = await fs.stat(file.path);
                } catch (error) {
                    // Ignore files that can't be accessed
                }
            }
            
            // Sort by modification time (newest first)
            categoryFiles
                .filter(file => file.stat)
                .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());
            
            // Remove excess files
            if (categoryFiles.length > this.config.maxLogFiles) {
                const filesToRemove = categoryFiles.slice(this.config.maxLogFiles);
                
                for (const file of filesToRemove) {
                    try {
                        await fs.unlink(file.path);
                        logger.debug(`Removed old audit log file: ${file.name}`);
                    } catch (error) {
                        logger.error(`Failed to remove old log file ${file.name}:`, error);
                    }
                }
            }
            
        } catch (error) {
            logger.error(`Failed to cleanup old log files for category ${category}:`, error);
        }
    }
    
    /**
     * Check alert thresholds
     */
    checkAlertThresholds(category, entry) {
        if (!this.config.enableRealTimeAlerts) {
            return;
        }
        
        const threshold = this.config.alertThresholds[`${category}Events`];
        if (!threshold) {
            return;
        }
        
        // Count recent events of this category
        const recentEvents = this.auditEntries.filter(e => {
            const eventTime = new Date(e.timestamp).getTime();
            const now = Date.now();
            return e.category === category && (now - eventTime) < 300000; // Last 5 minutes
        });
        
        if (recentEvents.length >= threshold) {
            this.triggerAlert(category, recentEvents.length, threshold);
        }
    }
    
    /**
     * Trigger alert
     */
    async triggerAlert(category, count, threshold) {
        const alertId = `alert_${Date.now()}_${category}`;
        
        const alert = {
            type: 'THRESHOLD_ALERT',
            alertId,
            category,
            count,
            threshold,
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId
        };
        
        // Log the alert
        await this.logAuditEvent('security', alert);
        
        // Emit alert event
        this.emit('auditAlert', alert);
        
        logger.warn(`Audit alert triggered: ${category} events (${count}/${threshold})`);
    }
    
    /**
     * Log execution attempt
     */
    async logExecutionAttempt(command, args, result) {
        const event = {
            type: 'EXECUTION_ATTEMPT',
            command,
            args,
            result,
            platform: os.platform(),
            cwd: process.cwd(),
            user: process.env.USER || process.env.USERNAME
        };
        
        return await this.logAuditEvent('execution', event);
    }
    
    /**
     * Log prevention event
     */
    async logPreventionEvent(command, reason, context) {
        const event = {
            type: 'PREVENTION_EVENT',
            command,
            reason,
            context,
            platform: os.platform(),
            preventionCount: context.preventionCount || 0
        };
        
        return await this.logAuditEvent('prevention', event);
    }
    
    /**
     * Log validation event
     */
    async logValidationEvent(validationType, result, details) {
        const event = {
            type: 'VALIDATION_EVENT',
            validationType,
            result,
            details
        };
        
        return await this.logAuditEvent('validation', event);
    }
    
    /**
     * Log security event
     */
    async logSecurityEvent(eventType, severity, details) {
        const event = {
            type: 'SECURITY_EVENT',
            eventType,
            severity,
            details
        };
        
        return await this.logAuditEvent('security', event);
    }
    
    /**
     * Log emergency event
     */
    async logEmergencyEvent(emergencyType, actions, result) {
        const event = {
            type: 'EMERGENCY_EVENT',
            emergencyType,
            actions,
            result
        };
        
        return await this.logAuditEvent('emergency', event);
    }
    
    /**
     * Get audit statistics
     */
    getStatistics() {
        const categoryStats = {};
        
        for (const category of Object.keys(this.config.logCategories)) {
            const categoryEntries = this.auditEntries.filter(e => e.category === category);
            const logFileInfo = this.logFiles.get(category);
            
            categoryStats[category] = {
                memoryEntries: categoryEntries.length,
                fileEntries: logFileInfo ? logFileInfo.entries : 0,
                fileSize: logFileInfo ? logFileInfo.size : 0
            };
        }
        
        return {
            isActive: this.isActive,
            sessionId: this.sessionId,
            auditCount: this.auditCount,
            totalMemoryEntries: this.auditEntries.length,
            categoryStats,
            config: this.config
        };
    }
    
    /**
     * Get audit entries
     */
    getAuditEntries(category = null, limit = 100) {
        let entries = this.auditEntries;
        
        if (category) {
            entries = entries.filter(e => e.category === category);
        }
        
        return entries.slice(-limit);
    }
    
    /**
     * Search audit entries
     */
    searchAuditEntries(query) {
        const searchTerm = query.toLowerCase();
        
        return this.auditEntries.filter(entry => {
            const entryString = JSON.stringify(entry).toLowerCase();
            return entryString.includes(searchTerm);
        });
    }
    
    /**
     * Export audit log
     */
    async exportAuditLog(category = null, format = 'json') {
        const entries = category ? 
            this.auditEntries.filter(e => e.category === category) : 
            this.auditEntries;
        
        const exportData = {
            sessionId: this.sessionId,
            exportTimestamp: new Date().toISOString(),
            category: category || 'all',
            entryCount: entries.length,
            entries
        };
        
        if (format === 'json') {
            return JSON.stringify(exportData, null, 2);
        } else if (format === 'csv') {
            // Convert to CSV format
            const headers = ['id', 'sessionId', 'category', 'timestamp', 'type'];
            const csvLines = [headers.join(',')];
            
            for (const entry of entries) {
                const row = [
                    entry.id,
                    entry.sessionId,
                    entry.category,
                    entry.timestamp,
                    entry.type
                ];
                csvLines.push(row.join(','));
            }
            
            return csvLines.join('\n');
        }
        
        return exportData;
    }
    
    /**
     * Update configuration
     */
    async updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        await this.saveConfiguration();
        
        logger.info('Audit logging configuration updated');
        this.emit('configurationUpdated', this.config);
    }
    
    /**
     * End audit session
     */
    async endAuditSession() {
        const sessionEnd = {
            type: 'SESSION_END',
            sessionId: this.sessionId,
            auditCount: this.auditCount,
            duration: Date.now() - parseInt(this.sessionId.split('_')[1])
        };
        
        await this.logAuditEvent('system', sessionEnd);
        logger.info(`Audit session ended: ${this.sessionId}`);
    }
    
    /**
     * Shutdown audit logging system
     */
    async shutdown() {
        logger.info('Shutting down Audit Logging System');
        
        await this.endAuditSession();
        
        this.isActive = false;
        this.emit('shutdown');
    }
}

module.exports = AuditLoggingSystem;
