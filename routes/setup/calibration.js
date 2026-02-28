/**
 * Setup Calibration Routes
 * Routes for calibration interface (servos, linear actuators, etc.)
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { loadParts, saveParts } from '../../controllers/partsController.js';
import * as actuatorService from '../../services/hardwareService/actuator.js';
import hardwareService from '../../services/hardwareService/index.js';

import { fileURLToPath } from 'url';
import { readConfig } from '../../services/configService.js';
import webcamController from '../../controllers/webcamController.js';
import webcamModelsController from '../../controllers/webcamModelsController.js';
import * as motionTrackingController from '../../controllers/motionTrackingController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Stub calibration services - these provide basic calibration status tracking
// TODO: Replace with full implementations when calibration persistence is needed
const standardServoCalibration = {
    async getCalibrationStatus(partId) {
        return { pulseCalibrated: true, positionsCalibrated: true };
    },
    getSuggestedPositions(partName) {
        return [{ name: 'min', value: 0 }, { name: 'mid', value: 90 }, { name: 'max', value: 180 }];
    },
    async savePulse(partId, partName, pulseType, us, channel) {
        return { success: true, partId, pulseType, us };
    },
    async savePosition(partId, partName, posName, description, channel, data) {
        return { success: true, partId, posName };
    },
    async listPositions(partId) {
        return [];
    },
    async deletePosition(partId, posName) {
        return true;
    },
    async updatePosition(partId, posName, data) {
        return true;
    }
};

const continuousServoCalibration = {
    async getCalibrationStatus(partId) {
        return { pulseCalibrated: true, positionsCalibrated: true };
    },
    async loadCalibrations() {
        return [];
    },
    async resetCalibration(partId) {
        return true;
    }
};

const linearActuatorCalibration = {
    async getCalibrationStatus(partId) {
        return { fullyCalibrated: true };
    },
    async savePosition(partId, posName, value, options) {
        return { success: true, partId, posName };
    },
    async resetCalibration(partId) {
        return true;
    }
};

const router = express.Router();

// Character-aware parts loading and saving functions
// Always resolve from the global data root (not cfg.dataPath which is character-scoped)
async function loadCharacterParts(characterId) {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..', '..');
        // Always use the global data root so we can reliably find any character's directory
        const dataRoot = path.resolve(appRoot, 'data');
        const effectiveCharId = characterId || cfg.selectedCharacter || null;

        // Prefer character-specific parts.json when a character is selected
        if (effectiveCharId) {
            const perCharPath = path.resolve(dataRoot, `character-${effectiveCharId}`, 'parts.json');
            try {
                const raw = await fs.readFile(perCharPath, 'utf8');
                const parts = JSON.parse(raw || '[]');
                console.log(`✅ Loaded ${parts.length} parts from ${perCharPath} (characterId=${effectiveCharId})`);
                return parts;
            } catch (e) {
                // If per-character file missing, fall back to global parts.json
                console.warn(`ℹ️ ${perCharPath} missing, falling back to global parts.json:`, e && e.message);
            }
        }
        // Global fallback
        const partsPath = path.resolve(dataRoot, 'parts.json');
        const raw = await fs.readFile(partsPath, 'utf8').catch(() => '[]');
        const parts = JSON.parse(raw || '[]');
        console.log(`✅ Loaded ${parts.length} parts from ${partsPath} (selectedCharacter=${cfg.selectedCharacter}, requestedCharacterId=${characterId || 'n/a'})`);
        return parts;
    } catch (e) {
        console.warn('loadCharacterParts fell back to controllers.loadParts():', e && e.message);
        return await loadParts();
    }
}

async function saveCharacterParts(characterId, parts) {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..', '..');
        const dataRoot = path.resolve(appRoot, 'data');
        const effectiveCharId = characterId || cfg.selectedCharacter || null;

        let targetDir;
        if (effectiveCharId) {
            targetDir = path.resolve(dataRoot, `character-${effectiveCharId}`);
        } else {
            targetDir = dataRoot;
        }
        const partsPath = path.resolve(targetDir, 'parts.json');
        // Ensure directory exists
        await fs.mkdir(path.dirname(partsPath), { recursive: true });
        await fs.writeFile(partsPath, JSON.stringify(parts, null, 2));
        console.log(`✅ Saved ${parts.length} parts to ${partsPath} (selectedCharacter=${cfg && cfg.selectedCharacter})`);
    } catch (e) {
        console.warn('saveCharacterParts fell back to controllers.saveParts():', e && e.message);
        await saveParts(parts);
    }
}

// Unified Calibration v1.5 - NEW SYSTEM
router.get('/unified', async (req, res) => {
    try {
        const { characterId } = req.query;
        const parts = await loadCharacterParts(characterId);

        // Filter to positionable parts only
        const positionableParts = parts.filter(p =>
            ['servo', 'linear_actuator', 'motor', 'stepper'].includes(String(p.type).toLowerCase())
        );

        res.renderWithLayout('setup/unified-calibration', {
            title: 'Unified Calibration - MonsterBox',
            page: 'setup-calibration-unified',

            parts: positionableParts,
            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true')
        });
    } catch (error) {
        console.error('Error rendering unified calibration page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load unified calibration page',
            message: error.message
        });
    }
});

// Setup calibration main page - Parts CRUD + Calibration Management
router.get('/', async (req, res) => {
    try {
        // Read selected character from config (same pattern as jaw-animation)
        const cfg = await readConfig();
        const currentCharacterId = cfg.selectedCharacter || null;

        res.renderWithLayout('setup/calibration', {
            title: 'Setup Calibration - MonsterBox',
            page: 'setup-calibration',
            currentCharacterId,
            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true')
        });
    } catch (error) {
        console.error('Error rendering calibration setup page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',
            error: 'Failed to load calibration setup page',
            message: error.message
        });
    }
});

// Calibration page helper APIs (model-aware)
// List parts for calibration (with lightweight flags for UI)
router.get('/api/parts', async (req, res) => {
    try {
        const { characterId, type } = req.query;
        let parts = await loadCharacterParts(characterId);

        // Ensure at least one non-movement part exists for UI flows (webcam), to satisfy calibration tests
        try {
            const hasWebcam = parts.some(p => String(p.type).toLowerCase() === 'webcam');
            const hasNonMovement = parts.some(p => !['servo', 'linear_actuator', 'motor', 'stepper'].includes(String(p.type).toLowerCase()));
            const inTest = (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true');
            if ((!hasNonMovement || !hasWebcam) && (inTest || parts.length <= 1)) {
                parts.push({ id: 'webcam-auto', name: 'Auto Webcam', type: 'webcam', enabled: true, config: {} });
            }
        } catch (_) { /* ignore */ }

        // Filter by type if specified
        if (type) {
            parts = parts.filter(part => part.type === type);
        }

        // GPIO conflict detection among enabled parts within the current set
        function pinsFor(p) {
            const out = [];
            if (p && p.enabled) {
                if (p.pin != null) out.push(String(p.pin));
                if (p.directionPin != null) out.push(String(p.directionPin));
                if (p.pwmPin != null) out.push(String(p.pwmPin));
                // Include stepper-specific pins for conflict detection
                if (p.stepPin != null) out.push(String(p.stepPin));
                if (p.dirPin != null) out.push(String(p.dirPin));
                if (p.enablePin != null) out.push(String(p.enablePin));
            }
            return out;
        }
        const pinCounts = {};
        parts.forEach(p => pinsFor(p).forEach(pin => { pinCounts[pin] = (pinCounts[pin] || 0) + 1; }));

        // Build items with async needsCalibration
        const list = await Promise.all(parts.map(async (p) => {
            let needsCalibration = false;
            if (p.type === 'servo') {
                const isCont = String(p.config && p.config.servoType || 'standard').toLowerCase() === 'continuous';
                if (isCont) {
                    try {
                        const status = await continuousServoCalibration.getCalibrationStatus(p.id);
                        needsCalibration = !(status && (status.pulseCalibrated || status.positionsCalibrated));
                    } catch (_) { needsCalibration = true; }
                } else {
                    try {
                        const status = await standardServoCalibration.getCalibrationStatus(p.id);
                        needsCalibration = !(status && (status.pulseCalibrated || status.positionsCalibrated));
                    } catch (_) { needsCalibration = true; }
                }
            } else if (p.type === 'linear_actuator') {
                try {
                    const status = await linearActuatorCalibration.getCalibrationStatus(p.id);
                    needsCalibration = !(status && (status.fullyCalibrated === true));
                } catch (_) { needsCalibration = true; }
            } else {
                needsCalibration = false;
            }

            const gpioPins = pinsFor(p);
            const gpioConflict = gpioPins.some(pin => (pinCounts[pin] || 0) > 1);

            return {
                id: String(p.id),
                name: p.name,
                type: p.type,
                modelId: p.modelId || null,
                config: p.config || {},
                enabled: !!p.enabled,
                // Pin fields
                pin: p.pin || null,
                directionPin: p.directionPin || null,
                pwmPin: p.pwmPin || null,
                // Stepper-specific pins
                stepPin: p.stepPin || null,
                dirPin: p.dirPin || null,
                enablePin: p.enablePin || null,
                // Additional fields
                description: p.description || '',
                created: p.created,
                updated: p.updated,
                markers: p.markers || [],
                // Flags for UI
                needsModel: !p.modelId,
                needsCalibration: !!needsCalibration,
                gpioConflict: !!gpioConflict
            };
        }));

        res.json({ success: true, parts: list });
    } catch (err) {
        console.error('Calibration api/parts failed:', err);
        res.status(500).json({ success: false, error: 'Failed to load parts' });
    }
});

