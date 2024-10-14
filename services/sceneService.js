const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

const dataPath = path.join(__dirname, '../data/scenes.json');

const validateSceneData = (sceneData) => {
    if (!sceneData.character_id || isNaN(parseInt(sceneData.character_id))) {
        logger.error('Invalid character_id');
        throw new Error('Invalid character_id');
    }
    if (typeof sceneData.scene_name !== 'string' || sceneData.scene_name.trim() === '') {
        logger.error('Invalid scene_name');
        throw new Error('Invalid scene_name');
    }
    if (!Array.isArray(sceneData.steps)) {
        logger.error('Invalid steps');
        throw new Error('Invalid steps');
    }
};

const getAllScenes = async () => {
    try {
        const data = await fs.readFile(dataPath, 'utf8');
        let scenes = JSON.parse(data);
        scenes = scenes.map(scene => ({
            ...scene,
            id: parseInt(scene.id)
        }));
        logger.debug(`Retrieved ${scenes.length} scenes`);
        return scenes;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('Scenes file not found, returning empty array');
            return [];
        }
        logger.error('Error reading scenes file:', error);
        throw error;
    }
};

const getSceneById = async (id) => {
    const scenes = await getAllScenes();
    const scene = scenes.find(scene => scene.id === parseInt(id));
    if (scene) {
        logger.debug(`Retrieved scene with id ${id}`);
    } else {
        logger.warn(`Scene with id ${id} not found`);
    }
    return scene;
};

const getScenesByCharacter = async (characterId) => {
    const scenes = await getAllScenes();
    const characterScenes = scenes.filter(scene => scene.character_id === parseInt(characterId));
    logger.debug(`Retrieved ${characterScenes.length} scenes for character ${characterId}`);
    return characterScenes;
};

const getNextId = (scenes) => {
    return scenes.length > 0 ? Math.max(...scenes.map(s => parseInt(s.id) || 0)) + 1 : 1;
};

const createScene = async (sceneData) => {
    validateSceneData(sceneData);
    const scenes = await getAllScenes();
    const newScene = {
        id: getNextId(scenes),
        character_id: parseInt(sceneData.character_id),
        scene_name: sceneData.scene_name || 'Untitled Scene',
        steps: sceneData.steps || []
    };
    scenes.push(newScene);
    await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
    logger.info(`Created new scene with id ${newScene.id}, name: ${newScene.scene_name}, steps: ${newScene.steps.length}`);
    return newScene;
};

const updateScene = async (id, sceneData) => {
    validateSceneData(sceneData);
    const scenes = await getAllScenes();
    const index = scenes.findIndex(scene => scene.id === parseInt(id));
    if (index !== -1) {
        scenes[index] = {
            ...scenes[index],
            ...sceneData,
            id: parseInt(id),
            character_id: parseInt(sceneData.character_id),
            scene_name: sceneData.scene_name || scenes[index].scene_name || 'Untitled Scene',
            steps: sceneData.steps || scenes[index].steps || []
        };
        await fs.writeFile(dataPath, JSON.stringify(scenes, null, 2));
        logger.info(`Updated scene with id ${id}, name: ${scenes[index].scene_name}, steps: ${scenes[index].steps.length}`);
        return scenes[index];
    }
    logger.warn(`Attempt to update non-existent scene with id ${id}`);
    return null;
};

const deleteScene = async (id) => {
    const scenes = await getAllScenes();
    const filteredScenes = scenes.filter(scene => scene.id !== parseInt(id));
    if (filteredScenes.length === scenes.length) {
        logger.warn(`Attempt to delete non-existent scene with id ${id}`);
        return false;
    }
    await fs.writeFile(dataPath, JSON.stringify(filteredScenes, null, 2));
    logger.info(`Deleted scene with id ${id}`);
    return true;
};

module.exports = {
    validateSceneData,
    getAllScenes,
    getSceneById,
    getScenesByCharacter,
    createScene,
    updateScene,
    deleteScene
};
