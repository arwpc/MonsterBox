/**
 * Linear Actuator Hardware Service
 * Thin wrapper around existing Python actuator control scripts
 */

import { runWrapper, validateArgs } from './exec.js';

/**
 * Control linear actuator
 * @param {Object} params - Actuator parameters
 * @param {number} params.directionPin - Direction control pin
 * @param {number} params.pwmPin - PWM control pin
 * @param {string} params.direction - 'extend' or 'retract'
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.duration - Duration in milliseconds
 * @param {number} params.maxExtension - Maximum extension time in milliseconds
 * @param {number} params.maxRetraction - Maximum retraction time in milliseconds
 * @returns {Promise<string>} - Command result
 */
export async function controlActuator({ directionPin, pwmPin, direction, speed = 75, duration = 1000, maxExtension = 15000, maxRetraction = 15000 }) {
    validateArgs([directionPin, pwmPin, direction], 3);

    if (!['extend', 'retract'].includes(direction)) {
        throw new Error(`Invalid direction: ${direction}. Must be 'extend' or 'retract'`);
    }

    const args = [
        'control',
        String(directionPin),
        String(pwmPin),
        direction,
        String(speed),
        String(duration),
        String(maxExtension),
        String(maxRetraction)
    ];

    return await runWrapper('actuator_cli.py', args);
}

/**
 * Stop actuator
 * @param {Object} params - Actuator parameters
 * @param {number} params.directionPin - Direction control pin
 * @param {number} params.pwmPin - PWM control pin
 * @returns {Promise<string>} - Command result
 */
export async function stopActuator({ directionPin, pwmPin }) {
    validateArgs([directionPin, pwmPin], 2);

    const args = [
        'stop',
        String(directionPin),
        String(pwmPin)
    ];

    return await runWrapper('actuator_cli.py', args);
}

export default {
    controlActuator,
    stopActuator
};
