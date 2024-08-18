const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');

const dataPath = path.join(__dirname, '../data/sounds.json');

const getAllSounds = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If the file doesn't exist, return an empty array
            return [];
        }
        throw error;
    }
};

const getSoundById = async (id) => {
    const sounds = await getAllSounds();
    return sounds.find(sound => sound.id === parseInt(id));
};

const createSound = async (soundData) => {
    const sounds = await getAllSounds();
    const newSound = {
        id: sounds.length > 0 ? Math.max(...sounds.map(s => s.id)) + 1 : 1,
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
        sounds[index] = { ...sounds[index], ...soundData };
        await fs.writeFile(dataPath, JSON.stringify(sounds, null, 2));
        return sounds[index];
    }
    throw new Error('Sound not found');
};

const deleteSound = async (id) => {
    const sounds = await getAllSounds();
    const filteredSounds = sounds.filter(sound => sound.id !== parseInt(id));
    await fs.writeFile(dataPath, JSON.stringify(filteredSounds, null, 2));
};

const playSound = async (id) => {
    const sound = await getSoundById(id);
    if (!sound) throw new Error('Sound not found');

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '../scripts/play_sound.py');
        const command = `python3 ${scriptPath} "${sound.filename}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error playing sound: ${error}`);
                reject(error);
            } else {
                console.log(`Sound played successfully: ${stdout}`);
                resolve(stdout);
            }
        });
    });
};

module.exports = {
    getAllSounds,
    getSoundById,
    createSound,
    updateSound,
    deleteSound,
    playSound
};
