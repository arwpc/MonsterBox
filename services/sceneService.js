const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/scenes.json');
const charactersPath = path.join(__dirname, '../data/characters.json');  // Assuming characters are stored in this file

const getAllScenes = async () => {
    const data = await fs.readFile(dataPath, 'utf8');
    return JSON.parse(data);
};

const getAllCharacters = async () => {
    const data = await fs.readFile(charactersPath, 'utf8');
    return JSON.parse(data).filter(character => character.active);  // Filter for active characters
};

const getScene = async (id) => {
    const scenes = await getAllScenes();
    return scenes.find(scene => scene.id === parseInt(id));
};

const saveScene = async (sceneData, id = null) => {
    const scenes = await getAllScenes();
    if (id) {
        const index = scenes.findIndex(scene => scene.id === parseInt(id));
        if (index !== -1) {
            scenes[index] = { ...scenes[index], ...sceneData };
        }
    } else {
        sceneData.id = getNextId(scenes);
        scenes.push(sceneData);
    }
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
    return sceneData;
};

const removeScene = async (id) => {
    let scenes = await getAllScenes();
    scenes = scenes.filter(scene => scene.id !== parseInt(id));
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
};

const addStepToScene = async (sceneId, stepData) => {
    const scene = await getScene(sceneId);
    stepData.id = getNextId(scene.steps || []);
    scene.steps = scene.steps || [];
    scene.steps.push(stepData);
    await saveScene(scene, sceneId);
    return scene;
};

const updateStepInScene = async (sceneId, stepId, stepData) => {
    const scene = await getScene(sceneId);
    const stepIndex = scene.steps.findIndex(step => step.id === parseInt(stepId));
    if (stepIndex !== -1) {
        scene.steps[stepIndex] = { ...scene.steps[stepIndex], ...stepData };
        await saveScene(scene, sceneId);
    }
    return scene;
};

const removeStepFromScene = async (sceneId, stepId) => {
    const scene = await getScene(sceneId);
    scene.steps = scene.steps.filter(step => step.id !== parseInt(stepId));
    await saveScene(scene, sceneId);
    return scene;
};

const getNextId = (items) => {
    return items.length > 0 ? Math.max(...items.map(item => item.id)) + 1 : 1;
};

module.exports = {
    getAllScenes,
    getAllCharacters,  // Export the new function
    getScene,
    saveScene,
    removeScene,
    addStepToScene,
    updateStepInScene,
    removeStepFromScene
};
