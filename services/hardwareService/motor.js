/**
 * Motor Hardware Service — UNWIRED, DO NOT USE
 * ---------------------------------------------------------------------------
 * This module is not imported anywhere, and its CLI contract does not match the
 * wrapper it calls:
 *
 *   it sends ['control', pin, direction, speed, duration] but motor_cli.py expects
 *   <direction> <speed> <duration_ms> <dir_pin> <pwm_pin> — so `speed` would be read as
 *   a GPIO pin number and an arbitrary pin would be driven.
 *
 * It is kept only because deleting a file is harder to notice than a thrown
 * error. Calling it throws instead of silently addressing the wrong hardware —
 * a friendly-looking API that drives arbitrary GPIO is worse than no API.
 *
 * The working implementation is HARDWARE_CONTROLLERS.motor in ./index.js.
 */

function unwired(name) {
    throw new Error(
        name + ' is unwired and its argument order does not match motor_cli.py. ' +
        'Use HARDWARE_CONTROLLERS.motor from services/hardwareService/index.js instead.'
    );
}

export async function controlMotor() { unwired('controlMotor'); }

export async function stopMotor() { unwired('stopMotor'); }

export default { controlMotor, stopMotor };
