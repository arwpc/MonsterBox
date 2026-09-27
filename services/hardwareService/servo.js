/**
 * Servo Hardware Service
 * Thin wrapper around existing Python servo control scripts
 */

import { runWrapper, validateArgs } from './exec.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from '../configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Move standard servo to specific angle
 * @param {Object} params - Servo parameters
 * @param {number} params.channel - Servo channel/pin
 * @param {number} params.pulseUs - Pulse width in microseconds
 * @param {number} params.duration - Movement duration in ms (optional)
 * @returns {Promise<string>} - Command result
 */
export async function moveTo({ channel, pulseUs, duration = 1000 }) {
    validateArgs([channel, pulseUs], 2);

    const args = [
        'move_to',
        String(channel),
        String(pulseUs),
        String(duration)
    ];

    return await runWrapper('servo_cli.py', args);
}

/**
 * Move continuous servo with direction and speed
 * @param {Object} params - Continuous servo parameters
 * @param {number} params.channel - Servo channel/pin
 * @param {string} params.direction - 'cw', 'ccw', or 'stop'
 * @param {number} params.speed - Speed percentage (0-100)
 * @param {number} params.duration - Duration in ms
 * @returns {Promise<string>} - Command result
 */
export async function rotateContinuous({ channel, direction, speed = 50, duration = 1000 }) {
    validateArgs([channel, direction], 2);

    if (!['cw', 'ccw', 'stop'].includes(direction)) {
        throw new Error(`Invalid direction: ${direction}. Must be 'cw', 'ccw', or 'stop'`);
    }

    const args = [
        'rotate_continuous',
        String(channel),
        direction,
        String(speed),
        String(duration)
    ];

    return await runWrapper('servo_cli.py', args);
}

/**
 * Stop continuous servo
 * @param {Object} params - Servo parameters
 * @param {number} params.channel - Servo channel/pin
 * @returns {Promise<string>} - Command result
 */
export async function stop({ channel }) {
    validateArgs([channel], 1);

    return await rotateContinuous({ channel, direction: 'stop', duration: 100 });
}

/**
 * Get servo calibration data
 * @param {number} partId - Part ID from parts.json
 * @returns {Promise<Object>} - Calibration data
 */
export async function getCalibration(partId) {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '../..');
        const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
        const calibrationPath = path.resolve(appRoot, dataDir, 'servo_calibrations.json');
        const calibrationData = await fs.readFile(calibrationPath, 'utf8');
        const calibrations = JSON.parse(calibrationData);
        return calibrations[String(partId)] || null;
    } catch (error) {
        console.warn(`⚠️ Could not load calibration for part ${partId}:`, error.message);
        return null;
    }
}

/**
 * Convert angle to pulse width using calibration data
 * @param {number} angleDeg - Target angle in degrees
 * @param {Object} calibration - Calibration data
 * @returns {number} - Pulse width in microseconds
 */
export function angleToPulse(angleDeg, calibration) {
    if (!calibration || !calibration.positions) {
        // Default servo range if no calibration
        const minUs = 1000;
        const maxUs = 2000;
        const minDeg = -90;
        const maxDeg = 90;

        const clampedAngle = Math.max(minDeg, Math.min(maxDeg, angleDeg));
        const ratio = (clampedAngle - minDeg) / (maxDeg - minDeg);
        return Math.round(minUs + ratio * (maxUs - minUs));
    }

    const { positions } = calibration;
    const minUs = positions.min?.pulse_us || 1000;
    const maxUs = positions.max?.pulse_us || 2000;
    const neutralUs = positions.neutral?.pulse_us || 1500;

    // For standard servos, use min/max range
    if (calibration.servo_type === 'standard') {
        const minDeg = positions.min?.angle || -90;
        const maxDeg = positions.max?.angle || 90;

        const clampedAngle = Math.max(minDeg, Math.min(maxDeg, angleDeg));
        const ratio = (clampedAngle - minDeg) / (maxDeg - minDeg);
        return Math.round(minUs + ratio * (maxUs - minUs));
    }

    // For continuous servos, return appropriate pulse for direction
    if (calibration.servo_type === 'continuous') {
        if (angleDeg > 5) return calibration.cw_pulse_us || 1200;
        if (angleDeg < -5) return calibration.ccw_pulse_us || 1800;
        return calibration.stop_pulse_us || neutralUs;
    }

    return neutralUs;
}

