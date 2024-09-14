const { exec } = require('child_process');

class Camera {
    constructor() {
        this.streamProcess = null;
        this.nightMode = false;
        this.resolution = '640x480';
        this.framerate = '15';
    }

    startStream() {
        this.findAvailableVideoDevice((device) => {
            if (device) {
                this.startStreamWithDevice(device);
            } else {
                console.error('No available video devices found');
            }
        });
    }

    findAvailableVideoDevice(callback) {
        exec('ls /dev/video*', (error, stdout, stderr) => {
            if (error) {
                console.error('Error finding video devices:', error);
                callback(null);
                return;
            }
            const devices = stdout.trim().split('\n');
            console.log('Available video devices:', devices);
            if (devices.length > 0) {
                callback(devices[0]);
            } else {
                callback(null);
            }
        });
    }

    startStreamWithDevice(device) {
        const mjpegStreamerCommand = `mjpg_streamer -i "input_uvc.so -d ${device} -r ${this.resolution} -f ${this.framerate}" -o "output_http.so -p 8080"`;
        exec(mjpegStreamerCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error starting mjpg-streamer with device ${device}: ${error}`);
                console.error(`stderr: ${stderr}`);
                return;
            }
            console.log(`mjpg-streamer started successfully with device ${device}`);
            console.log(`stdout: ${stdout}`);
        });
    }

    stopStream() {
        exec('pkill mjpg_streamer', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error stopping mjpg-streamer: ${error}`);
                return;
            }
            console.log('mjpg-streamer stopped successfully');
        });
    }

    toggleNightMode() {
        this.nightMode = !this.nightMode;
        console.log(`Night mode: ${this.nightMode ? 'ON' : 'OFF'}`);
        // Implement night mode logic here if your camera supports it
    }

    restartStream() {
        this.stopStream();
        setTimeout(() => {
            this.startStream();
        }, 1000); // Wait for 1 second before restarting the stream
    }
}

module.exports = new Camera();
