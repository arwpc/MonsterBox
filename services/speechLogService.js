/**
 * Speech log — the running record of everything a character has said or heard.
 *
 * Why this exists
 * ---------------
 * The dashboard's AI panel used to show only what the BROWSER's own WebSocket
 * session produced. Anything the character said on its own — a PIR wake, lurk,
 * a scene's `sayThis` step, a follow-orders reply, or an `ask-ai` turn fired
 * from another tab or another operator's phone — happened entirely on the
 * server and appeared nowhere. Watching the panel during a show told you only
 * half the story, and the half you already knew about because you typed it.
 *
 * This is the other half: every speech event is recorded here as it happens, and
 * the panel polls for what it has not seen yet.
 *
 * In memory, on purpose
 * ---------------------
 * A ring buffer per character, never written to disk. MonsterBox runs on an SD
 * card and the project rule is to minimise writes; a transcript of a whole
 * Halloween night is exactly the kind of chatter that wears one out. The log is
 * a live view, not an archive — if the node restarts, the show's history is gone
 * and that is the right trade. `/var/log/monsterbox.log` remains the durable
 * record.
 *
 * Recording must never break speaking
 * -----------------------------------
 * Every call is wrapped so a fault here cannot interrupt a character mid-line.
 * A dropped log entry is a cosmetic loss; an exception thrown out of a speech
 * path is a dead animatronic in front of guests.
 */

// Per-character ring. 300 entries is roughly an evening of conversation at a
// few lines a minute, and bounded so an unattended node cannot grow without end.
const MAX_ENTRIES = 300;

/** @type {Map<string, {entries: Array, seq: number}>} */
const logs = new Map();

function bucketFor(characterId) {
    const key = String(characterId);
    let bucket = logs.get(key);
    if (!bucket) {
        bucket = { entries: [], seq: 0 };
        logs.set(key, bucket);
    }
    return bucket;
}

/**
 * Record one speech event.
 *
 * @param {string|number} characterId
 * @param {object} entry
 * @param {string} entry.text        - what was said
 * @param {string} [entry.speaker]   - 'character' | 'guest' | 'operator' | 'system'
 * @param {string} [entry.source]    - where it came from: 'ask-ai', 'agent', 'scene',
 *                                     'follow-orders', 'motion', 'tts', 'system'
 * @returns {object|null} the stored entry, or null if it was not recorded
 */
export function recordSpeech(characterId, entry) {
    try {
        if (characterId == null || !entry) return null;
        const text = String(entry.text == null ? '' : entry.text).trim();
        if (!text) return null;

        const bucket = bucketFor(characterId);
        const stored = {
            seq: ++bucket.seq,
            at: new Date().toISOString(),
            speaker: entry.speaker || 'character',
            source: entry.source || 'unknown',
            text,
        };
        bucket.entries.push(stored);
        if (bucket.entries.length > MAX_ENTRIES) {
            bucket.entries.splice(0, bucket.entries.length - MAX_ENTRIES);
        }
        return stored;
    } catch (_) {
        // Never let logging break a speech path — see the header.
        return null;
    }
}

/**
 * Entries newer than `since`. `since` is a seq, not a timestamp, so a client
 * that misses a poll still catches up exactly and never double-renders.
 *
 * A client passing since=0 (a fresh page) gets the recent tail rather than
 * nothing, so the panel opens with the conversation already in it.
 *
 * @param {string|number} characterId
 * @param {number} [since=0]
 * @param {number} [limit=100]
 */
export function speechSince(characterId, since = 0, limit = 100) {
    try {
        const bucket = logs.get(String(characterId));
        if (!bucket) return { entries: [], seq: 0 };
        const from = Number(since) || 0;
        const fresh = bucket.entries.filter(e => e.seq > from);
        return {
            entries: fresh.slice(-Math.max(1, Math.min(limit, MAX_ENTRIES))),
            seq: bucket.seq,
        };
    } catch (_) {
        return { entries: [], seq: 0 };
    }
}

/** Drop a character's log (used by tests). */
export function clearSpeech(characterId) {
    logs.delete(String(characterId));
}

export default { recordSpeech, speechSince, clearSpeech };
