const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

let soundPlayerProcess = null;
const messageQueue = new Map();
let messageId = 0;
const eventEmitter = new EventEmitter();
let playStatus = {};

const COMMAND_TIMEOUT = 15000; // Increased timeout to 15 seconds

function setupAudioEnvironment() {
    const env = { ...process.env };

    if (os.platform() !== 'win32') {
        // Unix-like systems
        const isRoot = process.getuid && process.getuid() === 0;
        const uid = isRoot ? parseInt(process.env.SUDO_UID || process.getuid()) : (process.getuid && process.getuid());

        if (uid) {
            const xdgRuntimeDir = `/run/user/${uid}`;
            env.XDG_RUNTIME_DIR = xdgRuntimeDir;
            
            // Set ALSA as the default audio driver
            env.SDL_AUDIODRIVER = 'alsa';
        }
    }

    env.PYTHONUNBUFFERED = '1';

    return env;
}

function startSoundPlayer() {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            // Normalize script path for Python
            const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py').replace(/\\/g, '/');
            console.log(`Starting sound player: ${scriptPath}`);
            console.log(`Current working directory: ${process.cwd()}`);
            
            const env = setupAudioEnvironment();
            console.log(`Environment: ${JSON.stringify(env)}`);
            
            let spawnOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: env
            };

            // If running as root on Unix-like systems, switch to the original user
            if (os.platform() !== 'win32' && process.getuid && process.getuid() === 0 && process.env.SUDO_UID && process.env.SUDO_GID) {
                spawnOptions.uid = parseInt(process.env.SUDO_UID);
                spawnOptions.gid = parseInt(process.env.SUDO_GID);
            }
            
            console.log('Spawning sound player process...');
            soundPlayerProcess = spawn('python3', [scriptPath], spawnOptions);

            console.log(`Sound player process PID: ${soundPlayerProcess.pid}`);

            let stdoutBuffer = '';

            soundPlayerProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                console.log(`Raw stdout: ${data.toString()}`);
                let lines = stdoutBuffer.split('\n');
                while (lines.length > 1) {
                    let line = lines.shift();
                    if (!line.trim()) continue;
                    
                    console.log(`Sound player output: ${line}`);
                    try {
                        const jsonOutput = JSON.parse(line);
                        
                        // Handle ready status
                        if (jsonOutput.status === 'ready') {
                            console.log('Sound player is ready');
                            resolve();
                        }
                        
                        // Handle finished status
                        if (jsonOutput.status === 'finished') {
                            console.log(`Emitting soundFinished event for ${jsonOutput.sound_id}`);
                            playStatus[jsonOutput.sound_id] = 'finished';
                            eventEmitter.emit('soundFinished', jsonOutput.sound_id);
                        }
                        
                        // Handle message queue responses
                        if (jsonOutput.messageId !== undefined) {
                            const queueItem = messageQueue.get(jsonOutput.messageId);
                            if (queueItem) {
                                const { resolve } = queueItem;
                                messageQueue.delete(jsonOutput.messageId);
                                
                                // Update playStatus if status is included
                                if (jsonOutput.status && jsonOutput.sound_id) {
                                    playStatus[jsonOutput.sound_id] = jsonOutput.status;
                                }
                                
                                resolve(jsonOutput);
                            }
                        }
                        
                        // Update playStatus for any status updates
                        if (jsonOutput.status && jsonOutput.sound_id) {
                            playStatus[jsonOutput.sound_id] = jsonOutput.status;
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
                reject(error);
            });

            soundPlayerProcess.on('close', (code) => {
                console.log(`Sound player exited with code ${code}`);
                soundPlayerProcess = null;
                reject(new Error(`Sound player process exited unexpectedly with code ${code}`));
            });
        } else {
            resolve();
        }
    });
}

function sendCommand(command) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            console.error('Sound player is not running');
            reject(new Error('Sound player is not running'));
            return;
        }

        const id = messageId++;
        const fullCommand = `${id}|${command}\n`;
        console.log(`Sending command: ${fullCommand.trim()}`);
        
        const timeoutId = setTimeout(() => {
            if (messageQueue.has(id)) {
                messageQueue.delete(id);
                reject(new Error('Command timed out'));
            }
        }, COMMAND_TIMEOUT);

        messageQueue.set(id, { 
            resolve: (response) => {
                clearTimeout(timeoutId);
                console.log(`Received response for command ${id}: ${JSON.stringify(response)}`);
                resolve(response);
            },
            reject: (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
        
        soundPlayerProcess.stdin.write(fullCommand, (error) => {
            if (error) {
                clearTimeout(timeoutId);
                console.error(`Error sending command: ${error.message}`);
                messageQueue.delete(id);
                reject(error);
            }
        });
    });
}

function playSound(soundId, filePath) {
    playStatus[soundId] = 'playing';
    // Normalize file path for Python
    const normalizedPath = filePath.replace(/\\/g, '/');
    console.log(`Attempting to play sound: ${soundId}, file: ${normalizedPath}`);
    return sendCommand(`PLAY|${soundId}|${normalizedPath}`)
        .then(response => {
            console.log(`Play sound response: ${JSON.stringify(response)}`);
            return response;
        })
        .catch(error => {
            console.error(`Error playing sound: ${error.message}`);
            throw error;
        });
}

function stopSound(soundId) {
    console.log(`Attempting to stop sound: ${soundId}`);
    return sendCommand(`STOP|${soundId}`).then(response => {
        playStatus[soundId] = 'stopped';
        return response;
    });
}

function stopAllSounds() {
    console.log('Attempting to stop all sounds');
    return sendCommand('STOP_ALL').then(response => {
        playStatus = {};
        return response;
    });
}

async function getSoundStatus(soundId) {
    console.log(`Checking status of sound: ${soundId}`);
    try {
        const response = await sendCommand(`STATUS|${soundId}`);
        console.log(`Get sound status response: ${JSON.stringify(response)}`);
        
        // Update playStatus with the latest status
        if (response.status) {
            playStatus[soundId] = response.status;
        }
        
        return response;
    } catch (error) {
        console.error(`Error getting sound status: ${error.message}`);
        // Return last known status if command fails
        return {
            status: playStatus[soundId] || 'unknown',
            sound_id: soundId
        };
    }
}

function isSoundPlayerRunning() {
    const isRunning = soundPlayerProcess !== null && !soundPlayerProcess.killed;
    console.log(`Checking if sound player is running: ${isRunning}`);
    return isRunning;
}

function waitForSoundToFinish(soundId) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            eventEmitter.removeListener('soundFinished', finishListener);
            reject(new Error(`Timeout waiting for sound ${soundId} to finish`));
        }, COMMAND_TIMEOUT);

        const finishListener = (finishedSoundId) => {
            if (finishedSoundId === soundId) {
                clearTimeout(timeout);
                resolve();
            }
        };

        eventEmitter.once('soundFinished', finishListener);

        // Check if the sound has already finished
        getSoundStatus(soundId).then(status => {
            if (status.status === 'finished' || status.status === 'stopped' || status.status === 'not_found') {
                clearTimeout(timeout);
                eventEmitter.removeListener('soundFinished', finishListener);
                resolve();
            }
        }).catch(error => {
            clearTimeout(timeout);
            eventEmitter.removeListener('soundFinished', finishListener);
            reject(error);
        });
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
