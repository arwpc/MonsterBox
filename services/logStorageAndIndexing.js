/**
 * MonsterBox Log Storage and Indexing Service
 * Task 4.6: Storage and Indexing
 * 
 * Efficient log storage with indexing, compression, and fast querying
 * capabilities for the MonsterBox system
 */

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const winston = require('winston');
const EventEmitter = require('events');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class LogStorageAndIndexing extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            storageDir: config.storageDir || path.join(process.cwd(), 'log', 'storage'),
            indexDir: config.indexDir || path.join(process.cwd(), 'log', 'indexes'),
            compressionEnabled: config.compressionEnabled !== false,
            maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
            indexUpdateInterval: config.indexUpdateInterval || 60000, // 1 minute
            enableFullTextIndex: config.enableFullTextIndex !== false,
            retentionDays: config.retentionDays || 30,
            ...config
        };

        this.currentFiles = new Map();
        this.indexes = new Map();
        this.writeQueue = [];
        this.isWriting = false;
        this.statistics = {
            totalEntries: 0,
            totalFiles: 0,
            totalSize: 0,
            compressedSize: 0,
            indexSize: 0
        };

        this.setupLogger();
        this.initializeStorage();
    }

    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    async initializeStorage() {
        try {
            // Create storage directories
            await fs.mkdir(this.config.storageDir, { recursive: true });
            await fs.mkdir(this.config.indexDir, { recursive: true });
            await fs.mkdir(path.join(this.config.storageDir, 'compressed'), { recursive: true });
            await fs.mkdir(path.join(this.config.storageDir, 'active'), { recursive: true });

            // Load existing indexes
            await this.loadIndexes();

            // Start periodic tasks
            this.startPeriodicTasks();

            this.logger.info('Log storage and indexing initialized', {
                storageDir: this.config.storageDir,
                indexDir: this.config.indexDir
            });

        } catch (error) {
            this.logger.error('Failed to initialize storage', { error: error.message });
            throw error;
        }
    }

    async storeLogEntry(logEntry) {
        // Add to write queue
        this.writeQueue.push({
            ...logEntry,
            storedAt: new Date().toISOString()
        });

        // Process queue if not already processing
        if (!this.isWriting) {
            await this.processWriteQueue();
        }

        return logEntry.id;
    }

    async processWriteQueue() {
        if (this.isWriting || this.writeQueue.length === 0) return;

        this.isWriting = true;

        try {
            const batch = this.writeQueue.splice(0, 100); // Process in batches of 100
            
            // Group by animatronic and service for efficient file writing
            const groups = new Map();
            
            for (const entry of batch) {
                const key = `${entry.animatronic}_${entry.service}`;
                if (!groups.has(key)) {
                    groups.set(key, []);
                }
                groups.get(key).push(entry);
            }

            // Write each group to appropriate files
            for (const [key, entries] of groups) {
                await this.writeEntriesToFile(key, entries);
            }

            this.statistics.totalEntries += batch.length;

        } catch (error) {
            this.logger.error('Error processing write queue', { error: error.message });
        } finally {
            this.isWriting = false;
            
            // Process remaining queue if any
            if (this.writeQueue.length > 0) {
                setImmediate(() => this.processWriteQueue());
            }
        }
    }

    async writeEntriesToFile(key, entries) {
        try {
            const [animatronic, service] = key.split('_');
            const date = new Date().toISOString().split('T')[0];
            const filename = `${animatronic}-${service}-${date}.jsonl`;
            const filepath = path.join(this.config.storageDir, 'active', filename);

            // Check if file needs rotation
            await this.checkFileRotation(filepath);

            // Prepare log lines
            const logLines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';

            // Append to file
            await fs.appendFile(filepath, logLines);

            // Update current file tracking
            if (!this.currentFiles.has(key)) {
                this.currentFiles.set(key, {
                    filepath: filepath,
                    size: 0,
                    entryCount: 0,
                    lastWrite: new Date().toISOString()
                });
            }

            const fileInfo = this.currentFiles.get(key);
            fileInfo.size += logLines.length;
            fileInfo.entryCount += entries.length;
            fileInfo.lastWrite = new Date().toISOString();

            // Update indexes
            await this.updateIndexes(key, entries);

            this.emit('entries_stored', { key, count: entries.length, filepath });

        } catch (error) {
            this.logger.error('Error writing entries to file', {
                key,
                error: error.message,
                entryCount: entries.length
            });
            throw error;
        }
    }

    async checkFileRotation(filepath) {
        try {
            const stats = await fs.stat(filepath);
            
            if (stats.size > this.config.maxFileSize) {
                await this.rotateFile(filepath);
            }
        } catch (error) {
            // File doesn't exist yet, which is fine
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async rotateFile(filepath) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const rotatedPath = filepath.replace('.jsonl', `-${timestamp}.jsonl`);
            
            // Move current file to rotated name
            await fs.rename(filepath, rotatedPath);
            
            // Compress if enabled
            if (this.config.compressionEnabled) {
                await this.compressFile(rotatedPath);
            }

            this.logger.info('File rotated', { 
                original: filepath, 
                rotated: rotatedPath 
            });

        } catch (error) {
            this.logger.error('Error rotating file', {
                filepath,
                error: error.message
            });
        }
    }

    async compressFile(filepath) {
        try {
            const data = await fs.readFile(filepath);
            const compressed = await gzip(data);
            
            const compressedPath = path.join(
                this.config.storageDir,
                'compressed',
                path.basename(filepath) + '.gz'
            );
            
            await fs.writeFile(compressedPath, compressed);
            await fs.unlink(filepath); // Remove original
            
            this.statistics.totalSize += data.length;
            this.statistics.compressedSize += compressed.length;
            
            this.logger.info('File compressed', {
                original: filepath,
                compressed: compressedPath,
                originalSize: data.length,
                compressedSize: compressed.length,
                ratio: (compressed.length / data.length * 100).toFixed(2) + '%'
            });

        } catch (error) {
            this.logger.error('Error compressing file', {
                filepath,
                error: error.message
            });
        }
    }

    async updateIndexes(key, entries) {
        try {
            const [animatronic, service] = key.split('_');
            const indexKey = `${animatronic}_${service}`;
            
            if (!this.indexes.has(indexKey)) {
                this.indexes.set(indexKey, {
                    animatronic,
                    service,
                    totalEntries: 0,
                    firstEntry: null,
                    lastEntry: null,
                    levels: {},
                    dailyCounts: {},
                    hourlyStats: {},
                    keywords: new Map(),
                    lastUpdated: null
                });
            }

            const index = this.indexes.get(indexKey);

            for (const entry of entries) {
                index.totalEntries++;
                
                // Update time bounds
                if (!index.firstEntry || entry.timestamp < index.firstEntry) {
                    index.firstEntry = entry.timestamp;
                }
                if (!index.lastEntry || entry.timestamp > index.lastEntry) {
                    index.lastEntry = entry.timestamp;
                }

                // Count by level
                index.levels[entry.level] = (index.levels[entry.level] || 0) + 1;

                // Count by day
                const day = entry.timestamp.split('T')[0];
                index.dailyCounts[day] = (index.dailyCounts[day] || 0) + 1;

                // Count by hour
                const hour = entry.timestamp.substring(0, 13); // YYYY-MM-DDTHH
                if (!index.hourlyStats[hour]) {
                    index.hourlyStats[hour] = { total: 0, levels: {} };
                }
                index.hourlyStats[hour].total++;
                index.hourlyStats[hour].levels[entry.level] = 
                    (index.hourlyStats[hour].levels[entry.level] || 0) + 1;

                // Extract keywords for full-text search
                if (this.config.enableFullTextIndex) {
                    this.extractKeywords(entry.message, index.keywords);
                }
            }

            index.lastUpdated = new Date().toISOString();

            // Persist index periodically
            if (Math.random() < 0.1) { // 10% chance to persist
                await this.persistIndex(indexKey, index);
            }

        } catch (error) {
            this.logger.error('Error updating indexes', {
                key,
                error: error.message
            });
        }
    }

    extractKeywords(message, keywordMap) {
        if (!message) return;

        // Simple keyword extraction
        const words = message
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2 && word.length < 20);

        for (const word of words) {
            keywordMap.set(word, (keywordMap.get(word) || 0) + 1);
        }
    }

    async persistIndex(indexKey, index) {
        try {
            const indexPath = path.join(this.config.indexDir, `${indexKey}.json`);
            
            // Convert Map to Object for JSON serialization
            const serializable = {
                ...index,
                keywords: Object.fromEntries(index.keywords)
            };
            
            await fs.writeFile(indexPath, JSON.stringify(serializable, null, 2));
            
        } catch (error) {
            this.logger.error('Error persisting index', {
                indexKey,
                error: error.message
            });
        }
    }

    async loadIndexes() {
        try {
            const files = await fs.readdir(this.config.indexDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const indexPath = path.join(this.config.indexDir, file);
                    const indexData = await fs.readFile(indexPath, 'utf8');
                    const index = JSON.parse(indexData);
                    
                    // Convert keywords back to Map
                    index.keywords = new Map(Object.entries(index.keywords || {}));
                    
                    const indexKey = file.replace('.json', '');
                    this.indexes.set(indexKey, index);
                }
            }

            this.logger.info('Loaded indexes', { count: this.indexes.size });
            
        } catch (error) {
            this.logger.warn('Error loading indexes', { error: error.message });
        }
    }

    async queryLogs(query) {
        const {
            animatronic,
            service,
            level,
            since,
            until,
            keywords,
            limit = 100,
            offset = 0
        } = query;

        try {
            // Find relevant files based on query
            const relevantFiles = await this.findRelevantFiles(query);
            
            const results = [];
            let totalFound = 0;
            let skipped = 0;

            for (const file of relevantFiles) {
                if (results.length >= limit) break;

                const entries = await this.readLogFile(file);
                
                for (const entry of entries) {
                    if (this.matchesQuery(entry, query)) {
                        totalFound++;
                        
                        if (skipped < offset) {
                            skipped++;
                            continue;
                        }
                        
                        if (results.length < limit) {
                            results.push(entry);
                        }
                    }
                }
            }

            return {
                results,
                totalFound,
                limit,
                offset,
                hasMore: totalFound > offset + limit
            };

        } catch (error) {
            this.logger.error('Error querying logs', {
                query,
                error: error.message
            });
            throw error;
        }
    }

    async findRelevantFiles(query) {
        const files = [];
        
        // Check active files
        const activeDir = path.join(this.config.storageDir, 'active');
        const activeFiles = await fs.readdir(activeDir);
        
        for (const file of activeFiles) {
            if (this.fileMatchesQuery(file, query)) {
                files.push(path.join(activeDir, file));
            }
        }

        // Check compressed files if needed
        if (query.since) {
            const compressedDir = path.join(this.config.storageDir, 'compressed');
            try {
                const compressedFiles = await fs.readdir(compressedDir);
                
                for (const file of compressedFiles) {
                    if (this.fileMatchesQuery(file, query)) {
                        files.push(path.join(compressedDir, file));
                    }
                }
            } catch (error) {
                // Compressed directory might not exist
            }
        }

        // Sort by date (newest first)
        files.sort((a, b) => {
            const dateA = this.extractDateFromFilename(a);
            const dateB = this.extractDateFromFilename(b);
            return dateB.localeCompare(dateA);
        });

        return files;
    }

    fileMatchesQuery(filename, query) {
        if (query.animatronic && !filename.includes(query.animatronic)) {
            return false;
        }
        
        if (query.service && !filename.includes(query.service)) {
            return false;
        }

        // Check date range if specified
        if (query.since || query.until) {
            const fileDate = this.extractDateFromFilename(filename);
            
            if (query.since && fileDate < query.since.split('T')[0]) {
                return false;
            }
            
            if (query.until && fileDate > query.until.split('T')[0]) {
                return false;
            }
        }

        return true;
    }

    extractDateFromFilename(filename) {
        const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '1970-01-01';
    }

    async readLogFile(filepath) {
        try {
            let data;
            
            if (filepath.endsWith('.gz')) {
                const compressed = await fs.readFile(filepath);
                data = await gunzip(compressed);
            } else {
                data = await fs.readFile(filepath, 'utf8');
            }

            return data
                .toString()
                .split('\n')
                .filter(line => line.trim())
                .map(line => JSON.parse(line));

        } catch (error) {
            this.logger.error('Error reading log file', {
                filepath,
                error: error.message
            });
            return [];
        }
    }

    matchesQuery(entry, query) {
        if (query.level && entry.level !== query.level) {
            return false;
        }

        if (query.since && entry.timestamp < query.since) {
            return false;
        }

        if (query.until && entry.timestamp > query.until) {
            return false;
        }

        if (query.keywords && query.keywords.length > 0) {
            const message = (entry.message || '').toLowerCase();
            const hasKeyword = query.keywords.some(keyword => 
                message.includes(keyword.toLowerCase())
            );
            if (!hasKeyword) {
                return false;
            }
        }

        return true;
    }

    startPeriodicTasks() {
        // Update indexes periodically
        this.indexUpdateInterval = setInterval(async () => {
            await this.persistAllIndexes();
        }, this.config.indexUpdateInterval);

        // Cleanup old files daily
        this.cleanupInterval = setInterval(async () => {
            await this.cleanupOldFiles();
        }, 24 * 60 * 60 * 1000); // 24 hours
    }

    async persistAllIndexes() {
        for (const [indexKey, index] of this.indexes) {
            await this.persistIndex(indexKey, index);
        }
    }

    async cleanupOldFiles() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);
            const cutoffString = cutoffDate.toISOString().split('T')[0];

            const compressedDir = path.join(this.config.storageDir, 'compressed');
            const files = await fs.readdir(compressedDir);

            for (const file of files) {
                const fileDate = this.extractDateFromFilename(file);
                
                if (fileDate < cutoffString) {
                    const filepath = path.join(compressedDir, file);
                    await fs.unlink(filepath);
                    
                    this.logger.info('Cleaned up old log file', {
                        file: filepath,
                        fileDate
                    });
                }
            }

        } catch (error) {
            this.logger.error('Error during cleanup', { error: error.message });
        }
    }

    async stop() {
        // Clear intervals
        if (this.indexUpdateInterval) clearInterval(this.indexUpdateInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);

        // Process remaining write queue
        while (this.writeQueue.length > 0) {
            await this.processWriteQueue();
        }

        // Persist all indexes
        await this.persistAllIndexes();

        this.logger.info('Log storage and indexing service stopped');
    }

    getStatistics() {
        return {
            ...this.statistics,
            queueSize: this.writeQueue.length,
            activeFiles: this.currentFiles.size,
            indexes: this.indexes.size,
            compressionRatio: this.statistics.totalSize > 0 ? 
                (this.statistics.compressedSize / this.statistics.totalSize * 100).toFixed(2) + '%' : 
                'N/A'
        };
    }

    getIndexSummary() {
        return Array.from(this.indexes.entries()).map(([key, index]) => ({
            key,
            animatronic: index.animatronic,
            service: index.service,
            totalEntries: index.totalEntries,
            firstEntry: index.firstEntry,
            lastEntry: index.lastEntry,
            levels: index.levels,
            lastUpdated: index.lastUpdated
        }));
    }
}

module.exports = LogStorageAndIndexing;
