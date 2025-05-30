// File: services/soundService.js

const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

const dataPath = path.join(__dirname, '../data/sounds.json');

const getAllSounds = async (characterId = null) => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        let sounds = JSON.parse(data);
        
        if (!Array.isArray(sounds)) {
            logger.error('Invalid sounds data: not an array');
            return [];
        }
        
        // Filter out any undefined or null sound objects
        sounds = sounds.filter(sound => sound != null);
        
        logger.debug(`Retrieved ${sounds.length} valid sounds`);
        
        if (characterId !== null) {
            sounds = sounds.filter(sound => {
                return sound.characterIds && 
                       Array.isArray(sound.characterIds) && 
                       sound.characterIds.includes(parseInt(characterId));
            });
            logger.debug(`Filtered to ${sounds.length} sounds for character ${characterId}`);
        }
        
        return sounds;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('Sounds file not found, returning empty array');
            return [];
        }
        logger.error('Error reading sounds file:', error);
        throw error;
    }
};

const getSoundsByCharacter = async (characterId) => {
    try {
        const sounds = await getAllSounds(characterId);
        logger.debug(`Retrieved ${sounds.length} sounds for character ${characterId}`);
        logger.debug(`Sound IDs: ${sounds.map(s => s.id).join(', ')}`);
        return sounds;
    } catch (error) {
        logger.error(`Error retrieving sounds for character ${characterId}:`, error);
        return [];
    }
};

const getSoundById = async (id) => {
    try {
        const sounds = await getAllSounds();
        const sound = sounds.find(sound => sound && sound.id === parseInt(id));
        if (sound) {
            logger.debug(`Retrieved sound with id ${id}: ${JSON.stringify(sound)}`);
        } else {
            logger.warn(`Sound with id ${id} not found`);
        }
        return sound;
    } catch (error) {
        logger.error(`Error retrieving sound with id ${id}:`, error);
        return null;
    }
};

const getNextId = (sounds) => {
    return sounds.length > 0 ? Math.max(...sounds.map(s => s.id)) + 1 : 1;
};

const createSound = async (soundData) => {
    try {
        const sounds = await getAllSounds();
        const newSound = {
            id: getNextId(sounds),
            ...soundData,
            characterIds: soundData.characterIds ? 
                soundData.characterIds.map(id => parseInt(id)) : [],
            characterId: null // Keep this for backward compatibility but set to null
        };
        sounds.push(newSound);
        await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
        logger.info(`Created new sound with id ${newSound.id}`);
        return newSound;
    } catch (error) {
        logger.error('Error creating new sound:', error);
        throw error;
    }
};

const createMultipleSounds = async (soundDataArray) => {
    try {
        const sounds = await getAllSounds();
        let nextId = getNextId(sounds);
        const newSounds = soundDataArray.map(soundData => {
            try {
                return {
                    id: nextId++,
                    ...soundData,
                    characterIds: soundData.characterIds ? 
                        soundData.characterIds.map(id => parseInt(id)) : [],
                    characterId: null // Keep this for backward compatibility but set to null
                };
            } catch (error) {
                logger.error(`Error creating sound object: ${JSON.stringify(soundData)}`, error);
                return null;
            }
        }).filter(sound => sound !== null);
        
        sounds.push(...newSounds);
        await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
        logger.info(`Created ${newSounds.length} new sounds`);
        return newSounds;
    } catch (error) {
        logger.error('Error creating multiple sounds:', error);
        throw error;
    }
};

const updateSound = async (id, soundData) => {
    // Early validation to prevent NaN issues
    if (id === undefined || id === null || isNaN(id) || id === 'NaN') {
        logger.warn(`Invalid sound ID provided for update: ${id}`);
        throw new Error('Invalid sound ID');
    }
    
    try {
        // Convert to number immediately to ensure consistent comparison
        const numericId = parseInt(id);
        if (isNaN(numericId)) {
            logger.warn(`Invalid sound ID after parsing: ${id}`);
            throw new Error('Invalid sound ID');
        }
        
        const sounds = await getAllSounds();
        const index = sounds.findIndex(sound => sound && sound.id === numericId);
        
        if (index !== -1) {
            sounds[index] = { 
                ...sounds[index], 
                ...soundData, 
                id: numericId,
                characterIds: soundData.characterIds ? 
                    soundData.characterIds.map(charId => {
                        const parsed = parseInt(charId);
                        return isNaN(parsed) ? null : parsed;
                    }).filter(Boolean) : 
                    (sounds[index].characterIds || []),
                characterId: null // Keep this for backward compatibility but set to null
            };
            await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
            logger.info(`Updated sound with id ${numericId}`);
            return sounds[index];
        }
        
        logger.warn(`Attempt to update non-existent sound with id ${numericId}`);
        throw new Error('Sound not found');
    } catch (error) {
        logger.error(`Error updating sound with id ${id}:`, error);
        throw error;
    }
};

const deleteSound = async (id) => {
    try {
        const sounds = await getAllSounds();
        const filteredSounds = sounds.filter(sound => sound && sound.id !== parseInt(id));
        if (filteredSounds.length === sounds.length) {
            logger.warn(`Attempt to delete non-existent sound with id ${id}`);
            throw new Error('Sound not found');
        }
        await fs.writeFile(dataPath, JSON.stringify(filteredSounds, null, 2));
        logger.info(`Deleted sound with id ${id}`);
    } catch (error) {
        logger.error(`Error deleting sound with id ${id}:`, error);
        throw error;
    }
};

module.exports = {
    getAllSounds,
    getSoundsByCharacter,
    getSoundById,
    createSound,
    createMultipleSounds,
    updateSound,
    deleteSound
};
