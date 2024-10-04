// File: controllers/soundController.js

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../scripts/logger');

let soundPlayerProcess = null;
let soundPlayerRetries = 0;
const MAX_SOUND_PLAYER_RETRIES = 3;

function startSoundPlayer() {
    if (!soundPlayerProcess) {
        const scriptPath = path.resolve(__dirname, '..', 'scripts', 'sound_player.py');
        soundPlayerProcess = spawn('python3', [scriptPath]);

        soundPlayerProcess.stdout.on('data', (data) => {
            logger.info(`Sound player output: ${data}`);
        });

        soundPlayerProcess.stderr.on('data', (data) => {
            logger.error(`Sound player error: ${data}`);
        });

        soundPlayerProcess.on('close', (code) => {
            logger.info(`Sound player exited with code ${code}`);
            soundPlayerProcess = null;
            if (soundPlayerRetries < MAX_SOUND_PLAYER_RETRIES) {
                soundPlayerRetries++;
                logger.info(`Retrying to start sound player (Attempt ${soundPlayerRetries})`);
                startSoundPlayer();
            } else {
                logger.error('Max retries reached. Unable to start sound player.');
            }
        });
    }
}

function playSound(sound, sendEvent) {
    return new Promise((resolve, reject) => {
        if (!soundPlayerProcess) {
            startSoundPlayer();
        }

        if (!soundPlayerProcess) {
            logger.error('Sound player not available');
            reject(new Error('Sound player not available'));
            return;
        }

        const filePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);
        const command = `PLAY|${sound.id}|${filePath}\n`;
        soundPlayerProcess.stdin.write(command);

        logger.info(`Playing sound: ${sound.name}`);
        sendEvent({ message: `Sound started: ${sound.name}` });

        const listener = (data) => {
            const output = data.toString().trim();
            try {
                const jsonOutput = JSON.parse(output);
                if (jsonOutput.status === 'finished' && jsonOutput.sound_id === sound.id.toString()) {
                    soundPlayerProcess.stdout.removeListener('data', listener);
                    logger.info(`Sound completed: ${sound.name}`);
                    sendEvent({ message: `Sound completed: ${sound.name}` });
                    resolve();
                }
            } catch (e) {
                // Not JSON or not relevant, ignore
            }
        };

        soundPlayerProcess.stdout.on('data', listener);
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
            resolve(); // No sound player running, consider it stopped
        }
    });
}

module.exports = {
    startSoundPlayer,
    playSound,
    stopAllSounds
};