const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { spawn } = require('child_process');
const path = require('path');

router.get('/new', async (req, res) => {
    try {
        console.log('Rendering new linear actuator form');
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/linear-actuator', { 
            title: 'New Linear Actuator', 
            action: '/parts/linear-actuator', 
            part: {}, 
            characters 
        });
    } catch (error) {
        console.error('Error rendering new linear actuator form:', error);
        res.status(500).send('An error occurred while loading the new linear actuator form: ' + error.message);
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        console.log(`Attempting to edit linear actuator with ID: ${id}`);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        console.log('Retrieved part for editing:', part);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/linear-actuator', { 
            title: 'Edit Linear Actuator', 
            action: `/parts/linear-actuator/${part.id}`, 
            part, 
            characters 
        });
    } catch (error) {
        console.error('Error fetching linear actuator for editing:', error);
        res.status(500).send('An error occurred while fetching the linear actuator: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        console.log('Creating new linear actuator with data:', req.body);
        const newActuator = {
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin) || 18,
            pwmPin: parseInt(req.body.pwmPin) || 13,
            maxExtension: parseInt(req.body.maxExtension) || 10000,
            maxRetraction: parseInt(req.body.maxRetraction) || 10000
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
    console.log('Received POST request for linear actuator update. Params:', req.params, 'Body:', req.body);
    try {
        const id = parseInt(req.params.id);
        console.log(`Attempting to update linear actuator with ID: ${id}`);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        console.log('Updating linear actuator - Request body:', req.body);
        const updatedActuator = {
            id: id,
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId),
            directionPin: parseInt(req.body.directionPin),
            pwmPin: parseInt(req.body.pwmPin),
            maxExtension: parseInt(req.body.maxExtension),
            maxRetraction: parseInt(req.body.maxRetraction)
        };
        console.log('Updating linear actuator with data:', updatedActuator);
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
        console.log('Received test request for linear actuator:', req.body);
        const { direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction } = req.body;
        const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        
        console.log('Executing script with parameters:', { direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction });
        
        const process = spawn('python3', [
            scriptPath,
            direction,
            speed.toString(),
            duration.toString(),
            directionPin.toString(),
            pwmPin.toString(),
            maxExtension.toString(),
            maxRetraction.toString()
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