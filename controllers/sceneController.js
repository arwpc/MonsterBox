const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (previous methods remain unchanged)

    _executeStep: async (step) => {
        return new Promise(async (resolve, reject) => {
            console.log('Executing step:', step);

            let scriptPath;
            let args = [];

            try {
                switch(step.type) {
                    case 'motor':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
                        args = [
                            step.direction || 'forward',
                            step.speed ? step.speed.toString() : '50',
                            step.duration ? step.duration.toString() : '1000',
                            step.directionPin ? step.directionPin.toString() : '18',
                            step.pwmPin ? step.pwmPin.toString() : '24'
                        ];
                        break;
                    case 'light':
                    case 'led':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
                        args = [
                            step.gpioPin ? step.gpioPin.toString() : '0',
                            step.state || 'on',
                            step.duration ? step.duration.toString() : '1000'
                        ];
                        if (step.type === 'led') {
                            args.push(step.brightness ? step.brightness.toString() : '100');
                        }
                        break;
                    case 'sound':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'play_sound.py');
                        const sound = await soundService.getSoundById(step.sound_id);
                        if (!sound || !sound.filename) {
                            throw new Error('Sound file not found');
                        }
                        args = [path.join(__dirname, '..', 'public', 'sounds', sound.filename)];
                        break;
                    case 'sensor':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
                        args = [step.gpioPin.toString(), step.timeout ? step.timeout.toString() : '30'];
                        break;
                    default:
                        throw new Error('Unknown step type');
                }

                console.log('Spawning process:', 'python3', scriptPath, ...args);
                const process = spawn('python3', [scriptPath, ...args]);

                let stdout = '';
                let stderr = '';

                process.stdout.on('data', (data) => {
                    stdout += data.toString();
                    console.log(`stdout: ${data}`);
                });

                process.stderr.on('data', (data) => {
                    stderr += data.toString();
                    console.error(`stderr: ${data}`);
                });

                process.on('close', (code) => {
                    console.log(`child process exited with code ${code}`);
                    if (code === 0) {
                        resolve({ success: true, message: 'Step executed successfully', stdout, stderr });
                    } else {
                        reject(new Error(`Step execution failed with code ${code}`));
                    }
                });
            } catch (error) {
                console.error('Error in _executeStep:', error);
                reject(error);
            }
        });
    },

    // ... (rest of the methods remain unchanged)
};

module.exports = sceneController;
