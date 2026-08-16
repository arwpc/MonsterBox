/**
 * Speech Expression Service — makes a character read as alive rather than as a
 * speaker box with a hinged jaw.
 *
 * Two behaviours, one owner, because they drive the same servo and must never
 * fight over it:
 *
 *   1. CO-EXPRESSION while speaking. A head that holds dead still while the jaw
 *      flaps reads as a puppet. This adds small head motion correlated with
 *      speech emphasis — the same normalised loudness the jaw is driven from,
 *      so the correlation is real rather than a decorative oscillator.
 *   2. IDLE LIVELINESS between turns. Nothing alive holds perfectly still. A
 *      slow breathing drift keeps the character from freezing into an object
 *      the moment it stops talking.
 *
 * Design constraints this respects:
 *   - Every angle is clamped against the part's configured safety window,
 *     resolved ONCE per session via getPartSafety(characterId, partId) with an
 *     EXPLICIT characterId. Several existing head paths omit the characterId and
 *     fall back to whatever character happens to be selected, which silently
 *     drops the clamp; this service never does that.
 *   - Servo ownership goes through priorityManager, so a scene (100) or active
 *     head tracking (80) always wins and this backs off instead of arguing.
 *   - Motion is rate-limited per tick, so no reachable code path can produce a
 *     snap. Subtlety is the whole point: the line between "alive" and "twitchy"
 *     is amplitude and slew rate, not complexity.
 *   - Character-independent: the pan servo comes from the character's own
 *     headTracking config, amplitudes from its own movement-config.json.
 *
 * No new dependencies and no new transport: angles go out over the already-warm
 * PCA9685 servo daemon that the jaw uses.
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { claimServo, releaseServo, isAvailable, PRIORITY } from './movement/priorityManager.js';
import { getPartSafety } from './hardwareService/safetyLimits.js';
import jawServoDaemon from './jawServoDaemon.js';
import { readHeadTrackingConfig } from './headAnimationSuperPowerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

const SPEECH_OWNER = 'speech-co-expression';
const IDLE_OWNER = 'idle-liveliness';

// Sits below HEAD_TRACKING (80) on purpose: if the character is actively
// looking at a guest, that is a better behaviour than talking-head sway, and
// tracking should win without a fight.
const CO_EXPRESSION_PRIORITY = 60;

const SPEECH_TICK_MS = 100;   // 10Hz — the head is heavy; 20Hz buys nothing visible
const IDLE_TICK_MS = 200;     // 5Hz is plenty for a breathing drift

// Emphasis envelope: slow enough to track a phrase, not a syllable. Syllable-rate
// head motion is exactly what reads as twitchy.
const EMPHASIS_ALPHA = 0.12;

// Two incommensurate periods so the wander never visibly repeats.
const WANDER_A_MS = 3700;
const WANDER_B_MS = 6100;

const DEFAULT_SPEECH_AMPLITUDE_DEG = 7;
const DEFAULT_SLEW_DEG_PER_TICK = 1.6;
const DEFAULT_IDLE_BREATH_DEG = 1.5;
const DEFAULT_IDLE_BREATH_MS = 5000;
const DEFAULT_IDLE_DRIFT_DEG = 0.5;
const DEFAULT_IDLE_DRIFT_MS = 10000;

/** characterId -> session state */
const sessions = new Map();

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

async function loadMovementConfig(characterId) {
  const p = path.join(DATA_DIR, `character-${characterId}`, 'movement-config.json');
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

async function loadParts(characterId) {
  const p = path.join(DATA_DIR, `character-${characterId}`, 'parts.json');
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'));
  } catch (_) {
    return [];
  }
}

/**
 * Resolve everything this service needs about a character's head, once.
 *
 * Returns null when the character has no usable pan servo — every caller treats
 * that as "no co-expression", never as an error, because a character without a
 * head servo must still be able to talk.
 */
