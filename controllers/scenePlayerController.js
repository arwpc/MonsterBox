// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');

let isExecuting = false;

const stopAllParts = async () => {
    logger.info('Stopping all parts');
    // Implement logic to stop all parts
};

const scenePlayerController = {
    getScenePlayer: async (req, res) => {
        try {
            const sceneId = req.params.id;
            logger.info(`Getting scene player for scene ${sceneId}`);
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                logger.info(`Rendering scene player for scene ${sceneId}`);
                res.render('scene-player', { title: 'Scene Player', scene });
            } else {
                logger.warn(`Scene ${sceneId} not found`);
                res.status(404).render('error', { title: 'Not Found', message: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error getting scene by ID:', error);
            res.status(500).render('error', { title: 'Error', message: 'Failed to retrieve scene', error });
        }
    },

    playScene: async (req, res) => {
        const sceneId = req.params.id;
        const startStep = parseInt(req.query.startStep) || 0;
        logger.info(`Attempting to play scene with ID: ${sceneId} from step ${startStep}`);
        
        let scene;
        try {
            scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                logger.warn(`Scene ${sceneId} not found`);
                return res.status(404).json({ error: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error fetching scene:', error);
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

        try {
            logger.info('Starting sound player');
            await soundController.startSoundPlayer();
            isExecuting = true;

            for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
                const step = scene.steps[i];
                logger.info(`Executing step ${i + 1}: ${step.name} (${step.type})`);
                sendEvent({ message: `Executing step ${i + 1}: ${step.name}`, currentStep: i });
                
                try {
                    await executeStep(step, sendEvent);
                    logger.info(`Completed step ${i + 1}: ${step.name}`);
                } catch (error) {
                    logger.error(`Error executing step ${i + 1}: ${step.name}`, error);
                    sendEvent({ error: `Failed to execute step ${i + 1}: ${step.name} - ${error.message}` });
                    break; // Stop execution on error
                }
            }

            logger.info('Scene execution completed');
            sendEvent({ message: 'Scene execution completed' });
        } catch (error) {
            logger.error('Error during scene execution:', error);
            sendEvent({ error: `Scene execution failed: ${error.message}` });
        } finally {
            isExecuting = false;
            res.end();
        }
    },

    stopScene: async (req, res) => {
        logger.info('Stopping all steps and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All steps stopped and processes terminated' });
        } catch (error) {
            logger.error('Error stopping all steps:', error);
            res.status(500).json({ error: 'Failed to stop all steps', details: error.message });
        }
    },

    stopAllScenes: async (req, res) => {
        logger.info('Stopping all scenes and terminating processes');
        isExecuting = false;
        try {
            await soundController.stopAllSounds();
            await stopAllParts();
            res.json({ message: 'All scenes stopped and processes terminated' });
        } catch (error) {
            logger.error('Error stopping all scenes:', error);
            res.status(500).json({ error: 'Failed to stop all scenes', details: error.message });
        }
    }
};

async function executeStep(step, sendEvent) {
    if (!isExecuting) return;
    logger.info(`Executing step: ${step.name} (${step.type})`);
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
        logger.info(`Completed execution of ${step.type} step: ${step.name}`);
        sendEvent({ message: `Completed execution of ${step.type} step: ${step.name}` });
    } catch (error) {
        logger.error(`Error executing step ${step.name}:`, error);
        sendEvent({ error: `Failed to execute ${step.type} step: ${error.message}` });
        throw error; // Re-throw to stop execution
    }
}

async function executeSound(step, sendEvent) {
    logger.info(`Executing sound step: ${step.name}`);
    const sound = await soundService.getSoundById(step.sound_id);
    if (!sound) {
        logger.error(`Sound not found for ID: ${step.sound_id}`);
        throw new Error(`Sound not found for ID: ${step.sound_id}`);
    }
    await soundController.playSound(sound, sendEvent);
}

async function executePartAction(step, sendEvent) {
    logger.info(`Executing part action step: ${step.name}`);
    const part = await partService.getPartById(step.part_id);
    if (!part) {
        logger.error(`Part not found for ID: ${step.part_id}`);
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
                part.maxExtension ? part.maxExtension.toString() : '10000',
                part.maxRetraction ? part.maxRetraction.toString() : '10000'
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
                part.pwmFrequency ? part.pwmFrequency.toString() : '50',
                part.dutyCycle ? part.dutyCycle.toString() : '0'
            ];
            break;
        default:
            throw new Error(`Unsupported part type: ${part.type}`);
    }

    return new Promise((resolve, reject) => {
        logger.info(`Executing script: ${scriptPath} with args: ${args.join(', ')}`);
        const process = spawn('sudo', ['python3', scriptPath, ...args]);

        process.stdout.on('data', (data) => {
            const message = data.toString().trim();
            logger.info(`${part.type} output: ${message}`);
            sendEvent({ message: `${part.type} output: ${message}` });
        });

        process.stderr.on('data', (data) => {
            const errorMessage = data.toString().trim();
            logger.error(`${part.type} error: ${errorMessage}`);
            sendEvent({ error: `${part.type} error: ${errorMessage}` });
        });

        process.on('close', (code) => {
            if (code === 0) {
                logger.info(`${part.type} action completed: ${step.name}`);
                sendEvent({ message: `${part.type} action completed: ${step.name}` });
                resolve();
            } else {
                const errorMessage = `${part.type} process exited with code ${code}`;
                logger.error(errorMessage);
                reject(new Error(errorMessage));
            }
        });
    });
}

async function executeSensor(step, sendEvent) {
    logger.info(`Executing sensor step: ${step.name}`);
    const part = await partService.getPartById(step.part_id);
    if (!part) {
        logger.error(`Sensor not found for ID: ${step.part_id}`);
        throw new Error(`Sensor not found for ID: ${step.part_id}`);
    }

    return new Promise((resolve, reject) => {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sensor_control.py');
        const args = [part.gpioPin.toString(), step.timeout.toString()];
        logger.info(`Executing sensor script: ${scriptPath} with args: ${args.join(', ')}`);
        const process = spawn('python3', [scriptPath, ...args]);

        process.stdout.on('data', (data) => {
            const message = data.toString().trim();
            logger.info(`Sensor output: ${message}`);
            sendEvent({ message: `Sensor output: ${message}` });
        });

        process.stderr.on('data', (data) => {
            const errorMessage = data.toString().trim();
            logger.error(`Sensor error: ${errorMessage}`);
            sendEvent({ error: `Sensor error: ${errorMessage}` });
        });

        process.on('close', (code) => {
            if (code === 0) {
                logger.info(`Sensor step completed: ${step.name}`);
                sendEvent({ message: `Sensor step completed: ${step.name}`, result: { detected: true } });
                resolve({ detected: true });
            } else if (code === 1) {
                logger.info(`Sensor step completed (no detection): ${step.name}`);
                sendEvent({ message: `Sensor step completed: ${step.name}`, result: { detected: false } });
                resolve({ detected: false });
            } else {
                const errorMessage = `Sensor process exited with code ${code}`;
                logger.error(errorMessage);
                reject(new Error(errorMessage));
            }
        });
    });
}

async function executePause(step, sendEvent) {
    logger.info(`Executing pause step: ${step.name}, duration: ${step.duration}ms`);
    return new Promise((resolve) => {
        sendEvent({ message: `Starting pause: ${step.duration}ms` });
        setTimeout(() => {
            logger.info(`Pause completed: ${step.duration}ms`);
            sendEvent({ message: `Pause completed: ${step.duration}ms` });
            resolve();
        }, step.duration);
    });
}

module.exports = scenePlayerController;