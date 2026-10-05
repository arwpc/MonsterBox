/**
 * Callout mode — a character speaks ONE short line to passers-by every few
 * minutes instead of holding an open AI conversation all night.
 *
 * Why it exists: a PIR wake used to open a headless ElevenLabs agent session (a
 * persistent websocket billed per minute, up to 600 s). On Halloween the street
 * never goes quiet, so the agent stayed up for hours and burned the account
 * talking into the night. Operator direction 2026-10-04: "They only need to call
 * out every five minutes", with music, jaw, head tracking, random motion and the
 * PIR still running in between.
 *
 * Opt-in, per character, stored as RUNTIME state
 * (data/character-{id}/callout-state.json — the `-state.json` suffix keeps it
 * writable on a LOCKED character, see characterConfigLock.RUNTIME_STATE_PATTERN).
 * Absent file or enabled:false => the node behaves exactly as before.
 *
 * Cost on a Pi: one unref'd setTimeout per character, no polling, no per-tick
 * disk writes (lastCalloutAt lives in RAM); logs on transitions and on each
 * callout only.
 */

import fs from 'fs/promises';
import path from 'path';
import { writeJsonAtomic } from './atomicStore.js';
import { isInQuietHours } from './backgroundMusicService.js';
import { resolveCharacterDataDir } from './characterService.js';

export const STATE_FILE = 'callout-state.json';

export const DEFAULTS = Object.freeze({
    enabled: false,
    intervalMs: 5 * 60 * 1000,
    jitterPct: 15,
    quietHours: Object.freeze({ start: '23:00', end: '08:00' }),
    aiOnWake: false,
    prompt: null,
    maxWords: 20
});

export const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_JITTER_PCT = 50;
const MAX_PROMPT_CHARS = 1000;
// A playback this recent counts as "the speaker is busy" — a callout must never
// talk over a say/sfx/scene line that just started.
const RECENT_AUDIO_GRACE_MS = 3000;
const UNKNOWN_PLAYBACK_MS = 4000;
// A transient block (someone is mid-conversation, a scene is playing) retries
// sooner than a full interval, so the next callout is not pushed out 5 minutes
// by a 20-second line.
const TRANSIENT_RETRY_MS = 30 * 1000;
const TRANSIENT_REASONS = new Set(['conversation', 'scene-queue', 'other-audio', 'in-flight']);

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// Character-independent prompts that push a stateless one-shot agent towards a
// different line each time (each callout opens a fresh socket, so the agent
// remembers nothing of the previous one).
const THEMES = [
    'the candy you are guarding',
    'the full moon',
    'the costumes walking by',
    'what lurks behind you',
    'how long you have waited here',
    'the cold night air',
    'your hunger',
    'a dare to come closer',
    'a warning to the brave',
    'the darkness of this house',
    'the shadows moving in the yard',
    'an old secret of yours'
];

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

function validQuietHours(qh) {
    return !!(qh && typeof qh === 'object' && !Array.isArray(qh)
        && HHMM.test(String(qh.start || '').trim()) && HHMM.test(String(qh.end || '').trim()));
}

/**
 * Normalize a stored/merged state into a complete, safe state. Values that
 * slipped past validation (a hand edit) fall back to defaults rather than
 * producing a 0 ms loop.
 */
export function normalizeCalloutState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const interval = Number(src.intervalMs);
    const jitter = Number(src.jitterPct);
    const words = Number(src.maxWords);
    let quietHours;
    if (src.quietHours === null) quietHours = null;
    else if (validQuietHours(src.quietHours)) {
        quietHours = { start: String(src.quietHours.start).trim(), end: String(src.quietHours.end).trim() };
    } else quietHours = { ...DEFAULTS.quietHours };
    const prompt = typeof src.prompt === 'string' && src.prompt.trim()
        ? src.prompt.trim().slice(0, MAX_PROMPT_CHARS) : null;
    return {
        enabled: src.enabled === true,
        intervalMs: Number.isFinite(interval) && interval >= MIN_INTERVAL_MS
            ? Math.min(MAX_INTERVAL_MS, Math.round(interval)) : DEFAULTS.intervalMs,
        jitterPct: Number.isFinite(jitter) ? Math.max(0, Math.min(MAX_JITTER_PCT, jitter)) : DEFAULTS.jitterPct,
        quietHours,
        // Default false: in callout mode a PIR wake does NOT open an agent session.
        aiOnWake: src.aiOnWake === true,
        prompt,
        maxWords: Number.isFinite(words) && words >= 3 ? Math.min(60, Math.round(words)) : DEFAULTS.maxWords
    };
}

