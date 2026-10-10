/**
 * Lurk scenes — while a character waits for people to walk by, it performs one
 * scene from a chosen rotation every few minutes.
 *
 * Why not a looping scene queue: a queue plays back-to-back with no gap, and
 * callouts and background music both stand aside for as long as a queue is
 * running — so a looping queue would silence them all night. This plays ONE
 * scene through the queue (so everything else still sees "a scene is playing"
 * and waits), then leaves the yard quiet for an interval before the next.
 *
 * Operator direction 2026-10-05: "at least five [scenes] on a loop for all
 * characters during Lurk mode while waiting for people to walk by".
 *
 * Opt-in, per character, stored as RUNTIME state
 * (data/character-{id}/lurk-scenes-state.json — the `-state.json` suffix keeps
 * it writable on a LOCKED character, see characterConfigLock). Absent file or
 * enabled:false => the node behaves exactly as before.
 *
 * "Waiting for people" means the node's lurk state machine
 * (services/lurkStateService.js) reads `lurking`. Awake (a guest, AI mode), a
 * fleet event hold, or Lurk OFF all block. OFF by default (decision D3,
 * castle-tuning mission): lurk scenes usually speak, and the operator brief is
 * "nobody speaks until woken" — enabling them is an explicit opt-in.
 */

import fs from 'fs/promises';
import path from 'path';
import { writeJsonAtomic } from './atomicStore.js';
import { isInQuietHours } from './backgroundMusicService.js';
import { resolveCharacterDataDir } from './characterService.js';
import { nextDelayMs } from './calloutService.js';

export const STATE_FILE = 'lurk-scenes-state.json';

export const DEFAULTS = Object.freeze({
    enabled: false,
    sceneIds: Object.freeze([]),
    intervalMs: 4 * 60 * 1000,
    jitterPct: 25,
    quietHours: Object.freeze({ start: '23:00', end: '08:00' })
});

const MIN_INTERVAL_MS = 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_SCENES = 50;
// Same windows as callouts: a blocked turn retries soon instead of waiting a
// whole interval behind a 20-second line.
const TRANSIENT_RETRY_MS = 30 * 1000;
const TRANSIENT_REASONS = new Set(['conversation', 'scene-queue', 'other-audio', 'callout', 'in-flight', 'guests-present']);
const RECENT_AUDIO_GRACE_MS = 3000;
const UNKNOWN_PLAYBACK_MS = 4000;
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function validQuietHours(qh) {
    return !!(qh && typeof qh === 'object' && !Array.isArray(qh)
        && HHMM.test(String(qh.start || '').trim()) && HHMM.test(String(qh.end || '').trim()));
}

export function normalizeLurkSceneState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const interval = Number(src.intervalMs);
    const jitter = Number(src.jitterPct);
    const ids = Array.isArray(src.sceneIds) ? src.sceneIds : [];
    return {
        enabled: src.enabled === true,
        sceneIds: ids.map(id => String(id).trim()).filter(Boolean).slice(0, MAX_SCENES),
        intervalMs: Number.isFinite(interval)
            ? Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(interval)))
            : DEFAULTS.intervalMs,
        jitterPct: Number.isFinite(jitter) ? Math.min(50, Math.max(0, Math.round(jitter))) : DEFAULTS.jitterPct,
        quietHours: src.quietHours === null ? null
            : (validQuietHours(src.quietHours)
                ? { start: String(src.quietHours.start).trim(), end: String(src.quietHours.end).trim() }
                : { ...DEFAULTS.quietHours })
    };
}

export function validateLurkScenePatch(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['body must be an object'];
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') errors.push('enabled must be a boolean');
    if (raw.sceneIds !== undefined) {
        if (!Array.isArray(raw.sceneIds)) errors.push('sceneIds must be an array');
        else if (raw.sceneIds.length > MAX_SCENES) errors.push(`sceneIds may hold at most ${MAX_SCENES} scenes`);
        else if (raw.sceneIds.some(id => !['string', 'number'].includes(typeof id) || String(id).trim() === '')) {
            errors.push('sceneIds must be scene ids');
        }
    }
    if (raw.intervalMs !== undefined) {
        const n = Number(raw.intervalMs);
        if (!Number.isFinite(n) || n < MIN_INTERVAL_MS || n > MAX_INTERVAL_MS) {
            errors.push(`intervalMs must be between ${MIN_INTERVAL_MS} and ${MAX_INTERVAL_MS}`);
        }
    }
    if (raw.jitterPct !== undefined) {
        const n = Number(raw.jitterPct);
        if (!Number.isFinite(n) || n < 0 || n > 50) errors.push('jitterPct must be between 0 and 50');
    }
    if (raw.quietHours !== undefined && raw.quietHours !== null && !validQuietHours(raw.quietHours)) {
        errors.push('quietHours must be null or {start:"HH:MM", end:"HH:MM"}');
    }
    return errors;
}

/**
 * Decide whether a lurk scene may play now.
 * @returns {{go: boolean, reason: string}}
 */
