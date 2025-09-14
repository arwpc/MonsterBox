/**
 * Enhanced SSH Credential Management System for MonsterBox
 * Provides secure credential storage, encryption, key rotation, and multiple authentication methods
 * Uses environment variables for all sensitive configuration
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('../../scripts/logger');

// Load environment variables
require('dotenv').config();

/**
 * Credential encryption and security utilities
 */
class CredentialSecurity {
    constructor(masterKey = null) {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
        this.saltLength = 32;
        
        // Use provided master key or derive from environment
        this.masterKey = masterKey || this._deriveMasterKey();
    }
    
    /**
     * Derive master key from environment variables
     */
    _deriveMasterKey() {
        // Primary master key from environment
        const envKey = process.env.MONSTERBOX_MASTER_KEY;
        if (envKey) {
            const salt = process.env.MONSTERBOX_SALT || 'monsterbox-default-salt';
            return crypto.scryptSync(envKey, salt, this.keyLength);
        }
        
        // Fallback to other environment variables
        const fallbackKey = process.env.ENCRYPTION_KEY || process.env.SECRET_KEY || process.env.JWT_SECRET;
        if (fallbackKey) {
            logger.warn('Using fallback encryption key from environment - consider setting MONSTERBOX_MASTER_KEY');
            const salt = process.env.MONSTERBOX_SALT || 'monsterbox-default-salt';
            return crypto.scryptSync(fallbackKey, salt, this.keyLength);
        }
        
        // No key found - this is a critical error
        logger.error('CRITICAL: No encryption key found in environment variables!');
        logger.error('Please add one of the following to your .env file:');
        logger.error('  MONSTERBOX_MASTER_KEY=your-secure-master-key-here');
        logger.error('  ENCRYPTION_KEY=your-encryption-key-here');
        logger.error('  SECRET_KEY=your-secret-key-here');
        
        // Generate temporary key and show user what to add to .env
        const tempKey = crypto.randomBytes(32).toString('hex');
        logger.error('Temporary key generated - add this to .env: MONSTERBOX_MASTER_KEY=' + tempKey);
        
        throw new Error('No encryption key configured in environment variables');
    }
    
