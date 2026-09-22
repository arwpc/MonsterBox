/**
 * Character configuration locks.
 *
 * An animatronic that has been tuned to the operator's satisfaction ("100%")
 * must stop drifting: a stray page save, a helper that rewrites parts.json to
 * "fix" it, or an agent tidying a config file can undo hours of hand
 * measurement that nothing else records. A locked character's SHOW CONFIG is
 * therefore refused at the write path, whichever route or service reaches it.
 *
 * What is locked: the per-character configuration files under
 * data/character-<id>/ (parts, poses, scenes, super-powers, calibration,
 * movement config, gestures, queues, ai-config, images) and the character's
 * registry entry.
 *
 * What is NOT locked: runtime state (lurk/motion/agent state, actuator
 * positions, analytics). A locked character still RUNS — he plays scenes,
 * talks, and moves; he just cannot be reconfigured.
 *
 * The lock list lives in config/character-locks.json so it is source-controlled
 * and travels to every node on deploy.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCKS_PATH = path.join(APP_ROOT, 'config', 'character-locks.json');
const DATA_ROOT = path.join(APP_ROOT, 'data');

/**
 * Basenames under a character directory that are RUNTIME state, not
 * configuration. These stay writable while the character is locked — freezing
 * them would stop the character running rather than stop him changing.
 */
const RUNTIME_STATE_FILES = new Set([
    'lurk-mode-state.json',
    'motion-armed-state.json',
    'ai_agent_state.json',
    'actuator-positions.json',
    'scene-analytics.json',
    'conversation-history.json',
    'audio-config.json',
    'microphones.json'
]);

/** Anything ending in -state.json / _state.json is runtime state by convention. */
const RUNTIME_STATE_PATTERN = /(^|[-_])state\.json$/i;

let _cache = { mtimeMs: 0, locks: [] };

function readLocksFile() {
    try {
        const stat = fs.statSync(LOCKS_PATH);
        if (stat.mtimeMs === _cache.mtimeMs) return _cache.locks;
        const parsed = JSON.parse(fs.readFileSync(LOCKS_PATH, 'utf8'));
        const locks = Array.isArray(parsed && parsed.locks) ? parsed.locks : [];
        _cache = { mtimeMs: stat.mtimeMs, locks };
        return locks;
    } catch (_) {
        // No lock file (or unreadable) means nothing is locked — a missing file
        // must never wedge every write on the node.
        _cache = { mtimeMs: 0, locks: [] };
        return _cache.locks;
    }
}

/** Force the next read to re-parse the lock file (used by the CLI and tests). */
export function reloadLocks() {
    _cache = { mtimeMs: 0, locks: [] };
    return readLocksFile();
}

/** @returns {Array<object>} every active lock entry. */
export function listLocks() {
    return readLocksFile().filter(l => l && l.characterId != null && l.active !== false);
}

/** @returns {object|null} the lock entry for a character, if locked. */
export function getLock(characterId) {
    if (characterId == null) return null;
    const id = String(characterId);
    return listLocks().find(l => String(l.characterId) === id) || null;
}

/** @returns {boolean} */
export function isCharacterLocked(characterId) {
    return getLock(characterId) !== null;
}

/**
 * The character id a path belongs to, or null if the path is not inside a
 * data/character-<id>/ directory.
 */
export function characterIdFromPath(filePath) {
    if (!filePath) return null;
    const rel = path.relative(DATA_ROOT, path.resolve(String(filePath)));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const match = /^character-([^/\\]+)/.exec(rel.split(path.sep).join('/'));
    return match ? match[1] : null;
}

/** True when the path is per-character RUNTIME state rather than configuration. */
export function isRuntimeStatePath(filePath) {
    const base = path.basename(String(filePath || ''));
    return RUNTIME_STATE_FILES.has(base) || RUNTIME_STATE_PATTERN.test(base);
}

export class CharacterConfigLockedError extends Error {
    constructor(lock, what) {
        const name = lock && lock.name ? `${lock.name} (character ${lock.characterId})` : `character ${lock && lock.characterId}`;
        super(
            `${name} is LOCKED — configuration is frozen and ${what || 'this change'} was refused. ` +
            `Reason: ${(lock && lock.reason) || 'locked by the operator'}. ` +
            `Unlock deliberately with: node scripts/character-lock.mjs unlock ${lock && lock.characterId}`
        );
        this.name = 'CharacterConfigLockedError';
        this.code = 'CHARACTER_CONFIG_LOCKED';
        this.status = 423; // HTTP 423 Locked
        this.characterId = lock && lock.characterId;
    }
}

function escapeHatchOpen(what) {
    if (String(process.env.MB_ALLOW_LOCKED_CHARACTER_WRITES || '') !== '1') return false;
    console.warn(
        `⚠️  MB_ALLOW_LOCKED_CHARACTER_WRITES=1 — allowing a write to a LOCKED character's configuration (${what || 'unspecified'}).`
    );
    return true;
}

