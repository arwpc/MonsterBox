// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    getAllScenes: async (req, res) => {
        try {
            const scenes = await sceneService.getAllScenes();
            console.log('Retrieved scenes:', scenes);
            res.render('scenes', { title: 'All Scenes', scenes });
        } catch (error) {
            console.error('Error getting all scenes:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scenes', error });
        }
    },

    getSceneById: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                res.render('scene-player', { title: 'Scene Player', scene });
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
    },

    playScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            // Add logic to play the scene
            res.json({ message: 'Scene played successfully' });
        } catch (error) {
            console.error('Error playing scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeStep: async (req, res) => {
        try {
            const { sceneId, stepIndex } = req.params;
            // Add logic to execute the specific step
            res.json({ message: 'Step executed successfully' });
        } catch (error) {
            console.error('Error executing step:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            // Add logic to execute all steps of the scene
            res.json({ message: 'Scene executed successfully' });
        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    // ... (keep all other existing methods unchanged)
};

module.exports = sceneController;
