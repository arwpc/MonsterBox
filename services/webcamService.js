const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const logger = require('../scripts/logger');
const partService = require('./partService');
const characterService = require('./characterService');
const sshAuthService = require('./auth/sshAuthService');
const sshCredentials = require('../scripts/ssh-credentials');

class WebcamService {
    /**
     * Get shell command for executing SSH (Linux-only system)
     * @param {string} command - The command to execute
     * @returns {Object} Shell command configuration
     */
    getShellCommand(command) {
        return {
            cmd: 'sh',
            args: ['-c', command],
            options: { shell: true }
        };
    }
    constructor() {
        this.activeStreams = new Map(); // Map of characterId -> stream info
        this.streamClients = new Map(); // Map of streamId -> Set of client connections
    }

    /**
     * Get webcam part for a specific character
     * @param {number} characterId - Character ID
     * @returns {Object|null} Webcam part or null if not found
     */
    async getWebcamByCharacter(characterId) {
        try {
            const parts = await partService.getPartsByCharacter(characterId);
            return parts.find(part => part.type === 'webcam') || null;
        } catch (error) {
            logger.error('Error getting webcam by character:', error);
            return null;
        }
    }

    /**
     * Get all webcam parts across all characters
     * @returns {Array} Array of webcam parts
     */
    async getAllWebcams() {
        try {
            const allParts = await partService.getAllParts();
            return allParts.filter(part => part.type === 'webcam');
        } catch (error) {
            logger.error('Error getting all webcams:', error);
            return [];
        }
    }

