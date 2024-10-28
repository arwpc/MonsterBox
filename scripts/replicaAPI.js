const axios = require('axios');
const logger = require('./logger');

class ReplicaAPI {
    constructor() {
        this.apiKey = process.env.REPLICA_API_KEY || 'f64f3f2e-f575-494d-a1b2-bbfb60e3f558';
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
        this.cacheLifetime = 5 * 60 * 1000;

        if (!this.apiKey) {
            logger.error('REPLICA_API_KEY environment variable is not set');
            throw new Error('API key is required');
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
                gender: voice.metadata?.gender || 'unknown',
                age: voice.metadata?.voiceAge || 'unknown',
                accent: voice.metadata?.accent || 'unknown',
                speaker_id: voice.default_style?.speaker_id || voice.uuid,
                capabilities: voice.default_style?.capabilities || {
                    'tts.vox_1_0': false,
                    'tts.vox_2_0': false,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                }
            }));

            this.voicesCache = transformedVoices;
            this.voicesCacheExpiry = Date.now() + this.cacheLifetime;

            return transformedVoices;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error fetching available voices: ${errorMsg}`);
            throw error;
        }
    }

    async textToSpeech(params) {
        try {
            if (!params.text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!params.voiceId) {
                throw new Error('VoiceId parameter is required');
            }

            await this.checkRateLimit();

            const requestBody = {
                speaker_id: params.voiceId,
                text: params.text.trim(),
                extensions: ['mp3'],
                sample_rate: params.options?.sampleRate || 44100,
                bit_rate: params.options?.bitRate || 128,
                global_pace: params.options?.speed || 1,
                model_chain: params.options?.modelChain || 'vox_2_0',
                language_code: params.options?.languageCode || 'en',
                global_pitch: params.options?.pitch || 0,
                auto_pitch: true,
                global_volume: params.options?.volume || 0,
                user_metadata: params.options?.metadata || {}
            };

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/speech/tts', requestBody);
            });

            if (!response.data?.uuid) {
                throw new Error('Invalid API response format');
            }

            // Poll for completion
            const jobId = response.data.uuid;
            let jobStatus;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout
            
            do {
                await new Promise(resolve => setTimeout(resolve, 1000));
                jobStatus = await this.retryWithBackoff(async () => {
                    return await this.axiosInstance.get(`/speech/${jobId}`);
                });
                attempts++;
                
                if (attempts >= maxAttempts) {
                    throw new Error('Speech generation timed out');
                }
            } while (jobStatus.data.state === 'PENDING');

            if (jobStatus.data.state !== 'SUCCESS') {
                throw new Error(`Speech generation failed: ${jobStatus.data.state}`);
            }

            return {
                url: jobStatus.data.url,
                uuid: jobStatus.data.uuid,
                state: jobStatus.data.state,
                duration: jobStatus.data.duration,
                metadata: {
                    requestTime: new Date().toISOString(),
                    textLength: params.text.length,
                    settings: requestBody
                }
            };
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error generating speech: ${errorMsg}`);
            throw error;
        }
    }

    clearCache() {
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        logger.info('Cache cleared');
    }
}

module.exports = ReplicaAPI;
