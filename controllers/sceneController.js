// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');

const sceneController = {
    getAllScenes: async (req, res, next, characterId) => {
        try {
            const scenes = await sceneService.getScenesByCharacter(characterId);
            const character = await characterService.getCharacterById(characterId);
            console.log('Retrieved scenes:', scenes);
            res.render('scenes', { title: 'Scenes', scenes, character });
        } catch (error) {
            console.error('Error getting scenes:', error);
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
                res.render('scene-form', { 
                    title: 'Edit Scene', 
                    scene, 
                    action: `/scenes/${scene.id}`,
                    character,
                    sounds,
                    parts
                });
            } else {
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).json({ error: 'Failed to retrieve scene', details: error.message });
        }
    },

    newScene: async (req, res, next, characterId) => {
        try {
            const character = await characterService.getCharacterById(characterId);
            const sounds = await soundService.getSoundsByCharacter(characterId);
            const parts = await partService.getPartsByCharacter(characterId);
            
            res.render('scene-form', {
                title: 'New Scene',
                scene: { character_id: characterId },
                action: '/scenes',
                character,
                sounds,
                parts
            });
        } catch (error) {
            console.error('Error rendering new scene form:', error);
            res.status(500).json({ error: 'Failed to render new scene form', details: error.message });
        }
    },

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating new scene:', error);
            res.status(500).json({ error: 'Failed to create new scene', details: error.message });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            if (updatedScene) {
                res.redirect('/scenes');  // Redirect to scenes list
            } else {
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).json({ error: 'Failed to update scene', details: error.message });
        }
    },

    deleteScene: async (req, res) => {
        try {
            const result = await sceneService.deleteScene(req.params.id);
            if (result) {
                res.json({ success: true, message: 'Scene deleted successfully' });
            } else {
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error deleting scene:', error);
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

            res.render('partials/step', {
                step,
                index: parseInt(index),
                parts,
                sounds,
                layout: false
            });
        } catch (error) {
            console.error('Error rendering step template:', error);
            res.status(500).json({ error: 'Failed to render step template', details: error.message });
        }
    }
};

module.exports = sceneController;