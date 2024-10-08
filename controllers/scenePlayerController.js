// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');

let isExecuting = false;
let currentSceneState = {};

const stopAllParts = async () => {
    logger.info('Stopping all parts');
    // Implement logic to stop all parts
    // This could involve calling a Python script that stops all motors, actuators, etc.
};

const scenePlayerController = {
    getScenePlayer: async (req, res) => {
        try {
            const sceneId = req.params.id;
            const characterId = req.query.characterId;
            logger.info(`Getting scene player for scene ${sceneId}, character ${characterId}`);
            const scene = await sceneService.getSceneById(sceneId);
            if (scene) {
                if (scene.character_id.toString() !== characterId) {
                    logger.warn(`Scene ${sceneId} does not belong to character ${characterId}`);
                    return res.status(403).json({ error: 'Scene does not belong to this character' });
                }
                logger.info(`Rendering scene player for scene ${sceneId}`);
                logger.debug(`Scene data: ${JSON.stringify(scene)}`);
                res.render('scene-player', { title: 'Scene Player', scene, characterId });
            } else {
                logger.warn(`Scene ${sceneId} not found`);
                res.status(404).render('error', { error: 'Scene not found' });
            }
        } catch (error) {
            logger.error('Error getting scene by ID:', error);
            res.status(500).render('error', { error: 'Failed to retrieve scene' });
        }
    },

    playScene: async (req, res) => {
        const sceneId = req.params.id;
        const characterId = req.query.characterId;
        const startStep = parseInt(req.query.startStep) || 0;
        logger.info(`Attempting to play scene with ID: ${sceneId} for character ${characterId} from step ${startStep}`);
        
        let scene;
        try {
            scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                logger.warn(`Scene ${sceneId} not found`);
                return res.status(404).json({ error: 'Scene not found' });
            }
            if (scene.character_id.toString() !== characterId) {
                logger.warn(`Scene ${sceneId} does not belong to character ${characterId}`);
                return res.status(403).json({ error: 'Scene does not belong to this character' });
            }
        } catch (error) {
            logger.error(`Error fetching scene ${sceneId}:`, error);
            return res.status(500).json({ error: 'Failed to fetch scene', details: error.message });
        }

        // Initialize scene state
        currentSceneState = {
            sceneId,
            currentStep: startStep,
            isCompleted: false,
            messages: [],
            error: null
        };

        // Start scene execution in the background
        executeScene(scene, startStep);

        // Respond to the initial request
        res.json({ message: 'Scene execution started', sceneId });
    },

    getSceneStatus: (req, res) => {
        res.json(currentSceneState);
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
    }
};

async function executeScene(scene, startStep) {
    logger.info(`Starting execution of scene ${scene.id} from step ${startStep}`);
    isExecuting = true;

    try {
        await soundController.startSoundPlayer();

        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            currentSceneState.currentStep = i;
            currentSceneState.messages.push(`Executing step ${i + 1}: ${step.name}`);

            await executeStep(scene.id, step);

            if (step.type === 'sound' && !step.concurrent) {
                await new Promise(resolve => setTimeout(resolve, step.duration));
            }
        }

        currentSceneState.isCompleted = true;
        currentSceneState.messages.push('Scene execution completed');
    } catch (error) {
        logger.error(`Error during scene ${scene.id} execution:`, error);
        currentSceneState.error = `Scene execution failed: ${error.message}`;
    } finally {
        isExecuting = false;
        await stopAllParts();
        await soundController.stopAllSounds();
        logger.info(`Scene ${scene.id} cleanup completed`);
        currentSceneState.messages.push('Scene cleanup completed');
    }
}

