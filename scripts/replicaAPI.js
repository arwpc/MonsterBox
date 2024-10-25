class ReplicaAPI {
    constructor() {
        this.apiKey = '7ad443f7-1306-4b4e-b5db-68080b34d093';
        this.baseURL = 'https://api.replicastudios.com';
        
        // Initialize axios with base configuration
        this.client = {
            headers: {
                'X-Api-Key': this.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

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

            const response = await axios.get(`${this.baseURL}/v2/voices`, {
                headers: this.client.headers
            });
            this.voicesCache = response.data;
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
                text: params.text,
                speaker_id: params.voiceId,
                output_format: "mp3",
                sample_rate: 44100
            };

            // Add optional parameters if provided
            if (params.options) {
                Object.assign(requestBody, params.options);
            }

            const response = await axios.post(`${this.baseURL}/speech/synthesize`, requestBody, {
                headers: this.client.headers,
                responseType: 'blob'
            });

            // Create a URL for the audio blob
            const audioUrl = URL.createObjectURL(response.data);
            return { url: audioUrl };
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