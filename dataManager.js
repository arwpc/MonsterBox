const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, 'data');

const ensureDataDirExists = async () => {
    try {
        await fs.access(dataDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dataDir);
        } else {
            throw error;
        }
    }
};

const readData = async (filename) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
        await ensureDataDirExists();
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log(`File ${filename}.json not found. Returning empty array.`);
            return [];
        }
        console.error(`Error reading ${filename}:`, error);
        throw error;
    }
};

const writeData = async (filename, data) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
        await ensureDataDirExists();
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing ${filename}:`, error);
        throw error;
    }
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
