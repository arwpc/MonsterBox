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
        res.render('part-forms/servo', { title: 'Edit Servo', action: `/parts/servo/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching servo:', error);
        res.status(500).send('An error occurred while fetching the servo: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newServo = {
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin),
            pwmFrequency: parseInt(req.body.pwmFrequency) || 50,
            dutyCycle: parseFloat(req.body.dutyCycle) || 7.5
        };
        const createdServo = await partService.createPart(newServo);
        console.log('Created servo:', createdServo);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating servo:', error);
        res.status(500).send('An error occurred while creating the servo: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedServo = {
            id: id,
            name: req.body.name,
            type: 'servo',
            characterId: parseInt(req.body.characterId),
            gpioPin: parseInt(req.body.gpioPin),
            pwmFrequency: parseInt(req.body.pwmFrequency) || 50,
            dutyCycle: parseFloat(req.body.dutyCycle) || 7.5
        };
        const result = await partService.updatePart(id, updatedServo);
        console.log('Updated servo:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating servo:', error);
        res.status(500).send('An error occurred while updating the servo: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { gpioPin, angle, pwmFrequency, dutyCycle, duration } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
        const process = spawn('python3', [
            scriptPath,
            gpioPin.toString(),
            angle.toString(),
            pwmFrequency.toString(),
            dutyCycle.toString(),
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
                res.json({ success: true, message: 'Servo test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Servo test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the servo', error: error.message });
    }
});

module.exports = router;
