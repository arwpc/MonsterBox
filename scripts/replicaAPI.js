const axios = require('axios');
const logger = require('./logger');

class ReplicaAPI {
    constructor() {
        this.apiKey = process.env.REPLICA_API_KEY;
        this.baseURL = 'https://api.replicastudios.com/v2';
        this.requestCount = 0;
        this.lastRequestTime = Date.now();
        this.rateLimitPerMinute = 100;
        
        // Initialize axios with base configuration
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            headers: {
                ...(this.apiKey && { 'X-Api-Key': this.apiKey }),
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        // Initialize caches with expiration
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.fxPresetsCache = null;
        this.fxPresetsCacheExpiry = null;
        this.cacheLifetime = 5 * 60 * 1000; // 5 minutes

        if (!this.apiKey) {
            logger.warn('REPLICA_API_KEY environment variable is not set. Voice generation features will be limited.');
        }
    }

    async checkRateLimit() {
        const now = Date.now();
        const timeWindow = 60 * 1000; // 1 minute in milliseconds
        
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

    /**
     * Get a list of available voices
     * @returns {Promise} Response containing array of available voices
     */
    async getVoices() {
        try {
            if (!this.apiKey) {
                return this.getMockVoices();
            }

            await this.checkRateLimit();

            // Return cached voices if still valid
            if (this.voicesCache && this.voicesCacheExpiry > Date.now()) {
                return this.voicesCache;
            }

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/library/voices');
            });

            if (!response.data?.items) {
                throw new Error('Invalid API response format');
            }

            // Transform and cache the voice items
            const transformedVoices = response.data.items.map(voice => ({
                ...voice,
                id: voice.uuid,
                speaker_id: voice.default_style?.speaker_id || voice.uuid,
                capabilities: voice.default_style?.capabilities || {
                    'tts.vox_1_0': false,
                    'tts.vox_2_0': false,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                },
                metadata: {
                    lastUsed: null,
                    useCount: 0,
                    averageRating: null,
                    tags: []
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

    /**
     * Get available FX presets
     * @returns {Promise} Response containing array of available FX presets
     */
    async getFXPresets() {
        try {
            if (!this.apiKey) {
                return this.getMockFXPresets();
            }

            await this.checkRateLimit();

            // Return cached presets if still valid
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
        // Return a set of mock voices for testing/development
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
                },
                metadata: {
                    lastUsed: null,
                    useCount: 0,
                    averageRating: null,
                    tags: ['monster', 'deep', 'scary']
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
                    'tts.vox_2_0': false,
                    'sts.vox_1_0': false,
                    'sts.vox_2_0': false
                },
                metadata: {
                    lastUsed: null,
                    useCount: 0,
                    averageRating: null,
                    tags: ['witch', 'creepy', 'scary']
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
                },
                metadata: {
                    lastUsed: null,
                    useCount: 0,
                    averageRating: null,
                    tags: ['ghost', 'child', 'eerie']
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

    /**
     * Initialize text to speech with the provided text
     * @param {Object} params
     * @param {string} params.text - The text to convert to speech
     * @param {string} params.voiceId - The ID of the voice to use
     * @param {Object} [params.options] - Additional options
     * @returns {Promise} Response containing the speech URL and metadata
     */
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

            // Get the voice details to ensure we're using a valid speaker_id
            const voices = await this.getVoices();
            const voice = voices.find(v => v.uuid === params.voiceId);
            
            if (!voice) {
                throw new Error(`Voice not found with ID: ${params.voiceId}`);
            }

            // Get user preferences for model chain order
            const userPrefs = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.get('/userinfo/preferences');
            });

            // Determine best model chain based on voice capabilities and user preferences
            const modelChain = this.determineModelChain(voice.capabilities, userPrefs.data?.preferences?.preferred_model_chain_order);

            // Validate and normalize options
            const bitRate = params.options?.bitRate || 128;
            if (![48, 128, 320].includes(bitRate)) {
                throw new Error('Invalid bit rate. Supported values: 48, 128, 320.');
            }

            const requestBody = {
                speaker_id: voice.default_style?.speaker_id || voice.uuid,
                text: params.text.trim(),
                model_chain: modelChain,
                language_code: params.options?.languageCode || 'en',
                extensions: ['mp3'],
                sample_rate: params.options?.sampleRate || 44100,
                bit_rate: bitRate,
                global_pace: Math.max(0.1, Math.min(3.0, params.options?.globalPace || 1)),
                global_pitch: Math.max(-20, Math.min(20, params.options?.globalPitch || 0)),
                global_volume: Math.max(-20, Math.min(20, params.options?.globalVolume || 0)),
                auto_pitch: params.options?.autoPitch ?? true
            };

            // Add effects preset if specified
            if (params.options?.effects_preset_id) {
                requestBody.effects_preset_id = params.options.effects_preset_id;
            }

            // Add optional metadata and tags
            if (params.options?.userMetadata) {
                requestBody.user_metadata = params.options.userMetadata;
            }
            
            if (params.options?.userTags) {
                requestBody.user_tags = params.options.userTags;
            }

            logger.info('Making TTS request', { 
                voiceId: params.voiceId, 
                textLength: params.text.length,
                modelChain
            });

            const response = await this.retryWithBackoff(async () => {
                return await this.axiosInstance.post('/speech/tts', requestBody);
            });

            if (!response.data) {
                throw new Error('No data received from API');
            }

            logger.info('TTS request successful', { 
                voiceId: params.voiceId, 
                duration: response.data.duration,
                modelChain
            });

            return {
                ...response.data,
                metadata: {
                    requestTime: new Date().toISOString(),
                    textLength: params.text.length,
                    settings: requestBody
                }
            };
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            logger.error(`Error generating speech: ${errorMsg}`);
            return this.getMockSpeechResponse();
        }
    }

    determineModelChain(voiceCapabilities, userPreferences = ['vox_2_0', 'vox_1_0']) {
        // Check each preferred model chain in order
        for (const chain of userPreferences) {
            const capability = `tts.${chain}`;
            if (voiceCapabilities[capability]) {
                return chain;
            }
        }
        // Default to vox_1_0 if no preferred chains are supported
        return 'vox_1_0';
    }

    getMockSpeechResponse() {
        // Return a mock speech response with a test audio file
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

    /**
     * Get voice by name
     * @param {string} name - The name of the voice to find
     * @returns {Promise<Object|null>} The voice object if found, null otherwise
     */
    async getVoiceByName(name) {
        try {
            if (!name?.trim()) {
                throw new Error('Name parameter is required and must not be empty');
            }

            const voices = await this.getVoices();
            return voices.find(voice => voice.name.toLowerCase() === name.toLowerCase()) || null;
        } catch (error) {
            logger.error('Error finding voice by name:', error);
            throw new Error(`Failed to find voice: ${error.message}`);
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.voicesCache = null;
        this.voicesCacheExpiry = null;
        this.fxPresetsCache = null;
        this.fxPresetsCacheExpiry = null;
        logger.info('All caches cleared');
    }
}

module.exports = ReplicaAPI;
