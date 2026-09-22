/**
 * Lock-aware test helpers.
 *
 * A finished animatronic can be FROZEN (config/character-locks.json), and the
 * lock refuses every configuration write under data/character-<id>/. That is
 * deliberate and absolute — it is what stops a finished character drifting.
 *
 * But a node selects its OWN character, so on a node whose character is locked,
 * every write-path test targets a frozen character and fails. The tempting fix
 * is MB_ALLOW_LOCKED_CHARACTER_WRITES=1, and it is a trap: measured 2026-09-21,
 * one run with that hatch open WIPED a locked character's parts.json from 233
 * lines to 5, destroying hardware config that had taken weeks to establish. The
 * hatch does not merely weaken the lock, it hands the suite live ammunition.
 *
 * So the suite respects the lock instead and skips the write, reporting clearly
 * why rather than failing or silently passing.
 */

import { getLock } from '../../services/characterConfigLock.js';

/**
 * True if this character's configuration is frozen.
 */
export function isCharacterLocked(characterId) {
    if (characterId == null) return false;
    try {
        return !!getLock(characterId);
    } catch (_) {
        return false;
    }
}

/**
 * Skip the calling test when the character's config is frozen.
 *
 * Call with the Mocha test context:
 *     it('writes config', function () { if (skipIfLocked(this, charId)) return; ... });
 *
 * @returns {boolean} true when the test was skipped, so the caller can return.
 */
export function skipIfLocked(ctx, characterId) {
    if (!isCharacterLocked(characterId)) return false;
    if (ctx && typeof ctx.skip === 'function') {
        // Mocha prints skipped tests as pending, so the coverage gap stays visible
        // in the report rather than looking like a pass.
        ctx.skip();
    }
    return true;
}
