/**
 * Improved Jaw Animation Controller
 * Addresses jaw chattering and insufficient mouth opening issues
 */

const EventEmitter = require('events');
const logger = require('../../scripts/logger');

class ImprovedJawController extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Servo configuration
            servoId: options.servoId || '23',
            closedAngle: options.closedAngle || 50,    // ChatterPi closed position
            openAngle: options.openAngle || 30,        // ChatterPi open position
            
            // Audio processing
            volumeThreshold: options.volumeThreshold || 0.01,  // Lower threshold for more sensitivity
            volumeMax: options.volumeMax || 0.5,               // Maximum expected volume
            sensitivity: options.sensitivity || 2.0,           // Increased sensitivity
            
            // Smoothing and jitter reduction
            smoothingFactor: options.smoothingFactor || 0.6,   // Less smoothing for more responsiveness
            stepThreshold: options.stepThreshold || 0.3,       // Smaller threshold for more movement
            idleTimeout: options.idleTimeout || 1.5,           // Shorter timeout
            
            // Movement characteristics
            attackTime: options.attackTime || 0.02,            // Faster attack
            releaseTime: options.releaseTime || 0.08,          // Faster release
            updateRate: options.updateRate || 60,              // Higher update rate
            
            // Jitter reduction
            enableJitterReduction: options.enableJitterReduction !== false,
            pwmStopDelay: options.pwmStopDelay || 100,         // ms to wait before stopping PWM
            
            ...options
        };
        
        // State tracking
        this.currentAngle = this.options.closedAngle;
        this.targetAngle = this.options.closedAngle;
        this.smoothedVolume = 0;
        this.lastVolumeTime = 0;
        this.lastMoveTime = 0;
        this.isIdle = true;
        this.pwmActive = false;
        
        // Animation state
        this.isRunning = false;
        this.animationLoop = null;
        this.idleTimer = null;
        
        // Performance tracking
        this.stats = {
            updatesPerSecond: 0,
            averageLatency: 0,
            totalUpdates: 0,
            jitterReductions: 0
        };
        
        // WebSocket client for servo communication
        this.servoClient = null;
        
        logger.info('🦷 Improved Jaw Controller initialized', {
            servoId: this.options.servoId,
            closedAngle: this.options.closedAngle,
            openAngle: this.options.openAngle,
            sensitivity: this.options.sensitivity
        });
    }
    
    setServoClient(servoClient) {
        this.servoClient = servoClient;
        logger.info('✅ Servo client connected to jaw controller');
    }
    
    async start() {
        if (this.isRunning) {
            logger.warn('Jaw controller already running');
            return;
        }
        
        if (!this.servoClient) {
            throw new Error('Servo client not set - call setServoClient() first');
        }
        
        this.isRunning = true;
        this.lastVolumeTime = Date.now();
        
        // Start animation loop
        this.animationLoop = setInterval(() => {
            this.updateAnimation();
        }, 1000 / this.options.updateRate);
        
        // Start idle monitoring
        this.startIdleMonitoring();
        
        // Move to closed position initially
        await this.moveToAngle(this.options.closedAngle, true);
        
        logger.info('🎬 Improved jaw animation started');
        this.emit('started');
    }
    
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        this.isRunning = false;
        
        // Clear timers
        if (this.animationLoop) {
            clearInterval(this.animationLoop);
            this.animationLoop = null;
        }
        
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        
        // Return to closed position and stop PWM
        await this.moveToAngle(this.options.closedAngle, true);
        await this.stopPWM();
        
        logger.info('🛑 Improved jaw animation stopped');
        this.emit('stopped');
    }
    
    updateVolume(volume) {
        if (!this.isRunning) {
            return;
        }
        
        const now = Date.now();
        this.lastVolumeTime = now;
        
        // Apply volume processing
        const processedVolume = this.processVolume(volume);
        
        // Update smoothed volume with attack/release
        const timeDelta = (now - this.lastMoveTime) / 1000;
        const isAttack = processedVolume > this.smoothedVolume;
        const responseTime = isAttack ? this.options.attackTime : this.options.releaseTime;
        const alpha = Math.min(1, timeDelta / responseTime);
        
        this.smoothedVolume = this.smoothedVolume + alpha * (processedVolume - this.smoothedVolume);
        
        // Calculate target angle
        this.targetAngle = this.volumeToAngle(this.smoothedVolume);
        
        // Reset idle state
        if (this.isIdle && processedVolume > this.options.volumeThreshold) {
            this.isIdle = false;
            this.emit('audioDetected');
        }
        
        // Update stats
        this.stats.totalUpdates++;
    }
    
    processVolume(rawVolume) {
        // Apply threshold
        if (rawVolume < this.options.volumeThreshold) {
            return 0;
        }
        
        // Normalize volume
        const normalizedVolume = Math.min(1, rawVolume / this.options.volumeMax);
        
        // Apply sensitivity with exponential curve for more dramatic movement
        const sensitiveVolume = Math.pow(normalizedVolume, 0.7) * this.options.sensitivity;
        
        return Math.min(1, sensitiveVolume);
    }
    
    volumeToAngle(volume) {
        if (volume <= 0) {
            return this.options.closedAngle;
        }
        
        // Calculate angle range (note: open angle is smaller than closed for ChatterPi)
        const angleRange = Math.abs(this.options.closedAngle - this.options.openAngle);
        
        // Apply exponential curve for more natural jaw movement
        const curvedVolume = Math.pow(volume, 0.8);
        
        // Map to angle (closed=50°, open=30°, so we subtract from closed)
        const targetAngle = this.options.closedAngle - (curvedVolume * angleRange);
        
        // Ensure we don't go beyond the open position
        return Math.max(this.options.openAngle, Math.min(this.options.closedAngle, targetAngle));
    }
    
    updateAnimation() {
        if (!this.isRunning) {
            return;
        }
        
        const now = Date.now();
        
        // Check if we should move the servo
        const angleDiff = Math.abs(this.targetAngle - this.currentAngle);
        
        if (angleDiff > this.options.stepThreshold) {
            this.moveToAngle(this.targetAngle, false);
            this.lastMoveTime = now;
        }
        
        // Update performance stats
        this.updateStats();
    }
    
    async moveToAngle(angle, force = false) {
        if (!this.servoClient) {
            logger.warn('No servo client available for jaw movement');
            return;
        }
        
        // Check if movement is necessary
        if (!force && Math.abs(angle - this.currentAngle) < this.options.stepThreshold) {
            if (this.options.enableJitterReduction) {
                this.stats.jitterReductions++;
                return;
            }
        }
        
        try {
            // Move servo via WebSocket
            await this.servoClient.moveServo(this.options.servoId, angle, 0.02);
            
            this.currentAngle = angle;
            this.pwmActive = true;
            
            // Schedule PWM stop for jitter reduction
            if (this.options.enableJitterReduction) {
                this.schedulePWMStop();
            }
            
            this.emit('moved', { angle, timestamp: Date.now() });
            
        } catch (error) {
            logger.error('Error moving jaw servo:', error);
            this.emit('error', error);
        }
    }
    
    schedulePWMStop() {
        // Clear existing timer
        if (this.pwmStopTimer) {
            clearTimeout(this.pwmStopTimer);
        }
        
        // Schedule PWM stop after delay
        this.pwmStopTimer = setTimeout(async () => {
            if (this.isIdle && this.pwmActive) {
                await this.stopPWM();
            }
        }, this.options.pwmStopDelay);
    }
    
    async stopPWM() {
        if (!this.servoClient || !this.pwmActive) {
            return;
        }
        
        try {
            await this.servoClient.stopServo(this.options.servoId);
            this.pwmActive = false;
            this.emit('pwmStopped');
        } catch (error) {
            logger.error('Error stopping servo PWM:', error);
        }
    }
    
    startIdleMonitoring() {
        const checkIdle = () => {
            if (!this.isRunning) {
                return;
            }
            
            const now = Date.now();
            const timeSinceLastVolume = now - this.lastVolumeTime;
            
            if (timeSinceLastVolume > this.options.idleTimeout * 1000) {
                if (!this.isIdle) {
                    this.isIdle = true;
                    this.smoothedVolume = 0;
                    this.targetAngle = this.options.closedAngle;
                    this.emit('idle');
                }
            }
            
            // Schedule next check
            this.idleTimer = setTimeout(checkIdle, 100);
        };
        
        checkIdle();
    }
    
    updateStats() {
        const now = Date.now();
        if (!this.lastStatsUpdate) {
            this.lastStatsUpdate = now;
            return;
        }
        
        const deltaTime = (now - this.lastStatsUpdate) / 1000;
        if (deltaTime >= 1) {
            this.stats.updatesPerSecond = this.stats.totalUpdates / deltaTime;
            this.stats.totalUpdates = 0;
            this.lastStatsUpdate = now;
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            currentAngle: this.currentAngle,
            targetAngle: this.targetAngle,
            smoothedVolume: this.smoothedVolume,
            isIdle: this.isIdle,
            pwmActive: this.pwmActive,
            isRunning: this.isRunning
        };
    }
}

