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
    constructor() {
        this.activeStreams = new Map(); // characterId -> streamProcess
        this.streamConfigs = new Map(); // characterId -> config
        this.initialized = false;
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

            // Start streams for each character
            let successCount = 0;
            for (const { character, webcam } of charactersWithWebcams) {
                try {
                    await this.startCharacterWebcamStream(character, webcam);
                    successCount++;
                } catch (error) {
                    logger.warn(`Could not start webcam stream for character ${character.char_name}:`, error.message);
                }
            }

            logger.info(`📹 Webcam startup completed: ${successCount}/${charactersWithWebcams.length} streams started successfully`);

            this.initialized = true;
            logger.info('✅ Webcam Startup Service initialized successfully');
            return true;

        } catch (error) {
            logger.error('❌ Failed to initialize Webcam Startup Service:', error);
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
     * Cleanup all streams
     */
    async cleanup() {
        try {
            logger.info('📹 Cleaning up webcam streams...');
            
            for (const [characterId, stream] of this.activeStreams) {
                if (stream && !stream.killed) {
                    stream.kill();
                }
            }
            
            this.activeStreams.clear();
            this.streamConfigs.clear();
            
            logger.info('✅ Webcam streams cleanup complete');
        } catch (error) {
            logger.error('Error during webcam streams cleanup:', error);
        }
    }
}

module.exports = WebcamStartupService;
