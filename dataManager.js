const fs = require('fs').promises;
const path = require('path');

const dataDir = '/home/remote/monsterbox/MonsterBox/data';

const ensureDataDirExists = async () => {
    try {
        await fs.access(dataDir);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dataDir, { recursive: true });
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

const getScene = async (id) => {
    const scenes = await readData('scenes');
    return scenes.find(scene => scene.id === parseInt(id));
};

const saveScene = async (sceneData) => {
    const scenes = await readData('scenes');
    let scene;
    if (sceneData.id) {
        const index = scenes.findIndex(s => s.id === sceneData.id);
        if (index !== -1) {
            scenes[index] = { ...scenes[index], ...sceneData };
            scene = scenes[index];
        } else {
            throw new Error('Scene not found');
        }
    } else {
        scene = { ...sceneData, id: getNextId(scenes) };
        scenes.push(scene);
    }
    await writeData('scenes', scenes);
    return scene;
};

const removeScene = async (id) => {
    const scenes = await readData('scenes');
    const updatedScenes = scenes.filter(scene => scene.id !== parseInt(id));
    await writeData('scenes', updatedScenes);
};

const getParts = async () => {
    const parts = await readData('parts');
    return parts.map(part => {
        switch (part.type) {
            case 'motor':
                return {
                    ...part,
                    directionPin: part.directionPin || null,
                    pwmPin: part.pwmPin || null
                };
            case 'led':
            case 'light':
                return {
                    ...part,
                    gpioPin: part.gpioPin || null
                };
            case 'sensor':
                return {
                    ...part,
                    gpioPin: part.gpioPin || null,
                    sensorType: part.sensorType || 'motion'
                };
            default:
                return part;
        }
    });
};

const savePart = async (partData) => {
    const parts = await getParts();
    let part;
    if (partData.id) {
        const index = parts.findIndex(p => p.id === partData.id);
        if (index !== -1) {
            parts[index] = { ...parts[index], ...partData };
            part = parts[index];
        } else {
            throw new Error('Part not found');
        }
    } else {
        part = { ...partData, id: getNextId(parts) };
        parts.push(part);
    }
    await writeData('parts', parts);
    return part;
};

module.exports = {
    getCharacters: () => readData('characters'),
    getScenes: () => readData('scenes'),
    getParts,
    getSounds: () => readData('sounds'),
    getSensors: () => readData('sensors'),
    getArmedSensors: () => readData('armedSensors'),
    saveCharacters: (data) => writeData('characters', data),
    saveScenes: (data) => writeData('scenes', data),
    saveParts: (data) => writeData('parts', data),
    saveSounds: (data) => writeData('sounds', data),
    saveSensors: (data) => writeData('sensors', data),
    saveArmedSensors: (data) => writeData('armedSensors', data),
    getNextId,
    getScene,
    saveScene,
    removeScene,
    savePart
};
