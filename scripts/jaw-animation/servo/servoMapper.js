// scripts/jaw-animation/servo/servoMapper.js

const logger = require('../../logger');

/**
 * Maps audio volume levels to servo positions for jaw animation
 * Supports different response curves and character-specific configurations
 */
class ServoMapper {
    constructor(options = {}) {
        this.options = {
            // Servo position range
            minPosition: options.minPosition || 0,      // Closed jaw position
            maxPosition: options.maxPosition || 180,    // Open jaw position
            
            // Volume mapping
            volumeThreshold: options.volumeThreshold || 0.01,  // Minimum volume to trigger movement
            volumeMax: options.volumeMax || 1.0,               // Maximum expected volume
            
            // Response curve settings
            responseCurve: options.responseCurve || 'linear',  // linear, exponential, logarithmic, custom
            sensitivity: options.sensitivity || 1.0,           // Sensitivity multiplier
            
            // Smoothing and timing
            smoothingFactor: options.smoothingFactor || 0.7,   // Position smoothing
            attackTime: options.attackTime || 0.05,            // Time to open (seconds)
            releaseTime: options.releaseTime || 0.15,          // Time to close (seconds)
            
            // Advanced settings
            deadZone: options.deadZone || 0.02,               // Volume dead zone
            compressionRatio: options.compressionRatio || 1.0, // Dynamic range compression
            
            ...options
        };
        
        this.currentPosition = this.options.minPosition;
        this.targetPosition = this.options.minPosition;
        this.lastUpdateTime = Date.now();
        
        // Response curve functions
        this.responseCurves = {
            linear: this.linearCurve.bind(this),
            exponential: this.exponentialCurve.bind(this),
            logarithmic: this.logarithmicCurve.bind(this),
            custom: this.customCurve.bind(this)
        };
        
        logger.info('ServoMapper initialized with options:', this.options);
    }
    
    /**
     * Map volume level to servo position
     * @param {number} volume - Volume level (0-1)
     * @param {number} deltaTime - Time since last update (seconds)
     * @returns {number} Servo position (degrees)
     */
    mapVolumeToPosition(volume, deltaTime = null) {
        if (deltaTime === null) {
            const now = Date.now();
            deltaTime = (now - this.lastUpdateTime) / 1000;
            this.lastUpdateTime = now;
        }
        
        // Apply dead zone
        if (volume < this.options.deadZone) {
            volume = 0;
        } else {
            volume = (volume - this.options.deadZone) / (1 - this.options.deadZone);
        }
        
        // Apply volume threshold
        if (volume < this.options.volumeThreshold) {
            this.targetPosition = this.options.minPosition;
        } else {
            // Normalize volume to 0-1 range
            const normalizedVolume = Math.min(volume / this.options.volumeMax, 1.0);
            
            // Apply sensitivity
            const sensitiveVolume = Math.min(normalizedVolume * this.options.sensitivity, 1.0);
            
            // Apply compression
            const compressedVolume = this.applyCompression(sensitiveVolume);
            
            // Apply response curve
            const curveFunction = this.responseCurves[this.options.responseCurve] || this.responseCurves.linear;
            const curvedVolume = curveFunction(compressedVolume);
            
            // Map to servo position range
            this.targetPosition = this.options.minPosition + 
                (curvedVolume * (this.options.maxPosition - this.options.minPosition));
        }
        
        // Apply smoothing with attack/release timing
        this.currentPosition = this.applySmoothingWithTiming(
            this.currentPosition, 
            this.targetPosition, 
            deltaTime
        );
        
        // Ensure position is within bounds
        this.currentPosition = Math.max(this.options.minPosition, 
            Math.min(this.options.maxPosition, this.currentPosition));
        
        return Math.round(this.currentPosition);
    }
    
    /**
     * Apply dynamic range compression
     * @param {number} volume - Input volume (0-1)
     * @returns {number} Compressed volume (0-1)
     */
    applyCompression(volume) {
        if (this.options.compressionRatio === 1.0) {
            return volume;
        }
        
        // Simple compression algorithm
        const threshold = 0.5;
        if (volume <= threshold) {
            return volume;
        } else {
            const excess = volume - threshold;
            const compressedExcess = excess / this.options.compressionRatio;
            return threshold + compressedExcess;
        }
    }
    
