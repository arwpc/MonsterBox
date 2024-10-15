const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');

let isExecuting = false;
let currentSceneState = {};
let res = null;

const STEP_TIMEOUT = 60000; // 60 seconds timeout
const SOUND_CHECK_INTERVAL = 100; // 100ms interval for checking sound status

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
        const characterId = req.query.characterId || req.session.characterId;
        const startStep = parseInt(req.query.startStep) || 0;
        logger.info(`Attempting to play scene with ID: ${sceneId} for character ${characterId} from step ${startStep}`);
        logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
        logger.debug(`Session: ${JSON.stringify(req.session)}`);
        
        if (!characterId) {
            logger.warn(`No character ID provided for scene ${sceneId}`);
            return res.status(400).json({ error: 'Character ID is required' });
        }

        let scene;
        try {
            scene = await sceneService.getSceneById(sceneId);
            if (!scene) {
                logger.warn(`Scene ${sceneId} not found`);
                return res.status(404).json({ error: 'Scene not found' });
            }
            if (scene.character_id.toString() !== characterId.toString()) {
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

        // Set up SSE
        logger.info('Setting up SSE connection');
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        logger.debug(`Response headers: ${JSON.stringify(res._headers)}`);

        // Send initial message to establish SSE connection
        sendSSEMessage(res, { message: 'SSE connection established' });
        logger.info('Sent initial SSE message');

        // Start scene execution in the background
        try {
            logger.info('Starting scene execution');
            await executeScene(scene, startStep, res);
        } catch (error) {
            logger.error(`Error during scene execution:`, error);
            sendSSEMessage(res, { error: `Scene execution failed: ${error.message}` });
        }

        // Keep the connection open
        req.on('close', () => {
            logger.info('Client closed the connection');
        });
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

function sendSSEMessage(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function executeScene(scene, startStep, res) {
    logger.info(`Starting execution of scene ${scene.id} from step ${startStep}`);
    isExecuting = true;

    try {
        await soundController.startSoundPlayer();
        logger.info('Sound player started successfully');

        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            currentSceneState.currentStep = i;
            const message = `Executing step ${i + 1}: ${step.name}`;
            currentSceneState.messages.push(message);
            
            sendSSEMessage(res, { message, currentStep: i });
            logger.debug(`Sent SSE update for step ${i + 1}`);

            try {
                await executeStepWithTimeout(scene.id, step);
                logger.info(`Step ${i + 1} executed successfully`);
            } catch (stepError) {
                logger.error(`Error executing step ${i + 1}: ${stepError.message}`);
                sendSSEMessage(res, { error: `Error in step ${i + 1}: ${stepError.message}` });
                // Continue with the next step instead of stopping the entire scene
                continue;
            }

            // Add a small delay between steps
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        currentSceneState.isCompleted = true;
        const completionMessage = 'Scene execution completed';
        currentSceneState.messages.push(completionMessage);
        
        sendSSEMessage(res, { message: completionMessage, event: 'scene_end' });
        logger.info('Sent final SSE update with scene_end event');
    } catch (error) {
        logger.error(`Error during scene ${scene.id} execution:`, error);
        currentSceneState.error = `Scene execution failed: ${error.message}`;
        
        sendSSEMessage(res, { error: currentSceneState.error, event: 'scene_end' });
        logger.info('Sent error SSE update with scene_end event');
    } finally {
        isExecuting = false;
        try {
            await stopAllParts();
            await soundController.stopAllSounds();
            logger.info(`Scene ${scene.id} cleanup completed`);
        } catch (error) {
            logger.error(`Error during scene cleanup: ${error.message}`);
        }
        const cleanupMessage = 'Scene cleanup completed';
        currentSceneState.messages.push(cleanupMessage);
        
        sendSSEMessage(res, { message: cleanupMessage, event: 'scene_end' });
        logger.info('Sent cleanup SSE update with scene_end event');
    }
}

async function executeStepWithTimeout(sceneId, step) {
    return new Promise(async (resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Step ${step.name} timed out after ${STEP_TIMEOUT / 1000} seconds`));
        }, STEP_TIMEOUT);

        try {
            await executeStep(sceneId, step);
            clearTimeout(timeoutId);
            resolve();
        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
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
        logger.debug(`Sound file path: ${filePath}`);
        
        const playResult = await soundController.playSound(sound.id, filePath);
        logger.info(`Sound started playing: ${sound.name}, Result: ${JSON.stringify(playResult)}`);

        if (!playResult.success) {
            throw new Error(`Failed to start sound playback: ${playResult.message}`);
        }

        // Wait for the sound to finish playing
        await waitForSoundCompletion(sound.id);

        logger.info(`Sound step completed: ${step.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing sound step: ${error.message}`);
        throw error;
    }
}

async function waitForSoundCompletion(soundId) {
    return new Promise((resolve, reject) => {
        const checkInterval = setInterval(async () => {
            try {
                const status = await soundController.getSoundStatus(soundId);
                logger.debug(`Sound status for ${soundId}: ${JSON.stringify(status)}`);

                if (status.status === 'stopped' || status.status === 'finished' || status.status === 'not_found') {
                    clearInterval(checkInterval);
                    logger.info(`Sound finished playing: ${soundId}`);
                    await soundController.stopSound(soundId);
                    resolve();
                }
            } catch (error) {
                clearInterval(checkInterval);
                logger.error(`Error checking sound status: ${error.message}`);
                reject(error);
            }
        }, SOUND_CHECK_INTERVAL);
    });
}

async function executeMotor(step) {
    logger.info(`Executing motor step: ${step.name}`);
    try {
        if (!step.part_id) {
            throw new Error('Part ID is missing in the motor step');
        }
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        logger.debug(`Part details: ${JSON.stringify(part)}`);
        if (typeof part.directionPin === 'undefined' || typeof part.pwmPin === 'undefined') {
            throw new Error(`Invalid pin configuration for part ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'motor_control.py');
        const args = [
            step.direction || 'forward',
            (typeof step.speed !== 'undefined' ? step.speed : 0).toString(),
            (typeof step.duration !== 'undefined' ? step.duration : 0).toString(),
            part.directionPin.toString(),
            part.pwmPin.toString()
        ];
        logger.debug(`Executing Python script: ${scriptPath} with args: ${args.join(', ')}`);
        const result = await new Promise((resolve, reject) => {
            logger.debug(`Spawning motor control process: ${scriptPath} ${args.join(' ')}`);
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';

            const motorControlTimeout = setTimeout(() => {
                logger.error('Motor control process timed out');
                process.kill();
                reject(new Error('Motor control process timed out'));
            }, 30000); // 30 seconds timeout, adjust as needed

            process.on('spawn', () => {
                logger.debug('Motor control process spawned');
            });

            process.on('error', (err) => {
                clearTimeout(motorControlTimeout);
                logger.error(`Error spawning motor control process: ${err}`);
                reject(new Error(`Failed to start motor control process: ${err}`));
            });

            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Motor control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Motor control error: ${data}`);
            });
            process.on('close', (code) => {
                clearTimeout(motorControlTimeout);
                logger.info(`Python script exited with code ${code}`);
                if (code === null) {
                    logger.error('Motor control process exited with code null');
                    reject(new Error('Motor control process exited with code null'));
                } else if (code === 0) {
                    logger.debug(`Raw motor control output: ${output}`);
                    try {
                        const jsonOutput = JSON.parse(output);
                        if (jsonOutput.logs) {
                            jsonOutput.logs.forEach(log => {
                                logger.info(`Motor control log: ${JSON.stringify(log)}`);
                            });
                        }
                        if (jsonOutput.result) {
                            resolve(jsonOutput.result);
                        } else {
                            reject(new Error(`No valid result found in output: ${output}`));
                        }
                    } catch (error) {
                        logger.error(`Failed to parse motor control output: ${output}. Error: ${error.message}`);
                        reject(new Error(`Failed to parse motor control output: ${output}. Error: ${error.message}`));
                    }
                } else {
                    logger.error(`Motor control process exited with code ${code}. Error: ${errorOutput}`);
                    reject(new Error(`Motor control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result || typeof result.success === 'undefined') {
            logger.error(`Motor control failed: ${result ? JSON.stringify(result) : 'Unknown error'}`);
            throw new Error(`Motor control failed: ${result ? JSON.stringify(result) : 'Unknown error'}`);
        }
        if (!result.success) {
            logger.error(`Motor control failed: ${result.error || 'Unknown error'}`);
            throw new Error(`Motor control failed: ${result.error || 'Unknown error'}`);
        }
        logger.info(`Motor step executed successfully: ${step.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing motor step: ${error.message}`);
        throw error;
    }
}

async function executeLinearActuator(step) {
    logger.info(`Executing linear actuator step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        const args = [
            step.direction,
            step.speed.toString(),
            step.duration.toString(),
            part.directionPin.toString(),
            part.pwmPin.toString()
        ];
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Linear actuator control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Linear actuator control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const jsonOutput = JSON.parse(output);
                        resolve(jsonOutput);
                    } catch (error) {
                        reject(new Error(`Failed to parse linear actuator control output: ${output}`));
                    }
                } else {
                    reject(new Error(`Linear actuator control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Linear actuator control failed: ${result.error}`);
        }
        logger.info(`Linear actuator step executed successfully: ${step.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing linear actuator step: ${error.message}`);
        throw error;
    }
}

async function executeServo(step) {
    logger.info(`Executing servo step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
        const args = [
            step.angle.toString(),
            step.speed.toString(),
            step.duration.toString(),
            part.pwmPin.toString()
        ];
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Servo control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Servo control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const jsonOutput = JSON.parse(output);
                        resolve(jsonOutput);
                    } catch (error) {
                        reject(new Error(`Failed to parse servo control output: ${output}`));
                    }
                } else {
                    reject(new Error(`Servo control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Servo control failed: ${result.error}`);
        }
        logger.info(`Servo step executed successfully: ${step.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing servo step: ${error.message}`);
        throw error;
    }
}

async function executeLight(step) {
    logger.info(`Executing light step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
        const args = [
            step.state,
            step.duration.toString(),
            part.gpioPin.toString()
        ];
        if (step.type === 'led') {
            args.push(step.brightness.toString());
        }
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Light control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Light control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const jsonOutput = JSON.parse(output);
                        resolve(jsonOutput);
                    } catch (error) {
                        reject(new Error(`Failed to parse light control output: ${output}`));
                    }
                } else {
                    reject(new Error(`Light control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Light control failed: ${result.error}`);
        }
        logger.info(`Light step executed successfully: ${step.name}`);
        return true;
    } catch (error) {
        logger.error(`Error executing light step: ${error.message}`);
        throw error;
    }
}

async function executeSensor(step) {
    logger.info(`Executing sensor step: ${step.name}`);
    try {
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sensor_control.py');
        const args = [
            part.gpioPin.toString(),
            step.timeout.toString()
        ];
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Sensor control output: ${data}`);
                if (data.toString().includes('Motion detected')) {
                    process.kill();
                    resolve({ success: true, message: 'Motion detected' });
                }
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Sensor control error: ${data}`);
            });
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        const jsonOutput = JSON.parse(output);
                        resolve(jsonOutput);
                    } catch (error) {
                        reject(new Error(`Failed to parse sensor control output: ${output}`));
                    }
                } else {
                    reject(new Error(`Sensor control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Sensor control failed: ${result.error}`);
        }
        logger.info(`Sensor step executed successfully: ${step.name}`);
        return result.message === 'Motion detected';
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
