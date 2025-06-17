#!/usr/bin/env node

/**
 * TopMediai Speech-to-Text Integration for ChatterPi
 * 
 * Integrates TopMediai STT with ChatterPi's audio streaming infrastructure
 * for real-time speech recognition and voice-driven AI interactions.
 */

require('dotenv').config();
const EventEmitter = require('events');
const TopMediaiAPI = require('../topMediaiAPI');
const logger = require('../logger');

class TopMediaiSTTIntegration extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            // TopMediai API configuration
            topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
            
            // STT configuration
            language: 'en',
            model: 'general',
            fallbackToSystem: true,
            
            // Audio processing configuration
            sampleRate: 16000,
            channels: 1,
            format: 'wav',
            
            // Real-time processing
            chunkDuration: 2000, // 2 seconds
            silenceTimeout: 1500, // 1.5 seconds
            confidenceThreshold: 0.7,
            
            // Performance settings
            maxConcurrentRequests: 2,
            requestTimeout: 30000,
            
            ...options
        };

        this.topMediaiAPI = new TopMediaiAPI();
        this.isInitialized = false;
        this.isProcessing = false;
        this.activeRequests = 0;
        
        // Audio buffer management
        this.audioBuffer = [];
        this.bufferStartTime = null;
        this.lastSpeechTime = null;
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageConfidence: 0,
            averageResponseTime: 0
        };

        logger.info('TopMediai STT Integration initialized');
    }

    /**
     * Initialize the STT integration
     */
    async initialize() {
        try {
            if (!this.config.topmediaiApiKey) {
                logger.warn('TopMediai API key not configured - STT will use fallback only');
                return false;
            }

            // Test API connectivity
            try {
                await this.topMediaiAPI.checkRateLimit();
                logger.info('✅ TopMediai STT API connectivity verified');
            } catch (error) {
                logger.warn('⚠️ TopMediai API test failed, will use fallback:', error.message);
            }

            this.isInitialized = true;
            this.emit('initialized', { success: true });
            return true;

        } catch (error) {
            logger.error('Failed to initialize TopMediai STT:', error.message);
            this.emit('initialized', { success: false, error: error.message });
            return false;
        }
    }

    /**
     * Process audio data for speech recognition
     * @param {Buffer} audioData - Raw audio data
     * @param {Object} metadata - Audio metadata (sample rate, format, etc.)
     */
    async processAudioData(audioData, metadata = {}) {
        try {
            if (!this.isInitialized) {
                logger.warn('STT not initialized, skipping audio processing');
                return null;
            }

            if (this.activeRequests >= this.config.maxConcurrentRequests) {
                logger.debug('Max concurrent STT requests reached, dropping audio chunk');
                return null;
            }

            // Add to buffer
            this.audioBuffer.push({
                data: audioData,
                timestamp: Date.now(),
                metadata
            });

            // Check if we should process the buffer
            const shouldProcess = this.shouldProcessBuffer();
            if (shouldProcess) {
                return await this.processBufferedAudio();
            }

            return null;

        } catch (error) {
            logger.error('Error processing audio data:', error.message);
            this.emit('error', error);
            return null;
        }
    }

    /**
     * Determine if buffered audio should be processed
     */
    shouldProcessBuffer() {
        if (this.audioBuffer.length === 0) return false;

        const now = Date.now();
        const oldestChunk = this.audioBuffer[0];
        const bufferAge = now - oldestChunk.timestamp;

        // Process if buffer is old enough or if we have enough data
        return bufferAge >= this.config.chunkDuration || this.audioBuffer.length >= 10;
    }

    /**
     * Process buffered audio chunks
     */
    async processBufferedAudio() {
        if (this.audioBuffer.length === 0) return null;

        try {
            this.activeRequests++;
            this.isProcessing = true;
            const startTime = Date.now();

            // Combine audio chunks
            const combinedAudio = this.combineAudioChunks(this.audioBuffer);
            this.audioBuffer = []; // Clear buffer

            // Convert to appropriate format for STT
            const processedAudio = await this.prepareAudioForSTT(combinedAudio);

            // Send to TopMediai STT
            const result = await this.topMediaiAPI.speechToText(processedAudio, {
                language: this.config.language,
                model: this.config.model,
                fallbackToSystem: this.config.fallbackToSystem
            });

            // Update statistics
            const responseTime = Date.now() - startTime;
            this.updateStats(result, responseTime, true);

            // Emit result if confidence is high enough
            if (result.confidence >= this.config.confidenceThreshold) {
                this.emit('speech_recognized', {
                    text: result.text,
                    confidence: result.confidence,
                    provider: result.provider,
                    responseTime,
                    timestamp: result.timestamp
                });

                logger.info(`🎤 Speech recognized: "${result.text}" (confidence: ${result.confidence.toFixed(2)})`);
                return result;
            } else {
                logger.debug(`Low confidence speech ignored: "${result.text}" (${result.confidence.toFixed(2)})`);
                return null;
            }

        } catch (error) {
            this.updateStats(null, 0, false);
            logger.error('Error processing buffered audio:', error.message);
            this.emit('error', error);
            return null;

        } finally {
            this.activeRequests--;
            this.isProcessing = false;
        }
    }

    /**
     * Combine multiple audio chunks into a single buffer
     */
    combineAudioChunks(chunks) {
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
        const combined = Buffer.alloc(totalLength);
        
        let offset = 0;
        for (const chunk of chunks) {
            chunk.data.copy(combined, offset);
            offset += chunk.data.length;
        }

        return combined;
    }

    /**
     * Prepare audio data for STT processing
     */
    async prepareAudioForSTT(audioData) {
        // For now, return the audio data as-is
        // In production, you might want to:
        // - Convert sample rate to match STT requirements
        // - Apply noise reduction
        // - Normalize audio levels
        // - Convert format if needed

        return audioData;
    }

    /**
     * Update processing statistics
     */
    updateStats(result, responseTime, success) {
        this.stats.totalRequests++;
        
        if (success) {
            this.stats.successfulRequests++;
            if (result && result.confidence) {
                const totalConfidence = this.stats.averageConfidence * (this.stats.successfulRequests - 1) + result.confidence;
                this.stats.averageConfidence = totalConfidence / this.stats.successfulRequests;
            }
            
            const totalResponseTime = this.stats.averageResponseTime * (this.stats.successfulRequests - 1) + responseTime;
            this.stats.averageResponseTime = totalResponseTime / this.stats.successfulRequests;
        } else {
            this.stats.failedRequests++;
        }
    }

    /**
     * Get current processing statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalRequests > 0 ? 
                (this.stats.successfulRequests / this.stats.totalRequests) * 100 : 0,
            isProcessing: this.isProcessing,
            activeRequests: this.activeRequests,
            bufferSize: this.audioBuffer.length
        };
    }

    /**
     * Clear audio buffer and reset state
     */
    clearBuffer() {
        this.audioBuffer = [];
        this.bufferStartTime = null;
        this.lastSpeechTime = null;
        logger.debug('STT audio buffer cleared');
    }

    /**
     * Stop STT processing
     */
    stop() {
        this.clearBuffer();
        this.isProcessing = false;
        this.emit('stopped');
        logger.info('TopMediai STT processing stopped');
    }
}

module.exports = TopMediaiSTTIntegration;