/** Validate a POST body before it is merged and written. Returns human-readable errors. */
export function validateCalloutPatch(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['body must be an object'];
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') errors.push('enabled must be a boolean');
    if (raw.aiOnWake !== undefined && typeof raw.aiOnWake !== 'boolean') errors.push('aiOnWake must be a boolean');
    if (raw.intervalMs !== undefined) {
        const v = Number(raw.intervalMs);
        if (raw.intervalMs === null || !Number.isFinite(v) || v < MIN_INTERVAL_MS || v > MAX_INTERVAL_MS) {
            errors.push(`intervalMs must be a number between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}`);
        }
    }
    if (raw.jitterPct !== undefined) {
        const v = Number(raw.jitterPct);
        if (raw.jitterPct === null || !Number.isFinite(v) || v < 0 || v > MAX_JITTER_PCT) {
            errors.push(`jitterPct must be a number 0-${MAX_JITTER_PCT}`);
        }
    }
    if (raw.maxWords !== undefined) {
        const v = Number(raw.maxWords);
        if (raw.maxWords === null || !Number.isFinite(v) || v < 3 || v > 60) errors.push('maxWords must be a number 3-60');
    }
    if (raw.quietHours !== undefined && raw.quietHours !== null && !validQuietHours(raw.quietHours)) {
        errors.push('quietHours must be null or { start: "HH:MM", end: "HH:MM" }');
    }
    if (raw.prompt !== undefined && raw.prompt !== null && typeof raw.prompt !== 'string') {
        errors.push('prompt must be a string or null');
    } else if (typeof raw.prompt === 'string' && raw.prompt.length > MAX_PROMPT_CHARS) {
        errors.push(`prompt must be at most ${MAX_PROMPT_CHARS} characters`);
    }
    return errors;
}

/**
 * Delay to the next scheduled callout: intervalMs plus up to jitterPct more,
 * never below 1 minute. Jitter only ever LENGTHENS the gap — intervalMs is the
 * operator's "no more often than" (every AI line is billed), so a random
 * shortening would break the one promise this mode makes.
 */
export function nextDelayMs(intervalMs, jitterPct = 0, random = Math.random) {
    const base = Number.isFinite(intervalMs) ? intervalMs : DEFAULTS.intervalMs;
    const pct = Math.max(0, Math.min(MAX_JITTER_PCT, Number(jitterPct) || 0)) / 100;
    const offset = Math.max(0, Math.min(1, random())) * pct * base;
    return Math.max(MIN_INTERVAL_MS, Math.round(base + offset));
}

/**
 * Decide whether a callout may speak now.
 *
 * @param {object} s
 * @param {boolean} s.enabled
 * @param {boolean} [s.force]             operator test: bypasses quiet hours only
 * @param {boolean} [s.inQuietHours]
 * @param {boolean} [s.muted]
 * @param {boolean} [s.inFlight]          a callout is already speaking
 * @param {boolean} [s.conversationActive]
 * @param {boolean} [s.queueRunning]
 * @param {boolean} [s.otherAudioActive]
 * @param {boolean} [s.ignoreEnabled]     operator test on a disabled character
 * @returns {{go: boolean, reason: string}}
 */
export function decideCallout(s = {}) {
    if (!s.enabled && !s.ignoreEnabled) return { go: false, reason: 'disabled' };
    if (s.inFlight) return { go: false, reason: 'in-flight' };
    if (s.muted) return { go: false, reason: 'muted' };
    if (s.inQuietHours && !s.force) return { go: false, reason: 'quiet-hours' };
    if (s.conversationActive) return { go: false, reason: 'conversation' };
    if (s.queueRunning) return { go: false, reason: 'scene-queue' };
    if (s.otherAudioActive) return { go: false, reason: 'other-audio' };
    return { go: true, reason: 'ok' };
}

