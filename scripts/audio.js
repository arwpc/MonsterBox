// File: scripts/audio.js

const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const logger = require('./logger');

class Audio {
    constructor() {
        this.audioProcess = null;
        this.wss = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    startStream(server) {
        this.wss = new WebSocket.Server({ server, path: '/audiostream' });

        this.wss.on('connection', (ws) => {
            logger.info('New WebSocket connection for audio stream');
            if (!this.audioProcess) {
                this.startAudioProcess(ws);
            }

            ws.on('close', () => {
                logger.info('WebSocket connection closed for audio stream');
            });
        });

        logger.info('Audio stream server started');
    }

    startAudioProcess(ws) {
        const scriptPath = path.join(__dirname, 'sound_player.py');
        this.audioProcess = spawn('python3', [scriptPath]);

        this.audioProcess.stdout.on('data', (data) => {
            logger.debug(`Sound player output: ${data}`);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        this.audioProcess.stderr.on('data', (data) => {
            logger.error(`Sound player error: ${data}`);
        });

        this.audioProcess.on('close', (code) => {
            logger.info(`Sound player exited with code ${code}`);
            this.audioProcess = null;
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                logger.info(`Retrying to start sound player (Attempt ${this.retryCount})`);
                this.startAudioProcess(ws);
            } else {
                logger.error('Max retries reached. Unable to start sound player.');
            }
        });

        this.audioProcess.on('error', (error) => {
            logger.error(`Error starting audio stream: ${error}`);
        });
    }

    stopAudioProcess() {
        if (this.audioProcess) {
            this.audioProcess.kill();
            this.audioProcess = null;
        }
    }

    playSound(soundId, filePath) {
        if (this.audioProcess) {
            const command = `PLAY|${soundId}|${filePath}\n`;
            this.audioProcess.stdin.write(command);
        } else {
            logger.error('Audio process is not running');
            this.startAudioProcess(this.wss.clients.values().next().value);
        }
    }

    stopSound(soundId) {
        if (this.audioProcess) {
            const command = `STOP|${soundId}\n`;
            this.audioProcess.stdin.write(command);
        } else {
            logger.error('Audio process is not running');
        }
    }

    stopAllSounds() {
        if (this.audioProcess) {
            const command = `STOP_ALL\n`;
            this.audioProcess.stdin.write(command);
        } else {
            logger.error('Audio process is not running');
        }
    }
}

module.exports = new Audio();
