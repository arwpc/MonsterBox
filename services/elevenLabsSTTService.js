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
                        id: 'scribe_v1',
                        name: 'Scribe v1 (Multilingual)',
                        description: 'ElevenLabs speech-to-text model (multilingual)',
                        languages: ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko']
                    },
                    {
                        id: 'scribe_english_v1',
                        name: 'Scribe English v1',
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

            // ElevenLabs STT expects 'file' form field
            formData.append('file', audioStream, {
                filename,
                contentType: mimeType
            });

            // Map English-only alias to actual model and enforce language
            var modelToSend = options.model || 'scribe_v1';
            var langToSend = options.language;
            if (modelToSend === 'scribe_english_v1') {
                modelToSend = 'scribe_v1';
                if (!langToSend || langToSend === 'auto') langToSend = 'en';
            }

            // ALWAYS log what we're sending to ElevenLabs
            console.log(`🎙️ STT Request: model_id="${modelToSend}", language="${langToSend || 'NOT SET'}", bytes=${audioBuffer.length}, original_model="${options.model}", original_lang="${options.language}"`);

            // Required by ElevenLabs STT
            formData.append('model_id', modelToSend);

            // Only pass language if explicitly provided and not 'auto'
            if (langToSend && langToSend !== 'auto') {
                formData.append('language', langToSend);
                console.log(`✅ Language parameter SENT to ElevenLabs: "${langToSend}"`);
            } else {
                console.log(`⚠️ Language parameter NOT sent (langToSend="${langToSend}")`);
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

            const transcript = response.data.text || '';
            const detectedLang = response.data.detected_language || 'unknown';
            const confidence = response.data.confidence || null;

            console.log(`📝 STT Response: text="${transcript}", detected_language="${detectedLang}", confidence=${confidence}`);

            return {
                success: true,
                transcript: transcript,
                confidence: confidence,
                language: detectedLang,
                duration: response.data.duration || null
            };
        } catch (error) {
            // Normalize ElevenLabs error into a readable string
            var msg = '';
            try {
                var data = error && error.response && error.response.data;
                var detail = data && data.detail;
                if (typeof detail === 'string') {
                    msg = detail;
                } else if (Array.isArray(detail)) {
                    msg = detail.map(function (d) { return (d && (d.msg || d.message || JSON.stringify(d))); }).join('; ');
                } else if (detail && typeof detail === 'object') {
                    msg = detail.msg || detail.message || JSON.stringify(detail);
                }
                if (!msg) msg = (data && (data.message || data.error)) || '';
            } catch (_) { /* ignore */ }
            if (!msg) msg = error && (error.message || String(error)) || 'Unknown STT error';
            if (msg.length > 300) msg = msg.slice(0, 300) + '…';
            if (process.env.MB_DEBUG_AUDIO === '1') console.warn('STT transcription error:', msg);
            return { success: false, error: msg };
        }
    }

    /**
     * Get STT configuration for a specific use case
     */
    getSTTConfig(useCase = 'conversation') {
        const configs = {
            conversation: {
                model: 'scribe_v1',
                language: 'auto',
                format: 'wav',
                sampleRate: 16000,
                channels: 1
            },
            transcription: {
                model: 'scribe_v1',
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
