/**
 * Continuous Servo Calibration Service
 * Handles calibration data for continuous rotation servos
 */

import fs from 'fs/promises';
import path from 'path';
import { readConfig } from './configService.js';

async function getCalibrationFilePath() {
  const cfg = await readConfig();
  const appRoot = path.resolve(process.cwd());
  const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
  return path.resolve(appRoot, dataDir, 'servo_calibrations.json');
}

/**
 * Load all servo calibrations from file
 * @returns {Promise<Object>} Calibration data object
 */
export async function loadCalibrations() {
    try {
        const calibrationFile = await getCalibrationFilePath();
        const data = await fs.readFile(calibrationFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty object
            return {};
        }
        throw error;
    }
}

/**
 * Save calibrations to file
 * @param {Object} calibrations - Calibration data to save
 * @returns {Promise<void>}
 */
export async function saveCalibrations(calibrations) {
    const calibrationFile = await getCalibrationFilePath();
    await fs.writeFile(calibrationFile, JSON.stringify(calibrations, null, 2));
}

/**
 * Get calibration data for a specific continuous servo
 * @param {string|number} partId - Part ID
 * @returns {Promise<Object|null>} Calibration data or null if not found
 */
export async function getCalibration(partId) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);
    const calibration = calibrations[partIdStr];

    // Only return if it's a continuous servo
    if (calibration && calibration.servo_type === 'continuous') {
        return calibration;
    }

    return null;
}

/**
 * Save pulse width calibration (stop, CW, CCW)
 * @param {string|number} partId - Part ID
 * @param {string} partName - Part name
 * @param {string} pulseType - 'stop', 'cw', or 'ccw'
 * @param {number} pulseUs - Pulse width in microseconds
 * @param {number} channel - Servo channel
 * @returns {Promise<Object>} Updated calibration data
 */
export async function savePulse(partId, partName, pulseType, pulseUs, channel) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);

    // Initialize calibration data if it doesn't exist
    if (!calibrations[partIdStr]) {
        calibrations[partIdStr] = {
            part_id: parseInt(partId),
            part_name: partName,
            servo_type: 'continuous',
            channel: channel,
            calibrated_date: new Date().toISOString(),
            stop_pulse_us: 1500,
            cw_pulse_us: 1200,
            ccw_pulse_us: 1800,
            positions: {},
            timing_data: {},
            functionality_status: 'working'
        };
    }

    // Update the specific pulse
    const pulseKey = `${pulseType}_pulse_us`;
    calibrations[partIdStr][pulseKey] = pulseUs;
    calibrations[partIdStr].calibrated_date = new Date().toISOString();

    await saveCalibrations(calibrations);
    return calibrations[partIdStr];
}

/**
 * Save a named position for continuous servo
 * @param {string|number} partId - Part ID
 * @param {string} partName - Part name
 * @param {string} positionName - Position name (e.g., 'forward', 'left', 'extended')
 * @param {string} description - Position description
 * @param {number} channel - Servo channel
 * @returns {Promise<Object>} Updated calibration data
 */
export async function savePosition(partId, partName, positionName, description, channel, motion) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);

    // Initialize calibration data if it doesn't exist
    if (!calibrations[partIdStr]) {
        calibrations[partIdStr] = {
            part_id: parseInt(partId),
            part_name: partName,
            servo_type: 'continuous',
            channel: channel,
            calibrated_date: new Date().toISOString(),
            stop_pulse_us: 1500,
            cw_pulse_us: 1200,
            ccw_pulse_us: 1800,
            positions: {},
            timing_data: {},
            functionality_status: 'working'
        };
    }

    // Update the specific position
    const motionObj = (motion && (motion.direction || motion.speed || motion.duration)) ? {
        direction: (String(motion.direction || '').toLowerCase() === 'ccw') ? 'ccw'
            : (String(motion.direction || '').toLowerCase() === 'cw') ? 'cw'
                : (String(motion.direction || '').toLowerCase() === 'stop') ? 'stop'
                    : undefined,
        speed: (motion.speed != null) ? parseInt(motion.speed, 10) : undefined,
        duration: (motion.duration != null) ? parseInt(motion.duration, 10) : undefined
    } : undefined;

    calibrations[partIdStr].positions[positionName] = {
        description: description,
        calibrated: true,
        calibrated_date: new Date().toISOString(),
        ...(motionObj ? { motion: motionObj } : {})
    };

    // Update overall calibration date
    calibrations[partIdStr].calibrated_date = new Date().toISOString();

    await saveCalibrations(calibrations);
    return calibrations[partIdStr];
}

/**
 * Get calibration status for a continuous servo
 * @param {string|number} partId - Part ID
 * @returns {Promise<Object>} Calibration status object
 */
