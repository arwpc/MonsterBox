/**
 * Webcam Startup Service
 * 
 * Automatically starts webcam streaming for all characters with assigned webcams
 * on application startup. This eliminates the slow loading time when accessing
 * the camera page by having streams already running.
 */

const logger = require('../scripts/logger');
const characterService = require('./characterService');
const partService = require('./partService');
const streamingService = require('./streamingService');
const { spawn } = require('child_process');
const path = require('path');

class WebcamStartupService {
    constructor(options = {}) {
        this.activeStreams = new Map(); // characterId -> streamProcess
        this.streamConfigs = new Map(); // characterId -> config
        this.initialized = false;
        this.healthCheckInterval = null;
        this.restartAttempts = new Map(); // characterId -> attempt count
        this.maxRestartAttempts = 5;
        this.healthCheckIntervalMs = 120000; // 2 minutes - reduced frequency for RPi4b stability

        // Character isolation support
        this.targetCharacterId = options.targetCharacterId || null;
        this.isolationMode = options.isolationMode || false;

        if (this.isolationMode && this.targetCharacterId) {
            logger.info(`📹 Webcam service running in isolation mode for character ${this.targetCharacterId}`);
        }
    }

    /**
     * Initialize the webcam startup service
     */
    async initialize() {
        try {
            logger.info('📹 Initializing Webcam Startup Service...');

            // Get all characters with webcams
            const charactersWithWebcams = await this.getCharactersWithWebcams();

            if (charactersWithWebcams.length === 0) {
                logger.info('📹 No characters with webcams found, skipping webcam startup');
                this.initialized = true;
                return true;
            }

            logger.info(`📹 Found ${charactersWithWebcams.length} characters with webcams`);

            // Start streams for each character (or just target character in isolation mode)
            let successCount = 0;
            for (const { character, webcam } of charactersWithWebcams) {
                // Skip characters not matching target in isolation mode
                if (this.isolationMode && this.targetCharacterId && character.id !== this.targetCharacterId) {
                    logger.debug(`📹 Skipping character ${character.char_name} (ID: ${character.id}) - not target character ${this.targetCharacterId}`);
                    continue;
                }

                try {
                    await this.startCharacterWebcamStream(character, webcam);
                    successCount++;
                } catch (error) {
                    logger.warn(`Could not start webcam stream for character ${character.char_name}:`, error.message);
                }
            }

            logger.info(`📹 Webcam startup completed: ${successCount}/${charactersWithWebcams.length} streams started successfully`);

            // Start health monitoring for persistent streams
            this.startHealthMonitoring();

            this.initialized = true;
            logger.info('✅ Webcam Startup Service initialized successfully');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Webcam Startup Service:', error);
            return false;
        }
    }

