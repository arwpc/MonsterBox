/**
 * Data Access Layer for MonsterBox
 * 
 * Provides optimized file-based data access with connection pooling,
 * caching, and transaction-like operations for JSON files.
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

class FileConnectionPool {
    constructor(options = {}) {
        this.maxOpenFiles = options.maxOpenFiles || 20;
        this.cacheTimeout = options.cacheTimeout || 300000; // 5 minutes
        this.openFiles = new Map();
        this.fileCache = new Map();
        this.fileLocks = new Map();
        this.accessTimes = new Map();
        
        // Cleanup interval
        setInterval(() => this.cleanup(), 60000); // Every minute
    }

    /**
     * Get file handle with pooling
     */
    async getFileHandle(filePath, mode = 'r') {
        const normalizedPath = path.resolve(filePath);
        const key = `${normalizedPath}:${mode}`;
        
        // Check if file is already open
        if (this.openFiles.has(key)) {
            this.accessTimes.set(key, Date.now());
            return this.openFiles.get(key);
        }
        
        // Check pool limit
        if (this.openFiles.size >= this.maxOpenFiles) {
            await this.closeOldestFile();
        }
        
        try {
            const handle = await fs.open(normalizedPath, mode);
            this.openFiles.set(key, handle);
            this.accessTimes.set(key, Date.now());
            
            logger.debug(`Opened file handle: ${normalizedPath}`);
            return handle;
        } catch (error) {
            logger.error(`Failed to open file ${normalizedPath}:`, error);
            throw error;
        }
    }

    /**
     * Close oldest file to make room
     */
    async closeOldestFile() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, time] of this.accessTimes) {
            if (time < oldestTime) {
                oldestTime = time;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            await this.closeFile(oldestKey);
        }
    }

    /**
     * Close specific file
     */
    async closeFile(key) {
        const handle = this.openFiles.get(key);
        if (handle) {
            try {
                await handle.close();
                this.openFiles.delete(key);
                this.accessTimes.delete(key);
                logger.debug(`Closed file handle: ${key}`);
            } catch (error) {
                logger.error(`Error closing file ${key}:`, error);
            }
        }
    }

    /**
     * Cleanup old files and cache
     */
    async cleanup() {
        const now = Date.now();
        const maxAge = 300000; // 5 minutes
        
        // Close old file handles
        for (const [key, time] of this.accessTimes) {
            if (now - time > maxAge) {
                await this.closeFile(key);
            }
        }
        
        // Clear old cache entries
        for (const [key, entry] of this.fileCache) {
            if (now - entry.timestamp > this.cacheTimeout) {
                this.fileCache.delete(key);
            }
        }
    }

    /**
     * Close all files
     */
    async closeAll() {
        const closePromises = [];
        for (const key of this.openFiles.keys()) {
            closePromises.push(this.closeFile(key));
        }
        await Promise.all(closePromises);
    }
}

class DataAccessLayer extends EventEmitter {
    constructor(options = {}) {
        super();
        this.filePool = new FileConnectionPool(options.filePool);
        this.config = {
            enableCache: options.enableCache !== false,
            cacheTimeout: options.cacheTimeout || 300000,
            enableBackups: options.enableBackups !== false,
            backupDir: options.backupDir || 'data/backups',
            maxBackups: options.maxBackups || 5,
            ...options
        };
        
        this.cache = new Map();
        this.locks = new Map();
        
        // Ensure backup directory exists
        if (this.config.enableBackups) {
            this.ensureBackupDir();
        }
    }

    /**
     * Read JSON file with caching
     */
    async readJSON(filePath) {
        const normalizedPath = path.resolve(filePath);
        
        // Check cache first
        if (this.config.enableCache && this.cache.has(normalizedPath)) {
            const cached = this.cache.get(normalizedPath);
            if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
                logger.debug(`Cache hit for: ${normalizedPath}`);
                return cached.data;
            }
        }
        
