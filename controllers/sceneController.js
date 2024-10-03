// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const logger = require('../logger');

const sceneController = {
    getAllScenes: async (req, res, next, characterId) => {
        try {
            const scenes = await sceneService.getScenesByCharacter(characterId);
            const character = await characterService.getCharacterById(characterId);
            logger.info(`Retrieved ${scenes.length} scenes for character ${characterId}`);
            res.render('scenes', { title: 'Scenes', scenes, character });
        } catch (error) {
            logger.error(`Error getting scenes for character ${characterId}:`, error);
            res.status(500).render('error', { error: 'Failed to retrieve scenes' });
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

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            logger.info(`Created new scene with ID ${newScene.id} for character ${newScene.character_id}`);
            res.redirect('/scenes');
        } catch (error) {
            logger.error('Error creating new scene:', error);
            res.status(500).render('error', { error: 'Failed to create new scene' });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            if (updatedScene) {
                logger.info(`Updated scene with ID ${req.params.id} for character ${updatedScene.character_id}`);
                res.redirect('/scenes');
            } else {
                logger.warn(`Attempt to update non-existent scene with ID ${req.params.id}`);
                res.status(404).render('error', { error: 'Scene not found' });
            }
        } catch (error) {
            logger.error(`Error updating scene ${req.params.id}:`, error);
            res.status(500).render('error', { error: 'Failed to update scene' });
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
    }
};

module.exports = sceneController;