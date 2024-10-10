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
            soundPlayerProcess = spawn('python3', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let readyReceived = false;

            soundPlayerProcess.stdout.on('data', (data) => {
                logger.info(`Sound player output: ${data}`);
                try {
                    const jsonOutput = JSON.parse(data);
                    if (jsonOutput.status === 'ready') {
                        logger.info('Sound player is ready');
                        readyReceived = true;
                        resolve();
                    }
                } catch (error) {
                    logger.debug(`Non-JSON output from sound player: ${data}`);
                }
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

            setTimeout(() => {
                if (!readyReceived) {
                    logger.warn('Sound player did not send ready message within timeout period');
                    resolve();
                }
            }, 15000);
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
                if (jsonOutput.status === 'playing' && jsonOutput.sound_id === soundId) {
                    soundPlayerProcess.stdout.removeListener('data', listener);
                    logger.info(`Sound started playing: ${soundId}`);
                    resolve({ success: true, duration: 0 });
                } else if (jsonOutput.status === 'finished' && jsonOutput.sound_id === soundId) {
                    soundPlayerProcess.stdout.removeListener('data', listener);
                    logger.info(`Sound finished playing: ${soundId}, duration: ${jsonOutput.duration}`);
                    resolve({ success: true, duration: jsonOutput.duration });
                } else if (jsonOutput.status === 'error' && jsonOutput.sound_id === soundId) {
                    soundPlayerProcess.stdout.removeListener('data', listener);
                    logger.error(`Error playing sound ${soundId}: ${jsonOutput.message}`);
                    reject(new Error(jsonOutput.message));
                }
            } catch (error) {
                logger.debug(`Non-JSON output from sound player: ${output}`);
            }
        };

        soundPlayerProcess.stdout.on('data', listener);

        setTimeout(() => {
            soundPlayerProcess.stdout.removeListener('data', listener);
            logger.warn(`Timeout waiting for sound ${soundId} to start`);
            resolve({ success: false, duration: 0 });
        }, 10000);
    });
}

function stopAllSounds() {
    return new Promise((resolve, reject) => {
        if (soundPlayerProcess) {
            logger.info('Stopping all sounds');
            soundPlayerProcess.stdin.write("STOP_ALL\n");
            
            setTimeout(() => {
                if (soundPlayerProcess) {
                    logger.info('Terminating sound player process');
                    try {
                        soundPlayerProcess.kill('SIGTERM');
                        logger.info('Sound player process terminated successfully');
                    } catch (error) {
                        logger.error(`Error terminating sound player process: ${error.message}`);
                    }
                    soundPlayerProcess = null;
                    soundPlayerRetries = 0;
                } else {
                    logger.info('Sound player process already null, no need to terminate');
                }
                resolve();
            }, 1000);
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
