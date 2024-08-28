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
            const characters = await characterService.getAllCharacters();
            res.render('scenes', { title: 'Scenes', scenes, characters });
        } catch (error) {
            console.error('Error fetching scenes:', error);
            res.status(500).send('An error occurred while fetching scenes');
        }
    },

    newScene: async (req, res) => {
        try {
            const characters = await characterService.getAllCharacters();
            const parts = await partService.getAllParts();
            const sounds = await soundService.getAllSounds();
            res.render('scene-form', { 
                title: 'New Scene', 
                scene: { steps: [] }, 
                action: '/scenes',
                characters,
                parts,
                sounds
            });
        } catch (error) {
            console.error('Error rendering new scene form:', error);
            res.status(500).send('An error occurred while loading the new scene form');
        }
    },

    getSceneById: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (scene) {
                const characters = await characterService.getAllCharacters();
                const parts = await partService.getAllParts();
                const sounds = await soundService.getAllSounds();
                res.render('scene-form', { 
                    title: 'Edit Scene', 
                    scene, 
                    action: `/scenes/${scene.id}`,
                    characters,
                    parts,
                    sounds
                });
            } else {
                res.status(404).send('Scene not found');
            }
        } catch (error) {
            console.error('Error fetching scene:', error);
            res.status(500).send('An error occurred while fetching the scene');
        }
    },

    editScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (scene) {
                const characters = await characterService.getAllCharacters();
                const parts = await partService.getAllParts();
                const sounds = await soundService.getAllSounds();
                res.render('scene-form', { 
                    title: 'Edit Scene', 
                    scene, 
                    action: `/scenes/${scene.id}`,
                    characters,
                    parts,
                    sounds
                });
            } else {
                res.status(404).send('Scene not found');
            }
        } catch (error) {
            console.error('Error fetching scene for editing:', error);
            res.status(500).send('An error occurred while fetching the scene for editing');
        }
    },

    createScene: async (req, res) => {
        try {
            const sceneData = {
                character_id: parseInt(req.body.character_id),
                scene_name: req.body.scene_name,
                steps: req.body.steps || []
            };
            const newScene = await sceneService.createScene(sceneData);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error creating scene:', error);
            res.status(500).send('An error occurred while creating the scene');
        }
    },

    updateScene: async (req, res) => {
        try {
            const sceneData = {
                character_id: parseInt(req.body.character_id),
                scene_name: req.body.scene_name,
                steps: req.body.steps || []
            };
            await sceneService.updateScene(req.params.id, sceneData);
            res.redirect('/scenes');
        } catch (error) {
            console.error('Error updating scene:', error);
            res.status(500).send('An error occurred while updating the scene');
        }
    },

    deleteScene: async (req, res) => {
        try {
            await sceneService.deleteScene(req.params.id);
            res.sendStatus(200);
        } catch (error) {
            console.error('Error deleting scene:', error);
            res.status(500).send('An error occurred while deleting the scene');
        }
    },

    playScene: async (req, res) => {
        try {
            const scene = await sceneService.getSceneById(req.params.id);
            if (scene) {
                res.render('scene-player', { title: 'Scene Player', scene });
            } else {
                res.status(404).send('Scene not found');
            }
        } catch (error) {
            console.error('Error loading scene player:', error);
            res.status(500).send('An error occurred while loading the scene player');
        }
    },

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
