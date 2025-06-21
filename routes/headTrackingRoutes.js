const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const characterService = require('../services/characterService');

// Head tracking data file path
const HEAD_TRACKING_DATA_FILE = path.join(__dirname, '..', 'data', 'head_tracking.json');

/**
 * Load head tracking configurations from file
 */
async function loadHeadTrackingData() {
    try {
        const data = await fs.readFile(HEAD_TRACKING_DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty array
            return [];
        }
        throw error;
    }
}

/**
 * Save head tracking configurations to file
 */
async function saveHeadTrackingData(data) {
    await fs.writeFile(HEAD_TRACKING_DATA_FILE, JSON.stringify(data, null, 2));
}

/**
 * Generate unique ID for head tracking configuration
 */
function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// GET /parts/head-tracking/new - Show new head tracking form
router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId || (characters.length > 0 ? characters[0].id : null);
        const character = characterId ? await characterService.getCharacterById(characterId) : null;

        res.render('part-forms/head-tracking', {
            title: 'Add Head Tracking System',
            action: '/parts/head-tracking',
            part: { characterId: characterId },
            character: character,
            characters: characters
        });
    } catch (error) {
        logger.error('Error showing new head tracking form:', error);
        res.status(500).send('Error loading head tracking form');
    }
});

// GET /parts/head-tracking/:id/edit - Show edit head tracking form
router.get('/:id/edit', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();
        const part = headTrackingData.find(p => p.id === req.params.id);

        if (!part) {
            return res.status(404).send('Head tracking configuration not found');
        }

        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);

        res.render('part-forms/head-tracking', {
            title: 'Edit Head Tracking System',
            action: `/parts/head-tracking/${part.id}`,
            part: part,
            character: character,
            characters: characters
        });
    } catch (error) {
        logger.error('Error showing edit head tracking form:', error);
        res.status(500).send('Error loading head tracking form');
    }
});

// POST /parts/head-tracking - Create new head tracking configuration
router.post('/', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();

        const newHeadTracking = {
            id: generateId(),
            type: 'head-tracking',
            name: req.body.name,
            characterId: parseInt(req.body.characterId),
            enabled: req.body.enabled === 'on',

            // Webcam configuration
            webcam_device: req.body.webcam_device || '/dev/video0',
            webcam_width: parseInt(req.body.webcam_width) || 640,
            webcam_height: parseInt(req.body.webcam_height) || 480,
            webcam_fps: parseInt(req.body.webcam_fps) || 15,

            // Motion detection parameters
            motion_threshold: parseInt(req.body.motion_threshold) || 25,
            min_contour_area: parseInt(req.body.min_contour_area) || 500,
            max_contour_area: parseInt(req.body.max_contour_area) || 50000,
            background_learning_rate: parseFloat(req.body.background_learning_rate) || 0.01,
            noise_reduction_kernel_size: 3,

            // Tracking parameters
            tracking_smoothing: parseFloat(req.body.tracking_smoothing) || 0.3,
            tracking_deadzone: parseFloat(req.body.tracking_deadzone) || 5.0,
            tracking_sensitivity: parseFloat(req.body.tracking_sensitivity) || 1.0,

            // Servo configuration
            servo_id: req.body.servo_id || '',
            servo_min_angle: parseFloat(req.body.servo_min_angle) || 0.0,
            servo_max_angle: parseFloat(req.body.servo_max_angle) || 180.0,
            servo_center_angle: parseFloat(req.body.servo_center_angle) || 90.0,
            servo_speed: parseFloat(req.body.servo_speed) || 0.5,
            servo_reverse: req.body.servo_reverse === 'on',

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        headTrackingData.push(newHeadTracking);
        await saveHeadTrackingData(headTrackingData);

        logger.info(`Created head tracking configuration: ${newHeadTracking.name} for character ${newHeadTracking.characterId}`);

        const returnTo = req.query.returnTo || '/parts';
        res.redirect(returnTo);

    } catch (error) {
        logger.error('Error creating head tracking configuration:', error);
        res.status(500).send('Error creating head tracking configuration');
    }
});

