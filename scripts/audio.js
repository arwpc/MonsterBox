// File: scripts/audio.js

const WebSocket = require('ws');
const logger = require('./logger');

class AudioStream {
    constructor() {
        this.wss = null;
    }

    startStream(server) {
        this.wss = new WebSocket.Server({ server, path: '/audiostream' });

        this.wss.on('connection', (ws) => {
            logger.info('New WebSocket connection for audio stream');

            ws.on('close', () => {
                logger.info('WebSocket connection closed for audio stream');
            });
        });

        logger.info('Audio stream server started');
    }

    // Method to broadcast audio data to all connected clients
    broadcast(data) {
        if (this.wss) {
            this.wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        }
    }
}

module.exports = new AudioStream();
