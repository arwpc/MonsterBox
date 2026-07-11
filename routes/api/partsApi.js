/**
 * Parts API - Unified endpoint for hardware part testing
 * Used by calibration page for servo, sensor, light, and other part testing
 *
 * Mounted at /api/parts — route paths below are relative to that prefix.
 */

import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import hardwareService from '../../services/hardwareService/index.js';
import { getCalibrationStore } from '../../server/calibration/store.js';
import actuatorPositionStore from '../../services/actuatorPositionStore.js';

const { controlPart, HARDWARE_CONTROLLERS } = hardwareService;
import * as configService from '../../services/configService.js';
import { resolveCharacter } from '../../services/characterContext.js';
import { writeJsonAtomic } from '../../services/atomicStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

/**
 * Load parts for the currently selected character (character-aware).
 * Falls back to global data/parts.json if no character is selected.
 */
async function loadParts(req) {
    const appRoot = path.resolve(__dirname, '../..');
    // Honor the canonical resolver so an explicit ?characterId=N wins over the
    // globally-selected character (it was previously ignored). Falls back to the
    // selected character when no override is supplied.
    let charId = null;
    try {
        const ctx = await resolveCharacter(req);
        charId = ctx && ctx.id;
    } catch (_) {
        const cfg = await configService.readConfig();
        charId = cfg && cfg.selectedCharacter;
    }

    if (charId) {
        const charPath = path.resolve(appRoot, `data/character-${charId}/parts.json`);
        try {
            return JSON.parse(await fs.readFile(charPath, 'utf8'));
        } catch (_) {
            // Fall through to global
        }
    }

    const globalPath = path.resolve(appRoot, 'data/parts.json');
    return JSON.parse(await fs.readFile(globalPath, 'utf8'));
}

/**
 * GET /:id/gpio-read — Direct GPIO register read via /dev/gpiomem.
 * Reads BCM2711 GPLEV0 register — no GPIO claim, no contention.
 */
