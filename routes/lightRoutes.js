const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/light', { title: 'Edit Light', action: `/parts/light/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching light:', error);
        res.status(500).send('An error occurred while fetching the light: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newLight = {
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin) || 26
        };
        const createdLight = await partService.createPart(newLight);
        console.log('Created light:', createdLight);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating light:', error);
        res.status(500).send('An error occurred while creating the light: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLight = {
            id: id,
            name: req.body.name,
            type: 'light',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin) || 26
        };
        const result = await partService.updatePart(id, updatedLight);
        console.log('Updated light:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating light:', error);
        res.status(500).send('An error occurred while updating the light: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { gpioPin, state, duration } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            state,
            duration.toString()
        ]);

        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            stdout += data.toString();
            console.log(`Python script output: ${data}`);
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
            console.error(`Python script error: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`Python script exited with code ${code}`);
            if (code === 0) {
                res.json({ success: true, message: 'Light test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Light test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing light:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the light', error: error.message });
    }
});

module.exports = router;