export function decideLurkScene(s = {}) {
    if (!s.enabled && !s.ignoreEnabled) return { go: false, reason: 'disabled' };
    if (!s.hasScenes) return { go: false, reason: 'no-scenes' };
    if (s.inFlight) return { go: false, reason: 'in-flight' };
    if (s.inQuietHours && !s.force) return { go: false, reason: 'quiet-hours' };
    if (s.muted) return { go: false, reason: 'muted' };
    if (!s.lurking && !s.ignoreEnabled) return { go: false, reason: 'not-lurking' };
    if (s.guestsPresent && !s.ignoreEnabled) return { go: false, reason: 'guests-present' };
    if (s.conversationActive) return { go: false, reason: 'conversation' };
    if (s.calloutInFlight) return { go: false, reason: 'callout' };
    if (s.queueRunning) return { go: false, reason: 'scene-queue' };
    if (s.otherAudioActive) return { go: false, reason: 'other-audio' };
    return { go: true, reason: 'ok' };
}

/** Next scene id in the rotation after `lastId` (round-robin; first when unknown). */
export function nextSceneId(sceneIds, lastId) {
    if (!Array.isArray(sceneIds) || sceneIds.length === 0) return null;
    const i = lastId == null ? -1 : sceneIds.indexOf(String(lastId));
    return sceneIds[(i + 1) % sceneIds.length];
}

/**
 * Did startWithConfig actually start the scene? Its returned status is read
 * AFTER runLoop has synchronously shifted the only item off the queue, so the
 * old `status.length > 0` check reported "did not start" for every scene that
 * DID start (22 false lines in monsterbox.err on 2026-10-09). A started queue
 * is `running` (runLoop sets it before its first await); a missing scene id
 * leaves the queue empty and runLoop exits synchronously with running=false.
 */
export function queueStarted(status) {
    if (!status || typeof status !== 'object') return false;
    return !!(status.running || status.nowPlaying || (Number(status.length) || 0) > 0);
}

function statePath(characterId) {
    return path.join(resolveCharacterDataDir(Number(characterId)), STATE_FILE);
}

function isTestMode() {
    return process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
}

function defaultDeps() {
    let wsSvc, queue, playback, lurk, callouts;
    const load = async () => {
        if (!playback) playback = (await import('./serverPlaybackService.js')).default;
        if (!queue) queue = await import('./scenes/sceneQueue.js');
        if (!wsSvc) wsSvc = (await import('./elevenLabsWebSocketService.js')).default;
        if (!lurk) lurk = (await import('./lurkStateService.js')).default;
        if (!callouts) callouts = (await import('./calloutService.js')).default;
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
                    console.warn(`[LurkScenes] could not read ${STATE_FILE} for character ${characterId}: ${e.message}`);
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
            let gate = null;
            try { gate = lurk.getGateState(characterId); } catch (_) { /* no machine: not lurking */ }
            let conversationActive = false;
            try { conversationActive = !!wsSvc.hasActiveSession(characterId); } catch (_) { /* none */ }
            let queueRunning = false;
            try { queueRunning = !!(queue.getStatus(characterId) || {}).running; } catch (_) { /* none */ }
            let calloutInFlight = false;
            try { calloutInFlight = !!(callouts.getStatus(characterId) || {}).inFlight; } catch (_) { /* none */ }
            let otherAudioActive = false;
            try {
                const last = playback.getLastPlay();
                if (last && last.ts && (last.characterId == null || Number(last.characterId) === Number(characterId))) {
                    const est = last.streamed > 0 ? Math.round(last.streamed * 8 / 128) : UNKNOWN_PLAYBACK_MS;
                    otherAudioActive = now < last.ts + est + RECENT_AUDIO_GRACE_MS;
                }
            } catch (_) { /* none */ }
            let muted = false;
            try { muted = !!playback.isSpeakerMuted(); } catch (_) { /* assume audible */ }
            return {
                lurking: gate === 'lurking',
                // Awake = someone woke it (PIR, schedule, AI on): their turn, not a scene's.
                guestsPresent: gate === 'awake',
                conversationActive, queueRunning, calloutInFlight, otherAudioActive, muted
            };
        },
        async playScene(characterId, sceneId) {
            await load();
            const status = await queue.startWithConfig(characterId, {
                mode: 'sequential',
                scenes: [{ scene_id: sceneId }]
            });
            return { success: queueStarted(status), status };
        }
    };
}

export class LurkSceneService {
    constructor(deps = defaultDeps()) {
        this.deps = deps;
        // characterId -> { state, timer, nextAt, lastSceneId, lastPlayedAt, inFlight, lastResult }
        this.chars = new Map();
    }

    _entry(characterId) {
        const key = String(characterId);
        if (!this.chars.has(key)) {
            this.chars.set(key, {
                state: normalizeLurkSceneState(null),
                timer: null,
                nextAt: null,
                lastSceneId: null,
                lastPlayedAt: 0,
                inFlight: false,
                lastResult: null
            });
        }
        return this.chars.get(key);
    }

