const express = require('express');
const router = express.Router();
const partService = require('../services/partService');
const characterService = require('../services/characterService');
const { exec } = require('child_process');
const path = require('path');
const multer = require('multer');
const upload = multer();
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

// Existing routes...

// New test route
router.get('/test', (req, res) => {
    writeLog('Test route accessed');
    res.json({ message: 'Linear actuator test route is working' });
});

// New GET route for testfire
router.get('/:id/testfire', (req, res) => {
    const id = parseInt(req.params.id, 10);
    writeLog(`Received GET testfire request for linear actuator ${id}`);
    
    // Default values for testing
    const direction = 'forward';
    const speed = '50';
    const duration = '1000';
    
    partService.getPartById(id)
        .then(part => {
            writeLog(`Retrieved part for testfire: ${JSON.stringify(part)}`);
            const scriptPath = path.join('scripts', 'linear_actuator_control.py');
            const command = `python3 ${scriptPath} ${direction} ${speed} ${duration} ${part.directionPin} ${part.pwmPin} ${part.maxExtension} ${part.maxRetraction}`;
            
            writeLog(`Executing command: ${command}`);
            console.log(`Executing command: ${command}`);

            exec(command, (error, stdout, stderr) => {
                writeLog('Python script execution started');
                console.log('Python script output:');
                console.log(stdout);
                writeLog(`Command stdout: ${stdout}`);
                
                if (stderr) {
                    console.error('Python script error output:');
                    console.error(stderr);
                    writeLog(`Command stderr: ${stderr}`);
                }

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

// Existing POST route for testfire
router.post('/:id/testfire', upload.none(), (req, res) => {
    // ... (keep the existing POST route as it is)
});

module.exports = router;