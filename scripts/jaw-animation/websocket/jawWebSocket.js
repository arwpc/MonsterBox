// scripts/jaw-animation/websocket/jawWebSocket.js

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../../logger');

/**
 * WebSocket server for real-time jaw animation communication
 * Handles client connections and real-time data streaming
 */
class JawWebSocket extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            path: options.path || '/jaw-animation',
            port: options.port || null, // Use existing server if null
            heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
            maxClients: options.maxClients || 50,
            ...options
        };
        
        this.wss = null;
        this.clients = new Map(); // Map of client ID to client info
        this.heartbeatInterval = null;
        this.isRunning = false;
        
        logger.info('JawWebSocket initialized with options:', this.options);
    }
    
    /**
     * Start WebSocket server
     * @param {http.Server} server - HTTP server to attach to (optional)
     * @returns {Promise} Promise that resolves when server is started
     */
    start(server = null) {
        return new Promise((resolve, reject) => {
            try {
                const wsOptions = {
                    path: this.options.path
                };
                
                if (server) {
                    wsOptions.server = server;
                } else if (this.options.port) {
                    wsOptions.port = this.options.port;
                } else {
                    throw new Error('Either server or port must be provided');
                }
                
                this.wss = new WebSocket.Server(wsOptions);
                
                this.wss.on('connection', (ws, request) => {
                    this.handleConnection(ws, request);
                });
                
                this.wss.on('error', (error) => {
                    logger.error('WebSocket server error:', error);
                    this.emit('error', error);
                });
                
                this.startHeartbeat();
                this.isRunning = true;
                
                logger.info(`JawWebSocket server started on path: ${this.options.path}`);
                this.emit('started');
                resolve();
                
            } catch (error) {
                logger.error('Failed to start JawWebSocket server:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Stop WebSocket server
     * @returns {Promise} Promise that resolves when server is stopped
     */
    stop() {
        return new Promise((resolve) => {
            this.isRunning = false;
            
            if (this.heartbeatInterval) {
                clearInterval(this.heartbeatInterval);
                this.heartbeatInterval = null;
            }
            
            if (this.wss) {
                this.wss.close(() => {
                    logger.info('JawWebSocket server stopped');
                    this.emit('stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
    
    /**
     * Handle new WebSocket connection
     * @param {WebSocket} ws - WebSocket connection
     * @param {http.IncomingMessage} request - HTTP request
     */
    handleConnection(ws, request) {
        const clientId = this.generateClientId();
        const clientInfo = {
            id: clientId,
            ws: ws,
            ip: request.socket.remoteAddress,
            userAgent: request.headers['user-agent'],
            connectedAt: new Date(),
            isAlive: true,
            characterId: null,
            subscriptions: new Set()
        };
        
        // Check client limit
        if (this.clients.size >= this.options.maxClients) {
            logger.warn('Maximum clients reached, rejecting connection');
            ws.close(1013, 'Server overloaded');
            return;
        }
        
        this.clients.set(clientId, clientInfo);
        
        logger.info(`New jaw animation WebSocket connection: ${clientId} from ${clientInfo.ip}`);
        
        // Set up event handlers
        ws.on('message', (data) => {
            this.handleMessage(clientId, data);
        });
        
        ws.on('close', (code, reason) => {
            this.handleDisconnection(clientId, code, reason);
        });
        
        ws.on('error', (error) => {
            logger.error(`WebSocket error for client ${clientId}:`, error);
            this.handleDisconnection(clientId);
        });
        
        ws.on('pong', () => {
            clientInfo.isAlive = true;
        });
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            timestamp: Date.now()
        });
        
        this.emit('clientConnected', clientInfo);
    }
    
    /**
     * Handle WebSocket message from client
     * @param {string} clientId - Client ID
     * @param {Buffer|string} data - Message data
     */
    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);
            
            if (!client) {
                logger.warn(`Received message from unknown client: ${clientId}`);
                return;
            }
            
            logger.debug(`Received message from ${clientId}:`, message.type);
            
            switch (message.type) {
                case 'subscribe':
                    this.handleSubscribe(clientId, message);
                    break;
                    
                case 'unsubscribe':
                    this.handleUnsubscribe(clientId, message);
                    break;
                    
                case 'setCharacter':
                    this.handleSetCharacter(clientId, message);
                    break;
                    
                case 'configUpdate':
                    this.handleConfigUpdate(clientId, message);
                    break;
                    
                case 'servoCommand':
                    this.handleServoCommand(clientId, message);
                    break;
                    
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
                    break;
                    
                default:
                    logger.warn(`Unknown message type from ${clientId}: ${message.type}`);
            }
            
        } catch (error) {
            logger.error(`Error parsing message from ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Invalid message format',
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Handle client subscription to events
     * @param {string} clientId - Client ID
     * @param {Object} message - Subscription message
     */
    handleSubscribe(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const { events } = message;
        if (Array.isArray(events)) {
            events.forEach(event => client.subscriptions.add(event));
            logger.debug(`Client ${clientId} subscribed to:`, events);
            
            this.sendToClient(clientId, {
                type: 'subscribed',
                events: events,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Handle client unsubscription from events
     * @param {string} clientId - Client ID
     * @param {Object} message - Unsubscription message
     */
    handleUnsubscribe(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        const { events } = message;
        if (Array.isArray(events)) {
            events.forEach(event => client.subscriptions.delete(event));
            logger.debug(`Client ${clientId} unsubscribed from:`, events);
            
            this.sendToClient(clientId, {
                type: 'unsubscribed',
                events: events,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Handle character selection
     * @param {string} clientId - Client ID
     * @param {Object} message - Character selection message
     */
    handleSetCharacter(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        client.characterId = message.characterId;
        logger.debug(`Client ${clientId} set character to: ${message.characterId}`);
        
        this.emit('characterSelected', {
            clientId,
            characterId: message.characterId
        });
    }
    
    /**
     * Handle configuration updates
     * @param {string} clientId - Client ID
     * @param {Object} message - Configuration update message
     */
    handleConfigUpdate(clientId, message) {
        logger.debug(`Config update from ${clientId}:`, message.config);
        
        this.emit('configUpdate', {
            clientId,
            characterId: message.characterId,
            config: message.config
        });
    }
    
    /**
     * Handle servo commands
     * @param {string} clientId - Client ID
     * @param {Object} message - Servo command message
     */
    handleServoCommand(clientId, message) {
        logger.debug(`Servo command from ${clientId}:`, message.command);
        
        this.emit('servoCommand', {
            clientId,
            characterId: message.characterId,
            command: message.command
        });
    }
    
    /**
     * Handle client disconnection
     * @param {string} clientId - Client ID
     * @param {number} code - Close code
     * @param {string} reason - Close reason
     */
    handleDisconnection(clientId, code = null, reason = null) {
        const client = this.clients.get(clientId);
        if (client) {
            logger.info(`Client ${clientId} disconnected (code: ${code}, reason: ${reason})`);
            this.clients.delete(clientId);
            this.emit('clientDisconnected', { clientId, client });
        }
    }
    
    /**
     * Send message to specific client
     * @param {string} clientId - Client ID
     * @param {Object} message - Message to send
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
            } catch (error) {
                logger.error(`Error sending message to client ${clientId}:`, error);
            }
        }
    }
    
    /**
     * Broadcast message to all subscribed clients
     * @param {string} eventType - Event type
     * @param {Object} message - Message to broadcast
     */
    broadcast(eventType, message) {
        const broadcastMessage = {
            type: eventType,
            ...message,
            timestamp: Date.now()
        };
        
        this.clients.forEach((client, clientId) => {
            if (client.subscriptions.has(eventType)) {
                this.sendToClient(clientId, broadcastMessage);
            }
        });
    }
    
    /**
     * Start heartbeat to detect dead connections
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client, clientId) => {
                if (!client.isAlive) {
                    logger.debug(`Terminating dead connection: ${clientId}`);
                    client.ws.terminate();
                    this.clients.delete(clientId);
                    return;
                }
                
                client.isAlive = false;
                client.ws.ping();
            });
        }, this.options.heartbeatInterval);
    }
    
    /**
     * Generate unique client ID
     * @returns {string} Client ID
     */
    generateClientId() {
        return `jaw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get connected clients info
     * @returns {Array} Array of client info objects
     */
    getClients() {
        return Array.from(this.clients.values()).map(client => ({
            id: client.id,
            ip: client.ip,
            connectedAt: client.connectedAt,
            characterId: client.characterId,
            subscriptions: Array.from(client.subscriptions)
        }));
    }
}

module.exports = JawWebSocket;