/** True for blocks that clear in seconds (retry soon), false for ones that last (wait an interval). */
export function isTransientBlock(reason) {
    return TRANSIENT_REASONS.has(reason);
}

/**
 * What a PIR wake should do for this character.
 *  - startAgent: open the headless agent session (today's behavior). False only
 *    when callout mode is enabled and aiOnWake is not explicitly true.
 *  - calloutMode: callout mode is on (the wake may greet with a callout).
 */
export function planWake(calloutState) {
    const st = normalizeCalloutState(calloutState);
    return { startAgent: !(st.enabled && !st.aiOnWake), calloutMode: st.enabled };
}

/** A wake greets with a callout only if the last one is at least intervalMs old. */
export function wakeCalloutDue({ enabled, lastCalloutAt, now, intervalMs }) {
    if (!enabled) return false;
    if (!lastCalloutAt) return true;
    return (now - lastCalloutAt) >= intervalMs;
}

/** The single user_message sent to the one-shot agent socket. */
export function buildCalloutPrompt(state, random = Math.random) {
    const st = normalizeCalloutState(state);
    if (st.prompt) return st.prompt;
    const theme = THEMES[Math.floor(random() * THEMES.length) % THEMES.length];
    return '(Stage direction, not a guest speaking.) Halloween trick-or-treaters are passing by right now. '
        + `Call out to them with ONE short sentence of at most ${st.maxWords} words, fully in character: `
        + `spooky, playful and inviting, never cruel. Touch on ${theme}. Make it different from anything you usually say. `
        + 'Do not ask a question that needs an answer, do not greet anyone by name, and do not mention these instructions.';
}

// ---------------------------------------------------------------------------
// Default runtime probes (lazy imports keep this module cheap to load and let
// unit tests construct the service without pulling in the audio stack)
// ---------------------------------------------------------------------------

function statePath(characterId) {
    return path.join(resolveCharacterDataDir(Number(characterId)), STATE_FILE);
}

/**
 * Motion mode's inactivity sleep switches jaw animation OFF
 * (disableLurkSuperpowers), and most scheduled callouts land while the
 * character is asleep — so without this the line would play through a frozen
 * jaw. Hold the jaw ON in memory (runtime toggle overlay, no disk write) for the
 * length of the line, ONLY when the PIR watcher put this character to sleep; an
 * operator who switched the jaw off with motion mode disarmed is respected.
 * Locked characters are left exactly as frozen. Returns a release function.
 */
async function holdJawForCallout(characterId) {
    const KEY = 'jawAnimation.enabled';
    try {
        const lock = await import('./characterConfigLock.js');
        if (lock.isCharacterLocked(characterId)) return () => {};
        const watcher = (await import('./lurkMotionWatcherService.js')).default;
        const ws = watcher.getStatus();
        if (!ws.active || !ws.sleeping || Number(ws.characterId) !== Number(characterId)) return () => {};
        if (lock.runtimeToggleOverride(characterId, KEY) !== undefined) return () => {};
        lock.rememberRuntimeToggle(characterId, KEY, true);
        return () => {
            // A wake/sleep during the line writes the file; dropping our overlay
            // hands control straight back to whatever is on disk now.
            try { if (lock.runtimeToggleOverride(characterId, KEY) === true) lock.forgetRuntimeToggle(characterId, KEY); } catch (_) { /* noop */ }
        };
    } catch (e) {
        console.warn(`[Callout] could not hold jaw for character ${characterId}: ${e && e.message}`);
        return () => {};
    }
}

