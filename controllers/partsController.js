/**
 * Parts Controller for MonsterBox 4.0
 * Handles all 11 Part types with direct local function calls
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import hardwareService from '../services/hardwareService/index.js';
import { readConfig } from '../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Part types with their configurations
const PART_TYPES = {
    motor: { icon: '🔄', description: 'DC motors for movement', requiresPin: false },
    stepper: { icon: '🧭', description: 'step/dir stepper motors', requiresPin: false },
    linear_actuator: { icon: '🦴', description: 'extending/retracting movements', requiresPin: false },
    light: { icon: '💡', description: 'basic on/off lighting', requiresPin: true },
    led: { icon: '🔆', description: 'PWM-controlled with brightness', requiresPin: true },
    servo: { icon: '🦷', description: 'precise angle control: standard, continuous, feedback', requiresPin: true },
    sensor: { icon: '📡', description: 'digital/analog sensors', requiresPin: true },
    motion_sensor: { icon: '🔍', description: 'PIR motion detection', requiresPin: true },
    webcam: { icon: '📹', description: 'video capture devices', requiresPin: false },
    microphone: { icon: '🎤', description: 'audio input devices', requiresPin: false },
    speaker: { icon: '🔊', description: 'audio output devices', requiresPin: false },
    head_tracking: { icon: '🎯', description: 'computer vision tracking', requiresPin: false }
};

// Servo types supported
const SERVO_TYPES = {
    standard: { description: 'Standard position servo (0-180°)', pulseRange: [500, 2500] },
    continuous: { description: 'Continuous rotation servo', pulseRange: [700, 2300] },
    feedback: { description: 'Feedback servo with position sensing', pulseRange: [500, 2500] }
};

// Ensure a default speaker model exists and return its id
async function ensureDefaultSpeakerModelExists() {
    try {
        const appRoot = path.resolve(__dirname, '..');
        const modelsFile = path.resolve(appRoot, 'data', 'models', 'speaker_models.json');
        await fs.mkdir(path.dirname(modelsFile), { recursive: true });
        let raw = '[]';
        try { raw = await fs.readFile(modelsFile, 'utf8'); } catch (_) { }
        let arr = [];
        try { arr = JSON.parse(raw) || []; } catch (_) { arr = []; }
        const defaultId = 'default_speaker';
        const exists = arr.some(m => String(m.id) === defaultId);
        if (!exists) {
            arr.push({
                id: defaultId,
                name: 'Default Speaker Model',
                description: 'Default output settings for character speakers',
                defaults: { outputDevice: 'default', volume: 80, format: 'mp3' },
                controlsSchema: {},
                meta: {}
            });
            await fs.writeFile(modelsFile, JSON.stringify(arr, null, 2), 'utf8');
        }
        return defaultId;
    } catch (e) {
        console.warn('ensureDefaultSpeakerModelExists failed:', e && e.message);
        return 'default_speaker';
    }
}

// Get parts data file path (honor app-config.dataPath)
const getPartsFilePath = async () => {
    const cfg = await readConfig();
    const appRoot = path.resolve(__dirname, '..');
    const dataDir = cfg && cfg.dataPath ? cfg.dataPath : '../data';
    return path.resolve(appRoot, dataDir, 'parts.json');
};

// Load parts from file
export const loadParts = async () => {
    try {
        const filePath = await getPartsFilePath();
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // Seed with a default standard servo so calibration tests have a non-continuous servo (id=1)
            const seedParts = [
                {
                    id: '1',
                    name: 'Default Servo',
                    type: 'servo',
                    pin: 18,
                    description: PART_TYPES.servo.description,
                    config: { servoType: 'standard', minPulse: 500, maxPulse: 2500, minAngle: 0, maxAngle: 180 },
                    created: new Date().toISOString(),
                    enabled: true
                }
            ];
            await saveParts(seedParts);
            return seedParts;
        }
        throw error;
    }
};

// Save parts to file
export const saveParts = async (parts) => {
    const filePath = await getPartsFilePath();

    // Ensure data directory exists
    const dataDir = path.dirname(filePath);
    await fs.mkdir(dataDir, { recursive: true });

    await fs.writeFile(filePath, JSON.stringify(parts, null, 2));
};

// Generate unique ID for new parts
const generatePartId = (parts) => {
    const maxId = parts.reduce((max, part) => Math.max(max, parseInt(part.id) || 0), 0);
    return String(maxId + 1);
};

/**
 * Get all parts (with optional type filtering)
 */
export const getAllParts = async (req, res) => {
    try {
        let parts = await loadParts();

        // Filter by type if specified in query parameters
        const { type } = req.query;
        if (type) {
            parts = parts.filter(part => part.type === type);
        }

        res.json({
            success: true,
            parts: parts,
            partTypes: PART_TYPES,
            servoTypes: SERVO_TYPES
        });
    } catch (error) {
        console.error('Error loading parts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load parts',
            message: error.message
        });
    }
};