// POST /parts/head-tracking/:id - Update head tracking configuration
router.post('/:id', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();
        const partIndex = headTrackingData.findIndex(p => p.id === req.params.id);

        if (partIndex === -1) {
            return res.status(404).send('Head tracking configuration not found');
        }

        // Update the configuration
        const updatedHeadTracking = {
            ...headTrackingData[partIndex],
            name: req.body.name,
            characterId: parseInt(req.body.characterId),
            enabled: req.body.enabled === 'on',

            // Webcam configuration
            webcam_device: req.body.webcam_device || '/dev/video0',
            webcam_width: parseInt(req.body.webcam_width) || 640,
            webcam_height: parseInt(req.body.webcam_height) || 480,
            webcam_fps: parseInt(req.body.webcam_fps) || 15,

            // Motion detection parameters
            motion_threshold: parseInt(req.body.motion_threshold) || 25,
            min_contour_area: parseInt(req.body.min_contour_area) || 500,
            max_contour_area: parseInt(req.body.max_contour_area) || 50000,
            background_learning_rate: parseFloat(req.body.background_learning_rate) || 0.01,

            // Tracking parameters
            tracking_smoothing: parseFloat(req.body.tracking_smoothing) || 0.3,
            tracking_deadzone: parseFloat(req.body.tracking_deadzone) || 5.0,
            tracking_sensitivity: parseFloat(req.body.tracking_sensitivity) || 1.0,

            // Servo configuration
            servo_id: req.body.servo_id || '',
            servo_min_angle: parseFloat(req.body.servo_min_angle) || 0.0,
            servo_max_angle: parseFloat(req.body.servo_max_angle) || 180.0,
            servo_center_angle: parseFloat(req.body.servo_center_angle) || 90.0,
            servo_speed: parseFloat(req.body.servo_speed) || 0.5,
            servo_reverse: req.body.servo_reverse === 'on',

            updated_at: new Date().toISOString()
        };

        headTrackingData[partIndex] = updatedHeadTracking;
        await saveHeadTrackingData(headTrackingData);

        logger.info(`Updated head tracking configuration: ${updatedHeadTracking.name} for character ${updatedHeadTracking.characterId}`);

        const returnTo = req.query.returnTo || '/parts';
        res.redirect(returnTo);

    } catch (error) {
        logger.error('Error updating head tracking configuration:', error);
        res.status(500).send('Error updating head tracking configuration');
    }
});

// DELETE /parts/head-tracking/:id - Delete head tracking configuration
router.delete('/:id', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();
        const partIndex = headTrackingData.findIndex(p => p.id === req.params.id);

        if (partIndex === -1) {
            return res.status(404).json({ success: false, message: 'Head tracking configuration not found' });
        }

        const deletedPart = headTrackingData.splice(partIndex, 1)[0];
        await saveHeadTrackingData(headTrackingData);

        logger.info(`Deleted head tracking configuration: ${deletedPart.name}`);

        res.json({ success: true, message: 'Head tracking configuration deleted successfully' });

    } catch (error) {
        logger.error('Error deleting head tracking configuration:', error);
        res.status(500).json({ success: false, message: 'Error deleting head tracking configuration' });
    }
});

// GET /parts/head-tracking - List all head tracking configurations (API endpoint)
router.get('/', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();
        const characterId = req.query.characterId;

        let filteredData = headTrackingData;
        if (characterId) {
            filteredData = headTrackingData.filter(p => p.characterId === parseInt(characterId));
        }

        res.json({ success: true, parts: filteredData });

    } catch (error) {
        logger.error('Error loading head tracking configurations:', error);
        res.status(500).json({ success: false, message: 'Error loading head tracking configurations' });
    }
});

// GET /parts/head-tracking/:id - Get specific head tracking configuration
router.get('/:id', async (req, res) => {
    try {
        const headTrackingData = await loadHeadTrackingData();
        const part = headTrackingData.find(p => p.id === req.params.id);

        if (!part) {
            return res.status(404).json({ success: false, message: 'Head tracking configuration not found' });
        }

        res.json({ success: true, part: part });

    } catch (error) {
        logger.error('Error loading head tracking configuration:', error);
        res.status(500).json({ success: false, message: 'Error loading head tracking configuration' });
    }
});

module.exports = router;
