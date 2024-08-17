const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/scenes.json');
const charactersPath = path.join(__dirname, '../data/characters.json');
const partsPath = path.join(__dirname, '../data/parts.json');
const soundsPath = path.join(__dirname, '../data/sounds.json');

const readJsonFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const writeJsonFile = async (filePath, data) => {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

const getAllScenes = async () => {
    return readJsonFile(dataPath);
};

const getAllCharacters = async () => {
    return readJsonFile(charactersPath);
};

const getAllParts = async () => {
    return readJsonFile(partsPath);
};

const getAllSounds = async () => {
    return readJsonFile(soundsPath);
};

const getScene = async (id) => {
    const scenes = await getAllScenes();
    return scenes.find(scene => scene.id === parseInt(id));
};

const saveScene = async (sceneData, id = null) => {
    let scenes = await getAllScenes();
    if (id) {
        const index = scenes.findIndex(scene => scene.id === parseInt(id));
        if (index !== -1) {
            scenes[index] = { ...scenes[index], ...sceneData, id: parseInt(id) };
        } else {
            throw new Error('Scene not found');
        }
    } else {
        const newId = Math.max(...scenes.map(s => s.id), 0) + 1;
        scenes.push({ ...sceneData, id: newId });
    }
    await writeJsonFile(dataPath, scenes);
    return id ? scenes.find(scene => scene.id === parseInt(id)) : scenes[scenes.length - 1];
};

const removeScene = async (id) => {
    let scenes = await getAllScenes();
    scenes = scenes.filter(scene => scene.id !== parseInt(id));
    await writeJsonFile(dataPath, scenes);
};

const addStepToScene = async (sceneId, stepData) => {
    const scene = await getScene(sceneId);
    if (!scene) {
        throw new Error('Scene not found');
    }
    scene.steps = scene.steps || [];
    scene.steps.push(stepData);
    return saveScene(scene, sceneId);
};

const updateStepInScene = async (sceneId, stepIndex, stepData) => {
    const scene = await getScene(sceneId);
    if (!scene || !scene.steps || stepIndex >= scene.steps.length) {
        throw new Error('Scene or step not found');
    }
    scene.steps[stepIndex] = { ...scene.steps[stepIndex], ...stepData };
    return saveScene(scene, sceneId);
};

const removeStepFromScene = async (sceneId, stepIndex) => {
    const scene = await getScene(sceneId);
    if (!scene || !scene.steps || stepIndex >= scene.steps.length) {
        throw new Error('Scene or step not found');
    }
    scene.steps.splice(stepIndex, 1);
    return saveScene(scene, sceneId);
};

module.exports = {
    getAllScenes,
    getAllCharacters,
    getAllParts,
    getAllSounds,
    getScene,
    saveScene,
    removeScene,
    addStepToScene,
    updateStepInScene,
    removeStepFromScene
};
