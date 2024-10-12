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
        logger.debug('Editing Light with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/light', { title: 'Edit Light', action: `/parts/light/${part.id}`, part, characters });
    } catch (error) {
        logger.error('Error fetching Light:', error);
        res.status(500).send('An error occurred while fetching the Light: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newLight = {
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };
        const createdLight = await partService.createPart(newLight);
        logger.info('Created light:', createdLight);
        res.status(200).json({ message: 'Light created successfully', light: createdLight });
    } catch (error) {
        logger.error('Error creating Light:', error);
        res.status(500).send('An error occurred while creating the Light: ' + error.message);
    }
});


router.post('/test', async (req, res) => {
    try {
        const { gpioPin, brightness, duration } = req.body;

        const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
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
                res.json({ success: true, message: 'Light test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Light test failed', error: stderr });
            }
        });

    } catch (error) {
        logger.error('Error testing light:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the light', error: error.message });
    }
});


router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update Light Route - Request params:', req.params);
        logger.debug('Update Light Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Light with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const updatedLight = {
            id: id,
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId, 10),
            gpioPin: parseInt(req.body.gpioPin, 10) || 26
        };

        logger.debug('Updated Light data:', updatedLight);
        const result = await partService.updatePart(id, updatedLight);
        logger.info('Updated Light:', result);

        res.redirect(`/parts?characterId=${updatedLight.characterId}`);

    } catch (error) {
        logger.error('Error updating Light:', error);
        res.status(500).send('An error occurred while updating the Light: ' + error.message);
    }
});


module.exports = router;