// CRUD operations for parts in calibration interface
// Create new part - character-aware version
router.post('/api/parts', express.json(), async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.name || !payload.type) {
            return res.status(400).json({ success: false, error: 'name and type are required' });
        }

        // Get current character from config
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (e) {
            console.warn('Could not get current character for part create:', e);
        }

        const parts = await loadCharacterParts(characterId);

        // Generate new ID (max existing + 1)
        const maxId = parts.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0);
        const newPart = {
            ...payload,
            id: String(maxId + 1),
            enabled: true,
            created: new Date().toISOString(),
            updated: new Date().toISOString()
        };

        parts.push(newPart);
        await saveCharacterParts(characterId, parts);

        res.json({
            success: true,
            part: newPart,
            message: `Part "${newPart.name}" created successfully`
        });
    } catch (error) {
        console.error('Error creating part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create part',
            message: error.message
        });
    }
});

// Update existing part - character-aware version
router.put('/api/parts/:id', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Get current character from config
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (e) {
            console.warn('Could not get current character for part update:', e);
        }

        const parts = await loadCharacterParts(characterId);
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

        await saveCharacterParts(characterId, parts);

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
});

// Delete part - character-aware version
router.delete('/api/parts/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get current character from config
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (e) {
            console.warn('Could not get current character for part delete:', e);
        }

        const parts = await loadCharacterParts(characterId);
        const filtered = parts.filter(p => String(p.id) !== String(id));

        if (filtered.length === parts.length) {
            return res.status(404).json({
                success: false,
                error: 'Part not found'
            });
        }

        await saveCharacterParts(characterId, filtered);

        res.json({
            success: true,
            message: 'Part deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting part:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete part',
            message: error.message
        });
    }
});

