/**
 * Linear Actuator Calibration Service
 * Handles calibration data storage and retrieval for linear actuators
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get calibration file path (character-aware with graceful global fallback semantics)
async function getCalibrationFilePath(preferGlobalFallback = false) {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    // cfg.dataPath may already be character-scoped (e.g., data/character-1)
    const baseDataRoot = cfg && cfg.dataPath ? path.resolve(appRoot, cfg.dataPath) : path.resolve(appRoot, 'data');
    const selectedCharacter = cfg && cfg.selectedCharacter;

    if (preferGlobalFallback || !selectedCharacter) {
        // Global file path
        return path.resolve(baseDataRoot, 'linear_actuator_calibrations.json');
    }
    // If baseDataRoot already ends with character-{id}, use it; otherwise nest character-{id}
    const alreadyCharScoped = new RegExp(`(^|/)character-${selectedCharacter}(/|$)`).test(baseDataRoot.replace(/\\/g, '/'));
    const perCharDir = alreadyCharScoped ? baseDataRoot : path.resolve(baseDataRoot, `character-${selectedCharacter}`);
    return path.resolve(perCharDir, 'linear_actuator_calibrations.json');
}

/**
 * Load calibration data from file
 * @returns {Promise<Object>} Calibration data object
 */
export async function loadCalibrations() {
    // Try character-scoped first; on ENOENT, fall back to global file
    try {
        const charFile = await getCalibrationFilePath(false);
        const data = await fs.readFile(charFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                const globalFile = await getCalibrationFilePath(true);
                const data = await fs.readFile(globalFile, 'utf8');
                return JSON.parse(data);
            } catch (e2) {
                if (e2.code === 'ENOENT') return {};
                throw e2;
            }
        }
        throw error;
    }
}

/**
 * Save calibration data to file
 * @param {Object} calibrations - Calibration data object
 * @returns {Promise<void>}
 */
export async function saveCalibrations(calibrations) {
    // Always save to the character-scoped file when a character is selected; otherwise global
    const calibrationFile = await getCalibrationFilePath(false);
    await fs.mkdir(path.dirname(calibrationFile), { recursive: true });
    await fs.writeFile(calibrationFile, JSON.stringify(calibrations, null, 2));
}

/**
 * Get calibration data for a specific part
 * @param {string|number} partId - Part ID
 * @returns {Promise<Object|null>} Calibration data or null if not found
 */
export async function getCalibration(partId) {
    const calibrations = await loadCalibrations();
    return calibrations[String(partId)] || null;
}

/**
 * Save calibration position for a part
 * @param {string|number} partId - Part ID
 * @param {string} partName - Part name
 * @param {string} position - Position name ('min' or 'max')
 * @param {string} description - Position description
 * @returns {Promise<Object>} Updated calibration data
 */
export async function savePosition(partId, partName, position, description = '') {
    if (!['min', 'max'].includes(position)) {
        throw new Error(`Invalid position: ${position}. Must be 'min' or 'max'`);
    }

    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);

    // Initialize calibration data if it doesn't exist
    if (!calibrations[partIdStr]) {
        calibrations[partIdStr] = {
            part_id: partId,
            part_name: partName,
            calibrated_date: new Date().toISOString(),
            positions: {
                min: {
                    description: 'Fully retracted position',
                    calibrated: false
                },
                max: {
                    description: 'Fully extended position',
                    calibrated: false
                }
            }
        };
    }

    // Update the specific position
    calibrations[partIdStr].positions[position] = {
        description: description || calibrations[partIdStr].positions[position].description,
        calibrated: true,
        calibrated_date: new Date().toISOString()
    };

    // Update overall calibration date
    calibrations[partIdStr].calibrated_date = new Date().toISOString();

    await saveCalibrations(calibrations);
    return calibrations[partIdStr];
}

/**
 * Check if a part is fully calibrated (both min and max positions)
 * @param {string|number} partId - Part ID
 * @returns {Promise<boolean>} True if fully calibrated
 */
export async function isFullyCalibrated(partId) {
    const calibration = await getCalibration(partId);
    if (!calibration) return false;

    return calibration.positions.min.calibrated && calibration.positions.max.calibrated;
}

/**
 * Get calibration status for a part
 * @param {string|number} partId - Part ID
 * @returns {Promise<Object>} Calibration status object
 */
export async function getCalibrationStatus(partId) {
    const calibration = await getCalibration(partId);

    if (!calibration) {
        // Default structure for brand-new parts
        return {
            exists: false,
            fullyCalibrated: false,
            minCalibrated: false,
            maxCalibrated: false,
            calibratedDate: null,
            positions: {
                min: { calibrated: false },
                max: { calibrated: false }
            }
        };
    }

    return {
        exists: true,
        fullyCalibrated: !!(calibration.positions && calibration.positions.min && calibration.positions.max && calibration.positions.min.calibrated && calibration.positions.max.calibrated),
        minCalibrated: !!(calibration.positions && calibration.positions.min && calibration.positions.min.calibrated),
        maxCalibrated: !!(calibration.positions && calibration.positions.max && calibration.positions.max.calibrated),
        calibratedDate: calibration.calibrated_date,
        positions: calibration.positions
    };
}

/**
 * Reset calibration for a part
 * @param {string|number} partId - Part ID
 * @returns {Promise<boolean>} True if reset successfully
 */
export async function resetCalibration(partId) {
    const calibrations = await loadCalibrations();
    const partIdStr = String(partId);

    if (calibrations[partIdStr]) {
        delete calibrations[partIdStr];
        await saveCalibrations(calibrations);
        return true;
    }

    return false;
}

export default {
    loadCalibrations,
    saveCalibrations,
    getCalibration,
    savePosition,
    isFullyCalibrated,
    getCalibrationStatus,
    resetCalibration
};
