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
        res.render('part-forms/led', { title: 'Edit LED', action: `/parts/led/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching LED:', error);
        res.status(500).send('An error occurred while fetching the LED: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newLed = {
            name: req.body.name,
            type: 'led',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin) || 26
        };
        const createdLed = await partService.createPart(newLed);
        console.log('Created LED:', createdLed);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating LED:', error);
        res.status(500).send('An error occurred while creating the LED: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLed = {
            id: id,
            name: req.body.name,
            type: 'led',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin) || 26
        };
        const result = await partService.updatePart(id, updatedLed);
        console.log('Updated LED:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating LED:', error);
        res.status(500).send('An error occurred while updating the LED: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { gpioPin, brightness, duration } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'led_control.py');
        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            brightness.toString(),
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
                res.json({ success: true, message: 'LED test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'LED test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing LED:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the LED', error: error.message });
    }
});

module.exports = router;