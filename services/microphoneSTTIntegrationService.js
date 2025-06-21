const EventEmitter = require('events');
const WebSocket = require('ws');
const logger = require('../scripts/logger');
const CharacterMicrophoneService = require('./characterMicrophoneService');

// Import OpenAI STT integration
let OpenAISTTIntegration;
try {
    OpenAISTTIntegration = require('../scripts/chatterpi/openai_stt_integration');
} catch (error) {
    logger.warn('OpenAI STT integration not available:', error.message);
}

class MicrophoneSTTIntegrationService extends EventEmitter {
    constructor() {
        super();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        this.sttIntegration = null;
        this.microphoneConnections = new Map(); // characterId -> WebSocket connection
        this.isInitialized = false;
        
        // STT configuration
        this.sttConfig = {
            language: 'en',
            confidenceThreshold: 0.7,
            chunkDuration: 2000,
            fallbackToSystem: true,
            realTimeProcessing: true
        };
    }

    /**
     * Initialize the microphone-STT integration service
     */
    async initialize() {
        try {
            logger.info('🎤🗣️ Initializing Microphone-STT Integration Service...');

            // Initialize STT integration if available
            if (OpenAISTTIntegration) {
                this.sttIntegration = new OpenAISTTIntegration(this.sttConfig);
                
                // Set up STT event handlers
                this.sttIntegration.on('speech_recognized', (result) => {
                    this.handleSpeechRecognized(result);
                });
                
                this.sttIntegration.on('error', (error) => {
                    this.handleSTTError(error);
                });
                
                const initialized = await this.sttIntegration.initialize();
                if (initialized) {
                    logger.info('✅ STT integration initialized');
                } else {
                    logger.warn('⚠️ STT integration failed to initialize');
                }
            } else {
                logger.warn('⚠️ OpenAI STT integration not available');
            }

            // Connect to microphone hardware service
            await this.connectToMicrophoneService();

            this.isInitialized = true;
            logger.info('✅ Microphone-STT Integration Service initialized');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Microphone-STT Integration Service:', error);
            return false;
        }
    }