/**
 * Refuse a configuration write for a locked character.
 * @param {string|number} characterId
 * @param {string} [what] - short description of the attempted change, for the error text
 * @throws {CharacterConfigLockedError}
 */
export function assertCharacterConfigWritable(characterId, what) {
    const lock = getLock(characterId);
    if (!lock) return;
    if (escapeHatchOpen(what)) return;
    throw new CharacterConfigLockedError(lock, what);
}

/**
 * Refuse a write to a path that belongs to a locked character's configuration.
 * Paths outside data/character-<id>/ and per-character runtime state are
 * allowed through untouched.
 * @param {string} filePath
 * @param {string} [what]
 * @throws {CharacterConfigLockedError}
 */
export function assertConfigPathWritable(filePath, what) {
    const characterId = characterIdFromPath(filePath);
    if (characterId == null) return;
    if (isRuntimeStatePath(filePath)) return;
    assertCharacterConfigWritable(characterId, what || `writing ${path.basename(String(filePath))}`);
}

/**
 * True if this error is the lock refusing a configuration write.
 */
export function isConfigLockedError(error) {
    return !!(error && error.code === 'CHARACTER_CONFIG_LOCKED');
}

/**
 * Persist a RUNTIME toggle without letting the lock break it.
 *
 * The lock's promise is that "a locked character still runs" — he plays, talks
 * and moves, he just cannot be reconfigured. But the operator's live toggles
 * (AI Motion, jaw, LED talk, head tracking, follow orders) happen to persist
 * into super-powers.json, which IS configuration. Writing first and acting
 * second therefore turned a finished animatronic's dashboard switches into dead
 * controls: "AI Motion failed: PumpkinHead is LOCKED".
 *
 * A toggle is an instruction about right now, so the runtime effect must never
 * depend on the write. Wrap only the persistence in this: on a locked character
 * the refusal is reported, not thrown, and the caller carries on and applies the
 * effect. The toggle then works for the show and simply does not survive a
 * restart — which is correct, because the frozen config is exactly what a locked
 * character is supposed to boot with.
 *
 * Every other failure still throws: this hides the lock, not real breakage.
 *
 * @param {() => Promise<any>} persist
 * @returns {Promise<{persisted: boolean, locked: boolean, reason?: string}>}
 */
export async function persistRuntimeToggle(persist, override = null) {
    try {
        await persist();
        // A successful write is the truth now; drop any stale in-memory value.
        if (override && override.key) forgetRuntimeToggle(override.characterId, override.key);
        return { persisted: true, locked: false };
    } catch (error) {
        if (!isConfigLockedError(error)) throw error;
        // The toggle still TOOK EFFECT — the caller starts/stops the listener,
        // daemon or watcher either way — but the frozen file cannot record it.
        // Without somewhere to remember it, the read path goes straight back to
        // the locked file and reports the toggle still on, so the UI flips the
        // switch back and the operator sees "it won't turn off".
        if (override && override.key) {
            rememberRuntimeToggle(override.characterId, override.key, override.value);
        }
        return { persisted: false, locked: true, reason: error.message };
    }
}

/**
 * In-memory toggle state for LOCKED characters.
 *
 * A locked character still RUNS — only its configuration is frozen. So an
 * operator must still be able to switch its live features on and off for the
 * evening; those switches just cannot be written to disk, and therefore do not
 * survive a restart, which is the correct trade for a finished character.
 *
 * Keyed "<characterId>:<key>". Empty for every unlocked character, so this is
 * inert on a normal node.
 */
const runtimeToggles = new Map();

const toggleKey = (characterId, key) => `${characterId}:${key}`;

export function rememberRuntimeToggle(characterId, key, value) {
    if (characterId == null || !key) return;
    runtimeToggles.set(toggleKey(characterId, key), value);
}

export function forgetRuntimeToggle(characterId, key) {
    if (characterId == null || !key) return;
    runtimeToggles.delete(toggleKey(characterId, key));
}

/**
 * The live value of a toggle, or undefined when nothing has overridden it.
 */
export function runtimeToggleOverride(characterId, key) {
    if (characterId == null || !key) return undefined;
    const k = toggleKey(characterId, key);
    return runtimeToggles.has(k) ? runtimeToggles.get(k) : undefined;
}

/**
 * Overlay any remembered toggle onto a value read from a frozen config file.
 * Returns the override when one exists, otherwise the value as read.
 */
export function withRuntimeToggle(characterId, key, valueFromDisk) {
    const override = runtimeToggleOverride(characterId, key);
    return override === undefined ? valueFromDisk : override;
}

export default {
    listLocks,
    getLock,
    isCharacterLocked,
    characterIdFromPath,
    isRuntimeStatePath,
    assertCharacterConfigWritable,
    assertConfigPathWritable,
    reloadLocks,
    isConfigLockedError,
    persistRuntimeToggle,
    rememberRuntimeToggle,
    forgetRuntimeToggle,
    runtimeToggleOverride,
    withRuntimeToggle,
    CharacterConfigLockedError
};
