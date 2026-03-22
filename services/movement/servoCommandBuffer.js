/**
 * Servo Command Buffer
 *
 * Batches and deduplicates servo commands before sending to hardware.
 * Highest-priority command wins when multiple arrive in the same tick.
 * Designed to be flushed by an external tick loop (~20Hz / 50ms).
 */

import { record } from './movementTelemetry.js';

// In-memory queue: partId → { angle, priority, timestamp }
const pendingCommands = new Map();

/**
 * Queue a servo command. If a command already exists for the same partId
 * in this tick, the higher-priority command wins.
 * @param {string|number} partId
 * @param {number} angle - Target angle for the servo
 * @param {number} [priority=0] - Higher number = higher priority
 */
function queueCommand(partId, angle, priority = 0) {
    const key = String(partId);
    const existing = pendingCommands.get(key);

    if (existing && existing.priority > priority) {
        // Existing command has higher priority — record preemption of the new one
        record('*', key, 'preemption_event', 1);
        return;
    }

    if (existing && existing.priority < priority) {
        // New command preempts existing — record preemption
        record('*', key, 'preemption_event', 1);
    }

    pendingCommands.set(key, {
        angle,
        priority,
        timestamp: Date.now()
    });
}

/**
 * Flush all queued commands to hardware via servoService.
 * Records latency telemetry for each command.
 * @param {object} servoService - Must have moveToAngle(partId, angle) method
 * @param {string|number} [characterId='*'] - Character ID for telemetry
 * @returns {Promise<{ sent: number, errors: number }>}
 */
async function flush(servoService, characterId = '*') {
    const charId = String(characterId);
    const cycleStart = Date.now();
    const snapshot = new Map(pendingCommands);
    pendingCommands.clear();

    let sent = 0;
    let errors = 0;

    const promises = [];

    for (const [partId, cmd] of snapshot) {
        const cmdStart = Date.now();

        const promise = (async () => {
            try {
                await servoService.moveToAngle(partId, cmd.angle);
                const latency = Date.now() - cmdStart;
                record(charId, partId, 'servo_latency_ms', latency);
                sent++;
            } catch (err) {
                console.error(`[servoCommandBuffer] flush error for part ${partId}:`, err.message);
                errors++;
            }
        })();

        promises.push(promise);
    }

    await Promise.all(promises);

    // Record cycle-level telemetry
    const cycleTime = Date.now() - cycleStart;
    if (snapshot.size > 0) {
        record(charId, '*', 'cycle_time_ms', cycleTime);
        record(charId, '*', 'commands_per_second', snapshot.size / (cycleTime / 1000 || 0.001));
    }

    return { sent, errors };
}

/**
 * Discard all queued commands without sending.
 */
function clear() {
    pendingCommands.clear();
}

/**
 * Return a snapshot of the current pending queue.
 * @returns {Map<string, { angle: number, priority: number, timestamp: number }>}
 */
function getPending() {
    return new Map(pendingCommands);
}

export {
    queueCommand,
    flush,
    clear,
    getPending
};