async function resolveHead(characterId) {
  const cid = String(characterId);
  let headCfg = {};
  try {
    headCfg = await readHeadTrackingConfig(characterId) || {};
  } catch (_) { /* fall through to no-head */ }

  const panServoId = headCfg.panServoId;
  if (!panServoId) return null;

  const parts = await loadParts(characterId);
  const part = parts.find(p => String(p.id) === String(panServoId));
  if (!part || part.enabled === false || part.type !== 'servo') return null;

  const cfg = part.config || {};
  if (cfg.controllerType !== 'pca9685' || cfg.channel == null) return null;

  // The authoritative safe window, resolved with an explicit characterId.
  let safety = {};
  try {
    safety = await getPartSafety(characterId, panServoId) || {};
  } catch (_) { safety = {}; }

  if (safety.blockAllMotion) return null;

  const lo = typeof safety.minAngle === 'number' ? safety.minAngle : null;
  const hi = typeof safety.maxAngle === 'number' ? safety.maxAngle : null;

  // Without a real safe window we do not invent one. Refusing to move an
  // unbounded head is the correct outcome; guessing bounds is how servos strip.
  if (lo == null || hi == null || !(hi > lo)) {
    console.warn(`[speech-expression] character ${cid} pan servo ${panServoId} has no configured safe window — co-expression disabled`);
    return null;
  }

  // Keep a degree off each end so the head never audibly parks against a stop.
  const margin = Math.min(1, (hi - lo) * 0.05);
  const safeLo = lo + margin;
  const safeHi = hi - margin;

  const center = clamp(
    typeof headCfg.centerDeg === 'number' ? headCfg.centerDeg : (lo + hi) / 2,
    safeLo, safeHi
  );

  const address = cfg.address || 0x40;

  // Where the head actually is right now, so the first move is rate-limited
  // against reality rather than against an assumption.
  const measured = await readCurrentAngle(cfg.channel, address);
  const startAngle = (typeof measured === 'number' && measured >= safeLo - 5 && measured <= safeHi + 5)
    ? clamp(measured, safeLo, safeHi)
    : center;

  return {
    partId: String(panServoId),
    channel: cfg.channel,
    address,
    safeLo, safeHi, center, startAngle
  };
}

/**
 * Read the angle the servo is ACTUALLY holding, straight off the PCA9685's PWM
 * registers.
 *
 * This is not a nicety. A rate limiter can only limit the distance between
 * where it thinks the servo is and where it wants it to go. Seeding that from
 * an assumed centre while the head was really parked 30deg away produced a
 * measured 28.22deg single-step snap on the first command — the limiter was
 * faithfully limiting a number that had nothing to do with the hardware.
 *
 * One short read at session start; never in the tick loop. Falls back to the
 * configured centre if the read fails, which restores the old (worse but not
 * dangerous) behaviour rather than refusing to move.
 */
function readCurrentAngle(channel, address) {
  return new Promise((resolve) => {
    const script = path.resolve(__dirname, '../python_wrappers/i2c_servo_sampler.py');
    execFile('python3', [script, '--channels', String(channel), '--address', String(address),
      '--duration', '0.06', '--rate', '200'], { timeout: 4000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        const ch = JSON.parse(stdout).channels[String(channel)];
        resolve(typeof ch.mean_angle === 'number' ? ch.mean_angle : null);
      } catch (_) {
        resolve(null);
      }
    });
  });
}

function getSession(characterId) {
  return sessions.get(String(characterId));
}

function ensureSession(characterId, head) {
  const cid = String(characterId);
  let s = sessions.get(cid);
  if (!s) {
    s = {
      cid, head,
      emphasis: 0,
      lastAngle: typeof head.startAngle === 'number' ? head.startAngle : head.center,
      t0: Date.now(),
      speechTimer: null,
      idleTimer: null,
      speaking: false,
      accent: 0,
      lastEmphasis: 0,
      // measurement counters, surfaced by getExpressionState()
      commands: 0
    };
    s.minAngle = s.lastAngle;
    s.maxAngle = s.lastAngle;
    sessions.set(cid, s);
  }
  return s;
}

/**
 * Move the head one step toward a target, rate-limited and clamped.
 * Returns the angle actually commanded, or null if nothing was sent.
 */
function stepHead(s, target, slewDeg) {
  const h = s.head;
  const wanted = clamp(target, h.safeLo, h.safeHi);
  const delta = clamp(wanted - s.lastAngle, -slewDeg, slewDeg);
  const next = clamp(s.lastAngle + delta, h.safeLo, h.safeHi);

  // Sub-quarter-degree moves are below the servo's resolution and just add I2C
  // traffic and buzz.
  if (Math.abs(next - s.lastAngle) < 0.25) return null;

  s.lastAngle = next;
  s.commands++;
  if (next < s.minAngle) s.minAngle = next;
  if (next > s.maxAngle) s.maxAngle = next;
  jawServoDaemon.sendAngle(h.channel, next, h.address);
  return next;
}

/* -------------------------------------------------------------------------
 * Co-expression while speaking
 * ---------------------------------------------------------------------- */

/**
 * Begin co-expression for a spoken turn. Safe to call repeatedly.
 * Returns { started, reason } — never throws, because a decorative behaviour
 * must never be able to break speech.
 */
