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

const COMMAND_TIMEOUT = 10000; // Set to 10s for sound playback
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
                            // If a messageId is present, resolve the corresponding messageQueue promise
                            if (jsonOutput.messageId !== undefined) {
                                const queueItem = messageQueue.get(jsonOutput.messageId);
                                if (queueItem) {
                                    const { resolve } = queueItem;
                                    messageQueue.delete(jsonOutput.messageId);
                                    resolve(jsonOutput);
                                }
                            }
                        } else if (jsonOutput.messageId !== undefined) {
                            // Handle message queue responses for other statuses
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
        logger.info(`About to write to sound player stdin: ${fullCommand.trim()}`);
        
        // Extract sound ID for PLAY commands - we'll need it for the timeout handler
        let soundId = null;
        let filePath = null;
        if (command.startsWith('PLAY|')) {
            const parts = command.split('|');
            if (parts.length >= 3) {
                soundId = parts[1];
                filePath = parts[2];
            }
        }
        
        const startTime = Date.now();
        const timeoutId = setTimeout(() => {
            if (messageQueue.has(id)) {
                messageQueue.delete(id);
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                
                // Log timeout warning but don't treat as error for PLAY commands
                // since the sound might still be playing even if we don't get a response
                if (command.startsWith('PLAY|')) {
                    logger.debug(`Sound command timed out after ${elapsed}s | command: ${command} - this is normal for ongoing playback`);
                    // Mark the sound as playing even though we timed out waiting for confirmation
                    if (soundId) {
                        playStatus[soundId] = 'playing';
                    }
                    // Resolve with a constructed response
                    resolve({
                        status: 'playing',
                        sound_id: soundId,
                        message: 'Sound playback initiated (timeout occurred but playback may be ongoing)'
                    });
                } else {
                    logger.warn(`Sound command timed out after ${elapsed}s | command: ${command}`);
                    reject(new Error(`Command timed out after ${elapsed}s | command: ${command}`));
                }
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

        // Write the command to the sound player's stdin with error handling
        try {
            const writeResult = soundPlayerProcess.stdin.write(fullCommand);
            logger.info(`Successfully wrote command to sound player stdin: ${fullCommand.trim()}`);
            
            // If we couldn't write to the stream immediately, we need to wait for drain
            if (!writeResult) {
                soundPlayerProcess.stdin.once('drain', () => {
                    logger.info(`Sound player stdin drained after write`);
                });
            }
            
            // For PLAY commands, give a small delay and then check if we already got a response
            if (command.startsWith('PLAY|')) {
                setTimeout(() => {
                    // If we're still waiting, log that fact
                    if (messageQueue.has(id)) {
                        logger.debug(`Still waiting for response to command ${id} after 500ms`);
                    }
                }, 500);
            }
        } catch (error) {
            logger.error(`Failed to write command to sound player: ${error.message}`);
            messageQueue.delete(id);
            reject(new Error(`Failed to send command to sound player: ${error.message}`));
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
    let duration = null;
    let timeout = COMMAND_TIMEOUT;
    try {
        // Try to get duration using mpg123 and awk
        const spawnSync = require('child_process').spawnSync;
        let awkDuration = null;
        try {
            const awkCmd = `mpg123 -t "${filePath}" 2>&1 | awk '/Decoding/ {print $1}'`;
            const awkResult = spawnSync(awkCmd, { shell: true, encoding: 'utf8' });
            if (awkResult.stdout) {
                const match = awkResult.stdout.trim().match(/\[(\d+):(\d+)\]/);
                if (match) {
                    const minutes = parseInt(match[1], 10);
                    const seconds = parseInt(match[2], 10);
                    if (!isNaN(minutes) && !isNaN(seconds)) {
                        awkDuration = minutes * 60 + seconds;
                        logger.info(`Parsed duration from mpg123|awk: ${minutes}m${seconds}s = ${awkDuration}s`);
                    }
                }
            }
        } catch (err) {
            logger.warn(`Failed awk-based duration extraction: ${err.message}`);
        }
        if (awkDuration && awkDuration > 0) {
            duration = awkDuration;
        } else {
            // Fallback: previous logic
            const durationResult = spawnSync('mpg123', ['--skip', '0', '-t', filePath], { encoding: 'utf8' });
            if (durationResult.stderr) {
                const lines = durationResult.stderr.split('\n');
                for (const line of lines) {
                    // Support mpg123 output: [mm:ss] Decoding of ... finished.
                    const match = line.match(/\[(\d+):(\d+)\] Decoding of/);
                    if (match) {
                        const minutes = parseInt(match[1], 10);
                        const seconds = parseInt(match[2], 10);
                        if (!isNaN(minutes) && !isNaN(seconds)) {
                            duration = minutes * 60 + seconds;
                            logger.info(`Parsed duration from mpg123 output: ${minutes}m${seconds}s = ${duration}s`);
                            break;
                        }
                    }
                    // Fallback: old Time: float format
                    if (line.includes('Time:')) {
                        const parts = line.trim().split(' ');
                        const last = parts[parts.length - 1];
                        const parsed = parseFloat(last);
                        if (!isNaN(parsed)) {
                            duration = parsed;
                            logger.info(`Parsed duration from Time: line: ${duration}s`);
                            break;
                        }
                    }
                }
            }
        }
        if (duration && duration > 0) {
            timeout = Math.ceil(duration * 1000 + 3000); // duration in ms + 3s buffer
            logger.info(`Auto-calculated timeout for soundId ${soundId}: ${timeout} ms (duration: ${duration}s + 3s buffer)`);
        } else {
            logger.warn(`Could not determine duration for ${filePath}, using default timeout.`);
        }
    } catch (err) {
        logger.warn(`Failed to determine duration for ${filePath}: ${err.message}`);
    }
    try {
        // Send play command with the raw file path and dynamic timeout
        await sendCommand(`PLAY|${soundId}|${filePath}`, timeout);
        // Wait for playing status
        await waitForStatus(soundId, 'playing', timeout);
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