    /**
     * Build SSH command for a character using their stored password or fallback to SSH credentials manager
     */
    buildSSHCommand(character, command) {
        const rpiConfig = character.animatronic.rpi_config;

        // If character has a password stored directly, use it
        if (rpiConfig.password && rpiConfig.password.trim() !== '') {
            // Escape special characters for bash
            const escapedPassword = rpiConfig.password.replace(/'/g, "'\"'\"'");
            const escapedCommand = command.replace(/'/g, "'\"'\"'");

            // Use sshpass for SSH with password
            const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -o PasswordAuthentication=yes -o PubkeyAuthentication=no ${rpiConfig.user}@${rpiConfig.host} '${escapedCommand}'`;
            return `sshpass -p '${escapedPassword}' ${sshCommand}`;
        } else {
            // Fall back to SSH credentials manager (environment variables)
            const characterKey = character.char_name.toLowerCase().replace(/\s+/g, '');
            return sshCredentials.buildSSHCommand(characterKey, rpiConfig.host, command);
        }
    }

    /**
     * Detect available camera devices on the system
     * @param {number} characterId - Character ID for context
     * @param {boolean} useRemote - Whether to use remote detection for RPI systems
     * @returns {Object} Detection result with cameras array
     */
    async detectCameras(characterId, useRemote = false) {
        // If remote detection is requested, try to detect on the character's RPI system
        if (useRemote) {
            return await this.detectRemoteCameras(characterId);
        }

        return new Promise((resolve) => {
            try {
                const detectScript = path.join(__dirname, '..', 'scripts', 'webcam_detect.py');
                const process = spawn('python3', [detectScript]);

                let output = '';
                let error = '';

                process.stdout.on('data', (data) => {
                    output += data.toString();
                });

                process.stderr.on('data', (data) => {
                    error += data.toString();
                });

                process.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const result = JSON.parse(output);
                            logger.info(`Camera detection for character ${characterId}:`, result);
                            resolve({
                                success: true,
                                cameras: result.cameras || [],
                                message: `Found ${result.cameras?.length || 0} camera(s)`,
                                source: 'local'
                            });
                        } catch (parseError) {
                            logger.error('Error parsing camera detection output:', parseError);
                            resolve({
                                success: false,
                                cameras: [],
                                message: 'Error parsing camera detection results',
                                source: 'local'
                            });
                        }
                    } else {
                        logger.error('Camera detection failed:', error);
                        resolve({
                            success: false,
                            cameras: [],
                            message: error || 'Camera detection failed',
                            source: 'local'
                        });
                    }
                });

                // Timeout after 10 seconds
                setTimeout(() => {
                    process.kill();
                    resolve({
                        success: false,
                        cameras: [],
                        message: 'Camera detection timed out',
                        source: 'local'
                    });
                }, 10000);

            } catch (error) {
                logger.error('Error starting camera detection:', error);
                resolve({
                    success: false,
                    cameras: [],
                    message: 'Error starting camera detection: ' + error.message,
                    source: 'local'
                });
            }
        });
    }

    /**
     * Detect cameras on remote RPI4b system
     * @param {number} characterId - Character ID
     * @returns {Object} Detection result
     */
    async detectRemoteCameras(characterId) {
        try {
            const character = await characterService.getCharacterById(characterId);
            if (!character || !character.animatronic || !character.animatronic.rpi_config) {
                return {
                    success: false,
                    cameras: [],
                    message: 'Character does not have RPI configuration',
                    source: 'remote'
                };
            }

            const rpiConfig = character.animatronic.rpi_config;
            const host = rpiConfig.host;
            const user = rpiConfig.user || 'remote';

            // Check if we're running on the same host (localhost detection)
            const os = require('os');
            const networkInterfaces = os.networkInterfaces();
            const localIPs = [];

            for (const interfaceName in networkInterfaces) {
                const interfaces = networkInterfaces[interfaceName];
                for (const iface of interfaces) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        localIPs.push(iface.address);
                    }
                }
            }

            // If the target host is localhost or our local IP, run locally
            if (host === 'localhost' || host === '127.0.0.1' || localIPs.includes(host)) {
                logger.info(`Running local camera detection for ${host} (detected as localhost)`);
                return await this.detectCameras(characterId, false); // Run local detection
            }

            // Use SSH to run camera detection on remote system
            const remoteScript = 'python3 /home/remote/MonsterBox/scripts/webcam_detect.py';

            return new Promise((resolve) => {
                const process = spawn('ssh', [
                    '-o', 'ConnectTimeout=10',
                    '-o', 'StrictHostKeyChecking=no',
                    `${user}@${host}`,
                    remoteScript
                ]);

                let output = '';
                let error = '';

                process.stdout.on('data', (data) => {
                    output += data.toString();
                });

                process.stderr.on('data', (data) => {
                    error += data.toString();
                });

                process.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const result = JSON.parse(output);
                            logger.info(`Remote camera detection for ${character.char_name} (${host}):`, result);
                            resolve({
                                success: true,
                                cameras: result.cameras || [],
                                message: `Found ${result.cameras?.length || 0} camera(s) on ${host}`,
                                source: 'remote',
                                host: host
                            });
                        } catch (parseError) {
                            logger.error('Error parsing remote camera detection output:', parseError);
                            resolve({
                                success: false,
                                cameras: [],
                                message: 'Error parsing remote camera detection results',
                                source: 'remote',
                                host: host
                            });
                        }
                    } else {
                        logger.error(`Remote camera detection failed for ${host}:`, error);
                        resolve({
                            success: false,
                            cameras: [],
                            message: `Remote detection failed: ${error || 'SSH connection error'}`,
                            source: 'remote',
                            host: host
                        });
                    }
                });

                // Timeout after 15 seconds for remote operations
                setTimeout(() => {
                    process.kill();
                    resolve({
                        success: false,
                        cameras: [],
                        message: `Remote camera detection timed out for ${host}`,
                        source: 'remote',
                        host: host
                    });
                }, 15000);
            });

        } catch (error) {
            logger.error('Error in remote camera detection:', error);
            return {
                success: false,
                cameras: [],
                message: 'Error starting remote camera detection: ' + error.message,
                source: 'remote'
            };
        }
    }

    /**
     * Validate webcam configuration
     * @param {Object} config - Webcam configuration
     * @returns {Object} Validation result
     */
    validateWebcamConfig(config) {
        const errors = [];

        // Validate required fields
        if (!config.name || config.name.trim().length === 0) {
            errors.push('Webcam name is required');
        }

        if (!config.characterId || isNaN(parseInt(config.characterId))) {
            errors.push('Valid character ID is required');
        }

        if (config.deviceId === undefined || isNaN(parseInt(config.deviceId))) {
            errors.push('Valid device ID is required');
        }

        // Validate resolution format
        if (config.resolution) {
            const resolutionPattern = /^\d+x\d+$/;
            if (!resolutionPattern.test(config.resolution)) {
                errors.push('Resolution must be in format WIDTHxHEIGHT (e.g., 1280x720)');
            } else {
                const [width, height] = config.resolution.split('x').map(Number);
                if (width < 320 || height < 240) {
                    errors.push('Resolution must be at least 320x240');
                }
                if (width > 1920 || height > 1080) {
                    errors.push('Resolution cannot exceed 1920x1080');
                }
            }
        }

        // Validate FPS
        if (config.fps !== undefined) {
            const fps = parseInt(config.fps);
            if (isNaN(fps) || fps < 1 || fps > 60) {
                errors.push('FPS must be between 1 and 60');
            }
        }

        // Validate status
        if (config.status && !['active', 'inactive'].includes(config.status)) {
            errors.push('Status must be either "active" or "inactive"');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Check if character can have a webcam assigned
     * @param {number} characterId - Character ID
     * @param {number} excludePartId - Part ID to exclude from check (for updates)
     * @returns {Object} Check result
     */
    async canAssignWebcam(characterId, excludePartId = null) {
        try {
            const parts = await partService.getPartsByCharacter(characterId);
            const existingWebcam = parts.find(part => 
                part.type === 'webcam' && 
                (excludePartId === null || part.id !== excludePartId)
            );

            if (existingWebcam) {
                return {
                    canAssign: false,
                    reason: 'Character already has a webcam assigned',
                    existingWebcam: existingWebcam
                };
            }

            return {
                canAssign: true,
                reason: 'Character can have a webcam assigned'
            };
        } catch (error) {
            logger.error('Error checking webcam assignment:', error);
            return {
                canAssign: false,
                reason: 'Error checking webcam assignment: ' + error.message
            };
        }
    }

    /**
     * Get webcam stream URL for a character
     * @param {number} characterId - Character ID
     * @returns {string|null} Stream URL or null if no webcam
     */
    async getStreamUrl(characterId) {
        try {
            const webcam = await this.getWebcamByCharacter(characterId);
            if (!webcam || webcam.status !== 'active') {
                return null;
            }

            // Use the new streaming service endpoint
            return `/api/streaming/stream/${characterId}`;
        } catch (error) {
            logger.error('Error getting stream URL:', error);
            return null;
        }
    }

    /**
     * Start persistent stream for a character
     * @param {number} characterId - Character ID
     * @param {Object} options - Stream options
     * @returns {Object} Stream start result
     */
    async startPersistentStream(characterId, options = {}) {
        try {
            const streamingService = require('./streamingService');
            return await streamingService.startStream(characterId, options);
        } catch (error) {
            logger.error('Error starting persistent stream:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop persistent stream for a character
     * @param {number} characterId - Character ID
     * @returns {Object} Stream stop result
     */
    async stopPersistentStream(characterId) {
        try {
            const streamingService = require('./streamingService');
            return await streamingService.stopStream(characterId);
        } catch (error) {
            logger.error('Error stopping persistent stream:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get public stream URL for external access
     * @param {number} characterId - Character ID
     * @returns {string|null} Public stream URL or null if no webcam
     */
    async getPublicStreamUrl(characterId) {
        try {
            const webcam = await this.getWebcamByCharacter(characterId);
            if (!webcam || webcam.status !== 'active') {
                return null;
            }

            const character = await characterService.getCharacterById(characterId);
            if (!character) {
                return null;
            }

            // Create a public-friendly URL
            const characterName = character.char_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            return `/public/webcam/${characterName}`;
        } catch (error) {
            logger.error('Error getting public stream URL:', error);
            return null;
        }
    }

    /**
     * Validate webcam device on RPI system
     * @param {number} characterId - Character ID
     * @param {number} deviceId - Device ID to validate
     * @returns {Object} Validation result
     */
    async validateRemoteDevice(characterId, deviceId) {
        try {
            const character = await characterService.getCharacterById(characterId);
            if (!character || !character.animatronic || !character.animatronic.rpi_config) {
                return {
                    valid: false,
                    message: 'Character does not have RPI configuration'
                };
            }

            const rpiConfig = character.animatronic.rpi_config;
            const host = rpiConfig.host;
            const user = rpiConfig.user || 'remote';

            // Check if device exists and is accessible
            const devicePath = `/dev/video${deviceId}`;
            const testCommand = `test -c ${devicePath} && echo "exists" || echo "missing"`;

            // Use the same SSH authentication method as animatronic service
            const sshCommand = this.buildSSHCommand(character, testCommand);

            return new Promise((resolve) => {
                const { exec } = require('child_process');
                exec(sshCommand, { timeout: 10000 }, (error, stdout, stderr) => {

                    const result = stdout ? stdout.trim() : '';
                    if (!error && result === 'exists') {
                        resolve({
                            valid: true,
                            message: `Device ${devicePath} is accessible on ${host}`,
                            devicePath: devicePath,
                            host: host
                        });
                    } else {
                        resolve({
                            valid: false,
                            message: `Device ${devicePath} not found on ${host}`,
                            devicePath: devicePath,
                            host: host
                        });
                    }
                });
            });

        } catch (error) {
            logger.error('Error validating remote device:', error);
            return {
                valid: false,
                message: 'Error validating device: ' + error.message
            };
        }
    }

    /**
     * Monitor webcam device health on RPI system
     * @param {number} characterId - Character ID
     * @returns {Object} Health status
     */
    async monitorDeviceHealth(characterId) {
        try {
            const webcam = await this.getWebcamByCharacter(characterId);
            if (!webcam) {
                return {
                    healthy: false,
                    message: 'No webcam assigned to character'
                };
            }

            const character = await characterService.getCharacterById(characterId);
            if (!character || !character.animatronic || !character.animatronic.rpi_config) {
                return {
                    healthy: false,
                    message: 'Character does not have RPI configuration'
                };
            }

            // Validate device exists
            const deviceValidation = await this.validateRemoteDevice(characterId, webcam.deviceId);
            if (!deviceValidation.valid) {
                return {
                    healthy: false,
                    message: deviceValidation.message,
                    webcam: webcam
                };
            }

            // Test basic camera functionality
            const rpiConfig = character.animatronic.rpi_config;
            const host = rpiConfig.host;
            const testScript = `python3 -c "import cv2; cap = cv2.VideoCapture(${webcam.deviceId}, cv2.CAP_V4L2); ret, frame = cap.read(); cap.release(); print('OK' if ret and frame is not None else 'FAIL')"`;

            // Use the same SSH authentication method as animatronic service
            const sshCommand = this.buildSSHCommand(character, testScript);

            return new Promise((resolve) => {
                const { exec } = require('child_process');
                exec(sshCommand, { timeout: 15000 }, (error, stdout, stderr) => {

                    const result = stdout ? stdout.trim() : '';
                    if (!error && result === 'OK') {
                        resolve({
                            healthy: true,
                            message: `Webcam ${webcam.name} is functioning properly on ${host}`,
                            webcam: webcam,
                            host: host,
                            lastChecked: new Date().toISOString()
                        });
                    } else {
                        resolve({
                            healthy: false,
                            message: `Webcam ${webcam.name} failed health check on ${host}: ${stderr || error || 'Camera test failed'}`,
                            webcam: webcam,
                            host: host,
                            lastChecked: new Date().toISOString()
                        });
                    }
                });
            });

        } catch (error) {
            logger.error('Error monitoring device health:', error);
            return {
                healthy: false,
                message: 'Error monitoring device health: ' + error.message
            };
        }
    }

    /**
     * Get webcam statistics and status
     * @param {number} characterId - Character ID
     * @returns {Object} Webcam status information
     */
    async getWebcamStatus(characterId) {
        try {
            const webcam = await this.getWebcamByCharacter(characterId);
            if (!webcam) {
                return {
                    hasWebcam: false,
                    status: 'none',
                    message: 'No webcam assigned to this character'
                };
            }

            const streamInfo = this.activeStreams.get(characterId);
            const isStreaming = streamInfo && streamInfo.process && !streamInfo.process.killed;

            // Get device health if it's an RPI character
            const character = await characterService.getCharacterById(characterId);
            let deviceHealth = null;
            if (character && character.animatronic && character.animatronic.rpi_config) {
                deviceHealth = await this.monitorDeviceHealth(characterId);
            }

            return {
                hasWebcam: true,
                webcam: webcam,
                status: webcam.status,
                isStreaming: isStreaming,
                streamClients: streamInfo ? streamInfo.clientCount || 0 : 0,
                lastActivity: streamInfo ? streamInfo.lastActivity : null,
                deviceHealth: deviceHealth,
                message: isStreaming ? 'Streaming active' : 'Stream inactive'
            };
        } catch (error) {
            logger.error('Error getting webcam status:', error);
            return {
                hasWebcam: false,
                status: 'error',
                message: 'Error getting webcam status: ' + error.message
            };
        }
    }
    /**
     * Set camera controls (brightness, contrast, etc.) on a device
     * @param {number} characterId - Character ID
     * @param {number} deviceId - Camera device ID
     * @param {Object} controls - Control values to set
     * @returns {Object} Result of setting controls
     */
    async setCameraControls(characterId, deviceId, controls) {
        try {
            const character = await characterService.getCharacterById(characterId);
            const isRemoteCharacter = character && character.animatronic && character.animatronic.rpi_config;

            const appliedControls = [];
            const failedControls = [];

            if (isRemoteCharacter) {
                // Set controls on remote RPI system
                const rpiConfig = character.animatronic.rpi_config;
                const host = rpiConfig.host;
                const user = rpiConfig.user || 'remote';
                const devicePath = `/dev/video${deviceId}`;

                logger.info(`Setting camera controls on remote device ${devicePath} at ${host}`);

                for (const [controlName, value] of Object.entries(controls)) {
                    try {
                        let command;

                        if (typeof value === 'boolean') {
                            // Boolean controls (checkboxes)
                            command = `v4l2-ctl -d ${devicePath} --set-ctrl=${controlName}=${value ? 1 : 0}`;
                        } else {
                            // Numeric controls (ranges and selects)
                            command = `v4l2-ctl -d ${devicePath} --set-ctrl=${controlName}=${value}`;
                        }

                        const result = await sshAuthService.executeSSHCommand(host, user, command);

                        if (result.success) {
                            appliedControls.push({ control: controlName, value: value });
                            logger.info(`✅ Applied ${controlName}=${value} on remote camera`);
                        } else {
                            failedControls.push({
                                control: controlName,
                                value: value,
                                error: result.stderr || result.error
                            });
                            logger.warn(`❌ Failed to apply ${controlName}=${value}: ${result.stderr || result.error}`);
                        }
                    } catch (error) {
                        failedControls.push({
                            control: controlName,
                            value: value,
                            error: error.message
                        });
                        logger.error(`Error setting control ${controlName}:`, error);
                    }
                }
            } else {
                // Set controls on local system
                const devicePath = `/dev/video${deviceId}`;
                logger.info(`Setting camera controls on local device ${devicePath}`);

                for (const [controlName, value] of Object.entries(controls)) {
                    try {
                        let command;

                        if (typeof value === 'boolean') {
                            // Boolean controls (checkboxes)
                            command = `v4l2-ctl -d ${devicePath} --set-ctrl=${controlName}=${value ? 1 : 0}`;
                        } else {
                            // Numeric controls (ranges and selects)
                            command = `v4l2-ctl -d ${devicePath} --set-ctrl=${controlName}=${value}`;
                        }

                        const result = await new Promise((resolve) => {
                            const { spawn } = require('child_process');
                            const process = spawn('sh', ['-c', command]);

                            let stdout = '';
                            let stderr = '';

                            process.stdout.on('data', (data) => {
                                stdout += data.toString();
                            });

                            process.stderr.on('data', (data) => {
                                stderr += data.toString();
                            });

                            process.on('close', (code) => {
                                resolve({
                                    success: code === 0,
                                    stdout: stdout,
                                    stderr: stderr
                                });
                            });
                        });

                        if (result.success) {
                            appliedControls.push({ control: controlName, value: value });
                            logger.info(`✅ Applied ${controlName}=${value} on local camera`);
                        } else {
                            failedControls.push({
                                control: controlName,
                                value: value,
                                error: result.stderr
                            });
                            logger.warn(`❌ Failed to apply ${controlName}=${value}: ${result.stderr}`);
                        }
                    } catch (error) {
                        failedControls.push({
                            control: controlName,
                            value: value,
                            error: error.message
                        });
                        logger.error(`Error setting control ${controlName}:`, error);
                    }
                }
            }

            const success = appliedControls.length > 0;
            const message = success
                ? `Applied ${appliedControls.length} controls successfully${failedControls.length > 0 ? `, ${failedControls.length} failed` : ''}`
                : 'No controls were applied successfully';

            return {
                success: success,
                message: message,
                appliedControls: appliedControls,
                failedControls: failedControls
            };

        } catch (error) {
            logger.error('Error in setCameraControls:', error);
            return {
                success: false,
                message: 'Error setting camera controls: ' + error.message,
                appliedControls: [],
                failedControls: []
            };
        }
    }
}

module.exports = new WebcamService();