function defaultDeps() {
    let wsSvc, queue, playback, characterSvc;
    const load = async () => {
        if (!playback) playback = (await import('./serverPlaybackService.js')).default;
        if (!queue) queue = await import('./scenes/sceneQueue.js');
        if (!wsSvc) wsSvc = (await import('./elevenLabsWebSocketService.js')).default;
        if (!characterSvc) characterSvc = await import('./characterService.js');
    };
    return {
        now: () => Date.now(),
        random: Math.random,
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (t) => clearTimeout(t),
        async readState(characterId) {
            try {
                return JSON.parse(await fs.readFile(statePath(characterId), 'utf8'));
            } catch (e) {
                if (e && e.code !== 'ENOENT') {
                    console.warn(`[Callout] could not read ${STATE_FILE} for character ${characterId}: ${e.message}`);
                }
                return null;
            }
        },
        async writeState(characterId, state) {
            await writeJsonAtomic(statePath(characterId), state);
        },
        async probe(characterId) {
            await load();
            const now = Date.now();
            let conversationActive = false;
            try { conversationActive = !!wsSvc.hasActiveSession(characterId); } catch (_) { /* treat as none */ }
            let queueRunning = false;
            try { queueRunning = !!(queue.getStatus(characterId) || {}).running; } catch (_) { /* none */ }
            let otherAudioActive = false;
            try {
                const last = playback.getLastPlay();
                if (last && last.ts && (last.characterId == null || Number(last.characterId) === Number(characterId))) {
                    // Same estimate as the background-music supervisor: ~128 kbps MP3.
                    const est = last.streamed > 0 ? Math.round(last.streamed * 8 / 128) : UNKNOWN_PLAYBACK_MS;
                    otherAudioActive = now < last.ts + est + RECENT_AUDIO_GRACE_MS;
                }
            } catch (_) { /* none */ }
            let muted = false;
            try { muted = !!playback.isSpeakerMuted(); } catch (_) { /* assume audible */ }
            return { muted, conversationActive, queueRunning, otherAudioActive };
        },
        /**
         * ONE line through the existing one-shot agent path (the same
         * askAgentQuestion the /api/ask-ai route and askAI scene step use). It
         * opens a short-lived socket — never the persistent headless session — and
         * its audio plays through _startAudioPlayback, which drives the jaw from
         * amplitude and the LED speaking sync.
         */
        async speak(characterId, prompt) {
            await load();
            const character = await characterSvc.getCharacterById(Number(characterId));
            if (!character || !character.elevenLabsAgentId) {
                return { success: false, error: `character ${characterId} has no ElevenLabs agent` };
            }
            const release = await holdJawForCallout(characterId);
            try {
                const r = await wsSvc.askAgentQuestion(character.elevenLabsAgentId, prompt, Number(characterId));
                return r && r.success ? { success: true, text: r.response } : { success: false, error: (r && r.error) || 'no response' };
            } finally {
                release();
            }
        },
        recordSpeech(characterId, text) {
            import('./speechLogService.js')
                .then(m => m.recordSpeech(characterId, { speaker: 'character', source: 'callout', text }))
                .catch(() => { /* speech log is diagnostics only */ });
        }
    };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function isTestMode() {
    return process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
}

export class CalloutService {
    constructor(deps = defaultDeps()) {
        this.deps = deps;
        // characterId -> { state, timer, lastCalloutAt, inFlight, lastResult, failureLogged }
        this.chars = new Map();
    }

    _entry(characterId) {
        const key = String(characterId);
        if (!this.chars.has(key)) {
            this.chars.set(key, {
                state: normalizeCalloutState(null),
                timer: null,
                lastCalloutAt: 0,
                inFlight: false,
                lastResult: null,
                failureLogged: false
            });
        }
        return this.chars.get(key);
    }

    /** Stored state, normalized. A missing file reads as DEFAULTS (disabled). */
    async readState(characterId) {
        return normalizeCalloutState(await this.deps.readState(characterId));
    }

    /**
     * Merge a validated patch over the stored state, persist it and apply it at
     * once. Throws with `.validation` on a bad body.
     */
    async writeState(characterId, patch) {
        const errors = validateCalloutPatch(patch);
        if (errors.length) {
            const err = new Error(errors.join('; '));
            err.validation = errors;
            throw err;
        }
        const current = await this.readState(characterId);
        const merged = normalizeCalloutState({ ...current, ...patch });
        await this.deps.writeState(characterId, merged);
        await this.apply(characterId, merged);
        return merged;
    }

    /** Start or stop the scheduler to match `state` (read from disk when omitted). */
    async apply(characterId, state = null) {
        const st = state ? normalizeCalloutState(state) : await this.readState(characterId);
        const entry = this._entry(characterId);
        const wasRunning = !!entry.timer;
        entry.state = st;
        this._clearTimer(entry);
        if (st.enabled && !isTestMode()) {
            this._schedule(characterId, nextDelayMs(st.intervalMs, st.jitterPct, this.deps.random));
            if (!wasRunning) {
                console.log(`[Callout] character ${characterId}: callout mode ON — one line every ~${Math.round(st.intervalMs / 1000)} s`
                    + ` (+0-${st.jitterPct}%), quiet hours ${st.quietHours ? `${st.quietHours.start}-${st.quietHours.end}` : 'none'},`
                    + ` agent on PIR wake: ${st.aiOnWake ? 'yes' : 'no'}`);
            }
        } else if (wasRunning) {
            console.log(`[Callout] character ${characterId}: callout mode OFF`);
        }
        return this.getStatus(characterId);
    }

    stop(characterId) {
        const entry = this.chars.get(String(characterId));
        if (entry) this._clearTimer(entry);
    }

    stopAll() {
        for (const entry of this.chars.values()) this._clearTimer(entry);
    }

    _clearTimer(entry) {
        if (entry.timer) {
            try { this.deps.clearTimeout(entry.timer); } catch (_) { /* noop */ }
            entry.timer = null;
        }
    }

    _schedule(characterId, delayMs) {
        const entry = this._entry(characterId);
        this._clearTimer(entry);
        entry.nextAt = this.deps.now() + delayMs;
        const timer = this.deps.setTimeout(() => {
            entry.timer = null;
            this._tick(characterId).catch((e) => {
                console.error(`[Callout] tick failed for character ${characterId}:`, e && e.message);
            });
        }, delayMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
        entry.timer = timer;
    }

    async _tick(characterId) {
        const entry = this._entry(characterId);
        if (!entry.state.enabled) return;
        // Invariant: never two spoken callouts closer than intervalMs, whatever
        // spoke last (a wake greeting, an operator test, a re-applied config).
        const sinceLast = entry.lastCalloutAt ? this.deps.now() - entry.lastCalloutAt : Infinity;
        if (sinceLast < entry.state.intervalMs) {
            if (!entry.timer) this._schedule(characterId, Math.max(1000, entry.state.intervalMs - sinceLast));
            return;
        }
        const result = await this.performCallout(characterId, { source: 'schedule' });
        // A callout disabled while it was speaking must not reschedule itself.
        if (!entry.state.enabled || entry.timer) return;
        const delay = !result.spoke && isTransientBlock(result.reason)
            ? Math.min(TRANSIENT_RETRY_MS, entry.state.intervalMs)
            : nextDelayMs(entry.state.intervalMs, entry.state.jitterPct, this.deps.random);
        this._schedule(characterId, delay);
    }

    /**
     * Speak one callout if the gates allow it.
     * @param {object} [opts]
     * @param {boolean} [opts.force]  bypass quiet hours (operator test only)
     * @param {boolean} [opts.test]   operator test: works on a disabled character
     * @param {string}  [opts.source] schedule | wake | test
     */
    async performCallout(characterId, opts = {}) {
        const entry = this._entry(characterId);
        const st = entry.state;
        // Claim the slot BEFORE the first await. The probe is async, so checking
        // inFlight only after it let a timer tick and a PIR wake (or a test POST)
        // that arrived together both pass the gate and open two agent sockets
        // talking over each other.
        if (entry.inFlight) {
            entry.lastResult = { at: this.deps.now(), spoke: false, reason: 'in-flight', source: opts.source };
            return { spoke: false, reason: 'in-flight' };
        }
        entry.inFlight = true;
        try {
            let probe = {};
            try { probe = await this.deps.probe(characterId); } catch (e) {
                console.warn(`[Callout] probe failed for character ${characterId}: ${e && e.message}`);
            }
            const decision = decideCallout({
                enabled: st.enabled,
                ignoreEnabled: !!opts.test,
                force: !!opts.force,
                inFlight: false,
                inQuietHours: isInQuietHours(st.quietHours, new Date(this.deps.now())),
                ...probe
            });
            if (!decision.go) {
                entry.lastResult = { at: this.deps.now(), spoke: false, reason: decision.reason, source: opts.source };
                return { spoke: false, reason: decision.reason };
            }
            return await this._speak(characterId, entry, st, opts);
        } finally {
            entry.inFlight = false;
        }
    }

    async _speak(characterId, entry, st, opts) {
        const prompt = buildCalloutPrompt(st, this.deps.random);
        try {
            const r = await this.deps.speak(characterId, prompt);
            if (r && r.success) {
                entry.lastCalloutAt = this.deps.now();
                entry.failureLogged = false;
                const text = String(r.text || '').trim();
                console.log(`[Callout] character ${characterId} (${opts.source || 'schedule'}): "${text.slice(0, 160)}"`);
                if (text) { try { this.deps.recordSpeech(characterId, text); } catch (_) { /* diagnostics only */ } }
                entry.lastResult = { at: entry.lastCalloutAt, spoke: true, reason: 'ok', source: opts.source, text };
                return { spoke: true, reason: 'ok', text };
            }
            return this._failed(characterId, entry, (r && r.error) || 'no response', opts.source);
        } catch (e) {
            return this._failed(characterId, entry, (e && e.message) || String(e), opts.source);
        }
    }

    _failed(characterId, entry, error, source) {
        // Log once per failure streak — a dead API key or exhausted quota must not
        // fill the SD card every five minutes. The next interval simply tries again.
        if (!entry.failureLogged) {
            console.error(`[Callout] character ${characterId}: AI callout failed, skipping (${error})`);
            entry.failureLogged = true;
        }
        entry.lastResult = { at: this.deps.now(), spoke: false, reason: 'ai-failed', error, source };
        return { spoke: false, reason: 'ai-failed', error };
    }

    /**
     * PIR wake: greet with a callout unless one went out within the interval.
     * Never awaited by the wake path (the line takes seconds to speak).
     */
    async onMotionWake(characterId) {
        const entry = this._entry(characterId);
        // The wake path may run before apply() on a node that enabled callouts on
        // another process; trust the file in that case.
        if (!entry.state.enabled) entry.state = await this.readState(characterId);
        if (!wakeCalloutDue({
            enabled: entry.state.enabled,
            lastCalloutAt: entry.lastCalloutAt,
            now: this.deps.now(),
            intervalMs: entry.state.intervalMs
        })) {
            return { spoke: false, reason: 'not-due' };
        }
        const r = await this.performCallout(characterId, { source: 'wake' });
        // A greeting resets the cadence, so the next scheduled line is a full
        // interval after it rather than seconds later.
        if (r.spoke && entry.state.enabled && !isTestMode()) {
            this._schedule(characterId, nextDelayMs(entry.state.intervalMs, entry.state.jitterPct, this.deps.random));
        }
        return r;
    }

    /**
     * Operator test: one callout now, ignoring the interval and the enabled flag
     * but still honoring quiet hours unless `force`.
     */
    async testCallout(characterId, { force = false } = {}) {
        const entry = this._entry(characterId);
        // No live scheduler means entry.state may never have been loaded.
        if (!entry.timer) entry.state = await this.readState(characterId);
        const r = await this.performCallout(characterId, { test: true, force: !!force, source: 'test' });
        // A live scheduler restarts its interval from this line, like a wake greeting.
        if (r.spoke && entry.timer && entry.state.enabled && !isTestMode()) {
            this._schedule(characterId, nextDelayMs(entry.state.intervalMs, entry.state.jitterPct, this.deps.random));
        }
        return r;
    }

    getStatus(characterId) {
        const entry = this.chars.get(String(characterId));
        if (!entry) return { running: false, state: normalizeCalloutState(null), lastCalloutAt: null, nextAt: null, lastResult: null };
        return {
            running: !!entry.timer,
            state: entry.state,
            inFlight: entry.inFlight,
            lastCalloutAt: entry.lastCalloutAt || null,
            nextAt: entry.timer ? entry.nextAt : null,
            lastResult: entry.lastResult
        };
    }
}

const calloutService = new CalloutService();
export default calloutService;
