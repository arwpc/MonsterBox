// scripts/jaw-animation/jawAnimationSystem.js

const EventEmitter = require('events');
const AudioAnalyzer = require('./audio/audioAnalyzer');
const ServoMapper = require('./servo/servoMapper');
const ServoController = require('./servo/servoController');
const JawConfig = require('./config/jawConfig');
const JawWebSocket = require('./websocket/jawWebSocket');
const logger = require('../logger');

/**
 * Main jaw animation system
 * Coordinates audio analysis, servo mapping, and servo control
 */
class JawAnimationSystem extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            enabled: options.enabled !== false,
            autoStart: options.autoStart !== false,
            ...options
        };
        
        // Core components
        this.audioAnalyzer = null;
        this.servoMapper = null;
        this.servoController = null;
        this.config = null;
        this.webSocket = null;
        
        // State
        this.isRunning = false;
        this.currentCharacterId = null;
        this.activeServoId = null;
        this.lastVolumeUpdate = 0;
        this.performanceStats = {
            updatesPerSecond: 0,
            averageLatency: 0,
            cpuUsage: 0,
            memoryUsage: 0
        };
        
        // Performance monitoring
        this.performanceInterval = null;
        this.updateCount = 0;
        this.latencySum = 0;
        
        logger.info('JawAnimationSystem initialized');
    }
    
    /**
     * Initialize the jaw animation system
     * @param {http.Server} server - HTTP server for WebSocket
     * @returns {Promise} Promise that resolves when initialization is complete
     */
    async initialize(server = null) {
        try {
            logger.info('Initializing JawAnimationSystem...');
            
            // Initialize configuration
            this.config = new JawConfig();
            await this.config.initialize();
            
            // Initialize WebSocket server
            if (server) {
                this.webSocket = new JawWebSocket();
                await this.webSocket.start(server);
                this.setupWebSocketHandlers();
            }
            
            // Initialize components with default settings
            this.audioAnalyzer = new AudioAnalyzer();
            this.servoMapper = new ServoMapper();
            
            this.setupEventHandlers();
            this.startPerformanceMonitoring();
            
            logger.info('JawAnimationSystem initialized successfully');
            this.emit('initialized');
            
        } catch (error) {
            logger.error('Failed to initialize JawAnimationSystem:', error);
            throw error;
        }
    }
    
    /**
     * Start jaw animation for a character
     * @param {number} characterId - Character ID
     * @param {number} servoId - Servo part ID
     * @returns {Promise} Promise that resolves when animation is started
     */
    async startAnimation(characterId, servoId) {
        try {
            if (this.isRunning) {
                await this.stopAnimation();
            }
            
            logger.info(`Starting jaw animation for character ${characterId}, servo ${servoId}`);
            
            this.currentCharacterId = characterId;
            this.activeServoId = servoId;
            
            // Load character configuration
            const characterConfig = this.config.getCharacterConfig(characterId);
            
            // Get servo information from MonsterBox
            const servoInfo = await this.getServoInfo(servoId);
            
            // Initialize servo controller
            this.servoController = new ServoController({
                servoId: servoId,
                characterId: characterId,
                controlType: servoInfo.usePCA9685 ? 'pca9685' : 'gpio',
                pin: servoInfo.pin,
                channel: servoInfo.channel,
                servoType: servoInfo.servoType,
                minAngle: characterConfig.servoMapping.minPosition,
                maxAngle: characterConfig.servoMapping.maxPosition
            });
            
            // Update servo mapper with character configuration
            this.servoMapper.updateOptions(characterConfig.servoMapping);
            
            // Update audio analyzer with character configuration
            this.audioAnalyzer.updateOptions(characterConfig.audioAnalysis);
            
            // Start audio analysis
            this.audioAnalyzer.start();
            
            this.isRunning = true;
            
            logger.info('Jaw animation started successfully');
            this.emit('animationStarted', { characterId, servoId });
            
            // Broadcast to WebSocket clients
            if (this.webSocket) {
                this.webSocket.broadcast('animationStarted', { characterId, servoId });
            }
            
        } catch (error) {
            logger.error('Failed to start jaw animation:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Stop jaw animation
     * @returns {Promise} Promise that resolves when animation is stopped
     */
    async stopAnimation() {
        if (!this.isRunning) {
            return;
        }
        
        try {
            logger.info('Stopping jaw animation');
            
            this.isRunning = false;
            
            // Stop audio analysis
            if (this.audioAnalyzer) {
                this.audioAnalyzer.stop();
            }
            
            // Stop servo movement
            if (this.servoController) {
                this.servoController.stop();
                // Return to closed position
                await this.servoController.moveToPosition(this.servoController.options.minAngle);
            }
            
            const characterId = this.currentCharacterId;
            const servoId = this.activeServoId;
            
            this.currentCharacterId = null;
            this.activeServoId = null;
            this.servoController = null;
            
            logger.info('Jaw animation stopped');
            this.emit('animationStopped', { characterId, servoId });
            
            // Broadcast to WebSocket clients
            if (this.webSocket) {
                this.webSocket.broadcast('animationStopped', { characterId, servoId });
            }
            
        } catch (error) {
            logger.error('Error stopping jaw animation:', error);
            this.emit('error', error);
        }
    }
    
    /**
     * Setup event handlers for components
     */
    setupEventHandlers() {
        // Audio analyzer events
        this.audioAnalyzer.on('volumeUpdate', (volumeData) => {
            this.handleVolumeUpdate(volumeData);
        });
        
        this.audioAnalyzer.on('error', (error) => {
            logger.error('AudioAnalyzer error:', error);
            this.emit('error', error);
        });
        
        // Servo controller events (when available)
        this.on('servoControllerReady', () => {
            this.servoController.on('positionChanged', (data) => {
                this.emit('servoPositionChanged', data);
                
                // Broadcast to WebSocket clients
                if (this.webSocket) {
                    this.webSocket.broadcast('servoPosition', data);
                }
            });
            
            this.servoController.on('error', (error) => {
                logger.error('ServoController error:', error);
                this.emit('error', error);
            });
        });
    }
    
    /**
     * Setup WebSocket event handlers
     */
    setupWebSocketHandlers() {
        this.webSocket.on('characterSelected', (data) => {
            logger.debug('Character selected via WebSocket:', data.characterId);
        });
        
        this.webSocket.on('configUpdate', async (data) => {
            try {
                await this.config.setCharacterConfig(data.characterId, data.config);
                
                // Update running components if this is the active character
                if (data.characterId === this.currentCharacterId) {
                    this.updateActiveConfiguration(data.config);
                }
                
            } catch (error) {
                logger.error('Error updating configuration via WebSocket:', error);
            }
        });
        
        this.webSocket.on('servoCommand', (data) => {
            this.handleWebSocketServoCommand(data);
        });
    }
    
    /**
     * Handle volume updates from audio analyzer
     * @param {Object} volumeData - Volume data from analyzer
     */
    handleVolumeUpdate(volumeData) {
        if (!this.isRunning || !this.servoController) {
            return;
        }
        
        const startTime = Date.now();
        
        // Map volume to servo position
        const servoPosition = this.servoMapper.mapVolumeToPosition(volumeData.smoothed);

        // Check if servo should be idle to reduce jitter
        const servoState = this.servoMapper.getState();

        if (servoState.shouldStop) {
            // Stop servo PWM to reduce jitter when idle
            if (this.servoController.stopServo) {
                this.servoController.stopServo().catch(error => {
                    logger.error('Error stopping servo:', error);
                });
            }
        } else {
            // Move servo to new position
            this.servoController.moveToPosition(servoPosition).catch(error => {
                logger.error('Error moving servo:', error);
            });
        }

        // Update performance stats
        const latency = Date.now() - startTime;
        this.updatePerformanceStats(latency);

        // Emit volume update event with servo state
        this.emit('volumeUpdate', {
            ...volumeData,
            servoPosition,
            servoState,
            latency
        });
        
        // Broadcast to WebSocket clients
        if (this.webSocket) {
            this.webSocket.broadcast('volumeUpdate', {
                volume: volumeData.smoothed,
                servoPosition,
                characterId: this.currentCharacterId
            });
        }
    }
    
    /**
     * Handle servo commands from WebSocket
     * @param {Object} data - Command data
     */
    async handleWebSocketServoCommand(data) {
        if (!this.servoController || data.characterId !== this.currentCharacterId) {
            return;
        }
        
        try {
            switch (data.command.type) {
                case 'test':
                    await this.servoController.testServo();
                    break;
                    
                case 'calibrate':
                    await this.servoController.calibrate();
                    break;
                    
                case 'moveToPosition':
                    await this.servoController.moveToPosition(data.command.position);
                    break;
                    
                default:
                    logger.warn('Unknown servo command:', data.command.type);
            }
        } catch (error) {
            logger.error('Error executing servo command:', error);
        }
    }
    
    /**
     * Update active configuration for running components
     * @param {Object} config - New configuration
     */
    updateActiveConfiguration(config) {
        if (config.audioAnalysis && this.audioAnalyzer) {
            this.audioAnalyzer.updateOptions(config.audioAnalysis);
        }
        
        if (config.servoMapping && this.servoMapper) {
            this.servoMapper.updateOptions(config.servoMapping);
        }
        
        if (config.servoMapping && this.servoController) {
            this.servoController.updateOptions({
                minAngle: config.servoMapping.minPosition,
                maxAngle: config.servoMapping.maxPosition
            });
        }
        
        logger.debug('Active configuration updated');
    }
    
    /**
     * Get servo information from MonsterBox parts system
     * @param {number} servoId - Servo part ID
     * @returns {Promise<Object>} Servo information
     */
    async getServoInfo(servoId) {
        // This will integrate with MonsterBox's part service
        // For now, return mock data
        return {
            id: servoId,
            type: 'servo',
            pin: 3,
            channel: 0,
            usePCA9685: false,
            servoType: 'Standard',
            minPulse: 500,
            maxPulse: 2500,
            defaultAngle: 90
        };
    }
    
    /**
     * Update performance statistics
     * @param {number} latency - Current operation latency
     */
    updatePerformanceStats(latency) {
        this.updateCount++;
        this.latencySum += latency;
        
        if (this.updateCount % 50 === 0) { // Update every 50 operations
            this.performanceStats.averageLatency = this.latencySum / this.updateCount;
            this.updateCount = 0;
            this.latencySum = 0;
        }
    }
    
    /**
     * Start performance monitoring
     */
    startPerformanceMonitoring() {
        this.performanceInterval = setInterval(() => {
            // Calculate updates per second
            const now = Date.now();
            const timeDiff = (now - this.lastVolumeUpdate) / 1000;
            this.performanceStats.updatesPerSecond = timeDiff > 0 ? 1 / timeDiff : 0;
            
            // Get memory usage
            const memUsage = process.memoryUsage();
            this.performanceStats.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB
            
            this.emit('performanceUpdate', this.performanceStats);
        }, 5000); // Every 5 seconds
    }
    
    /**
     * Get current system status
     * @returns {Object} System status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            currentCharacterId: this.currentCharacterId,
            activeServoId: this.activeServoId,
            performanceStats: { ...this.performanceStats },
            connectedClients: this.webSocket ? this.webSocket.getClients().length : 0
        };
    }
    
    /**
     * Shutdown the system
     * @returns {Promise} Promise that resolves when shutdown is complete
     */
    async shutdown() {
        logger.info('Shutting down JawAnimationSystem');
        
        await this.stopAnimation();
        
        if (this.performanceInterval) {
            clearInterval(this.performanceInterval);
        }
        
        if (this.webSocket) {
            await this.webSocket.stop();
        }
        
        logger.info('JawAnimationSystem shutdown complete');
        this.emit('shutdown');
    }
}

module.exports = JawAnimationSystem;
