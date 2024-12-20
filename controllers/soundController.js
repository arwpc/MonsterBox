const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');
const logger = require('../scripts/logger');

let soundPlayerProcess = null;
const messageQueue = new Map();
let messageId = 0;
const eventEmitter = new EventEmitter();
let playStatus = {};

const COMMAND_TIMEOUT = 5000; // Reduced from 15s to 5s since we're relying on actual completion events
const STATUS_CHECK_INTERVAL = 100; // 100ms interval for status checks

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
            logger.info(`Starting sound player: ${scriptPath}`);
            logger.debug(`Current working directory: ${process.cwd()}`);
            
            const env = setupAudioEnvironment();
            logger.debug(`Environment: ${JSON.stringify(env)}`);
            
            let spawnOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: env
            };

            // If running as root on Unix-like systems, switch to the original user
            if (os.platform() !== 'win32' && process.getuid && process.getuid() === 0 && process.env.SUDO_UID && process.env.SUDO_GID) {
                spawnOptions.uid = parseInt(process.env.SUDO_UID);
                spawnOptions.gid = parseInt(process.env.SUDO_GID);
            }
            
            logger.info('Spawning sound player process...');
            soundPlayerProcess = spawn('python3', [scriptPath], spawnOptions);

            logger.debug(`Sound player process PID: ${soundPlayerProcess.pid}`);

            let stdoutBuffer = '';

            soundPlayerProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                logger.debug(`Raw stdout: ${data.toString()}`);
                let lines = stdoutBuffer.split('\n');
                while (lines.length > 1) {
                    let line = lines.shift();
                    if (!line.trim()) continue;
                    
                    logger.debug(`Sound player output: ${line}`);
                    try {
                        const jsonOutput = JSON.parse(line);
                        
                        // Handle ready status
                        if (jsonOutput.status === 'ready') {
                            logger.info('Sound player is ready');
                            resolve();
                        }
                        
                        // Handle finished status
                        if (jsonOutput.status === 'finished') {
                            logger.debug(`Emitting soundFinished event for ${jsonOutput.sound_id}`);
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
                            // Also emit status updates
                            eventEmitter.emit('statusUpdate', jsonOutput.sound_id, jsonOutput.status);
                        }
                        
                    } catch (error) {
                        logger.debug(`Non-JSON output from sound player: ${line}`);
                    }
                }
                stdoutBuffer = lines.join('\n');
            });

            soundPlayerProcess.stderr.on('data', (data) => {
                logger.debug(`Sound player stderr: ${data.toString()}`);
            });

            soundPlayerProcess.on('error', (error) => {
                logger.error(`Failed to start sound player: ${error.message}`);
                reject(error);
            });

            soundPlayerProcess.on('close', (code) => {
                logger.info(`Sound player exited with code ${code}`);
                soundPlayerProcess = null;
                // Clear all pending commands in the queue
                messageQueue.forEach(({ reject }) => {
                    reject(new Error('Sound player process closed'));
                });
                messageQueue.clear();
                reject(new Error(`Sound player process exited unexpectedly with code ${code}`));
            });

            // Set up a timeout for the initial ready message
            const readyTimeout = setTimeout(() => {
                reject(new Error('Timeout waiting for sound player to become ready'));
            }, COMMAND_TIMEOUT);

            // Clear the timeout when resolved
            const originalResolve = resolve;
            resolve = (...args) => {
                clearTimeout(readyTimeout);
                originalResolve(...args);
            };
        } else {
            resolve();
        }
    });
}

function sendCommand(command, timeout = COMMAND_TIMEOUT) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            logger.error('Sound player is not running');
            reject(new Error('Sound player is not running'));
            return;
        }

        const id = messageId++;
        const fullCommand = `${id}|${command}\n`;
        logger.debug(`Sending command: ${fullCommand.trim()}`);
        
        const timeoutId = setTimeout(() => {
            if (messageQueue.has(id)) {
                messageQueue.delete(id);
                // Use debug level for timeouts since they're expected
                logger.debug('Command timed out - this is normal for long-running sounds');
                reject(new Error('Command timed out'));
            }
        }, timeout);

        messageQueue.set(id, { 
            resolve: (response) => {
                clearTimeout(timeoutId);
                logger.debug(`Received response for command ${id}: ${JSON.stringify(response)}`);
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
                    logger.error(`Error sending command: ${error.message}`);
                    messageQueue.delete(id);
                    reject(error);
                }
            });
        } catch (error) {
            clearTimeout(timeoutId);
            logger.error(`Error sending command: ${error.message}`);
            messageQueue.delete(id);
            reject(error);
        }
    });
}

