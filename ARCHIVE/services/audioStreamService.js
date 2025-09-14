const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('../scripts/logger');
const CharacterMicrophoneService = require('./characterMicrophoneService');
const MicrophoneManagerService = require('./microphoneManagerService');

class AudioStreamService extends EventEmitter {
    constructor(sharedMicrophoneManager = null) {
        super();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        this.microphoneManager = sharedMicrophoneManager || new MicrophoneManagerService();
        this.audioStreamClients = new Set(); // Connected audio stream clients
        this.isInitialized = false;

        // Audio stream configuration
        this.streamConfig = {
            sampleRate: 16000,
            channels: 1,
            bufferSize: 1024,
            enableMonitoring: true,
            enableRecording: false,
            compressionLevel: 0.5
        };

        // Audio monitoring state
        this.monitoringState = new Map(); // characterId -> monitoring info
        this.activeStreamSessions = new Map(); // characterId -> microphoneId

        // Consumer ID for microphone manager
        this.consumerId = 'audio_stream_service';
    }

    /**
     * Initialize the microphone audio stream service
     */
    async initialize() {
        try {
            logger.info('🔊 Initializing Audio Stream Service...');

            // Initialize microphone manager if not already initialized
            if (!this.microphoneManager.isInitialized) {
                const managerInitialized = await this.microphoneManager.initialize();
                if (!managerInitialized) {
                    throw new Error('Failed to initialize microphone manager');
                }
            }

            // Register as consumer with microphone manager
            const consumerRegistered = this.microphoneManager.registerConsumer(this.consumerId, {
                type: 'audio_stream',
                description: 'Audio Stream Service',
                priority: 'medium',
                audioFormat: 'pcm',
                sampleRate: this.streamConfig.sampleRate,
                channels: this.streamConfig.channels
            });

            if (!consumerRegistered) {
                throw new Error('Failed to register with microphone manager');
            }

            // Set up microphone manager event handlers
            this.microphoneManager.on('audio_data', (data) => {
                if (data.consumerId === this.consumerId) {
                    this.processAudioData(data);
                }
            });

            this.microphoneManager.on('status_update', (data) => {
                this.handleMicrophoneStatusUpdate(data);
            });

            this.microphoneManager.on('audio_levels', (data) => {
                this.handleAudioLevels(data);
            });

            // Start audio stream server
            await this.startAudioStreamServer();

            this.isInitialized = true;
            logger.info('✅ Audio Stream Service initialized');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Audio Stream Service:', error);
            return false;
        }
    }

