/**
 * Lurk state machine — ONE per node.
 *
 * Operator brief (2026-10-09, decision D3 of
 * docs/development/missions/2026-10-castle-tuning/MISSION.md): while waiting for
 * guests every animatronic moves occasionally, those with a camera and a pan
 * servo track heads, and NOBODY SPEAKS until woken by the PIR, a scheduled event
 * or AI mode being turned on. AI mode turns on every capability the character's
 * parts support. Background music (where a character has it configured) plays
 * while lurking and pauses on any wake.
 *
 * Why one machine. Before this, two features called "lurk" (lurk mode and motion
 * mode) shared one PIR watcher and replaced each other's callbacks; sleep turned
 * movement and head tracking OFF, so a character waited for guests motionless and
 * blind; wake/sleep wrote the operator's saved settings into super-powers.json,
 * which a locked character refuses, so on PumpkinHead and Sir Dragomir a wake did
 * nothing at all; and nothing restored lurk at boot. See
 * docs/development/missions/2026-10-castle-tuning/recon-lurk.md for the map.
 *
 * States
 *   lurking  The default and the boot state. Idle loop over idle-tagged poses,
 *            head tracking where a webcam and a pan servo exist, the PIR armed,
 *            background music where configured (the music supervisor gates itself
 *            on this state). This machine makes no sound in this state.
 *   awake    AI mode. Headless agent session + jaw sync + LED sync + head
 *            tracking + AI motion/gestures + follow orders, each only where the
 *            parts support it. Returns to the resting state after inactivity
 *            (default 5 min). Activity: PIR motion, guest speech, agent speech,
 *            agent audio still draining, operator chat.
 *   off      Operator-disarmed (Lurk OFF, panic). Nothing autonomous runs and the
 *            PIR is ignored. Explicit wakes (AI on, POST /wake, a schedule) still
 *            work and come back here afterwards. A restart lands in lurking.
 *
 * Runtime only. Wake and sleep never write super-powers.json. Capability
 * switches are in-memory runtime toggles (characterConfigLock runtimeToggles —
 * the overlay the jaw/LED readers and readAiMotionConfig already honour), so a
 * LOCKED character wakes fully. The machine's own state and preferences live in
 * data/character-<id>/lurk-state.json, which the config lock treats as runtime
 * state and the deploy excludes (data/character-*\/*-state.json).
 */

import fs from 'fs/promises';
import path from 'path';
import { writeJsonAtomic } from './atomicStore.js';
import { isInQuietHours } from './backgroundMusicService.js';
import { resolveCharacterDataDir } from './characterService.js';
import { forgetRuntimeToggle, rememberRuntimeToggle, runtimeToggleOverride } from './characterConfigLock.js';
import { DEFAULT_MIN_RMS, MAX_MIN_RMS, MIN_MIN_RMS, isOwnEcho, stripSoundAnnotations } from './speechWakeService.js';

export const STATE_FILE = 'lurk-state.json';

export const STATES = Object.freeze({ LURKING: 'lurking', AWAKE: 'awake', OFF: 'off' });
const { LURKING, AWAKE, OFF } = STATES;

export const DEFAULT_INACTIVITY_MS = 5 * 60 * 1000;
export const MIN_INACTIVITY_MS = 30 * 1000;
export const MAX_INACTIVITY_MS = 2 * 60 * 60 * 1000;
// A PIR wake starts a billed ElevenLabs agent session. If no guest says anything
// within this window it was not a guest (one node's PIR woke it 22 times in an
// evening; four of those sessions ran the whole no-guest ceiling to an empty yard
// and one hit the provider's maximum call duration). 0 disables the check.
export const DEFAULT_WAKE_GUEST_GRACE_MS = 90 * 1000;
export const MIN_WAKE_GUEST_GRACE_MS = 15 * 1000;
export const MAX_WAKE_GUEST_GRACE_MS = 30 * 60 * 1000;
// After such a wake, the PIR is ignored this long so a noisy sensor cannot open
// session after session.
export const WAKE_GUEST_COOLDOWN_MS = 2 * 60 * 1000;
// Same window callouts, lurk scenes and background music default to: a cat at
// 03:00 must not open an agent session that greets the household. Speech wake
// honours it too (a television through an open window at 02:00).
export const DEFAULT_PIR_QUIET_HOURS = Object.freeze({ start: '23:00', end: '08:00' });

// Speech wake (services/speechWakeService.js). Each local candidate costs one
// short batch Scribe call before it may wake the node, so the confirmations are
// budgeted: never two at once, a breather between them, and a ceiling per hour
// that a yard full of chatter cannot exceed (~60 x 3 s = 3 min of audio/hour).
export const SPEECH_CONFIRM_MIN_GAP_MS = 4 * 1000;
export const SPEECH_CONFIRMS_PER_HOUR = 60;
// A speech wake that no guest answers was the neighbours or the music. The
// rest after one doubles with every such wake in a row (2, 4, 8 ... 30 min) and
// resets as soon as a wake finds a real guest.
export const SPEECH_FALSE_WAKE_COOLDOWN_MS = 2 * 60 * 1000;
export const SPEECH_FALSE_WAKE_COOLDOWN_MAX_MS = 30 * 60 * 1000;
// The character's own lines heard back within this long are its echo, not a guest.
const OWN_ECHO_WINDOW_MS = 20 * 1000;

// A floating PIR line reads HIGH at start-up and used to fire a wake during the
// busiest moment of boot — PumpkinHead's self-sustaining reset loop
// (KNOWN-BUGS.md, 2026-09-21). Motion is ignored for this long after boot...
const PIR_BOOT_GRACE_MS = envMs('MB_PIR_BOOT_GRACE_MS', 60 * 1000);
// ...and for a moment after every (re)arm, because the watcher reports the
// line's INITIAL level as a transition: a re-arm with the line high would
// otherwise wake immediately.
const PIR_ARM_GRACE_MS = 5 * 1000;
// The lurk stack (idle loop, head tracking, PIR) starts this long after boot so
// the webcam stream is up and the boot inrush is over. Same delay the always-on
// head-tracking start used.
const LURK_BOOT_DELAY_MS = envMs('MB_LURK_BOOT_DELAY_MS', 15 * 1000);

// A wake used to fire every subsystem at once, and on a node with a marginal
// supply that step load resets the board (PumpkinHead, Pi 4: reproducible and
// total — the journal just ends). The bisect named the SIMULTANEITY: each
// subsystem survives alone, a wake with the agent already running survives, and
// a wake that COLD-STARTS the agent on top of a running lurk stack resets him
// 2/2. So the movers pause, the agent goes first and alone, and everything else
// follows after a settle. A quarter second is nothing to a guest at the door.
const WAKE_SETTLE_MS = 250;
// After pausing the idle loop: long enough for a motor command already in
// flight (idle sway poses run ~1.2 s) to wind down before the agent's inrush.
const PRE_AGENT_SETTLE_MS = 750;

// Reply audio still draining from the speaker means the conversation is not
// over, whatever the timers say.
const AUDIO_ACTIVITY_GRACE_MS = 3000;
// Room reverb and a concurrent audio step can outlast the scene that played them.
const SCENE_AUDIO_TAIL_MS = 2500;
const UNKNOWN_PLAYBACK_MS = 4000;

// Agent speech counts as activity, but an agent that keeps answering room
// noise (or its own echo) would then keep a node awake — and billed — all
// night. So with no GUEST activity (real guest speech, an explicit wake,
// operator chat) for this many inactivity timeouts, the node returns to
// lurking anyway, still never while reply audio is draining. PIR motion is NOT
// guest evidence here: on one node on 2026-10-10 the PIR fired every ~5 s for half
// an hour (even with idle loop and head tracking held still) and, counted as a
// guest, kept an agent talking to room noise awake indefinitely.
export const NO_GUEST_CEILING_FACTOR = 3;

/** Is this activity kind evidence of a guest/operator (vs. the agent, the speaker or the PIR)? */
export function isGuestActivity(kind) {
    return !/^(agent|speaker-audio|motion|speech:character|speech:system)/i.test(String(kind || ''));
}

// A machine built without a speech-wake dependency (unit tests, a minimal
// harness) has no microphone listening and nothing to hand off.
const NO_SPEECH_WAKE = Object.freeze({
    start: async () => ({ wanted: false, skipped: 'no speech-wake dependency' }),
    stop: async () => {},
    yieldMic: async () => {},
    statusSync: () => null,
    confirm: async () => '',
    recordGuest: () => {},
    handOff: async () => ({ sent: false, reason: 'no speech-wake dependency' })
});

// Throttle for "motion ignored" lines: a floating line can fire every second.
const IGNORED_MOTION_LOG_MS = 10 * 60 * 1000;

// Fleet events (a ceremony, a shared song) hold every node still while scenes
// own the servos and the speaker. A conductor that crashes mid-event must not
// leave a node frozen, so a hold releases itself after this long.
export const EVENT_HOLD_MAX_MS = envMs('MB_EVENT_HOLD_MAX_MS', 10 * 60 * 1000);
// An awake node with no guest speech in this long is not in a conversation; a fleet event may put it
// to sleep for the show instead of letting its agent answer the show's own lines.
const EVENT_HOLD_GUEST_IDLE_MS = 60 * 1000;
const EVENT_HOLD_MIN_MS = 10 * 1000;
const EVENT_HOLD_CAP_MS = 2 * 60 * 60 * 1000;

/** The super-powers flags AI mode switches, as runtime-toggle keys. */
export const RUNTIME_KEYS = Object.freeze({
    jaw: 'jawAnimation.enabled',
    led: 'jawAnimation.ledSync.enabled',
    aiMotion: 'aiMotion.enabled',
    followOrders: 'followOrders.enabled'
});

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Capabilities an operator may opt a node out of (prefs.capabilityOptOut in
 * lurk-state.json) without touching the character's configuration — e.g. a
 * part that is physically fine but must not run autonomously tonight.
 */
export const OPTABLE_CAPABILITIES = Object.freeze(['agent', 'jaw', 'led', 'headTracking', 'aiMotion', 'followOrders', 'idle']);