        try {
            const data = await fs.readFile(normalizedPath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Update cache
            if (this.config.enableCache) {
                this.cache.set(normalizedPath, {
                    data: parsed,
                    timestamp: Date.now()
                });
            }
            
            logger.debug(`Read JSON file: ${normalizedPath}`);
            return parsed;
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.warn(`File not found: ${normalizedPath}`);
                return null;
            }
            logger.error(`Error reading JSON file ${normalizedPath}:`, error);
            throw error;
        }
    }

    /**
     * Write JSON file with backup and atomic operation
     */
    async writeJSON(filePath, data) {
        const normalizedPath = path.resolve(filePath);
        
        // Acquire lock
        await this.acquireLock(normalizedPath);
        
        try {
            // Create backup if enabled
            if (this.config.enableBackups) {
                await this.createBackup(normalizedPath);
            }
            
            // Write to temporary file first (atomic operation)
            const tempPath = `${normalizedPath}.tmp`;
            const jsonData = JSON.stringify(data, null, 2);
            
            await fs.writeFile(tempPath, jsonData, 'utf8');
            
            // Atomic rename
            await fs.rename(tempPath, normalizedPath);
            
            // Update cache
            if (this.config.enableCache) {
                this.cache.set(normalizedPath, {
                    data: data,
                    timestamp: Date.now()
                });
            }
            
            logger.debug(`Wrote JSON file: ${normalizedPath}`);
            this.emit('fileWritten', { path: normalizedPath, size: jsonData.length });
            
        } finally {
            this.releaseLock(normalizedPath);
        }
    }

    /**
     * Update JSON file with partial data
     */
    async updateJSON(filePath, updateFn) {
        const normalizedPath = path.resolve(filePath);
        
        await this.acquireLock(normalizedPath);
        
        try {
            const currentData = await this.readJSON(normalizedPath) || {};
            const updatedData = await updateFn(currentData);
            await this.writeJSON(normalizedPath, updatedData);
            
            return updatedData;
        } finally {
            this.releaseLock(normalizedPath);
        }
    }

    /**
     * Create backup of file
     */
    async createBackup(filePath) {
        try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                const backupName = `${path.basename(filePath)}.${Date.now()}.backup`;
                const backupPath = path.join(this.config.backupDir, backupName);
                
                await fs.copyFile(filePath, backupPath);
                
                // Clean old backups
                await this.cleanOldBackups(path.basename(filePath));
                
                logger.debug(`Created backup: ${backupPath}`);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                logger.error(`Error creating backup for ${filePath}:`, error);
            }
        }
    }

    /**
     * Clean old backup files
     */
    async cleanOldBackups(fileName) {
        try {
            const files = await fs.readdir(this.config.backupDir);
            const backups = files
                .filter(file => file.startsWith(fileName) && file.endsWith('.backup'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.backupDir, file),
                    timestamp: parseInt(file.split('.').slice(-2, -1)[0])
                }))
                .sort((a, b) => b.timestamp - a.timestamp);
            
            // Remove old backups
            if (backups.length > this.config.maxBackups) {
                const toDelete = backups.slice(this.config.maxBackups);
                for (const backup of toDelete) {
                    await fs.unlink(backup.path);
                    logger.debug(`Deleted old backup: ${backup.name}`);
                }
            }
        } catch (error) {
            logger.error('Error cleaning old backups:', error);
        }
    }

    /**
     * Acquire file lock
     */
    async acquireLock(filePath) {
        while (this.locks.has(filePath)) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.locks.set(filePath, Date.now());
    }

    /**
     * Release file lock
     */
    releaseLock(filePath) {
        this.locks.delete(filePath);
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDir() {
        try {
            await fs.mkdir(this.config.backupDir, { recursive: true });
        } catch (error) {
            logger.error('Error creating backup directory:', error);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: this.cache.size,
            openFiles: this.filePool.openFiles.size,
            activeLocks: this.locks.size
        };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        logger.info('Data access cache cleared');
    }

    /**
     * Shutdown and cleanup
     */
    async shutdown() {
        logger.info('Shutting down Data Access Layer...');
        await this.filePool.closeAll();
        this.cache.clear();
        this.locks.clear();
        logger.info('Data Access Layer shutdown complete');
    }
}

module.exports = DataAccessLayer;
