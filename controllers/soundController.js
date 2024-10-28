const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

let soundPlayerProcess = null;
const messageQueue = new Map();
let messageId = 0;
const eventEmitter = new EventEmitter();
const soundStatuses = new Map(); // Track status of all sounds

const COMMAND_TIMEOUT = 5000; // 5 second timeout for commands

function setupAudioEnvironment() {
    const env = { ...process.env };

    if (os.platform() !== 'win32') {
        const isRoot = process.getuid && process.getuid() === 0;
        const uid = isRoot ? parseInt(process.env.SUDO_UID || process.getuid()) : (process.getuid && process.getuid());

        if (uid) {
            const xdgRuntimeDir = `/run/user/${uid}`;
            env.XDG_RUNTIME_DIR = xdgRuntimeDir;
            env.SDL_AUDIODRIVER = 'alsa';
        }
    }

    env.PYTHONUNBUFFERED = '1';
    return env;
}

function startSoundPlayer() {
    return new Promise((resolve, reject) => {
        if (soundPlayerProcess) {
            resolve();
            return;
        }

        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
        console.log(`Starting sound player: ${scriptPath}`);
        
        const env = setupAudioEnvironment();
        const spawnOptions = {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: env
        };

        if (os.platform() !== 'win32' && process.getuid && process.getuid() === 0 && process.env.SUDO_UID && process.env.SUDO_GID) {
            spawnOptions.uid = parseInt(process.env.SUDO_UID);
            spawnOptions.gid = parseInt(process.env.SUDO_GID);
        }
        
        soundPlayerProcess = spawn('python3', [scriptPath], spawnOptions);
        console.log(`Sound player process PID: ${soundPlayerProcess.pid}`);

        let stdoutBuffer = '';

        soundPlayerProcess.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            let lines = stdoutBuffer.split('\n');
            
            while (lines.length > 1) {
                let line = lines.shift();
                try {
                    const jsonOutput = JSON.parse(line);
                    console.log(`Sound player output: ${JSON.stringify(jsonOutput)}`);

                    if (jsonOutput.status === 'ready') {
                        resolve();
                    } else if (jsonOutput.status === 'finished' || jsonOutput.status === 'stopped') {
                        soundStatuses.set(jsonOutput.sound_id, jsonOutput.status);
                        eventEmitter.emit('soundFinished', jsonOutput.sound_id);
                    } else if (jsonOutput.messageId !== undefined) {
                        const queueItem = messageQueue.get(jsonOutput.messageId);
                        if (queueItem) {
                            messageQueue.delete(jsonOutput.messageId);
                            queueItem.resolve(jsonOutput);
                        }
                    }
                } catch (error) {
                    console.log(`Non-JSON output from sound player: ${line}`);
                }
            }
            stdoutBuffer = lines.join('\n');
        });

        soundPlayerProcess.stderr.on('data', (data) => {
            console.error(`Sound player stderr: ${data.toString()}`);
        });

        soundPlayerProcess.on('error', (error) => {
            console.error(`Failed to start sound player: ${error.message}`);
            soundPlayerProcess = null;
            reject(error);
        });

        soundPlayerProcess.on('close', (code) => {
            console.log(`Sound player exited with code ${code}`);
            soundPlayerProcess = null;
            if (code !== 0) {
                reject(new Error(`Sound player process exited with code ${code}`));
            }
        });

        // Set timeout for initial ready message
        setTimeout(() => {
            if (soundPlayerProcess && !messageQueue.size) {
                resolve();
            }
        }, COMMAND_TIMEOUT);
    });
}

function sendCommand(command) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            reject(new Error('Sound player is not running'));
            return;
        }

        const id = messageId++;
        const fullCommand = `${id}|${command}\n`;
        
        const timeoutId = setTimeout(() => {
            messageQueue.delete(id);
            resolve({ status: 'timeout', message: 'Command timed out' });
        }, COMMAND_TIMEOUT);

        messageQueue.set(id, {
            resolve: (response) => {
                clearTimeout(timeoutId);
                resolve(response);
            },
            reject: (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        });

        try {
            soundPlayerProcess.stdin.write(fullCommand, (error) => {
                if (error) {
                    clearTimeout(timeoutId);
                    messageQueue.delete(id);
                    reject(error);
                }
            });
        } catch (error) {
            clearTimeout(timeoutId);
            messageQueue.delete(id);
            reject(error);
        }
    });
}

async function playSound(soundId, filePath) {
    console.log(`Playing sound: ${soundId}, file: ${filePath}`);
    soundStatuses.set(soundId, 'playing');
    
    try {
        const response = await sendCommand(`PLAY|${soundId}|${filePath}`);
        console.log(`Play sound response: ${JSON.stringify(response)}`);
        return response;
    } catch (error) {
        console.error(`Error playing sound: ${error.message}`);
        soundStatuses.set(soundId, 'error');
        throw error;
    }
}

async function stopSound(soundId) {
    console.log(`Stopping sound: ${soundId}`);
    try {
        const response = await sendCommand(`STOP|${soundId}`);
        soundStatuses.set(soundId, 'stopped');
        return response;
    } catch (error) {
        console.error(`Error stopping sound: ${error.message}`);
        throw error;
    }
}

async function stopAllSounds() {
    console.log('Stopping all sounds');
    try {
        const response = await sendCommand('STOP_ALL');
        soundStatuses.clear();
        return response;
    } catch (error) {
        console.error(`Error stopping all sounds: ${error.message}`);
        return { status: 'error', message: error.message };
    }
}

function getSoundStatus(soundId) {
    return {
        status: soundStatuses.get(soundId) || 'not_found'
    };
}

function isSoundPlayerRunning() {
    return soundPlayerProcess !== null && !soundPlayerProcess.killed;
}

function waitForSoundToFinish(soundId) {
    return new Promise((resolve) => {
        const currentStatus = soundStatuses.get(soundId);
        if (currentStatus === 'finished' || currentStatus === 'stopped') {
            resolve();
            return;
        }

        const finishListener = (finishedSoundId) => {
            if (finishedSoundId === soundId) {
                eventEmitter.removeListener('soundFinished', finishListener);
                resolve();
            }
        };

        eventEmitter.once('soundFinished', finishListener);
    });
}

module.exports = {
    startSoundPlayer,
    playSound,
    stopSound,
    stopAllSounds,
    getSoundStatus,
    isSoundPlayerRunning,
    waitForSoundToFinish
};
