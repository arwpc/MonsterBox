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
                    return res.status(403).render('error', { title: 'Forbidden', message: 'Scene does not belong to this character' });
                }
                logger.info(`Rendering scene player for scene ${sceneId}`);
                logger.debug(`Scene data: ${JSON.stringify(scene)}`);
                res.render('scene-player', { title: 'Scene Player', scene, characterId });
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

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
            logger.info(`Starting sound player for scene ${sceneId}`);
            await soundController.startSoundPlayer();
            isExecuting = true;

            for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
                const step = scene.steps[i];
                logger.info(`Executing step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name} (${step.type})`);
                sendEvent({ message: `Executing step ${i + 1}: ${step.name}`, currentStep: i });
                
                try {
                    const result = await executeStep(sceneId, step, sendEvent);
                    if (result === false) {
                        logger.info(`Scene ${sceneId} execution ended early due to sensor condition`);
                        sendEvent({ message: 'Scene execution ended early due to sensor condition' });
                        break;
                    }
                    logger.info(`Completed step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name}`);
                } catch (error) {
                    logger.error(`Error executing step ${i + 1}/${scene.steps.length} for scene ${sceneId}: ${step.name}`, error);
                    sendEvent({ error: `Failed to execute step ${i + 1}: ${step.name} - ${error.message}` });
                    // Continue to the next step instead of breaking
                }
            }

            logger.info(`Scene ${sceneId} execution completed`);
            sendEvent({ message: 'Scene execution completed' });
        } catch (error) {
            logger.error(`Error during scene ${sceneId} execution:`, error);
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

async function executeStep(sceneId, step, sendEvent) {
    logger.debug(`Executing step: ${JSON.stringify(step)}`);
    switch (step.type) {
        case 'sound':
            return await executeSound(step, sendEvent);
        case 'motor':
            return await executeMotor(step, sendEvent);
        case 'linear-actuator':
            return await executeLinearActuator(step, sendEvent);
        case 'servo':
            return await executeServo(step, sendEvent);
        case 'led':
        case 'light':
            return await executeLight(step, sendEvent);
        case 'sensor':
            return await executeSensor(step, sendEvent);
        case 'pause':
            return await executePause(step, sendEvent);
        default:
            logger.warn(`Unknown step type: ${step.type}`);
            throw new Error(`Unknown step type: ${step.type}`);
    }
}

async function executeSound(step, sendEvent) {
    logger.info(`Executing sound step: ${step.name}`);
    try {
        const sound = await soundService.getSoundById(step.sound_id);
        if (!sound) {
            throw new Error(`Sound not found for ID: ${step.sound_id}`);
        }
        await soundController.playSound(sound, sendEvent);
    } catch (error) {
        logger.error(`Error executing sound step: ${error.message}`);
        throw error;
    }
}

async function executeMotor(step, sendEvent) {
    logger.info(`Executing motor step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        
        const scriptPath = path.join(__dirname, '..', 'scripts', 'motor_control.py');
        const process = spawn('python3', [
            scriptPath,
            step.direction,
            step.speed,
            step.duration,
            part.directionPin,
            part.pwmPin
        ]);

        process.stdout.on('data', (data) => {
            logger.debug(`Motor output: ${data}`);
            sendEvent({ message: `Motor: ${data}` });
        });

        process.stderr.on('data', (data) => {
            logger.error(`Motor error: ${data}`);
            sendEvent({ error: `Motor error: ${data}` });
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Motor process exited with code ${code}`));
                }
            });
        });

    } catch (error) {
        logger.error(`Error executing motor step: ${error.message}`);
        throw error;
    }
}

async function executeLinearActuator(step, sendEvent) {
    logger.info(`Executing linear actuator step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        
        const scriptPath = path.join(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        const process = spawn('python3', [
            scriptPath,
            step.direction,
            step.speed,
            step.duration,
            part.directionPin,
            part.pwmPin,
            part.maxExtension || '10000',
            part.maxRetraction || '10000'
        ]);

        process.stdout.on('data', (data) => {
            logger.debug(`Linear actuator output: ${data}`);
            sendEvent({ message: `Linear actuator: ${data}` });
        });

        process.stderr.on('data', (data) => {
            logger.error(`Linear actuator error: ${data}`);
            sendEvent({ error: `Linear actuator error: ${data}` });
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Linear actuator process exited with code ${code}`));
                }
            });
        });

    } catch (error) {
        logger.error(`Error executing linear actuator step: ${error.message}`);
        throw error;
    }
}