/**
 * Move servo to angle using calibration
 * @param {Object} params - Movement parameters
 * @param {number} params.partId - Part ID for calibration lookup
 * @param {number} params.angleDeg - Target angle in degrees
 * @param {number} params.duration - Movement duration in ms
 * @returns {Promise<string>} - Command result
 */
export async function moveToAngle({ partId, angleDeg, duration = 1000 }) {
    const calibration = await getCalibration(partId);
    const part = await getServoPart(partId);

    // Legacy servo_calibrations.json entries carry their own pulse/angle pairs and
    // keep the -90..+90 convention they were measured in. Without one, the part
    // itself is the spec: MonsterBox angles are 0..rotationRangeDeg (a jaw at 84°,
    // a pen at 120°), and the model's pulse range is what the horn actually spans.
    // The old fallback mapped -90..90 onto 1000..2000 µs, so a 0..180 caller asking
    // for 90° (centre) got 2000 µs — one end of the travel — and 0°..90° collapsed
    // into the top half (Renfield's Writing Pen, first GPIO servo in the fleet,
    // 2026-09-26).
    const pulseUs = (calibration && calibration.positions)
        ? angleToPulse(angleDeg, calibration)
        : angleToPulseFromPart(angleDeg, part);

    const channel = servoChannelOf(part);

    return await moveTo({ channel, pulseUs, duration });
}

/**
 * Map a 0..rotationRangeDeg angle onto the part's own pulse span.
 * @param {number} angleDeg - Target angle, 0..rotationRangeDeg
 * @param {Object|null} part - parts.json entry (minPulse/maxPulse/rotationRangeDeg, at root or in config)
 * @returns {number} - Pulse width in microseconds
 */
export function angleToPulseFromPart(angleDeg, part) {
    const cfg = (part && part.config) || {};
    const num = (...vals) => {
        for (const v of vals) { const n = Number(v); if (Number.isFinite(n) && n > 0) return n; }
        return null;
    };
    const minUs = num(part && part.minPulse, cfg.minPulse) || 1000;
    const maxUs = num(part && part.maxPulse, cfg.maxPulse) || 2000;
    const rangeDeg = num(part && part.rotationRangeDeg, cfg.rotationRangeDeg) || 180;
    const clamped = Math.max(0, Math.min(rangeDeg, Number(angleDeg) || 0));
    return Math.round(minUs + (clamped / rangeDeg) * (maxUs - minUs));
}

/**
 * Get servo channel from parts.json
 * @param {number} partId - Part ID
 * @returns {Promise<number>} - Servo channel/pin
 */
async function getServoPart(partId) {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '../..');
        const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
        const partsPath = path.resolve(appRoot, dataDir, 'parts.json');
        const partsData = await fs.readFile(partsPath, 'utf8');
        const parts = JSON.parse(partsData);

        const part = parts.find(p => String(p.id) === String(partId));
        if (!part) {
            throw new Error(`Part ${partId} not found`);
        }
        return part;
    } catch (error) {
        console.warn(`⚠️ Could not load part ${partId}:`, error.message);
        return null;
    }
}

function servoChannelOf(part) {
    if (!part) return 18; // Default channel (legacy behaviour)
    return part.gpioPin || part.channel || part.pin || 18; // Default to GPIO 18
}

async function getServoChannel(partId) {
    return servoChannelOf(await getServoPart(partId));
}

export default {
    moveTo,
    rotateContinuous,
    stop,
    getCalibration,
    angleToPulse,
    angleToPulseFromPart,
    moveToAngle
};
