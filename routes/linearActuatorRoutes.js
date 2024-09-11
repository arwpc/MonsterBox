// File: routes/linearActuatorRoutes.js

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
        res.render('part-forms/linear-actuator', { title: 'Edit Linear Actuator', action: `/parts/linear-actuator/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching linear actuator:', error);
        res.status(500).send('An error occurred while fetching the linear actuator: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        const newActuator = {
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin) || 18,
            pwmPin: parseInt(req.body.pwmPin) || 13
        };
        const createdActuator = await partService.createPart(newActuator);
        console.log('Created linear actuator:', createdActuator);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating linear actuator:', error);
        res.status(500).send('An error occurred while creating the linear actuator: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedActuator = {
            id: id,
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin) || 18,
            pwmPin: parseInt(req.body.pwmPin) || 13
        };
        const result = await partService.updatePart(id, updatedActuator);
        console.log('Updated linear actuator:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating linear actuator:', error);
        res.status(500).send('An error occurred while updating the linear actuator: ' + error.message);
    }
});

router.post('/test', async (req, res) => {
    try {
        const { direction, speed, duration, directionPin, pwmPin } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        const process = spawn('python3', [
            scriptPath,
            direction || 'forward',
            speed.toString() || '100',
            duration.toString() || '1000',
            directionPin.toString() || '18',
            pwmPin.toString() || '13'
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
                res.json({ success: true, message: 'Linear actuator test completed successfully', output: stdout });
            } else {
                res.status(500).json({ success: false, message: 'Linear actuator test failed', error: stderr });
            }
        });
    } catch (error) {
        console.error('Error testing linear actuator:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the linear actuator', error: error.message });
    }
});

module.exports = router;
