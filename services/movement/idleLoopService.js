/**
 * Idle Loop Service — Background service that cycles idle poses for a character.
 *
 * Picks weighted-random idle poses, claims servos at IDLE priority,
 * transitions them via transitionEngine, holds for a randomized duration,
 * and repeats. Pauses gracefully when all servos are preempted by higher
 * priority subsystems.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRandomIdlePose } from './poseLibrary.js';
import { claimServo, releaseAll, getActiveClaims, PRIORITY } from './priorityManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

const OWNER = 'idle-loop';

// Default movement config written when none exists
const DEFAULT_CONFIG = {
    idle: {
        enabled: false,
        minHoldMs: 3000,
        maxHoldMs: 8000,
        transitionDurationMs: 2000,
        defaultEasing: 'ease_in_out'
    },
    microMovement: {
        enabled: false,
        breathingAmplitudeDeg: 2,
        breathingPeriodMs: 4000,
        driftAmplitudeDeg: 1,
        driftPeriodMs: 7000
    },
    characterPersonality: 'default',
    servoTransitions: {}
};

// ---- Internal state ----
let running = false;
let characterId = null;
let currentPoseId = null;
let loopTimeout = null;
let transitionEngine = null;
let currentAbort = null; // AbortController for the in-flight servo transition

/**
 * Lazily load transitionEngine so the module can still be imported
 * even if transitionEngine.js doesn't exist yet.
 */
async function getTransitionEngine() {
    if (transitionEngine) return transitionEngine;
    try {
        transitionEngine = await import('./transitionEngine.js');
        return transitionEngine;
    } catch (err) {
        console.warn('[IdleLoop] transitionEngine not available:', err.message);
        return null;
    }
}

/**
 * Load movement config for a character, creating the default file if missing.
 *
 * @param {number|string} charId
 * @returns {Promise<Object>} Movement config
 */
async function loadConfig(charId) {
    const configPath = path.join(DATA_DIR, `character-${charId}`, 'movement-config.json');
    try {
        const raw = await fs.readFile(configPath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log(`[IdleLoop] Creating default movement-config.json for character ${charId}`);
            const dirPath = path.join(DATA_DIR, `character-${charId}`);
            await fs.mkdir(dirPath, { recursive: true });
            await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
            return { ...DEFAULT_CONFIG };
        }
        console.error(`[IdleLoop] Error reading movement config for character ${charId}:`, err.message);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Randomize hold duration within config bounds ± pose holdVariance.
 *
 * @param {Object} idleConfig - idle section of movement config
 * @param {number} holdVariance - per-pose variance in ms
 * @returns {number} Hold duration in ms
 */
function randomHoldMs(idleConfig, holdVariance) {
    const base = idleConfig.minHoldMs + Math.random() * (idleConfig.maxHoldMs - idleConfig.minHoldMs);
    const variance = (Math.random() * 2 - 1) * holdVariance;
    return Math.max(500, Math.round(base + variance));
}

/**
 * Execute one iteration of the idle loop.
 */
async function loopIteration() {
    if (!running) return;

    const config = await loadConfig(characterId);
    const idleConfig = config.idle || DEFAULT_CONFIG.idle;

    // Pick a weighted random idle pose, excluding current
    const pose = await getRandomIdlePose(characterId, currentPoseId);
    if (!pose || !Array.isArray(pose.parts) || pose.parts.length === 0) {
        console.log('[IdleLoop] No idle pose available, pausing...');
        scheduleNext(idleConfig.maxHoldMs);
        return;
    }

    // Claim servos at IDLE priority — only move the ones we can claim
    const claimedParts = [];
    for (const part of pose.parts) {
        const partId = String(part.partId);
        const result = claimServo(partId, OWNER, PRIORITY.IDLE);
        if (result.granted) {
            claimedParts.push(part);
        }
    }

    if (claimedParts.length === 0) {
        // All servos preempted — pause and retry later (don't spin)
        console.log('[IdleLoop] All servos preempted by higher priority, pausing...');
        scheduleNext(idleConfig.maxHoldMs);
        return;
    }

    // Transition claimed servos
    const isTestMode = process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
    if (!isTestMode) {
        try {
            const engine = await getTransitionEngine();
            if (engine && typeof engine.transitionServos === 'function') {
                // Make the transition cancellable so stop() can abort it instead of
                // letting servos keep driving toward the target after the loop stops.
                currentAbort = new AbortController();
                await engine.transitionServos(characterId, claimedParts, {
                    durationMs: idleConfig.transitionDurationMs || 2000,
                    easing: pose.transitionProfile || idleConfig.defaultEasing || 'ease_in_out',
                    signal: currentAbort.signal
                });
            } else {
                console.log('[IdleLoop] No transitionEngine available, skipping hardware transition');
            }
        } catch (err) {
            console.warn('[IdleLoop] Hardware transition failed, continuing:', err.message);
        } finally {
            currentAbort = null;
        }
    }

    currentPoseId = pose.id;

    // Hold for random duration
    const holdMs = randomHoldMs(idleConfig, pose.holdVariance ?? 500);
    scheduleNext(holdMs);
}

/**
 * Schedule the next loop iteration.
 *
 * @param {number} delayMs - Delay before next iteration
 */
function scheduleNext(delayMs) {
    if (!running) return;
    loopTimeout = setTimeout(() => {
        loopIteration().catch(err => {
            console.error('[IdleLoop] Unexpected error in loop iteration:', err.message);
            // Continue looping despite errors
            if (running) scheduleNext(5000);
        });
    }, delayMs);
}

/**
 * Start the idle loop for a character.
 *
 * @param {number|string} charId - Character ID to run idle poses for
 */
export async function start(charId) {
    if (running) {
        console.log(`[IdleLoop] Already running for character ${characterId}, stopping first`);
        stop();
    }

    characterId = charId;
    running = true;
    currentPoseId = null;

    console.log(`[IdleLoop] Starting idle loop for character ${characterId}`);

    // Kick off the first iteration immediately
    loopIteration().catch(err => {
        console.error('[IdleLoop] Error starting loop:', err.message);
        if (running) scheduleNext(3000);
    });
}

/**
 * Stop the idle loop and release all IDLE claims.
 */
export function stop() {
    if (!running && !loopTimeout) return;

    console.log(`[IdleLoop] Stopping idle loop for character ${characterId}`);
    running = false;

    if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
    }

    // Abort any in-flight servo transition so servos stop where they are.
    if (currentAbort) {
        try { currentAbort.abort(); } catch (_) { /* ignore */ }
        currentAbort = null;
    }

    // Release all servo claims owned by this service
    releaseAll(OWNER);
    currentPoseId = null;
}

/**
 * Get current status of the idle loop.
 *
 * @returns {{ running: boolean, characterId: number|string|null, currentPoseId: number|string|null, servoClaims: Object }}
 */
export function getStatus() {
    // Filter active claims to only show ours
    const allClaims = getActiveClaims();
    const servoClaims = {};
    for (const [id, entry] of Object.entries(allClaims)) {
        if (entry.owner === OWNER) {
            servoClaims[id] = entry;
        }
    }

    return {
        running,
        characterId,
        currentPoseId,
        servoClaims
    };
}

export default { start, stop, getStatus };
