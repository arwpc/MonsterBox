/**
 * LED Animation Service — the test/preview engine behind the LED Animation page.
 *
 * The steady-state LED controls (per-state colours, palette, brightness, live
 * pixels) already live in services/ledController.js and its /api/led routes.
 * This module adds the two things the LED Animation page needs that the
 * controller alone doesn't provide:
 *
 *   1. playTtsWithLed() — speak text on the character's speaker and drive the
 *      eye ring from the audio amplitude (colorLow→colorHigh + brightness), the
 *      exact effect jaw sync produces but WITHOUT needing a jaw servo, so it can
 *      be tested on any node that has an LED ring (e.g. PumpkinHead).
 *   2. sweepLed() — a synthetic open→close sweep so the low/high gradient can be
 *      previewed silently.
 *
 * Both drive through services/ledSpeakingSync.js (the same lifecycle the jaw
 * playback paths use) so the eyes behave identically however they are triggered.
 *
 * Character independence: colours and the target ring come from the character's
 * own jaw config (jawAnimation.ledSync — the consolidated home for the low/high
 * colours) and its own parts.json. Nothing is hardcoded to a character.
 */

import * as jawAnimationService from './jawAnimationSuperPowerService.js';
import ledSpeakingSync from './ledSpeakingSync.js';
import elevenLabsTTSService from './elevenLabsTTSService.js';
import { getTTSConfigForCharacter } from './aiConfigStore.js';

const DEFAULT_LOW = [80, 0, 0];
const DEFAULT_HIGH = [255, 120, 0];

// Active TTS-driven LED playbacks, keyed by characterId, so a new play or a stop
// cancels the previous one instead of two timers fighting over the ring.
const activeDrives = new Map();

/**
 * Resolve the low/high colours and the target LED part for a character.
 * Colours come from jawAnimation.ledSync; the part falls back to the character's
 * first led_ring if none is explicitly assigned.
 */
async function resolveLedSync(characterId) {
  const jaw = await jawAnimationService.readJawConfig(characterId).catch(() => ({}));
  const ls = (jaw && jaw.ledSync) || {};
  let partId = ls.partId != null ? ls.partId : null;
  if (partId == null) {
    const parts = await jawAnimationService.getAvailableLedParts(characterId);
    partId = parts.length ? parts[0].id : null;
  }
  // Spread the whole block so the timing knobs (sensitivity/smoothing/attackMs/
  // releaseMs/speed) ride through to ledSpeakingSync.begin, then override the
  // fields we resolve or default here.
  return {
    ...ls,
    partId,
    colorLow: Array.isArray(ls.colorLow) && ls.colorLow.length === 3 ? ls.colorLow : DEFAULT_LOW,
    colorHigh: Array.isArray(ls.colorHigh) && ls.colorHigh.length === 3 ? ls.colorHigh : DEFAULT_HIGH
  };
}

/**
 * Cancel any TTS-driven LED playback for a character and stop its audio.
 */
async function stopLedTts(characterId) {
  const cid = String(characterId);
  const drive = activeDrives.get(cid);
  if (drive) {
    drive.cancelled = true;
    if (drive.timer) { clearTimeout(drive.timer); drive.timer = null; }
    activeDrives.delete(cid);
  }
  await ledSpeakingSync.end(characterId).catch(() => {});
  try {
    const playback = (await import('./serverPlaybackService.js')).default;
    await playback.stopForCharacter(characterId);
  } catch (_) { /* playback may not be active */ }
  return { success: true };
}

/**
 * Preview the low→high gradient with a synthetic open/close sweep — no audio.
 * Unlike jaw's testLedSync this is NOT gated on the jaw-sync "enabled" flag: the
 * LED Animation page tests the ring on demand regardless of whether sync is on.
 */
async function sweepLed(characterId) {
  const sync = await resolveLedSync(characterId);
  if (sync.partId == null) {
    return { success: false, message: 'This character has no LED ring to drive.' };
  }
  const began = await ledSpeakingSync.begin(characterId, { ...sync, enabled: true });  // explicit test — always drive
  if (!began) {
    return { success: false, message: 'Could not drive the ring — the LED daemon may be unavailable.' };
  }
  const FRAMES = 70;
  const STEP_MS = 50;
  for (let i = 0; i < FRAMES; i++) {
    const t = i / (FRAMES - 1);
    const openness = t < 0.5 ? t * 2 : (1 - t) * 2;   // triangle 0→1→0
    ledSpeakingSync.noteLevel(characterId, openness);
    await new Promise((resolve) => setTimeout(resolve, STEP_MS));
  }
  await ledSpeakingSync.end(characterId);
  return { success: true, message: 'Sweep complete' };
}

