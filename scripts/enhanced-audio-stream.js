/**
 * Enhanced Audio Stream Handler for MonsterBox
 * Handles real-time microphone input with simultaneous STT and jaw animation
 * Integrates with the ChatterPi system for comprehensive audio processing
 */

const WebSocket = require('ws');
const logger = require('./logger');
const { spawn } = require('child_process');
const path = require('path');

class EnhancedAudioStream {
    constructor() {
        this.wss = null;
        this.clients = new Set();
        this.micLockedBy = null;
        this.chatterPiProcess = null;
        this.isChatterPiRunning = false;
        this.audioBuffer = [];
        this.processingQueue = [];
        this.sttClients = new Set();
        this.jawAnimationClients = new Set();
    }

    startStream(server) {
        this.wss = new WebSocket.Server({ server, path: '/enhanced-audiostream' });
        
        // ChatterPi audio bridge disabled - now using ElevenLabs Conversational AI
        // this.startChatterPiAudioBridge();

        this.wss.on('connection', (ws) => {
            logger.info('New enhanced audio stream connection');
            this.clients.add(ws);

            // Send welcome message with capabilities
            ws.send(JSON.stringify({
                type: 'welcome',
                capabilities: {
                    stt: true,
                    jawAnimation: true,
                    realTimeProcessing: true,
                    multipleClients: true
                },
                timestamp: Date.now()
            }));

            ws.on('message', async (message) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    await this.handleMessage(ws, parsedMessage);
                } catch (error) {
                    logger.error('Error parsing WebSocket message:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });

            ws.on('close', () => {
                logger.info('Enhanced audio stream connection closed');
                this.clients.delete(ws);
                this.sttClients.delete(ws);
                this.jawAnimationClients.delete(ws);
                
                if (this.micLockedBy === ws) {
                    this.micLockedBy = null;
                    this.broadcastMicrophoneStatus(false);
                    logger.info('Microphone lock released due to client disconnection');
                }
            });

            ws.on('error', (error) => {
                logger.error('Enhanced audio stream WebSocket error:', error);
                this.clients.delete(ws);
                this.sttClients.delete(ws);
                this.jawAnimationClients.delete(ws);
                
                if (this.micLockedBy === ws) {
                    this.micLockedBy = null;
                    this.broadcastMicrophoneStatus(false);
                }
            });
        });

        logger.info('Enhanced Audio Stream WebSocket server started on /enhanced-audiostream');
    }

    async handleMessage(ws, message) {
        switch (message.type) {
            case 'requestMic':
                this.handleMicrophoneRequest(ws, message);
                break;
            case 'releaseMic':
                this.handleMicrophoneRelease(ws, message);
                break;
            case 'audioData':
                await this.handleAudioData(ws, message);
                break;
            case 'subscribeSTT':
                this.handleSTTSubscription(ws, message);
                break;
            case 'subscribeJawAnimation':
                this.handleJawAnimationSubscription(ws, message);
                break;
            case 'configureAudio':
                this.handleAudioConfiguration(ws, message);
                break;
            case 'getStatus':
                this.handleStatusRequest(ws, message);
                break;
            default:
                logger.warn(`Unknown message type: ${message.type}`);
                this.sendError(ws, `Unknown message type: ${message.type}`);
        }
    }

    handleMicrophoneRequest(ws, message) {
        if (this.micLockedBy && this.micLockedBy !== ws) {
            ws.send(JSON.stringify({
                type: 'micRequestDenied',
                reason: 'Microphone is already in use by another client',
                timestamp: Date.now()
            }));
            return;
        }

        this.micLockedBy = ws;
        ws.send(JSON.stringify({
            type: 'micRequestGranted',
            clientId: message.clientId || 'unknown',
            timestamp: Date.now()
        }));

        this.broadcastMicrophoneStatus(true, ws);
        logger.info('Microphone lock granted to client');
    }

    handleMicrophoneRelease(ws, message) {
        if (this.micLockedBy === ws) {
            this.micLockedBy = null;
            ws.send(JSON.stringify({
                type: 'micReleased',
                timestamp: Date.now()
            }));
            this.broadcastMicrophoneStatus(false);
            logger.info('Microphone lock released by client');
        }
    }

    async handleAudioData(ws, message) {
        if (this.micLockedBy !== ws) {
            return; // Ignore audio data from non-locked clients
        }

        try {
            const audioData = {
                data: message.data,
                sampleRate: message.sampleRate || 16000,
                format: message.format || 'webm',
                timestamp: message.timestamp || Date.now(),
                characterId: message.characterId,
                metadata: message.metadata || {}
            };

            // Add to processing queue
            this.processingQueue.push(audioData);

            // Process audio for STT
            await this.processAudioForSTT(audioData);

            // Process audio for jaw animation
            await this.processAudioForJawAnimation(audioData);

            // Send acknowledgment
            ws.send(JSON.stringify({
                type: 'audioDataAck',
                timestamp: Date.now(),
                queueSize: this.processingQueue.length
            }));

        } catch (error) {
            logger.error('Error handling audio data:', error);
            this.sendError(ws, 'Audio processing error');
        }
    }

    async processAudioForSTT(audioData) {
        if (this.sttClients.size === 0) return;

        try {
            // Forward to STT processing
            const sttMessage = {
                type: 'stt_audio_data',
                data: audioData.data,
                sampleRate: audioData.sampleRate,
                format: audioData.format,
                timestamp: audioData.timestamp,
                characterId: audioData.characterId
            };

            // Broadcast to STT subscribers
            this.sttClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(sttMessage));
                }
            });

