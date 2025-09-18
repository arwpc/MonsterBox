/**
 * MonsterBox 4.0 - ElevenLabs Text-to-Speech Service
 * Handles TTS configuration, voice management, and audio generation
 */

import axios from 'axios';
import elevenLabsConfigService from './elevenLabsConfigService.js';

class ElevenLabsTTSService {
    constructor() {
        this.config = elevenLabsConfigService.getElevenLabsConfig();
        this.audioConfig = elevenLabsConfigService.getAudioConfig();
    }

    /**
     * Get all available voices
     */
    async getVoices() {
        try {
            const response = await axios.get(
                `${this.config.baseUrl}/voices`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                voices: response.data.voices || []
            };
        } catch (error) {
            console.error('Error fetching voices:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                voices: []
            };
        }
    }

    /**
     * Get voice details by ID
     */
    async getVoice(voiceId) {
        try {
            const response = await axios.get(
                `${this.config.baseUrl}/voices/${voiceId}`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                voice: response.data
            };
        } catch (error) {
            console.error('Error fetching voice:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Generate speech from text
     */
    async generateSpeech(text, voiceId, options = {}) {
        try {
            const requestData = {
                text: text,
                model_id: options.model || 'eleven_monolingual_v1',
                voice_settings: {
                    stability: options.stability || 0.5,
                    similarity_boost: options.similarity_boost || 0.5,
                    style: options.style || 0.0,
                    use_speaker_boost: options.use_speaker_boost || true
                }
            };

            const response = await axios.post(
                `${this.config.baseUrl}/text-to-speech/${voiceId}`,
                requestData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                audioBuffer: Buffer.from(response.data),
                contentType: response.headers['content-type'] || 'audio/mpeg'
            };
        } catch (error) {
            console.error('TTS generation error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Generate speech with streaming (for real-time playback)
     */
    async generateSpeechStream(text, voiceId, options = {}) {
        try {
            const requestData = {
                text: text,
                model_id: options.model || 'eleven_monolingual_v1',
                voice_settings: {
                    stability: options.stability || 0.5,
                    similarity_boost: options.similarity_boost || 0.5,
                    style: options.style || 0.0,
                    use_speaker_boost: options.use_speaker_boost || true
                }
            };

            const response = await axios.post(
                `${this.config.baseUrl}/text-to-speech/${voiceId}/stream`,
                requestData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'stream',
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                stream: response.data,
                contentType: response.headers['content-type'] || 'audio/mpeg'
            };
        } catch (error) {
            console.error('TTS streaming error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Get available TTS models
     */
    async getTTSModels() {
        try {
            const response = await axios.get(
                `${this.config.baseUrl}/models`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                models: response.data || []
            };
        } catch (error) {
            console.error('Error fetching TTS models:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                models: []
            };
        }
    }

    /**
     * Clone a voice from audio samples
     */
    async cloneVoice(name, description, files) {
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('description', description);

            // Add audio files
            files.forEach((file, index) => {
                formData.append('files', file, `sample_${index}.wav`);
            });

            const response = await axios.post(
                `${this.config.baseUrl}/voices/add`,
                formData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        ...formData.getHeaders()
                    },
                    timeout: 60000 // Voice cloning takes longer
                }
            );

            return {
                success: true,
                voice: response.data
            };
        } catch (error) {
            console.error('Voice cloning error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Delete a cloned voice
     */
    async deleteVoice(voiceId) {
        try {
            await axios.delete(
                `${this.config.baseUrl}/voices/${voiceId}`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                message: 'Voice deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting voice:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Get TTS configuration for different use cases
     */
    getTTSConfig(useCase = 'conversation') {
        const configs = {
            conversation: {
                model: 'eleven_monolingual_v1',
                stability: 0.5,
                similarity_boost: 0.5,
                style: 0.0,
                use_speaker_boost: true
            },
            narration: {
                model: 'eleven_multilingual_v2',
                stability: 0.7,
                similarity_boost: 0.8,
                style: 0.2,
                use_speaker_boost: false
            },
            character: {
                model: 'eleven_monolingual_v1',
                stability: 0.3,
                similarity_boost: 0.7,
                style: 0.5,
                use_speaker_boost: true
            }
        };

        return configs[useCase] || configs.conversation;
    }

    /**
     * Validate TTS configuration
     */
    validateTTSConfig(config) {
        const errors = [];

        if (!config.voice_id) {
            errors.push('Voice ID is required');
        }

        if (config.stability !== undefined && (config.stability < 0 || config.stability > 1)) {
            errors.push('Stability must be between 0 and 1');
        }

        if (config.similarity_boost !== undefined && (config.similarity_boost < 0 || config.similarity_boost > 1)) {
            errors.push('Similarity boost must be between 0 and 1');
        }

        if (config.style !== undefined && (config.style < 0 || config.style > 1)) {
            errors.push('Style must be between 0 and 1');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Test TTS with sample text
     */
    async testTTS(voiceId, config = {}) {
        const testText = "Hello! This is a test of the ElevenLabs text-to-speech system. How does this voice sound?";

        try {
            const result = await this.generateSpeech(testText, voiceId, config);

            return {
                success: result.success,
                message: result.success ? 'TTS test completed successfully' : 'TTS test failed',
                audioBuffer: result.audioBuffer,
                error: result.error
            };
        } catch (error) {
            console.error('TTS test error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default new ElevenLabsTTSService();
