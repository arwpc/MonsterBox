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

// GET route for testfire with parameters
router.get('/:id/testfire', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { direction = 'forward', speed = '50', duration = '1000' } = req.query;
    writeLog(`Received GET testfire request for linear actuator ${id} with params: direction=${direction}, speed=${speed}, duration=${duration}`);
    
    partService.getPartById(id)
        .then(part => {
            writeLog(`Retrieved part for testfire: ${JSON.stringify(part)}`);
            const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
            const command = `sudo python3 "${scriptPath}" ${direction} ${speed} ${duration} ${part.directionPin} ${part.pwmPin} ${part.maxExtension} ${part.maxRetraction}`;
            
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

                if (stdout.includes("SUCCESS")) {
                    writeLog('Linear actuator control completed successfully.');
                    res.json({
                        success: true,
                        message: 'Linear actuator control completed successfully.',
                        logs: stdout.split('\n').concat(stderr.split('\n'))
                    });
                } else {
                    writeLog(`Linear actuator control may have encountered an issue. Stdout: ${stdout}`);
                    res.status(500).json({
                        success: false,
                        message: 'Linear actuator control may have encountered an issue.',
                        logs: stdout.split('\n').concat(stderr.split('\n')),
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