const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { exec } = require('child_process');
const path = require('path');
const multer = require('multer');
const upload = multer();

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
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
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10) || 18,
            pwmPin: parseInt(req.body.pwmPin, 10) || 13,
            maxExtension: parseInt(req.body.maxExtension, 10) || 10000,
            maxRetraction: parseInt(req.body.maxRetraction, 10) || 10000
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
        const id = parseInt(req.params.id, 10);
        console.log(`Attempting to update linear actuator with ID: ${id}`);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        console.log('Updating linear actuator - Request body:', req.body);
        const updatedActuator = {
            id: id,
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10),
            pwmPin: parseInt(req.body.pwmPin, 10),
            maxExtension: parseInt(req.body.maxExtension, 10),
            maxRetraction: parseInt(req.body.maxRetraction, 10)
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

router.post('/testfire', upload.none(), (req, res) => {
    console.log('Received testfire request:', req.body);
    const { direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction } = req.body;
    
    const command = `sudo python3 ${path.join(__dirname, '../scripts/linear_actuator_control.py')} ${direction} ${speed} ${duration} ${directionPin} ${pwmPin} ${maxExtension} ${maxRetraction}`;
    
    console.log('Executing command:', command);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Testfire exec error: ${error}`);
            return res.status(500).json({
                success: false,
                message: 'An error occurred while controlling the linear actuator.',
                error: error.message,
                stdout: stdout,
                stderr: stderr
            });
        }

        const logLines = stdout.split('\n').filter(line => line.trim() !== '');
        const lastLogLine = logLines[logLines.length - 1];

        if (lastLogLine && lastLogLine.includes('completed successfully')) {
            res.json({
                success: true,
                message: 'Linear actuator control completed successfully.',
                logs: logLines
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Linear actuator control may have encountered an issue.',
                logs: logLines,
                stderr: stderr
            });
        }
    });
});

module.exports = router;