function envMs(name, fallback) {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function isTestMode() {
    return process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true';
}

function toId(value) {
    if (value == null || value === '') return null;
    const n = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function normType(type) {
    return String(type || '').toLowerCase().replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

function validQuietHours(qh) {
    return !!(qh && typeof qh === 'object' && !Array.isArray(qh)
        && HHMM.test(String(qh.start || '').trim()) && HHMM.test(String(qh.end || '').trim()));
}

/**
 * Normalize stored/patched preferences into a complete, safe set. A hand edit
 * that slipped something odd in falls back to the defaults rather than, say, a
 * 10 ms inactivity timeout that would hang up on every guest.
 */
export function normalizePrefs(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const t = Number(src.inactivityTimeoutMs);
    let inactivityTimeoutMs = DEFAULT_INACTIVITY_MS;
    if (Number.isFinite(t)) {
        // 0 = never sleep on inactivity (operator's explicit choice — the agent
        // session then stays open until AI is switched off).
        inactivityTimeoutMs = t === 0 ? 0 : Math.min(MAX_INACTIVITY_MS, Math.max(MIN_INACTIVITY_MS, Math.round(t)));
    }
    const g = Number(src.wakeGuestGraceMs);
    let wakeGuestGraceMs = DEFAULT_WAKE_GUEST_GRACE_MS;
    if (Number.isFinite(g)) {
        wakeGuestGraceMs = g === 0 ? 0 : Math.min(MAX_WAKE_GUEST_GRACE_MS, Math.max(MIN_WAKE_GUEST_GRACE_MS, Math.round(g)));
    }
    let pirQuietHours;
    if (src.pirQuietHours === null) pirQuietHours = null;
    else if (validQuietHours(src.pirQuietHours)) {
        pirQuietHours = { start: String(src.pirQuietHours.start).trim(), end: String(src.pirQuietHours.end).trim() };
    } else pirQuietHours = { ...DEFAULT_PIR_QUIET_HOURS };
    return {
        inactivityTimeoutMs,
        wakeGuestGraceMs,
        // Default ON: the PIR is a wake source unless the operator switched it off
        // (a dead or floating sensor). A sensor listed in physical-faults.json is
        // never armed regardless.
        pirWake: src.pirWake !== false,
        // Default OFF (opt-in), unlike the PIR: on 2026-10-26 five characters in
        // the yard woke each other off their own greetings within a minute, and
        // isOwnEcho only rejects a node's OWN lines, not a peer's. Stays opt-in
        // until a peer's recent speech is rejected too. speechWakeMinRms is the
        // detector's floor for this node's mic.
        speechWake: src.speechWake === true,
        speechWakeMinRms: normalizeMinRms(src.speechWakeMinRms),
        pirQuietHours,
        capabilityOptOut: Array.isArray(src.capabilityOptOut)
            ? [...new Set(src.capabilityOptOut.filter(c => OPTABLE_CAPABILITIES.includes(c)))]
            : [],
        // Who owns the pan servo while LURKING. 'track' (default): head tracking,
        // as before. 'idle': tracking stops on entering lurk and the idle loop's
        // head poses sweep the head slowly; a wake still starts tracking. Operator
        // 2026-10-24: a lurking head (char 3) jerked after every flicker of motion in
        // the yard instead of panning slowly.
        lurkHead: LURK_HEAD_MODES.includes(src.lurkHead) ? src.lurkHead : 'track'
    };
}

function normalizeMinRms(value) {
    const n = Number(value);
    if (value == null || !Number.isFinite(n)) return DEFAULT_MIN_RMS;
    return Math.min(MAX_MIN_RMS, Math.max(MIN_MIN_RMS, n));
}

/** Mark opted-out capabilities unavailable (with the reason) — never mutates the input. */
export const LURK_HEAD_MODES = Object.freeze(['track', 'idle']);

export function applyOptOut(caps = {}, optOut = []) {
    if (!Array.isArray(optOut) || optOut.length === 0) return caps;
    const out = { ...caps };
    for (const name of optOut) {
        if (out[name] && out[name].available) {
            out[name] = { ...out[name], available: false, reason: 'opted out (lurk-state.json capabilityOptOut)' };
        }
    }
    return out;
}

/** Validate a preferences patch. Returns human-readable errors (empty = ok). */
export function validatePrefsPatch(raw) {
    const errors = [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['body must be an object'];
    if (raw.inactivityTimeoutMs !== undefined) {
        const n = Number(raw.inactivityTimeoutMs);
        if (raw.inactivityTimeoutMs === null || !Number.isFinite(n) || n < 0 || n > MAX_INACTIVITY_MS) {
            errors.push(`inactivityTimeoutMs must be 0 (never) or between ${MIN_INACTIVITY_MS} and ${MAX_INACTIVITY_MS}`);
        }
    }
    if (raw.wakeGuestGraceMs !== undefined) {
        const n = Number(raw.wakeGuestGraceMs);
        if (raw.wakeGuestGraceMs === null || !Number.isFinite(n) || n < 0 || n > MAX_WAKE_GUEST_GRACE_MS) {
            errors.push(`wakeGuestGraceMs must be 0 (off) or between ${MIN_WAKE_GUEST_GRACE_MS} and ${MAX_WAKE_GUEST_GRACE_MS}`);
        }
    }
    if (raw.pirWake !== undefined && typeof raw.pirWake !== 'boolean') errors.push('pirWake must be a boolean');
    if (raw.speechWake !== undefined && typeof raw.speechWake !== 'boolean') errors.push('speechWake must be a boolean');
    if (raw.speechWakeMinRms !== undefined) {
        const n = Number(raw.speechWakeMinRms);
        if (raw.speechWakeMinRms === null || !Number.isFinite(n) || n < MIN_MIN_RMS || n > MAX_MIN_RMS) {
            errors.push(`speechWakeMinRms must be between ${MIN_MIN_RMS} and ${MAX_MIN_RMS}`);
        }
    }
    if (raw.pirQuietHours !== undefined && raw.pirQuietHours !== null && !validQuietHours(raw.pirQuietHours)) {
        errors.push('pirQuietHours must be null or { start: "HH:MM", end: "HH:MM" }');
    }
    if (raw.lurkHead !== undefined && !LURK_HEAD_MODES.includes(raw.lurkHead)) {
        errors.push(`lurkHead must be one of: ${LURK_HEAD_MODES.join(', ')}`);
    }
    if (raw.capabilityOptOut !== undefined && (!Array.isArray(raw.capabilityOptOut)
        || raw.capabilityOptOut.some(c => !OPTABLE_CAPABILITIES.includes(c)))) {
        errors.push(`capabilityOptOut must be an array of: ${OPTABLE_CAPABILITIES.join(', ')}`);
    }
    return errors;
}

/**
 * What one PIR edge (or a simulated one), or one confirmed guest utterance
 * (source 'speech'), should do.
 * @returns {{action: 'wake'|'activity'|'ignore', reason: string}}
 */
export function decideMotion(s = {}) {
    // Awake: motion is activity — except a PIR edge in quiet hours, which must
    // not keep a node (and its billed agent session) awake all night on a
    // twitchy sensor. Real guest speech still counts, through the conversation.
    if (s.state === AWAKE) {
        if (s.source === 'pir' && s.inQuietHours) return { action: 'ignore', reason: 'quiet-hours' };
        return { action: 'activity', reason: 'awake' };
    }
    if (s.state !== LURKING) return { action: 'ignore', reason: 'not-lurking' };
    // A fleet event owns this node until it releases: a guest walking past the
    // ceremony must not start an agent session in the middle of it.
    if (s.eventHold && !s.force) return { action: 'ignore', reason: 'event-hold' };
    if (s.source === 'pir' && s.pirWake === false && !s.force) return { action: 'ignore', reason: 'pir-wake-off' };
    if (s.source === 'speech' && s.speechWake === false && !s.force) return { action: 'ignore', reason: 'speech-wake-off' };
    if (s.force) return { action: 'wake', reason: 'forced' };
    if (s.inBootGrace) return { action: 'ignore', reason: 'boot-grace' };
    // After a no-guest sleep, the same restless PIR (or chattering yard) would
    // wake the node again at once; the source gets a rest first.
    if (isSensorSource(s.source) && s.inRewakeCooldown) return { action: 'ignore', reason: 'rewake-cooldown' };
    if (s.inArmGrace) return { action: 'ignore', reason: 'arm-grace' };
    if (s.inQuietHours) return { action: 'ignore', reason: 'quiet-hours' };
    return { action: 'wake', reason: s.source === 'speech' ? 'speech' : 'motion' };
}

/** A wake the node's own sensors fired (PIR, microphone), as opposed to an operator or schedule. */
export function isSensorSource(source) {
    return source === 'pir' || source === 'speech';
}

/**
 * The rest a speech source gets after its Nth no-guest wake in a row:
 * 2, 4, 8, 16, 30, 30 ... minutes.
 */
export function speechFalseWakeCooldownMs(streak) {
    const n = Math.max(1, Math.floor(Number(streak) || 1));
    return Math.min(SPEECH_FALSE_WAKE_COOLDOWN_MAX_MS, SPEECH_FALSE_WAKE_COOLDOWN_MS * 2 ** Math.min(n - 1, 10));
}

/**
 * May one more Scribe confirmation run now? Pure: `times` are the start times
 * of earlier confirmations (any age; only the last hour counts).
 */
export function speechConfirmBudget({ now, times = [], inFlight = false }) {
    if (inFlight) return { ok: false, reason: 'confirm-in-flight' };
    const recent = times.filter(t => now - t < 60 * 60 * 1000);
    const last = recent.length ? Math.max(...recent) : null;
    if (last != null && now - last < SPEECH_CONFIRM_MIN_GAP_MS) return { ok: false, reason: 'confirm-rate', recent };
    if (recent.length >= SPEECH_CONFIRMS_PER_HOUR) return { ok: false, reason: 'confirm-budget', recent };
    return { ok: true, recent };
}

/**
 * When does a sensor wake (PIR or speech) that no guest has answered run out?
 * Null when the check does not apply: an explicit wake (AI button, schedule,
 * fleet), a guest already heard, or the window switched off. A speech wake's
 * own trigger line is recorded BEFORE the wake, so it does not count as the
 * guest answering.
 */
export function wakeGuestDeadline({ wake, since, lastGuestAt, wakeGuestGraceMs }) {
    if (!wake || !isSensorSource(wake.source) || wake.explicit || !wakeGuestGraceMs) return null;
    if (!Number.isFinite(since)) return null;
    if (Number.isFinite(lastGuestAt) && lastGuestAt > since) return null;
    return since + wakeGuestGraceMs;
}

/** Where an awake character goes when AI mode ends. */
export function restingStateFor(armed) {
    return armed ? LURKING : OFF;
}

/** An event hold's duration request, clamped; anything unusable means the default. */
export function clampHoldMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return EVENT_HOLD_MAX_MS;
    return Math.min(EVENT_HOLD_CAP_MS, Math.max(EVENT_HOLD_MIN_MS, Math.round(n)));
}

/** ms until an awake character is due to sleep, or null when it never sleeps. */
export function sleepInMs({ now, lastActivityAt, inactivityTimeoutMs }) {
    if (!inactivityTimeoutMs) return null;
    return Math.max(0, (Number(lastActivityAt) || now) + inactivityTimeoutMs - now);
}

/**
 * One-line summary of a transition's per-capability results for the log, e.g.
 * "agent:on jaw:on led:n/a(no LED ring) head:on aiMotion:on orders:on idle:on".
 */
export function summarizeResults(results = {}) {
    const order = [
        ['agent', 'agent'], ['jaw', 'jaw'], ['led', 'led'], ['headTracking', 'head'],
        ['aiMotion', 'aiMotion'], ['followOrders', 'orders'], ['randomPoses', 'sway'],
        ['idle', 'idle'], ['pir', 'pir'], ['speech', 'speech'], ['music', 'music']
    ];
    const parts = [];
    for (const [key, label] of order) {
        const r = results[key];
        if (!r) continue;
        const on = r.enabled === true || r.armed === true || r.resumed === true || r.listening === true;
        let text = `${label}:${on ? 'on' : 'off'}`;
        if (!on && (r.reason || r.error)) text = `${label}:n/a(${r.reason || r.error})`;
        if (on && r.error) text += `(${r.error})`;
        parts.push(text);
    }
    return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Capability detection — what THIS character's own parts support
// ---------------------------------------------------------------------------

/**
 * The head-tracking pan servo: the saved panServoId when it names a real,
 * enabled part, else a servo whose NAME says it pans. No blind first-servo
 * fallback — that could hand the jaw to the tracker as the pan axis.
 */
export function findPanServo(parts, savedConfig) {
    const list = Array.isArray(parts) ? parts : [];
    if (savedConfig && savedConfig.panServoId != null) {
        const saved = list.find(p => String(p.id) === String(savedConfig.panServoId) && p.enabled !== false);
        if (saved) return saved.id;
    }
    const servos = list.filter(p => normType(p.type) === 'servo' && p.enabled !== false);
    const pan = servos.find(s => /pan|head|swivel/i.test(String(s.name || '')));
    return pan ? pan.id : null;
}

/**
 * Idle-tagged poses, and how many of them move at least one part that is not
 * listed broken. A pose with no parts moves nothing and is not usable.
 */
export function countUsableIdlePoses(poses, brokenIds = new Set()) {
    const idle = (Array.isArray(poses) ? poses : []).filter(p => p && Array.isArray(p.tags) && p.tags.includes('idle'));
    const usable = idle.filter(p => Array.isArray(p.parts)
        && p.parts.some(part => part && part.partId != null && !brokenIds.has(String(part.partId))));
    return { usable: usable.length, total: idle.length };
}

/** The character's webcam (legacy entries may carry a characterId field). */
export function findWebcam(parts, characterId) {
    const cams = (Array.isArray(parts) ? parts : [])
        .filter(p => normType(p.type) === 'webcam' && p.enabled !== false);
    return cams.find(p => Number(p.characterId) === Number(characterId)) || cams[0] || null;
}

function defaultCapabilitySources() {
    return {
        async loadParts(id) {
            try {
                const parts = JSON.parse(await fs.readFile(path.join(resolveCharacterDataDir(id), 'parts.json'), 'utf8'));
                return Array.isArray(parts) ? parts : [];
            } catch (_) { return []; }
        },
        async readJaw(id) {
            const m = await import('./jawAnimationSuperPowerService.js');
            return m.readJawConfig(id);
        },
        async readHead(id) {
            const m = await import('./headAnimationSuperPowerService.js');
            return m.readHeadTrackingConfig(id);
        },
        // Count poses explicitly tagged "idle" — the only ones the idle loop
        // will ever pick. (The old check counted ANY pose, so a character with
        // only gesture poses reported idle movement that never happened.) A
        // pose is usable only if it moves at least one part NOT listed broken
        // in config/physical-faults.json: a character whose idle poses all
        // drive dead servos does not "move occasionally" at all.
        async countIdlePoses(id, brokenIds = new Set()) {
            try {
                const { loadPoses } = await import('./poses/poseRepository.js');
                const data = await loadPoses(id);
                return countUsableIdlePoses((data && Array.isArray(data.poses)) ? data.poses : [], brokenIds);
            } catch (_) { return { usable: 0, total: 0 }; }
        },
        async getAgentId(id) {
            try {
                const { default: characterService } = await import('./characterService.js');
                const c = await characterService.getCharacterById(id);
                return c && c.elevenLabsAgentId ? c.elevenLabsAgentId : null;
            } catch (_) { return null; }
        },
        async getFault(id, partId) {
            try {
                const { getPhysicalFault } = await import('./hardwareService/safetyLimits.js');
                return await getPhysicalFault(id, partId);
            } catch (_) { return { broken: false, reason: null }; }
        },
        async movableRoles(parts) {
            const { inferPartRoles } = await import('./followOrders/bodyRoles.js');
            return inferPartRoles(parts.map(p => ({ ...p, partId: String(p.id ?? p.partId) })))
                .filter(r => r.movable || r.role === 'light');
        },
        async canFollowOrders(id) {
            const m = await import('./followOrders/followOrdersSuperPowerService.js');
            return m.canPerform(id);
        },
        async readMusic(id) {
            const m = await import('./backgroundMusicService.js');
            return m.readBackgroundMusicConfig(id);
        }
    };
}

/**
 * Every capability AI mode and lurking can use, from the character's OWN files.
 * Never throws: a source that fails reports the capability unavailable.
 */
export async function detectCapabilities(characterId, src = defaultCapabilitySources()) {
    const id = toId(characterId);
    const caps = {};
    const safe = async (fn, fallback) => { try { return await fn(); } catch (_) { return fallback; } };
    const parts = await safe(() => src.loadParts(id), []);
    const enabled = parts.filter(p => p && p.enabled !== false);
    // Parts listed in config/physical-faults.json: autonomous code must not
    // choose them (a dead jaw stays off, a dead pan servo means no tracking,
    // poses and AI motion only count the parts that still work).
    const brokenIds = new Set();
    for (const p of enabled) {
        if ((await safe(() => src.getFault(id, p.id), { broken: false })).broken === true) brokenIds.add(String(p.id));
    }
    const broken = async (partId) => brokenIds.has(String(partId));
    const working = enabled.filter(p => !brokenIds.has(String(p.id)));

    const agentId = await safe(() => src.getAgentId(id), null);
    caps.agent = agentId
        ? { available: true, agentId }
        : { available: false, reason: 'no ElevenLabs agent assigned' };

    const jaw = await safe(() => src.readJaw(id), null);
    const jawServo = jaw && jaw.servoPartId != null
        ? enabled.find(p => String(p.id) === String(jaw.servoPartId)) : null;
    if (!jawServo) caps.jaw = { available: false, reason: 'no jaw servo configured' };
    else if (await broken(jawServo.id)) caps.jaw = { available: false, partId: jawServo.id, reason: 'jaw servo is listed broken' };
    else caps.jaw = { available: true, partId: jawServo.id };

    const ring = enabled.find(p => normType(p.type) === 'led_ring');
    caps.led = ring ? { available: true, partId: ring.id } : { available: false, reason: 'no LED ring' };

    const cam = findWebcam(enabled, id);
    const head = await safe(() => src.readHead(id), {});
    const panId = cam ? findPanServo(enabled, head) : null;
    if (!cam) caps.headTracking = { available: false, reason: 'no webcam' };
    else if (panId == null) caps.headTracking = { available: false, webcamId: cam.id, reason: 'no pan servo' };
    else if (await broken(panId)) caps.headTracking = { available: false, webcamId: cam.id, panServoId: panId, reason: 'pan servo is listed broken' };
    else caps.headTracking = { available: true, webcamId: cam.id, panServoId: panId, alwaysOn: !!(head && head.alwaysOn === true) };

    const idleRaw = await safe(() => src.countIdlePoses(id, brokenIds), 0);
    const idle = typeof idleRaw === 'number' ? { usable: idleRaw, total: idleRaw } : (idleRaw || { usable: 0, total: 0 });
    if (idle.usable > 0) caps.idle = { available: true, poses: idle.usable, ...(idle.total > idle.usable ? { skippedBroken: idle.total - idle.usable } : {}) };
    else if (idle.total > 0) caps.idle = { available: false, reason: 'every idle pose moves only parts listed broken' };
    else caps.idle = { available: false, reason: 'no poses tagged "idle"' };

    const roles = await safe(() => src.movableRoles(working), []);
    caps.aiMotion = roles.length > 0
        ? { available: true, roles: roles.length }
        : { available: false, reason: brokenIds.size ? 'no working movable parts or lights' : 'no movable parts or lights' };
    if (brokenIds.size) caps.brokenParts = { available: false, partIds: [...brokenIds], reason: 'listed in config/physical-faults.json' };

    const orders = await safe(() => src.canFollowOrders(id), { ok: false, reason: 'unavailable' });
    caps.followOrders = orders && orders.ok
        ? { available: true }
        : { available: false, reason: (orders && orders.reason) || 'cannot perform orders' };

    const sensor = enabled.find(p => normType(p.type) === 'motion_sensor' && p.pin != null);
    if (!sensor) caps.motionSensor = { available: false, reason: 'no motion sensor' };
    else if (await broken(sensor.id)) caps.motionSensor = { available: false, partId: sensor.id, reason: 'motion sensor is listed broken' };
    else caps.motionSensor = { available: true, partId: sensor.id, pin: sensor.pin, part: sensor };

    // Speech wake listens on the character's own microphone and wakes the agent,
    // so it needs both.
    const mic = enabled.find(p => normType(p.type) === 'microphone');
    if (!mic) caps.microphone = { available: false, reason: 'no microphone' };
    else if (await broken(mic.id)) caps.microphone = { available: false, partId: mic.id, reason: 'microphone is listed broken' };
    else if (!caps.agent.available) caps.microphone = { available: false, partId: mic.id, reason: 'no agent to wake' };
    else caps.microphone = { available: true, partId: mic.id };

    const music = await safe(() => src.readMusic(id), null);
    caps.music = music && music.enabled && Array.isArray(music.tracks) && music.tracks.length > 0
        ? { available: true, tracks: music.tracks.length }
        : { available: false, reason: 'no background music configured' };

    return caps;
}

/** The capability map without part objects, for JSON responses and the state file. */
export function publicCapabilities(caps = {}) {
    const out = {};
    for (const [key, value] of Object.entries(caps)) {
        if (!value || typeof value !== 'object') continue;
        const { part, ...rest } = value;
        out[key] = rest;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Head tracking (programmatic — shared by the machine and the boot path)
// ---------------------------------------------------------------------------

/**
 * Start the OpenCV tracker and hand the pan servo to head tracking, from the
 * character's saved config. `reuseRunningTracker` keeps an already-running
 * tracker's camera open (lurking → awake must not reopen the camera).
 */
export async function startHeadTracking(characterId, opts = {}) {
    if (isTestMode()) return { enabled: true, testMode: true };
    const id = toId(characterId);
    try {
        const src = defaultCapabilitySources();
        const parts = await src.loadParts(id);
        const cam = findWebcam(parts, id);
        if (!cam) return { enabled: false, error: 'No webcam found' };
        const savedConfig = opts.savedConfig || await src.readHead(id);
        const panServoId = findPanServo(parts, savedConfig);
        if (panServoId == null) return { enabled: false, error: 'No pan servo found' };

        const mt = await import('../controllers/motionTrackingController.js');
        // The full saved tuning — a start that passed only four keys ran the
        // tracker on default thresholds instead of the character's own.
        const trackingParams = {
            motionThreshold: savedConfig.motionThreshold || 25,
            minContourArea: savedConfig.minContourArea || 3000,
            maxContourArea: savedConfig.maxContourArea || 100000,
            backgroundLearningRate: savedConfig.backgroundLearningRate || 0.005,
            noiseReductionKernelSize: savedConfig.noiseReductionKernelSize || 5,
            blurSize: savedConfig.blurSize || 5,
            dilateSize: savedConfig.dilateSize || 9,
            varThreshold: savedConfig.varThreshold || 25,
            targetLockStrength: savedConfig.targetLockStrength || 5,
            confirmFrames: savedConfig.confirmFrames || 3,
            detectInterval: savedConfig.detectInterval || 5,
            detectionMode: savedConfig.detectionMode || 'person'
        };
        let trackerReused = false;
        if (opts.reuseRunningTracker) {
            try { trackerReused = !!mt.getTrackingStatusForWebcam(cam.id).active; } catch (_) { /* start fresh */ }
        }
        // A camera that fails to open is REPORTED, never swallowed — otherwise
        // the pan servo is claimed for a tracker that is not running and "head
        // tracking just stopped" has no named cause anywhere.
        let trackerError = null;
        if (!trackerReused) {
            try { await mt.startTrackingForWebcam(cam.id, trackingParams); } catch (e) {
                trackerError = e.message;
                console.error(`[Lurk] motion tracker failed to start for webcam ${cam.id}: ${e.message}`);
            }
        }
        mt.enableHeadTrackingForWebcam(cam.id, {
            panServoId,
            characterId: id,
            centerDeg: typeof savedConfig.centerDeg === 'number' ? savedConfig.centerDeg : 0,
            rangeDeg: typeof savedConfig.rangeDeg === 'number' ? savedConfig.rangeDeg : 60,
            invertPan: !!savedConfig.invertPan,
            smoothing: typeof savedConfig.smoothing === 'number' ? savedConfig.smoothing : 0.25,
            deadzone: typeof savedConfig.deadzone === 'number' ? savedConfig.deadzone : 5
        });
        if (trackerError) return { enabled: true, trackerRunning: false, error: 'tracker failed to start: ' + trackerError };
        return trackerReused ? { enabled: true, trackerReused: true } : { enabled: true };
    } catch (e) {
        return { enabled: false, error: e.message };
    }
}

/** Stop head tracking and the tracker process for the character's webcam. */
export async function stopHeadTracking(characterId) {
    if (isTestMode()) return { enabled: false, testMode: true };
    const id = toId(characterId);
    try {
        const parts = await defaultCapabilitySources().loadParts(id);
        const cam = findWebcam(parts, id);
        if (!cam) return { enabled: false, reason: 'no webcam' };
        const mt = await import('../controllers/motionTrackingController.js');
        mt.disableHeadTrackingForWebcam(cam.id);
        try { await mt.stopTrackingForWebcam(cam.id); } catch (_) { /* not running */ }
        return { enabled: false };
    } catch (e) {
        return { enabled: false, error: e.message };
    }
}

// ---------------------------------------------------------------------------
// Default runtime dependencies (lazy imports keep this module cheap to load and
// let unit tests construct the machine without hardware or sockets)
// ---------------------------------------------------------------------------

function defaultDeps() {
    const mods = {};
    const load = async (name, spec) => {
        if (!mods[name]) {
            const m = await import(spec);
            mods[name] = m.default || m;
        }
        return mods[name];
    };
    return {
        now: () => Date.now(),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (t) => clearTimeout(t),
        settle: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
        testMode: isTestMode,
        log: (...a) => console.log(...a),
        warn: (...a) => console.warn(...a),

        async readState(id) {
            try {
                return JSON.parse(await fs.readFile(path.join(resolveCharacterDataDir(id), STATE_FILE), 'utf8'));
            } catch (e) {
                if (e && e.code !== 'ENOENT') console.warn(`[Lurk] could not read ${STATE_FILE} for character ${id}: ${e.message}`);
                return null;
            }
        },
        async writeState(id, state) {
            await writeJsonAtomic(path.join(resolveCharacterDataDir(id), STATE_FILE), state);
        },
        capabilities: (id) => detectCapabilities(id),

        agent: {
            // opts.noGreeting: open without the walk-up greeting (an event release
            // restoring the conversation a hold interrupted).
            async start(id, opts = {}) {
                if (isTestMode()) return { enabled: false, skipped: 'test-mode' };
                const ws = await load('ws', './elevenLabsWebSocketService.js');
                const r = await ws.setAgentEnabledForCharacter(id, true, { noGreeting: !!opts.noGreeting });
                return r && r.success && r.enabled
                    ? { enabled: true, sessionId: r.sessionId, alreadyRunning: !!r.alreadyRunning }
                    : { enabled: false, error: (r && r.error) || 'agent did not start' };
            },
            // opts.immediate: cut the sentence being spoken now (an event hold);
            // the default lets it finish (AI off, sleep).
            async stop(id, opts = {}) {
                if (isTestMode()) return { enabled: false, skipped: 'test-mode' };
                const ws = await load('ws', './elevenLabsWebSocketService.js');
                const r = await ws.setAgentEnabledForCharacter(id, false, { immediate: !!opts.immediate });
                return { enabled: false, stopped: !!(r && r.success && !r.alreadyStopped), immediate: !!opts.immediate };
            },
            isLive(id) {
                // Synchronous: only consult a module that is already loaded.
                try { return !!(mods.ws && mods.ws.isAgentEnabledForCharacter(id)); } catch (_) { return false; }
            },
            async preload() { await load('ws', './elevenLabsWebSocketService.js'); }
        },

        idle: {
            async start(id) {
                if (isTestMode()) return;
                const m = await load('idle', './movement/idleLoopService.js');
                await m.start(id);
            },
            async stop() {
                const m = await load('idle', './movement/idleLoopService.js');
                m.stop();
            },
            async isRunning(id) {
                const m = await load('idle', './movement/idleLoopService.js');
                const s = m.getStatus();
                return !!(s && s.running && (id == null || String(s.characterId) === String(id)));
            }
        },

        head: {
            start: (id, opts) => startHeadTracking(id, opts),
            stop: (id) => stopHeadTracking(id),
            async isOperatorOff(id) {
                const m = await load('htOn', './headTrackingAlwaysOn.js');
                return m.isOperatorHeadTrackingOff(id);
            },
            async clearOperatorOff(id) {
                const m = await load('htOn', './headTrackingAlwaysOn.js');
                m.noteOperatorHeadTrackingToggle(id, true);
            },
            async isAlwaysOn(id) {
                const m = await load('htOn', './headTrackingAlwaysOn.js');
                const cfg = await defaultCapabilitySources().readHead(id);
                return m.isHeadTrackingAlwaysOn(cfg);
            },
            /** Is head tracking driving this character's pan servo right now? */
            async isActive(id) {
                if (isTestMode()) return false;
                const parts = await defaultCapabilitySources().loadParts(id);
                const cam = findWebcam(parts, id);
                if (!cam) return false;
                const mt = await import('../controllers/motionTrackingController.js');
                const st = mt.getHeadTrackingStateForWebcam(cam.id);
                return !!(st && st.enabled);
            }
        },

        overrides: {
            remember: (id, key, value) => rememberRuntimeToggle(id, key, value),
            forget: (id, key) => forgetRuntimeToggle(id, key),
            get: (id, key) => runtimeToggleOverride(id, key)
        },

        randomPoses: {
            async set(id, enabled) {
                const svc = await load('rp', './randomPoseService.js');
                if (enabled) await svc.enable(id, { cooldownMs: 8000, minAmplitude: 0.2, maxAmplitude: 0.5 });
                else svc.disable(id);
            }
        },

        aiMotion: {
            async isEnabled(id) {
                const m = await load('aim', './aiMotionSuperPowerService.js');
                const cfg = await m.readAiMotionConfig(id);
                return !!(cfg && cfg.enabled);
            }
        },

        jaw: {
            async prewarm(id) {
                // readJawConfig pre-warms the servo daemon when the (overlaid) jaw is on.
                const m = await import('./jawAnimationSuperPowerService.js');
                await m.readJawConfig(id);
            }
        },

        led: {
            async idle(id) {
                const m = await load('ledInt', './ledInteractionService.js');
                await m.setInteractionState(id, 'idle');
            }
        },

        watcher: {
            async start(id, sensorPart, onMotion) {
                if (isTestMode()) return { armed: false, skipped: 'test-mode' };
                const w = await load('watcher', './lurkMotionWatcherService.js');
                w.start(id, { sensorPart, inactivityTimeoutMs: 0, startAsleep: false, onMotion });
                return { armed: true };
            },
            async stop() {
                const w = await load('watcher', './lurkMotionWatcherService.js');
                w.stop();
            },
            async status() {
                const w = await load('watcher', './lurkMotionWatcherService.js');
                return w.getStatus();
            },
            statusSync() {
                try { return mods.watcher ? mods.watcher.getStatus() : null; } catch (_) { return null; }
            }
        },

        speechWake: {
            async start(id, opts) {
                if (isTestMode()) return { listening: false, skipped: 'test-mode' };
                const sw = await load('sw', './speechWakeService.js');
                const ws = await load('ws', './elevenLabsWebSocketService.js');
                let deviceId = 'default';
                try { deviceId = await ws.getMicrophoneDeviceForCharacter(id); } catch (_) { /* default source */ }
                return sw.start(id, { ...opts, deviceId });
            },
            async stop() { if (mods.sw) await mods.sw.stop(); },
            /** Let go of the microphone for the agent, keeping the listener wanted. */
            async yieldMic() { if (mods.sw) await mods.sw.yieldMic(); },
            statusSync() {
                try { return mods.sw ? mods.sw.status() : null; } catch (_) { return null; }
            },
            /** One batch Scribe call on the candidate's audio; '' when nothing was said. */
            async confirm(id, pcm) {
                const { pcmToWav } = await import('./speechWakeService.js');
                const stt = await load('stt', './elevenLabsSTTService.js');
                let language;
                try {
                    const { getSTTConfig } = await import('./aiConfigStore.js');
                    const cfg = await getSTTConfig();
                    if (cfg && cfg.language && cfg.language !== 'auto') language = cfg.language;
                } catch (_) { /* auto-detect */ }
                const r = await stt.transcribeAudio(pcmToWav(pcm), { mimeType: 'audio/wav', model: 'scribe_v2', language });
                if (!r || !r.success) throw new Error((r && r.error && (r.error.message || r.error)) || 'STT failed');
                return String(r.transcript || r.text || '').trim();
            },
            /** The guest's line goes in the speech log like any guest turn (before the wake). */
            recordGuest(id, text) {
                try { if (mods.speech) mods.speech.recordSpeech(id, { speaker: 'guest', source: 'speech-wake', text }); } catch (_) { /* advisory */ }
            },
            /** Give the freshly started agent the guest's words as its first turn. */
            async handOff(id, text) {
                const ws = await load('ws', './elevenLabsWebSocketService.js');
                return ws.handGuestTurnToAgent(id, text);
            }
        },

        music: {
            async resume(id) {
                const m = await load('bgm', './backgroundMusicService.js');
                return m.resume(id);
            },
            /** Re-evaluate the play gate now rather than on the next 1.5 s tick. */
            async nudge(id) {
                const m = await load('bgm', './backgroundMusicService.js');
                return m.nudge(id);
            },
            statusSync(id) {
                try { return mods.bgm ? mods.bgm.getStatus(id) : null; } catch (_) { return null; }
            }
        },

        speech: {
            since(id, seq) {
                try { return mods.speech ? mods.speech.speechSince(id, seq) : { entries: [], seq: 0 }; } catch (_) { return { entries: [], seq: 0 }; }
            },
            async preload() { mods.speech = await import('./speechLogService.js'); }
        },

        audio: {
            /** Did this character's speaker play something in the last few seconds? */
            recentlyPlaying(id, now = Date.now()) {
                try {
                    const pb = mods.playback;
                    if (!pb) return false;
                    const last = pb.getLastPlay();
                    if (!last || !last.ts) return false;
                    if (last.characterId != null && Number(last.characterId) !== Number(id)) return false;
                    // Same estimate the music supervisor uses: ~128 kbps; streamed
                    // chunks refresh ts, so continuous speech keeps extending it.
                    const est = last.streamed > 0 ? Math.round(last.streamed * 8 / 128) : UNKNOWN_PLAYBACK_MS;
                    return now < last.ts + est + AUDIO_ACTIVITY_GRACE_MS;
                } catch (_) { return false; }
            },
            /** Is a scene (a lurk bark, a played scene) on this character's speaker, or just ended? */
            sceneActive(id, now = Date.now()) {
                try { return !!(mods.scenes && mods.scenes.isSceneActive(id, SCENE_AUDIO_TAIL_MS, now)); } catch (_) { return false; }
            },
            async preload() {
                mods.playback = await load('playback', './serverPlaybackService.js');
                mods.scenes = await import('./scenes/sceneExecutor.js');
            }
        },

        /**
         * SUBSCRIPTION POINT for conversation activity. The conversation service
         * (services/elevenLabsWebSocketService.js, not owned here) is expected to
         * announce guest speech / agent speech so a live conversation keeps the
         * character awake the moment it happens. Accepted shapes, whichever it
         * ships: `onActivity(handler)` or an EventEmitter 'activity' event, the
         * handler receiving `{ characterId, kind }`. Until it does, the speech log
         * (which that service already writes for every guest transcript and
         * agent reply) and the speaker's last-play time are read when the
         * inactivity timer comes due, so nothing is torn down mid-conversation.
         */
        async subscribeActivity(handler) {
            const ws = await load('ws', './elevenLabsWebSocketService.js');
            if (typeof ws.onActivity === 'function') { ws.onActivity(handler); return 'onActivity'; }
            // The service is an EventEmitter, so this always subscribes; until it
            // actually emits 'activity' the speech-log + speaker fallback below
            // carries the load (both are always consulted).
            if (typeof ws.on === 'function') { ws.on('activity', handler); return "event 'activity' (+ speech-log, speaker)"; }
            return null;
        }
    };
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

export class LurkStateMachine {
    constructor(deps = defaultDeps()) {
        this.deps = deps;
        this.entry = null;          // the bound character (one per node)
        this.bootAt = null;
        this._chain = Promise.resolve();
        this._bootTimer = null;
        this._sleepTimer = null;
        this._holdTimer = null;
        this._activitySource = null;
    }

    /** Transitions run one at a time, in arrival order. */
    _serialize(fn) {
        const run = this._chain.then(fn, fn);
        this._chain = run.catch(() => {});
        return run;
    }

    _newEntry(id, stored) {
        return {
            characterId: id,
            state: OFF,
            armed: true,
            since: this.deps.now(),
            prefs: normalizePrefs(stored && stored.prefs),
            overrides: {},                 // runtime-toggle keys THIS machine set, and the value it set
            pendingStart: false,
            lastActivityAt: null,
            lastActivityKind: null,
            lastGuestAt: null,
            pirCooldownUntil: 0,
            speechSeq: 0,
            wake: null,                    // { source, at, results }
            lastTransition: null,          // { from, to, reason, at, ms, results }
            capabilities: null,
            pir: { armedAt: null, lastMotionAt: null, count: 0, lastIgnored: null, ignoredLoggedAt: 0 },
            speech: {
                candidates: 0, confirms: [], confirming: false, wakes: 0,
                falseWakeStreak: 0, cooldownUntil: 0,
                lastHeard: null, lastIgnored: null, ignoredLoggedAt: 0
            },
            transitioning: null,
            transitions: 0,                // bumped by every transition (event release compares it)
            eventHold: null                // { since, until, reason, holds, transitionsAtHold, remembered }
        };
    }

    // ---- lifecycle -------------------------------------------------------

    /**
     * Boot. Binds the node's character and enters LURKING. The lurk stack starts
     * after a delay (camera ready, boot inrush over). Never throws.
     */
    async init(characterId, opts = {}) {
        const id = toId(characterId);
        if (id == null) return null;
        this.bootAt = this.deps.now();
        let stored = null;
        try { stored = await this.deps.readState(id); } catch (_) { /* defaults */ }
        const entry = this._newEntry(id, stored);
        entry.state = LURKING;
        entry.armed = true;
        entry.pendingStart = true;
        entry.lastTransition = { from: null, to: LURKING, reason: 'boot', at: this.deps.now(), ms: 0, results: {} };
        this.entry = entry;
        this._subscribeActivity();
        const delay = opts.bootDelayMs != null ? opts.bootDelayMs : LURK_BOOT_DELAY_MS;
        this._clearBootTimer();
        const timer = this.deps.setTimeout(() => {
            this._bootTimer = null;
            this._serialize(async () => {
                if (this.entry !== entry || entry.state !== LURKING || !entry.pendingStart) return;
                await this._enterLurking(entry, { reason: 'boot' });
            }).catch(e => this.deps.warn(`[Lurk] boot lurk start failed for character ${id}: ${e && e.message}`));
        }, delay);
        if (timer && typeof timer.unref === 'function') timer.unref();
        this._bootTimer = timer;
        await this._persist(entry);
        this.deps.log(`[Lurk] character ${id}: boot state LURKING — lurk stack starts in ${Math.round(delay / 1000)} s, `
            + `PIR ignored for the first ${Math.round(PIR_BOOT_GRACE_MS / 1000)} s; inactivity ${entry.prefs.inactivityTimeoutMs / 1000} s`);
        return this.getStatus(id);
    }

    /** Stop timers, the PIR watcher and the speech listener (graceful shutdown). */
    async shutdown() {
        this._clearBootTimer();
        this._clearSleepTimer();
        this._clearHoldTimer();
        try { await this.deps.watcher.stop(); } catch (_) { /* noop */ }
        try { if (this.deps.speechWake) await this.deps.speechWake.stop(); } catch (_) { /* noop */ }
    }

    _clearHoldTimer() {
        if (this._holdTimer) { try { this.deps.clearTimeout(this._holdTimer); } catch (_) { /* noop */ } this._holdTimer = null; }
    }

    _clearBootTimer() {
        if (this._bootTimer) { try { this.deps.clearTimeout(this._bootTimer); } catch (_) { /* noop */ } this._bootTimer = null; }
    }

    _clearSleepTimer() {
        if (this._sleepTimer) { try { this.deps.clearTimeout(this._sleepTimer); } catch (_) { /* noop */ } this._sleepTimer = null; }
    }

    async _subscribeActivity() {
        if (this._activitySource || !this.deps.subscribeActivity) return;
        this._activitySource = 'pending';
        try {
            const how = await this.deps.subscribeActivity((evt) => {
                try {
                    const cid = evt && (evt.characterId != null ? evt.characterId : evt.character);
                    const kind = (evt && (evt.kind || evt.type)) || 'conversation';
                    // A callout one-shot is the character talking to nobody; the agent re-engaging an
                    // empty room off its turn-timeout "..." turns (prompted:false, 94 in one morning
                    // session) is not a guest either. Only real guest speech and prompted replies
                    // keep the node awake — otherwise an empty yard never sleeps.
                    if (evt && evt.oneShot) return;
                    if (kind === 'agent_speech' && evt && evt.prompted !== true) return;
                    this.noteActivity(cid, kind);
                } catch (_) { /* never break the conversation pipeline */ }
            });
            this._activitySource = how || 'speech-log';
        } catch (e) {
            this._activitySource = 'speech-log';
        }
        try { if (this.deps.speech.preload) await this.deps.speech.preload(); } catch (_) { /* optional */ }
        try { if (this.deps.audio.preload) await this.deps.audio.preload(); } catch (_) { /* optional */ }
    }

    // ---- binding -----------------------------------------------------------

    /**
     * Resolve the entry an operator command applies to. One node animates one
     * character: a command for another character is refused unless that
     * character IS the node's current selection (the operator switched it), in
     * which case the machine rebinds. Part ids are only unique within a
     * character, so animating a character this node does not own would drive
     * the wrong channels.
     */
    async _bindFor(id, nodeCharacterId) {
        if (this.entry && this.entry.characterId === id) return { entry: this.entry };
        const nodeId = toId(nodeCharacterId);
        if (this.entry && nodeId !== id) {
            return { error: `character ${id} is not the character this node animates (${this.entry.characterId})` };
        }
        if (this.entry) {
            this.deps.log(`[Lurk] node character changed ${this.entry.characterId} → ${id}: disarming the old one`);
            await this._enterOff(this.entry, { reason: 'rebind', force: true });
        }
        let stored = null;
        try { stored = await this.deps.readState(id); } catch (_) { /* defaults */ }
        this.entry = this._newEntry(id, stored);
        this.entry.armed = false;
        this._subscribeActivity();
        return { entry: this.entry, rebound: true };
    }

    _run(characterId, opts, fn) {
        const id = toId(characterId);
        if (id == null) return Promise.resolve({ success: false, error: 'No character selected' });
        return this._serialize(async () => {
            const bound = await this._bindFor(id, opts && opts.nodeCharacterId);
            if (bound.error) return { success: false, error: bound.error, status: this.getStatus(id) };
            const result = await fn(bound.entry);
            return { success: true, ...(result || {}), status: this.getStatus(id) };
        });
    }

    // ---- public operations ---------------------------------------------------

    /** Wake into AI mode. opts: { source, explicit, force, nodeCharacterId } */
    wake(characterId, opts = {}) {
        return this._run(characterId, opts, entry => this._enterAwake(entry, {
            source: opts.source || 'api', explicit: !!opts.explicit, force: !!opts.force
        }));
    }

    /** The AI toggle ON: an explicit wake (the operator asked for everything). */
    aiOn(characterId, opts = {}) {
        return this.wake(characterId, { ...opts, source: opts.source || 'ai-on', explicit: true });
    }

    /** The AI toggle OFF: leave AI mode now, to lurking (or off when disarmed). */
    aiOff(characterId, opts = {}) {
        return this._run(characterId, opts, async (entry) => {
            if (entry.state !== AWAKE) return { changed: false, state: entry.state };
            return this._sleepToRest(entry, { reason: opts.reason || 'ai-off' });
        });
    }

    /** Lurk ON: arm the machine. From off it starts lurking; awake stays awake. */
    arm(characterId, opts = {}) {
        return this._run(characterId, opts, async (entry) => {
            if (opts.prefs) entry.prefs = normalizePrefs({ ...entry.prefs, ...opts.prefs });
            // An explicit Lurk ON means "bring the character to life": a head-
            // tracking OFF the operator (or a fleet panic) left for the session
            // no longer applies.
            if (opts.explicit !== false) { try { await this.deps.head.clearOperatorOff(entry.characterId); } catch (_) { /* noop */ } }
            entry.armed = true;
            if (entry.state === OFF || (entry.state === LURKING && entry.pendingStart)) {
                return this._enterLurking(entry, { reason: opts.reason || 'lurk-on' });
            }
            if (entry.state === LURKING) {
                // Already lurking: re-assert the stack (idempotent) so a part that
                // failed earlier gets another chance.
                return this._enterLurking(entry, { reason: opts.reason || 'lurk-on' });
            }
            await this._persist(entry);
            if (entry.state === AWAKE) this._scheduleSleepCheck(entry);
            return { changed: false, state: entry.state };
        });
    }

    /** Lurk OFF (force = panic: head tracking stops even when always-on). */
    disarm(characterId, opts = {}) {
        return this._run(characterId, opts, entry => this._enterOff(entry, {
            reason: opts.reason || (opts.force ? 'panic' : 'lurk-off'), force: !!opts.force
        }));
    }

    panic(characterId, opts = {}) {
        return this.disarm(characterId, { ...opts, force: true, reason: 'panic' });
    }

    /** Update preferences (inactivity timeout, PIR wake, speech wake, wake quiet hours). */
    setPrefs(characterId, patch = {}, opts = {}) {
        const errors = validatePrefsPatch(patch);
        if (errors.length) return Promise.resolve({ success: false, error: errors.join('; '), errors });
        return this._run(characterId, opts, async (entry) => {
            entry.prefs = normalizePrefs({ ...entry.prefs, ...patch });
            let pir = null;
            if (entry.state !== OFF && patch.pirWake !== undefined) {
                pir = await this._ensurePir(entry, await this._caps(entry));
            }
            // The listener only runs while lurking; awake and off pick the change up on their way back.
            let speech = null;
            if (entry.state === LURKING && (patch.speechWake !== undefined || patch.speechWakeMinRms !== undefined)) {
                speech = await this._ensureSpeechWake(entry, await this._caps(entry));
            }
            let headTracking = null;
            if (entry.state === LURKING && !entry.eventHold && patch.lurkHead !== undefined) {
                headTracking = await this._ensureHead(entry, await this._caps(entry));
            }
            if (entry.state === AWAKE) this._scheduleSleepCheck(entry);
            await this._persist(entry);
            return { prefs: entry.prefs, pir, speech, headTracking };
        });
    }

    /**
     * Fleet event hold: remember what is running, then stop the idle loop and
     * head tracking and pause background music, so the event's scenes own the
     * servos and the speaker. The agent is cut too, NOW (its sentence is not
     * drained): while a hold is active the agent neither talks nor listens, so
     * the show's lines are neither talked over nor answered. An awake node
     * stays awake and remembers that its agent was live (remembered.agent);
     * the release starts it again. Works in lurking or awake; a no-op hold in
     * off.
     *
     * Idempotent: a second hold extends the safety expiry but keeps what the
     * FIRST hold remembered (remembering the frozen state would make the
     * release restore nothing); it still cuts an agent that came back live
     * meanwhile (an explicit wake during the show) and notes it. Self-expiring
     * after opts.maxMs (default EVENT_HOLD_MAX_MS) so a crashed conductor
     * cannot leave a node frozen.
     */
    eventHold(characterId, opts = {}) {
        return this._run(characterId, opts, async (entry) => {
            const now = this.deps.now();
            const maxMs = clampHoldMs(opts.maxMs);
            const id = entry.characterId;
            if (entry.eventHold) {
                entry.eventHold.until = now + maxMs;
                entry.eventHold.holds += 1;
                const results = {};
                // The invariant covers the whole chain of holds: an agent that came back
                // live meanwhile (an explicit wake during the show) is cut again, and the
                // release restores it. What the first hold remembered is only added to.
                if (this.deps.agent.isLive(id)) {
                    results.agent = await this._stopAgent(entry, { immediate: true });
                    if (entry.state === AWAKE) entry.eventHold.remembered.agent = true;
                    this.deps.log(`[Lurk] character ${id}: nested event hold (${opts.reason || 'event'}) found the agent live in ${entry.state} — cut`
                        + `${entry.state === AWAKE ? '; the release restarts it' : ''}`);
                }
                this._scheduleHoldExpiry(entry, maxMs);
                await this._persist(entry);
                return { held: true, alreadyHeld: true, hold: this._publicHold(entry), ...(results.agent ? { results } : {}) };
            }
            const results = {};
            // The agent first, and cut NOW rather than drained: a scene must not run under the
            // agent's voice, and the agent must not hear the show as a guest (operator, 2026-10-12:
            // "it must interrupt, then scene, then back to its original state").
            const agentWasLive = this.deps.agent.isLive(id);
            if (agentWasLive) results.agent = await this._stopAgent(entry, { immediate: true });
            // The host of a fleet event (and any node it holds) may be AWAKE only because its PIR fired or
            // its agent answered room noise. A real guest is one who spoke in the last minute; without one
            // the node sleeps for the show and stays asleep afterwards, otherwise it stays awake and the
            // release brings its agent back (event 103, 2026-10-10: the host skipped its own part when its
            // agent transcribed the show's own lines as a guest and talked over it).
            if (entry.state === AWAKE) {
                const guestIdle = entry.lastGuestAt ? now - entry.lastGuestAt : Infinity;
                if (guestIdle > EVENT_HOLD_GUEST_IDLE_MS) {
                    this.deps.log(`[Lurk] character ${id}: event hold found the node awake with no guest for ${Math.round(guestIdle / 1000)} s — sleeping for the show`);
                    await this._enterLurking(entry, { reason: 'event-hold' });
                }
            }
            // remembered.agent: the agent was live and the node stays awake for the show, so the release restarts it.
            const remembered = { state: entry.state, agent: agentWasLive && entry.state === AWAKE, idle: false, headTracking: false, music: null };
            try { remembered.idle = await this.deps.idle.isRunning(id); } catch (_) { /* treat as off */ }
            try { remembered.headTracking = await this.deps.head.isActive(id); } catch (_) { /* treat as off */ }
            try {
                const ms = this.deps.music.statusSync ? this.deps.music.statusSync(id) : null;
                remembered.music = ms ? { running: !!ms.running, playing: !!ms.playing } : null;
            } catch (_) { /* informational */ }
            entry.eventHold = {
                since: now,
                until: now + maxMs,
                reason: opts.reason || 'event',
                holds: 1,
                transitionsAtHold: entry.transitions,
                remembered
            };
            try {
                if (remembered.idle) await this.deps.idle.stop();
                results.idle = { enabled: false, paused: remembered.idle };
            } catch (e) { results.idle = { enabled: false, error: e.message }; }
            // Stopped outright (camera released too): an event is when the Pi is
            // busiest, and the tracker would re-claim the head between scene steps.
            results.headTracking = remembered.headTracking
                ? await this.deps.head.stop(id).catch(e => ({ enabled: false, error: e.message }))
                : { enabled: false, reason: 'was not running' };
            // Music stops by its own gate (it plays only while lurking and not held).
            try { await this.deps.music.nudge(id); results.music = { paused: true }; } catch (e) { results.music = { paused: true, note: e.message }; }
            this._scheduleHoldExpiry(entry, maxMs);
            await this._persist(entry);
            this.deps.log(`[Lurk] character ${id}: EVENT HOLD (${entry.eventHold.reason}) in ${entry.state} — `
                + `agent ${agentWasLive ? (remembered.agent ? 'cut (restarts at release)' : 'cut') : 'was off'}, `
                + `idle ${remembered.idle ? 'paused' : 'was off'}, head ${remembered.headTracking ? 'paused' : 'was off'}, music paused; `
                + `safety release in ${Math.round(maxMs / 1000)} s`);
            return { held: true, hold: this._publicHold(entry), results };
        });
    }

    /** End a fleet event: restore what the hold remembered. A no-op when not held. */
    eventRelease(characterId, opts = {}) {
        return this._run(characterId, opts, entry => this._releaseHold(entry, { reason: opts.reason || 'event-release' }));
    }

    _scheduleHoldExpiry(entry, maxMs) {
        this._clearHoldTimer();
        const timer = this.deps.setTimeout(() => {
            this._holdTimer = null;
            this._serialize(async () => {
                if (this.entry !== entry || !entry.eventHold) return;
                this.deps.warn(`[Lurk] character ${entry.characterId}: event hold expired after ${Math.round(maxMs / 1000)} s with no release — restoring`);
                await this._releaseHold(entry, { reason: 'safety-expiry' });
            }).catch(e => this.deps.warn(`[Lurk] event hold expiry failed for character ${entry.characterId}: ${e && e.message}`));
        }, maxMs);
        if (timer && typeof timer.unref === 'function') timer.unref();
        this._holdTimer = timer;
    }

    /**
     * Restore after an event. When nothing changed during the hold, exactly what
     * was running comes back. When the state changed meanwhile (a conversation
     * ended, the boot start ran), the current state's own policy applies. The
     * agent the hold cut comes back first and alone (as a wake starts it) when
     * the node is still awake, and without a greeting: the guest was mid-
     * conversation. A node that slept or was switched off during the show keeps
     * that; off restores nothing (a panic wins).
     */
    async _releaseHold(entry, { reason }) {
        const hold = entry.eventHold;
        if (!hold) return { released: false, reason: 'not-held' };
        entry.eventHold = null;
        this._clearHoldTimer();
        const results = {};
        if (entry.state === OFF) {
            results.note = 'off — nothing to restore';
        } else {
            const changed = entry.transitions !== hold.transitionsAtHold || entry.state !== hold.remembered.state;
            const caps = await this._caps(entry);
            if (hold.remembered.agent) results.agent = await this._restoreAgentAfterHold(entry, caps, reason);
            results.headTracking = (changed || hold.remembered.headTracking)
                ? await this._ensureHead(entry, caps)
                : { enabled: false, reason: 'was off before the event' };
            results.idle = (changed || hold.remembered.idle)
                ? await this._ensureIdle(entry, caps)
                : { enabled: false, reason: 'was off before the event' };
            if (entry.state === LURKING) results.music = await this._resumeMusic(entry, caps);
            try { await this.deps.music.nudge(entry.characterId); } catch (_) { /* next tick */ }
        }
        await this._persist(entry);
        const heldMs = this.deps.now() - hold.since;
        this.deps.log(`[Lurk] character ${entry.characterId}: EVENT RELEASE (${reason}) after ${Math.round(heldMs / 1000)} s, back in ${entry.state} — ${summarizeResults(results)}`);
        return { released: true, heldMs, remembered: hold.remembered, results };
    }

    /** The hold cut a live agent on an awake node: bring it back, or say why not. One log line either way. */
    async _restoreAgentAfterHold(entry, caps, reason) {
        const id = entry.characterId;
        let result;
        let why;
        if (entry.state !== AWAKE) {
            result = { enabled: false, reason: `node is ${entry.state} now` };
            why = `NOT restarted: the node went to ${entry.state} during the event`;
        } else if (this.deps.agent.isLive(id)) {
            result = { enabled: true, alreadyRunning: true };
            why = 'already live again (woken during the event)';
        } else if (!(caps.agent && caps.agent.available)) {
            result = { enabled: false, reason: (caps.agent && caps.agent.reason) || 'not supported' };
            why = `NOT restarted: ${result.reason}`;
        } else {
            result = await this._startAgentAlone(entry, { noGreeting: true });
            why = result.enabled ? 'restarted without a greeting, listening again' : `did NOT restart: ${result.error || 'unknown error'}`;
        }
        this.deps.log(`[Lurk] character ${id}: event over (${reason}) — agent ${why}; node ${entry.state}`);
        return result;
    }

    _publicHold(entry) {
        const h = entry && entry.eventHold;
        if (!h) return null;
        const now = this.deps.now();
        return {
            since: new Date(h.since).toISOString(),
            expiresAt: new Date(h.until).toISOString(),
            expiresInMs: Math.max(0, h.until - now),
            reason: h.reason,
            holds: h.holds,
            remembered: h.remembered
        };
    }

    /**
     * One PIR edge (source 'pir') or an operator's simulated one ('simulate').
     * opts.force bypasses the boot/arm grace and PIR quiet hours.
     */
    handleMotion(characterId, opts = {}) {
        const id = toId(characterId);
        const entry = this.entry;
        if (id == null || !entry || entry.characterId !== id) {
            return Promise.resolve({ action: 'ignore', reason: 'not-bound' });
        }
        const source = opts.source || 'pir';
        entry.pir.lastMotionAt = this.deps.now();
        entry.pir.count += 1;
        return this._serialize(async () => {
            if (this.entry !== entry) return { action: 'ignore', reason: 'not-bound' };
            const now = this.deps.now();
            const decision = decideMotion({
                state: entry.state,
                source,
                force: !!opts.force,
                eventHold: !!entry.eventHold,
                pirWake: entry.prefs.pirWake,
                inBootGrace: this.bootAt != null && now - this.bootAt < PIR_BOOT_GRACE_MS,
                inArmGrace: entry.pir.armedAt != null && now - entry.pir.armedAt < PIR_ARM_GRACE_MS,
                inRewakeCooldown: now < (entry.pirCooldownUntil || 0),
                inQuietHours: isInQuietHours(entry.prefs.pirQuietHours, new Date(now))
            });
            if (decision.action === 'activity') {
                this._noteActivity(entry, 'motion');
                return { ...decision, state: entry.state };
            }
            if (decision.action === 'ignore') {
                entry.pir.lastIgnored = { at: now, reason: decision.reason, source };
                if (now - entry.pir.ignoredLoggedAt > IGNORED_MOTION_LOG_MS || source !== 'pir') {
                    entry.pir.ignoredLoggedAt = now;
                    this.deps.log(`[Lurk] character ${id}: ${source} motion ignored (${decision.reason})`);
                }
                return { ...decision, state: entry.state };
            }
            const r = await this._enterAwake(entry, { source, explicit: false, force: !!opts.force });
            return { ...decision, ...r, state: entry.state };
        });
    }

    _decideSpeech(entry, { force = false } = {}) {
        const now = this.deps.now();
        return decideMotion({
            state: entry.state,
            source: 'speech',
            force,
            eventHold: !!entry.eventHold,
            speechWake: entry.prefs.speechWake,
            inBootGrace: this.bootAt != null && now - this.bootAt < PIR_BOOT_GRACE_MS,
            inArmGrace: false,          // the detector learns the room before it can fire
            inRewakeCooldown: now < (entry.speech.cooldownUntil || 0),
            inQuietHours: isInQuietHours(entry.prefs.pirQuietHours, new Date(now))
        });
    }

    _speechIgnored(entry, reason, extra = {}) {
        const now = this.deps.now();
        entry.speech.lastIgnored = { at: now, reason, ...extra };
        // A chattering yard produces a candidate every few seconds: one line per
        // reason per ten minutes is plenty for the log on an SD card.
        const key = `${reason}`;
        if (entry.speech.ignoredLoggedKey !== key || now - entry.speech.ignoredLoggedAt > IGNORED_MOTION_LOG_MS) {
            entry.speech.ignoredLoggedAt = now;
            entry.speech.ignoredLoggedKey = key;
            this.deps.log(`[Lurk] character ${entry.characterId}: speech ignored (${reason})${extra.text ? ` "${String(extra.text).slice(0, 60)}"` : ''}`);
        }
        return { action: 'ignore', reason, state: entry.state };
    }

    /** What the character itself said in the last few seconds (its echo is not a guest). */
    _recentCharacterLines(id) {
        try {
            const { entries } = this.deps.speech.since(id, 0);
            const cutoff = this.deps.now() - OWN_ECHO_WINDOW_MS;
            return (entries || [])
                .filter(e => e && e.speaker === 'character' && Date.parse(e.at) >= cutoff)
                .map(e => e.text);
        } catch (_) { return []; }
    }

    /**
     * One utterance the speech listener heard while lurking. The cheap gates run
     * first; only a candidate that could wake the node now spends a Scribe call,
     * and only real words that are not the character's own echo wake it. The
     * guest's words are handed to the agent so the character answers them.
     *
     * candidate: { pcm, voicedMs, peakRms, floor, threshold }.
     */
    async handleSpeechCandidate(characterId, candidate = {}) {
        const id = toId(characterId);
        const entry = this.entry;
        if (id == null || !entry || entry.characterId !== id) return { action: 'ignore', reason: 'not-bound' };
        const sp = entry.speech;
        sp.candidates += 1;
        const level = { peakRms: Number((candidate.peakRms || 0).toFixed(3)), floor: Number((candidate.floor || 0).toFixed(3)) };

        const pre = this._decideSpeech(entry);
        if (pre.action !== 'wake') return this._speechIgnored(entry, pre.reason, level);
        if (this._ownAudioBusy(id)) return this._speechIgnored(entry, 'own-speaker', level);
        if (!candidate.pcm || !candidate.pcm.length) return this._speechIgnored(entry, 'no-audio', level);
        const budget = speechConfirmBudget({ now: this.deps.now(), times: sp.confirms, inFlight: sp.confirming });
        sp.confirms = budget.recent || sp.confirms;
        if (!budget.ok) return this._speechIgnored(entry, budget.reason, level);

        sp.confirming = true;
        sp.confirms.push(this.deps.now());
        let text = '';
        try {
            text = await this._speechWake().confirm(id, candidate.pcm);
        } catch (e) {
            return this._speechIgnored(entry, 'confirm-failed', { ...level, error: e && e.message });
        } finally {
            sp.confirming = false;
        }
        // Scribe annotates non-speech as "[background noise]" / "(music)"; those
        // letters are not a guest's words (Groundbreaker woke on one 2026-10-26).
        if (!/[\p{L}\p{N}]/u.test(stripSoundAnnotations(text))) return this._speechIgnored(entry, 'no-words', { ...level, text });
        if (isOwnEcho(text, this._recentCharacterLines(id))) return this._speechIgnored(entry, 'own-voice', { ...level, text });
        sp.lastHeard = { at: this.deps.now(), text, ...level };
        return this._wakeOnSpeech(entry, text, {});
    }

    /**
     * Speech without the microphone: an operator proving the wake-and-answer
     * path on a node nobody is standing at. opts.force bypasses quiet hours,
     * cooldowns and the boot grace (never a fleet-event hold).
     */
    simulateSpeech(characterId, text, opts = {}) {
        const id = toId(characterId);
        const entry = this.entry;
        if (id == null || !entry || entry.characterId !== id) return Promise.resolve({ action: 'ignore', reason: 'not-bound' });
        const line = String(text || '').trim();
        if (!line) return Promise.resolve({ action: 'ignore', reason: 'no-words' });
        entry.speech.candidates += 1;
        entry.speech.lastHeard = { at: this.deps.now(), text: line, simulated: true };
        return this._wakeOnSpeech(entry, line, { force: !!opts.force });
    }

    _wakeOnSpeech(entry, text, { force }) {
        return this._serialize(async () => {
            if (this.entry !== entry) return { action: 'ignore', reason: 'not-bound' };
            // Re-decided inside the chain: a PIR wake or a fleet event may have
            // landed while Scribe was listening.
            const decision = this._decideSpeech(entry, { force: force && !entry.eventHold });
            if (decision.action === 'activity') {
                this._noteActivity(entry, 'guest_speech');
                return { ...decision, state: entry.state };
            }
            if (decision.action !== 'wake') return this._speechIgnored(entry, decision.reason, { text });
            // Logged BEFORE the wake: the trigger is not evidence the guest stayed.
            this._speechWake().recordGuest(entry.characterId, text);
            this.deps.log(`[Lurk] character ${entry.characterId}: guest spoke — "${text.slice(0, 80)}"`);
            const r = await this._enterAwake(entry, { source: 'speech', explicit: false, force, guestText: text });
            if (r.changed) entry.speech.wakes += 1;
            return { ...decision, ...r, text, state: entry.state };
        });
    }

    /**
     * Activity that keeps an awake character awake: guest/agent speech, operator
     * chat. Cheap and synchronous; the inactivity timer reads it when it fires.
     */
    noteActivity(characterId, kind = 'activity') {
        const id = toId(characterId);
        const entry = this.entry;
        if (id == null || !entry || entry.characterId !== id) return false;
        return this._noteActivity(entry, kind);
    }

    _noteActivity(entry, kind) {
        if (entry.state !== AWAKE) return false;
        entry.lastActivityAt = this.deps.now();
        entry.lastActivityKind = kind;
        if (isGuestActivity(kind)) entry.lastGuestAt = entry.lastActivityAt;
        return true;
    }

    // ---- reads ---------------------------------------------------------------

    getState(characterId) {
        const id = toId(characterId);
        if (id == null || !this.entry || this.entry.characterId !== id) return null;
        return this.entry.state;
    }

    isLurking(characterId) { return this.getState(characterId) === LURKING; }
    isAwake(characterId) { return this.getState(characterId) === AWAKE; }

    /**
     * The state the lurk-time features gate on: 'lurking' | 'awake' | 'off' |
     * 'event' (a fleet event holds the node), or null when this node does not
     * animate the character. Background music, callouts and lurk scenes run only
     * on 'lurking'.
     */
    getGateState(characterId) {
        const state = this.getState(characterId);
        if (state == null) return null;
        return this.entry.eventHold ? 'event' : state;
    }

    getStatus(characterId) {
        const id = toId(characterId);
        const entry = this.entry;
        if (id == null || !entry || entry.characterId !== id) {
            return { characterId: id, bound: false, boundCharacterId: entry ? entry.characterId : null, state: OFF, armed: false, awake: false, lurking: false };
        }
        const now = this.deps.now();
        if (entry.state === AWAKE) this._absorbActivity(entry);
        const caps = entry.capabilities ? publicCapabilities(entry.capabilities) : null;
        const watcher = this.deps.watcher.statusSync ? this.deps.watcher.statusSync() : null;
        return {
            characterId: id,
            bound: true,
            state: entry.state,
            armed: entry.armed,
            awake: entry.state === AWAKE,
            lurking: entry.state === LURKING,
            since: new Date(entry.since).toISOString(),
            transitioning: entry.transitioning,
            pendingStart: entry.pendingStart,
            eventHold: this._publicHold(entry),
            wake: entry.wake,
            lastTransition: entry.lastTransition,
            prefs: entry.prefs,
            lastActivityAt: entry.lastActivityAt ? new Date(entry.lastActivityAt).toISOString() : null,
            lastActivityKind: entry.lastActivityKind,
            lastGuestActivityAt: entry.lastGuestAt ? new Date(entry.lastGuestAt).toISOString() : null,
            guestIdleMs: entry.state === AWAKE && entry.lastGuestAt ? Math.max(0, now - entry.lastGuestAt) : null,
            sleepInMs: entry.state === AWAKE
                ? sleepInMs({ now, lastActivityAt: entry.lastActivityAt, inactivityTimeoutMs: entry.prefs.inactivityTimeoutMs })
                : null,
            overrides: { ...entry.overrides },
            agentLive: this.deps.agent.isLive(id),
            capabilities: caps,
            activitySource: this._activitySource,
            pir: {
                available: !!(caps && caps.motionSensor && caps.motionSensor.available),
                wakeEnabled: entry.prefs.pirWake,
                armed: !!(watcher && watcher.active && Number(watcher.characterId) === id),
                quietHours: entry.prefs.pirQuietHours,
                inQuietHours: isInQuietHours(entry.prefs.pirQuietHours, new Date(now)),
                bootGraceRemainingMs: this.bootAt != null ? Math.max(0, PIR_BOOT_GRACE_MS - (now - this.bootAt)) : 0,
                lastMotionAt: entry.pir.lastMotionAt ? new Date(entry.pir.lastMotionAt).toISOString() : null,
                motionCount: entry.pir.count,
                lastIgnored: entry.pir.lastIgnored,
                rewakeCooldownMs: Math.max(0, (entry.pirCooldownUntil || 0) - now)
            },
            speech: {
                available: !!(caps && caps.microphone && caps.microphone.available),
                reason: caps && caps.microphone && !caps.microphone.available ? caps.microphone.reason : null,
                wakeEnabled: entry.prefs.speechWake,
                minRms: entry.prefs.speechWakeMinRms,
                listener: this._speechWake().statusSync(),
                candidates: entry.speech.candidates,
                confirmsLastHour: entry.speech.confirms.filter(t => now - t < 60 * 60 * 1000).length,
                wakes: entry.speech.wakes,
                lastHeard: entry.speech.lastHeard,
                lastIgnored: entry.speech.lastIgnored,
                falseWakeStreak: entry.speech.falseWakeStreak,
                rewakeCooldownMs: Math.max(0, (entry.speech.cooldownUntil || 0) - now)
            },
            music: this.deps.music.statusSync ? this.deps.music.statusSync(id) : null
        };
    }

    /** Capabilities for a character (fresh read of its files). */
    async capabilities(characterId) {
        const id = toId(characterId);
        if (id == null) return {};
        let caps = await this.deps.capabilities(id);
        if (this.entry && this.entry.characterId === id) {
            caps = applyOptOut(caps, this.entry.prefs.capabilityOptOut);
            this.entry.capabilities = caps;
        }
        return publicCapabilities(caps);
    }

    async _caps(entry) {
        const caps = applyOptOut(await this.deps.capabilities(entry.characterId), entry.prefs.capabilityOptOut);
        entry.capabilities = caps;
        return caps;
    }

    // ---- transitions -----------------------------------------------------------

    async _enterLurking(entry, { reason }) {
        const started = this.deps.now();
        // The boot start is the first real entry (init only recorded the intent).
        const from = entry.pendingStart && reason === 'boot' ? null : entry.state;
        entry.transitioning = 'lurking';
        this._clearBootTimer();
        entry.pendingStart = false;
        const caps = await this._caps(entry);
        const results = {};
        // Leaving AI mode: the agent first, then the switches it turned on.
        results.agent = await this._stopAgent(entry);
        results.overrides = this._clearOverrides(entry);
        results.randomPoses = await this._syncRandomPoses(entry);
        results.headTracking = await this._ensureHead(entry, caps);
        results.idle = await this._ensureIdle(entry, caps);
        results.pir = await this._ensurePir(entry, caps);
        results.speech = await this._ensureSpeechWake(entry, caps);
        results.music = await this._resumeMusic(entry, caps);
        entry.state = LURKING;
        entry.armed = true;
        entry.since = this.deps.now();
        entry.transitioning = null;
        entry.transitions += 1;
        this._clearSleepTimer();
        entry.lastTransition = { from, to: LURKING, reason, at: entry.since, ms: entry.since - started, results };
        await this._persist(entry);
        this.deps.log(`[Lurk] character ${entry.characterId}: ${from || 'boot'} → LURKING (${reason}) in ${entry.since - started} ms — ${summarizeResults(results)}`);
        return { changed: from !== LURKING, state: LURKING, results };
    }

    async _enterAwake(entry, { source, explicit, force, guestText = null }) {
        const started = this.deps.now();
        const from = entry.state;
        const id = entry.characterId;
        if (from === AWAKE) {
            // Already in AI mode: a new wake is activity. Bring the agent back if
            // it dropped (it is the only part that can die on its own).
            this._noteActivity(entry, `wake:${source}`);
            const caps = entry.capabilities || await this._caps(entry);
            let agent = null;
            if (caps.agent && caps.agent.available && !this.deps.agent.isLive(id)) {
                agent = await this._startAgentAlone(entry);
            }
            return { changed: false, state: AWAKE, alreadyAwake: true, agent };
        }
        entry.transitioning = 'awake';
        this._clearBootTimer();
        entry.pendingStart = false;
        if (explicit) { try { await this.deps.head.clearOperatorOff(id); } catch (_) { /* noop */ } }
        const caps = await this._caps(entry);
        const results = {};

        // 1-2. Movers pause, then the agent starts ALONE (see WAKE_SETTLE_MS).
        // Woken by a guest's words: no walk-up greeting; the agent answers them.
        results.agent = caps.agent.available
            ? await this._startAgentAlone(entry, guestText ? { noGreeting: true } : undefined)
            : { enabled: false, reason: caps.agent.reason };
        if (guestText && results.agent.enabled) {
            try {
                const h = await this._speechWake().handOff(id, guestText);
                results.agent = { ...results.agent, answered: !!(h && h.sent), ...(h && !h.sent ? { handOff: h.reason } : {}) };
            } catch (e) {
                results.agent = { ...results.agent, answered: false, handOff: e.message };
            }
            if (!results.agent.answered) {
                this.deps.warn(`[Lurk] character ${id}: could not hand the guest's words to the agent (${results.agent.handOff || 'unknown'}) — it is listening for them again`);
            }
        }
        // The conversation owns the microphone now; speech wake resumes on lurking.
        try { await this._speechWake().stop(); results.speech = { listening: false }; } catch (e) { results.speech = { listening: false, error: e.message }; }
        await this.deps.settle(WAKE_SETTLE_MS);

        // 3. Jaw and LED sync — in-memory switches every playback path reads.
        results.jaw = this._applyOverride(entry, 'jaw', caps.jaw);
        if (results.jaw.enabled) { try { await this.deps.jaw.prewarm(id); } catch (_) { /* daemon warms on first use */ } }
        results.led = this._applyOverride(entry, 'led', caps.led);
        if (results.led.enabled) { try { await this.deps.led.idle(id); } catch (_) { /* eyes are cosmetic */ } }

        // 4. Head tracking (kept running from lurking; re-asserted).
        results.headTracking = await this._ensureHead(entry, caps);
        await this.deps.settle(WAKE_SETTLE_MS);

        // 5. AI motion (agent gestures, guest commands, sway if configured).
        results.aiMotion = this._applyOverride(entry, 'aiMotion', caps.aiMotion);
        results.randomPoses = await this._syncRandomPoses(entry);

        // 6. Follow orders — fed by the conversation session's transcripts.
        results.followOrders = this._applyOverride(entry, 'followOrders', caps.followOrders);

        // 7. Idle movement back on, last.
        await this.deps.settle(WAKE_SETTLE_MS);
        results.idle = await this._ensureIdle(entry, caps);

        entry.state = AWAKE;
        entry.since = this.deps.now();
        entry.transitioning = null;
        entry.transitions += 1;
        entry.lastActivityAt = entry.since;
        entry.lastGuestAt = entry.since;
        entry.lastActivityKind = `wake:${source}`;
        entry.speechSeq = this._currentSpeechSeq(entry.characterId);
        entry.wake = { source, explicit: !!explicit, forced: !!force, at: new Date(entry.since).toISOString(), from };
        entry.lastTransition = { from, to: AWAKE, reason: source, at: entry.since, ms: entry.since - started, results };
        this._scheduleSleepCheck(entry);
        await this._persist(entry);
        this.deps.log(`[Lurk] character ${id}: ${from} → AWAKE (${source}${force ? ', forced' : ''}) in ${entry.since - started} ms — ${summarizeResults(results)}`);
        return { changed: true, state: AWAKE, results };
    }

    async _enterOff(entry, { reason, force }) {
        const started = this.deps.now();
        const from = entry.state;
        const id = entry.characterId;
        entry.transitioning = 'off';
        this._clearBootTimer();
        this._clearSleepTimer();
        // A panic or Lurk OFF ends any fleet-event hold: there is nothing to
        // restore afterwards, and a later release must not restart movers.
        if (entry.eventHold) { entry.eventHold = null; this._clearHoldTimer(); }
        entry.pendingStart = false;
        const results = {};
        try { await this.deps.watcher.stop(); results.pir = { armed: false }; } catch (e) { results.pir = { armed: false, error: e.message }; }
        try { await this._speechWake().stop(); results.speech = { listening: false }; } catch (e) { results.speech = { listening: false, error: e.message }; }
        try {
            if (await this.deps.idle.isRunning(null)) await this.deps.idle.stop();
            results.idle = { enabled: false };
        } catch (e) { results.idle = { enabled: false, error: e.message }; }
        results.agent = await this._stopAgent(entry);
        results.overrides = this._clearOverrides(entry);
        try { await this.deps.randomPoses.set(id, false); results.randomPoses = { enabled: false }; } catch (e) { results.randomPoses = { enabled: false, error: e.message }; }
        results.headTracking = await this._stopHead(entry, { force });
        entry.state = OFF;
        entry.armed = false;
        entry.since = this.deps.now();
        entry.transitioning = null;
        entry.transitions += 1;
        entry.lastTransition = { from, to: OFF, reason, at: entry.since, ms: entry.since - started, results };
        await this._persist(entry);
        this.deps.log(`[Lurk] character ${id}: ${from} → OFF (${reason}) in ${entry.since - started} ms — ${summarizeResults(results)}`);
        return { changed: from !== OFF, state: OFF, results };
    }

    _sleepToRest(entry, { reason }) {
        return entry.armed
            ? this._enterLurking(entry, { reason })
            : this._enterOff(entry, { reason, force: false });
    }

    // ---- inactivity ------------------------------------------------------------

    _scheduleSleepCheck(entry) {
        this._clearSleepTimer();
        if (entry.state !== AWAKE) return;
        const now = this.deps.now();
        const timeout = entry.prefs.inactivityTimeoutMs;
        const deadline = wakeGuestDeadline({ wake: entry.wake, since: entry.since, lastGuestAt: entry.lastGuestAt, wakeGuestGraceMs: entry.prefs.wakeGuestGraceMs });
        if (!timeout && deadline == null) return;
        const byActivity = timeout ? sleepInMs({ now, lastActivityAt: entry.lastActivityAt, inactivityTimeoutMs: timeout }) : Infinity;
        const byGuest = timeout ? sleepInMs({ now, lastActivityAt: entry.lastGuestAt, inactivityTimeoutMs: timeout * NO_GUEST_CEILING_FACTOR }) : Infinity;
        const byWakeGrace = deadline == null ? Infinity : deadline - now;
        const delay = Math.max(1000, Math.min(byActivity, byGuest, byWakeGrace));
        const timer = this.deps.setTimeout(() => {
            this._sleepTimer = null;
            this._serialize(() => this._checkSleep(entry))
                .catch(e => this.deps.warn(`[Lurk] inactivity check failed for character ${entry.characterId}: ${e && e.message}`));
        }, delay);
        if (timer && typeof timer.unref === 'function') timer.unref();
        this._sleepTimer = timer;
    }

    /**
     * The inactivity timer came due. Never tears down a conversation in
     * progress: speech since the last check, or reply audio still draining,
     * pushes it out again.
     */
    async _checkSleep(entry) {
        if (this.entry !== entry || entry.state !== AWAKE) return { slept: false };
        this._absorbActivity(entry);
        const now = this.deps.now();
        const timeout = entry.prefs.inactivityTimeoutMs;
        const deadline = wakeGuestDeadline({ wake: entry.wake, since: entry.since, lastGuestAt: entry.lastGuestAt, wakeGuestGraceMs: entry.prefs.wakeGuestGraceMs });
        if (deadline != null && now >= deadline && !this.deps.audio.recentlyPlaying(entry.characterId, now)) {
            if (entry.wake && entry.wake.source === 'speech') {
                entry.speech.falseWakeStreak += 1;
                entry.speech.cooldownUntil = now + speechFalseWakeCooldownMs(entry.speech.falseWakeStreak);
            } else {
                entry.pirCooldownUntil = now + WAKE_GUEST_COOLDOWN_MS;
            }
            await this._sleepToRest(entry, { reason: 'no-guest-after-wake' });
            return { slept: true, reason: 'no-guest-after-wake' };
        }
        // A guest answered this wake: whatever the speech source got wrong before, it is right now.
        if (Number.isFinite(entry.lastGuestAt) && entry.lastGuestAt > entry.since) entry.speech.falseWakeStreak = 0;
        if (!timeout) {
            if (deadline != null) this._scheduleSleepCheck(entry);
            return { slept: false };
        }
        const noGuest = now - (entry.lastGuestAt || now) >= timeout * NO_GUEST_CEILING_FACTOR;
        if (!noGuest && now - (entry.lastActivityAt || now) < timeout) {
            this._scheduleSleepCheck(entry);
            return { slept: false, reason: 'recent-activity' };
        }
        if (this.deps.audio.recentlyPlaying(entry.characterId, now)) {
            this._noteActivity(entry, 'speaker-audio');
            this._scheduleSleepCheck(entry);
            return { slept: false, reason: 'audio-playing' };
        }
        const reason = noGuest && now - (entry.lastActivityAt || now) < timeout ? 'no-guest-activity' : 'inactivity';
        if (reason === 'no-guest-activity') entry.pirCooldownUntil = now + timeout;
        await this._sleepToRest(entry, { reason });
        return { slept: true, reason };
    }

    _currentSpeechSeq(id) {
        try { return this.deps.speech.since(id, Number.MAX_SAFE_INTEGER).seq || 0; } catch (_) { return 0; }
    }

    /** Fold speech-log entries newer than the last look into lastActivityAt. */
    _absorbActivity(entry) {
        try {
            const { entries, seq } = this.deps.speech.since(entry.characterId, entry.speechSeq || 0);
            if (!seq || seq <= (entry.speechSeq || 0)) return;
            entry.speechSeq = seq;
            // A guest line with real words is guest activity; ASR noise ("...")
            // is logged as guest speech too, and must not count.
            for (const e of Array.isArray(entries) ? entries : []) {
                if (e && e.speaker !== 'character' && e.speaker !== 'system' && /[a-z0-9]/i.test(String(e.text || ''))) {
                    const t = Date.parse(e.at);
                    if (Number.isFinite(t)) entry.lastGuestAt = Math.max(entry.lastGuestAt || 0, Math.min(t, this.deps.now()));
                }
            }
            const last = Array.isArray(entries) && entries.length ? entries[entries.length - 1] : null;
            const at = last ? Date.parse(last.at) : NaN;
            if (Number.isFinite(at) && at > (entry.lastActivityAt || 0)) {
                entry.lastActivityAt = Math.min(at, this.deps.now());
                entry.lastActivityKind = `speech:${last.speaker || 'unknown'}`;
            }
        } catch (_) { /* the log is advisory */ }
    }

    // ---- capability helpers ------------------------------------------------------

    async _startAgentAlone(entry, opts) {
        const id = entry.characterId;
        // The agent's recorder opens the microphone the speech listener holds.
        try { await this._speechWake().yieldMic(); } catch (_) { /* best-effort */ }
        // The idle loop is the mover that can drive a motor; stop it so the
        // agent's websocket + mic + audio pipeline cold-start on a quiet supply.
        let paused = false;
        try {
            if (await this.deps.idle.isRunning(null)) {
                await this.deps.idle.stop();
                paused = true;
                await this.deps.settle(PRE_AGENT_SETTLE_MS);
            }
        } catch (_) { /* best-effort */ }
        let agent;
        try { agent = await this.deps.agent.start(id, opts); } catch (e) { agent = { enabled: false, error: e.message }; }
        if (paused) agent = { ...agent, idlePaused: true };
        return agent;
    }

    /** opts.immediate cuts the sentence being spoken (an event hold); the default lets it finish. */
    async _stopAgent(entry, opts) {
        try {
            if (!this.deps.agent.isLive(entry.characterId)) return { enabled: false };
            return await this.deps.agent.stop(entry.characterId, opts);
        } catch (e) {
            return { enabled: false, error: e.message };
        }
    }

    _applyOverride(entry, name, cap) {
        if (!cap || !cap.available) return { enabled: false, reason: (cap && cap.reason) || 'not supported' };
        const key = RUNTIME_KEYS[name];
        this.deps.overrides.remember(entry.characterId, key, true);
        entry.overrides[key] = true;
        return { enabled: true };
    }

    /**
     * Drop the switches this machine turned on. A key whose value changed since
     * (the operator toggled it, which on a locked character also lives in this
     * overlay) is the operator's now and stays.
     */
    _clearOverrides(entry) {
        const cleared = [];
        for (const [key, value] of Object.entries(entry.overrides || {})) {
            try {
                if (this.deps.overrides.get(entry.characterId, key) === value) {
                    this.deps.overrides.forget(entry.characterId, key);
                    cleared.push(key);
                }
            } catch (_) { /* noop */ }
        }
        entry.overrides = {};
        return { cleared };
    }

    /** randomPoseService's in-memory switch follows the effective AI Motion flag. */
    async _syncRandomPoses(entry) {
        try {
            const on = await this.deps.aiMotion.isEnabled(entry.characterId);
            await this.deps.randomPoses.set(entry.characterId, on);
            return { enabled: on };
        } catch (e) {
            return { enabled: false, error: e.message };
        }
    }

    async _ensureHead(entry, caps) {
        const cap = caps.headTracking;
        if (!cap || !cap.available) return { enabled: false, reason: (cap && cap.reason) || 'not supported' };
        if (entry.eventHold) return { enabled: false, reason: 'fleet event hold' };
        if ((entry.transitioning || entry.state) === LURKING && entry.prefs.lurkHead === 'idle') {
            // The idle loop can only claim the pan servo once tracking lets go of it.
            const stopped = await this._stopHead(entry, { force: true });
            return { enabled: false, reason: 'lurkHead idle: the idle loop sweeps the head while lurking', stopped };
        }
        try {
            if (await this.deps.head.isOperatorOff(entry.characterId)) {
                return { enabled: false, reason: 'switched off by the operator this session' };
            }
            return await this.deps.head.start(entry.characterId, { reuseRunningTracker: true });
        } catch (e) {
            return { enabled: false, error: e.message };
        }
    }

    async _stopHead(entry, { force }) {
        try {
            // headTracking.alwaysOn keeps its meaning: a lurk OFF leaves it
            // running unless the operator switched head tracking off; panic stops it.
            if (!force && await this.deps.head.isAlwaysOn(entry.characterId)
                && !(await this.deps.head.isOperatorOff(entry.characterId))) {
                return { enabled: true, alwaysOn: true, reason: 'headTracking.alwaysOn — left running' };
            }
            return await this.deps.head.stop(entry.characterId);
        } catch (e) {
            return { enabled: false, error: e.message };
        }
    }

    async _ensureIdle(entry, caps) {
        const cap = caps.idle;
        if (!cap || !cap.available) return { enabled: false, reason: (cap && cap.reason) || 'not supported' };
        if (entry.eventHold) return { enabled: false, reason: 'fleet event hold' };
        try {
            if (await this.deps.idle.isRunning(entry.characterId)) return { enabled: true, alreadyRunning: true };
            await this.deps.idle.start(entry.characterId);
            return { enabled: true, poses: cap.poses };
        } catch (e) {
            return { enabled: false, error: e.message };
        }
    }

    async _ensurePir(entry, caps) {
        const cap = caps.motionSensor;
        try {
            if (!cap || !cap.available) {
                await this.deps.watcher.stop();
                return { armed: false, reason: (cap && cap.reason) || 'no motion sensor' };
            }
            if (!entry.prefs.pirWake) {
                await this.deps.watcher.stop();
                return { armed: false, reason: 'PIR wake switched off' };
            }
            const st = await this.deps.watcher.status();
            if (st && st.active && Number(st.characterId) === entry.characterId) {
                return { armed: true, alreadyArmed: true, partId: cap.partId };
            }
            const id = entry.characterId;
            const r = await this.deps.watcher.start(id, cap.part, () => {
                this.handleMotion(id, { source: 'pir' })
                    .catch(e => this.deps.warn(`[Lurk] PIR handling failed for character ${id}: ${e && e.message}`));
            });
            entry.pir.armedAt = this.deps.now();
            return { armed: !(r && r.armed === false), partId: cap.partId, pin: cap.pin, ...(r && r.skipped ? { skipped: r.skipped } : {}) };
        } catch (e) {
            return { armed: false, error: e.message };
        }
    }

    _speechWake() {
        return this.deps.speechWake || NO_SPEECH_WAKE;
    }

    /** Anything on this character's own speaker: the playback service's last play, or a scene. */
    _ownAudioBusy(id) {
        const now = this.deps.now();
        if (this.deps.audio.recentlyPlaying(id, now)) return true;
        try { return !!(this.deps.audio.sceneActive && this.deps.audio.sceneActive(id, now)); } catch (_) { return false; }
    }

    /** Lurking: listen for a guest speaking (yields to any conversation on its own). */
    async _ensureSpeechWake(entry, caps) {
        const cap = caps.microphone;
        const sw = this._speechWake();
        try {
            if (!cap || !cap.available) {
                await sw.stop();
                return { listening: false, reason: (cap && cap.reason) || 'no microphone' };
            }
            if (!entry.prefs.speechWake) {
                await sw.stop();
                return { listening: false, reason: 'speech wake switched off' };
            }
            const id = entry.characterId;
            const r = await sw.start(id, {
                minRms: entry.prefs.speechWakeMinRms,
                // The character's own speaker (a lurk bark, a callout, a scene) is not a guest.
                isSuppressed: () => this._ownAudioBusy(id),
                onCandidate: (cand) => {
                    this.handleSpeechCandidate(id, cand)
                        .catch(e => this.deps.warn(`[Lurk] speech handling failed for character ${id}: ${e && e.message}`));
                }
            });
            return { listening: !(r && r.skipped) && !(r && r.wanted === false), partId: cap.partId, ...(r && r.skipped ? { skipped: r.skipped } : {}) };
        } catch (e) {
            return { listening: false, error: e.message };
        }
    }

    async _resumeMusic(entry, caps) {
        if (!caps.music || !caps.music.available) return { resumed: false, reason: (caps.music && caps.music.reason) || 'not configured' };
        try {
            await this.deps.music.resume(entry.characterId);
            return { resumed: true };
        } catch (e) {
            return { resumed: false, error: e.message };
        }
    }

    async _persist(entry) {
        try {
            await this.deps.writeState(entry.characterId, {
                characterId: entry.characterId,
                state: entry.state,
                armed: entry.armed,
                since: new Date(entry.since).toISOString(),
                wake: entry.wake,
                lastTransition: entry.lastTransition ? {
                    ...entry.lastTransition,
                    at: new Date(entry.lastTransition.at).toISOString()
                } : null,
                prefs: entry.prefs,
                overrides: Object.keys(entry.overrides || {}),
                // Diagnostics only: a restart lands in lurking with no hold.
                eventHold: this._publicHold(entry),
                capabilities: entry.capabilities ? publicCapabilities(entry.capabilities) : null,
                updatedAt: new Date(this.deps.now()).toISOString()
            });
        } catch (e) {
            this.deps.warn(`[Lurk] could not persist ${STATE_FILE} for character ${entry.characterId}: ${e && e.message}`);
        }
    }
}

const lurkStateService = new LurkStateMachine();
export default lurkStateService;
