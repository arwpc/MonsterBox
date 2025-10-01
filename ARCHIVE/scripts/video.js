// File: scripts/video.js

const WebSocket = require('ws');
const logger = require('./logger');

class VideoStream {
    constructor() {
        this.wss = null;
        this.videoSourceClient = null; // Stores the WebSocket client that is the current video source
        this.clients = new Set(); // Keep track of connected clients, though video is typically point-to-point or one-to-many (server processing)
    }

    startStream(server) {
        this.wss = new WebSocket.Server({ server, path: '/videostream' });

        this.wss.on('connection', (ws) => {
            logger.info('New WebSocket connection for video stream');
            this.clients.add(ws);

            ws.on('message', (message) => {
                try {
                    // Video data is often binary. We might also get JSON control messages.
                    if (typeof message === 'string') {
                        const parsedMessage = JSON.parse(message);
                        if (parsedMessage.type === 'requestVideoStream') {
                            // Simple model: first client to request becomes the source
                            // More complex logic can be added for specific client selection or multiple sources
                            if (!this.videoSourceClient) {
                                this.videoSourceClient = ws;
                                ws.send(JSON.stringify({ type: 'videoStreamSourceAccepted' }));
                                logger.info('Video stream source accepted for a client.');
                            } else if (this.videoSourceClient === ws) {
                                ws.send(JSON.stringify({ type: 'videoStreamSourceAccepted' })); // Already the source
                            } else {
                                ws.send(JSON.stringify({ type: 'videoStreamSourceBusy' }));
                                logger.info('Video stream source requested, but another client is already the source.');
                            }
                        } else if (parsedMessage.type === 'releaseVideoStream') {
                            if (this.videoSourceClient === ws) {
                                this.videoSourceClient = null;
                                ws.send(JSON.stringify({ type: 'videoStreamSourceReleased' }));
                                logger.info('Video stream source released by a client.');
                            }
                        }
                    } else if (Buffer.isBuffer(message)) {
                        // Assuming binary data is video frames
                        if (this.videoSourceClient === ws) {
                            // Process or forward video data
                            // For now, just log receipt and size
                            logger.info(`Received video frame from source client (size: ${message.length} bytes)`);
                            // Later: this.forwardVideoToPython(message); // For OpenCV
                            // Or broadcast to other connected clients if it's a conference-like feature
                            // this.broadcastFrame(message, ws); // Example: broadcast to others
                        } else {
                            // logger.warn('Received video frame from a client not designated as source.');
                        }
                    }
                } catch (error) {
                    logger.error('Failed to parse WebSocket message or handle video data:', error);
                }
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed for video stream');
                this.clients.delete(ws);
                if (this.videoSourceClient === ws) {
                    this.videoSourceClient = null;
                    logger.info('Video stream source client disconnected, source released.');
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error on video stream for a client:', error);
                this.clients.delete(ws); // Ensure removal on error too
                if (this.videoSourceClient === ws) {
                    this.videoSourceClient = null;
                    logger.info('Video stream source client errored, source released.');
                }
            });
        });

        logger.info('Video stream WebSocket server started and listening on /videostream');
    }

    // Example: Broadcast video frame to other clients (excluding sender)
    broadcastFrame(data, sender) {
        if (this.wss) {
            this.clients.forEach((client) => {
                if (client !== sender && client.readyState === WebSocket.OPEN) {
                    try {
                        client.send(data);
                    } catch (error) {
                        logger.error('Error broadcasting video frame to a client:', error);
                    }
                }
            });
        }
    }

    // Example: send a structured message to a specific client or all
    sendSystemMessage(ws, type, payload) {
        const message = JSON.stringify({ type, ...payload });
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        } else if (!ws) { // Broadcast to all if ws is null/undefined
            this.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(message);
            });
        }
    }
}

module.exports = new VideoStream();
