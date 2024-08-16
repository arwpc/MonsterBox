// dataManager.js
// This module manages reading and writing data for the application,
// handling characters, scenes, parts, and sounds data stored in JSON files.

const fs = require('fs').promises;
const path = require('path');

// Directory where JSON data files are stored
const dataDir = path.join(__dirname, 'data');

/**
 * Ensures that the data directory exists.
 */
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

/**
 * Reads data from a JSON file.
 * @param {string} filename - The name of the JSON file (without extension).
 * @returns {Promise<Array>} - The parsed JSON data as an array.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
const readData = async (filename) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
        await ensureDataDirExists(); // Ensure directory exists before reading
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, return an empty array
            return [];
        }
        console.error(`Error reading ${filename}:`, error);
        throw error; // Propagate the error after logging it
    }
};

/**
 * Writes data to a JSON file.
 * @param {string} filename - The name of the JSON file (without extension).
 * @param {Array} data - The data to write to the file.
 * @returns {Promise<void>}
 * @throws Will throw an error if the file cannot be written.
 */
const writeData = async (filename, data) => {
    const filePath = path.join(dataDir, `${filename}.json`);
    try {
        await ensureDataDirExists(); // Ensure directory exists before writing
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing ${filename}:`, error);
        throw error; // Propagate the error after logging it
    }
};

/**
 * Returns the next available ID for a new item in a collection.
 * @param {Array} items - The collection of items.
 * @returns {number} - The next available ID.
 */
const getNextId = (items) => {
    return items.length > 0 ? Math.max(...items.map(item => item.id)) + 1 : 1;
};

// Exported methods for managing the data files
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
