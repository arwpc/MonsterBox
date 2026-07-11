/**
 * Lurk Motion Watcher Service
 *
 * Monitors the motion sensor while Lurk mode is active. When the motion sensor
 * detects movement, it resets the inactivity timer so the animatronic stays alive.
 * If no motion (and no speech/activity) is detected within the timeout window,
 * Lurk mode is put to sleep. The next motion detection wakes it back up fully.
 *
 * Lifecycle:
 *   start(characterId, opts)  — begin polling the PIR sensor
 *   stop()                    — stop polling, clear timers
 *   onMotionDetected()        — called internally; resets inactivity timer
 *   getStatus()               — current watcher state for the dashboard
 */

import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

// ─── State ────────────────────────────────────────────────────────────
let watcherState = {
  active: false,
  characterId: null,
  sensorPartId: null,
  sensorPin: null,
  pollIntervalMs: 1000,          // how often we read the PIR sensor
  inactivityTimeoutMs: 5 * 60 * 1000,  // default 5 minutes
  lastMotionAt: null,
  lastPollAt: null,
  sleeping: false,               // true when timed out waiting for motion
  pollTimer: null,
  inactivityTimer: null,
  motionDetectedCount: 0,
  // Callbacks set by the caller (conversation route)
  onSleep: null,                 // called when inactivity timeout fires
  onWake: null                   // called when motion detected while sleeping
};

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Start watching the motion sensor for a character.
 * @param {number} characterId
 * @param {object} opts
 * @param {object} opts.sensorPart — the motion_sensor part object (id, pin)
 * @param {number} [opts.inactivityTimeoutMs=300000] — ms before sleeping (0 = no timeout)
 * @param {number} [opts.pollIntervalMs=1000] — sensor poll interval
 * @param {function} [opts.onSleep] — callback when lurk goes to sleep
 * @param {function} [opts.onWake] — callback when motion wakes lurk back up
 */
function start(characterId, opts = {}) {
  stop(); // clean up any prior watcher

  const part = opts.sensorPart;
  if (!part || part.pin == null) {
    throw new Error('No motion sensor part with a GPIO pin provided');
  }

  watcherState.active = true;
  watcherState.characterId = characterId;
  watcherState.sensorPartId = part.id;
  watcherState.sensorPin = part.pin;
  watcherState.pollIntervalMs = opts.pollIntervalMs || 1000;
  watcherState.inactivityTimeoutMs = opts.inactivityTimeoutMs != null ? opts.inactivityTimeoutMs : 5 * 60 * 1000;
  watcherState.lastMotionAt = Date.now();
  watcherState.lastPollAt = null;
  watcherState.sleeping = false;
  watcherState.motionDetectedCount = 0;
  watcherState.onSleep = opts.onSleep || null;
  watcherState.onWake = opts.onWake || null;

  // Start polling
  watcherState.pollTimer = setInterval(pollSensor, watcherState.pollIntervalMs);
  if (watcherState.pollTimer.unref) watcherState.pollTimer.unref();

  // Start inactivity timer
  resetInactivityTimer();
}

/**
 * Stop watching. Clears all timers.
 */
function stop() {
  if (watcherState.pollTimer) {
    clearInterval(watcherState.pollTimer);
    watcherState.pollTimer = null;
  }
  if (watcherState.inactivityTimer) {
    clearTimeout(watcherState.inactivityTimer);
    watcherState.inactivityTimer = null;
  }
  watcherState.active = false;
  watcherState.sleeping = false;
  watcherState.onSleep = null;
  watcherState.onWake = null;
}

/**
 * Call this when any activity occurs (speech, AI chat, etc.)
 * to reset the inactivity timer without requiring motion.
 */
function resetActivity() {
  if (!watcherState.active) return;
  watcherState.lastMotionAt = Date.now();
  resetInactivityTimer();
}

/**
 * Return current watcher status for the dashboard.
 */
function getStatus() {
  const now = Date.now();
  const remainingMs = watcherState.active && watcherState.inactivityTimeoutMs > 0
    ? Math.max(0, watcherState.inactivityTimeoutMs - (now - (watcherState.lastMotionAt || now)))
    : null;

  return {
    active: watcherState.active,
    sleeping: watcherState.sleeping,
    characterId: watcherState.characterId,
    sensorPartId: watcherState.sensorPartId,
    lastMotionAt: watcherState.lastMotionAt,
    lastPollAt: watcherState.lastPollAt,
    motionDetectedCount: watcherState.motionDetectedCount,
    inactivityTimeoutMs: watcherState.inactivityTimeoutMs,
    remainingMs
  };
}

/**
 * Whether the watcher is in sleep mode (timed out, waiting for motion to wake).
 */
function isSleeping() {
  return watcherState.sleeping;
}

/**
 * Whether the watcher is actively monitoring.
 */
function isActive() {
  return watcherState.active;
}

// ─── Internal ─────────────────────────────────────────────────────────

function pollSensor() {
  if (!watcherState.active) return;
  // Skip if the previous poll's python3 child hasn't returned yet. Otherwise a
  // slow or hung GPIO read stacks a new process on every interval — a spawn
  // storm that piles up python3 processes on the RPi.
  if (watcherState.polling) return;

  const pin = watcherState.sensorPin;
  const script = path.resolve(appRoot, 'python_wrappers/gpio_read.py');

  watcherState.lastPollAt = Date.now();
  watcherState.polling = true;

  execFile('/usr/bin/python3', [script, String(pin)], { timeout: 2000 }, (err, stdout) => {
    watcherState.polling = false;
    if (err || !watcherState.active) return;

    const value = parseInt((stdout || '').trim(), 10);
    if (value === 1) {
      onMotionDetected();
    }
  });
}

function onMotionDetected() {
  const wasSleeping = watcherState.sleeping;
  watcherState.motionDetectedCount++;
  watcherState.lastMotionAt = Date.now();

  if (wasSleeping) {
    // Wake up! Motion detected while sleeping
    watcherState.sleeping = false;
    if (watcherState.onWake) {
      try { watcherState.onWake(watcherState.characterId); } catch (e) {
        console.error('[LurkMotionWatcher] onWake callback error:', e.message);
      }
    }
  }

  // Reset the inactivity timer
  resetInactivityTimer();
}

function resetInactivityTimer() {
  if (watcherState.inactivityTimer) {
    clearTimeout(watcherState.inactivityTimer);
    watcherState.inactivityTimer = null;
  }

  if (!watcherState.active || watcherState.inactivityTimeoutMs <= 0) return;

  watcherState.inactivityTimer = setTimeout(onInactivityTimeout, watcherState.inactivityTimeoutMs);
  if (watcherState.inactivityTimer.unref) watcherState.inactivityTimer.unref();
}

function onInactivityTimeout() {
  if (!watcherState.active) return;

  watcherState.sleeping = true;

  if (watcherState.onSleep) {
    try { watcherState.onSleep(watcherState.characterId); } catch (e) {
      console.error('[LurkMotionWatcher] onSleep callback error:', e.message);
    }
  }

  // Keep polling! We need to detect motion to wake back up.
  // The inactivity timer is NOT restarted — it only restarts on motion.
}

export default { start, stop, resetActivity, getStatus, isSleeping, isActive };
