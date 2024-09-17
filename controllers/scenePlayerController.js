// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');

let isExecuting = false;

const stopAllParts = async () => {
    // Implement logic to stop all parts
    // This might involve sending stop signals to all active parts
    console.log('Stopping all parts');
    // For now, we'll just log this action
};

const scenePlayerController = {
    getScenePlayer: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                res.render('scene-player', { title: 'Scene Player', scene });
            } else {
                res.status(404).render('error', { title: 'Not Found', message: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error getting scene by ID:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scene', error });
        }
    },

    playScene: async (req, res) => {
        const sceneId = req.params.id;
        const startStep = parseInt(req.query.startStep) || 0;
        console.log(`Attempting to play scene with ID: ${sceneId} from step ${startStep}`);
        
        let scene;
        try {
            scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                return res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            console.error('Error fetching scene:', error);
            return res.status(500).json({ error: 'Failed to fetch scene' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        soundController.startSoundPlayer();
        isExecuting = true;

        let concurrentSteps = [];
        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            concurrentSteps.push(step);

            if (!step.concurrent || i === scene.steps.length - 1) {
                sendEvent({ message: `Executing concurrent steps`, currentStep: i });
                try {
                    await Promise.all(concurrentSteps.map(s => executeStep(s, sendEvent)));
                } catch (error) {
                    console.error(`Error executing concurrent steps:`, error);
                    sendEvent({ error: `Failed to execute concurrent steps: ${error.message}` });
                }
                concurrentSteps = [];
            }
        }

        sendEvent({ message: 'Scene execution completed' });
        isExecuting = false;
        res.end();
    },

    stopScene: async (req, res) => {
        console.log('Stopping all steps and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All steps stopped and processes terminated' });
        } catch (error) {
            console.error('Error stopping all steps:', error);
            res.status(500).json({ error: 'Failed to stop all steps', details: error.message });
        }
    },

    stopAllScenes: async (req, res) => {
        console.log('Stopping all scenes and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All scenes stopped and processes terminated' });
        } catch (error) {
            console.error('Error stopping all scenes:', error);
            res.status(500).json({ error: 'Failed to stop all scenes', details: error.message });
        }
    }
};

async function executeStep(step, sendEvent) {
    if (!isExecuting) return;
    console.log('Executing step:', step);
    sendEvent({ message: `Starting execution of ${step.type} step: ${step.name}` });

    try {
        switch (step.type) {
            case 'sound':
                await executeSound(step, sendEvent);
                break;
            case 'motor':
            case 'linear-actuator':
            case 'led':
            case 'light':
            case 'servo':
                await executePartAction(step, sendEvent);
                break;
            case 'sensor':
                await executeSensor(step, sendEvent);
                break;
            case 'pause':
                await executePause(step, sendEvent);
                break;
            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
        sendEvent({ message: `Completed execution of ${step.type} step: ${step.name}` });
    } catch (error) {
        console.error(`Error executing step:`, error);
        sendEvent({ error: `Failed to execute ${step.type} step: ${error.message}` });
    }
}

async function executeSound(step, sendEvent) {
    const sound = await soundService.getSoundById(step.sound_id);
    if (!sound) {
        throw new Error(`Sound not found for ID: ${step.sound_id}`);
    }
    await soundController.playSound(sound, sendEvent);
}

async function executePartAction(step, sendEvent) {
    const part = await partService.getPartById(step.part_id);
    if (!part) {
        throw new Error(`Part not found for ID: ${step.part_id}`);
    }

    let scriptPath;
    let args;

    switch (part.type) {
        case 'motor':
        case 'linear-actuator':
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'linear_actuator_control.py');
            args = [
                step.direction,
                step.speed.toString(),
                step.duration.toString(),
                part.directionPin.toString(),
                part.pwmPin.toString(),
                part.maxExtension.toString(),
                part.maxRetraction.toString()
            ];
            break;
        case 'led':
        case 'light':
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
            args = [part.gpioPin.toString(), step.state, step.duration.toString()];
            if (part.type === 'led' && step.brightness) {
                args.push(step.brightness.toString());
            }
            break;
        case 'servo':
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
            args = [
                part.gpioPin.toString(),
                step.angle.toString(),
                step.speed.toString(),
                step.duration.toString(),
                part.pwmFrequency.toString(),
                part.dutyCycle.toString()
            ];
            break;
        default:
            throw new Error(`Unsupported part type: ${part.type}`);
    }

    return new Promise((resolve, reject) => {
        const process = spawn('sudo', ['python3', scriptPath, ...args]);

        process.stdout.on('data', (data) => {
            sendEvent({ message: `${part.type} output: ${data}` });
        });

        process.stderr.on('data', (data) => {
            sendEvent({ error: `${part.type} error: ${data}` });
        });

        process.on('close', (code) => {
            if (code === 0) {
                sendEvent({ message: `${part.type} action completed: ${step.name}` });
                resolve();
            } else {
                reject(new Error(`${part.type} process exited with code ${code}`));
            }
        });
    });
}

async function executeSensor(step, sendEvent) {
    const part = await partService.getPartById(step.part_id);
    if (!part) {
        throw new Error(`Sensor not found for ID: ${step.part_id}`);
    }

    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sensor_control.py');
        const args = [part.gpioPin.toString(), step.timeout.toString()];
        const process = spawn('python3', [scriptPath, ...args]);

        process.stdout.on('data', (data) => {
            sendEvent({ message: `Sensor output: ${data}` });
        });

        process.stderr.on('data', (data) => {
            sendEvent({ error: `Sensor error: ${data}` });
        });

        process.on('close', (code) => {
            if (code === 0) {
                sendEvent({ message: `Sensor step completed: ${step.name}`, result: { detected: true } });
                resolve({ detected: true });
            } else if (code === 1) {
                sendEvent({ message: `Sensor step completed: ${step.name}`, result: { detected: false } });
                resolve({ detected: false });
            } else {
                reject(new Error(`Sensor process exited with code ${code}`));
            }
        });
    });
}

async function executePause(step, sendEvent) {
    return new Promise((resolve) => {
        sendEvent({ message: `Starting pause: ${step.duration}ms` });
        setTimeout(() => {
            sendEvent({ message: `Pause completed: ${step.duration}ms` });
            resolve();
        }, step.duration);
    });
}

module.exports = scenePlayerController;