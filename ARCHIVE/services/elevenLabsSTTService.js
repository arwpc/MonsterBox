/**
 * ElevenLabs Speech-to-Text Service
 * Handles audio transcription using ElevenLabs STT API
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const { getElevenLabsApiKeySync, getMaskedKey } = require('../utils/elevenlabsKey');

class ElevenLabsSTTService {
    constructor() {
        this.apiKey = getElevenLabsApiKeySync();
        this.baseUrl = 'https://api.elevenlabs.io/v1';
        this.model = 'scribe_v1'; // ElevenLabs STT model

        if (!this.apiKey) {
            logger.warn('⚠️ ElevenLabs API key not configured - STT functionality will be limited');
        } else {
            logger.info(`🔑 ElevenLabs API key loaded (${getMaskedKey(this.apiKey)})`);
        }

        logger.info('🎤 ElevenLabs STT Service initialized');
    }

    /**
     * Check if the service is properly configured
     */
    isConfigured() {
        return !!this.apiKey;
    }

    /**
     * Transcribe audio file using ElevenLabs STT API
     * @param {Buffer|string} audioData - Audio data as Buffer or file path
     * @param {Object} options - Transcription options
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeAudio(audioData, options = {}) {
        try {
            if (!this.isConfigured()) {
                throw new Error('ElevenLabs API key not configured');
            }

            const startTime = Date.now();
            logger.info('🎙️ Starting ElevenLabs STT transcription...');

            // Prepare form data
            const formData = new FormData();

            // Handle different input types
            if (Buffer.isBuffer(audioData)) {
                // Audio data as buffer
                formData.append('file', audioData, {
                    filename: 'audio.wav',
                    contentType: 'audio/wav'
                });
            } else if (typeof audioData === 'string') {
                // Audio data as file path
                try {
                    const audioBuffer = await fs.readFile(audioData);
                    const filename = path.basename(audioData);
                    const extension = path.extname(filename).toLowerCase() || '.mp3';
                    formData.append('file', audioBuffer, {
                        filename: filename || `audio${extension}`,
                        contentType: this.getContentType(filename || `audio${extension}`)
                    });
                } catch (fileError) {
                    throw new Error(`Failed to read audio file: ${fileError.message}`);
                }
            } else {
                throw new Error('Invalid audio data format. Expected Buffer or file path string.');
            }

            // Add model parameter
            formData.append('model_id', options.model || this.model);

            // Add optional parameters
            if (options.language) {
                formData.append('language', options.language);
            }

            // Debug FormData
            console.log('FormData fields:', Object.keys(formData._streams || {}));
            console.log('API URL:', `${this.baseUrl}/speech-to-text`);
            console.log('Headers:', {
                'xi-api-key': this.apiKey ? 'present' : 'missing',
                ...formData.getHeaders()
            });
            console.log('Audio data type:', typeof audioData);
            console.log('Audio data is string:', typeof audioData === 'string');
            console.log('Audio data path:', audioData);

            // Make API request
            const response = await fetch(`${this.baseUrl}/speech-to-text`, {
                method: 'POST',
                headers: {
                    'xi-api-key': this.apiKey,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`ElevenLabs STT API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            const responseTime = Date.now() - startTime;

            logger.info(`✅ ElevenLabs STT transcription completed in ${responseTime}ms`);
            logger.debug('📝 Transcription result:', {
                text: result.text?.substring(0, 100) + '...',
                language: result.language_code,
                confidence: result.language_probability
            });

            return {
                success: true,
                text: result.text,
                language: result.language_code,
                confidence: result.language_probability,
                words: result.words || [],
                responseTime: responseTime,
                provider: 'elevenlabs'
            };

        } catch (error) {
            logger.error('❌ ElevenLabs STT transcription failed:', error.message);
            return {
                success: false,
                error: error.message,
                provider: 'elevenlabs'
            };
        }
    }

    /**
     * Transcribe audio from base64 data
     * @param {string} base64Audio - Base64 encoded audio data
     * @param {Object} options - Transcription options
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeBase64Audio(base64Audio, options = {}) {
        try {
            // Convert base64 to buffer
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            return await this.transcribeAudio(audioBuffer, options);
        } catch (error) {
            logger.error('❌ Error transcribing base64 audio:', error.message);
            return {
                success: false,
                error: error.message,
                provider: 'elevenlabs'
            };
        }
    }

    /**
     * Get content type based on file extension
     * @param {string} filename - File name
     * @returns {string} Content type
     */
    getContentType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const contentTypes = {
            '.wav': 'audio/wav',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac',
            '.ogg': 'audio/ogg',
            '.webm': 'audio/webm'
        };
        return contentTypes[ext] || 'audio/wav';
    }

    /**
     * Test the STT service connection
     * @returns {Promise<Object>} Test result
     */
    async testConnection() {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'ElevenLabs API key not configured',
                    provider: 'elevenlabs'
                };
            }

            // For testing, validate the API key presence and plausible length
            const apiKeyValid = this.apiKey && String(this.apiKey).trim().length >= 20;

            return {
                success: !!apiKeyValid,
                message: apiKeyValid ? 'ElevenLabs STT service ready' : 'API key missing or invalid length',
                provider: 'elevenlabs',
                responseTime: 0
            };

        } catch (error) {
            logger.error('❌ ElevenLabs STT connection test failed:', error.message);
            return {
                success: false,
                error: error.message,
                provider: 'elevenlabs'
            };
        }
    }

    /**
     * Get service status
     * @returns {Object} Service status
     */
    getStatus() {
        return {
            isConfigured: this.isConfigured(),
            provider: 'elevenlabs',
            model: this.model,
            apiKeyConfigured: !!this.apiKey,
            baseUrl: this.baseUrl
        };
    }
}

module.exports = ElevenLabsSTTService;
