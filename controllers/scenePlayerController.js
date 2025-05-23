const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const voiceService = require('../services/voiceService');
const soundController = require('./soundController');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../scripts/logger');
const fs = require('fs');
const axios = require('axios');
const { standardizeMP3 } = require('../scripts/audioUtils');

let isExecuting = false;
let currentSceneState = {};
let res = null;
let activeProcesses = new Set();

const SOUND_CHECK_INTERVAL = 50; // 50ms interval for checking sound status
const INTER_STEP_DELAY = 100; // 100ms delay between steps
const SERVO_MOVEMENT_TIMEOUT = 15000; // 15 second timeout for servo movement
const SOUND_TIMEOUT = 30000; // 30 second timeout for sound playback

const stopAllParts = async () => {
    logger.info('Stopping all parts');
    // Gracefully terminate all active processes
    for (const process of activeProcesses) {
        try {
            process.kill('SIGTERM');
        } catch (error) {
            logger.error(`Error stopping process: ${error.message}`);
        }
    }
    activeProcesses.clear();
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

        // Send initial message to establish SSE connection
        sendSSEMessage(res, { message: 'SSE connection established' });
        logger.info('Sent initial SSE message');

        // Start scene execution in the background
        try {
            logger.info('Starting scene execution');
            await executeScene(scene, startStep, res);
        } catch (error) {
            logger.error(`Error during scene execution:`, error);
            try {
                sendSSEMessage(res, { error: `Scene execution failed: ${error.message}` });
            } catch (sendError) {
                logger.error(`Error sending error message: ${sendError.message}`);
            }
        }

        // Keep the connection open
        req.on('close', () => {
            logger.info('Client closed the connection');
            stopAllParts().catch(error => {
                logger.error(`Error stopping parts on connection close: ${error.message}`);
            });
        });
    },

    getSceneStatus: (req, res) => {
        res.json(currentSceneState);
    },

    stopScene: (req, res) => {
        const sceneId = req.params.id;
        logger.info(`Stopping scene ${sceneId}`);
        isExecuting = false;
        
        // Respond to client immediately
        res.json({ message: 'Scene stopping initiated' });
        
        // Then perform cleanup asynchronously
        setTimeout(() => {
            try {
                // Stop all parts without waiting
                stopAllParts().catch(error => {
                    logger.debug(`Non-critical error stopping parts: ${error.message}`);
                });
                
                // Stop all sounds without waiting
                soundController.stopAllSounds().catch(error => {
                    logger.debug(`Non-critical error stopping sounds: ${error.message}`);
                });
                
                logger.info(`Scene ${sceneId} stop processing initiated`);
            } catch (error) {
                logger.warn(`Non-critical error during scene cleanup: ${error.message}`);
            }
        }, 0);
    }
};

function sendSSEMessage(res, data) {
    try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
        logger.error(`Error sending SSE message: ${error.message}`);
    }
}

