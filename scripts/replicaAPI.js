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

            if (response.data && response.data.items) {
                this.voicesCache = response.data.items;
                return response.data.items;
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
            const voice = voices.find(v => v.uuid === params.voiceId);
            
            // If no voice found with that UUID, try matching by speaker_id
            if (!voice && !voices.some(v => v.default_style?.speaker_id === params.voiceId)) {
                throw new Error(`Voice not found with ID: ${params.voiceId}`);
            }

            const requestBody = {
                speaker_id: voice ? voice.default_style?.speaker_id || voice.uuid : params.voiceId,
                text: params.text,
                model_chain: params.options?.modelChain || 'vox_1_0',
                language_code: params.options?.languageCode || 'en',
                extensions: ['mp3'],
                sample_rate: 44100,
                bit_rate: 128,
                global_pace: 1,
                global_pitch: 0,
                global_volume: 0,
                auto_pitch: true
            };

            // Add optional metadata and tags if provided
            if (params.options?.userMetadata) {
                requestBody.user_metadata = params.options.userMetadata;
            }
            
            if (params.options?.userTags) {
                requestBody.user_tags = params.options.userTags;
            }

            if (params.options?.globalPace != null) requestBody.global_pace = params.options.globalPace;
            if (params.options?.globalPitch != null) requestBody.global_pitch = params.options.globalPitch;
            if (params.options?.globalVolume != null) requestBody.global_volume = params.options.globalVolume;
            if (params.options?.autoPitch != null) requestBody.auto_pitch = params.options.autoPitch;

            console.log('Making TTS request with body:', JSON.stringify(requestBody, null, 2));

            const response = await this.axiosInstance.post('/speech/tts', requestBody);

            if (!response.data) {
                throw new Error('No data received from API');
            }

            console.log('TTS response:', JSON.stringify(response.data, null, 2));

            return response.data;
        } catch (error) {
            const errorMsg = error.response?.data?.error || error.message;
            console.error(`Error generating text to speech: ${errorMsg}`);

            if (error.response?.data) {
                console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
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