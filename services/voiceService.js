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
            modelChain: 'vox_2_0', // Changed to vox_2_0
            outputFormat: 'mp3',
            languageCode: 'en',
            style: 'neutral'
        };
    }

    async getAllVoices() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            const voices = JSON.parse(data).voices;
            
            // Ensure all voices have required fields
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
            presets: voice.presets || {},
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
                // Update existing voice while preserving history and metadata
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
                // Add new voice
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
            return await this.replicaAPI.getVoices();
        } catch (error) {
            logger.error(`Error fetching available voices: ${error.message}`);
            throw new Error(`Failed to fetch available voices: ${error.message}`);
        }
    }

    async generateSpeech(speaker_id, text, options = {}) {
        try {
            // Validate input
            if (!text?.trim()) {
                throw new Error('Text is required and must not be empty');
            }

            if (!speaker_id) {
                throw new Error('Speaker ID is required');
            }

            // Normalize and validate options
            const normalizedOptions = this.normalizeGenerationOptions(options);

            const result = await this.replicaAPI.textToSpeech({
                voiceId: speaker_id,
                text: text.trim(),
                options: {
                    ...normalizedOptions,
                    modelChain: 'vox_2_0' // Ensure vox_2_0 model chain is used
                }
            });

            // Add generation to voice history if associated with a character
            if (options.characterId) {
                const voice = await this.getVoiceByCharacterId(options.characterId);
                if (voice) {
                    voice.history.push({
                        timestamp: new Date().toISOString(),
                        type: 'generation',
                        textLength: text.length,
                        settings: normalizedOptions,
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

    normalizeGenerationOptions(options) {
        const normalized = {
            modelChain: 'vox_2_0', // Changed to vox_2_0
            speed: parseFloat(options.speed) || this.defaultSettings.speed,
            pitch: parseInt(options.pitch) || this.defaultSettings.pitch,
            volume: parseInt(options.volume) || this.defaultSettings.volume,
            sampleRate: parseInt(options.sampleRate) || this.defaultSettings.sampleRate,
            bitRate: parseInt(options.bitRate) || this.defaultSettings.bitRate,
            languageCode: options.languageCode || this.defaultSettings.languageCode,
            style: options.style || this.defaultSettings.style
        };

        // Validate ranges
        if (normalized.speed < 0.1 || normalized.speed > 3.0) {
            throw new Error('Speed must be between 0.1 and 3.0');
        }

        if (normalized.pitch < -20 || normalized.pitch > 20) {
            throw new Error('Pitch must be between -20 and 20');
        }

        if (normalized.volume < -20 || normalized.volume > 20) {
            throw new Error('Volume must be between -20 and 20');
        }

        if (![48, 128, 320].includes(normalized.bitRate)) {
            throw new Error('Bit rate must be 48, 128, or 320');
        }

        return normalized;
    }

    async saveVoicePreset(characterId, presetName, settings) {
        try {
            if (!characterId || !presetName?.trim()) {
                throw new Error('Character ID and preset name are required');
            }

            const voice = await this.getVoiceByCharacterId(characterId);
            if (!voice) {
                throw new Error('Voice not found for character');
            }

            // Normalize and validate preset settings
            const normalizedSettings = this.normalizeGenerationOptions(settings);

            voice.presets[presetName.trim()] = {
                ...normalizedSettings,
                created: new Date().toISOString()
            };

            voice.history.push({
                timestamp: new Date().toISOString(),
                type: 'preset_created',
                presetName: presetName.trim(),
                settings: normalizedSettings
            });

            const savedVoice = await this.saveVoice(voice);
            logger.info(`Voice preset "${presetName}" saved for character ${characterId}`);
            
            return savedVoice;
        } catch (error) {
            logger.error(`Error saving voice preset: ${error.message}`);
            throw new Error(`Failed to save preset: ${error.message}`);
        }
    }

    async deleteVoicePreset(characterId, presetName) {
        try {
            const voice = await this.getVoiceByCharacterId(characterId);
            if (!voice) {
                throw new Error('Voice not found for character');
            }

            if (!voice.presets[presetName]) {
                throw new Error('Preset not found');
            }

            delete voice.presets[presetName];
            voice.history.push({
                timestamp: new Date().toISOString(),
                type: 'preset_deleted',
                presetName
            });

            await this.saveVoice(voice);
            logger.info(`Voice preset "${presetName}" deleted for character ${characterId}`);
        } catch (error) {
            logger.error(`Error deleting voice preset: ${error.message}`);
            throw new Error(`Failed to delete preset: ${error.message}`);
        }
    }
}

module.exports = new VoiceService();
