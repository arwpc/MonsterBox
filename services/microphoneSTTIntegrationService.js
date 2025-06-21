const EventEmitter = require('events');
const logger = require('../scripts/logger');
const CharacterMicrophoneService = require('./characterMicrophoneService');
const MicrophoneManagerService = require('./microphoneManagerService');

// Import OpenAI STT integration
let OpenAISTTIntegration;
try {
    OpenAISTTIntegration = require('../scripts/chatterpi/openai_stt_integration');
} catch (error) {
    logger.warn('OpenAI STT integration not available:', error.message);
}

class MicrophoneSTTIntegrationService extends EventEmitter {
    constructor(sharedMicrophoneManager = null) {
        super();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        this.microphoneManager = sharedMicrophoneManager || new MicrophoneManagerService();
        this.sttIntegration = null;
        this.activeCharacterSessions = new Map(); // characterId -> microphoneId
        this.isInitialized = false;

        // STT configuration
        this.sttConfig = {
            language: 'en',
            confidenceThreshold: 0.7,
            chunkDuration: 2000,
            fallbackToSystem: true,
            realTimeProcessing: true
        };

        // Consumer ID for microphone manager
        this.consumerId = 'stt_integration_service';
    }

    /**
     * Initialize the microphone-STT integration service
     */
    async initialize() {
        try {
            logger.info('🎤🗣️ Initializing Microphone-STT Integration Service...');

            // Initialize microphone manager if not already initialized
            if (!this.microphoneManager.isInitialized) {
                const managerInitialized = await this.microphoneManager.initialize();
                if (!managerInitialized) {
                    throw new Error('Failed to initialize microphone manager');
                }
            }

            // Register as consumer with microphone manager
            const consumerRegistered = this.microphoneManager.registerConsumer(this.consumerId, {
                type: 'stt',
                description: 'Speech-to-Text Integration Service',
                priority: 'high',
                audioFormat: 'pcm',
                sampleRate: 16000,
                channels: 1
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

            this.isInitialized = true;
            logger.info('✅ Microphone-STT Integration Service initialized');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Microphone-STT Integration Service:', error);
            return false;
        }
    }

    /**
     * Handle microphone status updates from manager
     */
    handleMicrophoneStatusUpdate(data) {
        logger.debug('Microphone status update:', data);
        this.emit('microphone_status_update', data);
    }

    /**
     * Process audio data from microphone manager
     */
    async processAudioData(data) {
        try {
            if (!this.sttIntegration) {
                return; // STT not available
            }

            const { microphoneId, audioData, timestamp, metadata } = data;

            // Get character associated with this microphone
            const character = await this.getCharacterByMicrophoneId(microphoneId);
            if (!character) {
                return; // No character associated
            }

            // Convert audio data to buffer format expected by STT
            const audioBuffer = Buffer.from(audioData);

            // Send audio to STT integration
            await this.sttIntegration.processAudioChunk(audioBuffer, {
                characterId: character.id,
                microphoneId: microphoneId,
                timestamp: timestamp,
                metadata: metadata
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
     * Get character associated with microphone ID
     */
    async getCharacterByMicrophoneId(microphoneId) {
        try {
            // microphoneId is already numeric from the manager
            return await this.characterMicrophoneService.getCharacterByMicrophone(microphoneId);
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

            // Start microphone session via manager
            const sessionStarted = await this.microphoneManager.startMicrophoneSession(
                this.consumerId,
                microphone.id,
                {
                    ...microphone.config,
                    characterId: characterId,
                    purpose: 'stt'
                }
            );

            if (sessionStarted) {
                this.activeCharacterSessions.set(characterId, microphone.id);
                logger.info(`🎤🗣️ Started STT for character ${characterId} with microphone ${microphone.id}`);
                return true;
            } else {
                throw new Error('Failed to start microphone session');
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
            const microphoneId = this.activeCharacterSessions.get(characterId);
            if (!microphoneId) {
                logger.warn(`No active STT session for character ${characterId}`);
                return true; // Already stopped
            }

            // Stop microphone session via manager
            const sessionStopped = await this.microphoneManager.stopMicrophoneSession(
                this.consumerId,
                microphoneId
            );

            if (sessionStopped) {
                this.activeCharacterSessions.delete(characterId);
                logger.info(`🎤🛑 Stopped STT for character ${characterId}`);
                return true;
            } else {
                throw new Error('Failed to stop microphone session');
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
            microphoneManagerConnected: this.microphoneManager.getStatus().hardwareConnected,
            activeCharacterSessions: this.activeCharacterSessions.size,
            activeSessions: Object.fromEntries(this.activeCharacterSessions),
            config: this.sttConfig,
            managerStatus: this.microphoneManager.getStatus()
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

            // Stop all active character sessions
            for (const [characterId, microphoneId] of this.activeCharacterSessions) {
                await this.stopSTTForCharacter(characterId);
            }

            // Unregister from microphone manager
            this.microphoneManager.unregisterConsumer(this.consumerId);

            // Shutdown microphone manager
            await this.microphoneManager.shutdown();

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