async function executeServo(step, sendEvent) {
    logger.info(`Executing servo step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        
        const scriptPath = path.join(__dirname, '..', 'scripts', 'servo_control.py');
        const process = spawn('python3', [
            scriptPath,
            'test',
            part.usePCA9685 ? 'pca9685' : 'gpio',
            part.usePCA9685 ? part.channel : part.pin,
            step.angle,
            part.servoType
        ]);

        process.stdout.on('data', (data) => {
            logger.debug(`Servo output: ${data}`);
            sendEvent({ message: `Servo: ${data}` });
        });

        process.stderr.on('data', (data) => {
            logger.error(`Servo error: ${data}`);
            sendEvent({ error: `Servo error: ${data}` });
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Servo process exited with code ${code}`));
                }
            });
        });

    } catch (error) {
        logger.error(`Error executing servo step: ${error.message}`);
        throw error;
    }
}

async function executeLight(step, sendEvent) {
    logger.info(`Executing light step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        
        const scriptPath = path.join(__dirname, '..', 'scripts', 'light_control.py');
        const process = spawn('python3', [
            scriptPath,
            part.gpioPin,
            step.state,
            step.duration
        ]);

        if (step.type === 'led' && step.brightness) {
            process.stdin.write(step.brightness.toString());
            process.stdin.end();
        }

        process.stdout.on('data', (data) => {
            logger.debug(`Light output: ${data}`);
            sendEvent({ message: `Light: ${data}` });
        });

        process.stderr.on('data', (data) => {
            logger.error(`Light error: ${data}`);
            sendEvent({ error: `Light error: ${data}` });
        });

        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Light process exited with code ${code}`));
                }
            });
        });

    } catch (error) {
        logger.error(`Error executing light step: ${error.message}`);
        throw error;
    }
}

async function executeSensor(step, sendEvent) {
    logger.info(`Executing sensor step: ${step.name}`);
    try {
        const sensor = await partService.getPartById(step.part_id);
        if (!sensor) {
            throw new Error(`Sensor not found for ID: ${step.part_id}`);
        }
        
        if (!sensor.gpioPin) {
            throw new Error(`GPIO pin not defined for sensor with ID: ${step.part_id}`);
        }

        logger.debug(`Sensor details: ${JSON.stringify(sensor)}`);
        
        const scriptPath = path.join(__dirname, '..', 'scripts', 'sensor_control.py');
        const process = spawn('python3', [scriptPath, sensor.gpioPin.toString()]);

        let motionDetected = false;
        const duration = parseInt(step.duration);
        const startTime = Date.now();

        process.stdout.on('data', (data) => {
            try {
                const output = JSON.parse(data.toString().trim());
                logger.debug(`Sensor output: ${JSON.stringify(output)}`);
                sendEvent({ message: `Sensor: ${output.status}` });
                if (output.status === "Motion detected!") {
                    motionDetected = true;
                    process.kill();
                }
            } catch (error) {
                logger.error(`Error parsing sensor output: ${error.message}`);
            }
        });

        process.stderr.on('data', (data) => {
            logger.error(`Sensor error: ${data}`);
            sendEvent({ error: `Sensor error: ${data}` });
        });

        return new Promise((resolve) => {
            const checkDuration = setInterval(() => {
                if (Date.now() - startTime >= duration || motionDetected) {
                    clearInterval(checkDuration);
                    process.kill();
                    if (motionDetected) {
                        sendEvent({ message: 'Motion detected, continuing to next step' });
                        resolve(true);
                    } else {
                        sendEvent({ message: 'No motion detected within the specified duration, ending scene' });
                        resolve(false);
                    }
                }
            }, 100);

            process.on('close', () => {
                clearInterval(checkDuration);
                if (!motionDetected && Date.now() - startTime < duration) {
                    sendEvent({ message: 'Sensor monitoring stopped unexpectedly' });
                    resolve(false);
                }
            });
        });

    } catch (error) {
        logger.error(`Error executing sensor step: ${error.message}`);
        throw error;
    }
}

async function executePause(step, sendEvent) {
    logger.info(`Executing pause step: ${step.name}`);
    sendEvent({ message: `Pausing for ${step.duration}ms` });
    await new Promise(resolve => setTimeout(resolve, parseInt(step.duration)));
}

module.exports = scenePlayerController;