module.exports = ImprovedJawController;

// Integration helper for existing systems
class JawAnimationIntegration {
    constructor() {
        this.jawController = null;
        this.servoClient = null;
        this.audioProcessor = null;
    }

    async initialize(options = {}) {
        const { getServoClient } = require('../../services/servoWebSocketClient');

        // Initialize servo client
        this.servoClient = getServoClient();

        // Wait for connection
        await new Promise((resolve, reject) => {
            if (this.servoClient.isConnected) {
                resolve();
            } else {
                const timeout = setTimeout(() => {
                    reject(new Error('Servo client connection timeout'));
                }, 5000);

                this.servoClient.once('connected', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            }
        });

        // Initialize improved jaw controller
        this.jawController = new ImprovedJawController(options);
        this.jawController.setServoClient(this.servoClient);

        // Set up audio processing
        this.setupAudioProcessing();

        logger.info('🎯 Jaw animation integration initialized');
    }

    setupAudioProcessing() {
        // This would integrate with existing audio systems
        // For now, we'll create a simple interface
        this.audioProcessor = {
            onVolumeUpdate: (volume) => {
                if (this.jawController) {
                    this.jawController.updateVolume(volume);
                }
            }
        };
    }

    async start(characterId = 4) {
        if (!this.jawController) {
            throw new Error('Jaw controller not initialized');
        }

        await this.jawController.start();
        logger.info(`🎬 Started improved jaw animation for character ${characterId}`);
    }

    async stop() {
        if (this.jawController) {
            await this.jawController.stop();
        }
        logger.info('🛑 Stopped improved jaw animation');
    }

    updateVolume(volume) {
        if (this.audioProcessor) {
            this.audioProcessor.onVolumeUpdate(volume);
        }
    }

    getStats() {
        return this.jawController ? this.jawController.getStats() : null;
    }
}

module.exports.JawAnimationIntegration = JawAnimationIntegration;