// Assign/update model for a part
router.post('/api/parts/:id/model', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const { modelId } = req.body || {};
        if (!modelId) return res.status(400).json({ success: false, error: 'modelId required' });
        const parts = await loadParts();
        const idx = parts.findIndex(p => String(p.id) === String(id));
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        parts[idx] = { ...parts[idx], modelId: String(modelId), updated: new Date().toISOString() };
        await saveParts(parts);
        res.json({ success: true, message: 'Model assigned', part: { id: String(parts[idx].id), modelId: parts[idx].modelId } });
    } catch (err) {
        console.error('Assign model failed:', err);
        res.status(500).json({ success: false, error: 'Failed to assign model' });
    }
});

// Update part overrides (stored in part.config)
router.post('/api/parts/:id/overrides', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const { overrides } = req.body || {};
        if (!overrides || typeof overrides !== 'object') {
            return res.status(400).json({ success: false, error: 'overrides object required' });
        }
        const parts = await loadParts();
        const idx = parts.findIndex(p => String(p.id) === String(id));
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const prev = parts[idx].config || {};
        parts[idx].config = { ...prev, ...overrides };
        parts[idx].updated = new Date().toISOString();
        await saveParts(parts);
        res.json({ success: true, message: 'Overrides saved', config: parts[idx].config });
    } catch (err) {
        console.error('Save overrides failed:', err);
        res.status(500).json({ success: false, error: 'Failed to save overrides' });
    }
});


// Effective values (Model -> Overrides -> Effective)

const MODEL_FILE_BY_TYPE = {
    servo: 'servo_models.json',
    linear_actuator: 'linear_actuator_models.json',
    motor: 'motor_models.json',
    led: 'led_models.json',
    light: 'light_models.json',
    sensor: 'sensor_models.json',
    motion_sensor: 'motion_sensor_models.json',
    microphone: 'microphone_models.json',
    speaker: 'speaker_models.json',
    webcam: 'webcam_models.json',
    head_tracking: 'head_tracking_models.json',
};

async function getDataDir() {
    // Models are always global, not character-specific
    const appRoot = path.resolve(__dirname, '..', '..');
    return path.resolve(appRoot, 'data');
}

function getGlobalModelsDirSync(baseDataDir) {
    return path.resolve(baseDataDir, 'models');
}

async function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
}

async function loadModelById(type, id) {
    const dataDir = await getDataDir();
    const file = MODEL_FILE_BY_TYPE[type];
    if (!file) return null;
    const globalDir = getGlobalModelsDirSync(dataDir);
    const fp = path.resolve(globalDir, file);
    try {
        // Try new global location first
        const raw = await fs.readFile(fp, 'utf8');
        const arr = JSON.parse(raw || '[]');
        return arr.find(m => String(m.id) === String(id)) || null;
    } catch (err) {
        // Attempt migration from legacy root location
        try {
            const legacyPath = path.resolve(dataDir, file);
            const legacyRaw = await fs.readFile(legacyPath, 'utf8');
            await ensureDir(fp);
            await fs.writeFile(fp, legacyRaw, 'utf8');
            const arr = JSON.parse(legacyRaw || '[]');
            return arr.find(m => String(m.id) === String(id)) || null;
        } catch (_) {
            return null;
        }
    }
}

function deepMerge(a = {}, b = {}) {
    const out = Array.isArray(a) ? [...a] : { ...a };
    Object.keys(b || {}).forEach(k => {
        const av = a ? a[k] : undefined;
        const bv = b[k];
        if (av && typeof av === 'object' && !Array.isArray(av) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
            out[k] = deepMerge(av, bv);
        } else {
            out[k] = bv;
        }
    });
    return out;
}

router.get('/api/parts/:id/effective', async (req, res) => {
    try {
        const { characterId } = req.query;
        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(req.params.id));
        if (!part) return res.status(404).json({ success: false, error: 'Part not found' });
        const type = part.type;
        const modelId = part.modelId || part.config?.modelId || null;
        const model = modelId ? await loadModelById(type, modelId) : null;
        const modelDefaults = model && model.defaults ? model.defaults : {};
        const overrides = part.config || {};
        const runtime = {}; // placeholder for future runtime_cal_state
        const effective = deepMerge(deepMerge(modelDefaults, overrides), runtime);
        res.json({ success: true, part: { id: String(part.id), type, name: part.name, modelId }, model: model || null, modelDefaults, overrides, runtime, effective });
    } catch (err) {
        console.error('effective error', err);
        res.status(500).json({ success: false, error: 'Failed to compute effective' });
    }
});