    /**
     * Start health monitoring for persistent streams
     */
    startHealthMonitoring() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }

        logger.info('📹 Starting webcam stream health monitoring...');

        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, this.healthCheckIntervalMs);
    }

    /**
     * Perform health check on all active streams
     */
    async performHealthCheck() {
        try {
            logger.debug('📹 Performing webcam stream health check...');

            for (const [characterId, streamConfig] of this.streamConfigs) {
                const isHealthy = await this.checkStreamHealth(characterId);

                if (!isHealthy) {
                    logger.warn(`📹 Stream for character ${characterId} is unhealthy, attempting restart...`);
                    await this.restartStream(characterId);
                }
            }
        } catch (error) {
            logger.error('Error during health check:', error);
        }
    }

    /**
     * Check if a stream is healthy
     */
    async checkStreamHealth(characterId) {
        try {
            const streamProcess = this.activeStreams.get(characterId);

            if (!streamProcess || streamProcess.killed) {
                logger.debug(`📹 Stream process for character ${characterId} is not running`);
                return false;
            }

            // Check if streaming service has this stream active
            if (streamingService && typeof streamingService.isStreamActive === 'function') {
                const isActive = streamingService.isStreamActive(characterId);
                if (!isActive) {
                    logger.debug(`📹 Streaming service reports character ${characterId} stream as inactive`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.error(`Error checking stream health for character ${characterId}:`, error);
            return false;
        }
    }

    /**
     * Restart a failed stream
     */
    async restartStream(characterId) {
        try {
            const attempts = this.restartAttempts.get(characterId) || 0;

            if (attempts >= this.maxRestartAttempts) {
                logger.error(`📹 Max restart attempts (${this.maxRestartAttempts}) reached for character ${characterId}, giving up`);
                return false;
            }

            this.restartAttempts.set(characterId, attempts + 1);

            logger.info(`📹 Restarting stream for character ${characterId} (attempt ${attempts + 1}/${this.maxRestartAttempts})`);

            // Stop existing stream
            await this.stopCharacterStream(characterId);

            // Wait a moment before restarting
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get stream configuration
            const streamConfig = this.streamConfigs.get(characterId);
            if (!streamConfig) {
                logger.error(`📹 No stream config found for character ${characterId}`);
                return false;
            }

            // Restart stream
            const success = await this.startCharacterWebcamStream(streamConfig.character, streamConfig.webcam);

            if (success) {
                logger.info(`📹 Successfully restarted stream for character ${characterId}`);
                this.restartAttempts.set(characterId, 0); // Reset attempts on success
                return true;
            } else {
                logger.error(`📹 Failed to restart stream for character ${characterId}`);
                return false;
            }

        } catch (error) {
            logger.error(`Error restarting stream for character ${characterId}:`, error);
            return false;
        }
    }

    /**
     * Get all characters that have webcams assigned
     */
    async getCharactersWithWebcams() {
        try {
            const characters = await characterService.getAllCharacters();
            const charactersWithWebcams = [];

            for (const character of characters) {
                // Get parts for this character
                const parts = await partService.getPartsByCharacter(character.id);
                const webcam = parts.find(part => part.type === 'webcam' && part.status === 'active');

                if (webcam) {
                    charactersWithWebcams.push({ character, webcam });
                }
            }

            return charactersWithWebcams;
        } catch (error) {
            logger.error('Error getting characters with webcams:', error);
            return [];
        }
    }

    /**
     * Start webcam stream for a specific character
     */
    async startCharacterWebcamStream(character, webcam) {
        try {
            logger.info(`📹 Starting webcam stream for character: ${character.char_name}`);

            // Parse resolution
            const [width, height] = webcam.resolution ? webcam.resolution.split('x').map(Number) : [640, 480];
            const fps = webcam.fps || 30;

            // Create stream configuration
            const streamConfig = {
                characterId: character.id,
                deviceId: webcam.deviceId,
                devicePath: webcam.devicePath || `/dev/video${webcam.deviceId}`,
                width: width,
                height: height,
                fps: fps,
                quality: 85,
                isRemote: this.isRemoteCharacter(character),
                character: character,
                webcam: webcam
            };

            // Store configuration
            this.streamConfigs.set(character.id, streamConfig);

            // Try to start the stream using the existing streaming service
            try {
                const streamResult = await streamingService.startStream(character.id, {
                    width: width,
                    height: height,
                    fps: fps,
                    quality: 85
                });

                if (streamResult && streamResult.success) {
                    logger.info(`✅ Webcam stream started for character: ${character.char_name}`);
                    this.activeStreams.set(character.id, streamResult.process);

                    // Set up process monitoring
                    if (streamResult.process) {
                        streamResult.process.on('exit', (code) => {
                            logger.warn(`📹 Stream process exited for character ${character.char_name} with code ${code}`);
                            this.activeStreams.delete(character.id);
                        });

                        streamResult.process.on('error', (error) => {
                            logger.error(`📹 Stream process error for character ${character.char_name}:`, error);
                            this.activeStreams.delete(character.id);
                        });
                    }
                } else {
                    logger.warn(`⚠️ Could not start webcam stream for character: ${character.char_name} - ${streamResult ? streamResult.error : 'No result'}`);
                    logger.info(`📹 Stream will be started on-demand when camera page is accessed`);
                }
            } catch (streamError) {
                logger.warn(`⚠️ Webcam stream startup failed for character: ${character.char_name} - ${streamError.message}`);
                logger.info(`📹 Stream will be started on-demand when camera page is accessed`);
            }

        } catch (error) {
            logger.warn(`⚠️ Error during webcam stream setup for character ${character.char_name}:`, error.message);
            logger.info(`📹 Character will use on-demand streaming instead`);
        }
    }

    /**
     * Check if character is remote (has RPI configuration)
     */
    isRemoteCharacter(character) {
        return character.animatronic &&
            character.animatronic.rpi_config &&
            character.animatronic.rpi_config.host &&
            character.animatronic.rpi_config.host !== 'localhost' &&
            character.animatronic.rpi_config.host !== '127.0.0.1';
    }

    /**
     * Get the first available webcam if no webcam is assigned to character
     */
    async getFirstAvailableWebcam() {
        try {
            // Try to detect available cameras
            const { spawn } = require('child_process');

            return new Promise((resolve) => {
                const detectScript = path.join(__dirname, '..', 'scripts', 'webcam_detect.py');
                const process = spawn('python3', [detectScript]);

                let output = '';
                process.stdout.on('data', (data) => {
                    output += data.toString();
                });

                process.on('close', (code) => {
                    try {
                        if (code === 0 && output.trim()) {
                            const cameras = JSON.parse(output);
                            if (cameras.length > 0) {
                                // Return first available camera
                                resolve({
                                    deviceId: 0,
                                    devicePath: '/dev/video0',
                                    resolution: '640x480',
                                    fps: 30,
                                    name: 'Default Camera'
                                });
                                return;
                            }
                        }
                    } catch (parseError) {
                        logger.debug('Error parsing camera detection output:', parseError);
                    }
                    resolve(null);
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    process.kill();
                    resolve(null);
                }, 5000);
            });
        } catch (error) {
            logger.debug('Error detecting cameras:', error);
            return null;
        }
    }

    /**
     * Start webcam for character using first available camera if none assigned
     */
    async startWebcamForCharacterWithFallback(character) {
        try {
            // Check if character already has a webcam assigned
            const parts = await partService.getPartsByCharacter(character.id);
            let webcam = parts.find(part => part.type === 'webcam' && part.status === 'active');

            if (!webcam) {
                // Try to get first available webcam
                const availableWebcam = await this.getFirstAvailableWebcam();
                if (availableWebcam) {
                    logger.info(`📹 No webcam assigned to ${character.char_name}, using first available: ${availableWebcam.devicePath}`);
                    webcam = availableWebcam;
                } else {
                    logger.info(`📹 No webcam available for character: ${character.char_name}`);
                    return false;
                }
            }

            await this.startCharacterWebcamStream(character, webcam);
            return true;

        } catch (error) {
            logger.error(`Error starting webcam with fallback for character ${character.char_name}:`, error);
            return false;
        }
    }

    /**
     * Get active stream for character
     */
    getActiveStream(characterId) {
        return this.activeStreams.get(parseInt(characterId));
    }

    /**
     * Get stream configuration for character
     */
    getStreamConfig(characterId) {
        return this.streamConfigs.get(parseInt(characterId));
    }

    /**
     * Check if stream is active for character
     */
    isStreamActive(characterId) {
        const stream = this.activeStreams.get(parseInt(characterId));
        return stream && !stream.killed;
    }

    /**
     * Get stream configuration for a character
     */
    getStreamConfig(characterId) {
        return this.streamConfigs.get(parseInt(characterId));
    }

    /**
     * Get active stream process for a character
     */
    getActiveStream(characterId) {
        return this.activeStreams.get(parseInt(characterId));
    }

    /**
     * Stop stream for character
     */
    async stopCharacterStream(characterId) {
        try {
            const stream = this.activeStreams.get(parseInt(characterId));
            if (stream && !stream.killed) {
                stream.kill();
                this.activeStreams.delete(parseInt(characterId));
                this.streamConfigs.delete(parseInt(characterId));
                logger.info(`📹 Stopped webcam stream for character ID: ${characterId}`);
            }
        } catch (error) {
            logger.error(`Error stopping webcam stream for character ${characterId}:`, error);
        }
    }

    /**
     * Restart stream for character
     */
    async restartCharacterStream(characterId) {
        try {
            await this.stopCharacterStream(characterId);

            const character = await characterService.getCharacterById(characterId);
            if (character) {
                await this.startWebcamForCharacterWithFallback(character);
            }
        } catch (error) {
            logger.error(`Error restarting webcam stream for character ${characterId}:`, error);
        }
    }

    /**
     * Stop a character's webcam stream
     */
    async stopCharacterStream(characterId) {
        try {
            const streamProcess = this.activeStreams.get(characterId);

            if (streamProcess && !streamProcess.killed) {
                logger.info(`📹 Stopping webcam stream for character ${characterId}`);

                // Kill the process gracefully
                streamProcess.kill('SIGTERM');

                // Wait a moment for graceful shutdown
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Force kill if still running
                if (!streamProcess.killed) {
                    streamProcess.kill('SIGKILL');
                }

                // Clean up tracking
                this.activeStreams.delete(characterId);

                logger.info(`📹 Webcam stream stopped for character ${characterId}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error stopping webcam stream for character ${characterId}:`, error);
            return false;
        }
    }

    /**
     * Cleanup all streams
     */
    async cleanup() {
        try {
            logger.info('📹 Cleaning up webcam streams...');

            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            for (const [characterId, stream] of this.activeStreams) {
                if (stream && !stream.killed) {
                    stream.kill();
                }
            }

            this.activeStreams.clear();
            this.streamConfigs.clear();
            this.restartAttempts.clear();

            logger.info('✅ Webcam streams cleanup complete');
        } catch (error) {
            logger.error('Error during webcam streams cleanup:', error);
        }
    }
}

module.exports = WebcamStartupService;
