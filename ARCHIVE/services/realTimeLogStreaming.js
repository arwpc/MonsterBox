/**
 * MonsterBox Real-time Log Streaming Service
 * Task 4.4: Real-time Log Streaming
 * 
 * Provides real-time log streaming capabilities with filtering,
 * buffering, and WebSocket distribution for the MonsterBox system
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

class RealTimeLogStreaming extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            streamPort: config.streamPort || 8782,
            maxConnections: config.maxConnections || 50,
            bufferSize: config.bufferSize || 1000,
            compressionEnabled: config.compressionEnabled || true,
            filteringEnabled: config.filteringEnabled || true,
            rateLimitPerSecond: config.rateLimitPerSecond || 100,
            ...config
        };

        this.connections = new Map();
        this.logBuffer = [];
        this.streamStats = {
            totalConnections: 0,
            activeConnections: 0,
            messagesStreamed: 0,
            bytesStreamed: 0,
            startTime: null
        };

        this.setupLogger();
        this.setupWebSocketServer();
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

    setupWebSocketServer() {
        this.wss = new WebSocket.Server({
            port: this.config.streamPort,
            perMessageDeflate: this.config.compressionEnabled,
            maxPayload: 1024 * 1024 // 1MB max message size
        });

        this.wss.on('connection', (ws, req) => {
            this.handleNewConnection(ws, req);
        });

        this.wss.on('error', (error) => {
            this.logger.error('WebSocket server error', { error: error.message });
        });
    }

    handleNewConnection(ws, req) {
        const connectionId = this.generateConnectionId();
        const clientInfo = {
            id: connectionId,
            ip: req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
            connectedAt: new Date().toISOString(),
            filters: {},
            subscriptions: new Set(),
            messageCount: 0,
            lastActivity: Date.now(),
            rateLimitTokens: this.config.rateLimitPerSecond
        };

        this.connections.set(connectionId, { ws, info: clientInfo });
        this.streamStats.totalConnections++;
        this.streamStats.activeConnections++;

        this.logger.info('New streaming connection', {
            connectionId,
            ip: clientInfo.ip,
            activeConnections: this.streamStats.activeConnections
        });

        // Send welcome message with capabilities
        this.sendToConnection(connectionId, {
            type: 'welcome',
            connectionId: connectionId,
            capabilities: {
                filtering: this.config.filteringEnabled,
                compression: this.config.compressionEnabled,
                maxBufferSize: this.config.bufferSize,
                rateLimit: this.config.rateLimitPerSecond
            },
            serverInfo: {
                version: '1.0.0',
                startTime: this.streamStats.startTime
            }
        });

        // Setup event handlers
        ws.on('message', (data) => {
            this.handleClientMessage(connectionId, data);
        });

        ws.on('close', () => {
            this.handleConnectionClose(connectionId);
        });

        ws.on('error', (error) => {
            this.logger.error('Connection error', {
                connectionId,
                error: error.message
            });
            this.handleConnectionClose(connectionId);
        });

        // Setup ping/pong for connection health
        ws.on('pong', () => {
            const connection = this.connections.get(connectionId);
            if (connection) {
                connection.info.lastActivity = Date.now();
            }
        });

        // Check connection limits
        if (this.streamStats.activeConnections > this.config.maxConnections) {
            this.logger.warn('Max connections exceeded, closing oldest connection');
            this.closeOldestConnection();
        }
    }

    generateConnectionId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    handleClientMessage(connectionId, data) {
        try {
            const connection = this.connections.get(connectionId);
            if (!connection) return;

            const message = JSON.parse(data.toString());
            connection.info.lastActivity = Date.now();

            switch (message.type) {
                case 'subscribe':
                    this.handleSubscription(connectionId, message);
                    break;
                case 'filter':
                    this.handleFilterUpdate(connectionId, message);
                    break;
                case 'ping':
                    this.sendToConnection(connectionId, {
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    });
                    break;
                case 'buffer_request':
                    this.handleBufferRequest(connectionId, message);
                    break;
                default:
                    this.logger.warn('Unknown message type', {
                        connectionId,
                        type: message.type
                    });
            }
        } catch (error) {
            this.logger.error('Error handling client message', {
                connectionId,
                error: error.message
            });
        }
    }

    handleSubscription(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        const { sources = [], levels = [], services = [] } = message.subscription || {};
        
        connection.info.subscriptions.clear();
        sources.forEach(source => connection.info.subscriptions.add(`source:${source}`));
        levels.forEach(level => connection.info.subscriptions.add(`level:${level}`));
        services.forEach(service => connection.info.subscriptions.add(`service:${service}`));

        this.sendToConnection(connectionId, {
            type: 'subscription_confirmed',
            subscription: message.subscription,
            timestamp: new Date().toISOString()
        });

        this.logger.debug('Updated subscription', {
            connectionId,
            subscriptions: Array.from(connection.info.subscriptions)
        });
    }

    handleFilterUpdate(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        connection.info.filters = { ...message.filters };

        this.sendToConnection(connectionId, {
            type: 'filter_confirmed',
            filters: connection.info.filters,
            timestamp: new Date().toISOString()
        });

        this.logger.debug('Updated filters', {
            connectionId,
            filters: connection.info.filters
        });
    }

    handleBufferRequest(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        const { count = 50, since } = message;
        let bufferLogs = [...this.logBuffer];

        // Filter by timestamp if requested
        if (since) {
            const sinceTime = new Date(since).getTime();
            bufferLogs = bufferLogs.filter(log => 
                new Date(log.timestamp).getTime() >= sinceTime
            );
        }

        // Apply connection filters
        bufferLogs = bufferLogs.filter(log => this.passesFilters(log, connection.info));

        // Limit count
        bufferLogs = bufferLogs.slice(-count);

        this.sendToConnection(connectionId, {
            type: 'buffer_response',
            logs: bufferLogs,
            count: bufferLogs.length,
            timestamp: new Date().toISOString()
        });
    }

    handleConnectionClose(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            this.connections.delete(connectionId);
            this.streamStats.activeConnections--;

            this.logger.info('Connection closed', {
                connectionId,
                messageCount: connection.info.messageCount,
                activeConnections: this.streamStats.activeConnections
            });
        }
    }

    closeOldestConnection() {
        let oldestConnection = null;
        let oldestTime = Date.now();

        for (const [connectionId, connection] of this.connections) {
            if (connection.info.lastActivity < oldestTime) {
                oldestTime = connection.info.lastActivity;
                oldestConnection = connectionId;
            }
        }

        if (oldestConnection) {
            const connection = this.connections.get(oldestConnection);
            if (connection && connection.ws.readyState === WebSocket.OPEN) {
                connection.ws.close(1000, 'Connection limit exceeded');
            }
        }
    }

    streamLogEntry(logEntry) {
        // Add to buffer
        this.logBuffer.push(logEntry);
        
        // Maintain buffer size
        if (this.logBuffer.length > this.config.bufferSize) {
            this.logBuffer.shift();
        }

        // Stream to all matching connections
        let streamedCount = 0;
        
        for (const [connectionId, connection] of this.connections) {
            if (connection.ws.readyState === WebSocket.OPEN) {
                // Check rate limiting
                if (!this.checkRateLimit(connection.info)) {
                    continue;
                }

                // Check if log passes filters
                if (this.passesFilters(logEntry, connection.info)) {
                    const success = this.sendToConnection(connectionId, {
                        type: 'log_entry',
                        data: logEntry,
                        timestamp: new Date().toISOString()
                    });

                    if (success) {
                        streamedCount++;
                        connection.info.messageCount++;
                    }
                }
            }
        }

        this.streamStats.messagesStreamed += streamedCount;
        this.emit('log_streamed', { logEntry, streamedCount });
    }

    checkRateLimit(connectionInfo) {
        const now = Date.now();
        const timeSinceLastCheck = now - (connectionInfo.lastRateLimitCheck || now);
        
        // Refill tokens based on time passed
        const tokensToAdd = Math.floor(timeSinceLastCheck / 1000) * this.config.rateLimitPerSecond;
        connectionInfo.rateLimitTokens = Math.min(
            this.config.rateLimitPerSecond,
            connectionInfo.rateLimitTokens + tokensToAdd
        );
        connectionInfo.lastRateLimitCheck = now;

        // Check if we have tokens available
        if (connectionInfo.rateLimitTokens > 0) {
            connectionInfo.rateLimitTokens--;
            return true;
        }

        return false;
    }

    passesFilters(logEntry, connectionInfo) {
        // Check subscriptions
        if (connectionInfo.subscriptions.size > 0) {
            const hasMatchingSubscription = 
                connectionInfo.subscriptions.has(`source:${logEntry.source}`) ||
                connectionInfo.subscriptions.has(`level:${logEntry.level}`) ||
                connectionInfo.subscriptions.has(`service:${logEntry.service}`);
            
            if (!hasMatchingSubscription) {
                return false;
            }
        }

        // Check filters
        const filters = connectionInfo.filters;
        if (filters) {
            if (filters.animatronic && logEntry.animatronic !== filters.animatronic) {
                return false;
            }
            if (filters.service && logEntry.service !== filters.service) {
                return false;
            }
            if (filters.level && logEntry.level !== filters.level) {
                return false;
            }
            if (filters.minLevel) {
                const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
                if ((levelPriority[logEntry.level] || 0) < (levelPriority[filters.minLevel] || 0)) {
                    return false;
                }
            }
            if (filters.textSearch && !logEntry.message.toLowerCase().includes(filters.textSearch.toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    sendToConnection(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            const messageStr = JSON.stringify(message);
            connection.ws.send(messageStr);
            
            this.streamStats.bytesStreamed += messageStr.length;
            connection.info.lastActivity = Date.now();
            
            return true;
        } catch (error) {
            this.logger.error('Failed to send message', {
                connectionId,
                error: error.message
            });
            return false;
        }
    }

    async start() {
        try {
            this.streamStats.startTime = new Date().toISOString();
            
            // Setup periodic cleanup
            this.cleanupInterval = setInterval(() => {
                this.cleanupStaleConnections();
            }, 30000); // Every 30 seconds

            // Setup rate limit token refill
            this.rateLimitInterval = setInterval(() => {
                this.refillRateLimitTokens();
            }, 1000); // Every second

            this.logger.info('Real-time log streaming service started', {
                port: this.config.streamPort,
                maxConnections: this.config.maxConnections
            });

            this.emit('started');
            return true;
        } catch (error) {
            this.logger.error('Failed to start streaming service', {
                error: error.message
            });
            return false;
        }
    }

    async stop() {
        try {
            // Clear intervals
            if (this.cleanupInterval) clearInterval(this.cleanupInterval);
            if (this.rateLimitInterval) clearInterval(this.rateLimitInterval);

            // Close all connections
            for (const [connectionId, connection] of this.connections) {
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.close(1000, 'Server shutting down');
                }
            }

            // Close WebSocket server
            if (this.wss) {
                this.wss.close();
            }

            this.logger.info('Real-time log streaming service stopped');
            this.emit('stopped');
        } catch (error) {
            this.logger.error('Error stopping streaming service', {
                error: error.message
            });
        }
    }

    cleanupStaleConnections() {
        const now = Date.now();
        const staleThreshold = 5 * 60 * 1000; // 5 minutes

        for (const [connectionId, connection] of this.connections) {
            if (now - connection.info.lastActivity > staleThreshold) {
                this.logger.info('Closing stale connection', { connectionId });
                if (connection.ws.readyState === WebSocket.OPEN) {
                    connection.ws.close(1000, 'Connection timeout');
                }
                this.connections.delete(connectionId);
                this.streamStats.activeConnections--;
            }
        }
    }

    refillRateLimitTokens() {
        for (const [connectionId, connection] of this.connections) {
            connection.info.rateLimitTokens = Math.min(
                this.config.rateLimitPerSecond,
                connection.info.rateLimitTokens + 1
            );
        }
    }

    getStats() {
        return {
            ...this.streamStats,
            bufferSize: this.logBuffer.length,
            connections: Array.from(this.connections.values()).map(conn => ({
                id: conn.info.id,
                ip: conn.info.ip,
                connectedAt: conn.info.connectedAt,
                messageCount: conn.info.messageCount,
                subscriptions: Array.from(conn.info.subscriptions),
                filters: conn.info.filters
            }))
        };
    }
}

module.exports = RealTimeLogStreaming;
