/**
 * Light Hardware Service — UNWIRED, DO NOT USE
 * ---------------------------------------------------------------------------
 * This module is not imported anywhere, and its CLI contract does not match the
 * wrapper it calls:
 *
 *   it sends ['control', pin, action, brightness] but light_cli.py expects
 *   <pin> <on|off> [duration_ms], so int('on') throws; 'toggle' is unsupported downstream.
 *
 * It is kept only because deleting a file is harder to notice than a thrown
 * error. Calling it throws instead of silently addressing the wrong hardware —
 * a friendly-looking API that drives arbitrary GPIO is worse than no API.
 *
 * The working implementation is HARDWARE_CONTROLLERS.light in ./index.js.
 */

function unwired(name) {
    throw new Error(
        name + ' is unwired and its argument order does not match light_cli.py. ' +
        'Use HARDWARE_CONTROLLERS.light from services/hardwareService/index.js instead.'
    );
}

export async function controlLight() { unwired('controlLight'); }

export async function turnOn() { unwired('turnOn'); }

export async function turnOff() { unwired('turnOff'); }

export async function toggle() { unwired('toggle'); }

export default { controlLight, turnOn, turnOff, toggle };
