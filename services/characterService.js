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

module.exports = {
    getAllCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    getCharacterWithWebcam,
    getAllCharactersWithWebcams
};