async function executeScene(scene, startStep, res) {
    logger.info(`Starting execution of scene ${scene.id} from step ${startStep}`);
    isExecuting = true;

    try {
        await soundController.startSoundPlayer();
        logger.info('Sound player started successfully');

        const concurrentSteps = [];
        for (let i = startStep; i < scene.steps.length && isExecuting; i++) {
            const step = scene.steps[i];
            currentSceneState.currentStep = i;
            const message = `Executing step ${i + 1}: ${step.name}`;
            currentSceneState.messages.push(message);
            
            try {
                // Send SSE update immediately
                sendSSEMessage(res, { message, currentStep: i });
                logger.debug(`Sent SSE update for step ${i + 1}`);

                // Skip delay for sound-only scenes with one step
                const isSingleSoundScene = scene.steps.length === 1 && step.type === 'sound';
                
                if (step.concurrent === "on") {
                    // Start concurrent step immediately and don't wait for it to finish
                    // This allows sounds to play in parallel with subsequent steps
                    logger.info(`Starting concurrent step: ${step.name}`);
                    executeStep(scene.id, step).catch(error => {
                        logger.warn(`Non-critical error in concurrent step: ${error.message}`);
                    });
                    // Don't add to concurrentSteps to avoid waiting for it later
                    // Just continue to the next step immediately
                } else {
                    // For non-concurrent steps, execute and wait for completion before moving on
                    await executeStep(scene.id, step);
                }

                // Only add delay between steps if not the last step and not a single sound scene
                const isLastStep = i === scene.steps.length - 1;
                if (!isLastStep && !isSingleSoundScene) {
                    // Shorter delay (100ms) instead of the default longer delay
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                logger.error(`Error executing step ${i + 1}: ${error.message}`);
                // Don't throw error, continue with next step
            }
        }

        // We no longer wait for concurrent steps at all - they run independently
        // Background sounds will continue playing until stopped explicitly or scene ends

        currentSceneState.isCompleted = true;
        const completionMessage = 'Scene execution completed';
        currentSceneState.messages.push(completionMessage);
        
        try {
            sendSSEMessage(res, { message: completionMessage, event: 'scene_end' });
            logger.info('Sent final SSE update with scene_end event');
        } catch (error) {
            logger.error(`Error sending completion message: ${error.message}`);
        }
    } catch (error) {
        logger.error(`Error during scene ${scene.id} execution:`, error);
        currentSceneState.error = `Scene execution failed: ${error.message}`;
        
        try {
            sendSSEMessage(res, { error: currentSceneState.error, event: 'scene_end' });
        } catch (sendError) {
            logger.error(`Error sending error message: ${sendError.message}`);
        }
    } finally {
        isExecuting = false;
        
        // Send the completion message first so the UI can update immediately
        try {
            const cleanupMessage = 'Scene cleanup completed';
            currentSceneState.messages.push(cleanupMessage);
            sendSSEMessage(res, { message: cleanupMessage, event: 'scene_end' });
        } catch (error) {
            logger.error(`Error sending cleanup message: ${error.message}`);
        }
        
        // Then clean up asynchronously without waiting
        setTimeout(async () => {
            try {
                // Non-blocking - just fire the request to stop all parts
                stopAllParts().catch(error => {
                    logger.warn(`Non-critical error stopping parts during cleanup: ${error.message}`);
                });
                
                // Also try to stop all sounds without waiting for the response
                try {
                    soundController.stopAllSounds().catch(error => {
                        logger.warn(`Non-critical error stopping sounds during cleanup: ${error.message}`);
                    });
                } catch (error) {
                    logger.warn(`Error stopping sounds during cleanup: ${error.message}`);
                }
                
                logger.info(`Scene ${scene.id} cleanup initiated`);
            } catch (error) {
                logger.warn(`Non-critical error during scene cleanup: ${error.message}`);
            }
        }, 0); // Run on next event loop iteration
    }
}

async function executeStep(sceneId, step) {
    logger.debug(`Executing step: ${JSON.stringify(step)}`);
    switch (step.type) {
        case 'sound':
        case 'voice':  // Voice steps are just sound files - use same execution path
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
            logger.warn(`Sound not found for ID: ${step.sound_id}, skipping step`);
            return true;
        }
        
        // Get the absolute path to the sound file
        const absolutePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);
        
        // Verify file exists
        if (!fs.existsSync(absolutePath)) {
            logger.error(`Sound file not found at path: ${absolutePath}`);
            return true;
        }
        
        try {
            // If it's a scene playback, apply ultra-fast path for sounds
            const isScenePlayback = true; // We're always in a scene context here
            
            // Fast path: Start the sound playing
            await soundController.playSound(sound.id, absolutePath);
            logger.info(`Sound started playing: ${sound.name}`);

            // For concurrent sounds, we return immediately after starting the sound
            // This allows the sound to play in the background while other steps execute
            if (step.concurrent === "on") {
                logger.info(`Sound ${sound.name} (ID: ${sound.id}) playing concurrently in background`);
                return true;
            }
            
            // For non-concurrent sounds, use ultra-optimized waiting
            // Get the duration from playStatus
            const duration = soundController.getStoredSoundDuration(sound.id) || 5; // Default 5s if unknown
            
            // For scene playback, use a much faster approach based purely on duration
            if (isScenePlayback) {
                // For ultra-optimized scene playback, significantly reduce wait times
                // For very short sounds (5 seconds or less), wait minimal time with slightly longer for longer sounds
                const isShortSound = duration <= 5;
                const waitTime = isShortSound ? 
                    Math.max(duration * 500, 500) : // For short sounds, wait just 50% of duration, minimum 0.5s
                    Math.min(Math.max(duration * 700, 1000), 4000); // For longer sounds, 70% with max 4s
                
                logger.debug(`Using hyper-optimized path for sound ${sound.id} (${duration}s) - waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else if (duration && duration < 3) {
                // For very short sounds, use simple timeout
                logger.debug(`Sound is short (${duration}s), using optimized timing`);
                await new Promise(resolve => setTimeout(resolve, (duration * 1000) + 300));
            } else {
                // For longer sounds outside scene context, use the standard waiting mechanism
                await soundController.waitForSoundToFinish(sound.id);
            }
        } catch (error) {
            // Log but ignore play errors
            logger.warn(`Non-critical error playing sound: ${error.message}`);
        }

        logger.info(`Sound step completed: ${step.name}`);
        return true;
    } catch (error) {
        // Log but continue execution
        logger.warn(`Non-critical error in sound step: ${error.message}`);
        return true;
    }
}

async function waitForSoundCompletion(soundId) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let lastStatus = null;

        const checkInterval = setInterval(async () => {
            try {
                // Check for timeout
                if (Date.now() - startTime > SOUND_TIMEOUT) {
                    clearInterval(checkInterval);
                    try {
                        await soundController.stopSound(soundId);
                    } catch (error) {
                        logger.warn(`Non-critical error stopping sound on timeout: ${error.message}`);
                    }
                    resolve(); // Resolve instead of reject
                    return;
                }

                const status = await soundController.getSoundStatus(soundId);

                // Only log if status has changed
                if (lastStatus !== status.status) {
                    logger.info(`Sound ${soundId} status: ${status.status}`);
                    lastStatus = status.status;
                }

                if (status.status === 'stopped' || status.status === 'finished' || status.status === 'not_found') {
                    clearInterval(checkInterval);
                    logger.info(`Sound finished playing: ${soundId}`);
                    try {
                        await soundController.stopSound(soundId);
                    } catch (error) {
                        logger.warn(`Non-critical error stopping sound: ${error.message}`);
                    }
                    resolve();
                }
            } catch (error) {
                // Log but continue checking
                logger.warn(`Non-critical error checking sound status: ${error.message}`);
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
        let part;
        try {
            part = await partService.getPartById(step.part_id);
        } catch (error) {
            throw new Error(`Failed to get part: ${error.message}`);
        }
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
            const process = spawn('python3', [scriptPath, ...args]);
            activeProcesses.add(process);
            let output = '';
            let errorOutput = '';

            process.on('spawn', () => {
                logger.debug('Motor control process spawned');
            });

            process.on('error', (err) => {
                logger.error(`Error spawning motor control process: ${err}`);
                activeProcesses.delete(process);
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
                activeProcesses.delete(process);
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
        let part;
        try {
            part = await partService.getPartById(step.part_id);
        } catch (error) {
            throw new Error(`Failed to get part: ${error.message}`);
        }
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'linear_actuator_control.py');
        const args = [
            step.direction,
            step.speed.toString(),
            step.duration.toString(),
            part.directionPin.toString(),
            part.pwmPin.toString(),
            part.maxExtension.toString(),
            part.maxRetraction.toString()
        ];
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            activeProcesses.add(process);
            let output = '';
            let errorOutput = '';
            process.stdout.on('data', (data) => {
                output += data.toString();
                logger.debug(`Linear actuator control output: ${data}`);
            });
            process.stderr.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (!line.trim()) return;
                    try {
                        const logData = JSON.parse(line);
                        // Log with appropriate level based on the JSON data
                        if (logData.level === 'info') {
                            logger.info(`Linear actuator control: ${logData.message}`);
                        } else if (logData.level === 'debug') {
                            logger.debug(`Linear actuator control: ${logData.message}`);
                        } else if (logData.level === 'error') {
                            logger.error(`Linear actuator control: ${logData.message}`);
                            errorOutput += logData.message + '\n';
                        }
                    } catch (e) {
                        // If not JSON, treat as error
                        logger.error(`Linear actuator control error: ${line}`);
                        errorOutput += line + '\n';
                    }
                });
            });
            process.on('close', (code) => {
                activeProcesses.delete(process);
                if (code === 0) {
                    try {
                        if (output.includes('SUCCESS:')) {
                            resolve({ success: true });
                        } else {
                            const jsonOutput = JSON.parse(output);
                            resolve(jsonOutput);
                        }
                    } catch (error) {
                        reject(new Error(`Failed to parse linear actuator control output: ${output}`));
                    }
                } else {
                    reject(new Error(`Linear actuator control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Linear actuator control failed: ${result.error || 'Unknown error'}`);
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
        if (!step.part_id) {
            throw new Error('Part ID is missing in the servo step');
        }
        
        let part;
        try {
            part = await partService.getPartById(step.part_id);
        } catch (error) {
            throw new Error(`Failed to get part: ${error.message}`);
        }
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }

        if (typeof step.angle === 'undefined' || step.angle === null) {
            throw new Error('Angle is required for servo control');
        }
        if (typeof step.duration === 'undefined' || step.duration === null) {
            throw new Error('Duration is required for servo control');
        }

        const angle = parseFloat(step.angle);
        const duration = parseFloat(step.duration) / 1000;

        if (isNaN(angle)) {
            throw new Error('Invalid angle value');
        }
        if (isNaN(duration)) {
            throw new Error('Invalid duration value');
        }

        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
        const controlType = part.usePCA9685 ? 'pca9685' : 'gpio';
        const pinOrChannel = part.usePCA9685 ? part.channel.toString() : part.pin.toString();

        const args = [
            'test',
            controlType,
            pinOrChannel,
            angle.toString(),
            duration.toString(),
            part.servoType || 'Standard',
            step.part_id.toString()
        ];

        logger.debug(`Executing servo_control.py with args: ${args.join(', ')}`);
        
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            activeProcesses.add(process);
            let output = '';
            let errorOutput = '';
            let movementStarted = false;
            let movementCompleted = false;

            const cleanup = () => {
                activeProcesses.delete(process);
                try {
                    process.kill('SIGTERM');
                } catch (error) {
                    logger.error(`Error killing servo process: ${error.message}`);
                }
            };

            process.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                lines.forEach(line => {
                    if (!line.trim()) return;
                    
                    try {
                        const jsonData = JSON.parse(line);
                        logger.debug(`Servo JSON output: ${JSON.stringify(jsonData)}`);
                        
                        if (jsonData.status === 'info') {
                            if (jsonData.message === 'Movement started') {
                                movementStarted = true;
                            } else if (jsonData.message === 'Movement completed') {
                                movementCompleted = true;
                                cleanup();
                                resolve({ success: true });
                            }
                        } else if (jsonData.status === 'success') {
                            if (!movementCompleted) {
                                movementCompleted = true;
                                cleanup();
                                resolve({ success: true });
                            }
                        } else if (jsonData.status === 'error') {
                            cleanup();
                            reject(new Error(jsonData.message));
                        }
                    } catch (e) {
                        output += line + '\n';
                    }
                });
            });

            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
                logger.error(`Servo control error: ${data}`);
            });

            process.on('error', (error) => {
                cleanup();
                reject(new Error(`Servo process error: ${error.message}`));
            });

            process.on('close', (code) => {
                cleanup();
                if (code === 0 && (movementStarted || movementCompleted)) {
                    if (!movementCompleted) {
                        resolve({ success: true });
                    }
                } else if (!movementStarted && !movementCompleted) {
                    reject(new Error(`Servo control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });

            setTimeout(() => {
                if (!movementStarted) {
                    cleanup();
                    reject(new Error('Servo movement failed to start within timeout'));
                }
            }, SERVO_MOVEMENT_TIMEOUT);
        });

        if (!result.success) {
            throw new Error(`Servo control failed: ${result.error || 'Unknown error'}`);
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
        let part;
        try {
            part = await partService.getPartById(step.part_id);
        } catch (error) {
            throw new Error(`Failed to get part: ${error.message}`);
        }
        if (!part) {
            throw new Error(`Part not found for ID: ${step.part_id}`);
        }
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
        const args = [
            part.gpioPin.toString(),
            step.state,
            step.duration ? step.duration.toString() : '0'
        ];
        if (step.type === 'led') {
            args.push(step.brightness.toString());
        }
        const result = await new Promise((resolve, reject) => {
            const process = spawn('python3', [scriptPath, ...args]);
            activeProcesses.add(process);
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
                activeProcesses.delete(process);
                if (code === 0) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`Light control process exited with code ${code}. Error: ${errorOutput}`));
                }
            });
        });
        if (!result.success) {
            throw new Error(`Light control failed: ${result.error || 'Unknown error'}`);
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
        let part;
        try {
            part = await partService.getPartById(step.part_id);
        } catch (error) {
            throw new Error(`Failed to get part: ${error.message}`);
        }
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
            activeProcesses.add(process);
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
                activeProcesses.delete(process);
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
