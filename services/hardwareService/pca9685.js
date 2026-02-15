/**
 * PCA9685 PWM Driver Service for MonsterBox
 * Direct local function calls for PCA9685 servo control
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PCA9685 configuration
const PCA9685_CONFIG = {
    defaultAddress: 0x40,
    defaultFrequency: 50,
    channels: 16,
    maxDutyCycle: 65535,
    pwmPeriodUs: 20000 // 20ms for 50Hz
};

/**
 * Initialize PCA9685 controller
 * @param {Object} config - PCA9685 configuration
 * @param {number} config.address - I2C address (default: 0x40)
 * @param {number} config.frequency - PWM frequency in Hz (default: 50)
 * @returns {Promise<Object>} - Initialization result
 */
export async function initializePCA9685(config = {}) {
    const address = config.address || PCA9685_CONFIG.defaultAddress;
    const frequency = config.frequency || PCA9685_CONFIG.defaultFrequency;
    
    try {
        console.log(`🔧 Initializing PCA9685 at address 0x${address.toString(16).padStart(2, '0')} with ${frequency}Hz`);
        
        // For now, simulate initialization - will be replaced with actual hardware calls
        return {
            success: true,
            address: address,
            frequency: frequency,
            channels: PCA9685_CONFIG.channels,
            message: `PCA9685 initialized at 0x${address.toString(16).padStart(2, '0')}`
        };
    } catch (error) {
        console.error('Error initializing PCA9685:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Set PWM pulse width on PCA9685 channel
 * @param {Object} params - PWM parameters
 * @param {number} params.channel - Channel number (0-15)
 * @param {number} params.pulseWidthUs - Pulse width in microseconds
 * @param {number} params.address - I2C address (optional)
 * @param {number} params.frequency - PWM frequency (optional)
 * @returns {Promise<Object>} - Command result
 */
export async function setPWM({ channel, pulseWidthUs, address, frequency }) {
    if (channel < 0 || channel >= PCA9685_CONFIG.channels) {
        throw new Error(`Invalid channel: ${channel}. Must be 0-${PCA9685_CONFIG.channels - 1}`);
    }
    
    if (pulseWidthUs < 0 || pulseWidthUs > PCA9685_CONFIG.pwmPeriodUs) {
        throw new Error(`Invalid pulse width: ${pulseWidthUs}µs. Must be 0-${PCA9685_CONFIG.pwmPeriodUs}µs`);
    }
    
    const i2cAddress = address || PCA9685_CONFIG.defaultAddress;
    const pwmFreq = frequency || PCA9685_CONFIG.defaultFrequency;
    
    try {
        // Calculate duty cycle
        const dutyCycle = Math.round((pulseWidthUs / PCA9685_CONFIG.pwmPeriodUs) * PCA9685_CONFIG.maxDutyCycle);
        
        console.log(`📡 PCA9685 Ch${channel}: ${pulseWidthUs}µs (duty: ${dutyCycle})`);
        
        // For now, simulate PWM control - will be replaced with actual hardware calls
        return {
            success: true,
            channel: channel,
            pulseWidthUs: pulseWidthUs,
            dutyCycle: dutyCycle,
            address: i2cAddress,
            frequency: pwmFreq,
            message: `PWM set on channel ${channel}`
        };
    } catch (error) {
        console.error('Error setting PWM:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Move servo to specific angle using PCA9685
 * @param {Object} params - Servo movement parameters
 * @param {number} params.channel - PCA9685 channel
 * @param {number} params.angleDeg - Target angle in degrees
 * @param {number} params.minPulse - Minimum pulse width in µs (default: 500)
 * @param {number} params.maxPulse - Maximum pulse width in µs (default: 2500)
 * @param {number} params.minAngle - Minimum angle in degrees (default: 0)
 * @param {number} params.maxAngle - Maximum angle in degrees (default: 180)
 * @param {number} params.address - I2C address (optional)
 * @returns {Promise<Object>} - Movement result
 */
export async function moveServoToAngle({ 
    channel, 
    angleDeg, 
    minPulse = 500, 
    maxPulse = 2500, 
    minAngle = 0, 
    maxAngle = 180,
    address 
}) {
    // Validate angle range
    if (angleDeg < minAngle || angleDeg > maxAngle) {
        throw new Error(`Angle ${angleDeg}° out of range (${minAngle}°-${maxAngle}°)`);
    }
    
    // Convert angle to pulse width
    const angleRange = maxAngle - minAngle;
    const pulseRange = maxPulse - minPulse;
    const normalizedAngle = (angleDeg - minAngle) / angleRange;
    const pulseWidthUs = Math.round(minPulse + (normalizedAngle * pulseRange));
    
    try {
        const result = await setPWM({ channel, pulseWidthUs, address });
        
        return {
            ...result,
            angleDeg: angleDeg,
            pulseWidthUs: pulseWidthUs,
            message: `Servo on channel ${channel} moved to ${angleDeg}°`
        };
    } catch (error) {
        console.error('Error moving servo:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Control continuous servo rotation using PCA9685
 * @param {Object} params - Continuous servo parameters
 * @param {number} params.channel - PCA9685 channel
 * @param {string} params.direction - 'cw', 'ccw', or 'stop'
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.address - I2C address (optional)
 * @returns {Promise<Object>} - Control result
 */
export async function controlContinuousServo({ channel, direction, speed = 50, address }) {
    const validDirections = ['cw', 'ccw', 'stop'];
    if (!validDirections.includes(direction)) {
        throw new Error(`Invalid direction: ${direction}. Must be one of: ${validDirections.join(', ')}`);
    }
    
    if (speed < 0 || speed > 100) {
        throw new Error(`Invalid speed: ${speed}%. Must be 0-100%`);
    }
    
    let pulseWidthUs;
    
    switch (direction) {
        case 'stop':
            pulseWidthUs = 1500; // Neutral position
            break;
        case 'cw':
            // CW rotation: 700-1500µs (faster as pulse decreases)
            pulseWidthUs = Math.round(1500 - (speed / 100) * 800);
            break;
        case 'ccw':
            // CCW rotation: 1500-2300µs (faster as pulse increases)
            pulseWidthUs = Math.round(1500 + (speed / 100) * 800);
            break;
    }
    
    try {
        const result = await setPWM({ channel, pulseWidthUs, address });
        
        return {
            ...result,
            direction: direction,
            speed: speed,
            message: `Continuous servo on channel ${channel} ${direction === 'stop' ? 'stopped' : `rotating ${direction} at ${speed}% speed`}`
        };
    } catch (error) {
        console.error('Error controlling continuous servo:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Stop all servos on PCA9685
 * @param {Object} params - Stop parameters
 * @param {number} params.address - I2C address (optional)
 * @returns {Promise<Object>} - Stop result
 */
export async function stopAllServos({ address } = {}) {
    try {
        const results = [];
        
        // Set all channels to 0 duty cycle (off)
        for (let channel = 0; channel < PCA9685_CONFIG.channels; channel++) {
            const result = await setPWM({ channel, pulseWidthUs: 0, address });
            results.push(result);
        }
        
        return {
            success: true,
            channelsCleared: PCA9685_CONFIG.channels,
            message: 'All servos stopped'
        };
    } catch (error) {
        console.error('Error stopping servos:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Get PCA9685 channel status
 * @param {Object} params - Status parameters
 * @param {number} params.channel - Channel to check (optional, checks all if not specified)
 * @param {number} params.address - I2C address (optional)
 * @returns {Promise<Object>} - Status result
 */
export async function getChannelStatus({ channel, address } = {}) {
    try {
        const i2cAddress = address || PCA9685_CONFIG.defaultAddress;
        
        if (channel !== undefined) {
            if (channel < 0 || channel >= PCA9685_CONFIG.channels) {
                throw new Error(`Invalid channel: ${channel}`);
            }
            
            // For now, simulate status check - will be replaced with actual hardware calls
            return {
                success: true,
                channel: channel,
                address: i2cAddress,
                active: false, // Simulated
                dutyCycle: 0, // Simulated
                message: `Channel ${channel} status retrieved`
            };
        } else {
            // Get status for all channels
            const channels = [];
            for (let ch = 0; ch < PCA9685_CONFIG.channels; ch++) {
                channels.push({
                    channel: ch,
                    active: false, // Simulated
                    dutyCycle: 0 // Simulated
                });
            }
            
            return {
                success: true,
                address: i2cAddress,
                channels: channels,
                message: 'All channel status retrieved'
            };
        }
    } catch (error) {
        console.error('Error getting channel status:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

export default {
    initializePCA9685,
    setPWM,
    moveServoToAngle,
    controlContinuousServo,
    stopAllServos,
    getChannelStatus,
    PCA9685_CONFIG
};
