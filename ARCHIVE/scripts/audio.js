// File: scripts/audio.js

const WebSocket = require('ws');
const logger = require('./logger');

class AudioStream {
    constructor() {
        this.wss = null;
        this.micLockedBy = null; // Stores the WebSocket client that has the mic lock
        this.clients = new Set(); // Keep track of connected clients
    }

    startStream(server) {
        this.wss = new WebSocket.Server({ server, path: '/audiostream' });

        this.wss.on('connection', (ws) => {
            logger.info('New WebSocket connection for audio stream');
            this.clients.add(ws);

            ws.on('message', (message) => {
                try {
                    const parsedMessage = JSON.parse(message);
                    if (parsedMessage.type === 'requestMic') {
                        if (!this.micLockedBy) {
                            this.micLockedBy = ws;
                            ws.send(JSON.stringify({ type: 'micLockGranted' }));
                            logger.info('Microphone lock granted to a client.');
                        } else if (this.micLockedBy === ws) {
                            // Client already has the lock, perhaps a re-affirmation
                            ws.send(JSON.stringify({ type: 'micLockGranted' }));
                        } else {
                            ws.send(JSON.stringify({ type: 'micLockBusy' }));
                            logger.info('Microphone lock requested, but busy.');
                        }
                    } else if (parsedMessage.type === 'releaseMic') {
                        if (this.micLockedBy === ws) {
                            this.micLockedBy = null;
                            ws.send(JSON.stringify({ type: 'micReleased' }));
                            logger.info('Microphone lock released by a client.');
                        }
                    } else if (parsedMessage.type === 'audioData') {
                        if (this.micLockedBy === ws) {
                            // Process or forward audio data
                            // For now, just log a snippet or metadata
                            logger.info(`Received audio data from locked client (size: ${parsedMessage.data ? parsedMessage.data.length : 'N/A'})`);
                            // Later: this.forwardAudioToPython(parsedMessage.data);
                        } else {
                            // Optional: Inform client they don't have the lock or ignore
                            // logger.warn('Received audio data from a client without mic lock.');
                        }
                    }
                } catch (error) {
                    logger.error('Failed to parse WebSocket message or handle audio data:', error);
                    // Send an error message back to the client if appropriate
                    // ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed for audio stream');
                this.clients.delete(ws);
                if (this.micLockedBy === ws) {
                    this.micLockedBy = null; // Release lock if the locked client disconnects
                    logger.info('Microphone lock released due to client disconnection.');
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error on audio stream for a client:', error);
                // Consider cleanup similar to 'close' event if ws is identifiable
                if (this.clients.has(ws)) {
                    this.clients.delete(ws);
                    if (this.micLockedBy === ws) {
                        this.micLockedBy = null;
                        logger.info('Microphone lock released due to client error.');
                    }
                }
            });
        });

        logger.info('Audio stream WebSocket server started and listening on /audiostream');
    }

    // Method to broadcast audio data to all connected clients
    broadcast(data) {
        if (this.wss) {
            this.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(data); // Data should typically be string or Buffer
                    } catch (error) {
                        logger.error('Error broadcasting to a client:', error);
                    }
                }
            });
        }
    }

    // Example: send a structured message
    broadcastSystemMessage(type, payload) {
        const message = JSON.stringify({ type, ...payload });
        this.broadcast(message);
    }
}

module.exports = new AudioStream();
