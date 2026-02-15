/**
 * MonsterBox - ElevenLabs Speech-to-Text Service
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
                        id: 'scribe_v2',
                        name: 'Scribe v2 (Multilingual)',
                        description: 'State-of-the-art speech recognition with keyterm prompting, entity detection, and speaker diarization. 90+ languages.',
                        languages: ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko']
                    },
                    {
                        id: 'scribe_v2_realtime',
                        name: 'Scribe v2 Realtime',
                        description: 'Real-time streaming STT with ~150ms latency, VAD, and word-level timestamps. 90+ languages.',
                        languages: ['auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko']
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

            // Use scribe_v2 as default
            var modelToSend = options.model || 'scribe_v2';
            var langToSend = options.language;

            // ALWAYS log what we're sending to ElevenLabs
            console.log(`🎙️ STT Request: model_id="${modelToSend}", language_code="${langToSend || 'NOT SET'}", bytes=${audioBuffer.length}, mimeType="${mimeType}", filename="${filename}"`);
            console.log(`   Original params: model="${options.model}", lang="${options.language}"`);

            // Audio quality diagnostics
            if (process.env.MB_DEBUG_AUDIO === '1') {
                try {
                    console.log(`   🔍 DEBUG: MB_DEBUG_AUDIO is set, analyzing audio...`);
                    console.log(`   Buffer info: length=${audioBuffer.length}, mimeType=${mimeType}`);

                    // Skip WAV header (44 bytes) if this is a WAV file
                    const dataStart = mimeType === 'audio/wav' ? 44 : 0;
                    const audioData = audioBuffer.slice(dataStart);
                    console.log(`   After header skip: dataStart=${dataStart}, audioData.length=${audioData.length}`);

                    console.error(`   Starting amplitude calculation...`);
                    // Calculate basic audio statistics from PCM data
                    const sampleCount = Math.floor(audioData.length / 2); // 16-bit samples
                    console.error(`   Sample count: ${sampleCount}`);

                    let sum = 0;
                    let maxAmp = 0;
                    console.error(`   Looping through samples...`);
                    for (let i = 0; i < audioData.length - 1; i += 2) {
                        const sample = audioData.readInt16LE(i);
                        const amp = Math.abs(sample);
                        sum += amp;
                        if (amp > maxAmp) maxAmp = amp;
                    }
                    console.error(`   Loop complete. sum=${sum}, maxAmp=${maxAmp}`);

                    const avgAmp = sum / sampleCount;
                    console.error(`   avgAmp calculated: ${avgAmp}`);

                    const rms = Math.sqrt(sum * sum / sampleCount) / 32768; // Normalize to 0-1
                    console.error(`   rms calculated: ${rms}`);

                    console.error(`   📊 Audio stats: avgAmp=${avgAmp.toFixed(0)}, maxAmp=${maxAmp}, rms=${rms.toFixed(4)}, samples=${sampleCount}`);

                    if (maxAmp < 1000) {
                        console.warn(`   ⚠️ WARNING: Audio level very low (maxAmp=${maxAmp}) - microphone may not be working!`);
                    } else if (maxAmp > 30000) {
                        console.warn(`   ⚠️ WARNING: Audio level very high (maxAmp=${maxAmp}) - may be clipping/distorted!`);
                    } else {
                        console.error(`   ✓ Audio levels look reasonable`);
                    }
                } catch (err) {
                    console.error(`   ❌ Error analyzing audio: ${err.message}`);
                    console.error(err.stack);
                }
            }

            // Required by ElevenLabs STT
            formData.append('model_id', modelToSend);

            // Only pass language if explicitly provided and not 'auto'
            // NOTE: ElevenLabs API expects 'language_code', not 'language'
            if (langToSend && langToSend !== 'auto') {
                formData.append('language_code', langToSend);
                console.log(`✅ Language code parameter SENT to ElevenLabs: "${langToSend}"`);
            } else {
                console.log(`⚠️ Language code parameter NOT sent (langToSend="${langToSend}")`);
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

            // Log full response in debug mode
            if (process.env.MB_DEBUG_AUDIO === '1') {
                console.log(`   Full API response:`, JSON.stringify(response.data));
            }

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
                model: 'scribe_v2',
                language: 'auto',
                format: 'wav',
                sampleRate: 16000,
                channels: 1
            },
            transcription: {
                model: 'scribe_v2',
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
