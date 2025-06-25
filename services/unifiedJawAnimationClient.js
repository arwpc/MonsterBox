/**
 * Unified Jaw Animation Client
 * Connects to the unified jaw animation service and provides audio-driven animation
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

class UnifiedJawAnimationClient extends EventEmitter {
    constructor(url = 'ws://localhost:8765') {
        super();
        this.url = url;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.animationActive = false;
        
        // Audio processing state
        this.audioBuffer = [];
        this.processingAudio = false;
        
        // Statistics
        this.stats = {
            messagesReceived: 0,
            audioFramesSent: 0,
            servoUpdates: 0,
            connectionTime: null
        };
    }
    
    /**
     * Connect to the unified jaw animation service
     */
    async connect() {
        if (this.isConnected) {
            return true;
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                
                this.ws.on('open', () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.stats.connectionTime = new Date();
                    logger.info('🦴 Connected to Unified Jaw Animation Service');
                    this.emit('connected');
                    resolve(true);
                });
                
                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                        this.stats.messagesReceived++;
                    } catch (error) {
                        logger.error('Error parsing jaw animation message:', error);
                    }
                });
                
                this.ws.on('close', () => {
                    this.isConnected = false;
                    this.emit('disconnected');
                    logger.warn('🦴 Disconnected from Jaw Animation Service');
                    
                    // Auto-reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        setTimeout(() => this.reconnect(), this.reconnectDelay);
                    }
                });
                
                this.ws.on('error', (error) => {
                    logger.error('Jaw Animation WebSocket error:', error);
                    this.emit('error', error);
                    reject(error);
                });
                
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Reconnect to the service
     */
    async reconnect() {
        this.reconnectAttempts++;
        logger.info(`🦴 Attempting to reconnect to Jaw Animation Service (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        try {
            await this.connect();
        } catch (error) {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => this.reconnect(), this.reconnectDelay * this.reconnectAttempts);
            } else {
                logger.error('🦴 Max reconnection attempts reached for Jaw Animation Service');
                this.emit('maxReconnectAttemptsReached');
            }
        }
    }
    
    /**
     * Handle incoming messages from the service
     */
    handleMessage(message) {
        const { type, ...data } = message;
        
        switch (type) {
            case 'jaw_move_response':
                this.emit('jawMoved', data);
                if (data.success) {
                    this.stats.servoUpdates++;
                }
                break;
                
            case 'audio_processed':
                this.emit('audioProcessed', data);
                break;
                
            case 'animation_started':
                this.animationActive = true;
                this.emit('animationStarted', data);
                break;
                
            case 'animation_stopped':
                this.animationActive = false;
                this.emit('animationStopped', data);
                break;
                
            case 'status':
                this.emit('status', data);
                break;
                
            case 'error':
                logger.error('Jaw Animation Service error:', data.message);
                this.emit('serviceError', data);
                break;
                
            default:
                logger.warn('Unknown message type from Jaw Animation Service:', type);
        }
    }
    
    /**
     * Send a message to the service
     */
    sendMessage(type, data = {}) {
        if (!this.isConnected || !this.ws) {
            logger.warn('Cannot send message - not connected to Jaw Animation Service');
            return false;
        }
        
        try {
            const message = { type, ...data };
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            logger.error('Error sending message to Jaw Animation Service:', error);
            return false;
        }
    }
    
    /**
     * Move jaw to specific angle
     */
    moveJawToAngle(angle, duration = 1.0) {
        return this.sendMessage('jaw_move', { angle, duration });
    }
    
    /**
     * Start jaw animation
     */
    startAnimation() {
        const success = this.sendMessage('start_animation');
        if (success) {
            this.animationActive = true;
        }
        return success;
    }
    
    /**
     * Stop jaw animation
     */
    stopAnimation() {
        const success = this.sendMessage('stop_animation');
        if (success) {
            this.animationActive = false;
        }
        return success;
    }
    
    /**
     * Send audio data for processing
     */
    sendAudioData(audioData) {
        if (!this.animationActive) {
            return false;
        }
        
        // Convert audio data to base64 if it's a buffer
        let audioDataToSend = audioData;
        if (Buffer.isBuffer(audioData)) {
            audioDataToSend = audioData.toString('base64');
        }
        
        const success = this.sendMessage('audio_data', { data: audioDataToSend });
        if (success) {
            this.stats.audioFramesSent++;
        }
        return success;
    }
    
    /**
     * Process TTS audio for jaw animation
     */
    async processTTSAudio(audioBuffer, metadata = {}) {
        if (!this.isConnected) {
            logger.warn('Cannot process TTS audio - not connected to Jaw Animation Service');
            return false;
        }
        
        try {
            // Start animation if not already active
            if (!this.animationActive) {
                this.startAnimation();
            }
            
            // Send audio data in chunks for real-time processing
            const chunkSize = 4096; // Process in 4KB chunks
            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
                const chunk = audioBuffer.slice(i, i + chunkSize);
                this.sendAudioData(chunk);
                
                // Small delay to prevent overwhelming the service
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Stop animation after a delay to allow jaw to close
            setTimeout(() => {
                this.stopAnimation();
            }, 1000);
            
            return true;
        } catch (error) {
            logger.error('Error processing TTS audio:', error);
            return false;
        }
    }
    
    /**
     * Get service status
     */
    getStatus() {
        return this.sendMessage('get_status');
    }
    
    /**
     * Get client statistics
     */
    getStats() {
        return {
            ...this.stats,
            isConnected: this.isConnected,
            animationActive: this.animationActive,
            reconnectAttempts: this.reconnectAttempts
        };
    }
    
    /**
     * Disconnect from the service
     */
    disconnect() {
        if (this.ws) {
            this.isConnected = false;
            this.ws.close();
            this.ws = null;
        }
        this.emit('disconnected');
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.disconnect();
        this.removeAllListeners();
    }
}

// Singleton instance
let jawAnimationClient = null;

/**
 * Get the singleton jaw animation client
 */
function getJawAnimationClient() {
    if (!jawAnimationClient) {
        jawAnimationClient = new UnifiedJawAnimationClient();
    }
    return jawAnimationClient;
}

module.exports = {
    UnifiedJawAnimationClient,
    getJawAnimationClient
};
