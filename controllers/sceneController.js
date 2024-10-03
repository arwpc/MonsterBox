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
            logger.debug(`Retrieved ${scenes.length} scenes for character ${characterId}`);
            res.render('scenes', { title: 'Scenes', scenes, character });
        } catch (error) {
            logger.error('Error getting scenes:', error);
            console.error('Error getting scenes:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to retrieve scenes', details: error.message });
        }
    },

    getSceneById: async (req, res, next, characterId) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            const character = await characterService.getCharacterById(characterId);
            const sounds = await soundService.getSoundsByCharacter(characterId);
            const parts = await partService.getPartsByCharacter(characterId);
            if (scene && scene.character_id === parseInt(characterId)) {
                logger.debug(`Retrieved scene ${sceneId} for character ${characterId}`);
                res.render('scene-form', { 
                    title: 'Edit Scene', 
                    scene, 
                    action: `/scenes/${scene.id}`,
                    character,
                    sounds: sounds || [],
                    parts: parts || []
                });
            } else {
                logger.warn(`Scene ${sceneId} not found for character ${characterId}`);
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error getting scene by ID:', error);
            console.error('Error getting scene by ID:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to retrieve scene', details: error.message });
        }
    },

    newScene: async (req, res, next, characterId) => {
        try {
            const character = await characterService.getCharacterById(characterId);
            const sounds = await soundService.getSoundsByCharacter(characterId);
            const parts = await partService.getPartsByCharacter(characterId);
            
            logger.debug(`Rendering new scene form for character ${characterId}`);
            res.render('scene-form', {
                title: 'New Scene',
                scene: { character_id: characterId },
                action: '/scenes',
                character,
                sounds: sounds || [],
                parts: parts || []
            });
        } catch (error) {
            logger.error('Error rendering new scene form:', error);
            console.error('Error rendering new scene form:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to render new scene form', details: error.message });
        }
    },

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            logger.info(`Created new scene with ID ${newScene.id}`);
            res.redirect('/scenes');
        } catch (error) {
            logger.error('Error creating new scene:', error);
            console.error('Error creating new scene:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to create new scene', details: error.message });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            if (updatedScene) {
                logger.info(`Updated scene with ID ${req.params.id}`);
                res.redirect('/scenes');  // Redirect to scenes list
            } else {
                logger.warn(`Attempt to update non-existent scene with ID ${req.params.id}`);
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error updating scene:', error);
            console.error('Error updating scene:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to update scene', details: error.message });
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
            logger.error('Error deleting scene:', error);
            console.error('Error deleting scene:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to delete scene', details: error.message });
        }
    },

    getStepTemplate: async (req, res, next, characterId) => {
        try {
            const { type, index } = req.query;
            const sounds = await soundService.getSoundsByCharacter(characterId);
            const parts = await partService.getPartsByCharacter(characterId);
            
            const step = {
                type: type,
                name: '',
                concurrent: false
            };

            logger.debug(`Rendering step template for character ${characterId}, type ${type}, index ${index}`);
            res.render('partials/step', {
                step,
                index: parseInt(index),
                parts: parts || [],
                sounds: sounds || [],
                layout: false
            });
        } catch (error) {
            logger.error('Error rendering step template:', error);
            console.error('Error rendering step template:', error); // Keep console.error for UI-related errors
            res.status(500).json({ error: 'Failed to render step template', details: error.message });
        }
    }
};

module.exports = sceneController;