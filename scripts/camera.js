// File: scripts/camera.js
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { exec } = require('child_process');

class Camera {
    constructor() {
        this.streamProcess = null;
        this.nightMode = false;
        this.resolution = '320x240';
        this.framerate = '15';
        this.audioDevice = 'default';
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
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-s', this.resolution,
            '-b:v', '1000k',
            '-bf', '0',
            '-'
        ];

        if (this.streamProcess) {
            this.streamProcess.kill();
        }

        this.streamProcess = spawn(ffmpegPath, args);

        this.wss = new WebSocket.Server({ server, path: '/stream' });

        this.wss.on('connection', (ws) => {
            console.log('New WebSocket connection for video stream');
            
            this.streamProcess.stdout.on('data', (data) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data);
                }
            });

            ws.on('close', () => {
                console.log('WebSocket connection closed for video stream');
            });
        });

        this.streamProcess.stderr.on('data', (data) => {
            console.error(`ffmpeg stderr: ${data}`);
        });

        console.log('Camera stream started');
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
        // Implement night mode logic here
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
        // Implement mic volume control logic here
    }

    setAudioDevice(device) {
        this.audioDevice = device;
        // Implement audio device switching logic here
    }

    restartStream() {
        if (this.streamProcess) {
            this.stopStream();
            this.startStream(global.server);
        }
    }

    getAudioDevices(callback) {
        console.log('Fetching audio devices...');
        exec('arecord -L', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error getting audio devices: ${error}`);
                callback([]);
                return;
            }
            console.log('Raw audio device output:', stdout);
            const devices = stdout.split('\n')
                .filter(line => line.trim() !== '' && !line.startsWith(' '))
                .map(line => line.trim());
            console.log('Parsed audio devices:', devices);
            callback(devices);
        });
    }
}

module.exports = new Camera();