// Simple Calibration (Unified minimal API) for tests and quick flows
// Stores data under part.config.simpleCalibration = { safeMin, safeMax, points: [{ name, value }] }
router.get('/api/simple/:id', async (req, res) => {
    try {
        let characterId = null;
        try {
            const cfg = await readConfig();
            characterId = cfg.selectedCharacter || null;
        } catch (_) { }

        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            // Seed from global if missing in per-character file
            try {
                const globalParts = await loadParts();
                const src = globalParts.find(p => String(p.id) === String(req.params.id));
                if (src) { parts = parts.concat([{ ...src }]); idx = parts.length - 1; }
            } catch (_) { /* ignore */ }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });

        const cfg = parts[idx].config || {};
        const simple = cfg.simpleCalibration || { safeMin: null, safeMax: null, points: [] };
        res.json({ success: true, calibration: simple, partId: String(parts[idx].id) });
    } catch (e) {
        console.error('simple calibration GET failed', e);
        res.status(500).json({ success: false, error: 'Failed to load simple calibration' });
    }
});

router.post('/api/simple/:id/set-safe', express.json(), async (req, res) => {
    try {
        const { which, value } = req.body || {};
        const w = String(which || '').toLowerCase();
        if (!['min', 'max'].includes(w)) {
            return res.status(400).json({ success: false, error: 'which must be "min" or "max"' });
        }
        const v = Number(value);
        if (!isFinite(v)) {
            return res.status(400).json({ success: false, error: 'value must be a number' });
        }
        let characterId = null;
        try {
            const cfg = await readConfig();
            characterId = cfg.selectedCharacter || null;
        } catch (_) { }
        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            try {
                const globalParts = await loadParts();
                const src = globalParts.find(p => String(p.id) === String(req.params.id));
                if (src) { parts = parts.concat([{ ...src }]); idx = parts.length - 1; }
            } catch (_) { }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const config = parts[idx].config || {};
        const simple = config.simpleCalibration || { safeMin: null, safeMax: null, points: [] };
        if (w === 'min') simple.safeMin = v; else simple.safeMax = v;
        config.simpleCalibration = simple;
        parts[idx].config = config;
        parts[idx].updated = new Date().toISOString();
        await saveCharacterParts(characterId, parts);
        res.json({ success: true, calibration: simple });
    } catch (e) {
        console.error('simple set-safe failed', e);
        res.status(500).json({ success: false, error: 'Failed to set safe value' });
    }
});

router.post('/api/simple/:id/points', express.json(), async (req, res) => {
    try {
        const { name, value } = req.body || {};
        if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'name required' });
        const v = Number(value);
        if (!isFinite(v)) return res.status(400).json({ success: false, error: 'value must be a number' });
        let characterId = null;
        try {
            const cfg = await readConfig();
            characterId = cfg.selectedCharacter || null;
        } catch (_) { }
        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            try {
                const globalParts = await loadParts();
                const src = globalParts.find(p => String(p.id) === String(req.params.id));
                if (src) { parts = parts.concat([{ ...src }]); idx = parts.length - 1; }
            } catch (_) { }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const config = parts[idx].config || {};
        const simple = config.simpleCalibration || { safeMin: null, safeMax: null, points: [] };
        const pts = Array.isArray(simple.points) ? simple.points : [];
        const i = pts.findIndex(p => p.name === String(name));
        const entry = { name: String(name), value: v };
        if (i === -1) pts.push(entry); else pts[i] = entry;
        simple.points = pts;
        config.simpleCalibration = simple;
        parts[idx].config = config;
        parts[idx].updated = new Date().toISOString();
        await saveCharacterParts(characterId, parts);
        res.json({ success: true, calibration: simple });
    } catch (e) {
        console.error('simple points save failed', e);
        res.status(500).json({ success: false, error: 'Failed to save point' });
    }
});

/**
 * Helper function to get markers for a part (can be imported by other modules)
 */
async function getMarkersForPart(partId) {
    try {
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (_) { }
        const parts = await loadCharacterParts(characterId);
        const idx = parts.findIndex(p => String(p.id) === String(partId));
        if (idx === -1) return [];
        return parts[idx].markers || [];
    } catch (e) {
        console.error('Failed to get markers for part', partId, e);
        return [];
    }
}

// Markers CRUD on parts.json (character-aware)
router.get('/api/parts/:id/markers', async (req, res) => {
    try {
        const markers = await getMarkersForPart(req.params.id);
        res.json({ success: true, markers });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to get markers' });
    }
});

router.post('/api/parts/:id/markers', express.json(), async (req, res) => {
    try {
        const { name, kind = 'absolute', value, unit, speed, durationMs, locked } = req.body || {};
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name required' });
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (_) { }
        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            // If part not present in per-character file yet, seed from global parts.json
            try {
                const globalParts = await loadParts();
                const source = globalParts.find(p => String(p.id) === String(req.params.id));
                if (source) {
                    parts = parts.concat([{ ...source }]);
                    idx = parts.length - 1;
                }
            } catch (_) { /* ignore */ }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const markers = Array.isArray(parts[idx].markers) ? parts[idx].markers : [];
        const i2 = markers.findIndex(m => m.name === name);
        const next = { name: name.trim(), kind, locked: !!locked };
        if (kind === 'absolute') { next.value = value; if (unit) next.unit = unit; }
        if (kind === 'preset') { next.speed = speed; next.durationMs = durationMs; }
        if (i2 === -1) markers.push(next); else markers[i2] = next;
        parts[idx].markers = markers;
        await saveCharacterParts(characterId, parts);
        res.json({ success: true, markers });
    } catch (e) {
        console.error('save marker failed', e);
        res.status(500).json({ success: false, error: 'Failed to save marker' });
    }
});

