const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/characters.json');

const getAllCharacters = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const getCharacterById = async (id) => {
    const characters = await getAllCharacters();
    return characters.find(character => character.id === parseInt(id));
};

const createCharacter = async (characterData) => {
    const characters = await getAllCharacters();
    const newCharacter = {
        id: characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1,
        ...characterData
    };
    characters.push(newCharacter);
    await fs.writeFile(dataPath, JSON.stringify(characters, null, 2));
    return newCharacter;
};

const updateCharacter = async (id, characterData) => {
    const characters = await getAllCharacters();
    const index = characters.findIndex(character => character.id === parseInt(id));
    if (index !== -1) {
        characters[index] = { ...characters[index], ...characterData, id: parseInt(id) };
        await fs.writeFile(dataPath, JSON.stringify(characters, null, 2));
        return characters[index];
    }
    throw new Error('Character not found');
};

const deleteCharacter = async (id) => {
    const characters = await getAllCharacters();
    const filteredCharacters = characters.filter(character => character.id !== parseInt(id));
    if (filteredCharacters.length === characters.length) {
        throw new Error('Character not found');
    }

    // Remove webcam association before deleting character
    try {
        const characterWebcamService = require('./characterWebcamService');
        await characterWebcamService.removeWebcam(parseInt(id));
    } catch (webcamError) {
        console.warn('Error removing webcam association during character deletion:', webcamError);
    }

    await fs.writeFile(dataPath, JSON.stringify(filteredCharacters, null, 2));
};

/**
 * Get character with webcam information
 * @param {number} id - Character ID
 * @returns {Object|null} Character with webcam details
 */
const getCharacterWithWebcam = async (id) => {
    try {
        const character = await getCharacterById(id);
        if (!character) {
            return null;
        }

        const characterWebcamService = require('./characterWebcamService');
        const webcam = await characterWebcamService.getWebcamByCharacter(parseInt(id));

        return {
            ...character,
            webcam: webcam,
            hasWebcam: !!webcam
        };
    } catch (error) {
        console.error('Error getting character with webcam:', error);
        return null;
    }
};

/**
 * Get all characters with webcam information
 * @returns {Array} Array of characters with webcam details
 */
const getAllCharactersWithWebcams = async () => {
    try {
        const characters = await getAllCharacters();
        const charactersWithWebcams = [];

        for (const character of characters) {
            const characterWithWebcam = await getCharacterWithWebcam(character.id);
            if (characterWithWebcam) {
                charactersWithWebcams.push(characterWithWebcam);
            }
        }

        return charactersWithWebcams;
    } catch (error) {
        console.error('Error getting all characters with webcams:', error);
        return [];
    }
};

/**
 * Get jaw animation configuration for a character
 * @param {number} characterId - Character ID
 * @returns {Object|null} Jaw animation configuration or null if not found
 */
const getCharacterJawAnimationConfig = async (characterId) => {
    try {
        const character = await getCharacterById(characterId);
        if (!character) return null;

        return character.jaw_animation_config || null;
    } catch (error) {
        console.error('Error getting jaw animation config:', error);
        return null;
    }
};

/**
 * Update jaw animation configuration for a character
 * @param {number} characterId - Character ID
 * @param {Object} jawAnimationConfig - Jaw animation configuration
 * @returns {Object} Updated character
 */
const updateCharacterJawAnimationConfig = async (characterId, jawAnimationConfig) => {
    try {
        const character = await getCharacterById(characterId);
        if (!character) {
            throw new Error('Character not found');
        }

        // Validate jaw animation config structure
        const validatedConfig = validateJawAnimationConfig(jawAnimationConfig);

        // Update character with jaw animation config
        const updatedCharacter = {
            ...character,
            jaw_animation_config: validatedConfig
        };

        return await updateCharacter(characterId, updatedCharacter);
    } catch (error) {
        console.error('Error updating jaw animation config:', error);
        throw error;
    }
};

/**
 * Validate jaw animation configuration structure
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validated configuration
 */
const validateJawAnimationConfig = (config) => {
    const defaultConfig = {
        enabled: false,
        servo: {
            pin: 18,
            channel: null,
            closedAngle: 50,
            openAngle: 30,
            minPosition: 0,
            maxPosition: 180,
            stepThreshold: 0.5
        },
        audioAnalysis: {
            volumeThreshold: 0.01,
            smoothingFactor: 0.8,
            attackTime: 0.05,
            releaseTime: 0.15,
            sensitivity: 1.0,
            responseCurve: 'linear'
        },
        calibration: {
            isCalibrated: false,
            calibratedClosedAngle: null,
            calibratedOpenAngle: null,
            calibrationDate: null
        },
        preset: 'skeleton',
        presets: {
            skeleton: {
                minPosition: 0,
                maxPosition: 180,
                sensitivity: 1.5,
                volumeThreshold: 0.02,
                responseCurve: 'exponential'
            },
            bear: {
                minPosition: 10,
                maxPosition: 170,
                sensitivity: 1.2,
                volumeThreshold: 0.015,
                responseCurve: 'linear'
            },
            fish: {
                minPosition: 20,
                maxPosition: 160,
                sensitivity: 2.0,
                volumeThreshold: 0.01,
                responseCurve: 'logarithmic'
            },
            demon: {
                minPosition: 0,
                maxPosition: 180,
                sensitivity: 1.8,
                volumeThreshold: 0.025,
                responseCurve: 'exponential'
            }
        }
    };

    // Merge with defaults
    return {
        ...defaultConfig,
        ...config,
        servo: {
            ...defaultConfig.servo,
            ...(config.servo || {})
        },
        audioAnalysis: {
            ...defaultConfig.audioAnalysis,
            ...(config.audioAnalysis || {})
        },
        calibration: {
            ...defaultConfig.calibration,
            ...(config.calibration || {})
        },
        presets: {
            ...defaultConfig.presets,
            ...(config.presets || {})
        }
    };
};

module.exports = {
    getAllCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    getCharacterWithWebcam,
    getAllCharactersWithWebcams,
    getCharacterJawAnimationConfig,
    updateCharacterJawAnimationConfig,
    validateJawAnimationConfig
};
