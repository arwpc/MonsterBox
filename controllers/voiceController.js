const voiceService = require('../services/voiceService');
const logger = require('../scripts/logger');

const handleError = (res, error, statusCode = 500) => {
    logger.error(`Voice controller error: ${error.message}`);
    res.status(statusCode).json({
        error: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
};

exports.getAvailableVoices = async (req, res) => {
    try {
        const voices = await voiceService.getAvailableVoices();
        if (!voices || voices.length === 0) {
            return handleError(res, new Error('No voices available'), 404);
        }
        res.json(voices);
    } catch (error) {
        if (error.message.includes('API key is required')) {
            return handleError(res, error, 401);
        }
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
        const { characterId, voiceId, settings } = req.body;

        if (!characterId || !voiceId) {
            return handleError(res, new Error('Character ID and voice ID are required'), 400);
        }

        const savedVoice = await voiceService.saveVoice({
            characterId,
            speaker_id: voiceId,
            settings: settings || {}
        });

        res.json(savedVoice);
    } catch (error) {
        handleError(res, error);
    }
};

exports.generateSpeech = async (req, res) => {
    try {
        const { speaker_id, text, options = {}, characterId } = req.body;

        if (!speaker_id || !text) {
            return handleError(res, new Error('Speaker ID and text are required'), 400);
        }

        // Transform options into generation options
        const generationOptions = {
            ...options,
            speed: options?.speed || 1.0,
            pitch: options?.pitch || 0,
            volume: options?.volume || 0
        };

        const result = await voiceService.generateSpeech(text, speaker_id, generationOptions, characterId);
        res.json(result);
    } catch (error) {
        if (error.message.includes('API key is required')) {
            return handleError(res, error, 401);
        }
        if (error.message.includes('Rate limit')) {
            return handleError(res, error, 429);
        }
        if (error.message.includes('not found')) {
            return handleError(res, error, 404);
        }
        if (error.message.includes('timed out')) {
            return handleError(res, error, 504);
        }
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
