const voiceService = require('../services/voiceService');
const soundService = require('../services/soundService');
const logger = require('../scripts/logger');
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
        // If the URL starts with '/sounds/', it's a local file
        if (url.startsWith('/sounds/')) {
            const sourceFile = path.join(process.cwd(), 'public', url);
            // Copy the file to the output path
            await fs.promises.copyFile(sourceFile, outputPath);
            logger.info(`Copied local audio file to ${outputPath}`);
            return outputPath;
        }

        // Otherwise, download from external URL
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
                'Accept': 'audio/*'
            }
        });

        logger.info(`Downloaded audio file, size: ${response.data.length} bytes`);

        // Ensure directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Save the audio data
        fs.writeFileSync(outputPath, Buffer.from(response.data));
        logger.info(`Saved audio file to ${outputPath}`);

        return outputPath;
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

exports.generateAndSaveForScene = async (req, res) => {
    try {
        const { text, characterId } = req.body;
        logger.info(`Generating voice for character ${characterId} with text: ${text}`);

        if (!text || !characterId) {
            return handleError(res, new Error('Text and character ID are required'), 400);
        }

        // Get voice settings for the character
        logger.info(`Getting voice settings for character ${characterId}`);
        const voice = await voiceService.getVoiceByCharacterId(characterId);
        logger.info(`Voice settings retrieved:`, voice);

        if (!voice || !voice.speaker_id) {
            logger.error(`No voice configuration found for character ${characterId}`);
            return handleError(res, new Error('No voice configured for this character'), 404);
        }

        // Generate the speech using character's voice settings
        logger.info(`Generating speech with speaker_id: ${voice.speaker_id}`);
        const result = await voiceService.generateSpeech(text, voice.speaker_id, voice.settings || {}, characterId);
        logger.info(`Speech generation result:`, result);

        // Create filename and path
        const timestamp = Date.now();
        const sanitizedText = text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}-${sanitizedText}.mp3`;
        const filePath = path.join('public', 'sounds', filename);
        const absolutePath = path.resolve(__dirname, '..', filePath);
        logger.info(`File path: ${absolutePath}`);

        try {
            // Download the audio file
            logger.info(`Downloading audio from ${result.url}`);
            await downloadAudio(result.url, absolutePath);
            logger.info(`Audio saved to ${absolutePath}`);

            // Create sound entry in the library
            logger.info(`Creating sound entry in library`);
            const soundEntry = await soundService.createSound({
                name: text,
                filename: path.basename(absolutePath),
                file: path.basename(absolutePath),
                characterIds: [parseInt(characterId)],
                type: 'voice',
                created: new Date().toISOString(),
                metadata: {
                    originalText: text,
                    voiceId: voice.speaker_id,
                    voiceSettings: voice.settings || {}
                }
            });
            logger.info(`Sound entry created:`, soundEntry);

            res.json({
                success: true,
                soundId: soundEntry.id,
                filename: path.basename(absolutePath),
                path: absolutePath
            });
        } catch (err) {
            logger.error(`Failed to process audio file: ${err.message}`);
            if (fs.existsSync(absolutePath)) {
                try {
                    fs.unlinkSync(absolutePath);
                    logger.info(`Cleaned up file after error`);
                } catch (cleanupError) {
                    logger.error(`Failed to clean up file: ${cleanupError.message}`);
                }
            }
            throw err;
        }
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
            volume: options?.volume || 0,
            extensions: ['mp3'],  // Request MP3 format directly
            bitRate: 128  // Standard MP3 bitrate
        };

        // Generate the speech
        const result = await voiceService.generateSpeech(text, speaker_id, generationOptions, characterId);

        // Create filename and path
        const timestamp = Date.now();
        const sanitizedText = text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${timestamp}-${sanitizedText}.mp3`;
        const filePath = path.join('public', 'sounds', filename);
        const absolutePath = path.resolve(__dirname, '..', filePath);

        try {
            // Download the audio file
            await downloadAudio(result.url, absolutePath);
            logger.info(`Downloaded audio file to ${absolutePath}`);

            res.json({
                success: true,
                filename: path.basename(absolutePath),
                path: absolutePath,
                url: result.url,
                duration: result.duration,
                metadata: result.metadata
            });
        } catch (err) {
            logger.error(`Failed to process audio file: ${err.message}`);
            if (fs.existsSync(absolutePath)) {
                try {
                    fs.unlinkSync(absolutePath);
                } catch (cleanupError) {
                    logger.error(`Failed to clean up file: ${cleanupError.message}`);
                }
            }
            throw err;
        }
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
