/**
 * Movement Telemetry Service
 *
 * Collects servo performance metrics in an in-memory ring buffer
 * and periodically flushes to disk with SD-card-friendly write limits.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const TELEMETRY_FILE = 'data/movement-telemetry.json';
const RING_BUFFER_SIZE = 1000;
const MIN_FLUSH_INTERVAL_MS = 30000;
const RETENTION_DAYS = 30;

// Ring buffer stored as array with a write index
const ringBuffer = [];
let writeIndex = 0;
let lastFlushTime = 0;
let autoFlushTimer = null;

/**
 * Record a telemetry entry into the ring buffer.
 * @param {string|number} characterId
 * @param {string|number} servoPartId
 * @param {string} metric - One of: servo_latency_ms, commands_per_second, preemption_event, cycle_time_ms, smoothness_score
 * @param {number} value
 */
function record(characterId, servoPartId, metric, value) {
    const entry = {
        timestamp: Date.now(),
        characterId: String(characterId),
        servoPartId: String(servoPartId),
        metric,
        value
    };

    if (ringBuffer.length < RING_BUFFER_SIZE) {
        ringBuffer.push(entry);
    } else {
        ringBuffer[writeIndex] = entry;
    }
    writeIndex = (writeIndex + 1) % RING_BUFFER_SIZE;
}

/**
 * Flush ring buffer contents to disk file.
 * Appends to existing data, prunes entries older than 30 days.
 * Respects minimum flush interval to protect SD card.
 */
async function flush() {
    const now = Date.now();
    if (now - lastFlushTime < MIN_FLUSH_INTERVAL_MS) {
        return;
    }

    if (ringBuffer.length === 0) {
        lastFlushTime = now;
        return;
    }

    // Snapshot and clear ring buffer
    const snapshot = ringBuffer.splice(0, ringBuffer.length);
    writeIndex = 0;

    // Read existing file data
    let existing = [];
    try {
        const raw = await readFile(TELEMETRY_FILE, 'utf-8');
        existing = JSON.parse(raw);
        if (!Array.isArray(existing)) {
            existing = [];
        }
    } catch {
        // File doesn't exist or is invalid — start fresh
    }

    // Merge and prune entries older than retention period
    const cutoff = now - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const merged = [...existing, ...snapshot].filter(e => e.timestamp >= cutoff);

    try {
        await mkdir(dirname(TELEMETRY_FILE), { recursive: true });
        await writeFile(TELEMETRY_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    } catch (err) {
        // Put snapshot back so data isn't lost on write failure
        for (const entry of snapshot) {
            record(entry.characterId, entry.servoPartId, entry.metric, entry.value);
        }
        console.error('[movementTelemetry] flush failed:', err.message);
    }

    lastFlushTime = now;
}

/**
 * Get summary statistics for a metric over a time period.
 * @param {string|number} characterId
 * @param {string} metric
 * @param {number} periodMs - Lookback period in ms
 * @returns {{ avg: number, min: number, max: number, p95: number, count: number }}
 */
function getMetricSummary(characterId, metric, periodMs) {
    const charId = String(characterId);
    const cutoff = Date.now() - periodMs;

    const values = ringBuffer
        .filter(e => e && e.characterId === charId && e.metric === metric && e.timestamp >= cutoff)
        .map(e => e.value)
        .sort((a, b) => a - b);

    if (values.length === 0) {
        return { avg: 0, min: 0, max: 0, p95: 0, count: 0 };
    }

    const sum = values.reduce((acc, v) => acc + v, 0);
    const p95Index = Math.min(Math.floor(values.length * 0.95), values.length - 1);

    return {
        avg: sum / values.length,
        min: values[0],
        max: values[values.length - 1],
        p95: values[p95Index],
        count: values.length
    };
}

/**
 * Get health status for each servo of a character.
 * @param {string|number} characterId
 * @returns {Array<{ partId: string, avgLatency: number, status: 'green'|'yellow'|'red' }>}
 */
function getServoHealth(characterId) {
    const charId = String(characterId);

    // Group latency entries by servo
    const servoMap = new Map();
    for (const entry of ringBuffer) {
        if (!entry || entry.characterId !== charId || entry.metric !== 'servo_latency_ms') {
            continue;
        }
        if (!servoMap.has(entry.servoPartId)) {
            servoMap.set(entry.servoPartId, []);
        }
        servoMap.get(entry.servoPartId).push(entry.value);
    }

    const results = [];
    for (const [partId, latencies] of servoMap) {
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        let status;
        if (avgLatency < 50) {
            status = 'green';
        } else if (avgLatency <= 150) {
            status = 'yellow';
        } else {
            status = 'red';
        }
        results.push({ partId, avgLatency, status });
    }

    return results;
}

/**
 * Start automatic periodic flushing.
 * @param {number} intervalMs - Flush interval (default 30000ms)
 */
function startAutoFlush(intervalMs = 30000) {
    stopAutoFlush();
    autoFlushTimer = setInterval(() => {
        flush().catch(err => console.error('[movementTelemetry] autoFlush error:', err.message));
    }, intervalMs);
    autoFlushTimer.unref();
}

/**
 * Stop automatic periodic flushing.
 */
function stopAutoFlush() {
    if (autoFlushTimer) {
        clearInterval(autoFlushTimer);
        autoFlushTimer = null;
    }
}

export {
    record,
    flush,
    getMetricSummary,
    getServoHealth,
    startAutoFlush,
    stopAutoFlush
};
