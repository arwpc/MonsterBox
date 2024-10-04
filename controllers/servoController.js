const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const servoTypes = {
    DS3240MG: { minPulse: 500, maxPulse: 2500, defaultAngle: 90 },
    FS90R: { minPulse: 700, maxPulse: 2300, defaultAngle: 90 },
    MG90S: { minPulse: 600, maxPulse: 2400, defaultAngle: 90 },
    BILDA: { minPulse: 500, maxPulse: 2500, defaultAngle: 90 },
};

function executeServoCommand(command, args) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
        const fullCommand = `python ${scriptPath} ${command} ${args.join(' ')}`;
        
        exec(fullCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing servo command: ${error.message}`);
                return reject(error);
            }
            if (stderr) {
                console.error(`Servo command stderr: ${stderr}`);
            }
            console.log(`Servo command stdout: ${stdout}`);
            resolve(stdout.trim());
        });
    });
}

exports.getServoDefaults = (servoType) => servoTypes[servoType] || { minPulse: 500, maxPulse: 2500, defaultAngle: 90 };

exports.testServo = async (req, res) => {
    console.log('Testing servo - Body:', req.body);

    try {
        const { angle, pin, channel, servoType, usePCA9685 } = req.body;
        
        const args = [
            usePCA9685 ? 'pca9685' : 'gpio',
            usePCA9685 ? channel : pin,
            angle,
            servoType
        ];

        const result = await executeServoCommand('test', args);
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('Error testing servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while testing the servo', error: error.message });
    }
};

exports.stopServo = async (req, res) => {
    console.log('Stopping servo - Body:', req.body);

    try {
        const { pin, channel, usePCA9685 } = req.body;
        
        const args = [
            usePCA9685 ? 'pca9685' : 'gpio',
            usePCA9685 ? channel : pin
        ];

        const result = await executeServoCommand('stop', args);
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('Error stopping servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while stopping the servo', error: error.message });
    }
};

exports.getServoTypes = () => Object.keys(servoTypes);

exports.saveServo = async (req, res) => {
    console.log('Saving servo - Body:', req.body);

    try {
        const usePCA9685 = req.body.usePCA9685 === 'on' || req.body.usePCA9685 === true;

        const servoData = {
            id: req.body.id || Date.now().toString(),
            type: 'servo',
            name: req.body.name,
            characterId: req.body.characterId,
            servoType: req.body.servoType,
            usePCA9685: usePCA9685,
            minPulse: parseInt(req.body.minPulse),
            maxPulse: parseInt(req.body.maxPulse),
            defaultAngle: parseInt(req.body.defaultAngle)
        };

        if (usePCA9685) {
            servoData.channel = parseInt(req.body.channel);
        } else {
            servoData.pin = parseInt(req.body.pin);
        }

        const partsFilePath = path.join(__dirname, '..', 'data', 'parts.json');
        let parts = [];

        if (fs.existsSync(partsFilePath)) {
            const partsData = fs.readFileSync(partsFilePath, 'utf8');
            parts = JSON.parse(partsData);
        }

        const existingServoIndex = parts.findIndex(part => part.id === servoData.id);
        if (existingServoIndex !== -1) {
            parts[existingServoIndex] = servoData;
        } else {
            parts.push(servoData);
        }

        fs.writeFileSync(partsFilePath, JSON.stringify(parts, null, 2));

        res.json({ success: true, message: 'Servo saved successfully', servo: servoData });
    } catch (error) {
        console.error('Error saving servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while saving the servo', error: error.message });
    }
};