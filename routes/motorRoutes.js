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
        res.render('part-forms/motor', { title: 'Create Motor', action: '/parts/motor', part: {}, characters, character });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).send('An error occurred while fetching the characters: ' + error.message);
    }
});


router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        logger.debug('Editing Motor with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        const character = await characterService.getCharacterById(part.characterId);

        res.render('part-forms/motor', { title: 'Edit Motor', action: `/parts/motor/${part.id}`, part, characters, character });
    } catch (error) {
        logger.error('Error fetching Motor:', error);
        res.status(500).send('An error occurred while fetching the Motor: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newMotor = {
            name: req.body.name,
            type: 'motor',
            characterId: parseInt(req.body.characterId, 10),
            pwmPin: parseInt(req.body.pwmPin, 10) || 18,
            dirPin: parseInt(req.body.dirPin, 10) || 23
        };

        const createdMotor = await partService.createPart(newMotor);
        logger.info('Created motor:', createdMotor);
        res.status(200).json({ message: 'Motor created successfully', motor: createdMotor });
    } catch (error) {
        logger.error('Error creating Motor:', error);
        res.status(500).send('An error occurred while creating the Motor: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { pwmPin, dirPin, duration } = req.body;

        const scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
        const process = spawn('python3', [
            scriptPath,
            pwmPin.toString(),
            dirPin.toString(),
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
                res.json({ success: true, message: 'Motor test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Motor test failed', error: stderr });
            }
        });
    } catch (error) {
        logger.error('Error testing motor:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the motor', error: error.message });
    }
});



router.post('/:id', async (req, res) => {
    try {
        logger.debug('Update Motor Route - Request params:', req.params);
        logger.debug('Update Motor Route - Request body:', req.body);

        const id = parseInt(req.params.id, 10);
        logger.debug('Updating Motor with ID:', id, 'Type:', typeof id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }

        const updatedMotor = {
            id: id,
            name: req.body.name,
            type: 'motor',
            characterId: parseInt(req.body.characterId, 10),
            pwmPin: parseInt(req.body.pwmPin, 10) || 18,
            dirPin: parseInt(req.body.dirPin, 10) || 23
        };

        logger.debug('Updated Motor data:', updatedMotor);
        const result = await partService.updatePart(id, updatedMotor);
        logger.info('Updated Motor:', result);

        res.redirect(`/parts?characterId=${updatedMotor.characterId}`);
    } catch (error) {
        logger.error('Error updating Motor:', error);
        res.status(500).send('An error occurred while updating the Motor: ' + error.message);
    }
});

module.exports = router;
