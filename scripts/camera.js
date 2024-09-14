// File: scripts/camera.js
const { spawn } = require('child_process');
const WebSocket = require('ws');

class Camera {
    constructor() {
        this.streamProcess = null;
        this.nightMode = false;
        this.resolution = '640x480';
        this.framerate = '30';
        this.audioDevice = 'hw:1,0'; // Adjust this to match your USB sound card
        this.wss = null;
        this.micVolume = 1.0;
    }

    startStream(server) {
        const ffmpegPath = '/usr/bin/ffmpeg';
        const inputDevice = '/dev/video0';

        const args = [
            '-f', 'v4l2',
            '-input_format', 'yuyv422',
            '-video_size', this.resolution,
            '-framerate', this.framerate,
            '-i', inputDevice,
            '-f', 'alsa',
            '-i', this.audioDevice,
            '-filter:a', `volume=${this.micVolume}`,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-f', 'mpegts',
            '-'
        ];

        if (this.streamProcess) {
            this.streamProcess.kill();
        }

        this.streamProcess = spawn(ffmpegPath, args);

        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws) => {
            console.log('New WebSocket connection');
            
            this.streamProcess.stdout.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            ws.on('close', () => {
                console.log('WebSocket connection closed');
            });
        });

        this.streamProcess.stderr.on('data', (data) => {
            console.error(`ffmpeg stderr: ${data}`);
        });
    }

    stopStream() {
        if (this.streamProcess) {
            this.streamProcess.kill();
            this.streamProcess = null;
        }
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }

    toggleNightMode() {
        this.nightMode = !this.nightMode;
        console.log(`Night mode: ${this.nightMode ? 'ON' : 'OFF'}`);
    }

    setResolution(resolution) {
        this.resolution = resolution;
        this.restartStream();
    }

    setFramerate(framerate) {
        this.framerate = framerate;
        this.restartStream();
    }

    setMicVolume(volume) {
        this.micVolume = volume;
        this.restartStream();
    }

    restartStream() {
        if (this.streamProcess) {
            this.stopStream();
            this.startStream(global.server);
        }
    }
}

module.exports = new Camera();