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
            const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
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
            let stderrBuffer = '';

            soundPlayerProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                console.log(`Raw stdout: ${data.toString()}`);
                let lines = stdoutBuffer.split('\n');
                while (lines.length > 1) {
                    let line = lines.shift();
                    console.log(`Sound player output: ${line}`);
                    try {
                        const jsonOutput = JSON.parse(line);
                        if (jsonOutput.status === 'ready') {
                            console.log('Sound player is ready');
                            resolve();
                        } else if (jsonOutput.status === 'finished') {
                            console.log(`Emitting soundFinished event for ${jsonOutput.sound_id}`);
                            playStatus = {
                                [jsonOutput.sound_id]: jsonOutput.status
                            };
                            eventEmitter.emit('soundFinished', jsonOutput.sound_id);
                        } else if (jsonOutput.status === 'error') {
                            console.error(`Sound player error: ${JSON.stringify(jsonOutput)}`);
                        } else if (jsonOutput.messageId !== undefined) {
                            const queueItem = messageQueue.get(jsonOutput.messageId);
                            if (queueItem) {
                                const { resolve } = queueItem;
                                messageQueue.delete(jsonOutput.messageId);
                                resolve(jsonOutput);
                            } else {
                                console.warn(`Received response for unknown messageId: ${jsonOutput.messageId}`);
                            }
                        }
                    } catch (error) {
                        console.log(`Non-JSON output from sound player: ${line}`);
                    }
                }
                stdoutBuffer = lines.join('\n');
            });

            soundPlayerProcess.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
                console.error(`Sound player stderr: ${data.toString()}`);
            });

            soundPlayerProcess.on('error', (error) => {
                console.error(`Failed to start sound player: ${error.message}`);
                reject(error);
            });

            soundPlayerProcess.on('close', (code) => {
                console.log(`Sound player exited with code ${code}`);
                if (stderrBuffer) {
                    console.error(`Sound player stderr buffer: ${stderrBuffer}`);
                }
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
        
        messageQueue.set(id, { 
            resolve: (response) => {
                console.log(`Received response for command ${id}: ${JSON.stringify(response)}`);
                resolve(response);
            }, 
            reject 
        });
        
        soundPlayerProcess.stdin.write(fullCommand, (error) => {
            if (error) {
                console.error(`Error sending command: ${error.message}`);
                messageQueue.delete(id);
                reject(error);
            } else {
                soundPlayerProcess.stdout.once('data', (data) => {
                    let stdoutBuffer = data.toString();
                    try {
                        if (messageQueue.has(id)) {
                            messageQueue.delete(id);
                            let lines = stdoutBuffer.split('\n');
                            while (lines.length > 1) {
                                let line = lines.shift();
                                console.log(`Sound player output from Command: ${line}`);
                                const jsonOutput = JSON.parse(line);
                                if(jsonOutput.status === 'stopped' || jsonOutput.status === 'finished' || jsonOutput.status === 'not_found') {
                                    playStatus = {
                                        [jsonOutput.sound_id]: jsonOutput.status
                                    }
                                }
                                resolve(jsonOutput);
                            }
                        }
                    } catch (error) {
                        resolve({
                            status: 'error',
                            message: `Command output Err: ${error.message}`
                        });
                    }
                });
            }
        });
    });
}

function playSound(soundId, filePath) {
    playStatus = {[soundId]: ''};
    console.log(`Attempting to play sound: ${soundId}, file: ${filePath}`);
    return sendCommand(`PLAY|${soundId}|${filePath}`)
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
    return sendCommand(`STOP|${soundId}`);
}

function stopAllSounds() {
    console.log('Attempting to stop all sounds');
    return sendCommand('STOP_ALL');
}

function getSoundStatus(soundId) {
    console.log(`Checking status of sound: ${soundId}`);
    // return sendCommand(`STATUS|${soundId}`)
    //     .then(response => {
    //         console.log(`Get sound status response: ${JSON.stringify(response)}`);
    //         return response;
    //     })
    //     .catch(error => {
    //         console.error(`Error getting sound status: ${error.message}`);
    //         throw error;
    //     });
    sendCommand(`STATUS|${soundId}`);
    return {
        status: playStatus[soundId]
    };
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
        }, 10000); // 10 second timeout

        const finishListener = (finishedSoundId) => {
            if (finishedSoundId === soundId) {
                clearTimeout(timeout);
                resolve();
            }
        };

        eventEmitter.on('soundFinished', finishListener);

        // Check if the sound has already finished
        getSoundStatus(soundId).then(status => {
            if (status.status !== 'playing') {
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
