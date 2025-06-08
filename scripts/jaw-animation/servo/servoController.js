// scripts/jaw-animation/servo/servoController.js

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../../logger');

/**
 * Servo controller for jaw animation
 * Integrates with MonsterBox's existing servo control infrastructure
 */
class ServoController extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            servoId: options.servoId || null,           // MonsterBox servo part ID
            characterId: options.characterId || null,   // Character ID
            controlType: options.controlType || 'gpio', // 'gpio' or 'pca9685'
            pin: options.pin || 3,                      // GPIO pin number
            channel: options.channel || 0,              // PCA9685 channel
            servoType: options.servoType || 'Standard', // Servo type from servos.json
            
            // Position limits
            minAngle: options.minAngle || 0,
            maxAngle: options.maxAngle || 180,
            
            // Performance settings
            updateRate: options.updateRate || 50,       // Updates per second
            positionTolerance: options.positionTolerance || 1, // Degrees
            
            ...options
        };
        
        this.currentPosition = this.options.minAngle;
        this.targetPosition = this.options.minAngle;
        this.isMoving = false;
        this.lastCommandTime = 0;
        this.commandQueue = [];
        this.isProcessingQueue = false;
        
        // Rate limiting
        this.minCommandInterval = 1000 / this.options.updateRate; // ms between commands
        
        logger.info('ServoController initialized for servo:', this.options.servoId);
    }
    
    /**
     * Move servo to specified position
     * @param {number} angle - Target angle in degrees
     * @param {number} duration - Movement duration in milliseconds (optional)
     * @returns {Promise} Promise that resolves when movement is complete
     */
    async moveToPosition(angle, duration = null) {
        // Validate angle
        angle = Math.max(this.options.minAngle, Math.min(this.options.maxAngle, angle));
        
        // Check if movement is necessary
        if (Math.abs(angle - this.currentPosition) < this.options.positionTolerance) {
            return Promise.resolve();
        }
        
        this.targetPosition = angle;
        
        // Add to command queue with rate limiting
        return new Promise((resolve, reject) => {
            this.commandQueue.push({
                angle,
                duration,
                resolve,
                reject,
                timestamp: Date.now()
            });
            
            this.processCommandQueue();
        });
    }
    
    /**
     * Process the command queue with rate limiting
     */
    async processCommandQueue() {
        if (this.isProcessingQueue || this.commandQueue.length === 0) {
            return;
        }
        
        this.isProcessingQueue = true;
        
        while (this.commandQueue.length > 0) {
            const command = this.commandQueue.shift();
            const now = Date.now();
            
            // Rate limiting
            const timeSinceLastCommand = now - this.lastCommandTime;
            if (timeSinceLastCommand < this.minCommandInterval) {
                const delay = this.minCommandInterval - timeSinceLastCommand;
                await this.sleep(delay);
            }
            
            try {
                await this.executeServoCommand(command.angle, command.duration);
                this.currentPosition = command.angle;
                this.lastCommandTime = Date.now();
                command.resolve();
                
                this.emit('positionChanged', {
                    position: this.currentPosition,
                    target: this.targetPosition,
                    servoId: this.options.servoId
                });
                
            } catch (error) {
                logger.error('Servo command failed:', error);
                command.reject(error);
                this.emit('error', error);
            }
        }
        
        this.isProcessingQueue = false;
    }
    
    /**
     * Execute servo command using MonsterBox's servo control system
     * @param {number} angle - Target angle
     * @param {number} duration - Duration in milliseconds
     * @returns {Promise} Promise that resolves when command is sent
     */
    executeServoCommand(angle, duration = 1000) {
        return new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, '..', '..', 'servo_control.py');
            
            const args = [
                'test',                                    // command
                this.options.controlType,                  // control_type (gpio or pca9685)
                this.options.controlType === 'pca9685' ? 
                    this.options.channel.toString() : 
                    this.options.pin.toString(),           // pin_or_channel
                angle.toString(),                          // angle
                (duration / 1000).toString(),              // duration in seconds
                this.options.servoType                     // servo_type
            ];
            
            logger.debug('Executing servo command:', { args, servoId: this.options.servoId });
            
            const process = spawn('python3', [scriptPath, ...args]);
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0) {
                    try {
                        // Parse JSON response from servo_control.py
                        const lines = stdout.trim().split('\n');
                        const lastLine = lines[lines.length - 1];
                        const response = JSON.parse(lastLine);
                        
                        if (response.status === 'success') {
                            resolve(response);
                        } else {
                            reject(new Error(response.message || 'Servo command failed'));
                        }
                    } catch (parseError) {
                        // If JSON parsing fails, assume success if exit code is 0
                        logger.debug('Servo command completed (non-JSON response)');
                        resolve({ status: 'success' });
                    }
                } else {
                    reject(new Error(`Servo command failed with code ${code}: ${stderr}`));
                }
            });
            
            process.on('error', (error) => {
                reject(new Error(`Failed to execute servo command: ${error.message}`));
            });
        });
    }
    
    /**
     * Test servo movement
     * @returns {Promise} Promise that resolves when test is complete
     */
    async testServo() {
        logger.info('Testing servo movement for servo:', this.options.servoId);
        
        try {
            // Move to center position
            await this.moveToPosition((this.options.minAngle + this.options.maxAngle) / 2);
            await this.sleep(500);
            
            // Move to max position
            await this.moveToPosition(this.options.maxAngle);
            await this.sleep(500);
            
            // Move to min position
            await this.moveToPosition(this.options.minAngle);
            await this.sleep(500);
            
            // Return to center
            await this.moveToPosition((this.options.minAngle + this.options.maxAngle) / 2);
            
            logger.info('Servo test completed successfully');
            this.emit('testCompleted', { servoId: this.options.servoId });
            
        } catch (error) {
            logger.error('Servo test failed:', error);
            this.emit('testFailed', { servoId: this.options.servoId, error });
            throw error;
        }
    }
    
    /**
     * Calibrate servo positions
     * @returns {Promise} Promise that resolves when calibration is complete
     */
    async calibrate() {
        logger.info('Calibrating servo:', this.options.servoId);
        
        try {
            // Test full range of motion
            const testPositions = [
                this.options.minAngle,
                this.options.minAngle + (this.options.maxAngle - this.options.minAngle) * 0.25,
                this.options.minAngle + (this.options.maxAngle - this.options.minAngle) * 0.5,
                this.options.minAngle + (this.options.maxAngle - this.options.minAngle) * 0.75,
                this.options.maxAngle
            ];
            
            for (const position of testPositions) {
                await this.moveToPosition(position);
                await this.sleep(1000);
            }
            
            // Return to neutral position
            await this.moveToPosition(this.options.minAngle);
            
            logger.info('Servo calibration completed');
            this.emit('calibrationCompleted', { servoId: this.options.servoId });
            
        } catch (error) {
            logger.error('Servo calibration failed:', error);
            this.emit('calibrationFailed', { servoId: this.options.servoId, error });
            throw error;
        }
    }
    
    /**
     * Get current servo status
     * @returns {Object} Servo status
     */
    getStatus() {
        return {
            servoId: this.options.servoId,
            characterId: this.options.characterId,
            currentPosition: this.currentPosition,
            targetPosition: this.targetPosition,
            isMoving: this.isMoving,
            queueLength: this.commandQueue.length,
            options: { ...this.options }
        };
    }
    
    /**
     * Update servo options
     * @param {Object} newOptions - New options to apply
     */
    updateOptions(newOptions) {
        this.options = { ...this.options, ...newOptions };
        
        // Update rate limiting
        this.minCommandInterval = 1000 / this.options.updateRate;
        
        logger.debug('ServoController options updated:', newOptions);
        this.emit('optionsUpdated', this.options);
    }
    
    /**
     * Stop all servo movement
     */
    stop() {
        this.commandQueue = [];
        this.isMoving = false;
        logger.info('Servo movement stopped for servo:', this.options.servoId);
        this.emit('stopped', { servoId: this.options.servoId });
    }
    
    /**
     * Utility function to sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise} Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = ServoController;
