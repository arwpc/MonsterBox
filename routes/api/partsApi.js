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
import { spawn } from 'child_process';
import hardwareService from '../../services/hardwareService/index.js';

const { controlPart, HARDWARE_CONTROLLERS } = hardwareService;
import * as configService from '../../services/configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

/**
 * Load parts for the currently selected character (character-aware).
 * Falls back to global data/parts.json if no character is selected.
 */
async function loadParts() {
    const cfg = await configService.readConfig();
    const appRoot = path.resolve(__dirname, '../..');
    const charId = cfg && cfg.selectedCharacter;

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
 * GET /:id/monitor — SSE stream for real-time motion sensor monitoring.
 * Spawns motion_detect_cli.py once, holds GPIO open, streams state changes.
 */
router.get('/:id/monitor', async (req, res) => {
    try {
        const parts = await loadParts();
        const part = parts.find(p => String(p.id) === String(req.params.id));
        if (!part || part.type !== 'motion_sensor') {
            return res.status(404).json({ error: 'Motion sensor part not found' });
        }

        const pin = part.pin;
        const appRoot = path.resolve(__dirname, '../..');
        const script = path.resolve(appRoot, 'python_wrappers/motion_detect_cli.py');

        // SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders();

        const proc = spawn('/usr/bin/python3', [script, 'detect', String(pin), '0'], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let buf = '';
        proc.stdout.on('data', (chunk) => {
            buf += chunk.toString();
            let nl;
            while ((nl = buf.indexOf('\n')) !== -1) {
                const line = buf.slice(0, nl).trim();
                buf = buf.slice(nl + 1);
                if (line) {
                    res.write(`data: ${line}\n\n`);
                }
            }
        });

        proc.stderr.on('data', () => { /* suppress */ });

        proc.on('close', () => {
            res.write('data: {"status":"stopped"}\n\n');
            res.end();
        });

        req.on('close', () => {
            proc.kill('SIGTERM');
        });
    } catch (error) {
        console.error('Error starting motion monitor:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET / — Get all parts (character-aware)
 */
router.get('/', async (req, res) => {
    try {
        const parts = await loadParts();
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
        const parts = await loadParts();
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
        const parts = await loadParts();
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
            const lightAction = action || 'on';
            const result = await controlPart(part.id, lightAction, params);
            return res.json({
                success: result.success !== false,
                message: result.message || `Light ${part.name} ${lightAction}`,
                part
            });
        } else if (partType === 'linear_actuator') {
            const direction = (params && params.direction) || 'extend';
            const duration = (params && params.duration) || 1000;
            const speed = (params && params.speed) || 100;
            const result = await controlPart(part.id, direction, { duration, speed });
            return res.json({
                success: result.success !== false,
                message: result.message || `Actuator ${part.name} ${direction}`,
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

        await fs.writeFile(partsPath, JSON.stringify(parts, null, 2));

        res.json({ success: true, part: parts[index] });
    } catch (error) {
        console.error('Error updating part:', error);
        res.status(500).json({ error: 'Failed to update part' });
    }
});

export default router;
