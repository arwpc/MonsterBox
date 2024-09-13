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

    // ... (keep all other existing methods unchanged)
};

module.exports = sceneController;
