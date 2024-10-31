const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const ReplicaAPI = require('../scripts/replicaAPI');

class VoiceService {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.replicaAPI = new ReplicaAPI();
        this.defaultSettings = {
            pitch: 0,
            speed: 1,
            volume: 0,
            sampleRate: 44100,
            bitRate: 128,  // Standard MP3 bitrate
            outputFormat: 'mp3',  // Request MP3 format directly
            languageCode: 'en'
        };
    }

    async getAllVoices() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            logger.info(`Read voices data: ${data}`);
            const voices = JSON.parse(data).voices;
            return voices.map(voice => this.normalizeVoiceData(voice));
        } catch (error) {
            logger.error(`Error reading voices: ${error.message}`);
            throw new Error(`Failed to read voices: ${error.message}`);
        }
    }

    normalizeVoiceData(voice) {
        const normalized = {
            characterId: parseInt(voice.characterId),
            speaker_id: voice.speaker_id,
            settings: { ...this.defaultSettings, ...voice.settings },
            metadata: voice.metadata || {
                lastUsed: null,
                useCount: 0,
                favorited: false,
                tags: [],
                notes: ''
            },
            history: voice.history || []
        };
        logger.info(`Normalized voice data: ${JSON.stringify(normalized)}`);
        return normalized;
    }

    async getVoiceByCharacterId(characterId) {
        if (!characterId) {
            throw new Error('Character ID is required');
        }

        logger.info(`Getting voice for character ID: ${characterId}`);
        const voices = await this.getAllVoices();
        logger.info(`Found ${voices.length} voices`);
        const parsedCharacterId = parseInt(characterId);
        logger.info(`Looking for character ID: ${parsedCharacterId}`);
        const voice = voices.find(v => v.characterId === parsedCharacterId);
        logger.info(`Found voice: ${voice ? JSON.stringify(voice) : 'null'}`);
        return voice ? this.normalizeVoiceData(voice) : null;
    }

    async saveVoice(voiceData) {
        try {
            if (!voiceData.characterId || !voiceData.speaker_id) {
                throw new Error('Character ID and speaker ID are required');
            }

            const data = await fs.readFile(this.voicesPath, 'utf8');
            const voices = JSON.parse(data).voices;
            
            const normalizedVoice = this.normalizeVoiceData(voiceData);
            const existingIndex = voices.findIndex(v => parseInt(v.characterId) === parseInt(voiceData.characterId));

            if (existingIndex !== -1) {
                const existing = voices[existingIndex];
                voices[existingIndex] = {
                    ...normalizedVoice,
                    metadata: {
                        ...existing.metadata,
                        ...normalizedVoice.metadata,
                        lastModified: new Date().toISOString()
                    },
                    history: [
                        ...(existing.history || []),
                        {
                            timestamp: new Date().toISOString(),
                            type: 'settings_update',
                            settings: normalizedVoice.settings
                        }
                    ]
                };
            } else {
                voices.push({
                    ...normalizedVoice,
                    metadata: {
                        ...normalizedVoice.metadata,
                        created: new Date().toISOString(),
                        lastModified: new Date().toISOString()
                    },
                    history: [{
                        timestamp: new Date().toISOString(),
                        type: 'created',
                        settings: normalizedVoice.settings
                    }]
                });
            }

            await fs.writeFile(this.voicesPath, JSON.stringify({ voices }, null, 2));
            logger.info(`Voice settings saved for character ${voiceData.characterId}`);
            
            return existingIndex !== -1 ? voices[existingIndex] : voices[voices.length - 1];
        } catch (error) {
            logger.error(`Error saving voice: ${error.message}`);
            throw new Error(`Failed to save voice: ${error.message}`);
        }
    }

    async getAvailableVoices() {
        try {
            const voices = await this.replicaAPI.getVoices();
            return voices;
        } catch (error) {
            logger.error(`Error fetching available voices: ${error.message}`);
            throw new Error(`Failed to fetch available voices: ${error.message}`);
        }
    }

    async determineModelChain(speaker_id) {
        const voices = await this.getAvailableVoices();
        const voice = voices.find(v => v.speaker_id === speaker_id);
        
        if (!voice) {
            throw new Error('Voice not found');
        }

        const capabilities = voice.capabilities || {};
        
        // Check for vox_2_0 first, fall back to vox_1_0 if available
        if (capabilities['tts.vox_2_0']) {
            return 'vox_2_0';
        } else if (capabilities['tts.vox_1_0']) {
            return 'vox_1_0';
        } else {
            throw new Error('Voice does not support any available model chains');
        }
    }

    async generateSpeech(text, speaker_id, options = {}, characterId = null) {
        try {
            if (!text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!speaker_id) {
                throw new Error('Speaker ID is required');
            }

            // Determine the appropriate model chain for this voice
            const modelChain = await this.determineModelChain(speaker_id);

            const result = await this.replicaAPI.textToSpeech({
                voiceId: speaker_id,
                text: text.trim(),
                options: {
                    ...this.defaultSettings,
                    ...options,
                    modelChain,
                    extensions: ['mp3'],  // Request MP3 format directly
                    bitRate: 128  // Standard MP3 bitrate
                }
            });

            // Add generation to voice history if associated with a character
            if (characterId) {
                const voice = await this.getVoiceByCharacterId(characterId);
                if (voice) {
                    voice.history.push({
                        timestamp: new Date().toISOString(),
                        type: 'generation',
                        textLength: text.length,
                        settings: { ...options, modelChain },
                        duration: result.duration
                    });
                    await this.saveVoice(voice);
                }
            }

            return result;
        } catch (error) {
            logger.error(`Error generating speech: ${error.message}`);
            throw new Error(`Speech generation failed: ${error.message}`);
        }
    }

    async testConnection(speaker_id) {
        try {
            if (!speaker_id) {
                throw new Error('Speaker ID is required');
            }

            const voices = await this.getAvailableVoices();
            const voice = voices.find(v => v.speaker_id === speaker_id);

            if (!voice) {
                throw new Error('Voice not found');
            }

            return {
                success: true,
                voice: voice,
                message: 'Successfully connected to voice service'
            };
        } catch (error) {
            logger.error(`Error testing connection: ${error.message}`);
            throw new Error(`Connection test failed: ${error.message}`);
        }
    }
}

module.exports = new VoiceService();
