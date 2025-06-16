/**
 * MonsterBox Central Log Aggregation Service
 * Task 4.3: Central Log Aggregation Service
 * 
 * Centralized log aggregation and processing service for all MonsterBox
 * Raspberry Pi 4B devices with real-time streaming and storage management
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const WebSocket = require('ws');
const winston = require('winston');
const { spawn } = require('child_process');

class CentralLogAggregationService extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            port: config.port || 8781,
            storageDir: config.storageDir || path.join(process.cwd(), 'log', 'aggregated'),
            maxBufferSize: config.maxBufferSize || 10000,
            flushInterval: config.flushInterval || 5000,
            retentionDays: config.retentionDays || 30,
            compressionEnabled: config.compressionEnabled || true,
            indexingEnabled: config.indexingEnabled || true,
            ...config
        };

        this.logBuffer = new Map();
        this.activeStreams = new Map();
        this.indexCache = new Map();
        this.isRunning = false;
        
        this.setupLogger();
        this.setupWebSocketServer();
        this.setupPeriodicTasks();
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
                new winston.transports.File({ 
                    filename: path.join(this.config.storageDir, 'aggregation-service.log'),
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    setupWebSocketServer() {
        this.wss = new WebSocket.Server({ 
            port: this.config.port,
            perMessageDeflate: false
        });

        this.wss.on('connection', (ws, req) => {
            const clientId = this.generateClientId();
            const clientInfo = {
                id: clientId,
                ip: req.socket.remoteAddress,
                connectedAt: new Date().toISOString(),
                subscriptions: new Set(),
                lastActivity: Date.now()
            };

            this.activeStreams.set(clientId, { ws, info: clientInfo });
            this.logger.info('Client connected', { clientId, ip: clientInfo.ip });

            ws.on('message', (data) => {
                this.handleClientMessage(clientId, data);
            });

            ws.on('close', () => {
                this.activeStreams.delete(clientId);
                this.logger.info('Client disconnected', { clientId });
            });

            ws.on('error', (error) => {
                this.logger.error('WebSocket error', { clientId, error: error.message });
                this.activeStreams.delete(clientId);
            });

            // Send welcome message
            this.sendToClient(clientId, {
                type: 'welcome',
                clientId: clientId,
                serverInfo: {
                    version: '1.0.0',
                    capabilities: ['log_aggregation', 'real_time_streaming', 'indexing', 'compression']
                }
            });
        });
    }

    setupPeriodicTasks() {
        // Flush buffer periodically
        this.flushInterval = setInterval(() => {
            this.flushLogBuffer();
        }, this.config.flushInterval);

        // Cleanup old logs daily
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldLogs();
        }, 24 * 60 * 60 * 1000); // 24 hours

        // Update indexes hourly
        this.indexInterval = setInterval(() => {
            this.updateIndexes();
        }, 60 * 60 * 1000); // 1 hour
    }

    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async start() {
        try {
            // Ensure storage directories exist
            await fs.mkdir(this.config.storageDir, { recursive: true });
            await fs.mkdir(path.join(this.config.storageDir, 'indexes'), { recursive: true });
            await fs.mkdir(path.join(this.config.storageDir, 'compressed'), { recursive: true });

            this.isRunning = true;
            this.logger.info('Central Log Aggregation Service started', {
                port: this.config.port,
                storageDir: this.config.storageDir
            });

            // Load existing indexes
            await this.loadIndexes();

            this.emit('started');
            return true;
        } catch (error) {
            this.logger.error('Failed to start service', { error: error.message });
            return false;
        }
    }

    async stop() {
        this.isRunning = false;
        
        // Clear intervals
        if (this.flushInterval) clearInterval(this.flushInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        if (this.indexInterval) clearInterval(this.indexInterval);

        // Flush remaining logs
        await this.flushLogBuffer();

        // Close WebSocket server
        if (this.wss) {
            this.wss.close();
        }

        this.logger.info('Central Log Aggregation Service stopped');
        this.emit('stopped');
    }

    async ingestLogEntry(logEntry) {
        try {
            const {
                source,
                animatronic,
                service,
                level = 'info',
                message,
                timestamp = new Date().toISOString(),
                metadata = {}
            } = logEntry;

            const processedEntry = {
                id: this.generateLogId(),
                source,
                animatronic,
                service,
                level,
                message,
                timestamp,
                metadata,
                ingested_at: new Date().toISOString()
            };

            // Add to buffer
            const bufferKey = `${animatronic}_${service}`;
            if (!this.logBuffer.has(bufferKey)) {
                this.logBuffer.set(bufferKey, []);
            }
            
            this.logBuffer.get(bufferKey).push(processedEntry);

            // Check buffer size and flush if needed
            if (this.logBuffer.get(bufferKey).length >= this.config.maxBufferSize) {
                await this.flushLogBuffer(bufferKey);
            }

            // Broadcast to real-time subscribers
            this.broadcastLogEntry(processedEntry);

            return processedEntry.id;
        } catch (error) {
            this.logger.error('Failed to ingest log entry', { error: error.message, logEntry });
            throw error;
        }
    }

    generateLogId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async flushLogBuffer(specificKey = null) {
        const keysToFlush = specificKey ? [specificKey] : Array.from(this.logBuffer.keys());

        for (const key of keysToFlush) {
            const entries = this.logBuffer.get(key);
            if (!entries || entries.length === 0) continue;

            try {
                const [animatronic, service] = key.split('_');
                const logDir = path.join(this.config.storageDir, animatronic);
                await fs.mkdir(logDir, { recursive: true });

                const filename = `${animatronic}-${service}-${new Date().toISOString().split('T')[0]}.jsonl`;
                const filepath = path.join(logDir, filename);

                // Append entries to file
                const logLines = entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
                await fs.appendFile(filepath, logLines);

                // Update index
                if (this.config.indexingEnabled) {
                    await this.updateLogIndex(animatronic, service, entries);
                }

                // Clear buffer
                this.logBuffer.set(key, []);

                this.logger.debug('Flushed log buffer', { 
                    key, 
                    entriesCount: entries.length, 
                    filepath 
                });

            } catch (error) {
                this.logger.error('Failed to flush log buffer', { 
                    key, 
                    error: error.message 
                });
            }
        }
    }

    async updateLogIndex(animatronic, service, entries) {
        try {
            const indexKey = `${animatronic}_${service}`;
            const indexPath = path.join(this.config.storageDir, 'indexes', `${indexKey}.json`);

            let index = this.indexCache.get(indexKey) || {
                animatronic,
                service,
                totalEntries: 0,
                firstEntry: null,
                lastEntry: null,
                levels: {},
                dailyCounts: {},
                lastUpdated: null
            };

            for (const entry of entries) {
                index.totalEntries++;
                
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
            }

            index.lastUpdated = new Date().toISOString();

            // Save index
            await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
            this.indexCache.set(indexKey, index);

        } catch (error) {
            this.logger.error('Failed to update log index', { 
                animatronic, 
                service, 
                error: error.message 
            });
        }
    }

    async loadIndexes() {
        try {
            const indexDir = path.join(this.config.storageDir, 'indexes');
            const files = await fs.readdir(indexDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const indexPath = path.join(indexDir, file);
                    const indexData = await fs.readFile(indexPath, 'utf8');
                    const index = JSON.parse(indexData);
                    
                    const key = file.replace('.json', '');
                    this.indexCache.set(key, index);
                }
            }

            this.logger.info('Loaded log indexes', { count: this.indexCache.size });
        } catch (error) {
            this.logger.warn('Failed to load indexes', { error: error.message });
        }
    }

    broadcastLogEntry(logEntry) {
        const message = {
            type: 'log_entry',
            data: logEntry,
            timestamp: new Date().toISOString()
        };

        for (const [clientId, { ws, info }] of this.activeStreams) {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify(message));
                    info.lastActivity = Date.now();
                } catch (error) {
                    this.logger.error('Failed to broadcast to client', { 
                        clientId, 
                        error: error.message 
                    });
                }
            }
        }
    }

    sendToClient(clientId, message) {
        const client = this.activeStreams.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
                client.info.lastActivity = Date.now();
                return true;
            } catch (error) {
                this.logger.error('Failed to send to client', { 
                    clientId, 
                    error: error.message 
                });
                return false;
            }
        }
        return false;
    }

    handleClientMessage(clientId, data) {
        try {
            const message = JSON.parse(data.toString());
            const client = this.activeStreams.get(clientId);
            
            if (!client) return;

            client.info.lastActivity = Date.now();

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscription(clientId, message);
                    break;
                case 'query':
                    this.handleQuery(clientId, message);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                default:
                    this.logger.warn('Unknown message type', { clientId, type: message.type });
            }
        } catch (error) {
            this.logger.error('Failed to handle client message', { 
                clientId, 
                error: error.message 
            });
        }
    }

    async handleSubscription(clientId, message) {
        const client = this.activeStreams.get(clientId);
        if (!client) return;

        const { filters = {} } = message;
        client.info.subscriptions.add(JSON.stringify(filters));

        this.sendToClient(clientId, {
            type: 'subscription_confirmed',
            filters: filters,
            timestamp: new Date().toISOString()
        });
    }

    async handleQuery(clientId, message) {
        try {
            const { 
                animatronic, 
                service, 
                level, 
                since, 
                until, 
                limit = 100 
            } = message.query || {};

            const results = await this.queryLogs({
                animatronic,
                service,
                level,
                since,
                until,
                limit
            });

            this.sendToClient(clientId, {
                type: 'query_result',
                query: message.query,
                results: results,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.sendToClient(clientId, {
                type: 'query_error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async queryLogs(query) {
        // Implementation for log querying will be added in next iteration
        return [];
    }

    async cleanupOldLogs() {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

            this.logger.info('Starting log cleanup', { 
                cutoffDate: cutoffDate.toISOString(),
                retentionDays: this.config.retentionDays 
            });

            // Implementation for cleanup will be added in next iteration
            
        } catch (error) {
            this.logger.error('Failed to cleanup old logs', { error: error.message });
        }
    }

    async updateIndexes() {
        try {
            this.logger.info('Updating log indexes');
            // Implementation for index updates will be added in next iteration
        } catch (error) {
            this.logger.error('Failed to update indexes', { error: error.message });
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            activeStreams: this.activeStreams.size,
            bufferSize: Array.from(this.logBuffer.values()).reduce((sum, arr) => sum + arr.length, 0),
            indexCount: this.indexCache.size,
            config: this.config
        };
    }
}

module.exports = CentralLogAggregationService;
