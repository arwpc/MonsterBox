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

const getNextId = (characters) => {
    return characters.length > 0 ? Math.max(...characters.map(c => c.id)) + 1 : 1;
};

const createCharacter = async (characterData) => {
    const characters = await getAllCharacters();
    const newCharacter = {
        id: getNextId(characters),
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
    await fs.writeFile(dataPath, JSON.stringify(filteredCharacters, null, 2));
};

module.exports = {
    getAllCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter
};
