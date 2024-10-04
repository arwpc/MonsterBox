// File: routes/linearActuatorRoutes.js

const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to write logs to a file and console
function writeLog(message) {
    const logMessage = `${new Date().toISOString()}: ${message}`;
    console.log(logMessage);
    try {
        fs.appendFileSync('linear_actuator_logs.txt', logMessage + '\n');
    } catch (error) {
        console.error(`Error writing to log file: ${error.message}`);
    }
}

// Function to execute testfire
function executeTestfire(res, params) {
    const { direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction } = params;
    const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
    const command = `sudo python3 "${scriptPath}" ${direction} ${speed} ${duration} ${directionPin} ${pwmPin} ${maxExtension} ${maxRetraction}`;
    
    writeLog(`Executing command: ${command}`);
    console.log(`Executing command: ${command}`);

    spawn('sudo', ['python3', scriptPath, direction, speed, duration, directionPin, pwmPin, maxExtension, maxRetraction], { stdio: 'pipe' })
        .on('error', (error) => {
            writeLog(`Testfire exec error: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'An error occurred while controlling the linear actuator.',
                error: error.message
            });
        })
        .on('close', (code) => {
            if (code === 0) {
                writeLog('Linear actuator control completed successfully.');
                res.json({
                    success: true,
                    message: 'Linear actuator control completed successfully.'
                });
            } else {
                writeLog(`Linear actuator control failed with exit code: ${code}`);
                res.status(500).json({
                    success: false,
                    message: `Linear actuator control failed with exit code: ${code}`
                });
            }
        });
}

// GET route for testfire with parameters (for saved actuators)
router.get('/:id/testfire', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { direction = 'forward', speed = '50', duration = '1000' } = req.query;
    writeLog(`Received GET testfire request for linear actuator ${id} with params: direction=${direction}, speed=${speed}, duration=${duration}`);
    
    partService.getPartById(id)
        .then(part => {
            writeLog(`Retrieved part for testfire: ${JSON.stringify(part)}`);
            executeTestfire(res, {
                direction,
                speed,
                duration,
                directionPin: part.directionPin.toString(),
                pwmPin: part.pwmPin.toString(),
                maxExtension: part.maxExtension.toString(),
                maxRetraction: part.maxRetraction.toString()
            });
        })
        .catch(error => {
            writeLog(`Error fetching linear actuator for testfire: ${error.message}`);
            res.status(500).json({
                success: false,
                message: 'An error occurred while fetching the linear actuator data.',
                error: error.message
            });
        });
});

// GET route for testfire with parameters (for unsaved actuators)
router.get('/testfire', (req, res) => {
    const { direction = 'forward', speed = '50', duration = '1000', directionPin, pwmPin, maxExtension, maxRetraction } = req.query;
    writeLog(`Received GET testfire request for unsaved linear actuator with params: direction=${direction}, speed=${speed}, duration=${duration}, directionPin=${directionPin}, pwmPin=${pwmPin}, maxExtension=${maxExtension}, maxRetraction=${maxRetraction}`);
    
    executeTestfire(res, {
        direction,
        speed,
        duration,
        directionPin,
        pwmPin,
        maxExtension,
        maxRetraction
    });
});

// GET route for linear actuator edit page
router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log('Editing Linear Actuator with ID:', id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        const characters = await require('../services/characterService').getAllCharacters();
        res.render('part-forms/linear-actuator', { title: 'Edit Linear Actuator', action: `/parts/linear-actuator/${part.id}`, part, characters });
    } catch (error) {
        console.error('Error fetching linear actuator:', error);
        res.status(500).send('An error occurred while fetching the linear actuator: ' + error.message);
    }
});

// POST route for creating a new linear actuator
router.post('/', async (req, res) => {
    try {
        const newLinearActuator = {
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10),
            pwmPin: parseInt(req.body.pwmPin, 10),
            maxExtension: parseInt(req.body.maxExtension, 10),
            maxRetraction: parseInt(req.body.maxRetraction, 10)
        };
        const createdLinearActuator = await partService.createPart(newLinearActuator);
        console.log('Created linear actuator:', createdLinearActuator);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error creating linear actuator:', error);
        res.status(500).send('An error occurred while creating the linear actuator: ' + error.message);
    }
});

// POST route for updating an existing linear actuator
router.post('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        console.log('Updating Linear Actuator with ID:', id);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const updatedLinearActuator = {
            id: id,
            name: req.body.name,
            type: 'linear-actuator',
            characterId: parseInt(req.body.characterId, 10),
            directionPin: parseInt(req.body.directionPin, 10),
            pwmPin: parseInt(req.body.pwmPin, 10),
            maxExtension: parseInt(req.body.maxExtension, 10),
            maxRetraction: parseInt(req.body.maxRetraction, 10)
        };
        console.log('Updated Linear Actuator data:', updatedLinearActuator);
        const result = await partService.updatePart(id, updatedLinearActuator);
        console.log('Updated linear actuator:', result);
        res.redirect('/parts');
    } catch (error) {
        console.error('Error updating linear actuator:', error);
        res.status(500).send('An error occurred while updating the linear actuator: ' + error.message);
    }
});

module.exports = router;