/**
 * MonsterBox 4.0 - ElevenLabs WebSocket Conversation Service
 * Real-time streaming conversation with immediate responses
 */

import WebSocket, { WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import elevenLabsConfigService from './elevenLabsConfigService.js';

class ElevenLabsWebSocketService extends EventEmitter {
    constructor() {
        super();
        this.config = elevenLabsConfigService.getElevenLabsConfig();
        this.activeConnections = new Map(); // sessionId -> connection info
        this.wsServer = null;
        this.port = 8795; // Dedicated port for AI chat WebSocket
    }

    /**
     * Start WebSocket server for real-time chat
     */
    async startWebSocketServer() {
        return new Promise((resolve, reject) => {
            try {
                this.wsServer = new WebSocketServer({
                    port: this.port,
                    host: '0.0.0.0', // Explicitly bind to IPv4
                    perMessageDeflate: false,
                    verifyClient: (info) => {
                        console.log(`🔍 WebSocket connection attempt from: ${info.origin || 'unknown'} (${info.req.connection.remoteAddress})`);
                        return true; // Accept all connections for now
                    }
                });

                this.wsServer.on('connection', (ws, req) => {
                    this.handleClientConnection(ws, req);
                });

                this.wsServer.on('listening', () => {
                    console.log(`🌐 ElevenLabs Chat WebSocket server listening on port ${this.port}`);
                    resolve();
                });

                this.wsServer.on('error', (error) => {
                    console.error('❌ Chat WebSocket server error:', error.message);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle new client connection
     */
    handleClientConnection(ws, req) {
        const sessionId = this.generateSessionId();
        console.log(`🔌 New chat client connected: ${sessionId}`);

        const connection = {
            sessionId,
            clientWs: ws,
            elevenLabsWs: null,
            agentId: null,
            isActive: false,
            startTime: new Date()
        };

        this.activeConnections.set(sessionId, connection);

        ws.on('message', (data) => {
            this.handleClientMessage(sessionId, data);
        });

        ws.on('close', () => {
            this.handleClientDisconnect(sessionId);
        });

        ws.on('error', (error) => {
            console.error(`❌ Client WebSocket error for ${sessionId}:`, error.message);
            this.handleClientDisconnect(sessionId);
        });

        // Send welcome message
        this.sendToClient(sessionId, {
            type: 'connected',
            sessionId: sessionId,
            message: 'Connected to MonsterBox AI Chat'
        });
    }

    /**
     * Handle message from client
     */
    async handleClientMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) {
                console.error(`❌ Connection not found: ${sessionId}`);
                return;
            }

            switch (message.type) {
                case 'start_conversation':
                    await this.startConversation(sessionId, message.agentId);
                    break;

                case 'send_message':
                    await this.sendMessageToAgent(sessionId, message.text);
                    break;

                case 'end_conversation':
                    await this.endConversation(sessionId);
                    break;

                default:
                    console.warn(`❓ Unknown message type: ${message.type}`);
            }

        } catch (error) {
            console.error(`❌ Error handling client message for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to process message'
            });
        }
    }

    /**
     * Start conversation with ElevenLabs agent using real-time WebSocket API
     */
    async startConversation(sessionId, agentId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        try {
            console.log(`🚀 Starting real-time conversation with agent: ${agentId}`);

            // Close any existing ElevenLabs connection
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                connection.elevenLabsWs.close();
                connection.elevenLabsWs = null;
            }

            // Get signed URL for ElevenLabs real-time WebSocket
            const signedUrlResponse = await fetch(
                `${this.config.baseUrl}/convai/conversation/get-signed-url?agent_id=${agentId}`,
                {
                    method: 'GET',
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!signedUrlResponse.ok) {
                throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
            }

            const { signed_url } = await signedUrlResponse.json();
            console.log(`🔗 Got signed URL for agent ${agentId}`);

            // Connect to ElevenLabs real-time WebSocket
            const elevenLabsWs = new WebSocket(signed_url);

            elevenLabsWs.on('open', () => {
                console.log(`⚡ Connected to ElevenLabs real-time agent: ${agentId}`);
                connection.elevenLabsWs = elevenLabsWs;
                connection.agentId = agentId;
                connection.isActive = true;

                // Send conversation initiation with optimized config for speed
                elevenLabsWs.send(JSON.stringify({
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: {
                        turn_detection: {
                            type: 'server_vad',
                            threshold: 0.5,
                            prefix_padding_ms: 100, // Reduced for faster response
                            silence_duration_ms: 500 // Reduced for faster response
                        }
                    }
                }));

                this.sendToClient(sessionId, {
                    type: 'conversation_started',
                    agentId: agentId,
                    message: 'Connected to real-time agent - ready for instant chat!'
                });
            });

            elevenLabsWs.on('message', (data) => {
                this.handleElevenLabsMessage(sessionId, data);
            });

            elevenLabsWs.on('close', () => {
                console.log(`🔌 ElevenLabs real-time connection closed for ${sessionId}`);
                connection.elevenLabsWs = null;
                connection.isActive = false;
                this.sendToClient(sessionId, {
                    type: 'conversation_ended',
                    message: 'Real-time conversation ended'
                });
            });

            elevenLabsWs.on('error', (error) => {
                console.error(`❌ ElevenLabs real-time WebSocket error for ${sessionId}:`, error.message);
                this.sendToClient(sessionId, {
                    type: 'error',
                    message: 'Real-time agent connection failed'
                });
            });

        } catch (error) {
            console.error(`❌ Failed to start real-time conversation for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to connect to real-time agent: ' + error.message
            });
        }
    }

    /**
     * Send message to ElevenLabs agent via real-time WebSocket
     */
    async sendMessageToAgent(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || !connection.elevenLabsWs || !connection.isActive) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active real-time conversation'
            });
            return;
        }

        try {
            console.log(`📤 Sending text to real-time agent: "${text}"`);

            // Send text message to ElevenLabs real-time WebSocket
            // Use proper text message format for conversational AI
            const message = {
                type: 'user_message',
                text: text
            };

            connection.elevenLabsWs.send(JSON.stringify(message));
            console.log(`✅ Text message sent to real-time agent for ${sessionId}`);

        } catch (error) {
            console.error(`❌ Failed to send message to real-time agent for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to send message to real-time agent: ' + error.message
            });
        }
    }

    /**
     * Handle message from ElevenLabs real-time WebSocket
     */
    handleElevenLabsMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) return;



            switch (message.type) {
                case 'conversation_initiation_metadata':
                    console.log(`🎯 Conversation initiated for ${sessionId}`);
                    break;

                case 'audio':
                    // Real-time audio response with text
                    if (message.audio_event) {
                        const audioData = message.audio_event.audio_base_64;
                        // Try multiple fields for text content - check audio_event first
                        const responseText = message.audio_event?.agent_response ||
                            message.audio_event?.text ||
                            message.agent_response ||
                            message.text ||
                            null;



                        this.sendToClient(sessionId, {
                            type: 'agent_response',
                            text: responseText || 'Audio response',
                            audio: audioData,
                            timestamp: Date.now(),
                            realTime: true
                        });
                    }
                    break;

                case 'agent_response':
                    // Text-only agent response
                    const responseText = message.agent_response_event?.agent_response ||
                        message.agent_response ||
                        message.text ||
                        message.message ||
                        '';



                    this.sendToClient(sessionId, {
                        type: 'agent_response',
                        text: responseText || 'Text response',
                        timestamp: Date.now(),
                        realTime: true
                    });
                    break;

                case 'ping':
                    // Handle ping/pong for connection keepalive (silent)
                    if (message.ping_event && connection.elevenLabsWs) {
                        const pongMessage = {
                            type: 'pong',
                            event_id: message.ping_event.event_id
                        };
                        connection.elevenLabsWs.send(JSON.stringify(pongMessage));
                    }
                    break;

                case 'conversation_end':
                    console.log(`🔚 Conversation ended by ElevenLabs for ${sessionId}`);
                    this.sendToClient(sessionId, {
                        type: 'conversation_ended',
                        message: 'Conversation ended by agent'
                    });
                    break;

                case 'interruption':
                    // Handle interruptions silently - they're normal in real-time conversation
                    this.sendToClient(sessionId, {
                        type: 'interruption',
                        reason: message.interruption_event?.reason || 'Unknown'
                    });
                    break;

                default:
                    // Ignore unknown message types to keep console clean
                    break;
            }

        } catch (error) {
            console.error(`❌ Error handling ElevenLabs real-time message for ${sessionId}:`, error.message);
            console.error('Raw message:', data.toString());
        }
    }

    /**
     * End conversation and close ElevenLabs WebSocket
     */
    async endConversation(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Close ElevenLabs WebSocket if active
        if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
            try {
                console.log(`🔌 Closing ElevenLabs real-time connection for ${sessionId}`);
                connection.elevenLabsWs.close();
            } catch (error) {
                console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
            }
            connection.elevenLabsWs = null;
        }

        connection.isActive = false;
        connection.agentId = null;

        this.sendToClient(sessionId, {
            type: 'conversation_ended',
            message: 'Real-time conversation ended'
        });
    }

    /**
     * Handle client disconnect
     */
    handleClientDisconnect(sessionId) {
        console.log(`🔌 Client disconnected: ${sessionId}`);

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            // Close ElevenLabs WebSocket if active
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                try {
                    console.log(`🔌 Closing ElevenLabs connection for disconnected client ${sessionId}`);
                    connection.elevenLabsWs.close();
                } catch (error) {
                    console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
                }
            }
            this.activeConnections.delete(sessionId);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (connection && connection.clientWs && connection.clientWs.readyState === WebSocket.OPEN) {
            connection.clientWs.send(JSON.stringify(message));
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get active connections count
     */
    getActiveConnectionsCount() {
        return this.activeConnections.size;
    }

    /**
     * Stop WebSocket server
     */
    async stopWebSocketServer() {
        if (this.wsServer) {
            // Close all active connections
            for (const [sessionId, connection] of this.activeConnections) {
                if (connection.elevenLabsWs) {
                    connection.elevenLabsWs.close();
                }
                if (connection.clientWs) {
                    connection.clientWs.close();
                }
            }

            this.activeConnections.clear();

            return new Promise((resolve) => {
                this.wsServer.close(() => {
                    console.log('🛑 ElevenLabs Chat WebSocket server stopped');
                    resolve();
                });
            });
        }
    }
}

export default new ElevenLabsWebSocketService();
