const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    // ... (previous methods remain unchanged)

    executeStep: async (req, res) => {
        try {
            const step = req.body;
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
                    const lightPart = await partService.getPartById(step.part_id);
                    if (!lightPart) {
                        throw new Error('Light/LED part not found');
                    }
                    args = [
                        lightPart.gpioPin ? lightPart.gpioPin.toString() : '0',
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
                    if (!sound) {
                        throw new Error('Sound not found');
                    }
                    args = [path.join(__dirname, '..', 'public', 'sounds', sound.filename)];
                    break;
                case 'sensor':
                    scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
                    const sensorPart = await partService.getPartById(step.part_id);
                    if (!sensorPart) {
                        throw new Error('Sensor part not found');
                    }
                    args = [sensorPart.gpioPin.toString(), step.timeout ? step.timeout.toString() : '30'];
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
                res.json({ 
                    success: code === 0, 
                    message: code === 0 ? 'Step executed successfully' : 'Step execution failed',
                    stdout: stdout,
                    stderr: stderr
                });
            });

        } catch (error) {
            console.error('Error executing step:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    executeScene: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }

            const executeStep = async (step) => {
                return new Promise((resolve, reject) => {
                    sceneController.executeStep({ body: step }, {
                        json: (result) => {
                            if (result.success) {
                                resolve(result);
                            } else {
                                reject(new Error(result.message));
                            }
                        },
                        status: (code) => ({
                            json: (result) => reject(new Error(`Step failed with status ${code}: ${result.error}`))
                        })
                    });
                });
            };

            const executeConcurrentSteps = async (steps) => {
                return Promise.all(steps.map(step => executeStep(step)));
            };

            const executeSteps = async () => {
                let concurrentSteps = [];
                for (const step of scene.steps) {
                    if (step.concurrent === 'on') {
                        concurrentSteps.push(step);
                    } else {
                        if (concurrentSteps.length > 0) {
                            await executeConcurrentSteps(concurrentSteps);
                            concurrentSteps = [];
                        }
                        await executeStep(step);
                    }
                }
                if (concurrentSteps.length > 0) {
                    await executeConcurrentSteps(concurrentSteps);
                }
            };

            await executeSteps();
            res.json({ success: true, message: 'Scene execution completed' });

        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

module.exports = sceneController;