    /**
     * Encrypt credential data
     */
    encrypt(plaintext) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipher(this.algorithm, this.masterKey, { iv });
            
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const tag = cipher.getAuthTag();
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                tag: tag.toString('hex'),
                algorithm: this.algorithm
            };
        } catch (error) {
            logger.error('Encryption failed:', error);
            throw new Error('Failed to encrypt credential data');
        }
    }
    
    /**
     * Decrypt credential data
     */
    decrypt(encryptedData) {
        try {
            const { encrypted, iv, tag, algorithm } = encryptedData;
            
            if (algorithm !== this.algorithm) {
                throw new Error('Unsupported encryption algorithm');
            }
            
            const decipher = crypto.createDecipher(algorithm, this.masterKey, {
                iv: Buffer.from(iv, 'hex')
            });
            
            decipher.setAuthTag(Buffer.from(tag, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            logger.error('Decryption failed:', error);
            throw new Error('Failed to decrypt credential data');
        }
    }
    
    /**
     * Generate secure random password
     */
    generatePassword(length = 16) {
        // Get password complexity from environment
        const minLength = parseInt(process.env.PASSWORD_MIN_LENGTH) || 12;
        const actualLength = Math.max(length, minLength);
        
        const charset = process.env.PASSWORD_CHARSET || 
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        
        let password = '';
        for (let i = 0; i < actualLength; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        
        return password;
    }
    
    /**
     * Hash password for verification
     */
    hashPassword(password, salt = null) {
        const actualSalt = salt || crypto.randomBytes(this.saltLength);
        const hash = crypto.scryptSync(password, actualSalt, 64);
        
        return {
            hash: hash.toString('hex'),
            salt: actualSalt.toString('hex')
        };
    }
    
    /**
     * Verify password against hash
     */
    verifyPassword(password, storedHash, storedSalt) {
        const { hash } = this.hashPassword(password, Buffer.from(storedSalt, 'hex'));
        return hash === storedHash;
    }
}

/**
 * Enhanced Credential Manager
 */
class EnhancedCredentialManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Get paths from environment or use defaults
        const baseDir = process.env.MONSTERBOX_DATA_DIR || path.join(process.cwd(), '.monsterbox');
        this.credentialsPath = options.credentialsPath || 
            process.env.CREDENTIALS_FILE_PATH || 
            path.join(baseDir, 'credentials.json');
        this.backupPath = options.backupPath || 
            process.env.CREDENTIALS_BACKUP_PATH || 
            path.join(baseDir, 'credentials.backup.json');
        
        this.security = new CredentialSecurity(options.masterKey);
        
        // Credential storage
        this.credentials = new Map();
        this.metadata = new Map();
        
        // Configuration from environment
        this.config = {
            rotationIntervalMs: parseInt(process.env.CREDENTIAL_ROTATION_INTERVAL_MS) || 
                options.rotationIntervalMs || 30 * 24 * 60 * 60 * 1000, // 30 days
            backupRetentionCount: parseInt(process.env.BACKUP_RETENTION_COUNT) || 
                options.backupRetentionCount || 5,
            enableAutoRotation: (process.env.ENABLE_AUTO_ROTATION !== 'false') && 
                (options.enableAutoRotation !== false),
            enableAuditLog: (process.env.ENABLE_AUDIT_LOG !== 'false') && 
                (options.enableAuditLog !== false),
            maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS) || 
                options.maxFailedAttempts || 3,
            lockoutDurationMs: parseInt(process.env.LOCKOUT_DURATION_MS) || 
                options.lockoutDurationMs || 15 * 60 * 1000 // 15 minutes
        };
        
        // Audit log
        this.auditLog = [];
        
        // Failed attempt tracking
        this.failedAttempts = new Map();
        
        // Initialize
        this._initialize();
    }
    
    /**
     * Initialize credential manager
     */
    async _initialize() {
        try {
            await this._ensureDirectoryExists();
            await this._loadCredentials();
            
            if (this.config.enableAutoRotation) {
                this._startRotationScheduler();
            }
            
            logger.info('Enhanced credential manager initialized');
            logger.info(`Credentials path: ${this.credentialsPath}`);
            logger.info(`Auto-rotation: ${this.config.enableAutoRotation ? 'enabled' : 'disabled'}`);
            logger.info(`Audit logging: ${this.config.enableAuditLog ? 'enabled' : 'disabled'}`);
        } catch (error) {
            logger.error('Failed to initialize credential manager:', error);
            throw error;
        }
    }
    
    /**
     * Ensure credentials directory exists
     */
    async _ensureDirectoryExists() {
        const dir = path.dirname(this.credentialsPath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
            logger.info(`Created credentials directory: ${dir}`);
        }
    }
    
    /**
     * Load credentials from storage
     */
    async _loadCredentials() {
        try {
            const data = await fs.readFile(this.credentialsPath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Decrypt and load credentials
            for (const [id, encryptedCred] of Object.entries(parsed.credentials || {})) {
                try {
                    const decrypted = this.security.decrypt(encryptedCred.data);
                    const credential = JSON.parse(decrypted);
                    
                    this.credentials.set(id, credential);
                    this.metadata.set(id, {
                        createdAt: new Date(encryptedCred.createdAt),
                        updatedAt: new Date(encryptedCred.updatedAt),
                        lastUsed: encryptedCred.lastUsed ? new Date(encryptedCred.lastUsed) : null,
                        rotationCount: encryptedCred.rotationCount || 0,
                        authMethod: encryptedCred.authMethod || 'password'
                    });
                } catch (error) {
                    logger.error(`Failed to decrypt credential ${id}:`, error);
                }
            }
            
            // Load audit log
            this.auditLog = parsed.auditLog || [];
            
            logger.info(`Loaded ${this.credentials.size} credentials`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error('Failed to load credentials:', error);
            }
            // File doesn't exist, start with empty credentials
        }
    }
    
    /**
     * Save credentials to storage
     */
    async _saveCredentials() {
        try {
            // Create backup first
            await this._createBackup();
            
            const data = {
                version: '1.0',
                createdAt: new Date().toISOString(),
                credentials: {},
                auditLog: this.auditLog.slice(-1000) // Keep last 1000 entries
            };
            
            // Encrypt and store credentials
            for (const [id, credential] of this.credentials) {
                const metadata = this.metadata.get(id);
                const plaintext = JSON.stringify(credential);
                const encrypted = this.security.encrypt(plaintext);
                
                data.credentials[id] = {
                    data: encrypted,
                    createdAt: metadata.createdAt.toISOString(),
                    updatedAt: metadata.updatedAt.toISOString(),
                    lastUsed: metadata.lastUsed?.toISOString(),
                    rotationCount: metadata.rotationCount,
                    authMethod: metadata.authMethod
                };
            }
            
            await fs.writeFile(this.credentialsPath, JSON.stringify(data, null, 2));
            logger.debug('Credentials saved successfully');
        } catch (error) {
            logger.error('Failed to save credentials:', error);
            throw error;
        }
    }
    
    /**
     * Create backup of credentials
     */
    async _createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = this.backupPath.replace('.json', `_${timestamp}.json`);
            
            try {
                await fs.copyFile(this.credentialsPath, backupFile);
                
                // Clean up old backups
                await this._cleanupOldBackups();
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Failed to create backup:', error);
        }
    }
    
    /**
     * Clean up old backup files
     */
    async _cleanupOldBackups() {
        try {
            const dir = path.dirname(this.backupPath);
            const files = await fs.readdir(dir);
            
            const backupFiles = files
                .filter(file => file.startsWith('credentials.backup_') && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(dir, file),
                    stat: null
                }));
            
            // Get file stats
            for (const file of backupFiles) {
                try {
                    file.stat = await fs.stat(file.path);
                } catch (error) {
                    logger.debug(`Failed to stat backup file ${file.name}:`, error);
                }
            }
            
            // Sort by creation time and remove old files
            const validBackups = backupFiles
                .filter(file => file.stat)
                .sort((a, b) => b.stat.birthtime - a.stat.birthtime);
            
            if (validBackups.length > this.config.backupRetentionCount) {
                const filesToDelete = validBackups.slice(this.config.backupRetentionCount);
                
                for (const file of filesToDelete) {
                    try {
                        await fs.unlink(file.path);
                        logger.debug(`Deleted old backup: ${file.name}`);
                    } catch (error) {
                        logger.debug(`Failed to delete backup ${file.name}:`, error);
                    }
                }
            }
        } catch (error) {
            logger.debug('Failed to cleanup old backups:', error);
        }
    }
    
    /**
     * Get credential by ID
     */
    async getCredential(id) {
        try {
            // Check if account is locked
            if (this._isAccountLocked(id)) {
                throw new Error('Account is temporarily locked due to failed attempts');
            }
            
            const credential = this.credentials.get(id);
            if (!credential) {
                this._recordFailedAttempt(id);
                throw new Error('Credential not found');
            }
            
            // Update last used timestamp
            const metadata = this.metadata.get(id);
            if (metadata) {
                metadata.lastUsed = new Date();
                await this._saveCredentials();
            }
            
            // Clear failed attempts on successful access
            this.failedAttempts.delete(id);
            
            this._logAuditEvent('credential_accessed', id);
            
            return { ...credential };
        } catch (error) {
            logger.error(`Failed to get credential ${id}:`, error);
            throw error;
        }
    }
    
    /**
     * Check if account is locked
     */
    _isAccountLocked(id) {
        const attempts = this.failedAttempts.get(id);
        if (!attempts || attempts.count < this.config.maxFailedAttempts) {
            return false;
        }
        
        const lockoutExpiry = new Date(attempts.lastAttempt.getTime() + this.config.lockoutDurationMs);
        const isLocked = new Date() < lockoutExpiry;
        
        if (!isLocked) {
            // Lockout expired, clear failed attempts
            this.failedAttempts.delete(id);
        }
        
        return isLocked;
    }
    
    /**
     * Record failed access attempt
     */
    _recordFailedAttempt(id) {
        const attempts = this.failedAttempts.get(id) || { count: 0, lastAttempt: null };
        attempts.count++;
        attempts.lastAttempt = new Date();
        
        this.failedAttempts.set(id, attempts);
        
        this._logAuditEvent('credential_access_failed', id, {
            attemptCount: attempts.count
        });
        
        if (attempts.count >= this.config.maxFailedAttempts) {
            logger.warn(`Account locked due to failed attempts: ${id}`);
            this.emit('accountLocked', id);
        }
    }
    
    /**
     * Log audit event
     */
    _logAuditEvent(event, credentialId, details = {}) {
        if (!this.config.enableAuditLog) {
            return;
        }
        
        const auditEntry = {
            timestamp: new Date().toISOString(),
            event,
            credentialId,
            details,
            source: 'enhanced-credential-manager'
        };
        
        this.auditLog.push(auditEntry);
        
        // Emit audit event
        this.emit('auditEvent', auditEntry);
    }
    
    /**
     * Get credential statistics
     */
    getStatistics() {
        const now = new Date();
        const stats = {
            totalCredentials: this.credentials.size,
            authMethods: {},
            rotationStats: {
                totalRotations: 0,
                credentialsNeedingRotation: 0
            },
            securityStats: {
                lockedAccounts: 0,
                failedAttempts: this.failedAttempts.size
            },
            auditLogSize: this.auditLog.length,
            configuration: {
                autoRotationEnabled: this.config.enableAutoRotation,
                auditLogEnabled: this.config.enableAuditLog,
                rotationIntervalDays: Math.floor(this.config.rotationIntervalMs / (24 * 60 * 60 * 1000)),
                maxFailedAttempts: this.config.maxFailedAttempts,
                lockoutDurationMinutes: Math.floor(this.config.lockoutDurationMs / (60 * 1000))
            }
        };
        
        // Analyze credentials
        for (const [id, metadata] of this.metadata) {
            // Count auth methods
            stats.authMethods[metadata.authMethod] = (stats.authMethods[metadata.authMethod] || 0) + 1;
            
            // Count rotations
            stats.rotationStats.totalRotations += metadata.rotationCount;
            
            // Check if rotation needed
            const rotationThreshold = new Date(now.getTime() - this.config.rotationIntervalMs);
            if (metadata.updatedAt < rotationThreshold && metadata.authMethod === 'password') {
                stats.rotationStats.credentialsNeedingRotation++;
            }
            
            // Check if account is locked
            if (this._isAccountLocked(id)) {
                stats.securityStats.lockedAccounts++;
            }
        }
        
        return stats;
    }
    
    /**
     * Cleanup and shutdown
     */
    async cleanup() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }
        
        await this._saveCredentials();
        logger.info('Enhanced credential manager cleaned up');
    }
}

module.exports = {
    EnhancedCredentialManager,
    CredentialSecurity
};
