// File: services/soundService.js

const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/sounds.json');

const getAllSounds = async () => {
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

const getSoundById = async (id) => {
    const sounds = await getAllSounds();
    return sounds.find(sound => sound.id === parseInt(id));
};

const getNextId = (sounds) => {
    return sounds.length > 0 ? Math.max(...sounds.map(s => s.id)) + 1 : 1;
};

const createSound = async (soundData) => {
    const sounds = await getAllSounds();
    const newSound = {
        id: getNextId(sounds),
        ...soundData
    };
    sounds.push(newSound);
    await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
    return newSound;
};

const updateSound = async (id, soundData) => {
    const sounds = await getAllSounds();
    const index = sounds.findIndex(sound => sound.id === parseInt(id));
    if (index !== -1) {
        sounds[index] = { ...sounds[index], ...soundData, id: parseInt(id) };
        await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
        return sounds[index];
    }
    throw new Error('Sound not found');
};

const deleteSound = async (id) => {
    const sounds = await getAllSounds();
    const filteredSounds = sounds.filter(sound => sound.id !== parseInt(id));
    if (filteredSounds.length === sounds.length) {
        throw new Error('Sound not found');
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredSounds, null, 2));
};

module.exports = {
    getAllSounds,
    getSoundById,
    createSound,
    updateSound,
    deleteSound
};