/**
 * Speak `text` on the character's own speaker and drive the eye ring from the
 * audio amplitude. Returns once analysis is done and playback has been launched;
 * the LED timeline then runs to completion on its own timer. Resolves with the
 * duration so the caller can show progress.
 */
async function playTtsWithLed(characterId, text, options = {}) {
  const loop = !!(options && options.loop);
  const cid = String(characterId);
  await stopLedTts(characterId);   // cancel any prior drive for this character

  // Register THIS drive before the multi-second TTS generation, so a second
  // click's stopLedTts (above) cancels it. Registering only after the awaits
  // let two overlapping calls both slip past the dedup and fight over the ring.
  const drive = { cancelled: false, timer: null };
  activeDrives.set(cid, drive);
  // True once someone else has taken over (a newer drive) or this one was
  // cancelled — bail rather than drive the ring or delete another drive's entry.
  const superseded = () => drive.cancelled || activeDrives.get(cid) !== drive;
  const releaseOwn = () => { if (activeDrives.get(cid) === drive) activeDrives.delete(cid); };

  const sync = await resolveLedSync(characterId);
  if (sync.partId == null) {
    releaseOwn();
    return { success: false, message: 'This character has no LED ring to drive.' };
  }
  if (superseded()) return { success: false, message: 'superseded by a newer request' };

  // Generate speech in the character's own voice.
  const ttsCfg = await getTTSConfigForCharacter(characterId);
  const gen = await elevenLabsTTSService.generateSpeech(String(text).trim(), ttsCfg.voice_id, ttsCfg);
  if (superseded()) return { success: false, message: 'superseded by a newer request' };
  if (!gen.success) {
    releaseOwn();
    return { success: false, message: gen.error || 'TTS generation failed' };
  }

  // Reuse the jaw pre-analyser purely for its per-frame amplitude envelope
  // (frame.amplitude is the perceptually-normalised 0..1 level; the angle it
  // also computes is irrelevant here, so the guardrails are nominal).
  const jawCfg = await jawAnimationService.readJawConfig(characterId).catch(() => ({}));
  let analysis;
  try {
    analysis = await jawAnimationService.preAnalyzeAudio(
      gen.audioBuffer, gen.contentType, jawCfg, { minAngle: 0, maxAngle: 1 }
    );
  } catch (err) {
    releaseOwn();
    return { success: false, message: `Audio analysis failed: ${err.message}` };
  }
  if (superseded()) return { success: false, message: 'superseded by a newer request' };
  if (!analysis.frames.length) {
    releaseOwn();
    return { success: false, message: 'No audio frames to animate' };
  }

  // One pass: play the cached audio and drive the eyes. Each pass RE-READS the
  // config (resolveLedSync) so timing/offset the operator changes mid-loop take
  // effect on the very next pass — the point of the Loop toggle. Explicit test,
  // so force enabled.
  async function iterate() {
    if (drive.cancelled || activeDrives.get(cid) !== drive) return;
    const live = await resolveLedSync(characterId);
    if (drive.cancelled || activeDrives.get(cid) !== drive) return;
    const ok = await ledSpeakingSync.begin(characterId, { ...live, enabled: true });
    if (drive.cancelled || activeDrives.get(cid) !== drive) { ledSpeakingSync.end(characterId).catch(() => {}); return; }
    if (!ok) { releaseOwn(); return; }
    try {
      const playback = (await import('./serverPlaybackService.js')).default;
      playback.playAIOnCharacterSpeaker(gen.audioBuffer, {
        contentType: gen.contentType, characterId
      }).catch((err) => console.error('LED TTS playback error:', err && err.message));
    } catch (err) {
      console.error('Could not start playback for LED TTS:', err.message);
    }
    scheduleLedTimeline(characterId, cid, drive, analysis.frames, live.offsetMs, loop ? onLoopDone : null);
  }

  function onLoopDone() {
    ledSpeakingSync.end(characterId).catch(() => {});
    if (drive.cancelled || activeDrives.get(cid) !== drive) { releaseOwn(); return; }
    // Brief gap between passes so the eyes settle and the audio doesn't overlap.
    drive.timer = setTimeout(function () { iterate().catch(() => {}); }, 500);
  }

  iterate().catch(() => {});

  return {
    success: true,
    duration: analysis.duration,
    frameCount: analysis.frames.length,
    loop: loop,
    timeline: buildLedTimeline(analysis.frames, sync)
  };
}

