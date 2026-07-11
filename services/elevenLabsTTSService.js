/**
 * MonsterBox - ElevenLabs Text-to-Speech Service
 * Handles TTS configuration, voice management, and audio generation
 */

import axios from 'axios';
import { spawnSync } from 'child_process';
import FormData from 'form-data';
import elevenLabsConfigService from './elevenLabsConfigService.js';

class ElevenLabsTTSService {
    constructor() {
        // Resolve config lazily (see getters below). getElevenLabsConfig() throws
        // when no API key is provisioned; doing it here + `export default new ...`
        // made a missing key abort module import and crash the ENTIRE server at
        // startup. The error now surfaces only when a TTS method is actually used.
        this._config = null;
        this._audioConfig = null;
        this._preferMp3 = this._detectMpg123Availability();
    }

    get config() {
        if (!this._config) this._config = elevenLabsConfigService.getElevenLabsConfig();
        return this._config;
    }

    get audioConfig() {
        if (!this._audioConfig) this._audioConfig = elevenLabsConfigService.getAudioConfig();
        return this._audioConfig;
    }

    /**
     * Extract a human-readable error from an axios error (handles arraybuffer/stream responses)
     */
    _extractError(error) {
        try {
            if (error.response?.data) {
                const d = error.response.data;
                const raw = Buffer.isBuffer(d) ? d.toString('utf8')
                    : (typeof d === 'string' ? d : null);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    const detail = parsed?.detail;
                    if (typeof detail === 'string') return detail;
                    if (detail?.message) return `${detail.status || 'error'}: ${detail.message}`;
                }
            }
        } catch (_) { /* fall through */ }
        return error.message;
    }

    _detectMpg123Availability() {
        try {
            // Allow explicit override via env
            if (process.env.MB_PREFER_MP3 === '0' || process.env.MB_PREFER_MP3 === 'false') return false;
            if (process.env.MB_PREFER_MP3 === '1' || process.env.MB_PREFER_MP3 === 'true') return true;
            const r = spawnSync('mpg123', ['--version'], { encoding: 'utf8' });
            return r && r.status === 0;
        } catch (_) {
            return false;
        }
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
            const msg = this._extractError(error);
            console.error('Error fetching voices:', msg);
            return { success: false, error: msg, voices: [] };
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
            const msg = this._extractError(error);
            console.error('Error fetching voice:', msg);
            return { success: false, error: msg };
        }
    }

    /**
     * Generate speech from text
     */
    async generateSpeech(text, voiceId, options = {}) {
        try {
            // Lightweight test mode to avoid external API calls during automated tests
            if (process.env.MB_TEST_MODE === '1') {
                return {
                    success: true,
                    audioBuffer: Buffer.from('RIFF....WAVE'),
                    contentType: 'audio/wav'
                };
            }

            const modelId = options.model || 'eleven_v3';
            const isV3 = modelId === 'eleven_v3';

            // Build voice_settings — v3 does not support style or use_speaker_boost
            const voiceSettings = {
                stability: (options.stability !== undefined ? options.stability : 0.5),
                similarity_boost: (options.similarity_boost !== undefined ? options.similarity_boost : 0.5),
            };
            if (!isV3) {
                voiceSettings.style = (options.style !== undefined ? options.style : 0.0);
                voiceSettings.use_speaker_boost = (options.use_speaker_boost !== undefined ? options.use_speaker_boost : true);
            }

            const requestData = {
                text: text,
                model_id: modelId,
                voice_settings: voiceSettings
            };

            console.log('🎙️ TTS Request:', JSON.stringify({ voiceId, model: requestData.model_id, settings: requestData.voice_settings }, null, 2));

            const response = await axios.post(
                `${this.config.baseUrl}/text-to-speech/${voiceId}`,
                requestData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json',
                        // Prefer MP3 for low-latency server playback when mpg123 is available; otherwise request WAV
                        'Accept': this._preferMp3 ? 'audio/mpeg' : 'audio/wav'
                    },
                    responseType: 'arraybuffer',
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                audioBuffer: Buffer.from(response.data),
                contentType: response.headers['content-type'] || (this._preferMp3 ? 'audio/mpeg' : 'audio/wav')
            };
        } catch (error) {
            const msg = this._extractError(error);
            console.error('TTS generation error:', msg);
            return { success: false, error: msg };
        }
    }

    /**
     * Generate speech with streaming (for real-time playback)
     */
    async generateSpeechStream(text, voiceId, options = {}) {
        try {
            const streamModelId = options.model || 'eleven_v3';
            const isStreamV3 = streamModelId === 'eleven_v3';

            const streamVoiceSettings = {
                stability: (options.stability !== undefined ? options.stability : 0.5),
                similarity_boost: (options.similarity_boost !== undefined ? options.similarity_boost : 0.5),
            };
            if (!isStreamV3) {
                streamVoiceSettings.style = (options.style !== undefined ? options.style : 0.0);
                streamVoiceSettings.use_speaker_boost = (options.use_speaker_boost !== undefined ? options.use_speaker_boost : true);
            }

            const requestData = {
                text: text,
                model_id: streamModelId,
                voice_settings: streamVoiceSettings
            };

            const response = await axios.post(
                `${this.config.baseUrl}/text-to-speech/${voiceId}/stream`,
                requestData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json',
                        // Request MP3 stream when available; otherwise WAV
                        'Accept': this._preferMp3 ? 'audio/mpeg' : 'audio/wav'
                    },
                    responseType: 'stream',
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                stream: response.data,
                contentType: response.headers['content-type'] || (this._preferMp3 ? 'audio/mpeg' : 'audio/wav')
            };
        } catch (error) {
            const msg = this._extractError(error);
            console.error('TTS streaming error:', msg);
            return { success: false, error: msg };
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
            const msg = this._extractError(error);
            console.error('Error fetching TTS models:', msg);
            return { success: false, error: msg, models: [] };
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
            const msg = this._extractError(error);
            console.error('Voice cloning error:', msg);
            return { success: false, error: msg };
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
            const msg = this._extractError(error);
            console.error('Error deleting voice:', msg);
            return { success: false, error: msg };
        }
    }

    /**
     * Get TTS configuration for different use cases
     */
    getTTSConfig(useCase = 'conversation') {
        const configs = {
            conversation: {
                model: 'eleven_v3',
                stability: 0.5,
                similarity_boost: 0.5
            },
            narration: {
                model: 'eleven_v3',
                stability: 0.7,
                similarity_boost: 0.8
            },
            character: {
                model: 'eleven_v3',
                stability: 0.3,
                similarity_boost: 0.7
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
