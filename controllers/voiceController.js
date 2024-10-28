const voiceService = require('../services/voiceService');
const logger = require('../scripts/logger');
const { standardizeMP3 } = require('../scripts/audioUtils');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const handleError = (res, error, statusCode = 500) => {
    logger.error(`Voice controller error: ${error.message}`);
    res.status(statusCode).json({
        error: error.message || 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
};

async function downloadAudio(url, outputPath) {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'Accept': 'audio/mpeg'
            }
        });

        logger.info(`Downloaded audio file, size: ${response.data.length} bytes`);
        fs.writeFileSync(outputPath, response.data);
        logger.info(`Saved audio file to ${outputPath}`);
        
        return true;
    } catch (error) {
        logger.error(`Failed to download audio: ${error.message}`);
        throw error;
    }
}

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

        // Generate the speech
        const result = await voiceService.generateSpeech(text, speaker_id, generationOptions, characterId);

        // Create filename and path
        const timestamp = Date.now();
        const sanitizedText = text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}-${sanitizedText}.mp3`;
        const outputPath = path.join('public', 'sounds', filename);

        // Download the audio file
        await downloadAudio(result.url, outputPath);

        // Convert to standardized MP3 format
        try {
            await standardizeMP3(outputPath);
            logger.info(`Successfully converted ${filename} to standardized format`);
        } catch (err) {
            logger.error(`Failed to convert ${filename}: ${err.message}`);
            // Continue even if conversion fails - original file still exists
        }

        res.json({
            success: true,
            filename: filename,
            path: `/sounds/${filename}`,
            duration: result.duration,
            metadata: result.metadata
        });
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

exports.deleteVoiceHistory = async (req, res) => {
    try {
        const { characterId } = req.params;
        
        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        voice.history = [];
        const updatedVoice = await voiceService.saveVoice(voice);
        res.json({ success: true, message: 'Voice history cleared' });
    } catch (error) {
        handleError(res, error);
    }
};

exports.getVoiceStats = async (req, res) => {
    try {
        const { characterId } = req.params;
        
        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        const voice = await voiceService.getVoiceByCharacterId(characterId);
        
        if (!voice) {
            return handleError(res, new Error('Voice not found'), 404);
        }

        const stats = {
            totalGenerations: voice.history?.length || 0,
            lastGenerated: voice.history?.[0]?.timestamp || null,
            averageDuration: voice.history?.reduce((acc, curr) => acc + (curr.duration || 0), 0) / (voice.history?.length || 1),
            settings: voice.settings || {},
            metadata: voice.metadata || {}
        };

        res.json(stats);
    } catch (error) {
        handleError(res, error);
    }
};

exports.testVoiceConnection = async (req, res) => {
    try {
        const { speaker_id } = req.body;

        if (!speaker_id) {
            return handleError(res, new Error('Speaker ID is required'), 400);
        }

        const testResult = await voiceService.testConnection(speaker_id);
        res.json(testResult);
    } catch (error) {
        if (error.message.includes('API key is required')) {
            return handleError(res, error, 401);
        }
        handleError(res, error);
    }
};
