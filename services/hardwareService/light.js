/**
 * Light Hardware Service
 * Thin wrapper around existing Python light control scripts
 */

import { runWrapper, validateArgs } from './exec.js';

/**
 * Control light/LED
 * @param {Object} params - Light parameters
 * @param {number} params.pin - GPIO pin
 * @param {string} params.action - 'on', 'off', or 'toggle'
 * @param {number} params.brightness - Brightness percentage (0-100) for PWM
 * @returns {Promise<string>} - Command result
 */
export async function controlLight({ pin, action, brightness = 100 }) {
    validateArgs([pin, action], 2);
    
    if (!['on', 'off', 'toggle'].includes(action)) {
        throw new Error(`Invalid action: ${action}. Must be 'on', 'off', or 'toggle'`);
    }
    
    const args = [
        'control',
        String(pin),
        action,
        String(brightness)
    ];
    
    return await runWrapper('light_cli.py', args);
}

/**
 * Turn light on
 * @param {Object} params - Light parameters
 * @param {number} params.pin - GPIO pin
 * @param {number} params.brightness - Brightness percentage (0-100)
 * @returns {Promise<string>} - Command result
 */
export async function turnOn({ pin, brightness = 100 }) {
    return await controlLight({ pin, action: 'on', brightness });
}

/**
 * Turn light off
 * @param {Object} params - Light parameters
 * @param {number} params.pin - GPIO pin
 * @returns {Promise<string>} - Command result
 */
export async function turnOff({ pin }) {
    return await controlLight({ pin, action: 'off' });
}

/**
 * Toggle light
 * @param {Object} params - Light parameters
 * @param {number} params.pin - GPIO pin
 * @returns {Promise<string>} - Command result
 */
export async function toggle({ pin }) {
    return await controlLight({ pin, action: 'toggle' });
}

export default {
    controlLight,
    turnOn,
    turnOff,
    toggle
};
