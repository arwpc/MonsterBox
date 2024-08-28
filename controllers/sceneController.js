const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (previous methods remain unchanged)

    executeStep: async (step) => {
        return new Promise((resolve, reject) => {
            console.log('Executing step:', step);

            let scriptPath;
            let args = [];

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
                    args = [path.join(__dirname, '..', 'public', 'sounds', step.filename)];
                    break;
                case 'sensor':
                    scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
                    args = [step.gpioPin.toString(), step.timeout ? step.timeout.toString() : '30'];
                    break;
                default:
                    return reject(new Error('Unknown step type'));
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
        });
    },

    executeScene: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }

            const executeSteps = async () => {
                const results = [];
                let concurrentPromises = [];

                for (const step of scene.steps) {
                    if (step.concurrent === 'on') {
                        concurrentPromises.push(sceneController.executeStep(step));
                    } else {
                        if (concurrentPromises.length > 0) {
                            results.push(await Promise.all(concurrentPromises));
                            concurrentPromises = [];
                        }
                        results.push(await sceneController.executeStep(step));
                    }
                }

                if (concurrentPromises.length > 0) {
                    results.push(await Promise.all(concurrentPromises));
                }

                return results;
            };

            const results = await executeSteps();
            res.json({ success: true, message: 'Scene execution completed', results });

        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

module.exports = sceneController;