            // Also send to ChatterPi bridge if running
            if (this.isChatterPiRunning && this.chatterPiProcess) {
                // Send audio data to ChatterPi for STT processing
                this.sendToChatterPi({
                    type: 'audio_data',
                    data: audioData.data,
                    sample_rate: audioData.sampleRate,
                    format: audioData.format,
                    metadata: audioData.metadata
                });
            }

        } catch (error) {
            logger.error('Error processing audio for STT:', error);
        }
    }

    async processAudioForJawAnimation(audioData) {
        if (this.jawAnimationClients.size === 0) return;

        try {
            // Forward to jaw animation processing
            const jawMessage = {
                type: 'jaw_audio_data',
                data: audioData.data,
                sampleRate: audioData.sampleRate,
                timestamp: audioData.timestamp,
                characterId: audioData.characterId
            };

            // Broadcast to jaw animation subscribers
            this.jawAnimationClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(jawMessage));
                }
            });

            // Also send to ChatterPi bridge for jaw animation
            if (this.isChatterPiRunning && this.chatterPiProcess) {
                this.sendToChatterPi({
                    type: 'audio_stream',
                    data: audioData.data,
                    sample_rate: audioData.sampleRate,
                    character_id: audioData.characterId,
                    timestamp: audioData.timestamp
                });
            }

        } catch (error) {
            logger.error('Error processing audio for jaw animation:', error);
        }
    }

    handleSTTSubscription(ws, message) {
        this.sttClients.add(ws);
        ws.send(JSON.stringify({
            type: 'sttSubscribed',
            timestamp: Date.now()
        }));
        logger.info('Client subscribed to STT updates');
    }

    handleJawAnimationSubscription(ws, message) {
        this.jawAnimationClients.add(ws);
        ws.send(JSON.stringify({
            type: 'jawAnimationSubscribed',
            timestamp: Date.now()
        }));
        logger.info('Client subscribed to jaw animation updates');
    }

    handleAudioConfiguration(ws, message) {
        // Handle audio configuration updates
        const config = message.config || {};
        
        ws.send(JSON.stringify({
            type: 'audioConfigured',
            config: config,
            timestamp: Date.now()
        }));
        
        logger.info('Audio configuration updated:', config);
    }

    handleStatusRequest(ws, message) {
        const status = {
            type: 'status',
            microphoneLocked: !!this.micLockedBy,
            connectedClients: this.clients.size,
            sttSubscribers: this.sttClients.size,
            jawAnimationSubscribers: this.jawAnimationClients.size,
            chatterPiRunning: this.isChatterPiRunning,
            queueSize: this.processingQueue.length,
            timestamp: Date.now()
        };

        ws.send(JSON.stringify(status));
    }

    broadcastMicrophoneStatus(locked, excludeClient = null) {
        const message = JSON.stringify({
            type: 'microphoneStatus',
            locked: locked,
            timestamp: Date.now()
        });

        this.clients.forEach(client => {
            if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    sendError(ws, message) {
        ws.send(JSON.stringify({
            type: 'error',
            message: message,
            timestamp: Date.now()
        }));
    }

    startChatterPiAudioBridge() {
        try {
            const bridgePath = path.join(__dirname, 'chatterpi', 'chatterpi_audio_bridge.py');
            
            this.chatterPiProcess = spawn('python3', [bridgePath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(bridgePath)
            });

            this.chatterPiProcess.stdout.on('data', (data) => {
                logger.debug(`ChatterPi Bridge: ${data.toString()}`);
            });

            this.chatterPiProcess.stderr.on('data', (data) => {
                logger.debug(`ChatterPi Bridge Error: ${data.toString()}`);
            });

            this.chatterPiProcess.on('close', (code) => {
                logger.info(`ChatterPi Bridge process exited with code ${code}`);
                this.isChatterPiRunning = false;
            });

            this.isChatterPiRunning = true;
            logger.info('ChatterPi Audio Bridge started');

        } catch (error) {
            logger.error('Failed to start ChatterPi Audio Bridge:', error);
            this.isChatterPiRunning = false;
        }
    }

    sendToChatterPi(data) {
        if (this.chatterPiProcess && this.chatterPiProcess.stdin) {
            try {
                this.chatterPiProcess.stdin.write(JSON.stringify(data) + '\n');
            } catch (error) {
                logger.error('Error sending data to ChatterPi:', error);
            }
        }
    }

    // Cleanup method
    cleanup() {
        if (this.chatterPiProcess) {
            this.chatterPiProcess.kill();
        }
        
        this.clients.clear();
        this.sttClients.clear();
        this.jawAnimationClients.clear();
        this.processingQueue = [];
        
        logger.info('Enhanced Audio Stream cleaned up');
    }
}

module.exports = new EnhancedAudioStream();
