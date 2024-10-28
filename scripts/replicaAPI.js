const axios = require('axios');
const logger = require('./logger');

class ReplicaAPI {
    constructor() {
        this.apiKey = process.env.REPLICA_API_KEY;
        this.baseURL = 'https://api.replicastudios.com/v2';
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        this.rateLimitPerMinute = 100;
        
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            headers: {
                'X-Api-Key': this.apiKey,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.fxPresetsCache = null;
        this.fxPresetsCacheExpiry = null;
        this.cacheLifetime = 5 * 60 * 1000;

        if (!this.apiKey) {
            logger.warn('REPLICA_API_KEY environment variable is not set. Using mock data.');
        } else {
            logger.info('Using Replica API key:', this.apiKey);
        }
    }

    async checkRateLimit() {
        const now = Date.now();
        const timeWindow = 60 * 1000;
        
        if (now - this.lastRequestTime > timeWindow) {
            this.requestCount = 0;
            this.lastRequestTime = now;
        }

        if (this.requestCount >= this.rateLimitPerMinute) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }

        this.requestCount++;
    }

    async retryWithBackoff(operation, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                
                const isRetryable = error.response?.status >= 500 || 
                                  error.code === 'ECONNABORTED' ||
                                  error.code === 'ETIMEDOUT';
                
                if (!isRetryable) throw error;

                const delay = Math.min(1000 * Math.pow(2, i), 5000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getVoices() {
        try {
            if (!this.apiKey) {
                return this.getMockVoices();
            }

            await this.checkRateLimit();

            if (this.voicesCache && this.voicesCacheExpiry > Date.now()) {
                return this.voicesCache;
            }

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/library/voices');
            });

            if (!response.data?.items) {
                throw new Error('Invalid API response format');
            }

            const transformedVoices = response.data.items.map(voice => ({
                uuid: voice.uuid,
                name: voice.name,
                gender: voice.gender,
                age: voice.age,
                accent: voice.accent,
                capabilities: {
                    'tts.vox_1_0': voice.capabilities?.includes('tts.vox_1_0') || false,
                    'tts.vox_2_0': voice.capabilities?.includes('tts.vox_2_0') || false,
                    'sts.vox_1_0': voice.capabilities?.includes('sts.vox_1_0') || false,
                    'sts.vox_2_0': voice.capabilities?.includes('sts.vox_2_0') || false
                }
            }));

            this.voicesCache = transformedVoices;
            this.voicesCacheExpiry = Date.now() + this.cacheLifetime;

            return transformedVoices;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error fetching available voices: ${errorMsg}`);
            return this.getMockVoices();
        }
    }

    async getFXPresets() {
        try {
            if (!this.apiKey) {
                return this.getMockFXPresets();
            }

            await this.checkRateLimit();

            if (this.fxPresetsCache && this.fxPresetsCacheExpiry > Date.now()) {
                return this.fxPresetsCache;
            }

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/effects_presets');
            });

            if (!response.data?.items) {
                throw new Error('Invalid API response format');
            }

            this.fxPresetsCache = response.data.items;
            this.fxPresetsCacheExpiry = Date.now() + this.cacheLifetime;

            return response.data.items;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error fetching FX presets: ${errorMsg}`);
            return this.getMockFXPresets();
        }
    }

    getMockVoices() {
        return [
            {
                uuid: 'mock-voice-1',
                name: 'Deep Monster',
                gender: 'male',
                age: 'middle',
                accent: 'american',
                capabilities: {
                    'tts.vox_1_0': true,
                    'tts.vox_2_0': true,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                }
            },
            {
                uuid: 'mock-voice-2',
                name: 'Creepy Witch',
                gender: 'female',
                age: 'senior',
                accent: 'british',
                capabilities: {
                    'tts.vox_1_0': true,
                    'tts.vox_2_0': true,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                }
            },
            {
                uuid: 'mock-voice-3',
                name: 'Ghost Child',
                gender: 'neutral',
                age: 'young',
                accent: 'american',
                capabilities: {
                    'tts.vox_1_0': true,
                    'tts.vox_2_0': true,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                }
            }
        ];
    }

    getMockFXPresets() {
        return [
            {
                id: 'halloween',
                name: 'Halloween',
                description: 'Spooky Halloween voice effect'
            },
            {
                id: 'ghost',
                name: 'Ghost',
                description: 'Haunting, ethereal presence'
            },
            {
                id: 'monster',
                name: 'Monster',
                description: 'Deep, growling monster voice'
            }
        ];
    }

    async textToSpeech(params) {
        try {
            if (!this.apiKey) {
                return this.getMockSpeechResponse();
            }

            if (!params.text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!params.voiceId) {
                throw new Error('VoiceId parameter is required');
            }

            await this.checkRateLimit();

            const voices = await this.getVoices();
            const voice = voices.find(v => v.uuid === params.voiceId);
            
            if (!voice) {
                throw new Error(`Voice not found with ID: ${params.voiceId}`);
            }

            const requestBody = {
                text: params.text.trim(),
                voice_id: params.voiceId,
                model_id: 'eleven_monolingual_v1',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: params.style || 0,
                    use_speaker_boost: true
                }
            };

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/text-to-speech', requestBody);
            });

            return {
                url: response.data.audio_url,
                uuid: response.data.request_id,
                state: 'completed',
                duration: response.data.duration,
                metadata: {
                    requestTime: new Date().toISOString(),
                    textLength: params.text.length,
                    settings: requestBody.voice_settings
                }
            };
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error generating speech: ${errorMsg}`);
            return this.getMockSpeechResponse();
        }
    }

    getMockSpeechResponse() {
        return {
            url: '/sounds/test-sound.mp3',
            uuid: 'mock-speech-' + Date.now(),
            state: 'completed',
            duration: 2.5,
            metadata: {
                requestTime: new Date().toISOString(),
                textLength: 0,
                settings: {}
            }
        };
    }

    clearCache() {
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.fxPresetsCache = null;
        this.fxPresetsCacheExpiry = null;
        logger.info('All caches cleared');
    }
}

module.exports = ReplicaAPI;
