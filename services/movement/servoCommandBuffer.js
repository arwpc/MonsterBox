/**
 * Servo Command Buffer
 *
 * Batches and deduplicates servo commands before sending to hardware.
 * Highest-priority command wins when multiple arrive in the same tick.
 *
 * Features:
 * - Self-running 20ms flush loop (50Hz) that starts/stops on demand
 * - Per-servo position sequence queue for ordered transition delivery
 * - queueTransitionSequence() for pre-computed multi-angle transitions
 * - Backward-compatible queueCommand/flush/clear/getPending exports
 */

import { record } from './movementTelemetry.js';

// In-memory queue: partId → { angle, priority, timestamp, seq }
const pendingCommands = new Map();

// Transition sequence queues: partId → { angles: number[], priority: number, index: number }
const transitionQueues = new Map();

// Monotonic sequence counter for ordering
let seqCounter = 0;

// Flush loop state
let flushInterval = null;
let flushServoService = null;
let flushCharacterId = '*';

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

        // Also clear any active transition sequence for this part since
        // a higher-priority single command is taking over
        transitionQueues.delete(key);
    }

    pendingCommands.set(key, {
        angle,
        priority,
        timestamp: Date.now(),
        seq: seqCounter++
    });
}

/**
 * Queue a complete transition sequence for a servo.
 * The flush loop sends one angle per tick (20ms = 50Hz), ensuring
 * no intermediate positions are skipped even if flush timing varies.
 *
 * If a higher-priority command arrives via queueCommand(), it preempts
 * the remaining sequence.
 *
 * @param {string|number} partId
 * @param {number[]} angles - Array of pre-computed angles for the transition
 * @param {number} [priority=0] - Higher number = higher priority
 */
function queueTransitionSequence(partId, angles, priority = 0) {
    if (!Array.isArray(angles) || angles.length === 0) {
        return;
    }

    const key = String(partId);

    // A higher-priority single command may already own this servo this tick.
    // Without this check, queueTransitionSequence would overwrite it below,
    // defeating the "highest priority wins" invariant queueCommand enforces.
    const existingPending = pendingCommands.get(key);
    if (existingPending && existingPending.priority > priority) {
        record('*', key, 'preemption_event', 1);
        return;
    }

    const existing = transitionQueues.get(key);

    // If there's an existing transition with higher priority, reject
    if (existing && existing.priority > priority) {
        record('*', key, 'preemption_event', 1);
        return;
    }

    if (existing && existing.priority < priority) {
        record('*', key, 'preemption_event', 1);
    }

    transitionQueues.set(key, {
        angles: [...angles],
        priority,
        index: 0
    });

    // Immediately queue the first angle so it's picked up on the next flush
    pendingCommands.set(key, {
        angle: angles[0],
        priority,
        timestamp: Date.now(),
        seq: seqCounter++
    });
}

/**
 * Advance transition sequences by one step. Called internally before each flush.
 * Feeds the next angle from each active sequence into pendingCommands.
 */
function _advanceTransitions() {
    for (const [partId, tq] of transitionQueues) {
        // Advance the index (the previous angle was already queued)
        tq.index++;

        if (tq.index >= tq.angles.length) {
            // Sequence complete
            transitionQueues.delete(partId);
            continue;
        }

        const existing = pendingCommands.get(partId);

        // Only advance if no higher-priority command has preempted
        if (existing && existing.priority > tq.priority) {
            // Higher-priority command took over — abandon sequence
            transitionQueues.delete(partId);
            continue;
        }

        // Queue the next angle in the sequence
        pendingCommands.set(partId, {
            angle: tq.angles[tq.index],
            priority: tq.priority,
            timestamp: Date.now(),
            seq: seqCounter++
        });
    }
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
 * Start the self-running flush loop at 20ms intervals (50Hz).
 * The loop advances transition sequences and flushes pending commands.
 * Uses .unref() so the interval doesn't keep the Node.js process alive.
 *
 * @param {object} servoService - Must have moveToAngle(partId, angle) method
 * @param {string|number} [characterId='*'] - Character ID for telemetry
 */
function startFlushLoop(servoService, characterId = '*') {
    if (flushInterval) {
        // Already running — update service/characterId but don't start another
        flushServoService = servoService;
        flushCharacterId = String(characterId);
        return;
    }

    flushServoService = servoService;
    flushCharacterId = String(characterId);

    let flushing = false;

    flushInterval = setInterval(async () => {
        // Guard against overlapping flushes if a previous one is slow
        if (flushing) return;

        // Advance any active transition sequences before flushing
        _advanceTransitions();

        // Skip flush if nothing to send
        if (pendingCommands.size === 0) return;

        flushing = true;
        try {
            await flush(flushServoService, flushCharacterId);
        } catch (err) {
            console.error('[servoCommandBuffer] flush loop error:', err.message);
        } finally {
            flushing = false;
        }
    }, 20);

    // Don't keep the process alive just for this interval
    if (flushInterval.unref) {
        flushInterval.unref();
    }
}

/**
 * Stop the self-running flush loop.
 * Does NOT clear pending commands — call clear() separately if needed.
 */
function stopFlushLoop() {
    if (flushInterval) {
        clearInterval(flushInterval);
        flushInterval = null;
    }
    flushServoService = null;
    flushCharacterId = '*';
}

/**
 * Check whether the flush loop is currently running.
 * @returns {boolean}
 */
function isFlushLoopRunning() {
    return flushInterval !== null;
}

/**
 * Discard all queued commands and transition sequences without sending.
 */
function clear() {
    pendingCommands.clear();
    transitionQueues.clear();
}

/**
 * Return a snapshot of the current pending queue.
 * @returns {Map<string, { angle: number, priority: number, timestamp: number, seq: number }>}
 */
function getPending() {
    return new Map(pendingCommands);
}

/**
 * Return a snapshot of active transition sequences.
 * @returns {Map<string, { angles: number[], priority: number, index: number }>}
 */
function getTransitionQueues() {
    return new Map(transitionQueues);
}

export {
    queueCommand,
    flush,
    clear,
    getPending,
    startFlushLoop,
    stopFlushLoop,
    isFlushLoopRunning,
    queueTransitionSequence,
    getTransitionQueues
};
