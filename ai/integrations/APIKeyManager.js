/**
 * API Key Management System
 * 
 * Secure management of API keys with rotation, validation,
 * and monitoring capabilities.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('../../scripts/logger');

class APIKeyManager extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            keyStorePath: options.keyStorePath || '.env.keys',
            encryptionKey: options.encryptionKey || process.env.ENCRYPTION_KEY,
            rotationInterval: options.rotationInterval || 30 * 24 * 60 * 60 * 1000, // 30 days
            enableRotation: options.enableRotation !== false,
            enableValidation: options.enableValidation !== false,
            ...options
        };

        // Key store
        this.keys = new Map();
        this.keyMetadata = new Map();
        
        // Validation cache
        this.validationCache = new Map();
        this.validationCacheTimeout = 5 * 60 * 1000; // 5 minutes

        this.initialize();
    }

    /**
     * Initialize the key manager
     */
    async initialize() {
        try {
            await this.loadKeys();
            
            if (this.config.enableRotation) {
                this.startRotationScheduler();
            }
            
            if (this.config.enableValidation) {
                this.startValidationScheduler();
            }
            
            logger.info('🔐 API Key Manager initialized');
        } catch (error) {
            logger.error('❌ Failed to initialize API Key Manager:', error.message);
            throw error;
        }
    }

    /**
     * Load API keys from environment and secure storage
     */
    async loadKeys() {
        // Load from environment variables
        const envKeys = {
            openai: process.env.OPENAI_API_KEY,
            anthropic: process.env.ANTHROPIC_API_KEY,
            google: process.env.GOOGLE_API_KEY,
            // topmediai: removed - no longer used
        };

        for (const [provider, key] of Object.entries(envKeys)) {
            if (key) {
                this.setKey(provider, key, {
                    source: 'environment',
                    createdAt: new Date().toISOString(),
                    lastValidated: null,
                    isValid: null
                });
            }
        }

        // Try to load from secure key store
        try {
            await this.loadFromSecureStore();
        } catch (error) {
            logger.warn('⚠️ Could not load from secure key store:', error.message);
        }

        logger.info(`🔑 Loaded ${this.keys.size} API keys`);
    }

    /**
     * Load keys from encrypted secure store
     */
    async loadFromSecureStore() {
        try {
            const keyStorePath = path.resolve(this.config.keyStorePath);
            const encryptedData = await fs.readFile(keyStorePath, 'utf8');
            
            if (this.config.encryptionKey) {
                const decryptedData = this.decrypt(encryptedData);
                const keyData = JSON.parse(decryptedData);
                
                for (const [provider, data] of Object.entries(keyData)) {
                    this.setKey(provider, data.key, {
                        ...data.metadata,
                        source: 'secure_store'
                    });
                }
                
                logger.info('🔓 Loaded keys from secure store');
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * Save keys to encrypted secure store
     */
    async saveToSecureStore() {
        if (!this.config.encryptionKey) {
            logger.warn('⚠️ No encryption key provided, skipping secure store save');
            return;
        }

        try {
            const keyData = {};
            
            for (const [provider, key] of this.keys) {
                const metadata = this.keyMetadata.get(provider);
                keyData[provider] = {
                    key: key,
                    metadata: metadata
                };
            }
            
            const jsonData = JSON.stringify(keyData, null, 2);
            const encryptedData = this.encrypt(jsonData);
            
            const keyStorePath = path.resolve(this.config.keyStorePath);
            await fs.writeFile(keyStorePath, encryptedData, 'utf8');
            
            logger.info('🔒 Saved keys to secure store');
        } catch (error) {
            logger.error('❌ Failed to save to secure store:', error.message);
            throw error;
        }
    }

    /**
     * Set API key for a provider
     */
    setKey(provider, key, metadata = {}) {
        if (!provider || !key) {
            throw new Error('Provider and key are required');
        }

        this.keys.set(provider, key);
        this.keyMetadata.set(provider, {
            createdAt: new Date().toISOString(),
            lastUsed: null,
            lastValidated: null,
            isValid: null,
            usageCount: 0,
            ...metadata
        });

        // Clear validation cache
        this.validationCache.delete(provider);

        this.emit('key_updated', { provider, metadata: this.keyMetadata.get(provider) });
        logger.info(`🔑 Updated API key for ${provider}`);
    }

    /**
     * Get API key for a provider
     */
    getKey(provider) {
        const key = this.keys.get(provider);
        
        if (key) {
            // Update usage metadata
            const metadata = this.keyMetadata.get(provider);
            if (metadata) {
                metadata.lastUsed = new Date().toISOString();
                metadata.usageCount = (metadata.usageCount || 0) + 1;
            }
        }
        
        return key;
    }

    /**
     * Validate API key
     */
    async validateKey(provider, force = false) {
        const key = this.keys.get(provider);
        if (!key) {
            return { valid: false, error: 'Key not found' };
        }

        // Check cache unless forced
        if (!force) {
            const cached = this.validationCache.get(provider);
            if (cached && Date.now() - cached.timestamp < this.validationCacheTimeout) {
                return cached.result;
            }
        }

        try {
            const result = await this.performKeyValidation(provider, key);
            
            // Update metadata
            const metadata = this.keyMetadata.get(provider);
            if (metadata) {
                metadata.lastValidated = new Date().toISOString();
                metadata.isValid = result.valid;
            }

            // Cache result
            this.validationCache.set(provider, {
                result,
                timestamp: Date.now()
            });

            this.emit('key_validated', { provider, result });
            
            return result;
        } catch (error) {
            const result = { valid: false, error: error.message };
            
            // Cache error result for shorter time
            this.validationCache.set(provider, {
                result,
                timestamp: Date.now() - (this.validationCacheTimeout * 0.8) // Cache for 20% of normal time
            });
            
            return result;
        }
    }

    /**
     * Perform actual key validation based on provider
     */
    async performKeyValidation(provider, key) {
        const axios = require('axios');
        
        const validationConfigs = {
            openai: {
                url: 'https://api.openai.com/v1/models',
                headers: { 'Authorization': `Bearer ${key}` }
            },
            anthropic: {
                url: 'https://api.anthropic.com/v1/messages',
                headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
                method: 'POST',
                data: {
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'test' }]
                }
            },
            google: {
                url: `https://generativelanguage.googleapis.com/v1/models?key=${key}`,
                headers: {}
            }
        };

        const config = validationConfigs[provider];
        if (!config) {
            return { valid: false, error: 'Validation not supported for this provider' };
        }

        try {
            const response = await axios({
                method: config.method || 'GET',
                url: config.url,
                headers: config.headers,
                data: config.data,
                timeout: 10000
            });

            return {
                valid: true,
                status: response.status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                if (status === 401 || status === 403) {
                    return { valid: false, error: 'Invalid or expired key' };
                } else if (status === 429) {
                    return { valid: true, error: 'Rate limited (key is valid)' };
                }
            }
            
            return { valid: false, error: error.message };
        }
    }

    /**
     * Rotate API key
     */
    async rotateKey(provider, newKey) {
        if (!newKey) {
            throw new Error('New key is required for rotation');
        }

        const oldKey = this.keys.get(provider);
        const oldMetadata = this.keyMetadata.get(provider);

        // Validate new key
        const validation = await this.validateKey(provider, true);
        if (!validation.valid) {
            throw new Error(`New key validation failed: ${validation.error}`);
        }

        // Set new key
        this.setKey(provider, newKey, {
            ...oldMetadata,
            rotatedAt: new Date().toISOString(),
            previousKey: oldKey ? oldKey.slice(-4) : null // Store last 4 chars for reference
        });

        await this.saveToSecureStore();

        this.emit('key_rotated', { provider, oldKey: oldKey?.slice(-4), newKey: newKey.slice(-4) });
        logger.info(`🔄 Rotated API key for ${provider}`);
    }

    /**
     * Get key status and metadata
     */
    getKeyStatus(provider) {
        const key = this.keys.get(provider);
        const metadata = this.keyMetadata.get(provider);
        
        if (!key || !metadata) {
            return null;
        }

        return {
            provider,
            hasKey: true,
            keyPreview: key.slice(-4),
            ...metadata,
            needsRotation: this.needsRotation(metadata)
        };
    }

    /**
     * Check if key needs rotation
     */
    needsRotation(metadata) {
        if (!this.config.enableRotation || !metadata.createdAt) {
            return false;
        }

        const createdAt = new Date(metadata.createdAt);
        const now = new Date();
        const age = now - createdAt;

        return age > this.config.rotationInterval;
    }

    /**
     * Get all key statuses
     */
    getAllKeyStatuses() {
        const statuses = {};
        
        for (const provider of this.keys.keys()) {
            statuses[provider] = this.getKeyStatus(provider);
        }
        
        return statuses;
    }

    /**
     * Start rotation scheduler
     */
    startRotationScheduler() {
        setInterval(() => {
            this.checkForRotationNeeds();
        }, 24 * 60 * 60 * 1000); // Check daily
    }

    /**
     * Start validation scheduler
     */
    startValidationScheduler() {
        setInterval(() => {
            this.validateAllKeys();
        }, 60 * 60 * 1000); // Validate hourly
    }

    /**
     * Check for keys that need rotation
     */
    async checkForRotationNeeds() {
        for (const [provider, metadata] of this.keyMetadata) {
            if (this.needsRotation(metadata)) {
                this.emit('rotation_needed', { provider, metadata });
                logger.warn(`⚠️ API key for ${provider} needs rotation`);
            }
        }
    }

    /**
     * Validate all keys
     */
    async validateAllKeys() {
        for (const provider of this.keys.keys()) {
            try {
                await this.validateKey(provider);
            } catch (error) {
                logger.error(`❌ Validation failed for ${provider}:`, error.message);
            }
        }
    }

    /**
     * Encrypt data
     */
    encrypt(text) {
        if (!this.config.encryptionKey) {
            throw new Error('Encryption key not provided');
        }

        const algorithm = 'aes-256-gcm';
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, this.config.encryptionKey);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedText) {
        if (!this.config.encryptionKey) {
            throw new Error('Encryption key not provided');
        }

        const algorithm = 'aes-256-gcm';
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        
        const decipher = crypto.createDecipher(algorithm, this.config.encryptionKey);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.removeAllListeners();
        this.validationCache.clear();
        logger.info('🧹 API Key Manager cleaned up');
    }
}

module.exports = APIKeyManager;
