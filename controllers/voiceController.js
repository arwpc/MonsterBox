const voiceService = require('../services/voiceService');
const logger = require('../scripts/logger');

exports.getAvailableVoices = async (req, res) => {
    try {
        const voices = await voiceService.getAvailableVoices();
        res.json(voices);
    } catch (error) {
        logger.error(`Error fetching available voices: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.getVoiceSettings = async (req, res) => {
    try {
        const { characterId } = req.params;
        const voice = await voiceService.getVoiceByCharacterId(characterId);
        res.json(voice || {});
    } catch (error) {
        logger.error(`Error fetching voice settings: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.saveVoiceSettings = async (req, res) => {
    try {
        const voiceData = {
            characterId: req.body.characterId,
            speaker_id: req.body.speaker_id,
            settings: req.body.settings
        };
        const savedVoice = await voiceService.saveVoice(voiceData);
        res.json(savedVoice);
    } catch (error) {
        logger.error(`Error saving voice settings: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.generateSpeech = async (req, res) => {
    try {
        const { speaker_id, text, options, style } = req.body;
        console.log('Generating speech with options:', { speaker_id, text, options, style });

        // Transform style into options object expected by voiceService
        const speechOptions = {
            ...options,
            modelChain: options?.modelId || 'vox_2_0',
            globalPace: options?.speed || 1.0,
            globalPitch: options?.pitch || 0,
            globalVolume: options?.volume || 0,
            style
        };

        const result = await voiceService.generateSpeech(speaker_id, text, speechOptions);
        console.log('Speech generation result:', result);
        res.json(result);
    } catch (error) {
        logger.error(`Error generating speech: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.saveToLibrary = async (req, res) => {
    try {
        const { speaker_id, text, name, options } = req.body;
        const result = await voiceService.saveToLibrary({
            speaker_id,
            text,
            name,
            options
        });
        res.json(result);
    } catch (error) {
        logger.error(`Error saving to library: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};

exports.savePreset = async (req, res) => {
    try {
        const { characterId, presetName, settings } = req.body;
        const voice = await voiceService.saveVoicePreset(characterId, presetName, settings);
        res.json(voice);
    } catch (error) {
        logger.error(`Error saving voice preset: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
};