const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
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

        // Enhanced stream management for Task 8
        this.clientConnections = new Map(); // Map of clientId -> connection info
        this.streamStats = new Map(); // Map of characterId -> performance stats
        this.qualityProfiles = new Map(); // Map of quality level -> settings
        this.connectionPool = new Map(); // Map of characterId -> connection pool
        this.bandwidthMonitor = new Map(); // Map of characterId -> bandwidth stats

        // Initialize quality profiles
        this.initializeQualityProfiles();

        // Start monitoring services
        this.startPerformanceMonitoring();
    }

    /**
     * Get platform-appropriate shell command for executing SSH
     * @param {string} command - The command to execute
     * @returns {Object} Shell command configuration
     */
    getShellCommand(command) {
        const isWindows = os.platform() === 'win32';

        if (isWindows) {
            return {
                cmd: 'cmd',
                args: ['/c', command],
                options: { shell: true }
            };
        } else {
            return {
                cmd: 'sh',
                args: ['-c', command],
                options: { shell: true }
            };
        }
    }

    /**
     * Initialize quality profiles for adaptive streaming
     */
    initializeQualityProfiles() {
        this.qualityProfiles.set('low', {
            width: 320,
            height: 240,
            fps: 15,
            quality: 60,
            maxClients: 10
        });

        this.qualityProfiles.set('medium', {
            width: 640,
            height: 480,
            fps: 24,
            quality: 75,
            maxClients: 5
        });

        this.qualityProfiles.set('high', {
            width: 1280,
            height: 720,
            fps: 30,
            quality: 85,
            maxClients: 2
        });

        this.qualityProfiles.set('ultra', {
            width: 1920,
            height: 1080,
            fps: 30,
            quality: 95,
            maxClients: 1
        });
    }

    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        // Monitor stream performance every 30 seconds
        setInterval(() => {
            this.updateStreamStats();
            this.optimizeStreamQuality();
            this.cleanupInactiveClients();
        }, 30000);

        // Monitor bandwidth every 10 seconds
        setInterval(() => {
            this.updateBandwidthStats();
        }, 10000);
    }

    /**
     * Update stream statistics
     */
    updateStreamStats() {
        for (const [characterId, streamInfo] of this.activeStreams) {
            if (streamInfo.status === 'active') {
                const clients = this.streamClients.get(characterId);
                const clientCount = clients ? clients.size : 0;

                const stats = this.streamStats.get(characterId) || {
                    startTime: streamInfo.startTime,
                    totalFrames: 0,
                    droppedFrames: 0,
                    avgFps: 0,
                    clientHistory: [],
                    qualityChanges: 0
                };

                stats.clientHistory.push({
                    timestamp: new Date(),
                    clientCount: clientCount,
                    quality: streamInfo.currentQuality || 'medium'
                });

                // Keep only last 100 entries
                if (stats.clientHistory.length > 100) {
                    stats.clientHistory = stats.clientHistory.slice(-100);
                }

                this.streamStats.set(characterId, stats);
            }
        }
    }

    /**
     * Optimize stream quality based on client load
     */
    optimizeStreamQuality() {
        for (const [characterId, streamInfo] of this.activeStreams) {
            if (streamInfo.status === 'active') {
                const clients = this.streamClients.get(characterId);
                const clientCount = clients ? clients.size : 0;

                let optimalQuality = 'high';
                if (clientCount > 5) {
                    optimalQuality = 'low';
                } else if (clientCount > 2) {
                    optimalQuality = 'medium';
                }

                if (streamInfo.currentQuality !== optimalQuality) {
                    logger.info(`Adjusting stream quality for character ${characterId}: ${streamInfo.currentQuality} -> ${optimalQuality} (${clientCount} clients)`);
                    this.adjustStreamQuality(characterId, optimalQuality);
                }
            }
        }
    }

    /**
     * Adjust stream quality dynamically
     */
    async adjustStreamQuality(characterId, qualityLevel) {
        try {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo || streamInfo.status !== 'active') {
                return false;
            }

            const profile = this.qualityProfiles.get(qualityLevel);
            if (!profile) {
                logger.error(`Invalid quality profile: ${qualityLevel}`);
                return false;
            }

            // Update stream info
            streamInfo.currentQuality = qualityLevel;
            streamInfo.qualityProfile = profile;

            // Update stats
            const stats = this.streamStats.get(characterId);
            if (stats) {
                stats.qualityChanges++;
            }

            // Emit quality change event
            this.emit('qualityChanged', {
                characterId,
                oldQuality: streamInfo.currentQuality,
                newQuality: qualityLevel,
                clientCount: this.getClientCount(characterId)
            });

            return true;
        } catch (error) {
            logger.error('Error adjusting stream quality:', error);
            return false;
        }
    }

    /**
     * Clean up inactive clients
     */
    cleanupInactiveClients() {
        for (const [characterId, clients] of this.streamClients) {
            if (clients) {
                const activeClients = new Set();
                for (const client of clients) {
                    if (!client.destroyed && !client.finished) {
                        activeClients.add(client);
                    }
                }

                if (activeClients.size !== clients.size) {
                    logger.debug(`Cleaned up ${clients.size - activeClients.size} inactive clients for character ${characterId}`);
                    this.streamClients.set(characterId, activeClients);

                    // Update stream info
                    const streamInfo = this.activeStreams.get(characterId);
                    if (streamInfo) {
                        streamInfo.clientCount = activeClients.size;
                    }
                }
            }
        }
    }

    /**
     * Update bandwidth statistics
     */
    updateBandwidthStats() {
        for (const [characterId, streamInfo] of this.activeStreams) {
            if (streamInfo.status === 'active' && streamInfo.process) {
                const clients = this.streamClients.get(characterId);
                const clientCount = clients ? clients.size : 0;

                const bandwidthStats = this.bandwidthMonitor.get(characterId) || {
                    samples: [],
                    avgBandwidth: 0,
                    peakBandwidth: 0
                };

                // Estimate bandwidth based on quality and client count
                const profile = streamInfo.qualityProfile || this.qualityProfiles.get('medium');
                const estimatedBandwidth = this.estimateBandwidth(profile, clientCount);

                bandwidthStats.samples.push({
                    timestamp: new Date(),
                    bandwidth: estimatedBandwidth,
                    clientCount: clientCount
                });

                // Keep only last 60 samples (10 minutes)
                if (bandwidthStats.samples.length > 60) {
                    bandwidthStats.samples = bandwidthStats.samples.slice(-60);
                }

                // Calculate averages
                const recentSamples = bandwidthStats.samples.slice(-10);
                bandwidthStats.avgBandwidth = recentSamples.reduce((sum, s) => sum + s.bandwidth, 0) / recentSamples.length;
                bandwidthStats.peakBandwidth = Math.max(...recentSamples.map(s => s.bandwidth));

                this.bandwidthMonitor.set(characterId, bandwidthStats);
            }
        }
    }

    /**
     * Estimate bandwidth usage
     */
    estimateBandwidth(profile, clientCount) {
        // Rough estimation: width * height * fps * quality_factor * client_count
        const pixelsPerSecond = profile.width * profile.height * profile.fps;
        const qualityFactor = profile.quality / 100;
        const compressionRatio = 0.1; // MJPEG compression

        return Math.round(pixelsPerSecond * qualityFactor * compressionRatio * clientCount / 1024); // KB/s
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
            // Check if we're running on the same host as the character's RPI
            let isRemote = false;
            if (character.animatronic && character.animatronic.rpi_config) {
                const rpiHost = character.animatronic.rpi_config.host;
                const os = require('os');
                const networkInterfaces = os.networkInterfaces();

                // Check if the RPI host matches any of our local IP addresses
                let isLocalHost = false;
                for (const interfaceName in networkInterfaces) {
                    const addresses = networkInterfaces[interfaceName];
                    for (const addr of addresses) {
                        if (addr.family === 'IPv4' && addr.address === rpiHost) {
                            isLocalHost = true;
                            break;
                        }
                    }
                    if (isLocalHost) break;
                }

                // If the RPI host doesn't match our local IPs, it's remote
                isRemote = !isLocalHost;

                logger.info(`Character ${characterId} stream mode: ${isRemote ? 'remote' : 'local'} (RPI host: ${rpiHost})`);
            }
            
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
                const shellCmd = this.getShellCommand(fullCommand);
                const process = spawn(shellCmd.cmd, shellCmd.args, shellCmd.options);

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
     * Add client to stream with enhanced tracking
     * @param {number} characterId - Character ID
     * @param {Object} response - HTTP response object
     * @param {Object} clientInfo - Additional client information
     * @returns {boolean} Success status
     */
    addClient(characterId, response, clientInfo = {}) {
        try {
            const streamInfo = this.activeStreams.get(characterId);
            if (!streamInfo || streamInfo.status !== 'active') {
                return false;
            }

            const clients = this.streamClients.get(characterId);
            if (clients) {
                // Generate unique client ID
                const clientId = `${characterId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Enhanced client tracking
                const clientData = {
                    id: clientId,
                    response: response,
                    connectedAt: new Date(),
                    lastActivity: new Date(),
                    userAgent: clientInfo.userAgent || 'Unknown',
                    ipAddress: clientInfo.ipAddress || 'Unknown',
                    quality: streamInfo.currentQuality || 'medium',
                    bytesTransferred: 0,
                    framesDelivered: 0
                };

                clients.add(response);
                this.clientConnections.set(clientId, clientData);

                streamInfo.clientCount = clients.size;
                streamInfo.lastActivity = new Date();

                // Set up enhanced client cleanup on disconnect
                response.on('close', () => {
                    this.removeClient(characterId, response, clientId);
                });

                // Monitor client activity
                response.on('error', (error) => {
                    logger.debug(`Client ${clientId} error:`, error.message);
                    this.removeClient(characterId, response, clientId);
                });

                logger.info(`Client ${clientId} connected to stream for character ${characterId}. Total clients: ${clients.size}`);

                // Emit client connected event
                this.emit('clientConnected', {
                    characterId,
                    clientId,
                    clientCount: clients.size,
                    clientInfo: clientData
                });

                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error adding client to stream:', error);
            return false;
        }
    }

    /**
     * Remove client from stream with enhanced cleanup
     * @param {number} characterId - Character ID
     * @param {Object} response - HTTP response object
     * @param {string} clientId - Client ID for tracking
     */
    removeClient(characterId, response, clientId = null) {
        try {
            const clients = this.streamClients.get(characterId);
            if (clients) {
                clients.delete(response);

                // Clean up client connection data
                if (clientId) {
                    const clientData = this.clientConnections.get(clientId);
                    if (clientData) {
                        const sessionDuration = new Date() - clientData.connectedAt;
                        logger.info(`Client ${clientId} disconnected after ${Math.round(sessionDuration / 1000)}s. Frames delivered: ${clientData.framesDelivered}`);

                        // Emit client disconnected event
                        this.emit('clientDisconnected', {
                            characterId,
                            clientId,
                            sessionDuration,
                            framesDelivered: clientData.framesDelivered,
                            bytesTransferred: clientData.bytesTransferred
                        });

                        this.clientConnections.delete(clientId);
                    }
                }

                const streamInfo = this.activeStreams.get(characterId);
                if (streamInfo) {
                    streamInfo.clientCount = clients.size;
                    logger.debug(`Client removed from stream for character ${characterId}. Total clients: ${clients.size}`);

                    // Auto-stop stream if no clients and configured to do so
                    if (clients.size === 0 && streamInfo.autoStop !== false) {
                        logger.info(`No clients remaining for character ${characterId}, considering auto-stop`);
                        setTimeout(() => {
                            const currentClients = this.streamClients.get(characterId);
                            if (!currentClients || currentClients.size === 0) {
                                logger.info(`Auto-stopping stream for character ${characterId} due to no clients`);
                                this.stopStream(characterId);
                            }
                        }, 30000); // Wait 30 seconds before auto-stop
                    }
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

    /**
     * Get detailed stream statistics
     * @param {number} characterId - Character ID
     * @returns {Object} Detailed stream statistics
     */
    getStreamStatistics(characterId) {
        const streamInfo = this.activeStreams.get(characterId);
        const stats = this.streamStats.get(characterId);
        const bandwidth = this.bandwidthMonitor.get(characterId);
        const clients = this.streamClients.get(characterId);

        return {
            characterId,
            isActive: streamInfo && streamInfo.status === 'active',
            streamInfo: streamInfo || null,
            statistics: stats || null,
            bandwidth: bandwidth || null,
            clientCount: clients ? clients.size : 0,
            connectedClients: this.getConnectedClientDetails(characterId),
            uptime: streamInfo ? new Date() - streamInfo.startTime : 0
        };
    }

    /**
     * Get connected client details
     * @param {number} characterId - Character ID
     * @returns {Array} Array of client details
     */
    getConnectedClientDetails(characterId) {
        const clientDetails = [];

        for (const [clientId, clientData] of this.clientConnections) {
            if (clientId.startsWith(`${characterId}_`)) {
                clientDetails.push({
                    id: clientId,
                    connectedAt: clientData.connectedAt,
                    lastActivity: clientData.lastActivity,
                    userAgent: clientData.userAgent,
                    ipAddress: clientData.ipAddress,
                    quality: clientData.quality,
                    bytesTransferred: clientData.bytesTransferred,
                    framesDelivered: clientData.framesDelivered,
                    sessionDuration: new Date() - clientData.connectedAt
                });
            }
        }

        return clientDetails.sort((a, b) => a.connectedAt - b.connectedAt);
    }

    /**
     * Get all active streams summary
     * @returns {Object} Summary of all active streams
     */
    getAllStreamsStatus() {
        const summary = {
            totalStreams: this.activeStreams.size,
            activeStreams: 0,
            totalClients: 0,
            streams: []
        };

        for (const [characterId] of this.activeStreams) {
            const streamStats = this.getStreamStatistics(characterId);
            summary.streams.push(streamStats);

            if (streamStats.isActive) {
                summary.activeStreams++;
                summary.totalClients += streamStats.clientCount;
            }
        }

        return summary;
    }

    /**
     * Force disconnect a specific client
     * @param {string} clientId - Client ID to disconnect
     * @returns {boolean} Success status
     */
    disconnectClient(clientId) {
        try {
            const clientData = this.clientConnections.get(clientId);
            if (clientData && clientData.response) {
                logger.info(`Force disconnecting client ${clientId}`);
                clientData.response.destroy();
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Error disconnecting client:', error);
            return false;
        }
    }

    /**
     * Set stream auto-stop behavior
     * @param {number} characterId - Character ID
     * @param {boolean} autoStop - Whether to auto-stop when no clients
     */
    setAutoStop(characterId, autoStop = true) {
        const streamInfo = this.activeStreams.get(characterId);
        if (streamInfo) {
            streamInfo.autoStop = autoStop;
            logger.info(`Auto-stop ${autoStop ? 'enabled' : 'disabled'} for character ${characterId}`);
        }
    }

    /**
     * Get stream health status
     * @param {number} characterId - Character ID
     * @returns {Object} Health status
     */
    getStreamHealth(characterId) {
        const streamInfo = this.activeStreams.get(characterId);
        const stats = this.streamStats.get(characterId);
        const bandwidth = this.bandwidthMonitor.get(characterId);

        if (!streamInfo) {
            return {
                healthy: false,
                status: 'not_found',
                message: 'Stream not found'
            };
        }

        const isActive = streamInfo.status === 'active';
        const hasClients = streamInfo.clientCount > 0;
        const uptime = new Date() - streamInfo.startTime;
        const recentActivity = streamInfo.lastActivity && (new Date() - streamInfo.lastActivity) < 60000;

        const healthy = isActive && (hasClients || uptime < 300000); // Healthy if active and (has clients OR running < 5 min)

        return {
            healthy,
            status: streamInfo.status,
            isActive,
            hasClients,
            clientCount: streamInfo.clientCount,
            uptime,
            recentActivity,
            lastActivity: streamInfo.lastActivity,
            currentQuality: streamInfo.currentQuality,
            stats: stats ? {
                totalFrames: stats.totalFrames,
                droppedFrames: stats.droppedFrames,
                qualityChanges: stats.qualityChanges
            } : null,
            bandwidth: bandwidth ? {
                current: bandwidth.avgBandwidth,
                peak: bandwidth.peakBandwidth
            } : null
        };
    }
}

module.exports = new StreamingService();