async function waitForStatus(soundId, targetStatus, timeout = COMMAND_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        // Check current status first
        if (playStatus[soundId] === targetStatus) {
            resolve();
            return;
        }

        const statusListener = (updatedSoundId, status) => {
            if (updatedSoundId === soundId && status === targetStatus) {
                clearInterval(checkInterval);
                clearTimeout(timeoutId);
                eventEmitter.removeListener('statusUpdate', statusListener);
                resolve();
            }
        };

        const timeoutId = setTimeout(() => {
            clearInterval(checkInterval);
            eventEmitter.removeListener('statusUpdate', statusListener);
            // Use debug level for timeouts since they're expected
            logger.debug(`Timeout waiting for sound ${soundId} to reach status ${targetStatus} - this is normal for long-running sounds`);
            resolve(); // Changed from reject to resolve to prevent delays
        }, timeout);

        // Listen for status updates
        eventEmitter.on('statusUpdate', statusListener);

        // Also poll status periodically
        const checkInterval = setInterval(async () => {
            if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                eventEmitter.removeListener('statusUpdate', statusListener);
                return;
            }

            try {
                const status = await getSoundStatus(soundId);
                if (status.status === targetStatus) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    eventEmitter.removeListener('statusUpdate', statusListener);
                    resolve();
                }
            } catch (error) {
                logger.debug(`Non-critical error checking sound status: ${error.message}`);
            }
        }, STATUS_CHECK_INTERVAL);
    });
}

async function playSound(soundId, filePath) {
    playStatus[soundId] = 'starting';
    
    // Verify file exists before attempting to play
    if (!fs.existsSync(filePath)) {
        logger.error(`Sound file not found: ${filePath}`);
        playStatus[soundId] = 'error';
        throw new Error(`Sound file not found: ${filePath}`);
    }
    
    logger.info(`Attempting to play sound: ${soundId}, file: ${filePath}`);
    
    try {
        // Send play command with the raw file path
        await sendCommand(`PLAY|${soundId}|${filePath}`);
        
        // Wait for playing status
        await waitForStatus(soundId, 'playing');
        
        logger.info(`Sound ${soundId} is now playing`);
        return { status: 'success', message: 'Sound playback started' };
    } catch (error) {
        // Only log as error if it's not a timeout
        if (error.message === 'Command timed out') {
            logger.debug(`Sound ${soundId} command timed out - this is normal for long-running sounds`);
        } else {
            logger.error(`Error playing sound: ${error.message}`);
        }
        playStatus[soundId] = 'error';
        throw error;
    }
}

async function stopSound(soundId) {
    logger.info(`Attempting to stop sound: ${soundId}`);
    try {
        const response = await sendCommand(`STOP|${soundId}`);
        playStatus[soundId] = 'stopped';
        return response;
    } catch (error) {
        // Only log as error if it's not a timeout
        if (error.message === 'Command timed out') {
            logger.debug(`Stop sound ${soundId} command timed out - this is normal`);
        } else {
            logger.error(`Error stopping sound: ${error.message}`);
        }
        // Even if the command times out, mark the sound as stopped
        playStatus[soundId] = 'stopped';
        throw error;
    }
}

async function stopAllSounds() {
    logger.info('Attempting to stop all sounds');
    try {
        const response = await sendCommand('STOP_ALL');
        playStatus = {};
        return response;
    } catch (error) {
        // Only log as error if it's not a timeout
        if (error.message === 'Command timed out') {
            logger.debug('Stop all sounds command timed out - this is normal');
        } else {
            logger.error(`Error stopping all sounds: ${error.message}`);
        }
        // Even if the command times out, clear the play status
        playStatus = {};
        throw error;
    }
}

async function getSoundStatus(soundId) {
    logger.debug(`Checking status of sound: ${soundId}`);
    try {
        const response = await sendCommand(`STATUS|${soundId}`);
        logger.debug(`Get sound status response: ${JSON.stringify(response)}`);
        
        // Update playStatus with the latest status
        if (response.status) {
            playStatus[soundId] = response.status;
        }
        
        return response;
    } catch (error) {
        // Only log as error if it's not a timeout
        if (error.message === 'Command timed out') {
            logger.debug(`Get sound ${soundId} status command timed out - this is normal`);
        } else {
            logger.error(`Error getting sound status: ${error.message}`);
        }
        // Return last known status if command fails
        return {
            status: playStatus[soundId] || 'unknown',
            sound_id: soundId
        };
    }
}

function isSoundPlayerRunning() {
    const isRunning = soundPlayerProcess !== null && !soundPlayerProcess.killed;
    logger.debug(`Checking if sound player is running: ${isRunning}`);
    return isRunning;
}

function waitForSoundToFinish(soundId) {
    return new Promise((resolve) => {
        const finishListener = (finishedSoundId) => {
            if (finishedSoundId === soundId) {
                eventEmitter.removeListener('statusUpdate', statusListener);
                resolve();
            }
        };

        const statusListener = (updatedSoundId, status) => {
            if (updatedSoundId === soundId && (status === 'finished' || status === 'stopped')) {
                eventEmitter.removeListener('soundFinished', finishListener);
                resolve();
            }
        };

        eventEmitter.once('soundFinished', finishListener);
        eventEmitter.on('statusUpdate', statusListener);

        // Check if the sound has already finished
        getSoundStatus(soundId).then(status => {
            if (status.status === 'finished' || status.status === 'stopped' || status.status === 'not_found') {
                eventEmitter.removeListener('soundFinished', finishListener);
                eventEmitter.removeListener('statusUpdate', statusListener);
                resolve();
            }
        }).catch(() => {
            // If we can't get the status, wait for the events
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
