const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

class VoiceService {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.defaultSettings = {
            pitch: 0,
            speed: 1,
            volume: 0,
            emotion: 'Neutral',
            sampleRate: 44100,
            bitRate: 128,
            outputFormat: 'wav',
            channels: 1,
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
        // Reduce logging verbosity - only log errors and warnings
        logger.debug(`Normalized voice data for character ${voice.characterId}`);
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
                        ...(existing.history || []).slice(-10), // Keep only last 10 history entries to reduce spam
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
            logger.debug(`Voice settings saved for character ${voiceData.characterId}`);
            
            return existingIndex !== -1 ? voices[existingIndex] : voices[voices.length - 1];
        } catch (error) {
            logger.error(`Error saving voice: ${error.message}`);
            throw new Error(`Failed to save voice: ${error.message}`);
        }
    }

    async getAvailableVoices() {
        try {
            const voices = await this.topMediaiAPI.getVoices();
            return voices;
        } catch (error) {
            logger.error(`Error fetching available voices: ${error.message}`);
            throw new Error(`Failed to fetch available voices: ${error.message}`);
        }
    }

    async getVoiceCapabilities(speaker_id) {
        const voices = await this.getAvailableVoices();
        const voice = voices.find(v => v.speaker_id === speaker_id);

        if (!voice) {
            throw new Error('Voice not found');
        }

        return {
            emotions: voice.emotions || ['Neutral'],
            supportsEmotionControl: voice.capabilities?.emotion_control || false,
            supportsSpeedControl: voice.capabilities?.speed_control || false,
            supportsPitchControl: voice.capabilities?.pitch_control || false,
            language: voice.language,
            gender: voice.gender,
            age: voice.age,
            isVip: voice.isVip,
            isFree: voice.isFree
        };
    }

    async generateSpeech(text, speaker_id, options = {}, characterId = null) {
        try {
            if (!text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }

            if (!speaker_id) {
                throw new Error('Speaker ID is required');
            }

            // ElevenLabs integration - delegate to ElevenLabs service
            if (global.elevenLabsService) {
                logger.info('Using ElevenLabs for speech generation');
                // This would be handled by the ElevenLabs conversational AI service
                throw new Error('Speech generation now handled by ElevenLabs Conversational AI service');
            }

            throw new Error('No speech generation service available. Please use ElevenLabs Conversational AI.');

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

    /**
     * Update voice settings for a character and automatically save them
     */
    async updateVoiceSettings(characterId, settings) {
        try {
            if (!characterId) {
                throw new Error('Character ID is required');
            }

            logger.debug(`Updating voice settings for character ${characterId}`);

            // Get existing voice configuration
            let voice = await this.getVoiceByCharacterId(characterId);

            if (!voice) {
                // Create new voice configuration with default speaker if none exists
                const availableVoices = await this.getAvailableVoices();
                if (!availableVoices || availableVoices.length === 0) {
                    throw new Error('No available voices found');
                }

                voice = {
                    characterId: parseInt(characterId),
                    speaker_id: availableVoices[0].uuid,
                    settings: { ...this.defaultSettings },
                    metadata: {
                        lastUsed: null,
                        useCount: 0,
                        favorited: false,
                        tags: [],
                        notes: '',
                        voiceName: availableVoices[0].name,
                        voiceGender: availableVoices[0].gender,
                        voiceLanguage: availableVoices[0].language
                    }
                };
            }

            // Update settings with new values
            voice.settings = {
                ...voice.settings,
                ...settings,
                // Ensure WAV format for ElevenLabs
                outputFormat: 'wav',
                provider: 'ElevenLabs'
            };

            // Save the updated voice configuration
            const savedVoice = await this.saveVoice(voice);

            logger.debug(`Voice settings updated and saved for character ${characterId}`);
            return savedVoice;

        } catch (error) {
            logger.error(`Error updating voice settings: ${error.message}`);
            throw new Error(`Failed to update voice settings: ${error.message}`);
        }
    }

    /**
     * Get voice settings for a character, creating defaults if none exist
     */
    async getVoiceSettings(characterId) {
        try {
            if (!characterId) {
                throw new Error('Character ID is required');
            }

            let voice = await this.getVoiceByCharacterId(characterId);

            if (!voice) {
                // Create default voice settings for this character
                logger.info(`Creating default voice settings for character ${characterId}`);
                voice = await this.updateVoiceSettings(characterId, {});
            }

            return {
                characterId: voice.characterId,
                speaker_id: voice.speaker_id,
                settings: voice.settings,
                metadata: voice.metadata
            };

        } catch (error) {
            logger.error(`Error getting voice settings: ${error.message}`);
            throw new Error(`Failed to get voice settings: ${error.message}`);
        }
    }
}

module.exports = new VoiceService();
