/**
 * Motor Hardware Service
 * Thin wrapper around existing Python motor control scripts
 */

import { runWrapper, validateArgs } from './exec.js';

/**
 * Control motor movement
 * @param {Object} params - Motor parameters
 * @param {number} params.pin - Motor control pin
 * @param {string} params.direction - 'forward', 'backward', or 'stop'
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.duration - Duration in milliseconds
 * @returns {Promise<string>} - Command result
 */
export async function controlMotor({ pin, direction, speed = 50, duration = 1000 }) {
    validateArgs([pin, direction], 2);
    
    if (!['forward', 'backward', 'stop'].includes(direction)) {
        throw new Error(`Invalid direction: ${direction}. Must be 'forward', 'backward', or 'stop'`);
    }
    
    const args = [
        'control',
        String(pin),
        direction,
        String(speed),
        String(duration)
    ];
    
    return await runWrapper('motor_cli.py', args);
}

/**
 * Stop motor
 * @param {Object} params - Motor parameters
 * @param {number} params.pin - Motor control pin
 * @returns {Promise<string>} - Command result
 */
export async function stopMotor({ pin }) {
    validateArgs([pin], 1);
    
    return await controlMotor({ pin, direction: 'stop', duration: 100 });
}

export default {
    controlMotor,
    stopMotor
};