    /**
     * Connect to the microphone hardware service
     */
    async connectToMicrophoneService() {
        try {
            // Connect to microphone WebSocket service
            const microphoneWS = new WebSocket('ws://localhost:8776');
            
            microphoneWS.on('open', () => {
                logger.info('🎤 Connected to Microphone WebSocket Service');
                
                // Send initialization message
                microphoneWS.send(JSON.stringify({
                    type: 'register_stt_client',
                    client_id: 'stt_integration_service'
                }));
            });

            microphoneWS.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMicrophoneMessage(message);
                } catch (error) {
                    logger.error('Error parsing microphone message:', error);
                }
            });

            microphoneWS.on('error', (error) => {
                logger.error('Microphone WebSocket error:', error);
            });

            microphoneWS.on('close', () => {
                logger.warn('🎤 Disconnected from Microphone WebSocket Service');
                // Attempt to reconnect after delay
                setTimeout(() => this.connectToMicrophoneService(), 5000);
            });

            this.microphoneWS = microphoneWS;

        } catch (error) {
            logger.error('Failed to connect to microphone service:', error);
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
                    
                case 'microphones_discovered':
                    this.handleMicrophonesDiscovered(message);
                    break;
                    
                default:
                    logger.debug('Unknown microphone message type:', message.type);
            }
        } catch (error) {
            logger.error('Error handling microphone message:', error);
        }
    }

    /**
     * Process audio data from microphone
     */
    async processAudioData(message) {
        try {
            if (!this.sttIntegration) {
                return; // STT not available
            }

            const { microphone_id, audio_data, timestamp } = message;
            
            // Get character associated with this microphone
            const character = await this.getCharacterByMicrophoneId(microphone_id);
            if (!character) {
                return; // No character associated
            }

            // Convert audio data to buffer format expected by STT
            const audioBuffer = Buffer.from(audio_data);
            
            // Send audio to STT integration
            await this.sttIntegration.processAudioChunk(audioBuffer, {
                characterId: character.id,
                microphoneId: microphone_id,
                timestamp: timestamp
            });

        } catch (error) {
            logger.error('Error processing audio data:', error);
        }
    }

    /**
     * Handle speech recognition results
     */
    handleSpeechRecognized(result) {
        try {
            logger.info(`🗣️ Speech recognized: "${result.text}"`);
            
            // Emit speech recognition event with character context
            this.emit('speech_recognized', {
                ...result,
                characterId: result.metadata?.characterId,
                microphoneId: result.metadata?.microphoneId
            });

            // Broadcast to connected clients
            this.broadcastSTTResult(result);

        } catch (error) {
            logger.error('Error handling speech recognition:', error);
        }
    }

    /**
     * Handle STT errors
     */
    handleSTTError(error) {
        logger.error('STT Error:', error);
        this.emit('stt_error', error);
    }

    /**
     * Handle microphone status updates
     */
    handleMicrophoneStatusUpdate(message) {
        logger.debug('Microphone status update:', message);
        this.emit('microphone_status_update', message);
    }

    /**
     * Handle discovered microphones
     */
    handleMicrophonesDiscovered(message) {
        logger.info(`🎤 Discovered ${message.microphones.length} microphones`);
        this.emit('microphones_discovered', message.microphones);
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
     * Start STT for a specific character
     */
    async startSTTForCharacter(characterId) {
        try {
            // Get microphone assigned to character
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                throw new Error(`No microphone assigned to character ${characterId}`);
            }

            // Start microphone recording via WebSocket
            if (this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN) {
                this.microphoneWS.send(JSON.stringify({
                    type: 'start_microphone',
                    microphone_id: `microphone_${microphone.id}`,
                    config: microphone.config
                }));
                
                logger.info(`🎤 Started STT for character ${characterId} with microphone ${microphone.id}`);
                return true;
            } else {
                throw new Error('Microphone service not connected');
            }

        } catch (error) {
            logger.error(`Error starting STT for character ${characterId}:`, error);
            return false;
        }
    }

    /**
     * Stop STT for a specific character
     */
    async stopSTTForCharacter(characterId) {
        try {
            // Get microphone assigned to character
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                throw new Error(`No microphone assigned to character ${characterId}`);
            }

            // Stop microphone recording via WebSocket
            if (this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN) {
                this.microphoneWS.send(JSON.stringify({
                    type: 'stop_microphone',
                    microphone_id: `microphone_${microphone.id}`
                }));
                
                logger.info(`🎤 Stopped STT for character ${characterId}`);
                return true;
            } else {
                throw new Error('Microphone service not connected');
            }

        } catch (error) {
            logger.error(`Error stopping STT for character ${characterId}:`, error);
            return false;
        }
    }

    /**
     * Broadcast STT result to connected clients
     */
    broadcastSTTResult(result) {
        // This would broadcast to WebSocket clients or other services
        // Implementation depends on your specific architecture
        logger.debug('Broadcasting STT result:', result);
    }

    /**
     * Get STT status
     */
    getSTTStatus() {
        return {
            initialized: this.isInitialized,
            sttAvailable: !!this.sttIntegration,
            microphoneServiceConnected: this.microphoneWS && this.microphoneWS.readyState === WebSocket.OPEN,
            activeConnections: this.microphoneConnections.size,
            config: this.sttConfig
        };
    }

    /**
     * Update STT configuration
     */
    updateSTTConfig(newConfig) {
        this.sttConfig = { ...this.sttConfig, ...newConfig };
        
        if (this.sttIntegration) {
            // Update STT integration config
            Object.assign(this.sttIntegration.config, newConfig);
        }
        
        logger.info('STT configuration updated:', this.sttConfig);
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        try {
            logger.info('🛑 Shutting down Microphone-STT Integration Service...');

            // Close microphone WebSocket connection
            if (this.microphoneWS) {
                this.microphoneWS.close();
                this.microphoneWS = null;
            }

            // Cleanup STT integration
            if (this.sttIntegration) {
                // STT integration cleanup if available
                this.sttIntegration = null;
            }

            this.isInitialized = false;
            logger.info('✅ Microphone-STT Integration Service shutdown complete');

        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
    }
}

module.exports = MicrophoneSTTIntegrationService;