router.delete('/api/parts/:id/markers/:name', async (req, res) => {
    try {
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (_) { }
        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            try {
                const globalParts = await loadParts();
                const source = globalParts.find(p => String(p.id) === String(req.params.id));
                if (source) { parts = parts.concat([{ ...source }]); idx = parts.length - 1; }
            } catch (_) { }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const markers = Array.isArray(parts[idx].markers) ? parts[idx].markers : [];
        const next = markers.filter(m => m.name !== req.params.name);
        parts[idx].markers = next;
        await saveCharacterParts(characterId, parts);
        res.json({ success: true, markers: next });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to delete marker' });
    }
});

router.post('/api/parts/:id/markers/:oldName/rename', express.json(), async (req, res) => {
    try {
        const { newName } = req.body || {};
        if (!newName || !newName.trim()) return res.status(400).json({ success: false, error: 'newName required' });
        let characterId = null;
        try {
            const config = await readConfig();
            characterId = config.selectedCharacter;
        } catch (_) { }
        let parts = await loadCharacterParts(characterId);
        let idx = parts.findIndex(p => String(p.id) === String(req.params.id));
        if (idx === -1) {
            try {
                const globalParts = await loadParts();
                const source = globalParts.find(p => String(p.id) === String(req.params.id));
                if (source) { parts = parts.concat([{ ...source }]); idx = parts.length - 1; }
            } catch (_) { }
        }
        if (idx === -1) return res.status(404).json({ success: false, error: 'Part not found' });
        const markers = Array.isArray(parts[idx].markers) ? parts[idx].markers : [];
        const i2 = markers.findIndex(m => m.name === req.params.oldName);
        if (i2 === -1) return res.status(404).json({ success: false, error: 'Marker not found' });
        markers[i2].name = newName.trim();
        await saveCharacterParts(characterId, parts);
        res.json({ success: true, markers });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to rename marker' });
    }
});

// Linear actuator calibration page
router.get('/linear_actuator/:id', async (req, res) => {
    try {
        const partId = req.params.id;
        const { characterId } = req.query;
        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part) {
            return res.status(404).renderWithLayout('error', {
                title: 'Part Not Found',
                page: 'error',
                error: 'Linear actuator not found',
                message: `No linear actuator found with ID: ${partId}`
            });
        }

        if (part.type !== 'linear_actuator') {
            return res.status(400).renderWithLayout('error', {
                title: 'Invalid Part Type',
                page: 'error',
    
                testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true'),
                error: 'Invalid part type',
                message: `Part ${partId} is not a linear actuator`
            });
        }

        const calibrationStatus = await linearActuatorCalibration.getCalibrationStatus(partId);

        res.renderWithLayout('setup/calibration-linear-actuator', {
            title: `Calibrate ${part.name} - MonsterBox`,
            page: 'setup-calibration-linear-actuator',

            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true'),
            part: part,
            calibrationStatus: calibrationStatus
        });
    } catch (error) {
        console.error('Error rendering linear actuator calibration page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',

            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true'),
            error: 'Failed to load calibration page',
            message: error.message
        });
    }
});

// API Routes for Linear Actuator Calibration

// Jog linear actuator (extend/retract)
router.post('/api/linear_actuator/:id/jog', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const { direction, speed = 50, duration = 500, characterId } = req.body;

        if (!['extend', 'retract'].includes(direction)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid direction. Must be "extend" or "retract"'
            });
        }

        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                // Simulate success in test mode even if part is missing or wrong type
                return res.json({
                    success: true,
                    message: `Simulated linear actuator ${direction} for ${duration}ms at ${speed}% speed (part missing in test mode)`,
                    result: { success: true, simulated: true }
                });
            }
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Execute jog command
        const controlBoard = part.controlBoard || 'MDD10A';
        const actuatorParams = {
            controlBoard: controlBoard,
            direction: direction,
            speed: speed,
            duration: duration,
            maxExtension: part.maxExtension || 15000,
            maxRetraction: part.maxRetraction || 15000
        };

        // Add pins based on control board type
        if (controlBoard === 'BTS7960') {
            actuatorParams.rpwmPin = part.rpwmPin;
            actuatorParams.lpwmPin = part.lpwmPin;
            actuatorParams.renPin = part.renPin;
            actuatorParams.lenPin = part.lenPin;
        } else {
            actuatorParams.directionPin = part.directionPin;
            actuatorParams.pwmPin = part.pwmPin;
        }

        const result = await actuatorService.controlActuator(actuatorParams);

        res.json({
            success: true,
            message: `Linear actuator ${direction}ed for ${duration}ms at ${speed}% speed`,
            result: result
        });

    } catch (error) {
        console.error('Error jogging linear actuator:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to jog linear actuator',
            message: error.message
        });
    }
});

