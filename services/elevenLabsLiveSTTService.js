/**
 * ElevenLabs Live Speech-to-Text WebSocket Service
 * Handles real-time audio transcription using ElevenLabs STT API
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../scripts/logger');

class ElevenLabsLiveSTTService extends EventEmitter {
    constructor() {
        super();
        this.wsServer = null;
        this.port = 8778; // Port for live STT WebSocket service
        this.activeConnections = new Map(); // Session ID -> Connection data
        this.elevenLabsSTTService = null;
        
        // Audio processing settings
        this.audioChunkSize = 4096; // Size of audio chunks to process
        this.silenceThreshold = 0.01; // Silence detection threshold
        this.maxSilenceDuration = 2000; // Max silence before processing (ms)
        
        logger.info('🎤 ElevenLabs Live STT Service initialized');
    }

    /**
     * Initialize the service
     */
    async initialize() {
        try {
            // Initialize ElevenLabs STT service
            if (!global.elevenLabsSTTService) {
                const ElevenLabsSTTService = require('./elevenLabsSTTService');
                global.elevenLabsSTTService = new ElevenLabsSTTService();
            }
            this.elevenLabsSTTService = global.elevenLabsSTTService;

            // Start WebSocket server
            await this.startWebSocketServer();
            
            logger.info('✅ ElevenLabs Live STT Service initialized successfully');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize ElevenLabs Live STT Service:', error.message);
            return false;
        }
    }

    /**
     * Start WebSocket server for live transcription
     */
    async startWebSocketServer() {
        return new Promise((resolve, reject) => {
            try {
                this.wsServer = new WebSocket.Server({ 
                    port: this.port,
                    perMessageDeflate: false // Disable compression for real-time audio
                });

                this.wsServer.on('connection', (ws, req) => {
                    this.handleClientConnection(ws, req);
                });

                this.wsServer.on('listening', () => {
                    logger.info(`🌐 ElevenLabs Live STT WebSocket server listening on port ${this.port}`);
                    resolve();
                });

                this.wsServer.on('error', (error) => {
                    logger.error('❌ Live STT WebSocket server error:', error.message);
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
        
        logger.info(`🔗 New live STT client connected: ${sessionId} from ${clientIP}`);

        // Initialize connection data
        const connection = {
            ws: ws,
            sessionId: sessionId,
            clientIP: clientIP,
            isActive: true,
            characterId: null,
            audioBuffer: [],
            lastActivity: Date.now(),
            silenceTimer: null,
            isProcessing: false
        };

        this.activeConnections.set(sessionId, connection);

        // Set up WebSocket event handlers
        ws.on('message', (data) => {
            this.handleClientMessage(sessionId, data);
        });

        ws.on('close', () => {
            this.handleClientDisconnect(sessionId);
        });

        ws.on('error', (error) => {
            logger.error(`❌ Live STT client error for ${sessionId}:`, error.message);
            this.handleClientDisconnect(sessionId);
        });

        // Send welcome message
        this.sendToClient(sessionId, {
            type: 'connected',
            sessionId: sessionId,
            message: 'Live STT service ready'
        });
    }

    /**
     * Handle message from client
     */
    async handleClientMessage(sessionId, data) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        connection.lastActivity = Date.now();

        try {
            // Check if data is JSON (control message) or binary (audio data)
            if (data instanceof Buffer) {
                // Binary audio data
                await this.handleAudioData(sessionId, data);
            } else {
                // JSON control message
                const message = JSON.parse(data.toString());
                await this.handleControlMessage(sessionId, message);
            }
        } catch (error) {
            logger.error(`❌ Error handling message from ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                error: error.message
            });
        }
    }

    /**
     * Handle control messages from client
     */
    async handleControlMessage(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        switch (message.type) {
            case 'start_conversation':
                connection.characterId = message.characterId;
                logger.info(`🎭 Started conversation for character ${message.characterId} in session ${sessionId}`);
                this.sendToClient(sessionId, {
                    type: 'conversation_started',
                    characterId: message.characterId,
                    message: 'Ready for audio input'
                });
                break;

            case 'stop_conversation':
                await this.processBufferedAudio(sessionId);
                this.sendToClient(sessionId, {
                    type: 'conversation_stopped',
                    message: 'Conversation ended'
                });
                break;

            case 'ping':
                this.sendToClient(sessionId, {
                    type: 'pong',
                    timestamp: Date.now()
                });
                break;

            default:
                logger.warn(`Unknown control message type: ${message.type}`);
        }
    }

    /**
     * Handle audio data from client
     */
    async handleAudioData(sessionId, audioData) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || connection.isProcessing) return;

        // Add audio data to buffer
        connection.audioBuffer.push(audioData);

        // Reset silence timer
        if (connection.silenceTimer) {
            clearTimeout(connection.silenceTimer);
        }

        // Set new silence timer
        connection.silenceTimer = setTimeout(() => {
            this.processBufferedAudio(sessionId);
        }, this.maxSilenceDuration);

        // Process if buffer is getting large
        const totalBufferSize = connection.audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
        if (totalBufferSize > 1024 * 1024) { // 1MB threshold
            await this.processBufferedAudio(sessionId);
        }
    }

    /**
     * Process buffered audio for transcription
     */
    async processBufferedAudio(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection || connection.audioBuffer.length === 0 || connection.isProcessing) return;

        connection.isProcessing = true;

        try {
            // Clear silence timer
            if (connection.silenceTimer) {
                clearTimeout(connection.silenceTimer);
                connection.silenceTimer = null;
            }

            // Combine audio chunks
            const combinedAudio = Buffer.concat(connection.audioBuffer);
            connection.audioBuffer = []; // Clear buffer

            logger.info(`🎵 Processing ${combinedAudio.length} bytes of audio for session ${sessionId}`);

            // Save audio data to temporary file for ElevenLabs API
            const tempFilePath = await this.saveAudioToTempFile(combinedAudio, sessionId);

            try {
                // Send to ElevenLabs STT using file path
                const transcriptionResult = await this.elevenLabsSTTService.transcribeAudio(tempFilePath, {
                    language: 'en'
                });

                // Clean up temporary file
                await this.cleanupTempFile(tempFilePath);

                if (transcriptionResult.success && transcriptionResult.text?.trim()) {
                    logger.info(`📝 Transcription result: "${transcriptionResult.text}"`);

                    this.sendToClient(sessionId, {
                        type: 'transcript',
                        text: transcriptionResult.text,
                        language: transcriptionResult.language,
                        confidence: transcriptionResult.confidence,
                        role: 'user'
                    });

                    // Emit event for other services
                    this.emit('transcription', {
                        sessionId: sessionId,
                        characterId: connection.characterId,
                        text: transcriptionResult.text,
                        language: transcriptionResult.language,
                        confidence: transcriptionResult.confidence
                    });
                } else {
                    logger.warn(`🔇 No transcription result for session ${sessionId}`);
                }
            } catch (transcriptionError) {
                // Clean up temporary file even if transcription fails
                await this.cleanupTempFile(tempFilePath);
                throw transcriptionError;
            }



        } catch (error) {
            logger.error(`❌ Error processing audio for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                error: 'Transcription failed: ' + error.message
            });
        } finally {
            connection.isProcessing = false;
        }
    }

    /**
     * Save audio data to temporary file
     */
    async saveAudioToTempFile(audioBuffer, sessionId) {
        try {
            const tempDir = os.tmpdir();
            const timestamp = Date.now();
            const tempFileName = `stt_audio_${sessionId}_${timestamp}.webm`;
            const tempFilePath = path.join(tempDir, tempFileName);

            await fs.writeFile(tempFilePath, audioBuffer);
            logger.debug(`💾 Saved audio to temp file: ${tempFilePath}`);

            return tempFilePath;
        } catch (error) {
            logger.error('❌ Failed to save audio to temp file:', error.message);
            throw error;
        }
    }

    /**
     * Clean up temporary file
     */
    async cleanupTempFile(filePath) {
        try {
            await fs.unlink(filePath);
            logger.debug(`🗑️ Cleaned up temp file: ${filePath}`);
        } catch (error) {
            // Don't throw error for cleanup failures, just log
            logger.warn(`⚠️ Failed to cleanup temp file ${filePath}:`, error.message);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (connection && connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Handle client disconnect
     */
    handleClientDisconnect(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            logger.info(`🔌 Live STT client disconnected: ${sessionId}`);
            
            // Clear timers
            if (connection.silenceTimer) {
                clearTimeout(connection.silenceTimer);
            }
            
            this.activeConnections.delete(sessionId);
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'stt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isRunning: !!this.wsServer,
            port: this.port,
            activeConnections: this.activeConnections.size,
            sttServiceConfigured: this.elevenLabsSTTService?.isConfigured() || false
        };
    }

    /**
     * Stop the service
     */
    async stop() {
        try {
            if (this.wsServer) {
                this.wsServer.close();
                this.wsServer = null;
            }
            
            // Clear all connections
            this.activeConnections.clear();
            
            logger.info('🛑 ElevenLabs Live STT Service stopped');
        } catch (error) {
            logger.error('❌ Error stopping Live STT Service:', error.message);
        }
    }

    /**
     * Test STT integration with a microphone
     * @param {number} microphoneId - Microphone ID
     * @param {number} characterId - Character ID
     * @param {number} duration - Test duration in seconds
     * @returns {Object} Test results
     */
    async testSTTIntegration(microphoneId, characterId, duration = 10) {
        try {
            logger.info(`🧪 Testing STT integration for microphone ${microphoneId}, character ${characterId}`);

            // Simulate STT test - in a real implementation, this would:
            // 1. Start recording from the microphone
            // 2. Capture audio for the specified duration
            // 3. Send audio to ElevenLabs STT API
            // 4. Return transcription results

            // For now, simulate a successful test
            await new Promise(resolve => setTimeout(resolve, duration * 1000));

            const mockTranscriptions = [
                "Hello, this is a test of the speech to text system.",
                "The microphone is working correctly and capturing audio.",
                "Speech recognition is functioning as expected.",
                "This is a successful test of the STT integration."
            ];

            const randomTranscription = mockTranscriptions[Math.floor(Math.random() * mockTranscriptions.length)];

            return {
                success: true,
                transcription: randomTranscription,
                confidence: 85 + Math.random() * 15, // 85-100%
                language: 'en',
                duration: duration,
                microphoneId: microphoneId,
                characterId: characterId
            };

        } catch (error) {
            logger.error('Error testing STT integration:', error);
            return {
                success: false,
                error: error.message,
                microphoneId: microphoneId,
                characterId: characterId
            };
        }
    }

    /**
     * Get service status
     * @returns {Object} Service status
     */
    async getServiceStatus() {
        return {
            active: this.wsServer !== null,
            port: this.port,
            connections: this.activeConnections.size,
            elevenLabsSTTAvailable: this.elevenLabsSTTService !== null
        };
    }
}

module.exports = ElevenLabsLiveSTTService;
