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
            console.log('Retrieved scenes:', scenes); // Add this log
            res.render('scenes', { scenes });
        } catch (error) {
            console.error('Error getting all scenes:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    getSceneById: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                res.render('scene-player', { scene });
            } else {
                res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    newScene: async (req, res) => {
        try {
            // TODO: Implement logic for rendering new scene form
            res.render('scene-form', { scene: {} });
        } catch (error) {
            console.error('Error rendering new scene form:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    createScene: async (req, res) => {
        try {
            // TODO: Implement logic for creating a new scene
            const newScene = await sceneService.createScene(req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating new scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    updateScene: async (req, res) => {
        try {
            // TODO: Implement logic for updating a scene
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    deleteScene: async (req, res) => {
        try {
            // TODO: Implement logic for deleting a scene
            await sceneService.deleteScene(req.params.id);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error deleting scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    playScene: async (req, res) => {
        try {
            // TODO: Implement logic for playing a scene
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
            // TODO: Implement logic for executing a single step of a scene
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
            // TODO: Implement logic for executing an entire scene
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