    /**
     * Connect to the microphone hardware service
     */
    async connectToMicrophoneService() {
        try {
            // Connect to microphone WebSocket service (use IPv4 to avoid IPv6 issues)
            this.microphoneWS = new WebSocket('ws://127.0.0.1:8776');
            
            this.microphoneWS.on('open', () => {
                logger.info('🎤 Connected to Microphone WebSocket Service for audio streaming');
                
                // Register as audio stream client
                this.microphoneWS.send(JSON.stringify({
                    type: 'register_audio_stream_client',
                    client_id: 'audio_stream_service'
                }));
            });

            this.microphoneWS.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMicrophoneMessage(message);
                } catch (error) {
                    logger.error('Error parsing microphone message:', error);
                }
            });

            this.microphoneWS.on('error', (error) => {
                logger.error('Microphone WebSocket error:', error);
            });

            this.microphoneWS.on('close', () => {
                logger.warn('🎤 Disconnected from Microphone WebSocket Service');
                // Attempt to reconnect after delay
                setTimeout(() => this.connectToMicrophoneService(), 5000);
            });

        } catch (error) {
            logger.error('Failed to connect to microphone service:', error);
        }
    }

    /**
     * Start audio stream WebSocket server
     */
    async startAudioStreamServer() {
        try {
            // Create WebSocket server for audio streaming
            this.audioStreamServer = new WebSocket.Server({
                port: 8777,
                perMessageDeflate: false // Disable compression for real-time audio
            });

            // Wait for server to be ready
            await new Promise((resolve, reject) => {
                this.audioStreamServer.on('listening', () => {
                    logger.info('🔊 Audio Stream WebSocket server listening on port 8777');
                    resolve();
                });

                this.audioStreamServer.on('error', (error) => {
                    logger.error('❌ Audio Stream server error:', error);
                    reject(error);
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    reject(new Error('Audio Stream server startup timeout'));
                }, 5000);
            });

            this.audioStreamServer.on('connection', (ws, req) => {
                const clientId = `audio_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                logger.info(`🔊 Audio stream client connected: ${clientId}`);
                
                ws.clientId = clientId;
                this.audioStreamClients.add(ws);

                // Send welcome message
                ws.send(JSON.stringify({
                    type: 'audio_stream_welcome',
                    clientId: clientId,
                    config: this.streamConfig
                }));

                ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleAudioStreamClientMessage(ws, message);
                    } catch (error) {
                        logger.error('Error parsing audio stream client message:', error);
                    }
                });

                ws.on('close', () => {
                    logger.info(`🔊 Audio stream client disconnected: ${clientId}`);
                    this.audioStreamClients.delete(ws);
                });

                ws.on('error', (error) => {
                    logger.error(`Audio stream client error (${clientId}):`, error);
                    this.audioStreamClients.delete(ws);
                });
            });

            logger.info('🔊 Audio Stream WebSocket Server started on port 8777');

        } catch (error) {
            logger.error('Failed to start audio stream server:', error);
            throw error;
        }
    }

    /**
     * Handle messages from microphone service
     */
    handleMicrophoneMessage(message) {
        try {
            switch (message.type) {
                case 'microphone_audio_data':
                    this.processAudioData(message);
                    break;
                    
                case 'microphone_status_update':
                    this.handleMicrophoneStatusUpdate(message);
                    break;
                    
                default:
                    logger.debug('Unknown microphone message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling microphone message:', error);
        }
    }

    /**
     * Handle messages from audio stream clients
     */
    handleAudioStreamClientMessage(ws, message) {
        try {
            switch (message.type) {
                case 'start_monitoring':
                    this.startMonitoring(ws, message);
                    break;
                    
                case 'stop_monitoring':
                    this.stopMonitoring(ws, message);
                    break;
                    
                case 'update_config':
                    this.updateStreamConfig(message.config);
                    break;
                    
                default:
                    logger.debug('Unknown audio stream client message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling audio stream client message:', error);
        }
    }

    /**
     * Process audio data from microphone and stream to clients
     */
    async processAudioData(message) {
        try {
            const { microphone_id, audio_data, timestamp } = message;
            
            // Get character associated with this microphone
            const character = await this.getCharacterByMicrophoneId(microphone_id);
            if (!character) {
                return; // No character associated
            }

            // Process audio data for streaming
            const processedAudio = this.processAudioForStreaming(audio_data);
            
            // Update monitoring state
            this.updateMonitoringState(character.id, {
                microphoneId: microphone_id,
                audioLevel: this.calculateAudioLevel(audio_data),
                timestamp: timestamp,
                lastActivity: Date.now()
            });

            // Stream to connected clients
            this.streamAudioToClients({
                type: 'audio_stream_data',
                characterId: character.id,
                microphoneId: microphone_id,
                audioData: processedAudio,
                audioLevel: this.calculateAudioLevel(audio_data),
                timestamp: timestamp
            });

            // Emit audio stream event
            this.emit('audio_stream', {
                characterId: character.id,
                microphoneId: microphone_id,
                audioData: processedAudio,
                audioLevel: this.calculateAudioLevel(audio_data),
                timestamp: timestamp
            });

        } catch (error) {
            logger.error('Error processing audio data for streaming:', error);
        }
    }

    /**
     * Process audio data for streaming (compression, filtering, etc.)
     */
    processAudioForStreaming(audioData) {
        try {
            // Apply compression if enabled
            if (this.streamConfig.compressionLevel > 0) {
                // Simple compression - reduce data size
                const compressionRatio = 1 - this.streamConfig.compressionLevel;
                const compressedLength = Math.floor(audioData.length * compressionRatio);
                return audioData.slice(0, compressedLength);
            }
            
            return audioData;
        } catch (error) {
            logger.error('Error processing audio for streaming:', error);
            return audioData;
        }
    }

    /**
     * Calculate audio level for monitoring
     */
    calculateAudioLevel(audioData) {
        try {
            if (!audioData || audioData.length === 0) return 0;
            
            // Calculate RMS (Root Mean Square) for audio level
            let sum = 0;
            for (let i = 0; i < audioData.length; i++) {
                sum += audioData[i] * audioData[i];
            }
            
            const rms = Math.sqrt(sum / audioData.length);
            return Math.min(1.0, rms * 10); // Normalize to 0-1 range
        } catch (error) {
            logger.error('Error calculating audio level:', error);
            return 0;
        }
    }

    /**
     * Update monitoring state for character
     */
    updateMonitoringState(characterId, state) {
        this.monitoringState.set(characterId, {
            ...this.monitoringState.get(characterId),
            ...state
        });
    }

    /**
     * Stream audio to connected clients
     */
    streamAudioToClients(audioMessage) {
        if (this.audioStreamClients.size === 0) return;

        const messageStr = JSON.stringify(audioMessage);
        const disconnectedClients = new Set();

        for (const client of this.audioStreamClients) {
            try {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(messageStr);
                } else {
                    disconnectedClients.add(client);
                }
            } catch (error) {
                logger.error('Error streaming audio to client:', error);
                disconnectedClients.add(client);
            }
        }

        // Remove disconnected clients
        for (const client of disconnectedClients) {
            this.audioStreamClients.delete(client);
        }
    }

    /**
     * Start monitoring for a character
     */
    async startMonitoring(ws, message) {
        try {
            const { characterId } = message;
            
            // Get microphone assigned to character
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                ws.send(JSON.stringify({
                    type: 'monitoring_error',
                    error: `No microphone assigned to character ${characterId}`
                }));
                return;
            }

            // Start microphone recording if not already started
            if (this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN) {
                this.microphoneWS.send(JSON.stringify({
                    type: 'start_microphone',
                    microphone_id: `microphone_${microphone.id}`,
                    config: {
                        ...microphone.config,
                        streaming_enabled: true
                    }
                }));
            }

            ws.send(JSON.stringify({
                type: 'monitoring_started',
                characterId: characterId,
                microphoneId: microphone.id
            }));

            logger.info(`🔊 Started audio monitoring for character ${characterId}`);

        } catch (error) {
            logger.error('Error starting monitoring:', error);
            ws.send(JSON.stringify({
                type: 'monitoring_error',
                error: error.message
            }));
        }
    }

    /**
     * Stop monitoring for a character
     */
    async stopMonitoring(ws, message) {
        try {
            const { characterId } = message;
            
            // Remove from monitoring state
            this.monitoringState.delete(characterId);

            ws.send(JSON.stringify({
                type: 'monitoring_stopped',
                characterId: characterId
            }));

            logger.info(`🔊 Stopped audio monitoring for character ${characterId}`);

        } catch (error) {
            logger.error('Error stopping monitoring:', error);
        }
    }

    /**
     * Update stream configuration
     */
    updateStreamConfig(newConfig) {
        this.streamConfig = { ...this.streamConfig, ...newConfig };
        logger.info('Audio stream configuration updated:', this.streamConfig);
        
        // Broadcast config update to clients
        this.streamAudioToClients({
            type: 'config_updated',
            config: this.streamConfig
        });
    }

    /**
     * Get character associated with microphone ID
     */
    async getCharacterByMicrophoneId(microphoneId) {
        try {
            // Extract numeric ID from microphone_id (e.g., "microphone_1" -> 1)
            const numericId = parseInt(microphoneId.replace('microphone_', '')) || 1;
            return await this.characterMicrophoneService.getCharacterByMicrophone(numericId);
        } catch (error) {
            logger.error('Error getting character by microphone ID:', error);
            return null;
        }
    }

    /**
     * Handle microphone status updates
     */
    handleMicrophoneStatusUpdate(message) {
        logger.debug('Microphone status update for audio streaming:', message);
        
        // Broadcast status to audio stream clients
        this.streamAudioToClients({
            type: 'microphone_status_update',
            ...message
        });
    }

    /**
     * Get audio stream status
     */
    getStreamStatus() {
        return {
            initialized: this.isInitialized,
            microphoneServiceConnected: this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN,
            connectedClients: this.audioStreamClients.size,
            activeMonitoring: this.monitoringState.size,
            config: this.streamConfig,
            monitoringState: Object.fromEntries(this.monitoringState)
        };
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        try {
            logger.info('🛑 Shutting down Microphone Audio Stream Service...');

            // Close all client connections
            for (const client of this.audioStreamClients) {
                try {
                    client.close();
                } catch (error) {
                    logger.error('Error closing audio stream client:', error);
                }
            }
            this.audioStreamClients.clear();

            // Close audio stream server
            if (this.audioStreamServer) {
                this.audioStreamServer.close();
                this.audioStreamServer = null;
            }

            // Close microphone WebSocket connection
            if (this.microphoneWS) {
                this.microphoneWS.close();
                this.microphoneWS = null;
            }

            this.isInitialized = false;
            logger.info('✅ Microphone Audio Stream Service shutdown complete');

        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
    }
}

module.exports = AudioStreamService;
