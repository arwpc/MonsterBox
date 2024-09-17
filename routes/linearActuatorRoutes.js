const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { exec } = require('child_process');
const path = require('path');
const multer = require('multer');
const upload = multer();
const fs = require('fs');

// Function to write logs to a file
function writeLog(message) {
    const logMessage = `${new Date().toISOString()}: ${message}\n`;
    fs.appendFileSync('linear_actuator_logs.txt', logMessage);
}

router.get('/:id/edit', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        writeLog(`Attempting to edit linear actuator with ID: ${id}`);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        const part = await partService.getPartById(id);
        writeLog(`Retrieved part for editing: ${JSON.stringify(part)}`);
        const characters = await characterService.getAllCharacters();
        res.render('part-forms/linear-actuator', { 
            title: 'Edit Linear Actuator', 
            action: `/parts/linear-actuator/${part.id}`, 
            part, 
            characters 
        });
    } catch (error) {
        writeLog(`Error fetching linear actuator for editing: ${error.message}`);
        res.status(500).send('An error occurred while fetching the linear actuator: ' + error.message);
    }
});

router.post('/', async (req, res) => {
    try {
        writeLog(`Creating new linear actuator with data: ${JSON.stringify(req.body)}`);
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
        writeLog(`Created new linear actuator: ${JSON.stringify(createdActuator)}`);
        res.redirect('/parts');
    } catch (error) {
        writeLog(`Error creating linear actuator: ${error.message}`);
        res.status(500).send('An error occurred while creating the linear actuator: ' + error.message);
    }
});

router.post('/:id', async (req, res) => {
    try {
        writeLog('Received update request for linear actuator');
        writeLog(`Request params: ${JSON.stringify(req.params)}`);
        writeLog(`Request body: ${JSON.stringify(req.body)}`);
        
        const id = parseInt(req.params.id, 10);
        writeLog(`Attempting to update linear actuator with ID: ${id}`);
        if (isNaN(id)) {
            throw new Error('Invalid part ID');
        }
        
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
        writeLog(`Updating linear actuator with data: ${JSON.stringify(updatedActuator)}`);
        const result = await partService.updatePart(id, updatedActuator);
        writeLog(`Updated linear actuator: ${JSON.stringify(result)}`);
        res.redirect('/parts');
    } catch (error) {
        writeLog(`Error updating linear actuator: ${error.message}`);
        res.status(500).send('An error occurred while updating the linear actuator: ' + error.message);
    }
});

router.post('/:id/testfire', upload.none(), (req, res) => {
    const id = parseInt(req.params.id, 10);
    writeLog(`Received testfire request for linear actuator ${id}: ${JSON.stringify(req.body)}`);
    const { direction, speed, duration } = req.body;
    
    partService.getPartById(id)
        .then(part => {
            const command = `sudo python3 ${path.join(__dirname, '../scripts/linear_actuator_control.py')} ${direction} ${speed} ${duration} ${part.directionPin} ${part.pwmPin} ${part.maxExtension} ${part.maxRetraction}`;
            
            writeLog(`Executing command: ${command}`);

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    writeLog(`Testfire exec error: ${error.message}`);
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
                    writeLog('Linear actuator control completed successfully.');
                    res.json({
                        success: true,
                        message: 'Linear actuator control completed successfully.',
                        logs: logLines
                    });
                } else {
                    writeLog(`Linear actuator control may have encountered an issue. Stderr: ${stderr}`);
                    res.status(500).json({
                        success: false,
                        message: 'Linear actuator control may have encountered an issue.',
                        logs: logLines,
                        stderr: stderr
                    });
                }
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

module.exports = router;