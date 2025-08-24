/**
 * ElevenLabs Conversational AI Service
 * Handles WebSocket connections to ElevenLabs agents and integrates with jaw animation
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

class ElevenLabsConversationalService extends EventEmitter {
    constructor() {
        super();
        
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseURL = 'https://api.elevenlabs.io/v1';
        this.headers = {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };
        
        // Agent management
        this.agents = new Map(); // Character ID -> Agent data
        this.activeConnections = new Map(); // Session ID -> Connection data
        
        // WebSocket server for MonsterBox integration
        this.wsServer = null;
        this.port = 8771; // New port for ElevenLabs service
        
        // Jaw animation integration
        this.jawAnimationClients = new Set();
        
        // Audio processing
        this.audioBuffer = new Map(); // Session ID -> Audio chunks
        
        console.log('🤖 ElevenLabs Conversational Service initialized');
    }

    /**
     * Initialize the service
     */
    async initialize() {
        try {
            console.log('🚀 Initializing ElevenLabs Conversational Service...');
            
            // Load agent configurations
            await this.loadAgentConfigurations();
            
            // Start WebSocket server
            await this.startWebSocketServer();
            
            console.log('✅ ElevenLabs Conversational Service ready');
            
        } catch (error) {
            console.error('❌ Failed to initialize ElevenLabs service:', error.message);
            throw error;
        }
    }

    /**
     * Load agent configurations from file
     */
    async loadAgentConfigurations() {
        try {
            const agentsPath = path.join(__dirname, '../data/elevenlabs-agents.json');
            const data = await fs.readFile(agentsPath, 'utf8');
            const agentsData = JSON.parse(data);
            
            // Map agents by character ID
            agentsData.agents.forEach(agent => {
                this.agents.set(agent.originalCharacterId, {
                    agentId: agent.agentId,
                    name: agent.originalName,
                    config: agent.agentConfig,
                    conversationStarters: agent.conversationStarters,
                    hardwareConfig: agent.hardwareConfig
                });
            });
            
            console.log(`📂 Loaded ${this.agents.size} ElevenLabs agents`);
            
        } catch (error) {
            throw new Error(`Failed to load agent configurations: ${error.message}`);
        }
    }

    /**
     * Start WebSocket server for MonsterBox integration
     */
    async startWebSocketServer() {
        return new Promise((resolve, reject) => {
            try {
                this.wsServer = new WebSocket.Server({ 
                    port: this.port,
                    perMessageDeflate: false
                });

                this.wsServer.on('connection', (ws, req) => {
                    this.handleClientConnection(ws, req);
                });

                this.wsServer.on('listening', () => {
                    console.log(`🌐 ElevenLabs WebSocket server listening on port ${this.port}`);
                    resolve();
                });

                this.wsServer.on('error', (error) => {
                    console.error('❌ WebSocket server error:', error.message);
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
        const clientIP = req.socket.remoteAddress;
        
        console.log(`🔗 New client connected: ${sessionId} from ${clientIP}`);
        
        // Initialize connection data
        const connectionData = {
            sessionId,
            ws,
            clientIP,
            characterId: null,
            elevenLabsWs: null,
            isActive: false,
            audioBuffer: [],
            connectedAt: new Date()
        };
        
        this.activeConnections.set(sessionId, connectionData);
        
        // Handle messages from MonsterBox client
        ws.on('message', (data) => {
            this.handleClientMessage(sessionId, data);
        });
        
        // Handle client disconnect
        ws.on('close', () => {
            this.handleClientDisconnect(sessionId);
        });
        
        // Handle errors
        ws.on('error', (error) => {
            console.error(`❌ Client WebSocket error for ${sessionId}:`, error.message);
            this.handleClientDisconnect(sessionId);
        });
        
        // Send welcome message
        this.sendToClient(sessionId, {
            type: 'connected',
            sessionId,
            availableCharacters: Array.from(this.agents.keys())
        });
    }

    /**
     * Handle message from MonsterBox client
     */
    async handleClientMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);
            
            if (!connection) {
                console.error(`❌ No connection found for session: ${sessionId}`);
                return;
            }
            
            switch (message.type) {
                case 'start_conversation':
                    await this.startConversation(sessionId, message.characterId);
                    break;
                    
                case 'send_audio':
                    await this.sendAudioToAgent(sessionId, message.audioData);
                    break;

                case 'send_text':
                    await this.sendTextToAgent(sessionId, message.text);
                    break;

                case 'stop_conversation':
                    await this.stopConversation(sessionId);
                    break;
                    
                case 'get_conversation_starters':
                    this.sendConversationStarters(sessionId, message.characterId);
                    break;
                    
                default:
                    console.warn(`⚠️  Unknown message type: ${message.type}`);
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
     * Start conversation with ElevenLabs agent
     */
    async startConversation(sessionId, characterId) {
        try {
            console.log(`🎭 Starting conversation for session ${sessionId} with character ${characterId}`);
            
            const connection = this.activeConnections.get(sessionId);
            const agent = this.agents.get(parseInt(characterId));
            
            if (!connection || !agent) {
                throw new Error(`Invalid session or character: ${sessionId}, ${characterId}`);
            }
            
            // Get signed URL for ElevenLabs WebSocket
            const signedUrlResponse = await fetch(
                `${this.baseURL}/convai/conversation/get-signed-url?agent_id=${agent.agentId}`,
                {
                    method: 'GET',
                    headers: this.headers
                }
            );
            
            if (!signedUrlResponse.ok) {
                throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
            }
            
            const { signed_url } = await signedUrlResponse.json();
            
            // Connect to ElevenLabs WebSocket
            const elevenLabsWs = new WebSocket(signed_url);
            
            elevenLabsWs.on('open', () => {
                console.log(`✅ Connected to ElevenLabs agent: ${agent.name}`);
                connection.elevenLabsWs = elevenLabsWs;
                connection.characterId = characterId;
                connection.isActive = true;
                
                this.sendToClient(sessionId, {
                    type: 'conversation_started',
                    characterId,
                    characterName: agent.name
                });
            });
            
            elevenLabsWs.on('message', (data) => {
                this.handleElevenLabsMessage(sessionId, data);
            });
            
            elevenLabsWs.on('close', () => {
                console.log(`🔌 ElevenLabs connection closed for session ${sessionId}`);
                connection.elevenLabsWs = null;
                connection.isActive = false;
            });
            
            elevenLabsWs.on('error', (error) => {
                console.error(`❌ ElevenLabs WebSocket error for ${sessionId}:`, error.message);
                this.sendToClient(sessionId, {
                    type: 'error',
                    message: 'ElevenLabs connection error'
                });
            });
            
        } catch (error) {
            console.error(`❌ Failed to start conversation for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to start conversation'
            });
        }
    }

    /**
     * Handle message from ElevenLabs WebSocket
     */
    handleElevenLabsMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);
            
            if (!connection) return;
            
            switch (message.type) {
                case 'audio':
                    // Forward audio to client and jaw animation
                    this.handleAudioMessage(sessionId, message);
                    break;
                    
                case 'transcript':
                    // Forward transcript to client
                    this.sendToClient(sessionId, {
                        type: 'transcript',
                        text: message.text,
                        role: message.role
                    });
                    break;
                    
                case 'conversation_end':
                    this.handleConversationEnd(sessionId);
                    break;
                    
                default:
                    // Forward other messages as-is
                    this.sendToClient(sessionId, message);
            }
            
        } catch (error) {
            console.error(`❌ Error handling ElevenLabs message for ${sessionId}:`, error.message);
        }
    }

    /**
     * Handle audio message and trigger jaw animation
     */
    handleAudioMessage(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        
        // Forward audio to client
        this.sendToClient(sessionId, {
            type: 'audio',
            audioData: message.audio_base64,
            format: 'base64'
        });
        
        // Trigger jaw animation if character has animatronic enabled
        const agent = this.agents.get(connection.characterId);
        if (agent && agent.hardwareConfig.animatronic.enabled) {
            this.triggerJawAnimation(sessionId, message.audio_base64);
        }
    }

    /**
     * Trigger jaw animation based on audio
     */
    triggerJawAnimation(sessionId, audioBase64) {
        try {
            // Send audio data to jaw animation service (port 8765)
            const jawAnimationMessage = {
                type: 'audio_data',
                sessionId,
                audioData: audioBase64,
                format: 'base64'
            };
            
            // Broadcast to jaw animation clients
            this.jawAnimationClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(jawAnimationMessage));
                }
            });
            
        } catch (error) {
            console.error(`❌ Error triggering jaw animation for ${sessionId}:`, error.message);
        }
    }

    /**
     * Send audio to ElevenLabs agent
     */
    async sendAudioToAgent(sessionId, audioData) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || !connection.elevenLabsWs || !connection.isActive) {
            console.error(`❌ No active ElevenLabs connection for session: ${sessionId}`);
            return;
        }

        try {
            const message = {
                type: 'audio',
                audio_base64: audioData
            };

            connection.elevenLabsWs.send(JSON.stringify(message));

        } catch (error) {
            console.error(`❌ Error sending audio to agent for ${sessionId}:`, error.message);
        }
    }

    /**
     * Send text to ElevenLabs agent
     */
    async sendTextToAgent(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || !connection.elevenLabsWs || !connection.isActive) {
            console.error(`❌ No active ElevenLabs connection for session: ${sessionId}`);
            return;
        }

        try {
            const message = {
                type: 'text',
                text: text
            };

            connection.elevenLabsWs.send(JSON.stringify(message));

        } catch (error) {
            console.error(`❌ Error sending text to agent for ${sessionId}:`, error.message);
        }
    }

    /**
     * Stop conversation
     */
    async stopConversation(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        if (connection.elevenLabsWs) {
            connection.elevenLabsWs.close();
            connection.elevenLabsWs = null;
        }

        connection.isActive = false;

        this.sendToClient(sessionId, {
            type: 'conversation_stopped'
        });
    }

    /**
     * Handle conversation end
     */
    handleConversationEnd(sessionId) {
        console.log(`🏁 Conversation ended for session: ${sessionId}`);

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            connection.isActive = false;

            this.sendToClient(sessionId, {
                type: 'conversation_ended'
            });
        }
    }

    /**
     * Send message to MonsterBox client
     */
    sendToClient(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (connection && connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Send conversation starters for character
     */
    sendConversationStarters(sessionId, characterId) {
        const agent = this.agents.get(parseInt(characterId));
        if (agent) {
            this.sendToClient(sessionId, {
                type: 'conversation_starters',
                characterId,
                starters: agent.conversationStarters
            });
        }
    }

    /**
     * Handle client disconnect
     */
    handleClientDisconnect(sessionId) {
        console.log(`🔌 Client disconnected: ${sessionId}`);
        
        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            // Close ElevenLabs connection if active
            if (connection.elevenLabsWs) {
                connection.elevenLabsWs.close();
            }
            
            // Remove from active connections
            this.activeConnections.delete(sessionId);
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isRunning: !!this.wsServer,
            port: this.port,
            activeConnections: this.activeConnections.size,
            availableAgents: this.agents.size,
            agents: Array.from(this.agents.entries()).map(([id, agent]) => ({
                characterId: id,
                name: agent.name,
                agentId: agent.agentId
            }))
        };
    }

    /**
     * Shutdown service
     */
    async shutdown() {
        console.log('🛑 Shutting down ElevenLabs Conversational Service...');
        
        // Close all active connections
        this.activeConnections.forEach((connection, sessionId) => {
            if (connection.elevenLabsWs) {
                connection.elevenLabsWs.close();
            }
            if (connection.ws) {
                connection.ws.close();
            }
        });
        
        // Close WebSocket server
        if (this.wsServer) {
            this.wsServer.close();
        }
        
        console.log('✅ ElevenLabs Conversational Service shutdown complete');
    }
}

module.exports = ElevenLabsConversationalService;
