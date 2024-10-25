const axios = require('axios');

class ReplicaAPI {
    constructor() {
        this.apiKey = '7ad443f7-1306-4b4e-b5db-68080b34d093';
        this.baseURL = 'https://api.replicastudios.com/v2';
        
        // Initialize axios with base configuration
        this.axiosInstance = axios.create({
            baseURL: this.baseURL,
            headers: {
                'X-Api-Key': this.apiKey,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        // Initialize voices cache
        this.voicesCache = null;
    }

    /**
     * Get a list of available voices
     * @returns {Promise} Response containing array of available voices
     */
    async getVoices() {
        try {
            // Use cached voices if available
            if (this.voicesCache) {
                return this.voicesCache;
            }

            const response = await this.axiosInstance.get('/library/voices');
            console.log('Replica API voice response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.items) {
                // Transform the voice items to include both uuid and speaker_id
                const transformedVoices = response.data.items.map(voice => ({
                    ...voice,
                    id: voice.uuid, // Keep uuid as id for compatibility
                    speaker_id: voice.default_style?.speaker_id || voice.uuid
                }));

                this.voicesCache = transformedVoices;
                return transformedVoices;
            } else {
                throw new Error('Invalid API response format');
            }
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            console.error(`Error fetching available voices: ${errorMsg}`);
            throw error;
        }
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
        if (!params.text || typeof params.text !== 'string') {
            throw new Error('Text parameter is required and must be a string');
        }

        if (!params.voiceId || typeof params.voiceId !== 'string') {
            throw new Error('VoiceId parameter is required and must be a string');
        }

        try {
            // Get the voice details to ensure we're using a valid speaker_id
            const voices = await this.getVoices();
            console.log('Looking for voice with ID:', params.voiceId);
            
            const voice = voices.find(v => v.uuid === params.voiceId);
            if (!voice) {
                throw new Error(`Voice not found with ID: ${params.voiceId}`);
            }

            // Ensure bitrate is one of the supported values
            const bitRate = params.options?.bitRate || 128;
            if (![48, 128, 320].includes(bitRate)) {
                throw new Error('Wrong bit rate. Supported values: 48, 128, 320.');
            }

            const requestBody = {
                speaker_id: voice.default_style?.speaker_id || voice.uuid,
                text: params.text,
                model_chain: params.options?.modelChain || 'vox_1_0',
                language_code: params.options?.languageCode || 'en',
                extensions: ['mp3'],
                sample_rate: params.options?.sampleRate || 44100,
                bit_rate: bitRate,
                global_pace: params.options?.globalPace || 1,
                global_pitch: params.options?.globalPitch || 0,
                global_volume: params.options?.globalVolume || 0,
                auto_pitch: params.options?.autoPitch ?? true
            };

            // Add optional metadata and tags
            if (params.options?.userMetadata) {
                requestBody.user_metadata = params.options.userMetadata;
            }
            
            if (params.options?.userTags) {
                requestBody.user_tags = params.options.userTags;
            }

            console.log('Making TTS request with body:', JSON.stringify(requestBody, null, 2));

            const response = await this.axiosInstance.post('/speech/tts', requestBody);

            if (!response.data) {
                throw new Error('No data received from API');
            }

            console.log('TTS response:', JSON.stringify(response.data, null, 2));

            return response.data;
        } catch (error) {
            // Check if it's an API error with specific error message
            if (error.response?.data?.error) {
                console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
                throw new Error(error.response.data.error);
            }
            throw error;
        }
    }

    /**
     * Get voice by name
     * @param {string} name - The name of the voice to find
     * @returns {Promise<Object|null>} The voice object if found, null otherwise
     */
    async getVoiceByName(name) {
        try {
            if (!name || typeof name !== 'string') {
                throw new Error('Name parameter is required and must be a string');
            }

            const voices = await this.getVoices();
            return voices.find(voice => voice.name.toLowerCase() === name.toLowerCase()) || null;
        } catch (error) {
            console.error('Error finding voice by name:', error);
            throw error;
        }
    }
}

module.exports = ReplicaAPI;