/**
 * Background Music Supervisor — per-character ambient music that plays "most
 * of the time" and never fights the AI.
 *
 * Opt-in per character via an optional top-level block in
 * data/character-<id>/super-powers.json:
 *
 *   backgroundMusic: {
 *     enabled: boolean,
 *     tracks: [audioId, ...],      // audio-library ids (or filenames)
 *     volume: 0-100,               // default 35
 *     shuffle: boolean,
 *     resumeDelayMs: number,       // default 5000
 *     quietHours: { start: "HH:MM", end: "HH:MM" } | null
 *   }
 *
 * WHY it PAUSES rather than ducks: a character's microphone hears its own
 * speaker, so any music under a conversation is transcribed by the agent as a
 * guest talking. Music therefore stops outright while the character has a live
 * conversation session, while a scene queue is running, while other playback
 * (TTS / say / sound effects) is on the speaker, during quiet hours, and while
 * the speaker is muted — and resumes, from where it left off, resumeDelayMs
 * after the last of those clears.
 *
 * WHY it follows the lurk state (decision D3, castle-tuning mission): music is
 * the sound of a character WAITING. It plays only while the node's lurk state
 * machine (services/lurkStateService.js) reads `lurking`; any wake (PIR, a
 * schedule, AI on) pauses it, a fleet event hold pauses it, Lurk OFF pauses it,
 * and the return to lurking resumes it from where it left off.
 *
 * WHY Stop-All / panic PAUSE it instead of destroying the supervisor: a stop
 * used to delete the supervisor, and nothing restarted it until the next boot.
 * Now it stays paused (by the operator) until the next resume — the machine's
 * next entry into lurking, a Lurk ON, or a background-music config save.
 *
 * WHY it never calls serverPlaybackService.stopForCharacter: that runs
 * speaker_cli.py stop, which pkills EVERY pw-play/mpg123 on the node — i.e. the
 * AI's voice. Each track is a handle from audioLoopService.playTrack() and the
 * supervisor only ever kills its own two PIDs.
 *
 * Low cost on a Pi: one in-memory tick every 1.5 s, config read at most every
 * 10 s (page-cached, no writes), logs on state transitions only.
 */

import fs from 'fs/promises';
import path from 'path';
import { updateJsonUnderLock } from './atomicStore.js';

export const DEFAULTS = Object.freeze({
    enabled: false,
    tracks: [],
    volume: 35,
    shuffle: false,
    resumeDelayMs: 5000,
    quietHours: null
});

const TICK_MS = 1500;
const CONFIG_TTL_MS = 10000;
// A track that ends this soon after starting counts as a failure, not a play.
const QUICK_FAIL_MS = 2000;
const MAX_QUICK_FAILS = 3;
const FAIL_BACKOFF_MS = 60000;
// Estimate of how long a non-music playback occupies the speaker when its
// duration is unknown (file-based say/sfx that does not report bytes).
const UNKNOWN_PLAYBACK_MS = 4000;

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