async function startSpeaking(characterId, options = {}) {
  const cid = String(characterId);
  try {
    const existing = getSession(cid);
    let head = existing && existing.head;
    if (!head) {
      head = await resolveHead(characterId);
      if (!head) return { started: false, reason: 'no usable pan servo' };
    }

    const mv = await loadMovementConfig(characterId);
    const co = (mv && mv.speechCoExpression) || {};
    if (co.enabled === false) return { started: false, reason: 'disabled by config' };

    const s = ensureSession(cid, head);
    s.head = head;
    s.amplitude = typeof co.headAmplitudeDeg === 'number'
      ? co.headAmplitudeDeg : DEFAULT_SPEECH_AMPLITUDE_DEG;
    s.slew = typeof co.maxSlewDegPerTick === 'number'
      ? co.maxSlewDegPerTick : DEFAULT_SLEW_DEG_PER_TICK;

    // Never fight a scene or live head tracking.
    if (!isAvailable(head.partId, CO_EXPRESSION_PRIORITY)) {
      return { started: false, reason: 'servo held by higher priority owner' };
    }
    const claim = claimServo(head.partId, SPEECH_OWNER, CO_EXPRESSION_PRIORITY);
    if (!claim.granted) return { started: false, reason: 'claim denied' };

    // Idle liveliness yields to speech, and a settle-to-centre still easing home
    // from the previous utterance must stop before it fights this one.
    if (s.idleTimer) { clearInterval(s.idleTimer); s.idleTimer = null; }
    if (s.settleTimer) { clearInterval(s.settleTimer); s.settleTimer = null; }

    s.speaking = true;
    s.t0 = Date.now();
    s.emphasis = 0;
    s.accent = 0;
    s.commands = 0;
    s.minAngle = s.lastAngle;
    s.maxAngle = s.lastAngle;

    jawServoDaemon.ensureRunning().catch(() => {});

    if (!s.speechTimer) {
      s.speechTimer = setInterval(() => _speechTick(cid), SPEECH_TICK_MS);
    }
    return { started: true, partId: head.partId, window: [head.safeLo, head.safeHi] };
  } catch (err) {
    console.warn('[speech-expression] startSpeaking failed:', err.message);
    return { started: false, reason: err.message };
  }
}

/**
 * Feed one normalised speech level (0..1) — the SAME value the jaw is driven
 * from, so head emphasis and mouth opening come from one signal and genuinely
 * agree with each other.
 */
function noteLevel(characterId, level) {
  const s = getSession(characterId);
  if (!s || !s.speaking) return;
  const v = clamp(Number(level) || 0, 0, 1);
  s.lastEmphasis = s.emphasis;
  s.emphasis = s.emphasis + EMPHASIS_ALPHA * (v - s.emphasis);

  // A sharp rise in emphasis is a stressed word. Nudge the head a little on it —
  // this is what makes the motion read as "reacting to what it is saying"
  // rather than as an idle sway that happens to overlap speech.
  const rise = s.emphasis - s.lastEmphasis;
  if (rise > 0.045 && s.emphasis > 0.45) {
    s.accent = Math.min(1, s.accent + rise * 4);
  }
}

function _speechTick(cid) {
  const s = getSession(cid);
  if (!s || !s.speaking) return;

  const t = Date.now() - s.t0;
  const h = s.head;

  // Wander scales with how animated the speech is: quiet delivery barely moves,
  // an emphatic line moves more. Floor of 0.3 so it is never fully frozen.
  const drive = 0.3 + 0.7 * s.emphasis;
  const wander =
    Math.sin((2 * Math.PI * t) / WANDER_A_MS) * 0.6 +
    Math.sin((2 * Math.PI * t) / WANDER_B_MS + 1.1) * 0.4;

  s.accent *= 0.88; // decay the emphasis impulse over ~half a second

  const offset = (wander * drive + s.accent * 0.5) * s.amplitude;
  stepHead(s, h.center + offset, s.slew);
}

/**
 * End the spoken turn: ease the head back toward centre, then hand the servo to
 * idle liveliness.
 */
function stopSpeaking(characterId, options = {}) {
  const cid = String(characterId);
  const s = getSession(cid);
  if (!s) return { stopped: false };

  if (s.speechTimer) { clearInterval(s.speechTimer); s.speechTimer = null; }
  s.speaking = false;

  const stats = {
    commands: s.commands,
    minAngle: Number(s.minAngle.toFixed(2)),
    maxAngle: Number(s.maxAngle.toFixed(2)),
    rangeDeg: Number((s.maxAngle - s.minAngle).toFixed(2))
  };

  // Ease home rather than snap. A snap back to centre at the end of every line
  // is the single most robot-like thing a talking head can do.
  const settle = setInterval(() => {
    const moved = stepHead(s, s.head.center, s.slew * 0.5);
    if (moved === null) {
      clearInterval(settle);
      releaseServo(s.head.partId, SPEECH_OWNER);
      if (options.resumeIdle !== false) startIdleLiveliness(cid).catch(() => {});
    }
  }, SPEECH_TICK_MS);
  s.settleTimer = settle;

  return { stopped: true, ...stats };
}

/* -------------------------------------------------------------------------
 * Idle liveliness between turns
 * ---------------------------------------------------------------------- */

