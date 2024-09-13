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
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scenes', error });
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
                res.status(404).render('error', { title: 'Not Found', message: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scene', error });
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
            res.status(500).render('error', { title: 'Error', message: 'Failed to render new scene form', error });
        }
    },

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating new scene:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to create new scene', error });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to update scene', error });
        }
    },

    deleteScene: async (req, res) => {
        try {
            await sceneService.deleteScene(req.params.id);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error deleting scene:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to delete scene', error });
        }
    }
};

module.exports = sceneController;
