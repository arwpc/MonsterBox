// File: controllers/sceneController.js

const sceneService = require('../services/sceneService');
const characterService = require('../services/characterService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

const sceneController = {
    getAllScenes: async (req, res) => {
        try {
            const scenes = await sceneService.getAllScenes();
            res.render('scenes', { scenes });
        } catch (error) {
            console.error('Error getting all scenes:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    newScene: (req, res) => {
        res.render('scene-form', { scene: {}, title: 'Create New Scene' });
    },

    getSceneById: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }
            res.render('scene-form', { scene, title: 'Edit Scene' });
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    createScene: async (req, res) => {
        try {
            const newScene = await sceneService.createScene(req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    updateScene: async (req, res) => {
        try {
            const updatedScene = await sceneService.updateScene(req.params.id, req.body);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    deleteScene: async (req, res) => {
        try {
            await sceneService.deleteScene(req.params.id);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error deleting scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    playScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }
            res.render('scene-player', { scene });
        } catch (error) {
            console.error('Error playing scene:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeStep: async (req, res) => {
        try {
            const result = await sceneController._executeStep(req.body);
            res.json(result);
        } catch (error) {
            console.error('Error executing step:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    executeScene: async (req, res) => {
        console.log('Executing scene with ID:', req.params.id);
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                console.log('Scene not found:', sceneId);
                return res.status(404).json({ error: 'Scene not found' });
            }

            console.log('Scene details:', JSON.stringify(scene, null, 2));

            const executeSteps = async () => {
                const results = [];
                let concurrentPromises = [];

                for (let i = 0; i < scene.steps.length; i++) {
                    const step = scene.steps[i];
                    console.log(`Executing step ${i + 1}:`, JSON.stringify(step, null, 2));

                    if (step.concurrent) {
                        console.log(`Step ${i + 1} is concurrent, adding to concurrent promises`);
                        concurrentPromises.push(sceneController._executeStep(step));
                    } else {
                        if (concurrentPromises.length > 0) {
                            console.log(`Executing ${concurrentPromises.length} concurrent steps`);
                            results.push(await Promise.all(concurrentPromises));
                            concurrentPromises = [];
                        }
                        console.log(`Executing step ${i + 1} sequentially`);
                        const result = await sceneController._executeStep(step);
                        results.push(result);
                        console.log(`Step ${i + 1} result:`, JSON.stringify(result, null, 2));

                        if (step.type === 'sensor' && !result.motionDetected) {
                            console.log('No motion detected, ending scene execution');
                            break; // End scene if no motion detected
                        }
                    }
                }

                if (concurrentPromises.length > 0) {
                    console.log(`Executing remaining ${concurrentPromises.length} concurrent steps`);
                    results.push(await Promise.all(concurrentPromises));
                }

                return results;
            };

            const results = await executeSteps();
            console.log('Scene execution completed. Results:', JSON.stringify(results, null, 2));
            res.json({ success: true, message: 'Scene execution completed', results });

        } catch (error) {
            console.error('Error executing scene:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    _executeStep: async (step) => {
        return new Promise(async (resolve, reject) => {
            console.log('Executing step:', JSON.stringify(step, null, 2));

            if (step.type === 'pause') {
                console.log(`Pausing for ${step.duration}ms`);
                setTimeout(() => {
                    console.log('Pause completed');
                    resolve({ success: true, message: 'Pause completed' });
                }, parseInt(step.duration));
                return;
            }

            let scriptPath;
            let args = [];

            try {
                switch(step.type) {
                    case 'motor':
                    case 'linear-actuator':
                        const part = await partService.getPartById(step.part_id);
                        scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
                        args = [
                            step.direction || 'forward',
                            step.speed ? step.speed.toString() : '100',
                            step.duration ? step.duration.toString() : '1000',
                            part.directionPin.toString(),
                            part.pwmPin.toString()
                        ];
                        break;
                    case 'light':
                    case 'led':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
                        const lightPart = await partService.getPartById(step.part_id);
                        args = [
                            lightPart.gpioPin.toString(),
                            step.state || 'on',
                            step.duration ? step.duration.toString() : '1000'
                        ];
                        if (step.type === 'led') {
                            args.push(step.brightness ? step.brightness.toString() : '100');
                        }
                        break;
                    case 'sensor':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
                        const sensorPart = await partService.getPartById(step.part_id);
                        args = [sensorPart.gpioPin.toString(), step.timeout ? step.timeout.toString() : '30'];
                        break;
                    case 'sound':
                        scriptPath = path.join(__dirname, '..', 'scripts', 'play_sound.py');
                        const sound = await soundService.getSoundById(step.sound_id);
                        if (!sound || !sound.filename) {
                            throw new Error('Sound file not found');
                        }
                        args = [path.join(__dirname, '..', 'public', 'sounds', sound.filename)];
                        if (step.concurrent) {
                            args.push('true');
                        }
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
                    console.log(`Child process exited with code ${code}`);
                    if (code === 0) {
                        if (step.type === 'sensor') {
                            const motionDetected = stdout.includes('Motion detected');
                            console.log(`Sensor result: ${motionDetected ? 'Motion detected' : 'No motion detected'}`);
                            resolve({ success: true, message: motionDetected ? 'Motion detected' : 'No motion detected', motionDetected });
                        } else if (step.type === 'sound' && step.concurrent) {
                            console.log('Concurrent sound playback initiated');
                            resolve({ success: true, message: 'Concurrent sound playback initiated', stdout, stderr });
                        } else {
                            console.log('Step executed successfully');
                            resolve({ success: true, message: 'Step executed successfully', stdout, stderr });
                        }
                    } else {
                        console.error(`Step execution failed with code ${code}`);
                        reject(new Error(`Step execution failed with code ${code}`));
                    }
                });
            } catch (error) {
                console.error('Error in _executeStep:', error);
                reject(error);
            }
        });
    },
};

module.exports = sceneController;
