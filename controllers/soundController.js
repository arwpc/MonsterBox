// File: controllers/soundController.js

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

let soundPlayerProcess = null;
let soundPlayerRetries = 0;
const MAX_SOUND_PLAYER_RETRIES = 3;

function startSoundPlayer() {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
            logger.info(`Starting sound player: ${scriptPath}`);
            soundPlayerProcess = spawn('python3', [scriptPath]);

            soundPlayerProcess.stdout.on('data', (data) => {
                logger.info(`Sound player output: ${data}`);
            });

            soundPlayerProcess.stderr.on('data', (data) => {
                logger.error(`Sound player error: ${data}`);
            });

            soundPlayerProcess.on('error', (error) => {
                logger.error(`Failed to start sound player: ${error.message}`);
                reject(error);
            });

            soundPlayerProcess.on('close', (code) => {
                logger.info(`Sound player exited with code ${code}`);
                soundPlayerProcess = null;
                if (soundPlayerRetries < MAX_SOUND_PLAYER_RETRIES) {
                    soundPlayerRetries++;
                    logger.info(`Retrying to start sound player (Attempt ${soundPlayerRetries})`);
                    startSoundPlayer().then(resolve).catch(reject);
                } else {
                    logger.error('Max retries reached. Unable to start sound player.');
                    reject(new Error('Unable to start sound player after max retries'));
                }
            });

            // Wait for the process to start
            setTimeout(() => {
                if (soundPlayerProcess) {
                    logger.info('Sound player started successfully');
                    resolve();
                } else {
                    logger.error('Sound player failed to start within the timeout period');
                    reject(new Error('Sound player failed to start'));
                }
            }, 5000); // Increased timeout to 5 seconds
        } else {
            resolve();
        }
    });
}

function playSound(soundId, filePath) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            logger.error('Sound player is not running');
            reject(new Error('Sound player is not running'));
            return;
        }

        const command = `PLAY|${soundId}|${filePath}\n`;
        logger.info(`Sending play command: ${command.trim()}`);
        soundPlayerProcess.stdin.write(command);

        const listener = (data) => {
            const output = data.toString().trim();
            try {
                const jsonOutput = JSON.parse(output);
                if (jsonOutput.status === 'finished' && jsonOutput.sound_id === soundId) {
                    soundPlayerProcess.stdout.removeListener('data', listener);
                    logger.info(`Sound completed: ${soundId}, Duration: ${jsonOutput.duration}`);
                    resolve({ success: true, duration: jsonOutput.duration });
                }
            } catch (error) {
                logger.error(`Error parsing sound player output: ${error.message}`);
            }
        };

        soundPlayerProcess.stdout.on('data', listener);

        // Add a timeout in case the sound player doesn't respond
        setTimeout(() => {
            soundPlayerProcess.stdout.removeListener('data', listener);
            logger.warn(`Timeout waiting for sound ${soundId} to complete`);
            resolve({ success: false, duration: 0 });
        }, 30000); // 30 seconds timeout
    });
}

function stopAllSounds() {
    return new Promise((resolve, reject) => {
        if (soundPlayerProcess) {
            logger.info('Stopping all sounds');
            soundPlayerProcess.stdin.write("STOP_ALL\n");
            soundPlayerProcess.kill('SIGINT');
            soundPlayerProcess = null;
            resolve();
        } else {
            logger.info('No sound player running, consider it stopped');
            resolve();
        }
    });
}

module.exports = {
    startSoundPlayer,
    playSound,
    stopAllSounds
};