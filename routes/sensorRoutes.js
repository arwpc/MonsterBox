const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        const characterId = req.query.characterId;
        let character = null;
        if (characterId) {
            character = await characterService.getCharacterById(characterId);
        }
        res.render('part-forms/sensor', { title: 'Create Sensor', action: '/parts/sensor', part: {}, characters, character });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching the characters: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Sensor with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);
        res.render('part-forms/sensor', { title: 'Edit Sensor', action: `/parts/sensor/${part.id}`, part, characters, character });
    } catch (error) {
        logger.error('Error fetching Sensor:', error);
        res.status(500).send('An error occurred while fetching the Sensor: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newSensor = {
            name: req.body.name,
            type: 'sensor',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26,
            active: req.body.active === 'on',
            sensorType: req.body.sensorType || 'motion'
        };

        const createdSensor = await partService.createPart(newSensor);
        logger.info('Created sensor:', createdSensor);

        res.redirect(`/parts?characterId=${createdSensor.characterId}`);
    } catch (error) {
        logger.error('Error creating Sensor:', error);
        res.status(500).send('An error occurred while creating the Sensor: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update Sensor Route - Request params:', req.params);
        logger.debug('Update Sensor Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Sensor with ID:', id, 'Type:', typeof id);

        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        // Check if the part exists before updating
        const existingPart = await partService.getPartById(id);
        if (!existingPart) {
            throw new Error('Sensor not found');
        }

        const updatedSensor = {
            id: id,
            name: req.body.name,
            type: 'sensor',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26,
            active: req.body.active === 'on',
            sensorType: req.body.sensorType || 'motion'
        };

        logger.debug('Updated Sensor data:', updatedSensor);

        const result = await partService.updatePart(id, updatedSensor);
        logger.info('Updated Sensor:', result);

        res.redirect(`/parts?characterId=${updatedSensor.characterId}`);
    } catch (error) {
        logger.error('Error updating Sensor:', error);
        res.status(500).json({ error: 'An error occurred while updating the Sensor: ' + error.message });
    }
});

router.get('/control', (req, res) => {
    const { id, gpioPin, action } = req.query;

    if (action === 'start') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
        const process = spawn('python3', [scriptPath, gpioPin]);

        process.stdout.on('data', (data) => {
            const output = data.toString().trim();
            logger.debug(`Python script output: ${output}`);
            res.write(`data: ${output}\n\n`);
        });

        process.stderr.on('data', (data) => {
            const error = data.toString().trim();
            logger.error(`Python script error: ${error}`);
            res.write(`data: ${JSON.stringify({ error: error })}\n\n`);
        });

        process.on('close', (code) => {
            logger.debug(`Python script exited with code ${code}`);
            res.write(`data: ${JSON.stringify({ status: 'Sensor monitoring stopped' })}\n\n`);
            res.end();
        });

        req.on('close', () => {
            process.kill();
        });
    } else {
        res.status(400).json({ error: 'Invalid action' });
    }
});

router.post('/control', (req, res) => {
    const { id, gpioPin, action } = req.body;
    logger.debug(`Received POST /control request: ${JSON.stringify(req.body)}`);

    if (action === 'stop') {
        try {
            logger.info('Received stop request for sensor monitoring');
            res.json({ success: true, message: 'Stop request received for sensor monitoring' });
        } catch (error) {
            logger.error('Error handling stop request:', error);
            res.status(500).json({ success: false, error: 'Failed to process stop request' });
        }
    } else {
        logger.warn(`Invalid action received: ${action}`);
        res.status(400).json({ error: 'Invalid action' });
    }
});

module.exports = router;
