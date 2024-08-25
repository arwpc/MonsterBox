const fs = require('fs').promises;
const path = require('path');

const dataPath = path.join(__dirname, '../data/scenes.json');

const getAllScenes = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        let scenes = JSON.parse(data);
        scenes = scenes.map(scene => ({
            ...scene,
            id: parseInt(scene.id)
        }));
        return scenes;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

const getSceneById = async (id) => {
    const scenes = await getAllScenes();
    return scenes.find(scene => scene.id === parseInt(id));
};

const getNextId = (scenes) => {
    return scenes.length > 0 ? Math.max(...scenes.map(s => parseInt(s.id) || 0)) + 1 : 1;
};

const createScene = async (sceneData) => {
    const scenes = await getAllScenes();
    const newScene = {
        id: getNextId(scenes),
        character_id: parseInt(sceneData.character_id),
        scene_name: sceneData.scene_name,
        steps: sceneData.steps || []
    };
    scenes.push(newScene);
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
    return newScene;
};

const updateScene = async (id, sceneData) => {
    const scenes = await getAllScenes();
    const index = scenes.findIndex(scene => scene.id === parseInt(id));
    if (index !== -1) {
        scenes[index] = {
            ...scenes[index],
            ...sceneData,
            id: parseInt(id),
            character_id: parseInt(sceneData.character_id),
            steps: sceneData.steps || scenes[index].steps
        };
        await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
        return scenes[index];
    }
    throw new Error('Scene not found');
};

const deleteScene = async (id) => {
    const scenes = await getAllScenes();
    const filteredScenes = scenes.filter(scene => scene.id !== parseInt(id));
    if (filteredScenes.length === scenes.length) {
        throw new Error('Scene not found');
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredScenes, null, 2));
};

module.exports = {
    getAllScenes,
    getSceneById,
    createScene,
    updateScene,
    deleteScene
};
