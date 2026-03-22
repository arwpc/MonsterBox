/**
 * Movement System API Routes
 * Provides REST endpoints for idle loop control, movement config, and telemetry
 */

import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Lazy-load services to avoid circular dependencies
let priorityManager = null;
let idleLoopService = null;
let transitionEngine = null;
let movementTelemetry = null;

async function loadServices() {
    if (!priorityManager) {
        try {
            priorityManager = (await import('../../services/movement/priorityManager.js'));
        } catch (e) { console.warn('Priority manager not available:', e.message); }
    }
    if (!idleLoopService) {
        try {
            idleLoopService = (await import('../../services/movement/idleLoopService.js'));
        } catch (e) { console.warn('Idle loop service not available:', e.message); }
    }
    if (!transitionEngine) {
        try {
            transitionEngine = (await import('../../services/movement/transitionEngine.js'));
        } catch (e) { console.warn('Transition engine not available:', e.message); }
    }
    if (!movementTelemetry) {
        try {
            movementTelemetry = (await import('../../services/movement/movementTelemetry.js'));
        } catch (e) { console.warn('Movement telemetry not available:', e.message); }
    }
}

// GET /api/movement/config/:characterId — get movement config
router.get('/config/:characterId', async (req, res) => {
    try {
        const charId = parseInt(req.params.characterId, 10);
        const configPath = path.join(__dirname, '..', '..', 'data', `character-${charId}`, 'movement-config.json');
        const data = await fs.readFile(configPath, 'utf8');
        res.json({ success: true, config: JSON.parse(data) });
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Return default config
            res.json({
                success: true,
                config: {
                    characterPersonality: 'default',
                    idle: { enabled: false, minHoldMs: 3000, maxHoldMs: 8000, transitionDurationMs: 2000, defaultEasing: 'ease_in_out' },
                    microMovement: { enabled: false, breathingAmplitudeDeg: 2, breathingPeriodMs: 4000, driftAmplitudeDeg: 1, driftPeriodMs: 7000 },
                    servoTransitions: {}
                }
            });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

// PUT /api/movement/config/:characterId — update movement config
router.put('/config/:characterId', async (req, res) => {
    try {
        const charId = parseInt(req.params.characterId, 10);
        const configPath = path.join(__dirname, '..', '..', 'data', `character-${charId}`, 'movement-config.json');

        // Ensure directory exists
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        await fs.writeFile(configPath, JSON.stringify(req.body, null, 2));
        res.json({ success: true, message: 'Movement config updated' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/movement/idle/start — start idle loop for current character
router.post('/idle/start', async (req, res) => {
    try {
        await loadServices();
        if (!idleLoopService) {
            return res.status(503).json({ success: false, error: 'Idle loop service not available' });
        }
        const characterId = req.app.locals.config.selectedCharacter;
        if (!characterId) {
            return res.status(400).json({ success: false, error: 'No character selected' });
        }
        await idleLoopService.start(characterId);
        res.json({ success: true, message: `Idle loop started for character ${characterId}` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/movement/idle/stop — stop idle loop
router.post('/idle/stop', async (req, res) => {
    try {
        await loadServices();
        if (!idleLoopService) {
            return res.status(503).json({ success: false, error: 'Idle loop service not available' });
        }
        await idleLoopService.stop();
        res.json({ success: true, message: 'Idle loop stopped' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/movement/idle/status — get idle loop status
router.get('/idle/status', async (req, res) => {
    try {
        await loadServices();
        if (!idleLoopService) {
            return res.json({ success: true, status: { running: false, available: false } });
        }
        const status = idleLoopService.getStatus();
        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/movement/telemetry — telemetry summary
router.get('/telemetry', async (req, res) => {
    try {
        await loadServices();
        if (!movementTelemetry) {
            return res.json({ success: true, telemetry: {} });
        }
        const characterId = req.app.locals.config.selectedCharacter;
        const periodMs = parseInt(req.query.period || '3600000', 10); // default 1 hour
        const latency = movementTelemetry.getMetricSummary(characterId, 'servo_latency_ms', periodMs);
        const cycleTime = movementTelemetry.getMetricSummary(characterId, 'cycle_time_ms', periodMs);
        const commandRate = movementTelemetry.getMetricSummary(characterId, 'commands_per_second', periodMs);
        res.json({
            success: true,
            telemetry: { latency, cycleTime, commandRate },
            characterId,
            periodMs
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/movement/telemetry/servo/:partId — per-servo health
router.get('/telemetry/servo/:partId', async (req, res) => {
    try {
        await loadServices();
        if (!movementTelemetry) {
            return res.json({ success: true, health: { status: 'unknown' } });
        }
        const characterId = req.app.locals.config.selectedCharacter;
        const health = movementTelemetry.getServoHealth(characterId);
        const servoHealth = health.find(h => String(h.partId) === String(req.params.partId));
        res.json({ success: true, health: servoHealth || { partId: req.params.partId, status: 'unknown' } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/movement/transition/test — test a transition
router.post('/transition/test', async (req, res) => {
    try {
        await loadServices();
        if (!transitionEngine) {
            return res.status(503).json({ success: false, error: 'Transition engine not available' });
        }
        const { partId, fromAngle, toAngle, easing, durationMs } = req.body;
        if (fromAngle == null || toAngle == null) {
            return res.status(400).json({ success: false, error: 'fromAngle and toAngle required' });
        }

        // In test mode, just return the calculated positions
        const positions = [];
        await transitionEngine.transitionServo(
            partId || 'test',
            fromAngle,
            toAngle,
            durationMs || 1000,
            easing || 'ease_in_out',
            (angle) => positions.push({ angle, timestamp: Date.now() })
        );
        res.json({ success: true, positions, count: positions.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/movement/claims — active servo claims
router.get('/claims', async (req, res) => {
    try {
        await loadServices();
        if (!priorityManager) {
            return res.json({ success: true, claims: {} });
        }
        const claims = priorityManager.getActiveClaims();
        res.json({ success: true, claims });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
