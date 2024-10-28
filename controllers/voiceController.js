const voiceService = require('../services/voiceService');
const logger = require('../scripts/logger');

const handleError = (res, error, statusCode = 500) => {
    logger.error(`Voice controller error: ${error.message}`);
    res.status(statusCode).json({
        error: error.message,
        timestamp: new Date().toISOString()
    });
};

exports.getAvailableVoices = async (req, res) => {
    try {
        const voices = await voiceService.getAvailableVoices();
        res.json(voices);
    } catch (error) {
        handleError(res, error);
    }
};

exports.getVoiceSettings = async (req, res) => {
    try {
        const { characterId } = req.params;
        
        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        res.json(voice);
    } catch (error) {
        handleError(res, error);
    }
};

exports.saveVoiceSettings = async (req, res) => {
    try {
        const { characterId, speaker_id, settings } = req.body;

        if (!characterId || !speaker_id) {
            return handleError(res, new Error('Character ID and speaker ID are required'), 400);
        }

        const savedVoice = await voiceService.saveVoice({
            characterId,
            speaker_id,
            settings: settings || {}
        });

        res.json(savedVoice);
    } catch (error) {
        handleError(res, error);
    }
};

exports.generateSpeech = async (req, res) => {
    try {
        const { speaker_id, text, options = {}, style, characterId } = req.body;

        if (!speaker_id || !text) {
            return handleError(res, new Error('Speaker ID and text are required'), 400);
        }

        // Transform style and options into generation options
        const generationOptions = {
            ...options,
            modelChain: 'vox_2_0', // Changed to vox_2_0
            speed: options?.speed || 1.0,
            pitch: options?.pitch || 0,
            volume: options?.volume || 0,
            style,
            characterId // Pass characterId for history tracking
        };

        const result = await voiceService.generateSpeech(speaker_id, text, generationOptions);
        res.json(result);
    } catch (error) {
        // Check for specific error types
        if (error.message.includes('Rate limit')) {
            return handleError(res, error, 429);
        }
        if (error.message.includes('not found')) {
            return handleError(res, error, 404);
        }
        handleError(res, error);
    }
};

exports.getFXPresets = async (req, res) => {
    try {
        const presets = await voiceService.getFXPresets();
        res.json(presets);
    } catch (error) {
        handleError(res, error);
    }
};

exports.getVoicePresets = async (req, res) => {
    try {
        const { characterId } = req.params;
        
        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        res.json(voice.presets || {});
    } catch (error) {
        handleError(res, error);
    }
};

exports.savePreset = async (req, res) => {
    try {
        const { characterId, presetName, settings } = req.body;

        if (!characterId || !presetName) {
            return handleError(res, new Error('Character ID and preset name are required'), 400);
        }

        const voice = await voiceService.saveVoicePreset(characterId, presetName, settings);
        res.json(voice);
    } catch (error) {
        handleError(res, error);
    }
};

exports.deletePreset = async (req, res) => {
    try {
        const { characterId, presetName } = req.params;

        if (!characterId || !presetName) {
            return handleError(res, new Error('Character ID and preset name are required'), 400);
        }

        await voiceService.deleteVoicePreset(characterId, presetName);
        res.json({ message: 'Preset deleted successfully' });
    } catch (error) {
        handleError(res, error);
    }
};

exports.getVoiceHistory = async (req, res) => {
    try {
        const { characterId } = req.params;
        
        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        res.json(voice.history || []);
    } catch (error) {
        handleError(res, error);
    }
};

exports.updateVoiceMetadata = async (req, res) => {
    try {
        const { characterId } = req.params;
        const { metadata } = req.body;

        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        voice.metadata = {
            ...voice.metadata,
            ...metadata,
            lastModified: new Date().toISOString()
        };

        const updatedVoice = await voiceService.saveVoice(voice);
        res.json(updatedVoice);
    } catch (error) {
        handleError(res, error);
    }
};
