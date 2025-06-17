// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const sceneAnalyticsService = require('../services/sceneAnalyticsService');
const logger = require('../scripts/logger');

const sceneController = {
    getAllScenes: async (req, res, next, characterId) => {
        try {
            const scenes = await sceneService.getScenesByCharacter(characterId);
            const character = await characterService.getCharacterById(characterId);

            logger.debug(`Character data: ${JSON.stringify(character)}`);

            if (!character) {
                logger.warn(`Character with ID ${characterId} not found`);
                return res.status(404).json({ error: 'Character not found' });
            }

            logger.info(`Retrieved ${scenes.length} scenes for character ${characterId}`);
            logger.debug(`Scenes data: ${JSON.stringify(scenes)}`);

            if (process.env.NODE_ENV === 'test') {
                return res.json({ scenes, character });
            } else {
                res.render('scenes', { title: 'Scenes', scenes, character });
            }
        } catch (error) {
            logger.error(`Error getting scenes for character ${characterId}:`, error);
            res.status(500).json({ error: 'Failed to retrieve scenes' });
        }
    },

    getSceneById: async (req, res, next, characterId) => {
        try {
            const sceneId = req.params.id;
            const [scene, character, sounds, parts] = await Promise.all([
                sceneService.getSceneById(sceneId),
                characterService.getCharacterById(characterId),
                soundService.getSoundsByCharacter(characterId),
                partService.getPartsByCharacter(characterId)
            ]);

            if (!character) {
                logger.warn(`Character with ID ${characterId} not found`);
                return res.status(404).render('error', { error: 'Character not found' });
            }

            if (scene && scene.character_id === parseInt(characterId)) {
                logger.info(`Retrieved scene ${sceneId} for character ${characterId}`);
                res.render('scene-form', {
                    title: 'Edit Scene',
                    scene,
                    action: `/scenes/${scene.id}`,
                    character,
                    sounds: sounds || [],
                    parts: parts || []
                });
            } else {
                logger.warn(`Scene ${sceneId} not found or does not belong to character ${characterId}`);
                res.status(404).render('error', { error: 'Scene not found' });
            }
        } catch (error) {
            logger.error(`Error getting scene ${req.params.id} for character ${characterId}:`, error);
            res.status(500).render('error', { error: 'Failed to retrieve scene' });
        }
    },

    newScene: async (req, res, next, characterId) => {
        try {
            const [character, sounds, parts] = await Promise.all([
                characterService.getCharacterById(characterId),
                soundService.getSoundsByCharacter(characterId),
                partService.getPartsByCharacter(characterId)
            ]);

            if (!character) {
                logger.warn(`Character with ID ${characterId} not found`);
                return res.status(404).render('error', { error: 'Character not found' });
            }

            logger.info(`Rendering new scene form for character ${characterId}`);
            res.render('scene-form', {
                title: 'New Scene',
                scene: { character_id: characterId },
                action: '/scenes',
                character,
                sounds: sounds || [],
                parts: parts || []
            });
        } catch (error) {
            logger.error(`Error rendering new scene form for character ${characterId}:`, error);
            res.status(500).render('error', { error: 'Failed to render new scene form' });
        }
    },

    createScene: async (req, res, next) => {
        try {
            const characterId = parseInt(req.body.character_id || req.query.characterId);
            if (isNaN(characterId)) {
                throw new Error('Invalid character ID');
            }

            // Log the scene_name from the request body
            logger.info(`Received scene_name: ${req.body.scene_name}`);

            logger.info(`Attempting to create new scene with data:`, JSON.stringify(req.body));

            // Parse steps from the new format
            const steps = [];
            for (let key in req.body) {
                if (key.startsWith('steps[')) {
                    const match = key.match(/steps\[(\d+)\]\[(\w+)\]/);
                    if (match) {
                        const index = parseInt(match[1]);
                        const prop = match[2];
                        if (!steps[index]) steps[index] = {};
                        steps[index][prop] = req.body[key];
                    }
                }
            }

            logger.info(`Parsed steps:`, JSON.stringify(steps));

            const sceneData = {
                character_id: characterId,
                scene_name: req.body.scene_name,
                steps: steps
            };

            // Validate scene data
            sceneService.validateSceneData(sceneData);

            logger.info(`Scene data being sent to service:`, JSON.stringify(sceneData));

            const newScene = await sceneService.createScene(sceneData);

            logger.info(`Created new scene:`, JSON.stringify(newScene));

            if (!newScene.scene_name || newScene.steps.length === 0) {
                logger.warn(`Created scene is missing name or steps`);
            }

            if (process.env.NODE_ENV === 'test') {
                return res.json(newScene);
            } else {
                res.redirect(`/scenes?characterId=${newScene.character_id}`);
            }
        } catch (error) {
            logger.error('Error creating new scene:', error);
            logger.error('Request body:', JSON.stringify(req.body));
            res.status(500).json({ error: 'Failed to create new scene', details: error.message });
        }
    },

    updateScene: async (req, res) => {
        try {
            const characterId = parseInt(req.body.character_id || req.query.characterId);
            if (isNaN(characterId)) {
                throw new Error('Invalid character ID');
            }

            logger.info(`Received request body:`, JSON.stringify(req.body));

            // Parse steps from the new format
            const steps = [];
            for (let key in req.body) {
                if (key.startsWith('steps[')) {
                    const match = key.match(/steps\[(\d+)\]\[(\w+)\]/);
                    if (match) {
                        const index = parseInt(match[1]);
                        const prop = match[2];
                        if (!steps[index]) steps[index] = {};
                        steps[index][prop] = req.body[key];
                    }
                }
            }

            logger.info(`Parsed steps:`, JSON.stringify(steps));

            const sceneData = {
                character_id: characterId,
                scene_name: req.body.scene_name,
                steps: steps
            };

            // Validate scene data
            sceneService.validateSceneData(sceneData);

            logger.info(`Scene data being sent to service:`, JSON.stringify(sceneData));

            const updatedScene = await sceneService.updateScene(req.params.id, sceneData);
            if (updatedScene) {
                logger.info(`Updated scene:`, JSON.stringify(updatedScene));
                res.redirect(`/scenes?characterId=${updatedScene.character_id}`);
            } else {
                logger.warn(`Attempt to update non-existent scene with ID ${req.params.id}`);
                res.status(404).render('error', { error: 'Scene not found' });
            }
        } catch (error) {
            logger.error(`Error updating scene ${req.params.id}:`, error);
            res.status(500).render('error', { error: 'Failed to update scene', details: error.message });
        }
    },

    deleteScene: async (req, res) => {
        try {
            const result = await sceneService.deleteScene(req.params.id);
            if (result) {
                logger.info(`Deleted scene with ID ${req.params.id}`);
                res.json({ success: true, message: 'Scene deleted successfully' });
            } else {
                logger.warn(`Attempt to delete non-existent scene with ID ${req.params.id}`);
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            logger.error(`Error deleting scene ${req.params.id}:`, error);
            res.status(500).json({ error: 'Failed to delete scene' });
        }
    },

    getStepTemplate: async (req, res, next, characterId) => {
        try {
            const { type, index } = req.query;
            const [sounds, parts] = await Promise.all([
                soundService.getSoundsByCharacter(characterId),
                partService.getPartsByCharacter(characterId)
            ]);

            const step = {
                type: type,
                name: '',
                concurrent: false
            };

            logger.info(`Rendering step template for character ${characterId}, type ${type}, index ${index}`);
            res.render('partials/step', {
                step,
                index: parseInt(index),
                parts: parts || [],
                sounds: sounds || [],
                layout: false
            });
        } catch (error) {
            logger.error(`Error rendering step template for character ${characterId}:`, error);
            res.status(500).json({ error: 'Failed to render step template' });
        }
    },

    exportScenes: async (req, res) => {
        try {
            const characterId = req.query.characterId;
            const exportData = await sceneService.exportScenes(characterId);

            const filename = characterId
                ? `scenes_character_${characterId}_${new Date().toISOString().split('T')[0]}.json`
                : `scenes_all_${new Date().toISOString().split('T')[0]}.json`;

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.json(exportData);

            logger.info(`Exported scenes${characterId ? ` for character ${characterId}` : ''}`);
        } catch (error) {
            logger.error('Error exporting scenes:', error);
            res.status(500).json({ error: 'Failed to export scenes', details: error.message });
        }
    },

    importScenes: async (req, res) => {
        try {
            const importData = req.body;
            const options = {
                overwrite: req.body.overwrite === 'true' || req.body.overwrite === true,
                characterId: req.body.targetCharacterId || req.query.characterId
            };

            const result = await sceneService.importScenes(importData, options);

            logger.info(`Scene import completed: ${JSON.stringify(result)}`);

            if (process.env.NODE_ENV === 'test') {
                res.json(result);
            } else {
                res.json({
                    success: true,
                    message: `Import completed: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`,
                    details: result
                });
            }
        } catch (error) {
            logger.error('Error importing scenes:', error);
            res.status(500).json({ error: 'Failed to import scenes', details: error.message });
        }
    },

    duplicateScene: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const newName = req.body.newName;

            const duplicatedScene = await sceneService.duplicateScene(sceneId, newName);

            logger.info(`Duplicated scene ${sceneId} as new scene ${duplicatedScene.id}`);

            if (process.env.NODE_ENV === 'test') {
                res.json(duplicatedScene);
            } else {
                res.redirect(`/scenes?characterId=${duplicatedScene.character_id}`);
            }
        } catch (error) {
            logger.error(`Error duplicating scene ${req.params.id}:`, error);
            res.status(500).json({ error: 'Failed to duplicate scene', details: error.message });
        }
    },

    getSceneTemplates: async (req, res) => {
        try {
            const templates = await sceneService.getSceneTemplates();

            if (process.env.NODE_ENV === 'test') {
                res.json(templates);
            } else {
                res.json(templates);
            }
        } catch (error) {
            logger.error('Error getting scene templates:', error);
            res.status(500).json({ error: 'Failed to get scene templates', details: error.message });
        }
    },

    createSceneFromTemplate: async (req, res) => {
        try {
            const templateId = req.body.templateId;
            const characterId = req.body.character_id || req.query.characterId;
            const sceneName = req.body.scene_name;

            if (!templateId) {
                return res.status(400).json({ error: 'Template ID is required' });
            }

            if (!characterId) {
                return res.status(400).json({ error: 'Character ID is required' });
            }

            const newScene = await sceneService.createSceneFromTemplate(templateId, characterId, sceneName);

            logger.info(`Created scene from template ${templateId}: ${newScene.scene_name}`);

            if (process.env.NODE_ENV === 'test') {
                res.json(newScene);
            } else {
                res.redirect(`/scenes/${newScene.id}/edit?characterId=${characterId}`);
            }
        } catch (error) {
            logger.error('Error creating scene from template:', error);
            res.status(500).json({ error: 'Failed to create scene from template', details: error.message });
        }
    },

    getSceneAnalytics: async (req, res) => {
        try {
            const sceneId = req.query.sceneId;
            const characterId = req.query.characterId;

            const analytics = await sceneAnalyticsService.getSceneAnalytics(sceneId, characterId);

            res.json(analytics);
        } catch (error) {
            logger.error('Error getting scene analytics:', error);
            res.status(500).json({ error: 'Failed to get scene analytics', details: error.message });
        }
    },

    getPopularScenes: async (req, res) => {
        try {
            const characterId = req.query.characterId;
            const limit = parseInt(req.query.limit) || 10;

            const popularScenes = await sceneAnalyticsService.getPopularScenes(characterId, limit);

            res.json(popularScenes);
        } catch (error) {
            logger.error('Error getting popular scenes:', error);
            res.status(500).json({ error: 'Failed to get popular scenes', details: error.message });
        }
    },

    getScenePerformanceMetrics: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const characterId = req.query.characterId;

            const metrics = await sceneAnalyticsService.getScenePerformanceMetrics(sceneId, characterId);

            if (!metrics) {
                return res.status(404).json({ error: 'No performance data found for this scene' });
            }

            res.json(metrics);
        } catch (error) {
            logger.error('Error getting scene performance metrics:', error);
            res.status(500).json({ error: 'Failed to get scene performance metrics', details: error.message });
        }
    }
};

module.exports = sceneController;
