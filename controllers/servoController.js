const { exec } = require('child_process');
const path = require('path');

const servoTypes = {
    DS3240MG: { minPulse: 500, maxPulse: 2500 },
    FS90R: { minPulse: 700, maxPulse: 2300 },
    MG90S: { minPulse: 600, maxPulse: 2400 },
    BILDA: { minPulse: 500, maxPulse: 2500 },
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

exports.testServo = async (req, res) => {
    console.log('Testing servo - Body:', req.body);

    try {
        const { angle, channel, servoType, minPulse, maxPulse } = req.body;
        const servoConfig = servoTypes[servoType] || { minPulse, maxPulse };
        
        const args = [
            channel,
            angle,
            servoType,
            servoConfig.minPulse,
            servoConfig.maxPulse,
            1000 // duration in milliseconds
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
        const { channel } = req.body;
        
        const args = [channel];

        const result = await executeServoCommand('stop', args);
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('Error stopping servo:', error);
        res.status(500).json({ success: false, message: 'An error occurred while stopping the servo', error: error.message });
    }
};