async function executeStep(sceneId, step) {
    logger.debug(`Executing step: ${JSON.stringify(step)}`);
    switch (step.type) {
        case 'sound':
            return await executeSound(step);
        case 'motor':
            return await executeMotor(step);
        case 'linear-actuator':
            return await executeLinearActuator(step);
        case 'servo':
            return await executeServo(step);
        case 'led':
        case 'light':
            return await executeLight(step);
        case 'sensor':
            return await executeSensor(step);
        case 'pause':
            return await executePause(step);
        default:
            logger.warn(`Unknown step type: ${step.type}`);
            throw new Error(`Unknown step type: ${step.type}`);
    }
}

async function executeSound(step) {
    logger.info(`Executing sound step: ${step.name}`);
    try {
        const sound = await soundService.getSoundById(step.sound_id);
        if (!sound) {
            throw new Error(`Sound not found for ID: ${step.sound_id}`);
        }
        const filePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);
        await soundController.playSound(sound.id, filePath);
        logger.info(`Sound played: ${sound.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing sound step: ${error.message}`);
        throw error;
    }
}
async function executeMotor(step) {
    logger.info(`Executing motor step: ${step.name}`);
    try {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'motor_control.py');
        const args = [
            step.direction,
            step.speed.toString(),
            step.duration.toString(),
            step.part_id.toString()
        ];
        await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            process.stdout.on('data', (data) => {
                logger.debug(`Motor control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                logger.error(`Motor control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Motor control process exited with code ${code}`));
                }
            });
        });
        return true;
    } catch (error) {
        logger.error(`Error executing motor step: ${error.message}`);
        throw error;
    }
}

async function executeLinearActuator(step) {
    logger.info(`Executing linear actuator step: ${step.name}`);
    try {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        const args = [
            step.direction,
            step.speed.toString(),
            step.duration.toString(),
            step.part_id.toString()
        ];
        await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            process.stdout.on('data', (data) => {
                logger.debug(`Linear actuator control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                logger.error(`Linear actuator control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Linear actuator control process exited with code ${code}`));
                }
            });
        });
        return true;
    } catch (error) {
        logger.error(`Error executing linear actuator step: ${error.message}`);
        throw error;
    }
}

async function executeServo(step) {
    logger.info(`Executing servo step: ${step.name}`);
    try {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
        const args = [
            step.angle.toString(),
            step.speed.toString(),
            step.duration.toString(),
            step.part_id.toString()
        ];
        await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            process.stdout.on('data', (data) => {
                logger.debug(`Servo control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                logger.error(`Servo control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Servo control process exited with code ${code}`));
                }
            });
        });
        return true;
    } catch (error) {
        logger.error(`Error executing servo step: ${error.message}`);
        throw error;
    }
}

async function executeLight(step) {
    logger.info(`Executing light step: ${step.name}`);
    try {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
        const args = [
            step.state,
            step.duration.toString(),
            step.part_id.toString()
        ];
        if (step.type === 'led') {
            args.push(step.brightness.toString());
        }
        await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            process.stdout.on('data', (data) => {
                logger.debug(`Light control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                logger.error(`Light control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Light control process exited with code ${code}`));
                }
            });
        });
        return true;
    } catch (error) {
        logger.error(`Error executing light step: ${error.message}`);
        throw error;
    }
}

async function executeSensor(step) {
    logger.info(`Executing sensor step: ${step.name}`);
    try {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sensor_control.py');
        const args = [
            step.part_id.toString(),
            step.timeout.toString()
        ];
        return new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            process.stdout.on('data', (data) => {
                logger.debug(`Sensor control output: ${data}`);
                if (data.toString().includes('Motion detected')) {
                    process.kill();
                    resolve(true);
                }
            });
            process.stderr.on('data', (data) => {
                logger.error(`Sensor control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(false);
                } else {
                    reject(new Error(`Sensor control process exited with code ${code}`));
                }
            });
        });
    } catch (error) {
        logger.error(`Error executing sensor step: ${error.message}`);
        throw error;
    }
}

async function executePause(step) {
    logger.info(`Executing pause step: ${step.name}`);
    return new Promise(resolve => setTimeout(resolve, step.duration));
}

module.exports = scenePlayerController;