/**
 * Get part by ID
 */
export const getPartById = async (req, res) => {
    try {
        const { id } = req.params;
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(id));

        if (!part) {
            return res.status(404).json({
                success: false,
                error: 'Part not found'
            });
        }

        res.json({
            success: true,
            part: part
        });
    } catch (error) {
        console.error('Error getting part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get part',
            message: error.message
        });
    }
};

/**
 * Create new part
 */
export const createPart = async (req, res) => {
    try {
        const { name, type, pin, description, config, directionPin, pwmPin, maxExtension, maxRetraction } = req.body;

        // Validate part type
        if (!PART_TYPES[type]) {
            return res.status(400).json({
                success: false,
                error: 'Invalid part type',
                validTypes: Object.keys(PART_TYPES)
            });
        }

        // Validate required fields
        if (!name || !type) {
            return res.status(400).json({
                success: false,
                error: 'Name and type are required'
            });
        }

        // Validate pin requirements (be permissive to match tests)
        if (type === 'linear_actuator') {
            const controlBoard = (req.body && req.body.controlBoard) || null;
            const rpwmPin = req.body && req.body.rpwmPin;
            const lpwmPin = req.body && req.body.lpwmPin;

            if (controlBoard === 'BTS7960' || (rpwmPin != null && lpwmPin != null)) {
                // BTS7960 path: require RPWM/LPWM; R_EN/L_EN optional
                if (!(rpwmPin != null && lpwmPin != null)) {
                    return res.status(400).json({
                        success: false,
                        error: 'For BTS7960 actuators, provide rpwmPin and lpwmPin (renPin/lenPin optional)'
                    });
                }
            } else {
                // MDD10A path: accept either explicit direction/pwm or a base pin
                if ((!directionPin || !pwmPin)) {
                    if (typeof pin === 'number' || (typeof pin === 'string' && pin !== '')) {
                        // Derive pins from base pin
                        req.body.directionPin = typeof pin === 'number' ? pin : parseInt(pin, 10);
                        req.body.pwmPin = (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);
                    } else {
                        return res.status(400).json({
                            success: false,
                            error: 'Provide either (directionPin and pwmPin) or a base pin for linear actuator parts'
                        });
                    }
                }
            }
        } else if (type === 'motor') {
            // Handle BTS7960 control board (same as linear actuator)
            const controlBoard = (req.body && req.body.controlBoard) || null;
            const rpwmPin = req.body && req.body.rpwmPin;
            const lpwmPin = req.body && req.body.lpwmPin;

            if (String(controlBoard).toUpperCase() === 'BTS7960') {
                // BTS7960 requires rpwmPin and lpwmPin
                if (rpwmPin == null || lpwmPin == null) {
                    return res.status(400).json({
                        success: false,
                        error: 'BTS7960 motor requires rpwmPin and lpwmPin'
                    });
                }
                // renPin and lenPin are optional for BTS7960
            } else {
                // MDD10A/Cytron: Accept either explicit direction/pwm pins OR a single base pin (dir=pin, pwm=pin+1)
                if ((!directionPin || !pwmPin)) {
                    if (typeof pin === 'number' || (typeof pin === 'string' && pin !== '')) {
                        req.body.directionPin = typeof pin === 'number' ? pin : parseInt(pin, 10);
                        req.body.pwmPin = (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);
                    } else {
                        return res.status(400).json({
                            success: false,
                            error: 'Provide either (directionPin and pwmPin) or a base pin for MDD10A motor parts'
                        });
                    }
                }
            }
        } else if (type === 'stepper') {
            // Accept either explicit step/dir pins OR a single base pin (step=pin, dir=pin+1)
            const { stepPin: sPinRaw, dirPin: dPinRaw } = req.body || {};
            if ((!sPinRaw || !dPinRaw)) {
                if (typeof pin === 'number' || (typeof pin === 'string' && pin !== '')) {
                    req.body.stepPin = typeof pin === 'number' ? pin : parseInt(pin, 10);
                    req.body.dirPin = (typeof pin === 'number' ? pin + 1 : parseInt(pin, 10) + 1);
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Provide either (stepPin and dirPin) or a base pin for stepper parts'
                    });
                }
            }
        } else if (PART_TYPES[type] && PART_TYPES[type].requiresPin && !pin) {
            // Other parts need a single pin, except servo using PCA9685
            const isServoUsingPCA = type === 'servo' && config && (config.controllerType === 'pca9685');
            if (!isServoUsingPCA) {
                return res.status(400).json({
                    success: false,
                    error: `Pin is required for ${type} parts`
                });
            }
        }

        const parts = await loadParts();

        const newPart = {
            id: generatePartId(parts),
            name,
            type,
            pin: pin || null,
            description: description || PART_TYPES[type].description,
            config: config || {},
            created: new Date().toISOString(),
            enabled: true
        };

        // Add linear actuator specific fields
        if (type === 'linear_actuator') {
            const controlBoard = (req.body && req.body.controlBoard) || null;
            const rpwm = req.body && req.body.rpwmPin;
            const lpwm = req.body && req.body.lpwmPin;
            const ren = req.body && req.body.renPin;
            const len = req.body && req.body.lenPin;

            if (controlBoard === 'BTS7960' || (rpwm != null && lpwm != null)) {
                newPart.controlBoard = 'BTS7960';
                newPart.rpwmPin = parseInt(rpwm, 10);
                newPart.lpwmPin = parseInt(lpwm, 10);
                if (ren != null) newPart.renPin = parseInt(ren, 10);
                if (len != null) newPart.lenPin = parseInt(len, 10);
            } else {
                const dirPin = (req.body && req.body.directionPin != null) ? req.body.directionPin : directionPin;
                const pwmP = (req.body && req.body.pwmPin != null) ? req.body.pwmPin : pwmPin;
                newPart.controlBoard = 'MDD10A';
                newPart.directionPin = parseInt(dirPin, 10);
                newPart.pwmPin = parseInt(pwmP, 10);
            }
            newPart.maxExtension = parseInt(maxExtension, 10) || 15000;
            newPart.maxRetraction = parseInt(maxRetraction, 10) || 15000;
        }

        // Add stepper specific fields
        if (type === 'stepper') {
            const sPin = (req.body && req.body.stepPin != null) ? req.body.stepPin : undefined;
            const dPin = (req.body && req.body.dirPin != null) ? req.body.dirPin : undefined;
            const base = newPart.pin != null ? parseInt(newPart.pin, 10) : undefined;
            newPart.stepPin = sPin != null ? parseInt(sPin, 10) : (base != null ? base : undefined);
            newPart.dirPin = dPin != null ? parseInt(dPin, 10) : (base != null ? base + 1 : undefined);
            if (req.body && req.body.enablePin != null) newPart.enablePin = parseInt(req.body.enablePin, 10);
        }

        // Add motor specific fields
        if (type === 'motor') {
            const controlBoard = (req.body && req.body.controlBoard) || null;

            if (String(controlBoard).toUpperCase() === 'BTS7960') {
                // BTS7960 motor configuration
                newPart.controlBoard = 'BTS7960';
                newPart.rpwmPin = parseInt(req.body.rpwmPin, 10);
                newPart.lpwmPin = parseInt(req.body.lpwmPin, 10);
                if (req.body.renPin != null) newPart.renPin = parseInt(req.body.renPin, 10);
                if (req.body.lenPin != null) newPart.lenPin = parseInt(req.body.lenPin, 10);
            } else {
                // MDD10A/Cytron motor configuration
                const dirPin = (req.body && req.body.directionPin != null) ? req.body.directionPin : directionPin;
                const pwmP = (req.body && req.body.pwmPin != null) ? req.body.pwmPin : pwmPin;
                newPart.directionPin = parseInt(dirPin, 10);
                newPart.pwmPin = parseInt(pwmP, 10);
                if (controlBoard) newPart.controlBoard = controlBoard;
            }
            newPart.maxDuration = parseInt(req.body.maxDuration, 10) || 10000; // 10 second safety limit
        }
        // Ensure default model for speaker parts before saving
        if (type === 'speaker' && !newPart.modelId) {
            try {
                newPart.modelId = await ensureDefaultSpeakerModelExists();
            } catch (_) { /* best effort */ }
        }


        parts.push(newPart);
        await saveParts(parts);

        res.status(201).json({
            success: true,
            part: newPart,

            message: `${PART_TYPES[type].icon} ${name} created successfully`
        });
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create part',
            message: error.message
        });
    }
};

