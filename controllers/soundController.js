const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

let soundPlayerProcess = null;
let soundPlayerRetries = 0;
const MAX_SOUND_PLAYER_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

function startSoundPlayer() {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
            logger.info(`Starting sound player: ${scriptPath}`);
            logger.info(`Current working directory: ${process.cwd()}`);
            
            const isRoot = process.geteuid && process.geteuid() === 0;
            logger.info(`Running as root: ${isRoot}`);
            
            const env = {
                ...process.env,
                PYTHONUNBUFFERED: '1',
                IS_ROOT: isRoot ? '1' : '0'
            };
            logger.info(`Environment: ${JSON.stringify(env)}`);
            
            soundPlayerProcess = spawn('python3', [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: env
            });

            logger.info(`Sound player process PID: ${soundPlayerProcess.pid}`);

            let stdoutBuffer = '';
            let stderrBuffer = '';

            soundPlayerProcess.stdout.on('data', (data) => {
                stdoutBuffer += data.toString();
                let lines = stdoutBuffer.split('\n');
                while (lines.length > 1) {
                    let line = lines.shift();
                    logger.info(`Sound player output: ${line}`);
                    try {
                        const jsonOutput = JSON.parse(line);
                        if (jsonOutput.status === 'ready') {
                            logger.info('Sound player is ready');
                            resolve();
                        } else if (jsonOutput.status === 'finished') {
                            handleSoundCompletion(jsonOutput);
                        } else if (jsonOutput.status === 'error') {
                            logger.error(`Sound player error: ${JSON.stringify(jsonOutput)}`);
                        }
                    } catch (error) {
                        logger.debug(`Non-JSON output from sound player: ${line}`);
                    }
                }
                stdoutBuffer = lines.join('\n');
            });

            soundPlayerProcess.stderr.on('data', (data) => {
                stderrBuffer += data.toString();
                logger.error(`Sound player stderr: ${data.toString()}`);
            });

            soundPlayerProcess.on('error', (error) => {
                logger.error(`Failed to start sound player: ${error.message}`);
                reject(error);
            });

            soundPlayerProcess.on('close', (code) => {
                logger.info(`Sound player exited with code ${code}`);
                if (stderrBuffer) {
                    logger.error(`Sound player stderr buffer: ${stderrBuffer}`);
                }
                soundPlayerProcess = null;
                if (soundPlayerRetries < MAX_SOUND_PLAYER_RETRIES) {
                    soundPlayerRetries++;
                    logger.info(`Retrying to start sound player (Attempt ${soundPlayerRetries}/${MAX_SOUND_PLAYER_RETRIES})`);
                    setTimeout(() => {
                        startSoundPlayer().then(resolve).catch(reject);
                    }, RETRY_DELAY);
                } else {
                    logger.error('Max retries reached. Unable to start sound player.');
                    reject(new Error('Unable to start sound player after max retries'));
                }
            });
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
        soundPlayerProcess.stdin.write(command, (error) => {
            if (error) {
                logger.error(`Error sending play command: ${error.message}`);
                reject(error);
            } else {
                resolve({ success: true, message: 'Play command sent successfully' });
            }
        });
    });
}

function handleSoundCompletion(jsonOutput) {
    const { sound_id, duration } = jsonOutput;
    logger.info(`Sound finished playing: ${sound_id}, duration: ${duration}`);
    // Here you can add any additional logic for when a sound completes playing
}

function stopSound(soundId) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            logger.error('Sound player is not running');
            reject(new Error('Sound player is not running'));
            return;
        }

        const command = `STOP|${soundId}\n`;
        logger.info(`Sending stop command: ${command.trim()}`);
        soundPlayerProcess.stdin.write(command, (error) => {
            if (error) {
                logger.error(`Error sending stop command: ${error.message}`);
                reject(error);
            } else {
                resolve({ success: true, message: 'Stop command sent successfully' });
            }
        });
    });
}

function stopAllSounds() {
    return new Promise((resolve, reject) => {
        if (soundPlayerProcess) {
            logger.info('Stopping all sounds');
            soundPlayerProcess.stdin.write("STOP_ALL\n", (error) => {
                if (error) {
                    logger.error(`Error sending stop all command: ${error.message}`);
                    reject(error);
                } else {
                    resolve({ success: true, message: 'Stop all command sent successfully' });
                }
            });
        } else {
            logger.info('No sound player running, consider it stopped');
            resolve({ success: true, message: 'No sound player running' });
        }
    });
}

module.exports = {
    startSoundPlayer,
    playSound,
    stopSound,
    stopAllSounds
};
