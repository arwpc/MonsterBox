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

        res.status(200).json({ message: 'Sensor created successfully', sensor: createdSensor });
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

        const { gpioPin, sensorType, expectedValue, duration } = req.body;

        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            sensorType,
            expectedValue.toString(),
            duration.toString()
        ]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            logger.debug(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            logger.error(`Python script error: ${data}`);
        });

        process.on('close', (code) => {
            logger.debug(`Python script exited with code ${code}`);
            if (code === 0) {
                res.json({ success: true, message: 'Sensor test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Sensor test failed', error: stderr });
            }
        });
    } catch (error) {
        logger.error('Error testing sensor:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the sensor', error: error.message });
    }
});

module.exports = router;
