// File: routes/linearActuatorRoutes.js

const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

// Route to list all linear actuators (commented out for now)
/*
router.get('/', async (req, res) => {
    try {
        const parts = await partService.getAllParts();
        const linearActuators = parts.filter(part => part.type === 'linear-actuator');
        res.render('linear-actuators-list', { title: 'Linear Actuators', linearActuators });
    } catch (error) {
        console.error('Error fetching linear actuators:', error);
        res.status(500).send('An error occurred while fetching linear actuators');
    }
});
*/

// Route to render the form for a new linear actuator
router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/linear-actuator', { 
            title: 'New Linear Actuator', 
            action: '/parts/linear-actuator', 
            part: {}, 
            characters 
        });
    } catch (error) {
        console.error('Error rendering new linear actuator form:', error);
        res.status(500).send('An error occurred while loading the new linear actuator form');
    }
});

// Route to create a new linear actuator (commented out for now)
/*
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
*/

// Route to test the linear actuator
router.post('/test', async (req, res) => {
    try {
        const { direction, speed, duration, directionPin, pwmPin } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        
        console.log('Executing script with parameters:', { direction, speed, duration, directionPin, pwmPin });
        
        const process = spawn('python3', [
            scriptPath,
            direction,
            speed.toString(),
            duration.toString(),
            directionPin.toString(),
            pwmPin.toString()
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
