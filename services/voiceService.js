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
            bitRate: 128,
            modelChain: 'vox_2_0',
            outputFormat: 'mp3',
            languageCode: 'en'
        };
    }

    async getAllVoices() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            const voices = JSON.parse(data).voices;
            return voices.map(voice => this.normalizeVoiceData(voice));
        } catch (error) {
            logger.error(`Error reading voices: ${error.message}`);
            throw new Error(`Failed to read voices: ${error.message}`);
        }
    }

    normalizeVoiceData(voice) {
        return {
            characterId: voice.characterId,
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
    }

    async getVoiceByCharacterId(characterId) {
        if (!characterId) {
            throw new Error('Character ID is required');
        }

        const voices = await this.getAllVoices();
        const voice = voices.find(v => v.characterId === characterId);
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
            const existingIndex = voices.findIndex(v => v.characterId === voiceData.characterId);

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

    async generateSpeech(text, speaker_id, options = {}, characterId = null) {
        try {
            if (!text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!speaker_id) {
                throw new Error('Speaker ID is required');
            }

            const result = await this.replicaAPI.textToSpeech({
                voiceId: speaker_id,
                text: text.trim(),
                options: {
                    ...this.defaultSettings,
                    ...options,
                    modelChain: 'vox_2_0'
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
                        settings: options,
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
}

module.exports = new VoiceService();
