const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/scenes.json');

const getAllScenes = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        console.log('Raw scenes data:', data);
        const scenes = JSON.parse(data);
        console.log('Parsed scenes:', scenes);
        return scenes;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Scenes file not found, returning empty array');
            return [];
        }
        console.error('Error reading scenes file:', error);
        throw error;
    }
};

const getSceneById = async (id) => {
    console.log('Getting scene by ID:', id);
    const scenes = await getAllScenes();
    const scene = scenes.find(scene => scene.id === parseInt(id));
    console.log('Found scene:', scene);
    return scene;
};

const createScene = async (sceneData) => {
    const scenes = await getAllScenes();
    const newId = scenes.length > 0 ? Math.max(...scenes.map(s => parseInt(s.id) || 0)) + 1 : 1;
    const newScene = {
        id: newId,
        ...sceneData,
        steps: sceneData.steps || []
    };
    console.log('Creating new scene:', newScene);
    scenes.push(newScene);
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
    return newScene;
};

const updateScene = async (id, sceneData) => {
    console.log('Updating scene:', id, sceneData);
    const scenes = await getAllScenes();
    const index = scenes.findIndex(scene => scene.id === parseInt(id));
    if (index !== -1) {
        scenes[index] = { ...scenes[index], ...sceneData, id: parseInt(id) };
        await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
        console.log('Updated scene:', scenes[index]);
        return scenes[index];
    }
    console.log('Scene not found for update');
    throw new Error('Scene not found');
};

const deleteScene = async (id) => {
    console.log('Deleting scene:', id);
    const scenes = await getAllScenes();
    const filteredScenes = scenes.filter(scene => scene.id !== parseInt(id));
    if (filteredScenes.length === scenes.length) {
        console.log('Scene not found for deletion');
        throw new Error('Scene not found');
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredScenes, null, 2));
    console.log('Scene deleted successfully');
};

module.exports = {
    getAllScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene
};