/**
 * Slow breathing + drift on the head so the character is never perfectly still.
 * Claims at MICRO_MOVEMENT priority — the lowest there is — so literally any
 * other subsystem takes the servo away without contest.
 *
 * Reads the microMovement block that already exists in movement-config.json
 * (amplitudes, periods). That block has been in the schema and in every
 * character's config all along with nothing implementing it.
 */
async function startIdleLiveliness(characterId) {
  const cid = String(characterId);
  try {
    let s = getSession(cid);
    let head = s && s.head;
    if (!head) {
      head = await resolveHead(characterId);
      if (!head) return { started: false, reason: 'no usable pan servo' };
    }

    const mv = await loadMovementConfig(characterId);
    const micro = (mv && mv.microMovement) || {};
    if (micro.enabled === false) return { started: false, reason: 'microMovement disabled' };

    s = ensureSession(cid, head);
    s.head = head;
    s.breathDeg = typeof micro.breathingAmplitudeDeg === 'number'
      ? micro.breathingAmplitudeDeg : DEFAULT_IDLE_BREATH_DEG;
    s.breathMs = micro.breathingPeriodMs || DEFAULT_IDLE_BREATH_MS;
    s.driftDeg = typeof micro.driftAmplitudeDeg === 'number'
      ? micro.driftAmplitudeDeg : DEFAULT_IDLE_DRIFT_DEG;
    s.driftMs = micro.driftPeriodMs || DEFAULT_IDLE_DRIFT_MS;

    if (s.speaking) return { started: false, reason: 'speaking' };
    if (!isAvailable(head.partId, PRIORITY.MICRO_MOVEMENT)) {
      return { started: false, reason: 'servo held by higher priority owner' };
    }
    const claim = claimServo(head.partId, IDLE_OWNER, PRIORITY.MICRO_MOVEMENT);
    if (!claim.granted) return { started: false, reason: 'claim denied' };

    jawServoDaemon.ensureRunning().catch(() => {});
    if (!s.idleTimer) {
      s.idleTimer = setInterval(() => _idleTick(cid), IDLE_TICK_MS);
    }
    return { started: true, partId: head.partId };
  } catch (err) {
    console.warn('[speech-expression] startIdleLiveliness failed:', err.message);
    return { started: false, reason: err.message };
  }
}

function _idleTick(cid) {
  const s = getSession(cid);
  if (!s || s.speaking) return;
  const t = Date.now() - s.t0;
  const offset =
    Math.sin((2 * Math.PI * t) / s.breathMs) * s.breathDeg +
    Math.sin((2 * Math.PI * t) / s.driftMs + 0.7) * s.driftDeg;
  // Idle motion is slow by construction; a tight slew keeps it from ever
  // reading as a twitch even if the config is set aggressively.
  stepHead(s, s.head.center + offset, 0.6);
}

function stopIdleLiveliness(characterId) {
  const s = getSession(characterId);
  if (!s) return { stopped: false };
  if (s.idleTimer) { clearInterval(s.idleTimer); s.idleTimer = null; }
  releaseServo(s.head.partId, IDLE_OWNER);
  return { stopped: true };
}

/**
 * Full teardown for a character — every timer cleared and every claim dropped.
 * Session teardown must be able to guarantee nothing is left ticking.
 */
function stopAll(characterId) {
  const cid = String(characterId);
  const s = getSession(cid);
  if (!s) return { stopped: false };
  if (s.speechTimer) clearInterval(s.speechTimer);
  if (s.idleTimer) clearInterval(s.idleTimer);
  if (s.settleTimer) clearInterval(s.settleTimer);
  releaseServo(s.head.partId, SPEECH_OWNER);
  releaseServo(s.head.partId, IDLE_OWNER);
  sessions.delete(cid);
  return { stopped: true };
}

/** Observability for tests and the dashboard. */
function getExpressionState(characterId) {
  const s = getSession(characterId);
  if (!s) return { active: false };
  return {
    active: true,
    speaking: s.speaking,
    emphasis: Number(s.emphasis.toFixed(3)),
    angle: Number(s.lastAngle.toFixed(2)),
    commands: s.commands,
    minAngle: Number(s.minAngle.toFixed(2)),
    maxAngle: Number(s.maxAngle.toFixed(2)),
    window: [s.head.safeLo, s.head.safeHi]
  };
}

export {
  startSpeaking,
  noteLevel,
  stopSpeaking,
  startIdleLiveliness,
  stopIdleLiveliness,
  stopAll,
  getExpressionState,
  resolveHead,
  CO_EXPRESSION_PRIORITY
};

export default {
  startSpeaking,
  noteLevel,
  stopSpeaking,
  startIdleLiveliness,
  stopIdleLiveliness,
  stopAll,
  getExpressionState
};
