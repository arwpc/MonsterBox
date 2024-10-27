const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

const dataPath = path.join(__dirname, '../data/parts.json');

const getAllParts = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        logger.debug('Raw parts data:', data);
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('Parts file not found, returning empty array');
            return [];
        }
        throw error;
    }
};

const getPartById = async (id) => {
    logger.debug('Getting part by ID:', id, 'Type:', typeof id);
    if (id === undefined || id === null) {
        logger.warn('Part ID is undefined or null');
        return null;
    }
    const parts = await getAllParts();
    // Convert id to number for comparison since parts.json stores IDs as numbers
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return null;
    }
    const part = parts.find(part => part.id === parsedId);
    if (!part) {
        logger.warn(`Part not found with id: ${id}`);
        return null;
    }
    logger.debug('Found part:', part);
    return part;
};

const getPartsByCharacter = async (characterId) => {
    logger.debug('Getting parts for character ID:', characterId);
    const parts = await getAllParts();
    return parts.filter(part => part.characterId === parseInt(characterId, 10));
};

const createPart = async (partData) => {
    logger.info('Creating new part with data:', partData);
    const parts = await getAllParts();
    const newPart = {
        id: parts.length > 0 ? Math.max(...parts.map(p => p.id)) + 1 : 1,
        ...partData,
        characterId: parseInt(partData.characterId, 10)
    };
    parts.push(newPart);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info('Created new part:', newPart);
    return newPart;
};

const updatePart = async (id, partData) => {
    logger.debug('Updating part - ID:', id, 'Type:', typeof id);
    logger.debug('Updating part - Data:', partData);
    const parts = await getAllParts();
    logger.debug('All parts:', parts);
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return null;
    }
    const index = parts.findIndex(part => part.id === parsedId);
    logger.debug('Found part index:', index);
    if (index === -1) {
        logger.warn(`Part not found with id: ${id}`);
        return null;
    }
    parts[index] = { 
        ...parts[index], 
        ...partData, 
        id: parsedId,
        characterId: parseInt(partData.characterId, 10)
    };
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info('Updated part:', parts[index]);
    return parts[index];
};

const deletePart = async (id) => {
    logger.info(`Attempting to delete part with ID: ${id}`);
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        logger.warn(`Invalid part ID (not a number): ${id}`);
        return false;
    }
    logger.debug(`Parsed ID: ${parsedId}`);
    const parts = await getAllParts();
    logger.debug(`All parts before deletion: ${JSON.stringify(parts)}`);
    const index = parts.findIndex(part => part.id === parsedId);
    logger.debug(`Index of part to delete: ${index}`);
    logger.debug(`Part IDs: ${parts.map(part => part.id).join(', ')}`);
    if (index === -1) {
        logger.warn(`Part not found with id: ${id}`);
        return false;
    }
    const deletedPart = parts.splice(index, 1)[0];
    logger.debug(`Deleted part: ${JSON.stringify(deletedPart)}`);
    await fs.writeFile(dataPath, JSON.stringify(parts, null, 2));
    logger.info(`Part with ID ${id} deleted successfully`);
    logger.debug(`All parts after deletion: ${JSON.stringify(parts)}`);
    return true;
};

module.exports = {
    getAllParts,
    getPartById,
    getPartsByCharacter,
    createPart,
    updatePart,
    deletePart
};
