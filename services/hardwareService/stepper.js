/**
 * Stepper Hardware Service
 * Provides simple wrappers for step/dir control via Python CLI
 */

import { runWrapper, validateArgs } from './exec.js';

/**
 * Move a fixed number of steps
 * @param {Object} params
 * @param {number|string} params.stepPin - STEP pin
 * @param {number|string} params.dirPin - DIR pin
 * @param {'cw'|'ccw'} [params.direction='cw'] - direction of rotation
 * @param {number} params.steps - number of steps to move (microsteps if using microstepping)
 * @param {number} [params.stepDelayUs=1000] - delay per step in microseconds
 * @param {number|string} [params.enablePin] - optional ENABLE pin
 * @returns {Promise<string>} - raw CLI output
 */
export async function moveSteps({ stepPin, dirPin, direction = 'cw', steps, stepDelayUs = 1000, enablePin }) {
  validateArgs([stepPin, dirPin, direction, steps, stepDelayUs], 5);
  if (!['cw', 'ccw'].includes(String(direction))) {
    throw new Error(`Invalid direction: ${direction}`);
  }
  const args = ['move_steps', String(stepPin), String(dirPin), String(direction), String(Math.round(steps)), String(Math.round(stepDelayUs))];
  if (typeof enablePin !== 'undefined') args.push(String(enablePin));
  return await runWrapper('stepper_cli.py', args);
}

/**
 * Rotate by revolutions at rpm and microstepping factor
 * @param {Object} params
 * @param {number|string} params.stepPin - STEP pin
 * @param {number|string} params.dirPin - DIR pin
 * @param {'cw'|'ccw'} [params.direction='cw']
 * @param {number} params.revolutions - number of full shaft revolutions (can be fractional)
 * @param {number} [params.microstepping=16] - microstepping (e.g., 1,2,4,8,16)
 * @param {number} [params.rpm=60] - target speed in RPM
 * @param {number|string} [params.enablePin]
 * @param {number} [params.stepsPerRev=200] - base steps per revolution (1.8° => 200)
 * @returns {Promise<string>} - raw CLI output
 */
export async function rotate({ stepPin, dirPin, direction = 'cw', revolutions, microstepping = 16, rpm = 60, enablePin, stepsPerRev = 200 }) {
  validateArgs([stepPin, dirPin, direction, revolutions, microstepping, rpm], 6);
  if (!['cw', 'ccw'].includes(String(direction))) {
    throw new Error(`Invalid direction: ${direction}`);
  }
  const args = ['rotate', String(stepPin), String(dirPin), String(direction), String(Number(revolutions)), String(Math.round(microstepping)), String(Math.round(rpm))];
  if (typeof enablePin !== 'undefined') args.push(String(enablePin));
  return await runWrapper('stepper_cli.py', args);
}

export async function stop({ enablePin } = {}) {
  const args = ['stop'];
  if (typeof enablePin !== 'undefined') args.push(String(enablePin));
  return await runWrapper('stepper_cli.py', args);
}

export default { moveSteps, rotate, stop };

