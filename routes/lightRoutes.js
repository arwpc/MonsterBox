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
        res.render('part-forms/light', { 
            title: 'Add Light', 
            action: '/parts/light', 
            part: {}, 
            characters, 
            character 
        });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching characters: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Light with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);
        res.render('part-forms/light', { 
            title: 'Edit Light', 
            action: `/parts/light/${part.id}`, 
            part, 
            characters, 
            character 
        });
    } catch (error) {
        logger.error('Error fetching light:', error);
        res.status(500).send('An error occurred while fetching the light: ' + error.message);
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
        res.redirect(`/parts?characterId=${createdLight.characterId}`);
    } catch (error) {
        logger.error('Error creating light:', error);
        res.status(500).send('An error occurred while creating the light: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    logger.info('Light Test Route Hit');
    try {
        logger.debug('Light Test Route - Request body:', req.body);
        const { part_id, gpioPin, state } = req.body;
        
        if (!gpioPin || !state) {
            throw new Error('Missing required parameters for light test');
        }

        const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
        logger.debug('Light test script path:', scriptPath);

        const scriptArgs = [
            scriptPath,
            gpioPin.toString(),
            state
        ];

        // Add duration for both on and off states
        if (state === 'on') {
            scriptArgs.push('5000');  // 5 seconds for on state
        } else {
            scriptArgs.push('100');   // 100ms for off state
        }

        logger.debug('Executing light test with parameters:', scriptArgs);

        logger.debug('Executing command:', 'sudo', 'python3', ...scriptArgs);

        const process = spawn('sudo', ['python3', ...scriptArgs], { stdio: 'pipe' });

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
                res.json({ success: true, message: `Light turned ${state} successfully`, output: stdout });
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
        logger.info('Updated light:', result);
        res.redirect(`/parts?characterId=${result.characterId}`);
    } catch (error) {
        logger.error('Error updating light:', error);
        res.status(500).send('An error occurred while updating the light: ' + error.message);
    }
});

module.exports = router;
