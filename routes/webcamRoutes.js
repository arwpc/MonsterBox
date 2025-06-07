const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const logger = require('../scripts/logger');
const { spawn } = require('child_process');
const path = require('path');

// Middleware to check if character is selected
const checkCharacterSelected = (req, res, next) => {
    if (!req.characterId && !req.body.characterId && !req.query.characterId) {
        return res.status(400).send('No character selected. Please select a character first.');
    }
    req.characterId = req.characterId || req.body.characterId || req.query.characterId;
    next();
};

// Get webcam creation form
router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId;
        let character = null;
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
        }

        res.render('part-forms/webcam', {
            title: 'Create Webcam',
            action: '/parts/webcam',
            part: {},
            characters,
            character
        });
    } catch (error) {
        logger.error('Error fetching characters for webcam creation:', error);
        res.status(500).send('An error occurred while fetching the characters: ' + error.message);
    }
});

// Get webcam edit form
router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Webcam with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        if (!part || part.type !== 'webcam') {
            throw new Error('Webcam not found');
        }
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);

        res.render('part-forms/webcam', {
            title: 'Edit Webcam',
            action: `/parts/webcam/${part.id}`,
            part,
            characters,
            character
        });
    } catch (error) {
        logger.error('Error fetching Webcam:', error);
        res.status(500).send('An error occurred while fetching the Webcam: ' + error.message);
    }
});

// Create new webcam
router.post('/', checkCharacterSelected, async (req, res) => {
    try {
        // Validate that character doesn't already have a webcam
        const existingParts = await partService.getPartsByCharacter(req.characterId);
        const existingWebcam = existingParts.find(part => part.type === 'webcam');
        
        if (existingWebcam) {
            throw new Error('Character already has a webcam assigned. Each character can only have one webcam.');
        }

        const newWebcam = {
            name: req.body.name,
            type: 'webcam',
            characterId: parseInt(req.body.characterId, 10),
            deviceId: parseInt(req.body.deviceId, 10),
            devicePath: req.body.devicePath || `/dev/video${req.body.deviceId}`,
            resolution: req.body.resolution || '1280x720',
            fps: parseInt(req.body.fps, 10) || 30,
            status: req.body.status || 'active'
        };

        // Validate device ID
        if (isNaN(newWebcam.deviceId)) {
            throw new Error('Invalid camera device selected');
        }

        // Validate resolution format
        const resolutionPattern = /^\d+x\d+$/;
        if (!resolutionPattern.test(newWebcam.resolution)) {
            throw new Error('Invalid resolution format');
        }

        // Validate FPS
        if (newWebcam.fps < 1 || newWebcam.fps > 60) {
            throw new Error('FPS must be between 1 and 60');
        }

        const createdWebcam = await partService.createPart(newWebcam);
        logger.info('Created webcam:', createdWebcam);

        res.redirect(`/parts?characterId=${createdWebcam.characterId}`);
    } catch (error) {
        logger.error('Error creating Webcam:', error);
        res.status(500).send('An error occurred while creating the Webcam: ' + error.message);
    }
});

// Update existing webcam
router.post('/:id', checkCharacterSelected, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const existingPart = await partService.getPartById(id);
        if (!existingPart || existingPart.type !== 'webcam') {
            throw new Error('Webcam not found');
        }

        // Check if changing character and validate webcam limit
        const newCharacterId = parseInt(req.body.characterId, 10);
        if (newCharacterId !== existingPart.characterId) {
            const existingParts = await partService.getPartsByCharacter(newCharacterId);
            const existingWebcam = existingParts.find(part => part.type === 'webcam' && part.id !== id);
            
            if (existingWebcam) {
                throw new Error('Target character already has a webcam assigned. Each character can only have one webcam.');
            }
        }

        const updatedWebcam = {
            name: req.body.name,
            type: 'webcam',
            characterId: newCharacterId,
            deviceId: parseInt(req.body.deviceId, 10),
            devicePath: req.body.devicePath || `/dev/video${req.body.deviceId}`,
            resolution: req.body.resolution || '1280x720',
            fps: parseInt(req.body.fps, 10) || 30,
            status: req.body.status || 'active'
        };

        // Validate device ID
        if (isNaN(updatedWebcam.deviceId)) {
            throw new Error('Invalid camera device selected');
        }

        // Validate resolution format
        const resolutionPattern = /^\d+x\d+$/;
        if (!resolutionPattern.test(updatedWebcam.resolution)) {
            throw new Error('Invalid resolution format');
        }

        // Validate FPS
        if (updatedWebcam.fps < 1 || updatedWebcam.fps > 60) {
            throw new Error('FPS must be between 1 and 60');
        }

        const result = await partService.updatePart(id, updatedWebcam);
        if (!result) {
            throw new Error('Failed to update webcam');
        }

        logger.info('Updated webcam:', result);
        res.redirect(`/parts?characterId=${result.characterId}`);
    } catch (error) {
        logger.error('Error updating Webcam:', error);
        res.status(500).send('An error occurred while updating the Webcam: ' + error.message);
    }
});

// Delete webcam
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const existingPart = await partService.getPartById(id);
        if (!existingPart || existingPart.type !== 'webcam') {
            throw new Error('Webcam not found');
        }

        const success = await partService.deletePart(id);
        if (!success) {
            throw new Error('Failed to delete webcam');
        }

        logger.info('Deleted webcam with ID:', id);
        res.json({ success: true, message: 'Webcam deleted successfully' });
    } catch (error) {
        logger.error('Error deleting Webcam:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
