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
 * For servos: { position } or { action: 'moveToAngle', params: { angleDeg } }
 * For motion_sensor: {} (read) or { action: 'detectMotion', params: { duration: 10 } }
 * For lights: { action: 'on'|'off' }
 */

/**
 * First argument that is a real, finite number; null if there is none.
 *
 * Deliberately not `a ?? b`: the values come off JSON request bodies where a
 * caller may send "" or null for "unset", and `??` would accept "" and hand
 * NaN to the hardware layer. 0 is a legitimate angle and must survive.
 */
function firstNumber(...candidates) {
    for (const candidate of candidates) {
        if (candidate == null || candidate === '') continue;
        const value = Number(candidate);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

/**
 * Build a truthful response for a part-test result.
 *
 * The handlers used to compose an optimistic message unconditionally — a blocked
 * part came back HTTP 200 with `success:false` alongside "Part Elbow tested at
 * position 50", which reads like a success report and throws away the reason the
 * hardware refused. The refusal text in config/hardware-safety.json is written for
 * operators and explains the blown fuse and the ambiguous wiring in plain English;
 * it should reach them, not be discarded one layer short of the screen.
 */
function testResponse(res, result, part, okMessage) {
    const ok = result && result.success !== false;
    if (ok) {
        return res.json({ success: true, message: okMessage, part });
    }
    const reason = (result && (result.error || result.message)) || 'Hardware refused the command';
    // 409 for a deliberate safety refusal, 502 for a genuine hardware failure —
    // both are failures, but only one means "this is working as designed".
    const status = result && result.blockedBySafetyLimit ? 409 : 502;
    return res.status(status).json({
        success: false,
        blockedBySafetyLimit: !!(result && result.blockedBySafetyLimit),
        error: reason,
        message: reason,
        part
    });
}

router.post('/:id/test', express.json(), async (req, res) => {
    try {
        const parts = await loadParts(req);
        const part = parts.find(p => String(p.id) === String(req.params.id));

        if (!part) {
            return res.status(404).json({ error: 'Part not found' });
        }

        // The part was resolved against a specific character, so the hardware call
        // must be too — part IDs are only unique within a character.
        const ctx = await resolveCharacter(req);
        const hw = { characterId: ctx && ctx.id };

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
            // Callers disagree on where the angle lives. The Pose Editor and the
            // calibration pages send {action:'moveToAngle', params:{angleDeg}}, while
            // older callers send a bare {position}. This branch only ever read
            // `position`, so every {angleDeg} request silently fell through to the
            // default of 50 — the servo moved to 50° no matter what was asked for,
            // and the response still said success. That is why servos looked like
            // they "sometimes" worked: they always went to the same place.
            const angle = firstNumber(
                params.angleDeg, params.position, params.angle,
                req.body.angleDeg, req.body.position, req.body.angle
            );
            const duration = firstNumber(params.duration, req.body.duration) ?? 1000;

            if (angle == null) {
                return res.status(400).json({
                    success: false,
                    error: 'Servo test requires an angle (params.angleDeg or position)',
                    part
                });
            }

            const result = await controlPart(part.id, 'moveToAngle', { angleDeg: angle, duration }, hw);
            return testResponse(res, result, part, `Part ${part.name} moved to ${angle}°`);
        } else if (partType === 'light' || partType === 'led') {
            const rawAction = action || 'on';
            // Map short actions to controller method names
            const lightActionMap = { on: 'turnOn', off: 'turnOff', toggle: 'toggle', turnOn: 'turnOn', turnOff: 'turnOff' };
            const lightAction = lightActionMap[rawAction] || rawAction;
            const result = await controlPart(part.id, lightAction, params, hw);
            return testResponse(res, result, part, `Light ${part.name} ${lightAction}`);
        } else if (partType === 'linear_actuator') {
            // The Pose Editor sends the direction AS the action ({action:'retract'})
            // with no params.direction. Reading only params.direction meant every
            // retract request silently defaulted to 'extend' — the dropdown was
            // inert and the actuator always drove one way, wrong direction included.
            const direction = (params && params.direction)
                || ((action === 'retract' || action === 'extend') ? action : null)
                || 'extend';
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
                        // Already at the limit in the requested direction: the clamp
                        // above produced a zero-length move. This used to be issued
                        // anyway and was a silent no-op; the wrappers now correctly
                        // refuse a zero duration, which surfaced as a red 502 "genuine
                        // hardware failure" on a part that is simply parked at its end
                        // stop. Say that instead of calling the hardware.
                        if (duration <= 0) {
                            const atEnd = direction === 'retract' ? 'minimum retraction' : 'maximum extension';
                            return res.json({
                                success: true,
                                partId: part.id,
                                partType: part.type,
                                noOp: true,
                                atLimit: true,
                                position: currentP,
                                message: `${part.name} is already at its ${atEnd} — nothing to do.`
                            });
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

            const result = await controlPart(part.id, direction, { duration, speed }, hw);

            // Persist updated position estimate
            if (projectedP != null) {
                try { actuatorPositionStore.markStopped(parseInt(part.id, 10), projectedP); } catch (_) {}
            }

            return testResponse(res, result, part, `Actuator ${part.name} ${direction}`);
        } else if (partType === 'motor') {
            // The calibration page's red Stop sends {action:'stop'}. This branch
            // never read `action`, so Stop fell through to direction 'forward' at
            // 100% for a second — the panic control DROVE the motor instead of
            // stopping it, and reported success. Honour a stop before anything else.
            if (action === 'stop' || (params && params.direction === 'stop')) {
                const result = await controlPart(part.id, 'stop', {}, hw);
                return testResponse(res, result, part, `Motor ${part.name} stopped`);
            }
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

            const result = await controlPart(part.id, 'control', { direction, speed, duration }, hw);

            // Persist updated position estimate
            if (projectedP != null) {
                try { actuatorPositionStore.markStopped(parseInt(part.id, 10), projectedP); } catch (_) {}
            }

            return testResponse(res, result, part, `Motor ${part.name} ${direction}`);
        } else {
            // Generic fallback — attempt controlPart
            try {
                const result = await controlPart(part.id, action || 'test', params, hw);
                return testResponse(res, result, part, `Part ${part.name} tested`);
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