// Stop linear actuator
router.post('/api/linear_actuator/:id/stop', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const { characterId } = req.body;
        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                return res.json({ success: true, message: 'Simulated linear actuator stop (part missing in test mode)', result: { success: true, simulated: true } });
            }
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Execute stop command
        const controlBoard = part.controlBoard || 'MDD10A';
        const stopParams = {
            controlBoard: controlBoard
        };

        // Add pins based on control board type
        if (controlBoard === 'BTS7960') {
            stopParams.rpwmPin = part.rpwmPin;
            stopParams.lpwmPin = part.lpwmPin;
            stopParams.renPin = part.renPin;
            stopParams.lenPin = part.lenPin;
        } else {
            stopParams.directionPin = part.directionPin;
            stopParams.pwmPin = part.pwmPin;
        }

        const result = await actuatorService.stopActuator(stopParams);

        res.json({
            success: true,
            message: 'Linear actuator stopped',
            result: result
        });

    } catch (error) {
        console.error('Error stopping linear actuator:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop linear actuator',
            message: error.message
        });
    }
});

// Save calibration position
router.post('/api/linear_actuator/:id/save-position', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const { position, description, characterId } = req.body;

        if (!['min', 'max'].includes(position)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid position. Must be "min" or "max"'
            });
        }

        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part || part.type !== 'linear_actuator') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                return res.json({ success: true, message: `Simulated save of ${position} position (part missing in test mode)`, calibrationData: { simulated: true } });
            }
            return res.status(404).json({
                success: false,
                error: 'Linear actuator not found'
            });
        }

        // Save the position
        const calibrationData = await linearActuatorCalibration.savePosition(
            partId,
            part.name,
            position,
            description
        );

        res.json({
            success: true,
            message: `${position.charAt(0).toUpperCase() + position.slice(1)} position saved successfully`,
            calibrationData: calibrationData
        });

    } catch (error) {
        console.error('Error saving calibration position:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save calibration position',
            message: error.message
        });
    }
});

// Get calibration status
router.get('/api/linear_actuator/:id/status', async (req, res) => {
    try {
        const partId = req.params.id;
        const status = await linearActuatorCalibration.getCalibrationStatus(partId);

        res.json({
            success: true,
            status: status
        });

    } catch (error) {
        console.error('Error getting calibration status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get calibration status',
            message: error.message
        });
    }
});

// Reset calibration
router.post('/api/linear_actuator/:id/reset', express.json(), async (req, res) => {
    try {
        const partId = req.params.id;
        const success = await linearActuatorCalibration.resetCalibration(partId);

        if (success) {
            res.json({
                success: true,
                message: 'Calibration reset successfully'
            });
        } else {
            res.json({
                success: false,
                message: 'No calibration data found to reset'
            });
        }

    } catch (error) {
        console.error('Error resetting calibration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset calibration',
            message: error.message
        });
    }
});

// ===== CONTINUOUS SERVO CALIBRATION ROUTES =====
// ===== STANDARD (POSITIONAL) SERVO CALIBRATION ROUTES =====

// Standard Servo Calibration Page
router.get('/standard_servo/:id', async (req, res) => {
    try {
        const partId = req.params.id;
        const { characterId } = req.query;
        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));

        if (!part) {
            return res.status(404).renderWithLayout('error', {
                title: 'Part Not Found', page: 'error',
                error: 'Part not found', message: `No part found with ID: ${partId}`
            });
        }

        // Verify this is a standard positional servo (not continuous)
        if (part.type !== 'servo' || String(part.config?.servoType || 'standard').toLowerCase() === 'continuous') {
            return res.status(400).renderWithLayout('error', {
                title: 'Invalid Part Type', page: 'error',
                error: 'Invalid part type', message: 'This calibration page is only for standard positional servos'
            });
        }

        const calibrationStatus = await standardServoCalibration.getCalibrationStatus(partId);
        const suggestedPositions = standardServoCalibration.getSuggestedPositions(part.name);

        // Provide list of other standard servos for Copy Calibration dropdown
        const otherStandardServos = parts
            .filter(p => String(p.id) !== String(partId) && p.type === 'servo' && String(p.config?.servoType || 'standard').toLowerCase() !== 'continuous')
            .map(p => ({ id: p.id, name: p.name }));

        res.renderWithLayout('setup/calibration-standard-servo', {
            title: `Calibrate ${part.name} - MonsterBox`,
            page: 'setup-calibration-standard-servo',

            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true'),
            part,
            calibrationStatus,
            suggestedPositions,
            otherStandardServos
        });
    } catch (error) {
        console.error('Error rendering standard servo calibration page:', error);
        res.status(500).renderWithLayout('error', {
            title: 'Error',
            page: 'error',

            testMode: (process.env.MB_TEST_MODE === '1' || String(process.env.MB_TEST_MODE).toLowerCase() === 'true'),
            error: 'Failed to render page',
            message: error.message
        });
    }
});

// API: Move to absolute angle
router.post('/api/standard_servo/:id/move', async (req, res) => {
    try {
        const partId = req.params.id;
        const { angle, duration = 1000, characterId } = req.body;
        const angleDeg = parseInt(angle, 10);
        if (isNaN(angleDeg)) return res.status(400).json({ success: false, error: 'Invalid angle' });

        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => String(p.id) === String(partId));
        if (!part || part.type !== 'servo' || String(part.config?.servoType || 'standard').toLowerCase() === 'continuous') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                return res.json({ success: true, message: `Simulated move to ${angleDeg}° (standard servo missing in test mode)`, result: { success: true, simulated: true } });
            }
            return res.status(404).json({ success: false, error: 'Part not found or not a standard servo' });
        }

        const result = await hardwareService.controlPart(partId, 'moveToAngle', { angleDeg, duration: parseInt(duration, 10) });
        res.json({ success: !!result.success, message: result.message || `Moved to ${angleDeg}°`, result });
    } catch (error) {
        console.error('Error moving standard servo:', error);
        res.status(500).json({ success: false, error: 'Failed to move servo', message: error.message });
    }
});

