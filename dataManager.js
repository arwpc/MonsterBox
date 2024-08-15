const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, 'data');

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

module.exports = {
    getCharacters: () => readData('characters'),
    getScenes: () => readData('scenes'),
    getParts: () => readData('parts'),
    getSounds: () => readData('sounds'),
    saveCharacters: (data) => writeData('characters', data),
    saveScenes: (data) => writeData('scenes', data),
    saveParts: (data) => writeData('parts', data),
    saveSounds: (data) => writeData('sounds', data),
    getNextId
};
