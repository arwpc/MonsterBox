const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, 'data');

// Ensure the data directory exists
fs.mkdir(dataDir, { recursive: true }).catch(console.error);

const readData = async (filename) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return an empty array
            return [];
        }
        throw error;
    }
};

const writeData = async (filename, data) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

const getNextId = (items) => {
    return items.length > 0 ? Math.max(...items.map(item => item.id)) + 1 : 1;
};

const getCharacters = () => readData('characters');
const getScenes = () => readData('scenes');
const getParts = () => readData('parts');
const getSounds = () => readData('sounds');

const saveCharacters = (data) => writeData('characters', data);
const saveScenes = (data) => writeData('scenes', data);
const saveParts = (data) => writeData('parts', data);
const saveSounds = (data) => writeData('sounds', data);

const deleteFile = async (filename) => {
    const filePath = path.join(dataDir, filename);
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
};

module.exports = {
    getCharacters,
    getScenes,
    getParts,
    getSounds,
    saveCharacters,
    saveScenes,
    saveParts,
    saveSounds,
    getNextId,
    deleteFile
};
