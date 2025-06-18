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
    if (sceneData.scene_name.length > 100) {
        logger.error('Scene name too long');
        throw new Error('Scene name must be 100 characters or less');
    }
    if (!Array.isArray(sceneData.steps)) {
        logger.error('Invalid steps');
        throw new Error('Invalid steps');
    }
    if (sceneData.steps.length === 0) {
        logger.error('No steps provided');
        throw new Error('At least one step is required');
    }
    if (sceneData.steps.length > 50) {
        logger.error('Too many steps');
        throw new Error('Maximum 50 steps allowed per scene');
    }

    // Validate each step
    sceneData.steps.forEach((step, index) => {
        validateStepData(step, index);
    });

    logger.debug(`Scene data validation passed for scene: ${sceneData.scene_name}`);
};

const validateStepData = (step, index) => {
    if (!step.type) {
        throw new Error(`Step ${index + 1}: Step type is required`);
    }

    if (!step.name || step.name.trim() === '') {
        throw new Error(`Step ${index + 1}: Step name is required`);
    }

    if (step.name.length > 50) {
        throw new Error(`Step ${index + 1}: Step name must be 50 characters or less`);
    }

    const validStepTypes = ['sound', 'voice', 'motor', 'linear-actuator', 'servo', 'led', 'light', 'sensor', 'pause'];
    if (!validStepTypes.includes(step.type.toLowerCase())) {
        throw new Error(`Step ${index + 1}: Invalid step type '${step.type}'. Valid types: ${validStepTypes.join(', ')}`);
    }

    // Type-specific validation
    switch (step.type.toLowerCase()) {
        case 'sound':
        case 'voice':
            if (!step.sound_id) {
                throw new Error(`Step ${index + 1}: Sound ID is required for ${step.type} steps`);
            }
            break;

        case 'motor':
        case 'linear-actuator':
            if (!step.part_id) {
                throw new Error(`Step ${index + 1}: Part ID is required for ${step.type} steps`);
            }
            if (!step.duration || isNaN(parseInt(step.duration))) {
                throw new Error(`Step ${index + 1}: Valid duration is required for ${step.type} steps`);
            }
            if (!step.direction || !['forward', 'backward'].includes(step.direction.toLowerCase())) {
                throw new Error(`Step ${index + 1}: Direction must be 'forward' or 'backward' for ${step.type} steps`);
            }
            if (step.speed && (isNaN(parseInt(step.speed)) || parseInt(step.speed) < 0 || parseInt(step.speed) > 100)) {
                throw new Error(`Step ${index + 1}: Speed must be between 0 and 100 for ${step.type} steps`);
            }
            break;

        case 'servo':
            if (!step.part_id) {
                throw new Error(`Step ${index + 1}: Part ID is required for servo steps`);
            }
            if (!step.angle || isNaN(parseFloat(step.angle))) {
                throw new Error(`Step ${index + 1}: Valid angle is required for servo steps`);
            }
            if (parseFloat(step.angle) < 0 || parseFloat(step.angle) > 180) {
                throw new Error(`Step ${index + 1}: Servo angle must be between 0 and 180 degrees`);
            }
            if (!step.duration || isNaN(parseInt(step.duration))) {
                throw new Error(`Step ${index + 1}: Valid duration is required for servo steps`);
            }
            break;

        case 'led':
        case 'light':
            if (!step.part_id) {
                throw new Error(`Step ${index + 1}: Part ID is required for ${step.type} steps`);
            }
            if (!step.state || !['on', 'off'].includes(step.state.toLowerCase())) {
                throw new Error(`Step ${index + 1}: State must be 'on' or 'off' for ${step.type} steps`);
            }
            if (!step.duration || isNaN(parseInt(step.duration))) {
                throw new Error(`Step ${index + 1}: Valid duration is required for ${step.type} steps`);
            }
            break;

        case 'sensor':
            if (!step.part_id) {
                throw new Error(`Step ${index + 1}: Part ID is required for sensor steps`);
            }
            if (!step.threshold || isNaN(parseFloat(step.threshold))) {
                throw new Error(`Step ${index + 1}: Valid threshold is required for sensor steps`);
            }
            if (!step.comparison || !['greater', 'less', 'equal'].includes(step.comparison.toLowerCase())) {
                throw new Error(`Step ${index + 1}: Comparison must be 'greater', 'less', or 'equal' for sensor steps`);
            }
            break;

        case 'pause':
            if (!step.duration || isNaN(parseInt(step.duration))) {
                throw new Error(`Step ${index + 1}: Valid duration is required for pause steps`);
            }
            if (parseInt(step.duration) < 100 || parseInt(step.duration) > 60000) {
                throw new Error(`Step ${index + 1}: Pause duration must be between 100ms and 60 seconds`);
            }
            break;
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

const exportScenes = async (characterId = null) => {
    try {
        let scenes;
        if (characterId) {
            scenes = await getScenesByCharacter(characterId);
        } else {
            scenes = await getAllScenes();
        }

        const exportData = {
            exportDate: new Date().toISOString(),
            characterId: characterId,
            scenes: scenes,
            version: '1.0'
        };

        logger.info(`Exported ${scenes.length} scenes${characterId ? ` for character ${characterId}` : ''}`);
        return exportData;
    } catch (error) {
        logger.error('Error exporting scenes:', error);
        throw error;
    }
};

const importScenes = async (importData, options = {}) => {
    try {
        const { overwrite = false, characterId = null } = options;

        if (!importData.scenes || !Array.isArray(importData.scenes)) {
            throw new Error('Invalid import data: scenes array is required');
        }

        const existingScenes = await getAllScenes();
        let importedCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        for (const sceneData of importData.scenes) {
            // If characterId is specified, override the scene's character_id
            if (characterId) {
                sceneData.character_id = parseInt(characterId);
            }

            // Validate scene data
            validateSceneData(sceneData);

            // Check if scene already exists (by name and character_id)
            const existingScene = existingScenes.find(s =>
                s.scene_name === sceneData.scene_name &&
                s.character_id === sceneData.character_id
            );

            if (existingScene) {
                if (overwrite) {
                    // Update existing scene
                    await updateScene(existingScene.id, sceneData);
                    updatedCount++;
                    logger.info(`Updated existing scene: ${sceneData.scene_name}`);
                } else {
                    // Skip existing scene
                    skippedCount++;
                    logger.info(`Skipped existing scene: ${sceneData.scene_name}`);
                }
            } else {
                // Create new scene (remove id to let system assign new one)
                const { id, ...sceneDataWithoutId } = sceneData;
                await createScene(sceneDataWithoutId);
                importedCount++;
                logger.info(`Imported new scene: ${sceneData.scene_name}`);
            }
        }

        const result = {
            imported: importedCount,
            updated: updatedCount,
            skipped: skippedCount,
            total: importData.scenes.length
        };

        logger.info(`Scene import completed: ${JSON.stringify(result)}`);
        return result;
    } catch (error) {
        logger.error('Error importing scenes:', error);
        throw error;
    }
};

const duplicateScene = async (sceneId, newName = null) => {
    try {
        const originalScene = await getSceneById(sceneId);
        if (!originalScene) {
            throw new Error(`Scene with id ${sceneId} not found`);
        }

        const duplicatedScene = {
            character_id: originalScene.character_id,
            scene_name: newName || `${originalScene.scene_name} (Copy)`,
            steps: JSON.parse(JSON.stringify(originalScene.steps)) // Deep copy steps
        };

        const newScene = await createScene(duplicatedScene);
        logger.info(`Duplicated scene ${sceneId} as new scene ${newScene.id}`);
        return newScene;
    } catch (error) {
        logger.error(`Error duplicating scene ${sceneId}:`, error);
        throw error;
    }
};

const getSceneTemplates = async () => {
    try {
        const templatesPath = path.join(__dirname, '..', 'data', 'scene-templates.json');
        const data = await fs.readFile(templatesPath, 'utf8');
        const templates = JSON.parse(data);
        logger.debug(`Retrieved ${templates.length} scene templates`);
        return templates;
    } catch (error) {
        if (error.code === 'ENOENT') {
            logger.info('Scene templates file not found, returning empty array');
            return [];
        }
        logger.error('Error reading scene templates file:', error);
        throw error;
    }
};

const createSceneFromTemplate = async (templateId, characterId, sceneName = null) => {
    try {
        const templates = await getSceneTemplates();
        const template = templates.find(t => t.id === templateId);

        if (!template) {
            throw new Error(`Template with id ${templateId} not found`);
        }

        const sceneData = {
            character_id: parseInt(characterId),
            scene_name: sceneName || `${template.name} - ${new Date().toLocaleDateString()}`,
            steps: JSON.parse(JSON.stringify(template.steps)) // Deep copy steps
        };

        const newScene = await createScene(sceneData);
        logger.info(`Created scene from template ${templateId}: ${newScene.scene_name}`);
        return newScene;
    } catch (error) {
        logger.error(`Error creating scene from template ${templateId}:`, error);
        throw error;
    }
};

module.exports = {
    validateSceneData,
    getAllScenes,
    getSceneById,
    getScenesByCharacter,
    createScene,
    updateScene,
    deleteScene,
    exportScenes,
    importScenes,
    duplicateScene,
    getSceneTemplates,
    createSceneFromTemplate
};