    /**
     * Apply smoothing with different attack and release times
     * @param {number} current - Current position
     * @param {number} target - Target position
     * @param {number} deltaTime - Time delta in seconds
     * @returns {number} New position
     */
    applySmoothingWithTiming(current, target, deltaTime) {
        if (target > current) {
            // Attack (opening) - faster response
            const attackRate = 1.0 / this.options.attackTime;
            const maxChange = attackRate * deltaTime * (this.options.maxPosition - this.options.minPosition);
            return Math.min(target, current + maxChange);
        } else {
            // Release (closing) - slower response
            const releaseRate = 1.0 / this.options.releaseTime;
            const maxChange = releaseRate * deltaTime * (this.options.maxPosition - this.options.minPosition);
            return Math.max(target, current - maxChange);
        }
    }
    
    /**
     * Linear response curve
     * @param {number} volume - Input volume (0-1)
     * @returns {number} Mapped volume (0-1)
     */
    linearCurve(volume) {
        return volume;
    }
    
    /**
     * Exponential response curve (more sensitive to quiet sounds)
     * @param {number} volume - Input volume (0-1)
     * @returns {number} Mapped volume (0-1)
     */
    exponentialCurve(volume) {
        return Math.pow(volume, 0.5); // Square root for gentler curve
    }
    
    /**
     * Logarithmic response curve (less sensitive to loud sounds)
     * @param {number} volume - Input volume (0-1)
     * @returns {number} Mapped volume (0-1)
     */
    logarithmicCurve(volume) {
        if (volume <= 0) return 0;
        return Math.log10(volume * 9 + 1); // Log base 10, scaled
    }
    
    /**
     * Custom response curve (can be overridden)
     * @param {number} volume - Input volume (0-1)
     * @returns {number} Mapped volume (0-1)
     */
    customCurve(volume) {
        // Default custom curve is sigmoid-like
        return 1 / (1 + Math.exp(-6 * (volume - 0.5)));
    }
    
    /**
     * Update mapper options
     * @param {Object} newOptions - New options to apply
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        logger.debug('ServoMapper options updated:', newOptions);
    }
    
    /**
     * Reset mapper state
     */
    reset() {
        this.currentPosition = this.options.minPosition;
        this.targetPosition = this.options.minPosition;
        this.lastUpdateTime = Date.now();
        logger.debug('ServoMapper state reset');
    }
    
    /**
     * Get current mapper state
     * @returns {Object} Current state
     */
    getState() {
        return {
            currentPosition: this.currentPosition,
            targetPosition: this.targetPosition,
            options: { ...this.options }
        };
    }
    
    /**
     * Create preset configurations for different character types
     * @param {string} characterType - Type of character (skeleton, bear, fish, etc.)
     * @returns {Object} Preset configuration
     */
    static createPreset(characterType) {
        const presets = {
            skeleton: {
                responseCurve: 'exponential',
                sensitivity: 1.2,
                attackTime: 0.03,
                releaseTime: 0.1,
                minPosition: 10,
                maxPosition: 45
            },
            bear: {
                responseCurve: 'linear',
                sensitivity: 0.8,
                attackTime: 0.05,
                releaseTime: 0.2,
                minPosition: 0,
                maxPosition: 60
            },
            fish: {
                responseCurve: 'logarithmic',
                sensitivity: 1.5,
                attackTime: 0.02,
                releaseTime: 0.08,
                minPosition: 5,
                maxPosition: 35
            },
            demon: {
                responseCurve: 'custom',
                sensitivity: 1.0,
                attackTime: 0.04,
                releaseTime: 0.15,
                minPosition: 0,
                maxPosition: 70
            },
            default: {
                responseCurve: 'linear',
                sensitivity: 1.0,
                attackTime: 0.05,
                releaseTime: 0.15,
                minPosition: 0,
                maxPosition: 180
            }
        };
        
        return presets[characterType] || presets.default;
    }
}

module.exports = ServoMapper;
