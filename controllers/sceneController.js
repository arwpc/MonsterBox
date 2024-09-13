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

    // ... (keep all other methods unchanged)
};

module.exports = sceneController;