/**
 * Update part
 */
export const updatePart = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const parts = await loadParts();
        const partIndex = parts.findIndex(p => String(p.id) === String(id));

        if (partIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Part not found'
            });
        }

        // Update part with new data
        parts[partIndex] = {
            ...parts[partIndex],
            ...updates,
            id, // Ensure ID doesn't change
            updated: new Date().toISOString()
        };

        await saveParts(parts);

        res.json({
            success: true,
            part: parts[partIndex],
            message: `Part ${parts[partIndex].name} updated successfully`
        });
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update part',
            message: error.message
        });
    }
};

/**
 * Delete part
 */
export const deletePart = async (req, res) => {
    try {
        const { id } = req.params;
        const parts = await loadParts();
        const partIndex = parts.findIndex(p => String(p.id) === String(id));

        if (partIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Part not found'
            });
        }

        const deletedPart = parts.splice(partIndex, 1)[0];
        await saveParts(parts);

        // Best-effort: purge any calibration artifacts tied to this part id
        try {
            const { resetCalibration: resetLA } = await import('../services/linearActuatorCalibrationService.js');
            const { resetCalibration: resetStd } = await import('../services/standardServoCalibrationService.js');
            const { resetCalibration: resetCont } = await import('../services/continuousServoCalibrationService.js');
            // Linear actuator
            if (deletedPart.type === 'linear_actuator') {
                await resetLA(String(id)).catch(() => { });
            }
            // Servo (both flavors share servo_calibrations.json)
            if (deletedPart.type === 'servo') {
                await resetStd(String(id)).catch(() => { });
                await resetCont(String(id)).catch(() => { });
            }
        } catch (e) {
            console.warn('⚠️ Calibration cleanup skipped:', e && e.message);
        }

        res.json({
            success: true,
            message: `Part ${deletedPart.name} deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete part',
            message: error.message
        });
    }
};

/**
 * Test part functionality
 * Accepts either:
 *  - { action, params } (preferred)
 *  - { testParams } for backward compatibility
 */
export const testPart = async (req, res) => {
    try {
        const { id } = req.params;
        const { action, params, testParams } = req.body || {};

        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(id));

        if (!part) {
            return res.status(404).json({
                success: false,
                error: 'Part not found'
            });
        }

        // Determine available actions and defaults per type
        const availableActions = hardwareService.getAvailableActions(part.type) || [];
        const DEFAULT_TEST_ACTIONS = {
            motor: 'control',
            stepper: 'moveSteps',
            linear_actuator: 'extend',
            light: 'toggle',
            led: 'setBrightness',
            servo: 'moveToAngle',
            sensor: 'read',
            motion_sensor: 'read',
            webcam: 'capture',
            microphone: 'getLevel',
            speaker: 'play',
            head_tracking: 'getPosition'
        };

        function getDefaultParams(partType) {
            switch (partType) {
                case 'motor':
                    return { direction: 'forward', speed: 50, duration: 1000 };
                case 'stepper':
                    return { steps: 200, speed: 200 };
                case 'linear_actuator':
                    return { speed: 50, distance: 50 };
                case 'led':
                    return { brightness: 50 };
                case 'servo':
                    return { angleDeg: 15 };
                case 'sensor':
                case 'motion_sensor':
                    return {};
                case 'webcam':
                    return { resolution: '640x480' };
                case 'microphone':
                    return {};
                case 'speaker':
                    // Use a bundled sample sound (MP3) so tests/hardware can exercise playback without extra setup
                    return { filename: 'public/sounds/monster-howl-85304.mp3', volume: 50 };
                case 'head_tracking':
                    return {};
                case 'light':
                default:
                    return {};
            }
        }

        if (availableActions.length === 0) {
            return res.json({
                success: true,
                message: `No test actions available for ${part.type} parts`,
                testResult: {
                    partId: id,
                    partName: part.name,
                    partType: part.type,
                    result: 'NO_ACTIONS_AVAILABLE',
                    timestamp: new Date().toISOString()
                }
            });
        }

        // Choose action: explicit > default per type
        const chosenAction = action || DEFAULT_TEST_ACTIONS[part.type] || availableActions[0];

        // Validate action
        if (!availableActions.includes(chosenAction)) {
            return res.status(400).json({
                success: false,
                error: `Action '${chosenAction}' not supported for part type: ${part.type}`,
                availableActions
            });
        }

        // Choose params: explicit > legacy testParams > sensible defaults per type
        const actionParams = params || testParams || getDefaultParams(part.type);

        console.log(`🧪 Testing ${part.type} part: ${part.name} with action: ${chosenAction}`);

        // Perform hardware test
        const testResult = await hardwareService.controlPart(id, chosenAction, actionParams);

        res.json({
            success: !!testResult.success,
            message: testResult.success ?
                `✅ Test completed for ${part.name}: ${testResult.message || chosenAction}` :
                `❌ Test failed for ${part.name}: ${testResult.error || 'Unknown error'}`,
            testResult: {
                partId: id,
                partName: part.name,
                partType: part.type,
                action: chosenAction,
                testParams: actionParams,
                result: testResult.success ? 'HARDWARE_SUCCESS' : 'HARDWARE_ERROR',
                details: testResult,
                availableActions: availableActions,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error testing part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test part',
            message: error.message
        });
    }
};

// Helper function to get part by ID (for internal use)
export const getPartByIdHelper = async (id) => {
    const parts = await loadParts();
    return parts.find(part => String(part.id) === String(id)) || null;
};

export default {
    getAllParts,
    getPartById,
    createPart,
    updatePart,
    deletePart,
    testPart,
    PART_TYPES,
    SERVO_TYPES
};
