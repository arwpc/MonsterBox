const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');
const WebSocket = require('ws');

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
        res.status(500).send('An error occurred while updating the Sensor: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'test_sensor.py');
        const { gpioPin, sensorType } = req.body;

        const wss = new WebSocket.Server({ noServer: true });

        wss.on('connection', (ws) => {
            const process = spawn('python3', [
                scriptPath,
                gpioPin.toString(),
                sensorType
            ]);

            process.stdout.on('data', (data) => {
                const output = data.toString().trim();
                logger.debug(`Python script output: ${output}`);
                ws.send(JSON.stringify({ type: 'output', data: output }));
            });

            process.stderr.on('data', (data) => {
                const error = data.toString().trim();
                logger.error(`Python script error: ${error}`);
                ws.send(JSON.stringify({ type: 'error', data: error }));
            });

            process.on('close', (code) => {
                logger.debug(`Python script exited with code ${code}`);
                ws.close();
            });

            ws.on('close', () => {
                process.kill();
            });
        });

        res.json({ success: true, message: 'WebSocket connection established' });
    } catch (error) {
        logger.error('Error testing sensor:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the sensor', error: error.message });
    }
});

module.exports = router;
