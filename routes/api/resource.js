/**
 * Resource Management API Routes
 * Provides REST endpoints for system health, memory, PID info
 */

import express from 'express';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Lazy-load services
let memoryMonitor = null;
let environment = null;

async function loadServices() {
    if (!environment) {
        try {
            environment = (await import('../../services/resource/environment.js'));
        } catch (e) { console.warn('Environment service not available:', e.message); }
    }
}

// Allow external code to provide the memory monitor instance
let _memoryMonitorInstance = null;
export function setMemoryMonitor(instance) {
    _memoryMonitorInstance = instance;
}

// GET /api/resource/health — startup health check results
router.get('/health', async (req, res) => {
    try {
        const healthPath = path.join(__dirname, '..', '..', 'data', 'startup-health.json');
        const data = await fs.readFile(healthPath, 'utf8');
        res.json({ success: true, health: JSON.parse(data) });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.json({ success: true, health: null, message: 'No health check data available' });
        } else {
            res.status(500).json({ success: false, error: err.message });
        }
    }
});

// GET /api/resource/memory — current memory reading
router.get('/memory', async (req, res) => {
    try {
        if (_memoryMonitorInstance) {
            const reading = _memoryMonitorInstance.getLastReading();
            return res.json({ success: true, memory: reading });
        }
        // Fallback: compute on the fly
        const usage = process.memoryUsage();
        res.json({
            success: true,
            memory: {
                rssMB: Math.round(usage.rss / (1024 * 1024) * 10) / 10,
                heapUsedMB: Math.round(usage.heapUsed / (1024 * 1024) * 10) / 10,
                heapTotalMB: Math.round(usage.heapTotal / (1024 * 1024) * 10) / 10,
                systemFreeMB: Math.round(os.freemem() / (1024 * 1024)),
                systemTotalMB: Math.round(os.totalmem() / (1024 * 1024)),
                level: 'normal'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/resource/status — full resource status
router.get('/status', async (req, res) => {
    try {
        await loadServices();
        const usage = process.memoryUsage();
        const loadAvg = os.loadavg();

        const status = {
            pid: process.pid,
            uptime: process.uptime(),
            uptimeFormatted: formatUptime(process.uptime()),
            environment: environment ? environment.getEnvironment() : (process.env.MONSTERBOX_ENV || 'production'),
            priority: (() => {
                try { return os.getPriority(process.pid); } catch { return 'unknown'; }
            })(),
            memory: {
                rssMB: Math.round(usage.rss / (1024 * 1024) * 10) / 10,
                heapUsedMB: Math.round(usage.heapUsed / (1024 * 1024) * 10) / 10,
                systemFreeMB: Math.round(os.freemem() / (1024 * 1024)),
                systemTotalMB: Math.round(os.totalmem() / (1024 * 1024))
            },
            cpu: {
                load1m: Math.round(loadAvg[0] * 100) / 100,
                load5m: Math.round(loadAvg[1] * 100) / 100,
                load15m: Math.round(loadAvg[2] * 100) / 100,
                cores: os.cpus().length
            },
            nodeVersion: process.version,
            platform: `${os.platform()} ${os.arch()}`
        };

        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/resource/pid — PID info
router.get('/pid', (req, res) => {
    const startedAt = new Date(Date.now() - process.uptime() * 1000).toISOString();
    res.json({
        success: true,
        pid: process.pid,
        startedAt,
        uptimeSeconds: Math.round(process.uptime())
    });
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

export default router;