export async function getCalibrationStatus(partId) {
    const calibration = await getCalibration(partId);

    if (!calibration) {
        return {
            exists: false,
            pulseCalibrated: false,
            positionsCalibrated: false,
            stopPulseCalibrated: false,
            cwPulseCalibrated: false,
            ccwPulseCalibrated: false,
            calibratedPositions: [],
            calibratedDate: null
        };
    }

    const positions = calibration.positions || {};
    const calibratedPositions = Object.keys(positions).filter(pos => positions[pos].calibrated);

    // Check if basic pulses are calibrated (have been explicitly set)
    const stopPulseCalibrated = calibration.stop_pulse_us !== undefined && calibration.stop_pulse_us !== null;
    const cwPulseCalibrated = calibration.cw_pulse_us !== undefined && calibration.cw_pulse_us !== null;
    const ccwPulseCalibrated = calibration.ccw_pulse_us !== undefined && calibration.ccw_pulse_us !== null;
    const pulseCalibrated = stopPulseCalibrated && cwPulseCalibrated && ccwPulseCalibrated;

    return {
        exists: true,
        pulseCalibrated: pulseCalibrated,
        positionsCalibrated: calibratedPositions.length > 0,
        stopPulseCalibrated: stopPulseCalibrated,
        cwPulseCalibrated: cwPulseCalibrated,
        ccwPulseCalibrated: ccwPulseCalibrated,
        calibratedPositions: calibratedPositions,
        calibratedDate: calibration.calibrated_date,
        pulses: {
            stop: calibration.stop_pulse_us,
            cw: calibration.cw_pulse_us,
            ccw: calibration.ccw_pulse_us
        },
        positions: positions
    };
}

/**
 * Reset calibration for a continuous servo
 * @param {string|number} partId - Part ID
 * @returns {Promise<boolean>} True if reset successfully
 */
export async function resetCalibration(partId) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);

    if (calibrations[partIdStr] && calibrations[partIdStr].servo_type === 'continuous') {
        delete calibrations[partIdStr];
        await saveCalibrations(calibrations);
        return true;
    }

    return false;
}

/**
 * Get suggested position names based on servo name/type
 * @param {string} partName - Part name
 * @returns {Array<Object>} Array of suggested positions with names and descriptions
 */
export function getSuggestedPositions(partName) {
    const name = partName.toLowerCase();

    // Head servos get directional positions
    if (name.includes('head') || name.includes('swivel') || name.includes('gaze')) {
        return [
            { name: 'forward', description: '0° - Facing directly forward' },
            { name: 'left_90', description: '90° - Facing left' },
            { name: 'right_90', description: '90° - Facing right' },
            { name: 'backward', description: '180° - Facing backward' }
        ];
    }

    // Joint servos (elbow, shoulder, etc.) get extension positions
    if (name.includes('elbow') || name.includes('shoulder') || name.includes('joint') || name.includes('arm')) {
        return [
            { name: 'extended', description: 'Fully extended position' },
            { name: 'retracted', description: 'Fully retracted position' },
            { name: 'neutral', description: 'Neutral/middle position' }
        ];
    }

    // Jaw servos get open/close positions
    if (name.includes('jaw') || name.includes('mouth')) {
        return [
            { name: 'closed', description: 'Jaw closed position' },
            { name: 'open', description: 'Jaw open position' },
            { name: 'neutral', description: 'Neutral/rest position' }
        ];
    }

    // Default generic positions
    return [
        { name: 'position_1', description: 'First calibrated position' },
        { name: 'position_2', description: 'Second calibrated position' },
        { name: 'neutral', description: 'Neutral/center position' }
    ];
}
export async function listPositions(partId) {
    const calibration = await getCalibration(partId);
    return calibration ? (calibration.positions || {}) : {};
}

export async function deletePosition(partId, positionName) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);
    if (!calibrations[partIdStr] || calibrations[partIdStr].servo_type !== 'continuous') return false;
    if (calibrations[partIdStr].positions && calibrations[partIdStr].positions[positionName]) {
        delete calibrations[partIdStr].positions[positionName];
        calibrations[partIdStr].calibrated_date = new Date().toISOString();
        await saveCalibrations(calibrations);
        return true;
    }
    return false;
}

export async function renamePosition(partId, oldName, newName) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);
    const cal = calibrations[partIdStr];
    if (!cal || cal.servo_type !== 'continuous') return false;
    if (!cal.positions || !cal.positions[oldName]) return false;
    if (cal.positions[newName]) return false; // avoid accidental overwrite
    cal.positions[newName] = { ...cal.positions[oldName], calibrated_date: new Date().toISOString() };
    delete cal.positions[oldName];
    cal.calibrated_date = new Date().toISOString();
    await saveCalibrations(calibrations);
    return true;
}

export async function updatePosition(partId, positionName, updates = {}) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);
    const cal = calibrations[partIdStr];
    if (!cal || cal.servo_type !== 'continuous') return false;
    if (!cal.positions || !cal.positions[positionName]) return false;
    cal.positions[positionName] = {
        ...cal.positions[positionName],
        ...updates,
        calibrated_date: new Date().toISOString()
    };
    cal.calibrated_date = new Date().toISOString();
    await saveCalibrations(calibrations);
    return true;
}


export default {
    loadCalibrations,
    saveCalibrations,
    getCalibration,
    savePulse,
    savePosition,
    listPositions,
    deletePosition,
    renamePosition,
    updatePosition,
    getCalibrationStatus,
    resetCalibration,
    getSuggestedPositions
};
