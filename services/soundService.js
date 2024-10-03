// File: services/soundService.js

const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

const dataPath = path.join(__dirname, '../data/sounds.json');

const getAllSounds = async (characterId = null) => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        let sounds = JSON.parse(data);
        logger.debug(`Retrieved ${sounds.length} sounds`);
        
        if (characterId !== null) {
            sounds = sounds.filter(sound => sound.characterIds.includes(parseInt(characterId)));
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
    const sounds = await getAllSounds(characterId);
    logger.debug(`Retrieved ${sounds.length} sounds for character ${characterId}`);
    return sounds;
};

const getSoundById = async (id) => {
    const sounds = await getAllSounds();
    const sound = sounds.find(sound => sound.id === parseInt(id));
    if (sound) {
        logger.debug(`Retrieved sound with id ${id}`);
    } else {
        logger.warn(`Sound with id ${id} not found`);
    }
    return sound;
};

const getNextId = (sounds) => {
    return sounds.length > 0 ? Math.max(...sounds.map(s => s.id)) + 1 : 1;
};

const createSound = async (soundData) => {
    const sounds = await getAllSounds();
    const newSound = {
        id: getNextId(sounds),
        ...soundData,
        characterIds: soundData.characterIds.map(id => parseInt(id))
    };
    sounds.push(newSound);
    await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
    logger.info(`Created new sound with id ${newSound.id}`);
    return newSound;
};

const createMultipleSounds = async (soundDataArray) => {
    const sounds = await getAllSounds();
    let nextId = getNextId(sounds);
    const newSounds = soundDataArray.map(soundData => ({
        id: nextId++,
        ...soundData,
        characterIds: soundData.characterIds.map(id => parseInt(id))
    }));
    sounds.push(...newSounds);
    await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
    logger.info(`Created ${newSounds.length} new sounds`);
    return newSounds;
};

const updateSound = async (id, soundData) => {
    const sounds = await getAllSounds();
    const index = sounds.findIndex(sound => sound.id === parseInt(id));
    if (index !== -1) {
        sounds[index] = { 
            ...sounds[index], 
            ...soundData, 
            id: parseInt(id),
            characterIds: soundData.characterIds.map(id => parseInt(id))
        };
        await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
        logger.info(`Updated sound with id ${id}`);
        return sounds[index];
    }
    logger.warn(`Attempt to update non-existent sound with id ${id}`);
    throw new Error('Sound not found');
};

const deleteSound = async (id) => {
    const sounds = await getAllSounds();
    const filteredSounds = sounds.filter(sound => sound.id !== parseInt(id));
    if (filteredSounds.length === sounds.length) {
        logger.warn(`Attempt to delete non-existent sound with id ${id}`);
        throw new Error('Sound not found');
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredSounds, null, 2));
    logger.info(`Deleted sound with id ${id}`);
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
