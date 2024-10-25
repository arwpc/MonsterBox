const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const ReplicaAPI = require('../scripts/replicaAPI');

class VoiceService {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.replicaAPI = new ReplicaAPI();
    }

    async getAllVoices() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            return JSON.parse(data).voices;
        } catch (error) {
            logger.error(`Error reading voices: ${error.message}`);
            throw error;
        }
    }

    async getVoiceByCharacterId(characterId) {
        const voices = await this.getAllVoices();
        return voices.find(voice => voice.characterId === characterId);
    }

    async saveVoice(voiceData) {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            const voices = JSON.parse(data).voices;
            
            const existingIndex = voices.findIndex(v => v.characterId === voiceData.characterId);
            if (existingIndex !== -1) {
                voices[existingIndex] = { ...voices[existingIndex], ...voiceData };
            } else {
                voices.push(voiceData);
            }

            await fs.writeFile(this.voicesPath, JSON.stringify({ voices }, null, 2));
            logger.info(`Voice settings saved for character ${voiceData.characterId}`);
            return voiceData;
        } catch (error) {
            logger.error(`Error saving voice: ${error.message}`);
            throw error;
        }
    }

    async getAvailableVoices() {
        try {
            return await this.replicaAPI.getVoices();
        } catch (error) {
            logger.error(`Error fetching available voices: ${error.message}`);
            throw error;
        }
    }

    async generateSpeech(speaker_id, text, options = {}) {
        try {
            if (!speaker_id || typeof speaker_id !== 'string') {
                throw new Error('speaker_id parameter is required and must be a string');
            }

            const params = {
                text,
                voiceId: speaker_id, // Map speaker_id to voiceId for Replica API
                options: {
                    modelChain: options.modelId || 'vox_1_0',
                    extensions: ['mp3'],
                    sampleRate: options.sampleRate || 44100,
                    bitRate: options.bitRate || 128,
                    globalPace: options.speed || 1.0,
                    globalPitch: options.pitch || 0,
                    globalVolume: options.volume || 0,
                    autoPitch: options.autoPitch !== undefined ? options.autoPitch : true,
                    languageCode: options.languageCode || 'en',
                    userMetadata: options.userMetadata,
                    userTags: options.userTags
                }
            };

            logger.info(`Generating speech with params: ${JSON.stringify(params)}`);
            const response = await this.replicaAPI.textToSpeech(params);
            
            logger.info(`Speech generated successfully: ${JSON.stringify(response)}`);
            return {
                url: response.url,
                jobId: response.uuid,
                state: response.state,
                duration: response.duration
            };
        } catch (error) {
            logger.error(`Error generating speech: ${error.message}`);
            throw error;
        }
    }

    async saveVoicePreset(characterId, presetName, settings) {
        try {
            const voice = await this.getVoiceByCharacterId(characterId);
            if (!voice) {
                throw new Error('Voice not found for character');
            }

            if (!voice.presets) {
                voice.presets = {};
            }
            voice.presets[presetName] = settings;

            await this.saveVoice(voice);
            logger.info(`Voice preset "${presetName}" saved for character ${characterId}`);
            return voice;
        } catch (error) {
            logger.error(`Error saving voice preset: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new VoiceService();