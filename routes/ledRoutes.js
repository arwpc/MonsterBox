const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing LED with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/led', { title: 'Edit LED', action: `/parts/led/${part.id}`, part, characters });
    } catch (error) {
        logger.error('Error fetching LED:', error);
        res.status(500).send('An error occurred while fetching the LED: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newLed = {
            name: req.body.name,
            type: 'led',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };
        const createdLed = await partService.createPart(newLed);
        logger.info('Created LED:', createdLed);
        res.status(200).json({ message: 'LED created successfully', led: createdLed });
    } catch (error) {
        logger.error('Error creating LED:', error);
        res.status(500).send('An error occurred while creating the LED: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        logger.debug('LED Test Route - Request body:', req.body);
        const { gpioPin, brightness, duration } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'led_control.py');
        logger.debug('LED test script path:', scriptPath);
        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            'on',
            duration.toString(),
            brightness.toString()
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
                res.json({ success: true, message: 'LED test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'LED test failed', error: stderr });
            }
        });
    } catch (error) {
        logger.error('Error testing LED:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the LED', error: error.message });
    }
});

router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update LED Route - Request params:', req.params);
        logger.debug('Update LED Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating LED with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLed = {
            id: id,
            name: req.body.name,
            type: 'led',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };
        logger.debug('Updated LED data:', updatedLed);
        const result = await partService.updatePart(id, updatedLed);
        logger.info('Updated LED:', result);
        res.redirect(`/parts?characterId=${updatedLed.characterId}`);
    } catch (error) {
        logger.error('Error updating LED:', error);
        res.status(500).send('An error occurred while updating the LED: ' + error.message);
    }
});

module.exports = router;
