/**
 * Linear Actuator Hardware Service
 * Thin wrapper around existing Python actuator control scripts
 * Supports both MDD10A and BTS7960 control boards
 */

import { runWrapper, validateArgs } from './exec.js';

/**
 * Control linear actuator
 * @param {Object} params - Actuator parameters
 * @param {string} params.controlBoard - 'MDD10A' or 'BTS7960'
 * @param {number} params.directionPin - Direction control pin (MDD10A only)
 * @param {number} params.pwmPin - PWM control pin (MDD10A only)
 * @param {number} params.rpwmPin - Right PWM pin (BTS7960 only)
 * @param {number} params.lpwmPin - Left PWM pin (BTS7960 only)
 * @param {number} params.renPin - Right enable pin (BTS7960 only)
 * @param {number} params.lenPin - Left enable pin (BTS7960 only)
 * @param {string} params.direction - 'extend' or 'retract' (MDD10A) or 'forward' or 'reverse' (BTS7960)
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.duration - Duration in milliseconds
 * @param {number} params.maxExtension - Maximum extension time in milliseconds
 * @param {number} params.maxRetraction - Maximum retraction time in milliseconds
 * @returns {Promise<string>} - Command result
 */
export async function controlActuator({
    controlBoard = 'MDD10A',
    directionPin,
    pwmPin,
    rpwmPin,
    lpwmPin,
    renPin,
    lenPin,
    direction,
    speed = 75,
    duration = 1000,
    maxExtension = 15000,
    maxRetraction = 15000,
    pwmFrequency
}) {
    if (!['extend', 'retract', 'forward', 'reverse'].includes(direction)) {
        throw new Error(`Invalid direction: ${direction}. Must be 'extend', 'retract', 'forward', or 'reverse'`);
    }

    // Handle BTS7960 control board
    if (controlBoard === 'BTS7960') {
        validateArgs([rpwmPin, lpwmPin, direction], 3);

        // Build JSON config for linear_actuator_control_v2.py
        const config = {
            controlBoard: 'BTS7960',
            rpwmPin: Number(rpwmPin),
            lpwmPin: Number(lpwmPin),
            direction: direction,
            speed: Number(speed),
            duration: Number(duration)
        };

        if (pwmFrequency != null) config.pwmFrequency = Number(pwmFrequency);

        if (renPin != null) config.renPin = Number(renPin);
        if (lenPin != null) config.lenPin = Number(lenPin);

        const args = [JSON.stringify(config)];
        return await runWrapper('linear_actuator_control_v2.py', args);
    }

    // Handle MDD10A control board (legacy)
    validateArgs([directionPin, pwmPin, direction], 3);

    // Use linear_actuator_control_v2.py for consistency
    const config = {
        controlBoard: 'MDD10A',
        directionPin: Number(directionPin),
        pwmPin: Number(pwmPin),
        direction: direction === 'extend' ? 'forward' : 'backward',
        speed: Number(speed),
        duration: Number(duration)
    };

    return await runWrapper('linear_actuator_control_v2.py', [JSON.stringify(config)]);
}

/**
 * Stop actuator
 * @param {Object} params - Actuator parameters
 * @param {string} params.controlBoard - 'MDD10A' or 'BTS7960'
 * @param {number} params.directionPin - Direction control pin (MDD10A only)
 * @param {number} params.pwmPin - PWM control pin (MDD10A only)
 * @param {number} params.rpwmPin - Right PWM pin (BTS7960 only)
 * @param {number} params.lpwmPin - Left PWM pin (BTS7960 only)
 * @param {number} params.renPin - Right enable pin (BTS7960 only)
 * @param {number} params.lenPin - Left enable pin (BTS7960 only)
 * @returns {Promise<string>} - Command result
 */
export async function stopActuator({
    controlBoard = 'MDD10A',
    directionPin,
    pwmPin,
    rpwmPin,
    lpwmPin,
    renPin,
    lenPin
}) {
    // Handle BTS7960 control board
    if (controlBoard === 'BTS7960') {
        validateArgs([rpwmPin, lpwmPin], 2);

        // Build JSON config for linear_actuator_control_v2.py with 0 duration to stop
        const config = {
            controlBoard: 'BTS7960',
            rpwmPin: Number(rpwmPin),
            lpwmPin: Number(lpwmPin),
            direction: 'forward',
            speed: 0,
            duration: 0
        };

        if (renPin != null) config.renPin = Number(renPin);
        if (lenPin != null) config.lenPin = Number(lenPin);

        const args = [JSON.stringify(config)];
        return await runWrapper('linear_actuator_control_v2.py', args);
    }

    // Handle MDD10A control board (legacy)
    validateArgs([directionPin, pwmPin], 2);

    const args = [
        'stop',
        String(directionPin),
        String(pwmPin)
    ];

    return await runWrapper('actuator_cli.py', args);
}

/**
 * Move actuator to specific distance
 * @param {Object} params - Movement parameters
 * @param {number} params.directionPin - Direction control pin
 * @param {number} params.pwmPin - PWM control pin
 * @param {number} params.distance - Target distance (0-15000)
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.duration - Duration in milliseconds
 * @returns {Promise<string>} - Command result
 */
export async function moveTo({ directionPin, pwmPin, distance, speed = 75, duration = 2000 }) {
    validateArgs([directionPin, pwmPin, distance], 3);

    // Determine direction based on distance
    // For simplicity, assume distance > 7500 means extend, otherwise retract
    const direction = distance > 7500 ? 'extend' : 'retract';

    return await controlActuator({
        directionPin,
        pwmPin,
        direction,
        speed,
        duration,
        maxExtension: 15000,
        maxRetraction: 15000
    });
}

export default {
    controlActuator,
    stopActuator,
    moveTo
};
