/**
 * ElevenLabs Conversational AI Service
 * Handles WebSocket connections to ElevenLabs agents and integrates with jaw animation
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { getElevenLabsApiKeySync } = require('../utils/elevenlabsKey');

class ElevenLabsConversationalService extends EventEmitter {
    constructor() {
        super();

        this.apiKey = getElevenLabsApiKeySync();
        this.baseURL = 'https://api.elevenlabs.io/v1';
        this.headers = {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };

        // Debug API key availability
        if (!this.apiKey) {
            console.warn('⚠️ ElevenLabs API key not found in environment variables');
        } else {
            console.log(`🔑 ElevenLabs API key loaded (length: ${this.apiKey.length})`);
        }
        
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
        
        // Only log connections in debug mode to reduce spam from health checks
        if (process.env.DEBUG_CONNECTIONS) {
            console.log(`🔗 New client connected: ${sessionId} from ${clientIP}`);
        }
        
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
            const connection = this.activeConnections.get(sessionId);

            if (!connection) {
                console.error(`❌ No connection found for session: ${sessionId}`);
                return;
            }

            // Convert data to string for analysis
            let dataString = data.toString();

            // Debug: Log data type and first few bytes
            console.log(`🔍 Received data for session ${sessionId}:`, {
                type: typeof data,
                isBuffer: data instanceof Buffer,
                isBlob: data instanceof Blob,
                length: data.length || data.size,
                firstBytes: data instanceof Buffer ? data.slice(0, 10).toString('hex') : 'N/A',
                dataString: dataString.substring(0, 100)
            });

            // Check if it looks like JSON (starts with { or [)
            if (dataString.trim().startsWith('{') || dataString.trim().startsWith('[')) {
                // This is a JSON message
                console.log(`📨 Received JSON message for session ${sessionId}: ${dataString.substring(0, 100)}`);
                const message = JSON.parse(dataString);

                // ElevenLabs Live Mode: forward user audio chunks directly if present
                if (Object.prototype.hasOwnProperty.call(message, 'user_audio_chunk')) {
                    await this.sendAudioToAgent(sessionId, message.user_audio_chunk);
                    return;
                }

                switch (message.type) {
                    case 'authenticate':
                        await this.handleAuthentication(sessionId, message);
                        break;

                    case 'start_conversation':
                        await this.startConversation(sessionId, message.characterId);
                        break;

                    case 'send_audio':
                        await this.sendAudioToAgent(sessionId, message.audioData);
                        break;

                    case 'send_text':
                    case 'user_message':
                        await this.sendTextToAgent(sessionId, message.text || message.message);
                        break;

                    case 'stop_conversation':
                        await this.stopConversation(sessionId);
                        break;

                    case 'get_conversation_starters':
                        this.sendConversationStarters(sessionId, message.characterId);
                        break;

                    default:
                        // Only warn about unknown message types if the message actually has a type
                        // (avoid warnings for outgoing user_audio_chunk messages that get echoed back)
                        if (message.type !== undefined) {
                            console.warn(`⚠️  Unknown message type: ${message.type}`);
                        }
                }
                return;
            }

            // If not JSON, treat as binary audio data
            console.log(`🎵 Received binary audio data: ${data.length} bytes for session ${sessionId}`);
            await this.sendAudioToAgent(sessionId, data);


        } catch (error) {
            console.error(`❌ Error handling client message for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to process message'
            });
        }
    }

    /**
     * Handle authentication for Live Mode
     */
    async handleAuthentication(sessionId, message) {
        try {
            console.log(`🔐 Authenticating session ${sessionId} for Live Mode`);

            const { token, agentId, liveMode } = message;

            // Validate token with backend
            const response = await fetch('http://localhost:3000/ai-management/api/elevenlabs/validate-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const validation = await response.json();
            if (!validation.success) {
                throw new Error(validation.error || 'Authentication failed');
            }

            // Store authentication info
            const connection = this.activeConnections.get(sessionId);
            if (connection) {
                connection.authenticated = true;
                connection.agentId = agentId;
                connection.liveMode = liveMode;
                connection.apiKey = validation.apiKey;
            }

            // If Live Mode, connect directly to ElevenLabs
            if (liveMode) {
                await this.startLiveModeConnection(sessionId, agentId, validation.apiKey);
            }

            // Send authentication success
            this.sendToClient(sessionId, {
                type: 'authentication_success',
                liveMode: liveMode
            });

            console.log(`✅ Session ${sessionId} authenticated for Live Mode`);

        } catch (error) {
            console.error(`❌ Authentication failed for session ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'authentication_error',
                error: error.message
            });
        }
    }

    /**
     * Start Live Mode connection to ElevenLabs
     */
    async startLiveModeConnection(sessionId, agentId, apiKey) {
        try {
            console.log(`🎙️ Starting Live Mode connection for session ${sessionId}`);

            const connection = this.activeConnections.get(sessionId);
            if (!connection) {
                throw new Error('Connection not found');
            }

            // Connect directly to ElevenLabs Conversational AI
            const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
            const elevenLabsWs = new WebSocket(wsUrl, {
                headers: {
                    'xi-api-key': apiKey
                }
            });

            connection.elevenLabsWs = elevenLabsWs;

            elevenLabsWs.on('open', () => {
                console.log(`✅ Live Mode connected to ElevenLabs for session ${sessionId}`);

                // Send conversation initiation
                const initMessage = {
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: {
                        agent: {
                            language: "en"
                        },
                        turn_detection: {
                            type: this.getVADConfig().vadType || 'server_vad',
                            threshold: this.getVADConfig().vadThreshold,
                            prefix_padding_ms: this.getVADConfig().prefixPadding,
                            silence_duration_ms: this.getVADConfig().silenceDuration
                        }
                    }
                };

                elevenLabsWs.send(JSON.stringify(initMessage));
            });

            elevenLabsWs.on('message', (data) => {
                // Process ElevenLabs messages properly
                this.handleElevenLabsMessage(sessionId, data);
            });

            elevenLabsWs.on('error', (error) => {
                console.error(`❌ Live Mode ElevenLabs error for session ${sessionId}:`, error);
                this.sendToClient(sessionId, {
                    type: 'live_mode_error',
                    error: error.message
                });
            });

            elevenLabsWs.on('close', () => {
                console.log(`🔌 Live Mode ElevenLabs connection closed for session ${sessionId}`);
                if (connection.elevenLabsWs) {
                    connection.elevenLabsWs = null;
                }
            });

        } catch (error) {
            console.error(`❌ Error starting Live Mode connection for session ${sessionId}:`, error.message);
            throw error;
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

            // If a previous ElevenLabs connection exists for this session, close it first
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                try {
                    console.log(`🔄 Closing existing ElevenLabs connection for session ${sessionId} before starting new one`);
                    connection.elevenLabsWs.close();
                } catch (closeErr) {
                    console.warn(`⚠️ Error closing previous ElevenLabs connection for ${sessionId}:`, closeErr.message);
                } finally {
                    connection.elevenLabsWs = null;
                    connection.isActive = false;
                }
            }

            // Check if API key is available
            if (!this.apiKey) {
                console.warn(`⚠️ ElevenLabs API key not available, using mock mode for ${sessionId}`);
                this.startMockConversation(sessionId, agent);
                return;
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

                // Send conversation initiation message to ElevenLabs with live VAD config
                elevenLabsWs.send(JSON.stringify({
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: {
                        turn_detection: {
                            type: this.getVADConfig().vadType || 'server_vad',
                            threshold: this.getVADConfig().vadThreshold,
                            prefix_padding_ms: this.getVADConfig().prefixPadding,
                            silence_duration_ms: this.getVADConfig().silenceDuration
                        }
                    }
                }));

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
            console.error(`❌ Full error details:`, error);

            // Send detailed error to client
            this.sendToClient(sessionId, {
                type: 'error',
                message: `Failed to start conversation: ${error.message}`,
                details: error.message.includes('API') ? 'ElevenLabs API connection failed' : 'Service error'
            });
        }
    }

    /**
     * Start mock conversation when ElevenLabs API is not available
     */
    startMockConversation(sessionId, agent) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        console.log(`🎭 Starting mock conversation for ${agent.name}`);

        // Mark connection as active
        connection.characterId = agent.characterId;
        connection.isActive = true;

        // Send conversation started message
        this.sendToClient(sessionId, {
            type: 'conversation_started',
            characterId: agent.characterId,
            characterName: agent.name,
            mode: 'mock'
        });

        // Send a welcome message
        setTimeout(() => {
            this.sendToClient(sessionId, {
                type: 'transcript',
                text: `Hello! I'm ${agent.name}. This is a mock conversation since ElevenLabs API is not available.`,
                role: 'assistant'
            });
        }, 1000);
    }

    /**
     * Handle message from ElevenLabs WebSocket
     */
    handleElevenLabsMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) return;

            // Debug: Log all incoming messages from ElevenLabs
            console.log(`🔍 ElevenLabs message for session ${sessionId}:`, {
                type: message.type,
                keys: Object.keys(message),
                message: JSON.stringify(message).substring(0, 200) + '...'
            });

            switch (message.type) {
                case 'audio':
                    // Handle audio response from ElevenLabs
                    this.handleAudioResponse(sessionId, message);
                    break;

                case 'user_transcript':
                    // Forward user transcript to client
                    this.sendToClient(sessionId, {
                        type: 'transcript',
                        text: message.user_transcription_event.user_transcript,
                        role: 'user'
                    });
                    // Emit internal transcript event for Super Powers consumers
                    try { this.emit('transcript', { sessionId, characterId: connection.characterId, role: 'user', text: message.user_transcription_event.user_transcript }); } catch (e) {}
                    break;

                case 'agent_response':
                    // Forward agent response to client
                    this.sendToClient(sessionId, {
                        type: 'transcript',
                        text: message.agent_response_event.agent_response,
                        role: 'assistant'
                    });
                    // Emit internal transcript event for Super Powers consumers
                    try { this.emit('transcript', { sessionId, characterId: connection.characterId, role: 'assistant', text: message.agent_response_event.agent_response }); } catch (e) {}
                    break;

                case 'agent_response_correction':
                    // Forward corrected agent response to client
                    this.sendToClient(sessionId, {
                        type: 'transcript',
                        text: message.agent_response_correction_event.corrected_agent_response,
                        role: 'assistant'
                    });
                    // Emit internal transcript event for Super Powers consumers
                    try { this.emit('transcript', { sessionId, characterId: connection.characterId, role: 'assistant', text: message.agent_response_correction_event.corrected_agent_response }); } catch (e) {}
                    break;

                case 'ping':
                    // Respond to ping to keep connection alive
                    this.handlePingMessage(sessionId, message);
                    break;

                case 'conversation_initiation_metadata':
                    // Handle conversation initialization metadata
                    console.log(`🎯 Conversation initialized for session ${sessionId}:`, message.conversation_initiation_metadata_event);
                    // Store audio format on connection for downstream consumers (jaw animation, etc.)
                    connection.audioFormat = message.conversation_initiation_metadata_event.agent_output_audio_format;
                    this.sendToClient(sessionId, {
                        type: 'conversation_metadata',
                        conversationId: message.conversation_initiation_metadata_event.conversation_id,
                        audioFormat: message.conversation_initiation_metadata_event.agent_output_audio_format
                    });
                    break;

                case 'interruption':
                    // Handle interruption
                    this.sendToClient(sessionId, {
                        type: 'interruption',
                        reason: message.interruption_event.reason
                    });
                    break;

                case 'conversation_end':
                    this.handleConversationEnd(sessionId);
                    break;

                default:
                    console.log(`🔍 Unknown ElevenLabs message type: ${message.type}`, message);
                    // Forward other messages as-is
                    this.sendToClient(sessionId, message);
            }
            
        } catch (error) {
            console.error(`❌ Error handling ElevenLabs message for ${sessionId}:`, error.message);
        }
    }

    /**
     * Handle audio response from ElevenLabs
     */
    handleAudioResponse(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Forward audio to client
        this.sendToClient(sessionId, {
            type: 'audio',
            audioData: message.audio_event.audio_base_64,
            format: 'base64'
        });

        // Trigger jaw animation if character has animatronic enabled
        const agent = this.agents.get(connection.characterId);
        if (agent && agent.hardwareConfig.animatronic.enabled) {
            this.triggerJawAnimation(sessionId, message.audio_event.audio_base_64);
        }
    }

    /**
     * Handle ping message from ElevenLabs
     */
    handlePingMessage(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || !connection.elevenLabsWs) return;

        try {
            // Send pong response
            const pongMessage = {
                type: 'pong',
                event_id: message.ping_event.event_id
            };

            // Add delay if specified
            if (message.ping_event.ping_ms) {
                setTimeout(() => {
                    if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        connection.elevenLabsWs.send(JSON.stringify(pongMessage));
                    }
                }, message.ping_event.ping_ms);
            } else {
                connection.elevenLabsWs.send(JSON.stringify(pongMessage));
            }

        } catch (error) {
            console.error(`❌ Error sending pong for ${sessionId}:`, error.message);
        }
    }

    /**
     * Trigger jaw animation based on audio
     */
    triggerJawAnimation(sessionId, audioBase64) {
        try {
            // Determine character for this session if available
            const connection = this.activeConnections ? this.activeConnections.get(sessionId) : null;
            const characterId = connection && connection.characterId ? connection.characterId : null;

            // Package audio data for jaw animation consumers
            const jawAnimationMessage = {
                type: 'audio_data',
                sessionId,
                characterId,
                audioData: audioBase64,
                format: 'base64',
                audioFormat: connection && connection.audioFormat ? connection.audioFormat : null
            };

            // Emit internal event so other services (jawAnimationService) can forward/process
            try {
                this.emit('jaw_audio', jawAnimationMessage);
            } catch (e) {
                // Non-fatal
            }

            // Broadcast to any clients directly registered on this service (legacy path)
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
            let base64Audio;

            // Convert binary data to base64 if needed
            if (audioData instanceof Buffer) {
                base64Audio = audioData.toString('base64');
            } else if (audioData instanceof Blob) {
                // Convert Blob to base64
                const arrayBuffer = await audioData.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                base64Audio = buffer.toString('base64');
            } else if (typeof audioData === 'string') {
                // Assume it's already base64 encoded
                base64Audio = audioData;
            } else {
                console.error(`❌ Unsupported audio data type for session ${sessionId}:`, typeof audioData);
                return;
            }

            // ElevenLabs ConvAI expects a root-level user_audio_chunk field
            const message = {
                user_audio_chunk: base64Audio
            };

            connection.elevenLabsWs.send(JSON.stringify(message));
            console.log(`🎵 Forwarded user_audio_chunk (${base64Audio.length} base64 chars) to ElevenLabs for session ${sessionId}`);

        } catch (error) {
            console.error(`❌ Error sending audio to agent for ${sessionId}:`, error.message);
        }
    }

    /**
     * Send text to ElevenLabs agent
     */
    async sendTextToAgent(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || !connection.isActive) {
            console.error(`❌ No active connection for session: ${sessionId}`);
            return;
        }

        // Handle mock mode
        if (!connection.elevenLabsWs) {
            console.log(`💬 Mock response for "${text}"`);

            // Echo the user's message
            this.sendToClient(sessionId, {
                type: 'transcript',
                text: text,
                role: 'user'
            });

            // Send a mock response
            setTimeout(() => {
                const responses = [
                    "That's interesting! Tell me more.",
                    "I understand what you're saying.",
                    "Thanks for sharing that with me.",
                    "How does that make you feel?",
                    "That's a great point!"
                ];
                const response = responses[Math.floor(Math.random() * responses.length)];

                this.sendToClient(sessionId, {
                    type: 'transcript',
                    text: response,
                    role: 'assistant'
                });
            }, 1000 + Math.random() * 2000);

            return;
        }

        try {
            // Send text as user message to ElevenLabs
            const message = {
                type: 'user_message',
                text: text
            };

            connection.elevenLabsWs.send(JSON.stringify(message));
            console.log(`💬 Sent user message to ElevenLabs agent for session ${sessionId}: "${text}"`);

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
        // Only log disconnections in debug mode to reduce spam from health checks
        if (process.env.DEBUG_CONNECTIONS) {
            console.log(`🔌 Client disconnected: ${sessionId}`);
        }
        
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
                agentId: agent.agentId,
                id: agent.agentId // Add id field for consistency
            }))
        };
    }

    /**
     * Assign an agent to a character
     */
    async assignAgentToCharacter(agentId, characterId) {
        // Find agent by agentId
        let foundAgent = null;
        for (const [id, agent] of this.agents.entries()) {
            if (agent.agentId === agentId) {
                foundAgent = agent;
                break;
            }
        }

        if (!foundAgent) {
            throw new Error(`Agent ${agentId} not found`);
        }

        // Update the agent's character assignment
        foundAgent.characterId = characterId;
        console.log(`🎭 Assigned ElevenLabs agent ${agentId} (${foundAgent.name}) to character ${characterId}`);

        return true;
    }

    /**
     * Update VAD configuration
     */
    async updateVADConfig(config) {
        try {
            console.log('🎤 Updating VAD configuration:', config);

            // Store VAD configuration (could be saved to file if needed)
            this.vadConfig = {
                vadType: config.vadType || 'server_vad',
                vadThreshold: parseFloat(config.vadThreshold) || 0.5,
                prefixPadding: parseInt(config.prefixPadding) || 300,
                silenceDuration: parseInt(config.silenceDuration) || 700,
                updatedAt: new Date().toISOString()
            };

            console.log('✅ VAD configuration updated successfully');
            return { success: true, config: this.vadConfig };

        } catch (error) {
            console.error('❌ Failed to update VAD configuration:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get VAD configuration
     */
    getVADConfig() {
        return this.vadConfig || {
            vadType: 'server_vad',
            vadThreshold: 0.5,
            prefixPadding: 300,
            silenceDuration: 700
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
