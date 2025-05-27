const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const OpenAIService = require('../scripts/openAIService');

class VoiceService {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.openAIService = new OpenAIService();
        this.generatedAudioDir = path.join(__dirname, '../public/sounds');

        this.defaultSettings = {
            model: 'tts-1',
            speed: 1.0,
            outputFormat: 'mp3'
        };
        this._ensureGeneratedAudioDir();
    }

    async _ensureGeneratedAudioDir() {
        try {
            await fs.mkdir(this.generatedAudioDir, { recursive: true });
            logger.info(`Ensured generated audio directory exists: ${this.generatedAudioDir}`);
        } catch (error) {
            logger.error(`Error creating generated audio directory ${this.generatedAudioDir}: ${error.message}`);
        }
    }

    async getAllVoices() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            logger.info(`Read voices data from ${this.voicesPath} (length: ${data ? data.length : 0})`);
            const voices = JSON.parse(data).voices;
            return voices.map(voice => this.normalizeVoiceData(voice));
        } catch (error) {
            logger.error(`Error reading voices from ${this.voicesPath}: ${error.message}`);
            throw new Error(`Failed to read voices: ${error.message}`);
        }
    }

    normalizeVoiceData(voice) {
        const normalized = {
            characterId: parseInt(voice.characterId),
            speaker_id: voice.speaker_id,
            settings: { 
                ...this.defaultSettings, 
                ...(voice.settings || {}),
                model: voice.settings?.model || this.defaultSettings.model,
                speed: voice.settings?.speed || this.defaultSettings.speed,
            },
            metadata: voice.metadata || {
                lastUsed: null,
                useCount: 0,
                favorited: false,
                tags: [],
                notes: ''
            },
            history: voice.history || []
        };
        logger.debug(`Normalized voice data for charId: ${normalized.characterId}, speaker_id: ${normalized.speaker_id}`);
        return normalized;
    }

    async getVoiceByCharacterId(characterId) {
        if (!characterId) {
            throw new Error('Character ID is required');
        }

        logger.info(`Getting voice for character ID: ${characterId}`);
        const voices = await this.getAllVoices();
        const parsedCharacterId = parseInt(characterId);
        logger.info(`Looking for character ID: ${parsedCharacterId}`);
        const voice = voices.find(v => v.characterId === parsedCharacterId);
        logger.info(`Voice lookup for charId ${parsedCharacterId}: ${voice ? 'Found (speaker_id: ' + voice.speaker_id + ')' : 'Not found'}`);
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
            const voices = await this.openAIService.getAvailableVoices();
            return voices;
        } catch (error) {
            logger.error(`Error fetching available voices from OpenAIService: ${error.message}`);
            throw new Error(`Failed to fetch available voices: ${error.message}`);
        }
    }

    async generateSpeech(text, speaker_id, options = {}, characterId = null) {
        try {
            if (!text?.trim()) {
                throw new Error('Text parameter is required and must not be empty');
            }
            if (!speaker_id) {
                throw new Error('Speaker ID (OpenAI Voice ID) is required');
            }

            const timestamp = Date.now();
            const filename = `${characterId || 'unknown_char'}_${speaker_id}_${timestamp}.mp3`;
            await this._ensureGeneratedAudioDir(); 
            const outputPath = path.join(this.generatedAudioDir, filename);

            let characterSettings = this.defaultSettings;
            if (characterId) {
                const voiceProfile = await this.getVoiceByCharacterId(characterId);
                if (voiceProfile && voiceProfile.settings) {
                    characterSettings = { ...characterSettings, ...voiceProfile.settings };
                }
            }
            
            const combinedOptions = {
                ...characterSettings, 
                ...options,         
                model: options.model || characterSettings.model || this.defaultSettings.model,
                speed: options.speed || characterSettings.speed || this.defaultSettings.speed,
            };

            const result = await this.openAIService.textToSpeech({
                text: text.trim(),
                voiceId: speaker_id,
                outputPath: outputPath,
                options: {
                    model: combinedOptions.model,
                    speed: combinedOptions.speed,
                }
            });

            if (characterId) {
                const voice = await this.getVoiceByCharacterId(characterId);
                if (voice) {
                    if (!Array.isArray(voice.history)) {
                        voice.history = [];
                    }
                    voice.history.push({
                        timestamp: new Date().toISOString(),
                        type: 'generation_openai',
                        textLength: text.length,
                        settings: {
                            model: combinedOptions.model,
                            speed: combinedOptions.speed,
                            voice: speaker_id
                        },
                        filePath: `/sounds/${filename}` 
                    });
                    voice.metadata = {
                        ...(voice.metadata || {}),
                        lastUsed: new Date().toISOString(),
                        useCount: (voice.metadata?.useCount || 0) + 1
                    };
                    await this.saveVoice(voice); 
                }
            }

            const finalFilePathForReturn = `/sounds/${filename}`;

            logger.info(`Generic speech generated: ${finalFilePathForReturn}`); 
            return {
                success: true,
                filePath: finalFilePathForReturn, 
                characterId: characterId,
                text: text.trim(),
                voiceId: speaker_id,
                fullDiskPath: outputPath 
            };

        } catch (error) {
            logger.error(`Error generating speech with OpenAI: ${error.message}`);
            throw new Error(`OpenAI speech generation failed: ${error.message}`);
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