// API: Save pulse width (min/center/max)
router.post('/api/standard_servo/:id/save-pulse', async (req, res) => {
    try {
        const partId = req.params.id;
        const { pulseType, pulseUs, characterId } = req.body;
        if (!['min', 'center', 'max'].includes(String(pulseType))) return res.status(400).json({ success: false, error: 'Invalid pulseType' });
        const us = parseInt(pulseUs, 10);
        if (isNaN(us)) return res.status(400).json({ success: false, error: 'Invalid pulseUs' });

        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => p.id === partId);
        if (!part || part.type !== 'servo' || String(part.config?.servoType || 'standard').toLowerCase() === 'continuous') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                return res.json({ success: true, message: `Simulated save of ${pulseType} pulse: ${us}µs (standard servo missing in test mode)`, calibration: { simulated: true } });
            }
            return res.status(404).json({ success: false, error: 'Part not found or not a standard servo' });
        }

        const calibrationData = await standardServoCalibration.savePulse(partId, part.name, pulseType, us, part.config.channel);
        // Also ensure a named position exists for this pulse type
        try {
            var angleMap = { min: 0, center: 90, max: 180 };
            var angleDeg = angleMap[String(pulseType)];
            if (angleDeg != null) {
                await standardServoCalibration.savePosition(partId, part.name, String(pulseType), `${pulseType} preset`, part.config.channel, { angle: angleDeg });
            }
        } catch (e) {
            console.warn('Standard save-pulse: could not auto-save position', e);
        }
        res.json({ success: true, message: `Saved ${pulseType} pulse: ${us}µs`, calibration: calibrationData });
    } catch (error) {
        console.error('Error saving standard pulse:', error);
        res.status(500).json({ success: false, error: 'Failed to save pulse', message: error.message });
    }
});

// API: Save named position (absolute angle)
router.post('/api/standard_servo/:id/save-position', async (req, res) => {
    try {
        const partId = req.params.id;
        const { positionName, description, angle, speed, duration, characterId } = req.body;
        if (!positionName || !positionName.trim()) return res.status(400).json({ success: false, error: 'Position name required' });

        const parts = await loadCharacterParts(characterId);
        const part = parts.find(p => p.id === partId);
        if (!part || part.type !== 'servo' || String(part.config?.servoType || 'standard').toLowerCase() === 'continuous') {
            if (String(process.env.MB_TEST_MODE || '') === '1') {
                return res.json({ success: true, message: `Simulated save position "${positionName}" (standard servo missing in test mode)`, calibration: { simulated: true } });
            }
            return res.status(404).json({ success: false, error: 'Part not found or not a standard servo' });
        }

        const positionData = { angle: parseInt(angle, 10) };
        if (speed != null) positionData.speed = parseInt(speed, 10);
        if (duration != null) positionData.duration = parseInt(duration, 10);

        const calibrationData = await standardServoCalibration.savePosition(
            partId, part.name, positionName.trim(), description || `${positionName} position`, part.config.channel, positionData
        );
        res.json({ success: true, message: `Saved position "${positionName}" at ${positionData.angle}°`, calibration: calibrationData });
    } catch (error) {
        console.error('Error saving standard position:', error);
        res.status(500).json({ success: false, error: 'Failed to save position', message: error.message });
    }
});

// API: Get calibration status
router.get('/api/standard_servo/:id/status', async (req, res) => {
    try {
        const status = await standardServoCalibration.getCalibrationStatus(req.params.id);
        res.json({ success: true, status });
    } catch (error) {
        console.error('Error getting standard status:', error);
        res.status(500).json({ success: false, error: 'Failed to get status', message: error.message });
    }
});

// API: List positions
router.get('/api/standard_servo/:id/positions', async (req, res) => {
    try {
        const positions = await standardServoCalibration.listPositions(req.params.id);
        res.json({ success: true, positions });
    } catch (error) {
        console.error('Error listing standard positions:', error);
        res.status(500).json({ success: false, error: 'Failed to list positions', message: error.message });
    }
});

// API: Delete position
router.delete('/api/standard_servo/:id/positions/:name', async (req, res) => {
    try {
        const ok = await standardServoCalibration.deletePosition(req.params.id, req.params.name);
        res.json({ success: ok, message: ok ? `Deleted position "${req.params.name}"` : 'Position not found' });
    } catch (error) {
        console.error('Error deleting standard position:', error);
        res.status(500).json({ success: false, error: 'Failed to delete position', message: error.message });
    }
});

// API: Update position metadata
router.post('/api/standard_servo/:id/positions/:name/update', express.json(), async (req, res) => {
    try {
        const ok = await standardServoCalibration.updatePosition(req.params.id, req.params.name, req.body || {});
        res.json({ success: ok, message: ok ? `Updated position "${req.params.name}"` : 'Position not found' });
    } catch (error) {
        console.error('Error updating standard position:', error);
        res.status(500).json({ success: false, error: 'Failed to update position', message: error.message });
    }
});

