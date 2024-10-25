const voiceService = require('../services/voiceService');
const soundService = require('../services/soundService');
const logger = require('../scripts/logger');

class VoiceController {
    async getAvailableVoices(req, res) {
        try {
            const voices = await voiceService.getAvailableVoices();
            res.json(voices);
        } catch (error) {
            logger.error(`Error fetching available voices: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    async getVoiceSettings(req, res) {
        try {
            const { characterId } = req.params;
            const voice = await voiceService.getVoiceByCharacterId(characterId);
            res.json(voice || {});
        } catch (error) {
            logger.error(`Error fetching voice settings: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    async saveVoiceSettings(req, res) {
        try {
            const voiceData = req.body;
            const savedVoice = await voiceService.saveVoice(voiceData);
            res.json(savedVoice);
        } catch (error) {
            logger.error(`Error saving voice settings: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    async generateSpeech(req, res) {
        try {
            const { speaker_id, text, characterId, ...options } = req.body;
            
            // Add session metadata
            options.userMetadata = {
                session_id: req.session?.id || 'default',
                character_id: characterId
            };

            const speech = await voiceService.generateSpeech(speaker_id, text, options);
            res.json(speech);
        } catch (error) {
            logger.error(`Error generating speech: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    async saveToSoundLibrary(req, res) {
        try {
            const { speaker_id, text, characterId, name, ...options } = req.body;
            
            // Add session and sound library metadata
            options.userMetadata = {
                session_id: req.session?.id || 'default',
                character_id: characterId,
                sound_name: name,
                library_save: true
            };

            const speech = await voiceService.generateSpeech(speaker_id, text, options);
            
            // Save the generated speech to the sound library
            const sound = await soundService.saveSound({
                name,
                file: speech.url,
                characterId
            });

            res.json(sound);
        } catch (error) {
            logger.error(`Error saving to sound library: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }

    async saveVoicePreset(req, res) {
        try {
            const { characterId, presetName, settings } = req.body;
            const voice = await voiceService.saveVoicePreset(characterId, presetName, settings);
            res.json(voice);
        } catch (error) {
            logger.error(`Error saving voice preset: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new VoiceController();