function parseHHMM(value) {
    const m = HHMM.exec(String(value || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Normalize a raw config block into a complete, safe config.
 * Unknown keys are dropped; out-of-range values clamped.
 */
export function normalizeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const volume = Number(src.volume);
    const resume = Number(src.resumeDelayMs);
    let quietHours = null;
    if (src.quietHours && typeof src.quietHours === 'object'
        && parseHHMM(src.quietHours.start) != null && parseHHMM(src.quietHours.end) != null) {
        quietHours = { start: String(src.quietHours.start).trim(), end: String(src.quietHours.end).trim() };
    }
    return {
        enabled: src.enabled === true,
        tracks: Array.isArray(src.tracks)
            ? src.tracks.filter(t => (typeof t === 'string' && t.trim()) || typeof t === 'number').map(String)
            : [],
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : DEFAULTS.volume,
        shuffle: src.shuffle === true,
        resumeDelayMs: Number.isFinite(resume) ? Math.max(0, Math.min(600000, Math.round(resume))) : DEFAULTS.resumeDelayMs,
        quietHours
    };
}

/**
 * Validate a body before it is written. Returns human-readable errors.
 */
export function validateConfig(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['backgroundMusic must be an object'];
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') errors.push('enabled must be a boolean');
    if (raw.shuffle !== undefined && typeof raw.shuffle !== 'boolean') errors.push('shuffle must be a boolean');
    if (raw.tracks !== undefined && !Array.isArray(raw.tracks)) errors.push('tracks must be an array of audio ids');
    if (raw.volume !== undefined && (!Number.isFinite(Number(raw.volume)) || raw.volume < 0 || raw.volume > 100)) {
        errors.push('volume must be a number 0-100');
    }
    if (raw.resumeDelayMs !== undefined && (!Number.isFinite(Number(raw.resumeDelayMs)) || raw.resumeDelayMs < 0)) {
        errors.push('resumeDelayMs must be a non-negative number');
    }
    if (raw.quietHours !== undefined && raw.quietHours !== null) {
        const qh = raw.quietHours;
        if (typeof qh !== 'object' || parseHHMM(qh.start) == null || parseHHMM(qh.end) == null) {
            errors.push('quietHours must be null or { start: "HH:MM", end: "HH:MM" }');
        }
    }
    return errors;
}

/**
 * True when `date` (node local time) falls inside quiet hours. A window whose
 * start is later than its end wraps midnight (22:00-07:00). start === end is
 * an empty window, never "all day".
 */
export function isInQuietHours(quietHours, date = new Date()) {
    if (!quietHours) return false;
    const start = parseHHMM(quietHours.start);
    const end = parseHHMM(quietHours.end);
    if (start == null || end == null || start === end) return false;
    const minute = date.getHours() * 60 + date.getMinutes();
    return start < end
        ? (minute >= start && minute < end)
        : (minute >= start || minute < end);
}

/**
 * Decide whether music should be audible right now.
 *
 * @param {object} state
 * @param {boolean} state.enabled
 * @param {boolean} state.hasTracks
 * @param {string|null} [state.lurkState]     lurk gate: 'lurking'|'awake'|'off'|'event'; null = no machine bound (legacy: no gate)
 * @param {boolean} [state.operatorPaused]     paused by Stop-All / panic until the next resume
 * @param {boolean} [state.muted]              speaker mute
 * @param {boolean} [state.inQuietHours]
 * @param {boolean} [state.conversationActive] AI session live for this character
 * @param {boolean} [state.queueRunning]       scene queue running
 * @param {boolean} [state.otherAudioActive]   TTS/say/sfx on the speaker
 * @param {number}  [state.msSinceBlocked]     ms since a transient block last held (Infinity if never)
 * @param {number}  [state.resumeDelayMs]
 * @returns {{play: boolean, reason: string}}
 */
export function shouldPlay(state = {}) {
    if (!state.enabled) return { play: false, reason: 'disabled' };
    if (!state.hasTracks) return { play: false, reason: 'no-tracks' };
    if (state.operatorPaused) return { play: false, reason: 'paused' };
    if (state.lurkState != null && state.lurkState !== 'lurking') {
        const reason = state.lurkState === 'awake' ? 'awake'
            : state.lurkState === 'event' ? 'event-hold' : 'not-lurking';
        return { play: false, reason };
    }
    if (state.muted) return { play: false, reason: 'muted' };
    if (state.inQuietHours) return { play: false, reason: 'quiet-hours' };
    if (state.conversationActive) return { play: false, reason: 'conversation' };
    if (state.queueRunning) return { play: false, reason: 'scene-queue' };
    if (state.otherAudioActive) return { play: false, reason: 'other-audio' };
    const since = state.msSinceBlocked == null ? Infinity : state.msSinceBlocked;
    const delay = Number.isFinite(state.resumeDelayMs) ? state.resumeDelayMs : DEFAULTS.resumeDelayMs;
    if (since < delay) return { play: false, reason: 'resume-delay' };
    return { play: true, reason: 'playing' };
}

/**
 * Track rotation: every track once per cycle, in order or shuffled. A
 * reshuffled cycle never starts with the track that just ended (when there is
 * more than one), so a shuffle never plays the same song twice in a row.
 */
export class TrackRotation {
    constructor(tracks = [], { shuffle = false, random = Math.random } = {}) {
        this._random = random;
        this.setTracks(tracks, shuffle);
    }

    setTracks(tracks, shuffle = this.shuffle) {
        const list = Array.isArray(tracks) ? tracks.slice() : [];
        const same = this.tracks && this.shuffle === shuffle
            && this.tracks.length === list.length && this.tracks.every((t, i) => t === list[i]);
        if (same) return;
        this.tracks = list;
        this.shuffle = !!shuffle;
        this._order = [];
        this._pos = 0;
        this._last = null;
    }

    _buildOrder() {
        const order = this.tracks.slice();
        if (this.shuffle) {
            for (let i = order.length - 1; i > 0; i--) {
                const j = Math.floor(this._random() * (i + 1));
                [order[i], order[j]] = [order[j], order[i]];
            }
            if (order.length > 1 && order[0] === this._last) {
                [order[0], order[1]] = [order[1], order[0]];
            }
        }
        return order;
    }

    /** The track to play now (does not advance). null when empty. */
    current() {
        if (!this.tracks.length) return null;
        if (this._pos >= this._order.length) {
            this._order = this._buildOrder();
            this._pos = 0;
        }
        return this._order[this._pos];
    }

    /** Mark the current track finished and return the next one. */
    advance() {
        const cur = this.current();
        if (cur == null) return null;
        this._last = cur;
        this._pos += 1;
        return this.current();
    }
}

// ---------------------------------------------------------------------------
// Config I/O
// ---------------------------------------------------------------------------

function superPowersPath(characterId) {
    // characterId reaches here from routes; never let it build a path outside data/.
    if (!/^\d+$/.test(String(characterId))) throw new Error(`Invalid characterId: ${characterId}`);
    return path.resolve(`data/character-${characterId}`, 'super-powers.json');
}

export async function readBackgroundMusicConfig(characterId) {
    try {
        const raw = JSON.parse(await fs.readFile(superPowersPath(characterId), 'utf8'));
        return normalizeConfig(raw && raw.backgroundMusic);
    } catch (error) {
        if (error.code !== 'ENOENT') console.warn(`🎵 background music config read failed (char ${characterId}):`, error.message);
        return normalizeConfig(null);
    }
}

/**
 * Merge `patch` over the stored block and write it under the same file lock
 * every other super-powers writer uses (siblings survive). A locked character
 * throws CharacterConfigLockedError (status 423) from atomicStore.
 */
export async function writeBackgroundMusicConfig(characterId, patch) {
    const file = superPowersPath(characterId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    let written = null;
    await updateJsonUnderLock(file, (fileConfig) => {
        const merged = normalizeConfig({ ...(fileConfig.backgroundMusic || {}), ...(patch || {}) });
        fileConfig.backgroundMusic = merged;
        written = merged;
        return fileConfig;
    });
    return written;
}

// ---------------------------------------------------------------------------
// Default runtime probes (lazy imports keep this module cheap to load)
// ---------------------------------------------------------------------------

function defaultDeps() {
    let wsSvc, queue, playback, loopSvc, library, lurk;
    const load = async () => {
        if (!playback) playback = (await import('./serverPlaybackService.js')).default;
        if (!loopSvc) loopSvc = (await import('./audioLoopService.js')).default;
        if (!library) library = (await import('./audioLibraryService.js')).default;
        if (!queue) queue = await import('./scenes/sceneQueue.js');
        if (!wsSvc) wsSvc = (await import('./elevenLabsWebSocketService.js')).default;
        if (!lurk) lurk = (await import('./lurkStateService.js')).default;
    };
    return {
        readConfig: readBackgroundMusicConfig,
        now: () => Date.now(),
        async probe(characterId) {
            await load();
            let conversationActive = false;
            try { conversationActive = !!wsSvc.hasActiveSession(characterId); } catch (_) { /* treat as none */ }
            let queueRunning = false;
            try { queueRunning = !!(queue.getStatus(characterId) || {}).running; } catch (_) { /* none */ }
            let otherAudioUntil = 0;
            try {
                const last = playback.getLastPlay();
                if (last && last.ts && (last.characterId == null || Number(last.characterId) === Number(characterId))) {
                    // MP3 at ~128 kbps => bytes*8/128 ms. Streamed chunks refresh ts, so
                    // continuous speech keeps extending this.
                    const est = last.streamed > 0 ? Math.round(last.streamed * 8 / 128) : UNKNOWN_PLAYBACK_MS;
                    otherAudioUntil = last.ts + est;
                }
            } catch (_) { /* none */ }
            let lurkState = null;
            try { lurkState = lurk.getGateState(characterId); } catch (_) { /* no machine: legacy, ungated */ }
            return {
                lurkState,
                muted: !!playback.isSpeakerMuted(),
                conversationActive,
                queueRunning,
                otherAudioUntil
            };
        },
        async resolveTrack(audioId) {
            await load();
            let item = await library.getAudioById(audioId);
            if (!item) {
                const all = await library.getAudioFiles({});
                item = (all.audio || []).find(a => a.filename === audioId) || null;
            }
            if (!item || !item.filename) return null;
            const file = library.getAudioFilePath(item.filename);
            try { await fs.access(file); } catch (_) { return null; }
            return { file, title: item.title || item.filename };
        },
        async resolveDevice(characterId) {
            await load();
            try { return await playback._resolveDeviceId({ characterId }); } catch (_) { return 'default'; }
        },
        async play(file, opts) {
            await load();
            return loopSvc.playTrack(file, opts);
        }
    };
}

// A paused track's ffmpeg decoder could survive its SIGTERM: once pw-play is
// gone nobody drains ffmpeg's stdout, ffmpeg blocks in write() and never acts
// on the signal. On one node on 2026-10-09 thirty of them held 2.8 GB of RSS — one
// per pause. The supervisor now pauses on every wake, so it makes sure its own
// two PIDs are gone: SIGKILL after a grace, only if the PID is still one of
// the pipeline's own programs (no PID-reuse accidents).
const REAP_GRACE_MS = 2000;
function reapStragglers(pids) {
    if (!Array.isArray(pids) || pids.length === 0) return;
    if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') return;
    const t = setTimeout(async () => {
        for (const pid of pids) {
            try {
                const cmd = await fs.readFile(`/proc/${pid}/cmdline`, 'utf8');
                if (!/ffmpeg|pw-play/.test(cmd)) continue;
                const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '');
                if (/\) Z /.test(stat)) continue; // zombie: already dead, awaiting reap
                process.kill(pid, 'SIGKILL');
                console.warn(`🎵 background music: decoder pid ${pid} ignored SIGTERM — killed`);
            } catch (_) { /* already gone */ }
        }
    }, REAP_GRACE_MS);
    if (t.unref) t.unref();
}

// ---------------------------------------------------------------------------
// Supervisor
// ---------------------------------------------------------------------------

export class BackgroundMusicSupervisor {
    constructor(characterId, deps = defaultDeps()) {
        this.characterId = Number(characterId);
        this.deps = deps;
        this.rotation = new TrackRotation([], { random: deps.random || Math.random });
        this.config = normalizeConfig(null);
        this._configAt = 0;
        this._timer = null;
        this._ticking = false;
        this._handle = null;         // live playTrack handle
        this._handleTrack = null;    // audioId the handle is playing
        this._offsetMs = 0;          // resume point within the current track
        this._lastBlockedAt = 0;
        this._reason = null;
        this._quickFails = 0;
        this._retryAfter = 0;
        this._stopped = true;
        this._operatorPaused = false;
    }

    /** Stop-All / panic: silence now, keep the supervisor, wait for resume(). */
    pause(reason = 'stop-all') {
        this._operatorPaused = true;
        this._pauseReason = reason;
        this._pause();
    }

    /** Clear an operator pause; the next tick decides whether to play. */
    resume() {
        this._operatorPaused = false;
        this._pauseReason = null;
        this._lastBlockedAt = this.deps.now(); // resume after resumeDelayMs, not abruptly
    }

    start() {
        if (this._timer) return;
        this._stopped = false;
        this._lastBlockedAt = this.deps.now(); // first play waits resumeDelayMs after boot/enable
        this._timer = setInterval(() => { this.tick().catch(e => console.error('🎵 tick error:', e.message)); }, TICK_MS);
        if (this._timer.unref) this._timer.unref();
        this.tick().catch(e => console.error('🎵 tick error:', e.message));
    }

    stop() {
        this._stopped = true;
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        this._halt();
        this._offsetMs = 0;
    }

    invalidateConfig() { this._configAt = 0; }

    async _loadConfig() {
        const now = this.deps.now();
        if (now - this._configAt < CONFIG_TTL_MS && this._configAt) return this.config;
        this.config = normalizeConfig(await this.deps.readConfig(this.characterId));
        this._configAt = now;
        this.rotation.setTracks(this.config.tracks, this.config.shuffle);
        // A track removed from the list must not keep playing.
        if (this._handleTrack != null && !this.config.tracks.includes(this._handleTrack)) {
            this._halt();
            this._offsetMs = 0;
        }
        return this.config;
    }

    async tick() {
        if (this._ticking || this._stopped) return;
        this._ticking = true;
        try {
            const cfg = await this._loadConfig();
            const now = this.deps.now();
            const p = cfg.enabled ? await this.deps.probe(this.characterId) : {};
            const otherAudioActive = (p.otherAudioUntil || 0) > now;
            if (p.conversationActive || p.queueRunning || otherAudioActive) this._lastBlockedAt = now;
            // Other playback reports when it ENDS; count the resume delay from
            // then, not from whichever tick last happened to see it.
            else if (p.otherAudioUntil) this._lastBlockedAt = Math.max(this._lastBlockedAt, p.otherAudioUntil);
            // While held off by lurk state, keep the resume delay running so
            // music does not cut in the instant a conversation ends.
            if (p.lurkState != null && p.lurkState !== 'lurking') this._lastBlockedAt = now;
            const decision = shouldPlay({
                enabled: cfg.enabled,
                hasTracks: cfg.tracks.length > 0,
                operatorPaused: this._operatorPaused,
                lurkState: p.lurkState,
                muted: p.muted,
                inQuietHours: isInQuietHours(cfg.quietHours, new Date(now)),
                conversationActive: p.conversationActive,
                queueRunning: p.queueRunning,
                otherAudioActive,
                msSinceBlocked: now - this._lastBlockedAt,
                resumeDelayMs: cfg.resumeDelayMs
            });
            if (decision.reason !== this._reason) {
                // Transitions only — never a line per tick on an SD card.
                if (decision.reason !== 'resume-delay') {
                    console.log(`🎵 Background music (char ${this.characterId}): ${this._reason || 'start'} → ${decision.reason}`);
                }
                this._reason = decision.reason;
            }
            if (!decision.play) {
                if (this._handle) this._pause();
                return;
            }
            if (!this._handle && now >= this._retryAfter) await this._startCurrent(cfg);
        } finally {
            this._ticking = false;
        }
    }

    _halt() {
        const h = this._handle;
        this._handle = null;
        this._handleTrack = null;
        if (h) {
            try { h.stop(); } catch (e) { console.error('🎵 stop failed:', e.message); }
            reapStragglers(h.pids);
        }
    }

    _pause() {
        const h = this._handle;
        if (h) this._offsetMs += Math.max(0, this.deps.now() - h.startedAt);
        this._halt();
    }

    async _startCurrent(cfg) {
        const audioId = this.rotation.current();
        if (audioId == null) return;
        const resolved = await this.deps.resolveTrack(audioId);
        if (!resolved) {
            console.warn(`🎵 Background music (char ${this.characterId}): track ${audioId} not found in the audio library — skipping`);
            this._noteFailure();
            this.rotation.advance();
            this._offsetMs = 0;
            return;
        }
        const deviceId = await this.deps.resolveDevice(this.characterId);
        // Re-check after the awaits: a stop() or a newer start may have landed.
        if (this._stopped || this._handle) return;
        const handle = await this.deps.play(resolved.file, {
            deviceId,
            volume: cfg.volume,
            offsetMs: this._offsetMs,
            label: `bg-music char ${this.characterId}`
        });
        if (this._stopped) { try { handle.stop(); } catch (_) { /* noop */ } return; }
        this._handle = handle;
        this._handleTrack = audioId;
        handle.done.then((result) => this._onTrackEnd(handle, audioId, result || {}))
            .catch(e => console.error('🎵 track end handling failed:', e.message));
    }

    _noteFailure() {
        this._quickFails += 1;
        if (this._quickFails >= MAX_QUICK_FAILS) {
            console.warn(`🎵 Background music (char ${this.characterId}): ${this._quickFails} failures in a row — backing off ${FAIL_BACKOFF_MS / 1000}s`);
            this._retryAfter = this.deps.now() + FAIL_BACKOFF_MS;
            this._quickFails = 0;
        }
    }

    _onTrackEnd(handle, audioId, result) {
        if (this._handle !== handle) return; // owner already paused/stopped it
        const ranMs = this.deps.now() - handle.startedAt;
        this._handle = null;
        this._handleTrack = null;
        if (result.stoppedByOwner) return;
        if (result.code === 0) {
            // Natural end of the track: on to the next.
            this._quickFails = 0;
            this._offsetMs = 0;
            this.rotation.advance();
            return;
        }
        if (ranMs < QUICK_FAIL_MS) {
            // Died on arrival (bad file, no sink): skip it rather than retry-storm.
            this._noteFailure();
            this._offsetMs = 0;
            this.rotation.advance();
            return;
        }
        // Killed from outside (another caller's pkill): resume this track where
        // it was once the speaker is ours again.
        this._quickFails = 0;
        this._offsetMs += ranMs;
        this._lastBlockedAt = this.deps.now();
    }

    getStatus() {
        return {
            characterId: this.characterId,
            running: !this._stopped,
            playing: !!this._handle,
            state: this._reason,
            paused: !!this._operatorPaused,
            pauseReason: this._pauseReason || null,
            track: this._handleTrack || this.rotation.current(),
            offsetMs: this._offsetMs,
            config: this.config
        };
    }
}

// ---------------------------------------------------------------------------
// Service singleton: one supervisor per character
// ---------------------------------------------------------------------------

class BackgroundMusicService {
    constructor() {
        this._supervisors = new Map();
    }

    /** Start (or keep) the supervisor for a character. Idempotent. */
    start(characterId, deps) {
        this._hookStopAll();
        const key = String(characterId);
        let sup = this._supervisors.get(key);
        if (!sup) {
            sup = new BackgroundMusicSupervisor(characterId, deps);
            this._supervisors.set(key, sup);
        }
        sup.invalidateConfig();
        if (sup._operatorPaused) sup.resume();
        sup.start();
        return sup.getStatus();
    }

    /**
     * Stop-All / panic: every supervisor goes silent and stays paused until
     * resume() (next entry into lurking, Lurk ON, a config save). The
     * supervisors survive — before, a single "Stop Audio" ended music until
     * the next reboot.
     */
    pauseAll(reason = 'stop-all') {
        let n = 0;
        for (const sup of this._supervisors.values()) { sup.pause(reason); n += 1; }
        return n;
    }

    /**
     * Clear an operator pause and make sure the supervisor runs when the
     * character has music configured. Called by the lurk state machine on
     * every entry into lurking.
     */
    async resume(characterId) {
        const cfg = await readBackgroundMusicConfig(characterId);
        if (!cfg.enabled) return { resumed: false, reason: 'disabled' };
        const sup = this._supervisors.get(String(characterId));
        if (sup) {
            sup.resume();
            sup.invalidateConfig();
            if (sup._stopped) sup.start();
            this._hookStopAll();
        } else {
            this.start(characterId);
        }
        await this.nudge(characterId);
        return { resumed: true };
    }

    /** Evaluate the play gate now rather than on the next tick. */
    async nudge(characterId) {
        const sup = this._supervisors.get(String(characterId));
        if (!sup) return false;
        await sup.tick();
        return true;
    }

    _hookStopAll() {
        if (this._hooked) return;
        this._hooked = true;
        import('./audioLoopService.js')
            .then(m => m.default.onStopAll(() => {
                const n = this.pauseAll('stop-all');
                if (n) console.log('🎵 Stop-all audio: background music paused (resumes on the next return to lurking)');
            }))
            .catch(e => console.error('🎵 could not hook stop-all:', e.message));
    }

    stop(characterId) {
        const key = String(characterId);
        const sup = this._supervisors.get(key);
        if (!sup) return false;
        sup.stop();
        this._supervisors.delete(key);
        return true;
    }

    stopAll() {
        for (const key of Array.from(this._supervisors.keys())) this.stop(key);
    }

    /** Start or stop to match the stored config. */
    async applyConfig(characterId) {
        const cfg = await readBackgroundMusicConfig(characterId);
        if (cfg.enabled) this.start(characterId);
        else this.stop(characterId);
        return cfg;
    }

    getStatus(characterId) {
        const sup = this._supervisors.get(String(characterId));
        return sup ? sup.getStatus() : { characterId: Number(characterId), running: false, playing: false, state: 'stopped' };
    }
}

const backgroundMusicService = new BackgroundMusicService();
export default backgroundMusicService;
