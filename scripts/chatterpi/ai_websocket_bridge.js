#!/usr/bin/env node

/**
 * ChatterPi AI WebSocket Bridge
 * 
 * Bridges the AI integration with the existing ChatterPi WebSocket system
 * for real-time interactive conversations with jaw animation.
 */

const WebSocket = require('ws');
const ChatterPiAI = require('./ai_integration');
const EventEmitter = require('events');

class AIWebSocketBridge extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            aiPort: options.aiPort || 8766,
            jawPort: options.jawPort || 8765,
            characterId: options.characterId || 'orlok',
            enableTTS: options.enableTTS !== false,
            enableJawSync: options.enableJawSync !== false,
            ...options
        };
        
        // Initialize AI system
        this.ai = new ChatterPiAI({
            characterId: this.config.characterId
        });
        
        // WebSocket servers
        this.aiServer = null;
        this.jawWebSocket = null;
        
        // Client management
        this.clients = new Map();
        this.clientCounter = 0;
        
        // State
        this.isRunning = false;
        this.stats = {
            connections: 0,
            conversations: 0,
            errors: 0,
            startTime: null
        };
        
        this.setupAIEventHandlers();
        
        console.log(`🌉 AI WebSocket Bridge initialized for ${this.config.characterId}`);
    }
    
    /**
     * Setup AI event handlers
     */
    setupAIEventHandlers() {
        this.ai.on('response_generated', (data) => {
            this.broadcastToClients({
                type: 'ai_response',
                data: data
            });
        });
        
        this.ai.on('speech_generated', (data) => {
            this.broadcastToClients({
                type: 'speech_generated',
                data: data
            });
        });
        
        this.ai.on('conversation_processed', (data) => {
            this.stats.conversations++;
            
            // Trigger jaw animation if enabled
            if (this.config.enableJawSync && data.aiResponse) {
                this.triggerJawAnimation(data.aiResponse.text);
            }
            
            this.broadcastToClients({
                type: 'conversation_complete',
                data: data
            });
        });
        
        this.ai.on('error', (error) => {
            this.stats.errors++;
            console.error('🚨 AI Error:', error.message);
            
            this.broadcastToClients({
                type: 'ai_error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        });
    }
    
    /**
     * Start the AI WebSocket server
     */
    async start() {
        try {
            // Create AI WebSocket server
            this.aiServer = new WebSocket.Server({
                port: this.config.aiPort,
                perMessageDeflate: false
            });
            
            this.aiServer.on('connection', (ws, request) => {
                this.handleClientConnection(ws, request);
            });
            
            this.aiServer.on('error', (error) => {
                console.error('❌ AI WebSocket server error:', error);
                this.emit('error', error);
            });
            
            // Connect to jaw control WebSocket if enabled
            if (this.config.enableJawSync) {
                await this.connectToJawWebSocket();
            }
            
            this.isRunning = true;
            this.stats.startTime = new Date().toISOString();
            
            console.log(`🚀 AI WebSocket Bridge running on port ${this.config.aiPort}`);
            console.log(`🎭 Character: ${this.config.characterId}`);
            console.log(`🦴 Jaw sync: ${this.config.enableJawSync ? 'enabled' : 'disabled'}`);
            console.log(`🎤 TTS: ${this.config.enableTTS ? 'enabled' : 'disabled'}`);
            
            this.emit('started');
            
        } catch (error) {
            console.error('❌ Failed to start AI WebSocket Bridge:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Connect to jaw control WebSocket
     */
    async connectToJawWebSocket() {
        return new Promise((resolve, reject) => {
            try {
                this.jawWebSocket = new WebSocket(`ws://localhost:${this.config.jawPort}`);
                
                this.jawWebSocket.on('open', () => {
                    console.log('✅ Connected to jaw control WebSocket');
                    resolve();
                });
                
                this.jawWebSocket.on('error', (error) => {
                    console.warn('⚠️ Jaw WebSocket connection failed:', error.message);
                    this.jawWebSocket = null;
                    resolve(); // Don't fail if jaw control isn't available
                });
                
                this.jawWebSocket.on('close', () => {
                    console.log('🔌 Jaw WebSocket connection closed');
                    this.jawWebSocket = null;
                });
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    if (this.jawWebSocket && this.jawWebSocket.readyState !== WebSocket.OPEN) {
                        this.jawWebSocket.terminate();
                        this.jawWebSocket = null;
                        console.warn('⚠️ Jaw WebSocket connection timeout');
                    }
                    resolve();
                }, 5000);
                
            } catch (error) {
                console.warn('⚠️ Failed to connect to jaw WebSocket:', error.message);
                resolve(); // Don't fail if jaw control isn't available
            }
        });
    }
    
    /**
     * Handle new client connection
     */
    handleClientConnection(ws, request) {
        const clientId = `client_${++this.clientCounter}`;
        const clientInfo = {
            id: clientId,
            ws: ws,
            ip: request.socket.remoteAddress,
            connectedAt: new Date().toISOString()
        };
        
        this.clients.set(clientId, clientInfo);
        this.stats.connections++;
        
        console.log(`👤 Client connected: ${clientId} from ${clientInfo.ip}`);
        
        // Send welcome message
        this.sendToClient(clientId, {
            type: 'welcome',
            clientId: clientId,
            character: this.config.characterId,
            capabilities: {
                ai: true,
                tts: this.config.enableTTS,
                jawSync: this.config.enableJawSync
            },
            timestamp: new Date().toISOString()
        });
        
        // Handle messages
        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data.toString());
                await this.handleClientMessage(clientId, message);
            } catch (error) {
                console.error(`❌ Error handling message from ${clientId}:`, error);
                this.sendToClient(clientId, {
                    type: 'error',
                    error: 'Invalid message format',
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Handle disconnect
        ws.on('close', () => {
            console.log(`👋 Client disconnected: ${clientId}`);
            this.clients.delete(clientId);
        });
        
        ws.on('error', (error) => {
            console.error(`❌ Client error ${clientId}:`, error);
            this.clients.delete(clientId);
        });
    }
    
    /**
     * Handle client message
     */
    async handleClientMessage(clientId, message) {
        console.log(`📨 Message from ${clientId}:`, message.type);
        
        switch (message.type) {
            case 'chat_message':
                await this.handleChatMessage(clientId, message);
                break;
                
            case 'get_status':
                this.sendToClient(clientId, {
                    type: 'status',
                    data: this.getStatus(),
                    timestamp: new Date().toISOString()
                });
                break;
                
            case 'clear_history':
                this.ai.clearHistory();
                this.sendToClient(clientId, {
                    type: 'history_cleared',
                    timestamp: new Date().toISOString()
                });
                break;
                
            case 'change_character':
                if (message.characterId && this.ai.characters[message.characterId]) {
                    this.config.characterId = message.characterId;
                    this.ai.config.characterId = message.characterId;
                    this.sendToClient(clientId, {
                        type: 'character_changed',
                        characterId: message.characterId,
                        timestamp: new Date().toISOString()
                    });
                }
                break;
                
            default:
                console.warn(`⚠️ Unknown message type: ${message.type}`);
        }
    }
    
    /**
     * Handle chat message
     */
    async handleChatMessage(clientId, message) {
        if (!message.text || typeof message.text !== 'string') {
            this.sendToClient(clientId, {
                type: 'error',
                error: 'Message text is required',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        try {
            // Notify client that processing started
            this.sendToClient(clientId, {
                type: 'processing_started',
                userMessage: message.text,
                timestamp: new Date().toISOString()
            });
            
            // Process conversation
            const result = await this.ai.processConversation(message.text, {
                generateSpeech: this.config.enableTTS,
                context: message.context || {}
            });
            
            // Send result to client
            this.sendToClient(clientId, {
                type: 'conversation_result',
                data: result,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error(`❌ Error processing chat message from ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'processing_error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Trigger jaw animation based on text
     */
    triggerJawAnimation(text) {
        if (!this.jawWebSocket || this.jawWebSocket.readyState !== WebSocket.OPEN) {
            console.warn('⚠️ Jaw WebSocket not available for animation');
            return;
        }
        
        try {
            // Simple word-based jaw animation
            const words = text.split(' ');
            let delay = 0;
            
            words.forEach((word, index) => {
                setTimeout(() => {
                    const angle = Math.min(45, word.length * 5);
                    
                    // Open jaw
                    this.jawWebSocket.send(JSON.stringify({
                        type: 'jaw_move',
                        angle: angle,
                        duration: 0.3,
                        curve_type: 'linear'
                    }));
                    
                    // Close jaw
                    setTimeout(() => {
                        this.jawWebSocket.send(JSON.stringify({
                            type: 'jaw_move',
                            angle: 0,
                            duration: 0.2
                        }));
                    }, 300);
                    
                }, delay);
                
                delay += 500;
            });
            
            console.log(`🦴 Triggered jaw animation for ${words.length} words`);
            
        } catch (error) {
            console.error('❌ Error triggering jaw animation:', error);
        }
    }
    
    /**
     * Send message to specific client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
    
    /**
     * Broadcast message to all clients
     */
    broadcastToClients(message) {
        this.clients.forEach((client) => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(message));
            }
        });
    }
    
    /**
     * Get system status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            character: this.config.characterId,
            clients: this.clients.size,
            stats: this.stats,
            ai: this.ai.getStats(),
            jawConnected: this.jawWebSocket && this.jawWebSocket.readyState === WebSocket.OPEN
        };
    }
    
    /**
     * Stop the bridge
     */
    stop() {
        if (this.aiServer) {
            this.aiServer.close();
        }
        
        if (this.jawWebSocket) {
            this.jawWebSocket.close();
        }
        
        this.clients.clear();
        this.isRunning = false;
        
        console.log('🛑 AI WebSocket Bridge stopped');
    }
}

module.exports = AIWebSocketBridge;

// CLI usage
if (require.main === module) {
    const bridge = new AIWebSocketBridge({
        characterId: process.argv[2] || 'orlok',
        enableTTS: true,
        enableJawSync: true
    });
    
    bridge.on('started', () => {
        console.log('\n✅ AI WebSocket Bridge started successfully!');
        console.log(`🌐 Connect to: ws://localhost:${bridge.config.aiPort}`);
        console.log('📱 Send messages with: {"type": "chat_message", "text": "Hello!"}');
    });
    
    bridge.on('error', (error) => {
        console.error('\n❌ Bridge error:', error.message);
        process.exit(1);
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        bridge.stop();
        process.exit(0);
    });
    
    bridge.start().catch(error => {
        console.error('💥 Failed to start bridge:', error.message);
        process.exit(1);
    });
}
