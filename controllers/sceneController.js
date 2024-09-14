// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');

const sceneController = {
    getAllScenes: async (req, res) => {
        try {
            const scenes = await sceneService.getAllScenes();
            const characters = await characterService.getAllCharacters();
            console.log('Retrieved scenes:', scenes);
            res.render('scenes', { title: 'All Scenes', scenes, characters });
        } catch (error) {
            console.error('Error getting all scenes:', error);
            res.status(500).json({ error: 'Failed to retrieve scenes', details: error.message });
        }
    },

    getSceneById: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            const characters = await characterService.getAllCharacters();
            const sounds = await soundService.getAllSounds();
            const parts = await partService.getAllParts();
            if (scene) {
                res.render('scene-form', { 
                    title: 'Edit Scene', 
                    scene, 
                    action: `/scenes/${scene.id}`,
                    characters,
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

    newScene: async (req, res) => {
        try {
            const characters = await characterService.getAllCharacters();
            const sounds = await soundService.getAllSounds();
            const parts = await partService.getAllParts();
            
            res.render('scene-form', {
                title: 'New Scene',
                scene: {},
                action: '/scenes',
                characters,
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
                res.json({ success: true, message: 'Scene updated successfully', scene: updatedScene });
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
    }
};

module.exports = sceneController;