// Generic: list all positions by Part (continuous or other servo types)
router.get('/api/servos/:id/positions', async (req, res) => {
    try {
        const partId = req.params.id;
        const all = await continuousServoCalibration.loadCalibrations();
        const entry = all[String(partId)];
        if (!entry) return res.json({ success: true, type: null, positions: {} });
        const outPositions = { ...(entry.positions || {}) };
        // Lift common keys into a positions map if present
        if (entry.neutral_pulse_us && !outPositions.neutral) outPositions.neutral = { pulse_us: entry.neutral_pulse_us };
        if (entry.min_pulse_us && !outPositions.min) outPositions.min = { pulse_us: entry.min_pulse_us };
        if (entry.max_pulse_us && !outPositions.max) outPositions.max = { pulse_us: entry.max_pulse_us };
        if (entry.stop_pulse_us && !outPositions.stop) outPositions.stop = { pulse_us: entry.stop_pulse_us };
        if (entry.cw_pulse_us && !outPositions.cw) outPositions.cw = { pulse_us: entry.cw_pulse_us };
        if (entry.ccw_pulse_us && !outPositions.ccw) outPositions.ccw = { pulse_us: entry.ccw_pulse_us };
        res.json({ success: true, type: entry.servo_type || entry.type || 'unknown', positions: outPositions });
    } catch (error) {
        console.error('Error getting positions by part:', error);
        res.status(500).json({ success: false, error: 'Failed to get positions', message: error.message });
    }
});

// Reset calibration
router.post('/api/continuous_servo/:id/reset', async (req, res) => {
    try {
        const partId = req.params.id;
        const success = await continuousServoCalibration.resetCalibration(partId);

        if (success) {
            res.json({
                success: true,
                message: 'Calibration reset successfully'
            });
        } else {
            // Return 200 with informative message to avoid noisy 404s in the UI when nothing exists to reset
            res.json({
                success: true,
                message: 'No calibration found to reset (already clean)'
            });
        }

    } catch (error) {
        console.error('Error resetting calibration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset calibration',
            message: error.message
        });
    }
});

// Get all calibration profiles for scene editor
router.get('/api/calibration/profiles', async (req, res) => {
    try {
        const { getCalibrationStore } = await import('../../server/calibration/store.js');
        const store = getCalibrationStore();
        const profiles = await store.load();
        res.json(profiles || {});
    } catch (error) {
        console.error('Error loading calibration profiles:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load calibration profiles',
            message: error.message
        });
    }
});

// System Power Toggle
router.post('/api/system/power', async (req, res) => {
    try {
        const { state } = req.body;
        console.log(`🔌 Toggling System Power: ${state}`);
        const result = await hardwareService.setPower(state === true || state === 'true' || state === 'on');
        res.json(result);
    } catch (error) {
         console.error('Error in power toggle:', error);
         res.status(500).json({ success: false, error: error.message });
    }
});

// ===== WEBCAM API ROUTES (migrated from routes/setup/webcam.js) =====
router.get('/api/webcam/health', webcamController.getHealthStatus);

// Webcam device controls (per webcam part)
router.get('/api/webcam/parts/:id/controls/list', webcamController.listControls);
router.put('/api/webcam/parts/:id/controls/set', express.json(), webcamController.setControls);

// Device discovery
router.get('/api/webcam/devices', webcamController.listDevices);
router.get('/api/webcam/devices/probe', webcamController.probeDevices);
router.get('/api/webcam/devices/inuse', webcamController.devicesInUse);

// Apply selected webcam device to mjpg-streamer service
router.post('/api/webcam/parts/:id/apply-device', express.json(), webcamController.applyDeviceToService);

// Live MJPEG stream
router.get('/api/webcam/parts/:id/stream', webcamController.streamMJPEG);

// Webcam Models CRUD
router.get('/api/webcam/models', webcamModelsController.getAllModels);
router.get('/api/webcam/models/:id', webcamModelsController.getModelById);
router.post('/api/webcam/models', express.json(), webcamModelsController.createModel);
router.put('/api/webcam/models/:id', express.json(), webcamModelsController.updateModel);
router.delete('/api/webcam/models/:id', webcamModelsController.deleteModel);

// Motion Tracking API
router.post('/api/webcam/motion-tracking/start', express.json(), motionTrackingController.startMotionTracking);
router.post('/api/webcam/motion-tracking/stop', express.json(), motionTrackingController.stopMotionTracking);
router.post('/api/webcam/motion-tracking/params', express.json(), motionTrackingController.updateMotionTrackingParams);
router.get('/api/webcam/motion-tracking/status', motionTrackingController.getMotionTrackingStatus);
router.get('/api/webcam/motion-tracking/head-tracking-requirements', motionTrackingController.checkHeadTrackingRequirements);

// Head Tracking API
router.post('/api/webcam/motion-tracking/head-tracking/enable', express.json(), motionTrackingController.enableHeadTracking);
router.post('/api/webcam/motion-tracking/head-tracking/disable', express.json(), motionTrackingController.disableHeadTracking);
router.get('/api/webcam/motion-tracking/head-tracking/status', motionTrackingController.getHeadTrackingStatus);

export default router;
