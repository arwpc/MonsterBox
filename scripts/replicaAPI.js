const axios = require('axios');

class ReplicaAPI {
    constructor() {
        this.apiKey = '7ad443f7-1306-4b4e-b5db-68080b34d093';
        this.baseURL = 'https://api.replicastudios.com/v2';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
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

            const response = await this.client.get('/voices');
            this.voicesCache = response.data;
            return response.data;
        } catch (error) {
            console.error('Replica API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get details about a specific voice
     * @param {string} voiceId - The ID of the voice to get details for
     * @returns {Promise} Response containing voice details
     */
    async getVoiceDetails(voiceId) {
        try {
            const response = await this.client.get(`/voices/${voiceId}`);
            return response.data;
        } catch (error) {
            console.error('Replica API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Initialize text to speech with the provided text
     * @param {Object} params
     * @param {string} params.text - The text to convert to speech
     * @param {string} params.voiceId - The ID of the voice to use
     * @param {Object} [params.options] - Additional options like speaking_rate, volume, etc.
     * @returns {Promise} Response containing the speech URL and metadata
     */
    async textToSpeech(params) {
        try {
            const requestBody = {
                speaker_id: params.voiceId,
                text: params.text,
                model_chain: 'latest',
                language_code: 'en'
            };

            // Add optional parameters if provided
            if (params.options) {
                Object.assign(requestBody, params.options);
            }

            const response = await this.client.post('/speech/tts', requestBody);
            return response.data;
        } catch (error) {
            console.error('Replica API Error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Convert text to speech using SSML for more control
     * @param {Object} params
     * @param {string} params.ssml - The SSML markup text
     * @param {string} params.voiceId - The ID of the voice to use
     * @param {Object} [params.options] - Additional options
     * @returns {Promise} Response containing the speech URL and metadata
     */
    async textToSpeechSSML(params) {
        try {
            const requestBody = {
                speaker_id: params.voiceId,
                ssml: params.ssml,
                model_chain: 'latest',
                language_code: 'en'
            };

            // Add optional parameters if provided
            if (params.options) {
                Object.assign(requestBody, params.options);
            }

            const response = await this.client.post('/speech/tts', requestBody);
            return response.data;
        } catch (error) {
            console.error('Replica API Error:', error.response?.data || error.message);
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
            const voices = await this.getVoices();
            return voices.find(voice => voice.name.toLowerCase() === name.toLowerCase()) || null;
        } catch (error) {
            console.error('Error finding voice by name:', error);
            throw error;
        }
    }
}

module.exports = ReplicaAPI;