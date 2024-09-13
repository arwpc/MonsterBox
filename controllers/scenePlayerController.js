// File: controllers/scenePlayerController.js

const sceneService = require('../services/sceneService');
const partService = require('../services/partService');
const soundService = require('../services/soundService');
const { spawn } = require('child_process');
const path = require('path');

let soundPlayerProcess = null;
let runningProcesses = [];

function startSoundPlayer() {
    if (!soundPlayerProcess) {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
        soundPlayerProcess = spawn('python3', [scriptPath]);

        soundPlayerProcess.stdout.on('data', (data) => {
            console.log(`Sound player output: ${data}`);
        });

        soundPlayerProcess.stderr.on('data', (data) => {
            console.error(`Sound player error: ${data}`);
        });

        soundPlayerProcess.on('close', (code) => {
            console.log(`Sound player exited with code ${code}`);
            soundPlayerProcess = null;
        });
    }
}

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

        startSoundPlayer();

        let concurrentSteps = [];
        for (let i = startStep; i < scene.steps.length; i++) {
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
        res.end();
    },

    stopScene: async (req, res) => {
        console.log('Stopping all steps and terminating processes');
        
        // Stop sound player
        if (soundPlayerProcess) {
            soundPlayerProcess.stdin.write("EXIT\n");
            soundPlayerProcess.kill();
            soundPlayerProcess = null;
        }

        // Terminate all running processes
        runningProcesses.forEach(process => {
            if (process.kill) {
                process.kill();
            }
        });
        runningProcesses = [];

        res.json({ message: 'All steps stopped and processes terminated' });
    }
};

async function executeStep(step, sendEvent) {
    console.log('Executing step:', step);
    sendEvent({ message: `Starting execution of ${step.type} step: ${step.name}` });

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
}

async function executeSound(step, sendEvent) {
    const sound = await soundService.getSoundById(step.sound_id);
    if (!sound) {
        throw new Error(`Sound not found for ID: ${step.sound_id}`);
    }

    const filePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);

    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            reject(new Error('Sound player not started'));
            return;
        }

        const command = `PLAY|${sound.id}|${filePath}\n`;
        soundPlayerProcess.stdin.write(command);

        sendEvent({ message: `Sound started: ${sound.name}` });

        if (step.concurrent) {
            resolve();
        } else {
            const listener = (data) => {
                const output = data.toString().trim();
                try {
                    const jsonOutput = JSON.parse(output);
                    if (jsonOutput.status === 'finished' && jsonOutput.sound_id === sound.id.toString()) {
                        soundPlayerProcess.stdout.removeListener('data', listener);
                        sendEvent({ message: `Sound completed: ${sound.name}` });
                        resolve();
                    }
                } catch (e) {
                    // Not JSON or not relevant, ignore
                }
            };

            soundPlayerProcess.stdout.on('data', listener);
        }
    });
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
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'motor_control.py');
            args = [step.direction, step.speed.toString(), step.duration.toString(), part.directionPin.toString(), part.pwmPin.toString()];
            break;
        case 'led':
        case 'light':
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'light_control.py');
            args = [part.gpioPin.toString(), step.state, step.duration.toString()];
            if (part.type === 'led') {
                args.push(step.brightness.toString());
            }
            break;
        case 'servo':
            scriptPath = path.resolve(__dirname, '..', 'scripts', 'servo_control.py');
            args = [part.gpioPin.toString(), step.angle.toString(), part.pwmFrequency.toString(), part.dutyCycle.toString(), step.duration.toString()];
            break;
        default:
            throw new Error(`Unsupported part type: ${part.type}`);
    }

    return new Promise((resolve, reject) => {
        const process = spawn('python3', [scriptPath, ...args]);
        runningProcesses.push(process);

        process.stdout.on('data', (data) => {
            sendEvent({ message: `${part.type} output: ${data}` });
        });

        process.stderr.on('data', (data) => {
            sendEvent({ error: `${part.type} error: ${data}` });
        });

        process.on('close', (code) => {
            const index = runningProcesses.indexOf(process);
            if (index > -1) {
                runningProcesses.splice(index, 1);
            }
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

    const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sensor_control.py');
    const args = [part.gpioPin.toString(), step.timeout.toString()];

    return new Promise((resolve, reject) => {
        const process = spawn('python3', [scriptPath, ...args]);
        runningProcesses.push(process);

        process.stdout.on('data', (data) => {
            sendEvent({ message: `Sensor output: ${data}` });
        });

        process.stderr.on('data', (data) => {
            sendEvent({ error: `Sensor error: ${data}` });
        });

        process.on('close', (code) => {
            const index = runningProcesses.indexOf(process);
            if (index > -1) {
                runningProcesses.splice(index, 1);
            }
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