/**
 * Run the LED timeline: feed each frame's amplitude to the eyes at
 * `frame.time + offsetMs` from the start (offset >0 delays the eyes so they
 * line up with audio that plays a little late; <0 advances them). Ends the LED
 * session and clears the drive when the timeline finishes or is cancelled.
 */
function scheduleLedTimeline(characterId, cid, drive, frames, offsetMs, onComplete) {
  const startTime = Date.now();
  const off = Number(offsetMs) || 0;
  let i = 0;
  function endDrive() {
    ledSpeakingSync.end(characterId).catch(() => {});
    if (activeDrives.get(cid) === drive) activeDrives.delete(cid);
  }
  function step() {
    if (drive.cancelled) { endDrive(); return; }
    if (i >= frames.length) {
      // Natural end: hand off to onComplete (loop) if given, else tear down.
      if (onComplete) onComplete();
      else endDrive();
      return;
    }
    ledSpeakingSync.noteLevel(characterId, frames[i].amplitude);
    i++;
    if (i < frames.length) {
      const delay = Math.max(0, frames[i].time + off - (Date.now() - startTime));
      drive.timer = setTimeout(step, delay);
    } else {
      drive.timer = setTimeout(step, 20);
    }
  }
  drive.timer = setTimeout(step, Math.max(0, off));
}

/**
 * Build the audio-vs-LED comparison timeline for the page's chart: each point is
 * { time, amplitude (audio), ledLevel (what the eyes will show after the timing
 * envelope) }. Downsampled to keep the payload small.
 */
function buildLedTimeline(frames, sync) {
  if (!frames.length) return [];
  const frameMs = frames.length > 1 ? (frames[1].time - frames[0].time) : 20;
  const levels = ledSpeakingSync.computeLedLevels(frames.map((f) => f.amplitude), frameMs, sync);
  const points = frames.map((f, i) => ({ time: f.time, amplitude: f.amplitude, ledLevel: levels[i] }));
  if (points.length <= 200) return points;
  const stride = Math.ceil(points.length / 200);
  return points.filter((_, i) => i % stride === 0);
}

/**
 * Drive the ring from an already-generated audio buffer WITHOUT playing it — the
 * caller (e.g. the conversation route for a character with an LED but no jaw
 * servo) plays the audio itself. Fire-and-forget: returns once the LED timeline
 * has been launched. No-op for a character with no LED ring.
 */
async function driveLedFromBuffer(characterId, audioBuffer, contentType) {
  const cid = String(characterId);
  await stopLedTts(characterId);

  const drive = { cancelled: false, timer: null };
  activeDrives.set(cid, drive);
  const superseded = () => drive.cancelled || activeDrives.get(cid) !== drive;
  const releaseOwn = () => { if (activeDrives.get(cid) === drive) activeDrives.delete(cid); };

  const sync = await resolveLedSync(characterId);
  if (sync.partId == null) { releaseOwn(); return { success: false, message: 'no LED ring' }; }
  if (superseded()) return { success: false, message: 'superseded' };

  const jawCfg = await jawAnimationService.readJawConfig(characterId).catch(() => ({}));
  let analysis;
  try {
    analysis = await jawAnimationService.preAnalyzeAudio(audioBuffer, contentType, jawCfg, { minAngle: 0, maxAngle: 1 });
  } catch (err) {
    releaseOwn();
    return { success: false, message: `Audio analysis failed: ${err.message}` };
  }
  if (superseded()) return { success: false, message: 'superseded' };
  if (!analysis.frames.length) { releaseOwn(); return { success: false, message: 'no frames' }; }

  // Respect the operator's LED-sync toggle here (AI/scene speech path): no-op if
  // they have not turned the eyes' speech reaction on for this character.
  const began = await ledSpeakingSync.begin(characterId, { ...sync });
  if (superseded()) { ledSpeakingSync.end(characterId).catch(() => {}); return { success: false, message: 'superseded' }; }
  if (!began) { releaseOwn(); return { success: false, message: 'could not drive ring' }; }

  scheduleLedTimeline(characterId, cid, drive, analysis.frames, sync.offsetMs);
  return { success: true, duration: analysis.duration, frameCount: analysis.frames.length };
}

/** True if this character has an LED ring (so the caller can decide whether to
 *  drive LED expression). */
async function hasLedRing(characterId) {
  try {
    const parts = await jawAnimationService.getAvailableLedParts(characterId);
    return parts.length > 0;
  } catch (_) { return false; }
}

export default { resolveLedSync, playTtsWithLed, driveLedFromBuffer, hasLedRing, stopLedTts, sweepLed };
