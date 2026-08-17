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
import { getRandomIdlePose, poseAngles } from './poseLibrary.js';
import { claimServo, releaseAll, getActiveClaims, getOwner, PRIORITY } from './priorityManager.js';
import { applyPoseJitter, getEffectiveWindow, clampIntoWindow } from '../poses/poseBounds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

const OWNER = 'idle-loop';

/** How often micro-motion re-commands the held servos. */
const MICRO_TICK_MS = 250;

/** Micro-motion below this is smaller than a servo's own resolution — skip the command. */
const MICRO_MIN_DELTA_DEG = 0.2;

// Default movement config written when none exists
const DEFAULT_CONFIG = {
    idle: {
        enabled: false,
        minHoldMs: 3000,
        maxHoldMs: 8000,
        transitionDurationMs: 2000,
        defaultEasing: 'ease_in_out',
        // Eased, time-stepped transitions. Turn off for one command per move.
        steppedTransitions: true,
        jitterDeg: 0,
        // Bias next-pose selection toward nearby positions (see poseLibrary).
        distanceWeighting: true
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
// Incremented by every start()/stop(). An in-flight loopIteration compares its
// captured generation before rescheduling: a stale chain exits instead of
// carrying on. Without this, a second start during a 2s pose transition left
// TWO chains driving the same servos toward different poses, and stop() could
// only ever kill the newest one.
let generation = 0;
let transitionEngine = null;
let currentAbort = null; // AbortController for the in-flight servo transition
// Where we believe the driven servos currently are — the input to distance-weighted
// selection and the centre point micro-motion oscillates around.
let currentAngles = {};
let microTimer = null;
let microTracks = null;

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
 * Stop any in-flight micro-motion. Servos stay wherever the last micro tick put
 * them, which is by construction inside the same window as the pose itself.
 */
function stopMicroMotion() {
    if (microTimer) {
        clearInterval(microTimer);
        microTimer = null;
    }
    microTracks = null;
}

/**
 * Breathe and drift around the held pose.
 *
 * A pose that lands and then holds perfectly still for eight seconds is the other
 * half of why an idle loop reads as a machine. Two slow out-of-phase sinusoids are
 * enough to break that, as long as they stay small.
 *
 * Every offset is clamped into the part's own window, so micro-motion is bounded
 * twice: by its configured amplitude, and by the same calibrated limits the pose
 * itself obeys.
 *
 * @param {Object} microConfig - microMovement section of movement config
 * @param {Array<{partId: string, base: number, lo: number|null, hi: number|null}>} tracks
 */
function startMicroMotion(microConfig, tracks) {
    stopMicroMotion();
    // Opt-in only: an absent flag must not start a servo oscillating.
    if (!microConfig || microConfig.enabled !== true || tracks.length === 0) return;

    const breathAmp = Math.abs(Number(microConfig.breathingAmplitudeDeg) || 0);
    const breathPeriod = Math.max(500, Number(microConfig.breathingPeriodMs) || 4000);
    const driftAmp = Math.abs(Number(microConfig.driftAmplitudeDeg) || 0);
    const driftPeriod = Math.max(500, Number(microConfig.driftPeriodMs) || 7000);
    if (breathAmp <= 0 && driftAmp <= 0) return;

    // A phase per part so they do not all breathe in lockstep, which would read
    // as one mechanism rather than a body.
    const startedAt = Date.now();
    microTracks = tracks.map((track, index) => ({
        ...track,
        phase: (index * Math.PI * 2) / Math.max(1, tracks.length),
        last: track.base
    }));

    microTimer = setInterval(() => {
        if (!running || !microTracks) return;
        const elapsed = Date.now() - startedAt;
        const commands = [];

        for (const track of microTracks) {
            // Another subsystem taking the servo (jaw, head tracking, a scene) must
            // win immediately, not at the end of the hold.
            const owner = getOwner(track.partId);
            if (!owner || owner.owner !== OWNER) continue;

            const breath = breathAmp * Math.sin((2 * Math.PI * elapsed) / breathPeriod + track.phase);
            const drift = driftAmp * Math.sin((2 * Math.PI * elapsed) / driftPeriod + track.phase * 0.5);
            const target = clampIntoWindow(
                Math.round((track.base + breath + drift) * 10) / 10,
                track.lo,
                track.hi
            );
            if (Math.abs(target - track.last) < MICRO_MIN_DELTA_DEG) continue;
            track.last = target;
            commands.push({ partId: track.partId, value: target });
        }

        if (commands.length === 0) return;

        getTransitionEngine().then(engine => {
            if (!engine || typeof engine.transitionServos !== 'function') return;
            // stepped:false — a micro offset is a single small command, not a ramp.
            return engine.transitionServos(characterId, commands, { stepped: false, durationMs: 0 });
        }).then(() => {
            for (const command of commands) currentAngles[command.partId] = command.value;
        }).catch(err => {
            console.warn('[IdleLoop] Micro-motion command failed:', err.message);
        });
    }, MICRO_TICK_MS);
}

/**
 * Build the micro-motion tracks for the servo parts we just moved.
 * Parts on a shared fused rail are excluded: repeatedly energizing a serialized
 * rail to wobble by a degree is exactly the stacked inrush that group exists to
 * prevent.
 */
async function buildMicroTracks(parts) {
    const tracks = [];
    for (const part of parts) {
        const angle = part.value ?? (part.target && part.target.angleDeg) ?? part.angleDeg;
        if (angle == null) continue;
        let window;
        try {
            window = await getEffectiveWindow(characterId, part.partId);
        } catch (_) {
            continue;
        }
        if (window.blocked || window.powerGroup) continue;
        // No window means nothing bounds the wobble — skip rather than guess.
        if (window.lo == null && window.hi == null) continue;
        tracks.push({
            partId: String(part.partId),
            base: clampIntoWindow(Number(angle), window.lo, window.hi),
            lo: window.lo,
            hi: window.hi
        });
    }
    return tracks;
}

/**
 * Execute one iteration of the idle loop.
 */
async function loopIteration() {
    if (!running) return;
    const myGeneration = generation;
    // A chain is stale the moment start() or stop() bumps the generation —
    // checked again after every await below.
    const stale = () => !running || myGeneration !== generation;

    stopMicroMotion();

    const config = await loadConfig(characterId);
    const idleConfig = config.idle || DEFAULT_CONFIG.idle;

    // Pick a weighted random idle pose, excluding current. Selection is biased
    // toward positions near where the character already is: uniform weighting over
    // a library whose extremes are 60 degrees apart produces a windshield wiper.
    const pose = await getRandomIdlePose(characterId, currentPoseId, {
        currentAngles: idleConfig.distanceWeighting === false ? null : currentAngles,
        halfWeightDeg: idleConfig.distanceHalfWeightDeg,
        minMoveDeg: idleConfig.minMoveDeg
    });
    if (!pose || !Array.isArray(pose.parts) || pose.parts.length === 0) {
        console.log('[IdleLoop] No idle pose available, pausing...');
        if (!stale()) scheduleNext(idleConfig.maxHoldMs);
        return;
    }

    // Per-pose jitter, applied inside each part's calibrated window before anything
    // is claimed or commanded, so the pose that gets executed IS the jittered one
    // and the position we record afterwards is the position we actually sent.
    const jitterDeg = pose.jitterDeg > 0 ? pose.jitterDeg : (idleConfig.jitterDeg || 0);
    const jittered = await applyPoseJitter(pose, characterId, { jitterDeg });
    const activePose = jittered.pose;

    // A pose part is servo-like only if it carries an angle. transitionServos drops
    // everything else, so lights and actuators in an idle pose used to be silently
    // discarded — an idle pose that turned a lamp on never lit anything.
    const hasAngle = (part) => (part.value ?? (part.target && part.target.angleDeg) ?? part.angleDeg) != null;

    // Claim servos at IDLE priority — only move the ones we can claim. Only actual
    // servos are claimed; the priority manager arbitrates servo motion, and claiming
    // a light or actuator id there just blocks it for no reason.
    const claimedParts = [];
    const otherParts = [];
    for (const part of activePose.parts) {
        if (!hasAngle(part)) {
            otherParts.push(part);
            continue;
        }
        const partId = String(part.partId);
        const result = claimServo(partId, OWNER, PRIORITY.IDLE);
        if (result.granted) {
            claimedParts.push(part);
        }
    }

    if (claimedParts.length === 0 && otherParts.length === 0) {
        // All servos preempted — pause and retry later (don't spin)
        console.log('[IdleLoop] All servos preempted by higher priority, pausing...');
        if (!stale()) scheduleNext(idleConfig.maxHoldMs);
        return;
    }

    // Transition claimed servos
    const isTestMode = process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
    if (!isTestMode) {
        try {
            const engine = await getTransitionEngine();
            if (claimedParts.length > 0 && engine && typeof engine.transitionServos === 'function') {
                // Make the transition cancellable so stop() can abort it instead of
                // letting servos keep driving toward the target after the loop stops.
                currentAbort = new AbortController();
                // Per-pose duration wins over the character default, so a slow
                // menacing turn and a quick glance can live in the same library.
                await engine.transitionServos(characterId, claimedParts, {
                    durationMs: activePose.transitionDurationMs || idleConfig.transitionDurationMs || 2000,
                    easing: activePose.transitionProfile || idleConfig.defaultEasing || 'ease_in_out',
                    stepped: idleConfig.steppedTransitions !== false,
                    signal: currentAbort.signal
                });
            } else if (claimedParts.length > 0) {
                console.log('[IdleLoop] No transitionEngine available, skipping hardware transition');
            }

            // Non-servo parts (lights, actuators) go through the pose engine, which
            // knows how to drive them. Failures here must not stop the idle loop.
            if (otherParts.length > 0) {
                try {
                    const { executePose } = await import('../poses/poseEngine.js');
                    await executePose({
                        characterId,
                        poseId: activePose.id,
                        // Jitter is already applied and health already decided the pose
                        // is performable — re-doing either here would double-jitter and
                        // re-read the same files for nothing.
                        pose: Object.assign({}, activePose, { parts: otherParts }),
                        options: { jitter: false, skipHealthCheck: true }
                    });
                } catch (err) {
                    console.warn('[IdleLoop] Non-servo pose parts failed, continuing:', err.message);
                }
            }
        } catch (err) {
            console.warn('[IdleLoop] Hardware transition failed, continuing:', err.message);
        } finally {
            currentAbort = null;
        }
    }

    currentPoseId = activePose.id;
    // Record where we actually sent things (post-jitter), because that is what the
    // next selection measures distance from and what micro-motion oscillates about.
    currentAngles = Object.assign({}, currentAngles, poseAngles(activePose));

    // Hold for random duration
    const holdMs = randomHoldMs(idleConfig, activePose.holdVariance ?? 500);

    if (!isTestMode && claimedParts.length > 0) {
        try {
            const tracks = await buildMicroTracks(claimedParts);
            startMicroMotion(config.microMovement || DEFAULT_CONFIG.microMovement, tracks);
        } catch (err) {
            console.warn('[IdleLoop] Could not start micro-motion:', err.message);
        }
    }

    if (!stale()) scheduleNext(holdMs);
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

    // Believed positions are per-character; part ids repeat across characters, so
    // carrying them over would measure distance against another character's servo.
    if (String(charId) !== String(characterId)) currentAngles = {};

    characterId = charId;
    running = true;
    generation += 1;
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
    generation += 1;

    // Micro-motion runs on its own interval between poses. Leaving it alive after
    // stop() would keep issuing servo commands with nobody minding the loop —
    // "stop" has to mean stopped.
    stopMicroMotion();

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