    async readState(characterId) {
        return normalizeLurkSceneState(await this.deps.readState(characterId));
    }

    async writeState(characterId, patch) {
        const errors = validateLurkScenePatch(patch);
        if (errors.length) {
            const err = new Error(errors.join('; '));
            err.validation = errors;
            throw err;
        }
        const current = await this.readState(characterId);
        const merged = normalizeLurkSceneState({ ...current, ...patch });
        await this.deps.writeState(characterId, merged);
        await this.apply(characterId, merged);
        return merged;
    }

    async apply(characterId, state = null) {
        const st = state ? normalizeLurkSceneState(state) : await this.readState(characterId);
        const entry = this._entry(characterId);
        const wasRunning = !!entry.timer;
        entry.state = st;
        this._clearTimer(entry);
        if (st.enabled && st.sceneIds.length > 0 && !isTestMode()) {
            this._schedule(characterId, nextDelayMs(st.intervalMs, st.jitterPct, this.deps.random));
            if (!wasRunning) {
                console.log(`[LurkScenes] character ${characterId}: ON — ${st.sceneIds.length} scene(s) [${st.sceneIds.join(', ')}],`
                    + ` one every ~${Math.round(st.intervalMs / 1000)} s (+0-${st.jitterPct}%),`
                    + ` quiet hours ${st.quietHours ? `${st.quietHours.start}-${st.quietHours.end}` : 'none'}`);
            }
        } else if (wasRunning) {
            console.log(`[LurkScenes] character ${characterId}: OFF`);
        }
        return this.getStatus(characterId);
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
                console.error(`[LurkScenes] tick failed for character ${characterId}:`, e && e.message);
            });
        }, delayMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
        entry.timer = timer;
    }

    async _tick(characterId) {
        const entry = this._entry(characterId);
        if (!entry.state.enabled) return;
        const result = await this.playNext(characterId, { source: 'schedule' });
        if (!entry.state.enabled || entry.timer) return;
        const delay = !result.played && TRANSIENT_REASONS.has(result.reason)
            ? Math.min(TRANSIENT_RETRY_MS, entry.state.intervalMs)
            : nextDelayMs(entry.state.intervalMs, entry.state.jitterPct, this.deps.random);
        this._schedule(characterId, delay);
    }

    /**
     * Play the next scene in the rotation if the gates allow it.
     * @param {object} [opts]
     * @param {boolean} [opts.test]   operator test: ignores enabled/lurking/guests
     * @param {boolean} [opts.force]  also bypasses quiet hours (operator only)
     */
    async playNext(characterId, opts = {}) {
        const entry = this._entry(characterId);
        const st = entry.state;
        if (entry.inFlight) return { played: false, reason: 'in-flight' };
        entry.inFlight = true;
        try {
            let probe = {};
            try { probe = await this.deps.probe(characterId); } catch (e) {
                console.warn(`[LurkScenes] probe failed for character ${characterId}: ${e && e.message}`);
            }
            const decision = decideLurkScene({
                enabled: st.enabled,
                hasScenes: st.sceneIds.length > 0,
                ignoreEnabled: !!opts.test,
                force: !!opts.force,
                inQuietHours: isInQuietHours(st.quietHours, new Date(this.deps.now())),
                ...probe
            });
            if (!decision.go) {
                entry.lastResult = { at: this.deps.now(), played: false, reason: decision.reason, source: opts.source };
                return { played: false, reason: decision.reason };
            }
            const sceneId = nextSceneId(st.sceneIds, entry.lastSceneId);
            entry.lastSceneId = sceneId;
            const r = await this.deps.playScene(characterId, sceneId);
            if (!r || !r.success) {
                // A scene id that no longer exists must not stall the rotation:
                // the next turn moves on to the next id.
                console.warn(`[LurkScenes] character ${characterId}: scene ${sceneId} did not start (missing?)`);
                entry.lastResult = { at: this.deps.now(), played: false, reason: 'scene-missing', sceneId, source: opts.source };
                return { played: false, reason: 'scene-missing', sceneId };
            }
            entry.lastPlayedAt = this.deps.now();
            console.log(`[LurkScenes] character ${characterId} (${opts.source || 'schedule'}): playing scene ${sceneId}`);
            entry.lastResult = { at: entry.lastPlayedAt, played: true, reason: 'ok', sceneId, source: opts.source };
            return { played: true, reason: 'ok', sceneId };
        } finally {
            entry.inFlight = false;
        }
    }

    getStatus(characterId) {
        const entry = this._entry(characterId);
        return {
            running: !!entry.timer,
            state: entry.state,
            nextAt: entry.timer ? entry.nextAt : null,
            lastSceneId: entry.lastSceneId,
            lastPlayedAt: entry.lastPlayedAt || null,
            lastResult: entry.lastResult
        };
    }
}

const lurkSceneService = new LurkSceneService();
export default lurkSceneService;
