/**
 * Priority Manager — Central servo ownership registry for MonsterBox movement system.
 *
 * Advisory locking: higher or equal priority callers can preempt lower-priority owners.
 * All state is in-memory (no persistence across restarts).
 */

// Priority constants — higher number wins
export const PRIORITY = Object.freeze({
    MICRO_MOVEMENT: 10,
    IDLE:           30,
    JAW:            70,
    HEAD_TRACKING:  80,
    SCENE:         100
});

/**
 * In-memory claim registry.
 * Key: servoPartId (string)
 * Value: { owner: string, priority: number, claimedAt: number (epoch ms) }
 */
const claims = new Map();

/**
 * Attempt to claim ownership of a servo.
 *
 * @param {string|number} partId  - Servo part ID (coerced to string)
 * @param {string}        owner   - Identifier for the claiming subsystem (e.g. 'jaw', 'head-tracking', 'scene')
 * @param {number}        priority - One of the PRIORITY constants
 * @returns {{ granted: boolean, previousOwner: string|null }}
 */
export function claimServo(partId, owner, priority) {
    const id = String(partId);
    const existing = claims.get(id);

    if (existing) {
        // Lower priority cannot preempt
        if (priority < existing.priority) {
            console.log(`[PriorityManager] DENIED claim on servo ${id} by "${owner}" (pri ${priority}) — held by "${existing.owner}" (pri ${existing.priority})`);
            return { granted: false, previousOwner: existing.owner };
        }

        const previousOwner = existing.owner;
        claims.set(id, { owner, priority, claimedAt: Date.now() });
        console.log(`[PriorityManager] PREEMPT servo ${id}: "${owner}" (pri ${priority}) took from "${previousOwner}" (pri ${existing.priority})`);
        return { granted: true, previousOwner };
    }

    // No existing claim — grant immediately
    claims.set(id, { owner, priority, claimedAt: Date.now() });
    console.log(`[PriorityManager] CLAIM servo ${id} by "${owner}" (pri ${priority})`);
    return { granted: true, previousOwner: null };
}

/**
 * Release a servo claim, but only if the caller is the current owner.
 *
 * @param {string|number} partId - Servo part ID
 * @param {string}        owner  - Must match current owner to release
 * @returns {boolean} true if released, false if not owned by caller
 */
export function releaseServo(partId, owner) {
    const id = String(partId);
    const existing = claims.get(id);

    if (!existing) {
        return false;
    }

    if (existing.owner !== owner) {
        console.log(`[PriorityManager] RELEASE DENIED servo ${id}: "${owner}" is not current owner "${existing.owner}"`);
        return false;
    }

    claims.delete(id);
    console.log(`[PriorityManager] RELEASE servo ${id} by "${owner}"`);
    return true;
}

/**
 * Release all servo claims held by the given owner.
 *
 * @param {string} owner - Owner identifier
 * @returns {number} Count of claims released
 */
export function releaseAll(owner) {
    let count = 0;
    for (const [id, entry] of claims) {
        if (entry.owner === owner) {
            claims.delete(id);
            count++;
        }
    }
    if (count > 0) {
        console.log(`[PriorityManager] RELEASE ALL by "${owner}": ${count} servo(s) freed`);
    }
    return count;
}

/**
 * Get the current owner info for a servo.
 *
 * @param {string|number} partId - Servo part ID
 * @returns {{ owner: string, priority: number, claimedAt: number }|null}
 */
export function getOwner(partId) {
    const id = String(partId);
    const entry = claims.get(id);
    return entry ? { ...entry } : null;
}

/**
 * Check whether a servo is available at or above a minimum priority,
 * without actually claiming it.
 *
 * @param {string|number} partId      - Servo part ID
 * @param {number}        minPriority - Minimum priority level needed
 * @returns {boolean} true if unclaimed or claimable at the given priority
 */
export function isAvailable(partId, minPriority) {
    const id = String(partId);
    const existing = claims.get(id);
    if (!existing) return true;
    return minPriority >= existing.priority;
}

/**
 * Get a snapshot of all active claims (for dashboard / debugging).
 *
 * @returns {Object.<string, { owner: string, priority: number, claimedAt: number }>}
 */
export function getActiveClaims() {
    const snapshot = {};
    for (const [id, entry] of claims) {
        snapshot[id] = { ...entry };
    }
    return snapshot;
}