router.get('/:id/gpio-read', async (req, res) => {
    try {
        const parts = await loadParts(req);
        const part = parts.find(p => String(p.id) === String(req.params.id));
        if (!part || part.type !== 'motion_sensor' || part.pin == null) {
            return res.status(404).json({ error: 'Motion sensor part not found' });
        }
        const appRoot = path.resolve(__dirname, '../..');
        const script = path.resolve(appRoot, 'python_wrappers/gpio_read.py');
        execFile('/usr/bin/python3', [script, String(part.pin)], { timeout: 2000 }, (err, stdout) => {
            if (err) return res.status(500).json({ error: 'read failed' });
            res.json({ v: parseInt(stdout.trim(), 10) });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET / — Get all parts (character-aware)
 */
router.get('/', async (req, res) => {
    try {
        let parts = await loadParts(req);
        // Optional ?type= filter (previously silently ignored).
        const type = req.query.type;
        if (type) {
            parts = parts.filter(p => String(p.type).toLowerCase() === String(type).toLowerCase());
        }
        res.json({ success: true, parts });
    } catch (error) {
        console.error('Error reading parts:', error);
        res.status(500).json({ success: false, error: 'Failed to read parts' });
    }
});

/**
 * GET /:id — Get single part by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const parts = await loadParts(req);
        const part = parts.find(p => String(p.id) === String(req.params.id));

        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        res.json({ success: true, part });
    } catch (error) {
        console.error('Error reading part:', error);
        res.status(500).json({ success: false, error: 'Failed to read part' });
    }
});

/**
 * POST /:id/test — Test a part (type-aware dispatch)
 *
 * For servos: { position, duration }
 * For motion_sensor: {} (read) or { action: 'detectMotion', params: { duration: 10 } }
 * For lights: { action: 'on'|'off' }
 */
router.post('/:id/test', express.json(), async (req, res) => {
    try {
        const parts = await loadParts(req);
        const part = parts.find(p => String(p.id) === String(req.params.id));

        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        const { action, params = {} } = req.body;
        const partType = part.type;
        const pin = part.pin;

        console.log(`🧪 Testing part ${part.id} (${part.name}), type=${partType}, pin=${pin}, action=${action || 'default'}`);

        // Dispatch based on part type
        if (partType === 'motion_sensor') {
            const controller = HARDWARE_CONTROLLERS.motion_sensor;
            if (!controller) {
                return res.status(500).json({ error: 'Motion sensor controller not available' });
            }

            if (action === 'detectMotion') {
                const duration = (params && params.duration) || 10;
                const result = await controller.detectMotion({ pin, duration });
                return res.json({
                    success: result.success,
                    message: result.message,
                    testResult: {
                        detections: result.detections || 0,
                        duration: duration,
                        motionDetected: (result.detections || 0) > 0
                    },
                    part
                });
            } else {
                // Default: single read
                const result = await controller.read({ pin });
                return res.json({
                    success: result.success,
                    message: result.message,
                    testResult: {
                        motionDetected: !!result.motionDetected,
                        pin: pin,
                        timestamp: result.timestamp
                    },
                    part
                });
            }
        } else if (partType === 'servo') {
            const { position = 50, duration = 1000 } = req.body;
            const result = await controlPart(part.id, 'moveToAngle', { angleDeg: parseInt(position) });
            return res.json({
                success: result.success !== false,
                message: `Part ${part.name} tested at position ${position}`,
                part
            });
        } else if (partType === 'light' || partType === 'led') {
            const rawAction = action || 'on';
            // Map short actions to controller method names
            const lightActionMap = { on: 'turnOn', off: 'turnOff', toggle: 'toggle', turnOn: 'turnOn', turnOff: 'turnOff' };
            const lightAction = lightActionMap[rawAction] || rawAction;
            const result = await controlPart(part.id, lightAction, params);
            return res.json({
                success: result.success !== false,
                message: result.message || `Light ${part.name} ${lightAction}`,
                part
            });
        } else if (partType === 'linear_actuator') {
            const direction = (params && params.direction) || 'extend';
            let duration = Math.min((params && params.duration) || 1000, 2000);
            const speed = (params && params.speed) || 100;
            let projectedP = null;

            // Enforce calibration bounds (non-fatal)
            try {
                const store = getCalibrationStore();
                const profile = await store.get(parseInt(part.id, 10));
                if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
                    const posState = actuatorPositionStore.load(parseInt(part.id, 10));
                    const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
                    const motion = profile.motion;
                    if (motion && motion.bins && motion.bins.length > 0) {
                        const bin = motion.bins.reduce((best, b) =>
                            Math.abs(b.pwmPct - speed) < Math.abs(best.pwmPct - speed) ? b : best
                        );
                        const rate = bin.unitsPerSec || 0.2;
                        const moveDist = rate * (duration / 1000);
                        const projected = direction === 'retract' ? currentP - moveDist : currentP + moveDist;
                        if (projected > profile.bounds.maxP) {
                            const safeDistance = Math.max(0, profile.bounds.maxP - currentP);
                            duration = Math.max(0, Math.round((safeDistance / rate) * 1000));
                        } else if (projected < profile.bounds.minP) {
                            const safeDistance = Math.max(0, currentP - profile.bounds.minP);
                            duration = Math.max(0, Math.round((safeDistance / rate) * 1000));
                        }
                        const actualDist = rate * (duration / 1000);
                        projectedP = direction === 'retract'
                            ? Math.max(0, currentP - actualDist)
                            : Math.min(1, currentP + actualDist);
                    }
                }
            } catch (e) {
                console.warn(`[PartsAPI] Could not enforce bounds for actuator part ${part.id}:`, e.message);
            }

            const result = await controlPart(part.id, direction, { duration, speed });

            // Persist updated position estimate
            if (projectedP != null) {
                try { actuatorPositionStore.markStopped(parseInt(part.id, 10), projectedP); } catch (_) {}
            }

            return res.json({
                success: result.success !== false,
                message: result.message || `Actuator ${part.name} ${direction}`,
                part
            });
        } else if (partType === 'motor') {
            const direction = (params && params.direction) || 'forward';
            let duration = Math.min((params && params.duration) || 1000, 2000);
            const speed = (params && params.speed) || 100;
            let projectedP = null;

            // Enforce calibration bounds (non-fatal)
            try {
                const store = getCalibrationStore();
                const profile = await store.get(parseInt(part.id, 10));
                if (profile && profile.bounds && profile.bounds.minP != null && profile.bounds.maxP != null) {
                    const posState = actuatorPositionStore.load(parseInt(part.id, 10));
                    const currentP = (posState && posState.currentP != null) ? posState.currentP : 0.5;
                    const motion = profile.motion;
                    if (motion && motion.bins && motion.bins.length > 0) {
                        const bin = motion.bins.reduce((best, b) =>
                            Math.abs(b.pwmPct - speed) < Math.abs(best.pwmPct - speed) ? b : best
                        );
                        const rate = bin.unitsPerSec || 0.2;
                        const moveDist = rate * (duration / 1000);
                        const isForward = direction === 'forward' || direction === 'extend';
                        const projected = isForward ? currentP + moveDist : currentP - moveDist;
                        if (projected > profile.bounds.maxP) {
                            const safeDistance = Math.max(0, profile.bounds.maxP - currentP);
                            duration = Math.max(0, Math.round((safeDistance / rate) * 1000));
                        } else if (projected < profile.bounds.minP) {
                            const safeDistance = Math.max(0, currentP - profile.bounds.minP);
                            duration = Math.max(0, Math.round((safeDistance / rate) * 1000));
                        }
                        const actualDist = rate * (duration / 1000);
                        projectedP = isForward
                            ? Math.min(1, currentP + actualDist)
                            : Math.max(0, currentP - actualDist);
                    }
                }
            } catch (e) {
                console.warn(`[PartsAPI] Could not enforce bounds for motor part ${part.id}:`, e.message);
            }

            const result = await controlPart(part.id, 'control', { direction, speed, duration });

            // Persist updated position estimate
            if (projectedP != null) {
                try { actuatorPositionStore.markStopped(parseInt(part.id, 10), projectedP); } catch (_) {}
            }

            return res.json({
                success: result.success !== false,
                message: result.message || `Motor ${part.name} ${direction}`,
                part
            });
        } else {
            // Generic fallback — attempt controlPart
            try {
                const result = await controlPart(part.id, action || 'test', params);
                return res.json({
                    success: result.success !== false,
                    message: result.message || `Part ${part.name} tested`,
                    part
                });
            } catch (e) {
                return res.status(400).json({
                    error: `No test handler for part type: ${partType}`,
                    message: e.message
                });
            }
        }
    } catch (error) {
        console.error('Error testing part:', error);
        res.status(500).json({ error: 'Failed to test part', message: error.message });
    }
});

/**
 * PUT /:id — Update part configuration
 */
router.put('/:id', express.json(), async (req, res) => {
    try {
        const cfg = await configService.readConfig();
        const appRoot = path.resolve(__dirname, '../..');
        const charId = cfg && cfg.selectedCharacter;

        let partsPath;
        if (charId) {
            partsPath = path.resolve(appRoot, `data/character-${charId}/parts.json`);
            try { await fs.access(partsPath); } catch (_) {
                partsPath = path.resolve(appRoot, 'data/parts.json');
            }
        } else {
            partsPath = path.resolve(appRoot, 'data/parts.json');
        }

        const parts = JSON.parse(await fs.readFile(partsPath, 'utf8'));
        const index = parts.findIndex(p => String(p.id) === String(req.params.id));

        if (index === -1) {
            return res.status(404).json({ error: 'Part not found' });
        }

        // Update part with new data
        parts[index] = { ...parts[index], ...req.body, id: req.params.id };

        await writeJsonAtomic(partsPath, parts);

        res.json({ success: true, part: parts[index] });
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).json({ error: 'Failed to update part' });
    }
});

export default router;
