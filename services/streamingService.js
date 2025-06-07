const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../scripts/logger');
const webcamService = require('./webcamService');
const characterService = require('./characterService');

class StreamingService extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map(); // Map of characterId -> stream info
        this.streamClients = new Map(); // Map of characterId -> Set of client responses
        this.streamProcesses = new Map(); // Map of characterId -> process info
        this.reconnectAttempts = new Map(); // Map of characterId -> attempt count
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 seconds
    }

    /**
     * Start persistent stream for a character
     * @param {number} characterId - Character ID
     * @param {Object} options - Stream options
     * @returns {Object} Stream start result
     */
    async startStream(characterId, options = {}) {
        try {
            // Check if stream is already active
            if (this.activeStreams.has(characterId)) {
                const streamInfo = this.activeStreams.get(characterId);
                if (streamInfo.process && !streamInfo.process.killed) {
                    logger.info(`Stream already active for character ${characterId}`);
                    return {
                        success: true,
                        message: 'Stream already active',
                        streamId: streamInfo.streamId,
                        clientCount: this.getClientCount(characterId)
                    };
                }
            }

            // Get webcam configuration
            const webcam = await webcamService.getWebcamByCharacter(characterId);
            if (!webcam || webcam.status !== 'active') {
                throw new Error('No active webcam found for character');
            }

            // Get character for RPI configuration
            const character = await characterService.getCharacterById(characterId);
            if (!character) {
                throw new Error('Character not found');
            }

            // Determine if this is a remote stream
            const isRemote = character.animatronic && character.animatronic.rpi_config;
            
            // Parse resolution
            const [width, height] = webcam.resolution.split('x').map(Number);
            
            // Create stream configuration
            const streamConfig = {
                characterId: characterId,
                deviceId: webcam.deviceId,
                devicePath: webcam.devicePath,
                width: options.width || width,
                height: options.height || height,
                fps: options.fps || webcam.fps,
                quality: options.quality || 85,
                isRemote: isRemote,
                character: character
            };

            // Start the stream process
            const streamResult = await this.createStreamProcess(streamConfig);
            
            if (streamResult.success) {
                // Store stream information
                const streamInfo = {
                    streamId: `stream_${characterId}_${Date.now()}`,
                    characterId: characterId,
                    webcam: webcam,
                    config: streamConfig,
                    process: streamResult.process,
                    startTime: new Date(),
                    lastActivity: new Date(),
                    clientCount: 0,
                    status: 'active'
                };

                this.activeStreams.set(characterId, streamInfo);
                this.streamClients.set(characterId, new Set());
                this.reconnectAttempts.set(characterId, 0);

                // Set up process monitoring
                this.setupProcessMonitoring(characterId, streamInfo);

                logger.info(`Stream started for character ${characterId}: ${streamInfo.streamId}`);
                this.emit('streamStarted', { characterId, streamInfo });

                return {
                    success: true,
                    message: 'Stream started successfully',
                    streamId: streamInfo.streamId,
                    config: streamConfig
                };
            } else {
                throw new Error(streamResult.error || 'Failed to start stream process');
            }

        } catch (error) {
            logger.error(`Error starting stream for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create stream process (local or remote)
     * @param {Object} config - Stream configuration
     * @returns {Object} Process creation result
     */
    async createStreamProcess(config) {
        try {
            if (config.isRemote) {
                return await this.createRemoteStreamProcess(config);
            } else {
                return await this.createLocalStreamProcess(config);
            }
        } catch (error) {
            logger.error('Error creating stream process:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create local stream process
     * @param {Object} config - Stream configuration
     * @returns {Object} Process creation result
     */
    async createLocalStreamProcess(config) {
        return new Promise((resolve) => {
            try {
                const streamScript = path.join(__dirname, '..', 'scripts', 'webcam_persistent_stream.py');
                const args = [
                    streamScript,
                    '--device-id', config.deviceId.toString(),
                    '--width', config.width.toString(),
                    '--height', config.height.toString(),
                    '--fps', config.fps.toString(),
                    '--quality', config.quality.toString(),
                    '--persistent'
                ];

                const process = spawn('python3', args);
                
                let initialized = false;
                let initTimeout = setTimeout(() => {
                    if (!initialized) {
                        process.kill();
                        resolve({
                            success: false,
                            error: 'Stream initialization timeout'
                        });
                    }
                }, 10000);

                process.stdout.once('data', () => {
                    initialized = true;
                    clearTimeout(initTimeout);
                    resolve({
                        success: true,
                        process: process
                    });
                });

                process.stderr.on('data', (data) => {
                    const error = data.toString();
                    if (!initialized) {
                        clearTimeout(initTimeout);
                        resolve({
                            success: false,
                            error: error
                        });
                    }
                });

                process.on('error', (error) => {
                    if (!initialized) {
                        clearTimeout(initTimeout);
                        resolve({
                            success: false,
                            error: error.message
                        });
                    }
                });

            } catch (error) {
                resolve({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    /**
     * Create remote stream process
     * @param {Object} config - Stream configuration
     * @returns {Object} Process creation result
     */
    async createRemoteStreamProcess(config) {
        return new Promise((resolve) => {
            try {
                const rpiConfig = config.character.animatronic.rpi_config;
                const host = rpiConfig.host;
                const user = rpiConfig.user || 'remote';

                // SSH command to start remote stream
                const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no ${user}@${host}`;
                const remoteScript = `/home/remote/MonsterBox/scripts/webcam_persistent_stream.py`;
                const remoteArgs = [
                    '--device-id', config.deviceId.toString(),
                    '--width', config.width.toString(),
                    '--height', config.height.toString(),
                    '--fps', config.fps.toString(),
                    '--quality', config.quality.toString(),
                    '--persistent'
                ].join(' ');

                const fullCommand = `${sshCommand} "python3 ${remoteScript} ${remoteArgs}"`;
                const process = spawn('cmd', ['/c', fullCommand], { shell: true });

                let initialized = false;
                let initTimeout = setTimeout(() => {
                    if (!initialized) {
                        process.kill();
                        resolve({
                            success: false,
                            error: 'Remote stream initialization timeout'
                        });
                    }
                }, 15000);

                process.stdout.once('data', () => {
                    initialized = true;
                    clearTimeout(initTimeout);
                    resolve({
                        success: true,
                        process: process
                    });
                });

                process.stderr.on('data', (data) => {
                    const error = data.toString();
                    if (!initialized) {
                        clearTimeout(initTimeout);
                        resolve({
                            success: false,
                            error: error
                        });
                    }
                });

                process.on('error', (error) => {
                    if (!initialized) {
                        clearTimeout(initTimeout);
                        resolve({
                            success: false,
                            error: error.message
                        });
                    }
                });

            } catch (error) {
                resolve({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    /**
     * Set up process monitoring for automatic reconnection
     * @param {number} characterId - Character ID
     * @param {Object} streamInfo - Stream information
     */
    setupProcessMonitoring(characterId, streamInfo) {
        const process = streamInfo.process;

        process.on('close', (code) => {
            logger.warn(`Stream process for character ${characterId} closed with code ${code}`);
            this.handleStreamDisconnect(characterId, code);
        });

        process.on('error', (error) => {
            logger.error(`Stream process error for character ${characterId}:`, error);
            this.handleStreamDisconnect(characterId, -1);
        });

        // Set up heartbeat monitoring
        this.setupHeartbeatMonitoring(characterId);
    }

    /**
     * Set up heartbeat monitoring
     * @param {number} characterId - Character ID
     */
    setupHeartbeatMonitoring(characterId) {
        const heartbeatInterval = setInterval(() => {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo) {
                clearInterval(heartbeatInterval);
                return;
            }

            // Check if stream is still active
            const timeSinceActivity = Date.now() - streamInfo.lastActivity.getTime();
            if (timeSinceActivity > 30000) { // 30 seconds without activity
                logger.warn(`Stream heartbeat timeout for character ${characterId}`);
                this.handleStreamDisconnect(characterId, -2);
                clearInterval(heartbeatInterval);
            }
        }, 10000); // Check every 10 seconds

        // Store interval reference for cleanup
        const streamInfo = this.activeStreams.get(characterId);
        if (streamInfo) {
            streamInfo.heartbeatInterval = heartbeatInterval;
        }
    }

    /**
     * Handle stream disconnect and attempt reconnection
     * @param {number} characterId - Character ID
     * @param {number} exitCode - Process exit code
     */
    async handleStreamDisconnect(characterId, exitCode) {
        const streamInfo = this.activeStreams.get(characterId);
        if (!streamInfo) return;

        // Clean up heartbeat monitoring
        if (streamInfo.heartbeatInterval) {
            clearInterval(streamInfo.heartbeatInterval);
        }

        // Update stream status
        streamInfo.status = 'disconnected';
        streamInfo.lastDisconnect = new Date();

        this.emit('streamDisconnected', { characterId, exitCode, streamInfo });

        // Attempt reconnection if within retry limits
        const attempts = this.reconnectAttempts.get(characterId) || 0;
        if (attempts < this.maxReconnectAttempts) {
            this.reconnectAttempts.set(characterId, attempts + 1);
            
            logger.info(`Attempting to reconnect stream for character ${characterId} (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
            
            setTimeout(async () => {
                const reconnectResult = await this.startStream(characterId, streamInfo.config);
                if (reconnectResult.success) {
                    logger.info(`Stream reconnected successfully for character ${characterId}`);
                    this.reconnectAttempts.set(characterId, 0);
                } else {
                    logger.error(`Stream reconnection failed for character ${characterId}: ${reconnectResult.error}`);
                }
            }, this.reconnectDelay * (attempts + 1)); // Exponential backoff
        } else {
            logger.error(`Max reconnection attempts reached for character ${characterId}`);
            this.stopStream(characterId);
        }
    }

    /**
     * Stop stream for a character
     * @param {number} characterId - Character ID
     * @returns {Object} Stop result
     */
    async stopStream(characterId) {
        try {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo) {
                return {
                    success: false,
                    message: 'No active stream found'
                };
            }

            // Kill the process
            if (streamInfo.process && !streamInfo.process.killed) {
                streamInfo.process.kill();
            }

            // Clean up heartbeat monitoring
            if (streamInfo.heartbeatInterval) {
                clearInterval(streamInfo.heartbeatInterval);
            }

            // Clean up clients
            const clients = this.streamClients.get(characterId);
            if (clients) {
                clients.forEach(client => {
                    try {
                        client.end();
                    } catch (error) {
                        logger.debug('Error ending client connection:', error);
                    }
                });
            }

            // Remove from maps
            this.activeStreams.delete(characterId);
            this.streamClients.delete(characterId);
            this.reconnectAttempts.delete(characterId);

            logger.info(`Stream stopped for character ${characterId}`);
            this.emit('streamStopped', { characterId, streamInfo });

            return {
                success: true,
                message: 'Stream stopped successfully'
            };

        } catch (error) {
            logger.error(`Error stopping stream for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Add client to stream
     * @param {number} characterId - Character ID
     * @param {Object} response - HTTP response object
     * @returns {boolean} Success status
     */
    addClient(characterId, response) {
        try {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo || streamInfo.status !== 'active') {
                return false;
            }

            const clients = this.streamClients.get(characterId);
            if (clients) {
                clients.add(response);
                streamInfo.clientCount = clients.size;
                streamInfo.lastActivity = new Date();

                // Set up client cleanup on disconnect
                response.on('close', () => {
                    this.removeClient(characterId, response);
                });

                logger.debug(`Client added to stream for character ${characterId}. Total clients: ${clients.size}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error adding client to stream:', error);
            return false;
        }
    }

    /**
     * Remove client from stream
     * @param {number} characterId - Character ID
     * @param {Object} response - HTTP response object
     */
    removeClient(characterId, response) {
        try {
            const clients = this.streamClients.get(characterId);
            if (clients) {
                clients.delete(response);
                
                const streamInfo = this.activeStreams.get(characterId);
                if (streamInfo) {
                    streamInfo.clientCount = clients.size;
                    logger.debug(`Client removed from stream for character ${characterId}. Total clients: ${clients.size}`);
                }
            }
        } catch (error) {
            logger.debug('Error removing client from stream:', error);
        }
    }

    /**
     * Get client count for a stream
     * @param {number} characterId - Character ID
     * @returns {number} Client count
     */
    getClientCount(characterId) {
        const clients = this.streamClients.get(characterId);
        return clients ? clients.size : 0;
    }

    /**
     * Get stream information
     * @param {number} characterId - Character ID
     * @returns {Object|null} Stream information
     */
    getStreamInfo(characterId) {
        return this.activeStreams.get(characterId) || null;
    }

    /**
     * Get all active streams
     * @returns {Array} Array of stream information
     */
    getAllStreams() {
        return Array.from(this.activeStreams.values());
    }

    /**
     * Pipe stream data to client
     * @param {number} characterId - Character ID
     * @param {Object} response - HTTP response object
     * @returns {boolean} Success status
     */
    pipeToClient(characterId, response) {
        try {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo || !streamInfo.process) {
                return false;
            }

            // Add client to tracking
            if (!this.addClient(characterId, response)) {
                return false;
            }

            // Set response headers for MJPEG stream
            response.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
            response.setHeader('Cache-Control', 'no-cache');
            response.setHeader('Connection', 'keep-alive');

            // Pipe stream data to client
            streamInfo.process.stdout.pipe(response, { end: false });

            return true;
        } catch (error) {
            logger.error('Error piping stream to client:', error);
            return false;
        }
    }
}

module.exports = new StreamingService();
