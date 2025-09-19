/**
 * MonsterBox 4.0 - ElevenLabs Speech-to-Text Service
 * Handles STT configuration and processing
 */

import axios from 'axios';
import FormData from 'form-data';
import elevenLabsConfigService from './elevenLabsConfigService.js';

class ElevenLabsSTTService {
    constructor() {
        this.config = elevenLabsConfigService.getElevenLabsConfig();
        this.audioConfig = elevenLabsConfigService.getAudioConfig();
    }

    /**
     * Get available STT models and languages
     */
    async getSTTCapabilities() {
        try {
            // ElevenLabs STT capabilities (based on documentation)
            return {
                models: [
                    {
                        id: 'eleven_multilingual_v2',
                        name: 'Multilingual V2',
                        description: 'Advanced multilingual speech recognition',
                        languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko']
                    },
                    {
                        id: 'eleven_english_v1',
                        name: 'English V1',
                        description: 'Optimized for English speech recognition',
                        languages: ['en']
                    }
                ],
                supportedFormats: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'],
                maxFileSize: '25MB',
                sampleRates: [8000, 16000, 22050, 44100, 48000]
            };
        } catch (error) {
            console.error('Error getting STT capabilities:', error);
            throw error;
        }
    }

    /**
     * Transcribe audio file
     */
    async transcribeAudio(audioBuffer, options = {}) {
        try {
            const formData = new FormData();

            // Create a proper stream from the buffer for FormData
            const { Readable } = await import('stream');
            const audioStream = Readable.from(audioBuffer);

            const mimeType = options.mimeType || 'audio/wav';
            const filename = mimeType === 'audio/webm' ? 'audio.webm' :
                mimeType === 'audio/mpeg' ? 'audio.mp3' :
                    mimeType === 'audio/ogg' ? 'audio.ogg' :
                        mimeType === 'audio/flac' ? 'audio.flac' :
                            mimeType === 'audio/m4a' ? 'audio.m4a' : 'audio.wav';

            audioStream.path = filename; // Set filename for FormData

            formData.append('audio', audioStream, {
                filename,
                contentType: mimeType,
                knownLength: audioBuffer.length
            });

            // Add optional parameters
            if (options.model) {
                formData.append('model_id', options.model);
            }
            if (options.language) {
                formData.append('language', options.language);
            }

            const response = await axios.post(
                `${this.config.baseUrl}/speech-to-text`,
                formData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        ...formData.getHeaders()
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                transcript: response.data.text,
                confidence: response.data.confidence || null,
                language: response.data.detected_language || options.language,
                duration: response.data.duration || null
            };
        } catch (error) {
            console.error('STT transcription error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Get STT configuration for a specific use case
     */
    getSTTConfig(useCase = 'conversation') {
        const configs = {
            conversation: {
                model: 'eleven_multilingual_v2',
                language: 'en',
                format: 'wav',
                sampleRate: 16000,
                channels: 1
            },
            transcription: {
                model: 'eleven_multilingual_v2',
                language: 'auto',
                format: 'wav',
                sampleRate: 44100,
                channels: 1
            }
        };

        return configs[useCase] || configs.conversation;
    }

    /**
     * Validate STT configuration
     */
    validateSTTConfig(config) {
        const errors = [];

        if (!config.model) {
            errors.push('Model is required');
        }

        if (!config.language) {
            errors.push('Language is required');
        }

        if (!config.format || !['wav', 'mp3', 'm4a', 'flac', 'ogg', 'webm'].includes(config.format)) {
            errors.push('Invalid audio format');
        }

        if (!config.sampleRate || ![8000, 16000, 22050, 44100, 48000].includes(config.sampleRate)) {
            errors.push('Invalid sample rate');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Test STT functionality with sample audio
     */
    async testSTT(config = {}) {
        try {
            // Create a simple test audio buffer (silence)
            const testAudioBuffer = Buffer.alloc(16000 * 2); // 1 second of 16-bit silence at 16kHz

            const result = await this.transcribeAudio(testAudioBuffer, config);

            return {
                success: true,
                message: 'STT test completed',
                result
            };
        } catch (error) {
            console.error('STT test error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default new ElevenLabsSTTService();
