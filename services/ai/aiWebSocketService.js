/**
 * AI WebSocket Service
 * 
 * Provides real-time WebSocket communication for AI conversations,
 * integrating with the AI Integration Service and jaw animation system
 * for live interactive experiences.
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const aiIntegrationService = require('./aiIntegrationService');
const logger = require('../../scripts/logger');

class AIWebSocketService extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.port = options.port || 8766;
        this.server = null;
        this.clients = new Map();
        this.isRunning = false;
        
        // Statistics
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            messagesProcessed: 0,
            errors: 0,
            startTime: null
        };
        
        // Setup AI service event handlers
        this.setupAIEventHandlers();
    }
    
    /**
     * Setup AI service event handlers
     */
    setupAIEventHandlers() {
        aiIntegrationService.on('responseGenerated', (data) => {
            this.broadcastToClients({
                type: 'ai_response',
                data: data
            });
        });
        
        aiIntegrationService.on('ttsGenerated', (data) => {
            this.broadcastToClients({
                type: 'tts_generated',
                data: data
            });
        });
        
        aiIntegrationService.on('conversationProcessed', (data) => {
            this.broadcastToClients({
                type: 'conversation_complete',
                data: data
            });
        });
        
        aiIntegrationService.on('jawAnimationRequested', (data) => {
            this.broadcastToClients({
                type: 'jaw_animation_requested',
                data: data
            });
        });
    }
    
    /**
     * Start the WebSocket server
     */
    async start() {
        try {
            this.server = new WebSocket.Server({
                port: this.port,
                perMessageDeflate: false
            });
            
            this.server.on('connection', (ws, request) => {
                this.handleClientConnection(ws, request);
            });
            
            this.server.on('error', (error) => {
                logger.error('AI WebSocket server error:', error);
                this.emit('error', error);
            });
            
            this.isRunning = true;
            this.stats.startTime = new Date();
            
            logger.info(`AI WebSocket service started on port ${this.port}`);
            this.emit('started');
            
        } catch (error) {
            logger.error('Failed to start AI WebSocket service:', error);
            throw error;
        }
    }
    
    /**
     * Handle new client connection
     */
    handleClientConnection(ws, request) {
        const clientId = this.generateClientId();
        const clientInfo = {
            id: clientId,
            ws: ws,
            ip: request.socket.remoteAddress,
            userAgent: request.headers['user-agent'],
            connectedAt: new Date(),
            lastActivity: new Date(),
            messagesReceived: 0,
            messagesSent: 0
        };
        
        this.clients.set(clientId, clientInfo);
        this.stats.totalConnections++;
        this.stats.activeConnections++;
        
        logger.info(`AI WebSocket client connected: ${clientId} from ${clientInfo.ip}`);
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            message: 'Connected to MonsterBox AI WebSocket Service',
            timestamp: new Date().toISOString()
        });
        
        // Setup message handler
        ws.on('message', (data) => {
            this.handleClientMessage(clientId, data);
        });
        
        // Setup close handler
        ws.on('close', () => {
            this.handleClientDisconnect(clientId);
        });
        
        // Setup error handler
        ws.on('error', (error) => {
            logger.error(`WebSocket error for client ${clientId}:`, error);
            this.handleClientDisconnect(clientId);
        });
        
        this.emit('clientConnected', clientInfo);
    }
    
    /**
     * Handle client message
     */
    async handleClientMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;
        
        try {
            const message = JSON.parse(data.toString());
            client.lastActivity = new Date();
            client.messagesReceived++;
            this.stats.messagesProcessed++;
            
            logger.debug(`Received message from ${clientId}:`, message.type);
            
            switch (message.type) {
                case 'chat_message':
                    await this.handleChatMessage(clientId, message);
                    break;
                    
                case 'ai_response_request':
                    await this.handleAIResponseRequest(clientId, message);
                    break;
                    
                case 'tts_request':
                    await this.handleTTSRequest(clientId, message);
                    break;
                    
                case 'jaw_animation_request':
                    await this.handleJawAnimationRequest(clientId, message);
                    break;
                    
                case 'ping':
                    this.sendToClient(clientId, {
                        type: 'pong',
                        timestamp: new Date().toISOString()
                    });
                    break;
                    
                case 'get_status':
                    await this.handleStatusRequest(clientId);
                    break;
                    
                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        error: `Unknown message type: ${message.type}`,
                        timestamp: new Date().toISOString()
                    });
            }
            
        } catch (error) {
            logger.error(`Error handling message from ${clientId}:`, error);
            this.stats.errors++;
            
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Failed to process message',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle chat message
     */
    async handleChatMessage(clientId, message) {
        if (!message.characterId || !message.text) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Character ID and text are required',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            // Notify client that processing started
            this.sendToClient(clientId, {
                type: 'processing_started',
                characterId: message.characterId,
                userMessage: message.text,
                timestamp: new Date().toISOString()
            });
            
            // Process conversation
            const result = await aiIntegrationService.processConversation(
                message.characterId,
                message.text,
                {
                    generateTTS: message.generateTTS !== false,
                    enableJawSync: message.enableJawSync !== false
                }
            );
            
            // Send result to client
            this.sendToClient(clientId, {
                type: 'conversation_result',
                data: result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`Chat processing error for ${clientId}:`, error);
            
            this.sendToClient(clientId, {
                type: 'processing_error',
                error: error.message,
                characterId: message.characterId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle AI response request
     */
    async handleAIResponseRequest(clientId, message) {
        if (!message.characterId || !message.text) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Character ID and text are required',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            const result = await aiIntegrationService.generateResponse(
                message.characterId,
                message.text
            );
            
            this.sendToClient(clientId, {
                type: 'ai_response_result',
                data: result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`AI response error for ${clientId}:`, error);
            
            this.sendToClient(clientId, {
                type: 'ai_response_error',
                error: error.message,
                characterId: message.characterId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle TTS request
     */
    async handleTTSRequest(clientId, message) {
        if (!message.characterId || !message.text) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Character ID and text are required',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            const result = await aiIntegrationService.generateTTS(
                message.characterId,
                message.text,
                message.options || {}
            );
            
            this.sendToClient(clientId, {
                type: 'tts_result',
                data: result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`TTS error for ${clientId}:`, error);
            
            this.sendToClient(clientId, {
                type: 'tts_error',
                error: error.message,
                characterId: message.characterId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle jaw animation request
     */
    async handleJawAnimationRequest(clientId, message) {
        if (!message.characterId || !message.text) {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Character ID and text are required',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            aiIntegrationService.triggerJawAnimation(message.characterId, message.text);
            
            this.sendToClient(clientId, {
                type: 'jaw_animation_triggered',
                characterId: message.characterId,
                text: message.text,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`Jaw animation error for ${clientId}:`, error);
            
            this.sendToClient(clientId, {
                type: 'jaw_animation_error',
                error: error.message,
                characterId: message.characterId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle status request
     */
    async handleStatusRequest(clientId) {
        try {
            const aiStats = aiIntegrationService.getStatistics();
            const wsStats = this.getStatistics();
            
            this.sendToClient(clientId, {
                type: 'status_response',
                data: {
                    ai: aiStats,
                    websocket: wsStats
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            logger.error(`Status request error for ${clientId}:`, error);
            
            this.sendToClient(clientId, {
                type: 'status_error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handle client disconnect
     */
    handleClientDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            this.stats.activeConnections--;
            
            logger.info(`AI WebSocket client disconnected: ${clientId}`);
            this.emit('clientDisconnected', client);
        }
    }
    
    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
                client.messagesSent++;
                return true;
            } catch (error) {
                logger.error(`Failed to send message to client ${clientId}:`, error);
                this.handleClientDisconnect(clientId);
                return false;
            }
        }
        return false;
    }
    
    /**
     * Broadcast message to all connected clients
     */
    broadcastToClients(message) {
        let sentCount = 0;
        
        for (const [clientId, client] of this.clients.entries()) {
            if (this.sendToClient(clientId, message)) {
                sentCount++;
            }
        }
        
        return sentCount;
    }
    
    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `ai_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get service statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0,
            isRunning: this.isRunning,
            port: this.port,
            clients: Array.from(this.clients.values()).map(client => ({
                id: client.id,
                ip: client.ip,
                connectedAt: client.connectedAt,
                lastActivity: client.lastActivity,
                messagesReceived: client.messagesReceived,
                messagesSent: client.messagesSent
            }))
        };
    }
    
    /**
     * Stop the WebSocket service
     */
    async stop() {
        if (!this.isRunning) return;
        
        logger.info('Stopping AI WebSocket service');
        
        // Close all client connections
        for (const [clientId, client] of this.clients.entries()) {
            client.ws.close();
        }
        
        // Close server
        if (this.server) {
            this.server.close();
        }
        
        this.isRunning = false;
        this.clients.clear();
        this.stats.activeConnections = 0;
        
        this.emit('stopped');
        logger.info('AI WebSocket service stopped');
    }
}

module.exports = AIWebSocketService;
