#!/usr/bin/env node

/**
 * OpenAI Whisper Speech-to-Text Integration for ChatterPi
 *
 * Integrates OpenAI Whisper STT with ChatterPi's audio streaming infrastructure
 * for real-time speech recognition and voice-driven AI interactions.
 */

require('dotenv').config();
const EventEmitter = require('events');
const OpenAI = require('openai');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

class OpenAISTTIntegration extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = {
            // OpenAI API configuration
            openaiApiKey: process.env.OPENAI_API_KEY,

            // Whisper STT configuration
            model: 'whisper-1',
            language: 'en',
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

        this.openai = null;
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

        logger.info('OpenAI Whisper STT Integration initialized');
    }

    /**
     * Initialize the STT integration
     */
    async initialize() {
        try {
            if (!this.config.openaiApiKey) {
                logger.warn('OpenAI API key not configured - STT will use fallback only');
                return false;
            }

            // Initialize OpenAI client
            this.openai = new OpenAI({
                apiKey: this.config.openaiApiKey
            });

            // Test API connectivity with a simple request
            try {
                // We'll test connectivity when we make the first actual request
                logger.info('✅ OpenAI Whisper STT client initialized');
            } catch (error) {
                logger.warn('⚠️ OpenAI API test failed, will use fallback:', error.message);
            }

            this.isInitialized = true;
            this.emit('initialized', { success: true });
            return true;

        } catch (error) {
            logger.error('Failed to initialize OpenAI Whisper STT:', error.message);
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

            // Convert to appropriate format for Whisper STT
            const audioFile = await this.prepareAudioForWhisper(combinedAudio);

            // Send to OpenAI Whisper STT
            const result = await this.processWithWhisper(audioFile, {
                language: this.config.language,
                model: this.config.model
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
     * Prepare audio data for OpenAI Whisper processing
     */
    async prepareAudioForWhisper(audioData) {
        try {
            const tempDir = '/tmp';
            const timestamp = Date.now();

            // First, save the raw audio data to determine its format
            const rawTempFilePath = path.join(tempDir, `whisper_raw_${timestamp}.tmp`);
            await fs.writeFile(rawTempFilePath, audioData);

            // Detect the actual audio format
            let detectedFormat = 'webm'; // Default assumption based on browser MediaRecorder

            // Try to detect format using file signature
            const fileHeader = audioData.slice(0, 12);
            if (fileHeader.includes(Buffer.from('webm'))) {
                detectedFormat = 'webm';
            } else if (fileHeader.includes(Buffer.from('RIFF'))) {
                detectedFormat = 'wav';
            } else if (fileHeader.includes(Buffer.from('fLaC'))) {
                detectedFormat = 'flac';
            }

            // Create appropriate file path based on detected format
            const inputFilePath = path.join(tempDir, `whisper_input_${timestamp}.${detectedFormat}`);
            await fs.rename(rawTempFilePath, inputFilePath);

            // If the format is already supported by Whisper, return as-is
            const supportedFormats = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];
            if (supportedFormats.includes(detectedFormat)) {
                logger.info(`Audio format ${detectedFormat} is supported by Whisper, using directly`);
                return inputFilePath;
            }

            // If format is not supported, convert to WAV using ffmpeg
            logger.info(`Converting ${detectedFormat} to WAV for Whisper compatibility`);
            const outputFilePath = path.join(tempDir, `whisper_converted_${timestamp}.wav`);

            await this.convertAudioToWav(inputFilePath, outputFilePath);

            // Clean up the input file
            try {
                await fs.unlink(inputFilePath);
            } catch (cleanupError) {
                logger.warn('Failed to clean up input audio file:', cleanupError.message);
            }

            return outputFilePath;

        } catch (error) {
            logger.error('Error preparing audio for Whisper:', error);
            throw error;
        }
    }

    /**
     * Convert audio file to WAV format using ffmpeg
     */
    async convertAudioToWav(inputPath, outputPath) {
        const { spawn } = require('child_process');

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-y',                    // Overwrite output files
                '-i', inputPath,         // Input file
                '-acodec', 'pcm_s16le',  // PCM 16-bit little-endian
                '-ar', '16000',          // Sample rate 16kHz (good for speech)
                '-ac', '1',              // Mono channel
                outputPath               // Output file
            ]);

            let ffmpegOutput = '';
            let ffmpegError = '';

            ffmpeg.stdout.on('data', (data) => {
                ffmpegOutput += data.toString();
            });

            ffmpeg.stderr.on('data', (data) => {
                ffmpegError += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    logger.info('Audio conversion to WAV completed successfully');
                    resolve();
                } else {
                    logger.error(`ffmpeg conversion failed with code ${code}: ${ffmpegError}`);
                    reject(new Error(`Audio conversion failed: ${ffmpegError}`));
                }
            });

            ffmpeg.on('error', (err) => {
                logger.error('ffmpeg process error:', err);
                reject(new Error(`ffmpeg process error: ${err.message}`));
            });
        });
    }

    /**
     * Process audio with OpenAI Whisper
     */
    async processWithWhisper(audioFilePath, options = {}) {
        try {
            if (!this.openai) {
                throw new Error('OpenAI client not initialized');
            }

            logger.info(`Processing audio file ${path.basename(audioFilePath)} with OpenAI Whisper...`);

            // Determine file extension and content type
            const fileExtension = path.extname(audioFilePath).toLowerCase();
            let contentType = 'audio/wav'; // default
            let filename = 'audio.wav'; // default

            // Map file extensions to content types
            const contentTypeMap = {
                '.wav': 'audio/wav',
                '.webm': 'audio/webm',
                '.mp3': 'audio/mpeg',
                '.m4a': 'audio/mp4',
                '.flac': 'audio/flac',
                '.ogg': 'audio/ogg'
            };

            if (contentTypeMap[fileExtension]) {
                contentType = contentTypeMap[fileExtension];
                filename = `audio${fileExtension}`;
            }

            logger.info(`Using content type: ${contentType} for file: ${filename}`);

            // Create a readable stream from the audio file
            const audioStream = require('fs').createReadStream(audioFilePath);

            // Call OpenAI Whisper API
            const response = await this.openai.audio.transcriptions.create({
                file: audioStream,
                model: options.model || this.config.model,
                language: options.language === 'auto' ? undefined : options.language,
                response_format: 'json'
            });

            // Clean up temporary file
            try {
                await fs.unlink(audioFilePath);
            } catch (cleanupError) {
                logger.warn('Failed to clean up temporary audio file:', cleanupError.message);
            }

            // Parse and return result
            const result = {
                text: response.text || '',
                confidence: 1.0, // Whisper doesn't provide confidence scores
                provider: 'OpenAI Whisper',
                timestamp: new Date().toISOString(),
                metadata: {
                    model: options.model || this.config.model,
                    language: options.language,
                    originalFormat: fileExtension,
                    contentType: contentType
                }
            };

            logger.info(`✅ Whisper transcription: "${result.text}"`);
            return result;

        } catch (error) {
            logger.error('OpenAI Whisper processing failed:', error.message);

            // Try system fallback if enabled
            if (this.config.fallbackToSystem) {
                return await this.generateSystemSTT(audioFilePath, options);
            }

            throw error;
        }
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
        logger.info('OpenAI Whisper STT processing stopped');
    }
}

module.exports = OpenAISTTIntegration;
