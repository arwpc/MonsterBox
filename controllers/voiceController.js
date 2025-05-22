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
        logger.info(`Generating voice for character ${characterId} with text: ${text} (OpenAI)`);

        if (!text || !characterId) {
            return handleError(res, new Error('Text and character ID are required'), 400);
        }

        logger.info(`Getting voice settings for character ${characterId}`);
        const voice = await voiceService.getVoiceByCharacterId(characterId);
        // logger.info(`Voice settings retrieved:`, voice); // Can be verbose

        if (!voice || !voice.speaker_id) {
            logger.error(`No voice configuration found for character ${characterId}`);
            return handleError(res, new Error('No voice configured for this character'), 404);
        }

        logger.info(`Generating speech with OpenAI voice_id: ${voice.speaker_id}, settings: ${JSON.stringify(voice.settings)}`);
        // voice.settings will be merged with defaults in voiceService.generateSpeech
        const generationResult = await voiceService.generateSpeech(text, voice.speaker_id, voice.settings || {}, characterId);
        logger.info(`Speech generation result:`, generationResult);

        if (!generationResult || !generationResult.filePath) {
            logger.error('Speech generation failed to return a file path.');
            return handleError(res, new Error('Speech generation failed'), 500);
        }

        const absolutePath = generationResult.filePath;
        const generatedFilename = path.basename(absolutePath);
        // Web-accessible path: /audio/generated/filename.mp3
        const webPath = `/audio/generated/${generatedFilename}`;

        logger.info(`Audio generated and saved to ${absolutePath}`);
        logger.info(`Web-accessible path: ${webPath}`);

        // Create sound entry in the library
        logger.info(`Creating sound entry in library for ${generatedFilename}`);
        const soundEntry = await soundService.createSound({
            name: text.substring(0, 50), // Use a portion of text as name
            filename: generatedFilename, // Just the filename
            file: generatedFilename,     // Redundant, but matches existing structure
            characterIds: [parseInt(characterId)],
            type: 'voice_openai', // Indicate it's an OpenAI voice
            created: new Date().toISOString(),
            metadata: {
                originalText: text,
                voiceId: voice.speaker_id, // OpenAI voice ID
                voiceSettings: voice.settings || {},
                source: 'openai-tts'
            }
        });
        logger.info(`Sound entry created:`, soundEntry);

        res.json({
            success: true,
            soundId: soundEntry.id,
            filename: generatedFilename,
            path: webPath 
        });

    } catch (error) {
        // Error handling for file cleanup is tricky if voiceService already wrote it.
        // For now, rely on voiceService not creating a file if it throws an error before that point.
        // If voiceService creates a file then throws, that file might remain.
        handleError(res, error);
    }
};

exports.generateSpeech = async (req, res) => {
    try {
        const { speaker_id, text, options = {}, characterId = null } = req.body; // Added characterId, defaulting to null

        if (!speaker_id || !text) {
            return handleError(res, new Error('Speaker ID (OpenAI Voice ID) and text are required'), 400);
        }

        // Ensure options are structured as expected by voiceService
        const generationOptions = {
            model: options.model, // Will use default from voiceService if undefined
            speed: options.speed  // Will use default from voiceService if undefined
        };

        logger.info(`Generic speech generation request: voice='${speaker_id}', charId='${characterId}'`);

        // Call voiceService.generateSpeech
        // The characterId is passed for potential history logging in voiceService, even if not used for soundService here
        const result = await voiceService.generateSpeech(text, speaker_id, generationOptions, characterId);

        if (!result || !result.filePath) {
            logger.error('Generic speech generation failed to return a file path.');
            return handleError(res, new Error('Speech generation failed'), 500);
        }

        logger.info(`Generic speech generated: ${result.filePath}`);

        res.json({
            success: true,
            filePath: result.filePath,
            message: 'Speech generated successfully. Note: This endpoint does not save to sound library.'
        });

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
        const { metadata, speaker_id } = req.body;

        if (!characterId) {
            return handleError(res, new Error('Character ID is required'), 400);
        }

        let voice = await voiceService.getVoiceByCharacterId(characterId);
        
        // If voice doesn't exist, create a new voice entry with default settings
        if (!voice) {
            if (!speaker_id) {
                // If updating favorites, create voice with the first available voice
                if (metadata && metadata.hasOwnProperty('favorited')) {
                    try {
                        // Get available voices and use the first one as default
                        const voices = await voiceService.getAvailableVoices();
                        if (voices && voices.length > 0) {
                            const defaultVoice = voices[0];
                            
                            voice = {
                                characterId: parseInt(characterId),
                                speaker_id: defaultVoice.speaker_id,
                                settings: {}, // Will use default settings
                                metadata: {
                                    lastUsed: null,
                                    useCount: 0,
                                    favorited: false,
                                    tags: [],
                                    notes: ''
                                },
                                history: []
                            };
                            
                            logger.info(`Created default voice for character ${characterId}`);
                        } else {
                            return handleError(res, new Error('No voices available to create default voice'), 404);
                        }
                    } catch (voiceError) {
                        return handleError(res, new Error('Failed to get available voices: ' + voiceError.message), 500);
                    }
                } else {
                    return handleError(res, new Error('Voice not found and no speaker_id provided for creation'), 404);
                }
            } else {
                // Create new voice with provided speaker_id
                voice = {
                    characterId: parseInt(characterId),
                    speaker_id: speaker_id,
                    settings: {}, // Will use default settings
                    metadata: {
                        lastUsed: null,
                        useCount: 0,
                        favorited: false,
                        tags: [],
                        notes: ''
                    },
                    history: []
                };
                logger.info(`Created new voice for character ${characterId} with speaker_id ${speaker_id}`);
            }
        }

        // Update the metadata
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
            return handleError(res, new Error('API key is required'), 401);
        }
        handleError(res, error);
    }
};
