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
let res = null;

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

        // Set up SSE
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Start scene execution in the background
        executeScene(scene, startStep, res);
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

async function executeScene(scene, startStep, res) {
    logger.info(`Starting execution of scene ${scene.id} from step ${startStep}`);
    isExecuting = true;

    try {
        await soundController.startSoundPlayer();

        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            currentSceneState.currentStep = i;
            const message = `Executing step ${i + 1}: ${step.name}`;
            currentSceneState.messages.push(message);
            
            // Send SSE update
            res.write(`data: ${JSON.stringify({ message, currentStep: i })}\n\n`);

            try {
                await executeStep(scene.id, step);
            } catch (stepError) {
                logger.error(`Error executing step ${i + 1}: ${stepError.message}`);
                res.write(`data: ${JSON.stringify({ error: `Error in step ${i + 1}: ${stepError.message}` })}\n\n`);
                // Continue with the next step instead of stopping the entire scene
                continue;
            }

            if (step.type === 'sound' && !step.concurrent) {
                await new Promise(resolve => setTimeout(resolve, step.duration));
            }
        }

        currentSceneState.isCompleted = true;
        const completionMessage = 'Scene execution completed';
        currentSceneState.messages.push(completionMessage);
        
        // Send final SSE update
        res.write(`data: ${JSON.stringify({ message: completionMessage, event: 'scene_end' })}\n\n`);
    } catch (error) {
        logger.error(`Error during scene ${scene.id} execution:`, error);
        currentSceneState.error = `Scene execution failed: ${error.message}`;
        
        // Send error SSE update
        res.write(`data: ${JSON.stringify({ error: currentSceneState.error })}\n\n`);
    } finally {
        isExecuting = false;
        await stopAllParts();
        await soundController.stopAllSounds();
        logger.info(`Scene ${scene.id} cleanup completed`);
        const cleanupMessage = 'Scene cleanup completed';
        currentSceneState.messages.push(cleanupMessage);
        
        // Send final cleanup SSE update
        res.write(`data: ${JSON.stringify({ message: cleanupMessage })}\n\n`);
        res.end();
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
        if (!step.part_id) {
            throw new Error('Part ID is missing in the motor step');
        }
        const part = await partService.getPartById(step.part_id);
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        if (typeof part.dir_pin === 'undefined' || typeof part.pwm_pin === 'undefined') {
            throw new Error(`Invalid pin configuration for part ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'motor_control.py');
        const args = [
            step.direction || 'forward',
            (typeof step.speed !== 'undefined' ? step.speed : 0).toString(),
            (typeof step.duration !== 'undefined' ? step.duration : 0).toString(),
            part.dir_pin.toString(),
            part.pwm_pin.toString()
        ];
        logger.debug(`Executing Python script: ${scriptPath} with args: ${args.join(', ')}`);
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Motor control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Motor control error: ${data}`);
            });
            process.on('close', (code) => {
                logger.info(`Python script exited with code ${code}`);
                if (code === 0) {
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
            part.dir_pin.toString(),
            part.pwm_pin.toString()
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
            part.pwm_pin.toString()
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
            part.pin.toString()
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
            part.pin.toString(),
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