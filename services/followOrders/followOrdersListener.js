/**
 * Follow Orders Listener — transcripts in, orders out.
 *
 * Two transcript sources feed handleTranscript():
 *   1. The STANDALONE listener (primary): a serverSTTListener session this
 *      module owns, running whenever the super-power is enabled and no
 *      conversation session holds the character's microphone.
 *   2. Live conversation sessions: elevenLabsWebSocketService calls
 *      handleTranscript() from its committed_transcript / user_transcript
 *      handlers. While a conversation owns the mic the standalone session
 *      YIELDS (the ReSpeaker tolerates exactly one capture process), and
 *      orders keep flowing through the conversation's own transcripts.
 *
 * Every considered transcript lands in a per-character history ring buffer —
 * the operator's debugging window and the cross-animatronic judge's evidence.
 */
import { readFollowOrdersConfig, buildMatchContext, loadPartsSafe } from './followOrdersSuperPowerService.js';
import { matchOrder } from './orderMatcher.js';
import { executeOrder } from './followOrdersExecutor.js';

const HISTORY_LIMIT = 50;

// characterId(String) -> runtime state
const runtime = new Map();

function stateFor(characterId) {
  const key = String(characterId);
  if (!runtime.has(key)) {
    runtime.set(key, {
      lastOrderAt: 0,
      suppressedUntil: 0,
      standaloneSessionId: null,
      standaloneWanted: false,
      conversationMicHolders: 0,
      history: []
    });
  }
  return runtime.get(key);
}

function pushHistory(state, entry) {
  state.history.push({ at: Date.now(), ...entry });
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
}

export function getHistory(characterId) {
  return stateFor(characterId).history.slice();
}

export function clearHistory(characterId) {
  stateFor(characterId).history.length = 0;
}

/** Hold order execution closed while the character's own voice is playing. */
export function suppressOrders(characterId, durationMs) {
  const state = stateFor(characterId);
  state.suppressedUntil = Math.max(state.suppressedUntil, Date.now() + durationMs);
}

export function getListenerStatus(characterId) {
  const state = stateFor(characterId);
  let listening = 'off';
  if (state.conversationMicHolders > 0) listening = 'conversation';
  else if (state.standaloneSessionId) listening = 'standalone';
  return {
    listening,
    standaloneWanted: state.standaloneWanted,
    lastOrderAt: state.lastOrderAt || null,
    historyCount: state.history.length
  };
}

/**
 * Consider one transcript. Fire-and-forget from the caller's perspective —
 * a matcher or executor fault must never break the transcript pipeline.
 */
export async function handleTranscript(characterId, text, meta = {}) {
  try {
    const config = await readFollowOrdersConfig(characterId);
    if (!config.enabled) return { considered: false, reason: 'disabled' };

    const state = stateFor(characterId);
    const now = Date.now();
    if (now < state.suppressedUntil) {
      pushHistory(state, { source: meta.source || 'unknown', transcript: text, suppressed: true });
      return { considered: false, reason: 'suppressed' };
    }
    if (now - state.lastOrderAt < (config.cooldownMs || 0)) {
      pushHistory(state, { source: meta.source || 'unknown', transcript: text, cooldown: true });
      return { considered: false, reason: 'cooldown' };
    }

    const ctx = await buildMatchContext(characterId);
    const match = matchOrder(text, ctx);

    if (!match.matched) {
      pushHistory(state, { source: meta.source || 'unknown', transcript: text, match });
      return { considered: true, match };
    }

    state.lastOrderAt = now;
    console.log(`[FollowOrders] character ${characterId} obeying (${match.kind}): "${text}"`);
    // Note the spoken order for body-awareness event framing before executing.
    try {
      const bodyState = await import('../bodyStateService.js').then(m => m.default || m);
      bodyState.recordOrder(characterId, text);
    } catch (_) { /* belief tracking never blocks obedience */ }
    const execution = await executeOrder(characterId, match, config);
    pushHistory(state, { source: meta.source || 'unknown', transcript: text, match, execution });

    // Acknowledge (or refuse aloud) after motion starts, never before.
    if (config.ackMode === 'speak') {
      speakAck(characterId, match, execution, config).catch(err =>
        console.warn(`[FollowOrders] ack failed for character ${characterId}: ${err.message}`));
    }

    return { considered: true, match, execution };
  } catch (err) {
    console.warn(`[FollowOrders] handleTranscript failed for character ${characterId}: ${err.message}`);
    return { considered: false, reason: 'error', error: err.message };
  }
}

// Reason → spoken refusal, assembled from data (no character names in code).
const REFUSAL_TEXT = {
  physical_fault: 'I cannot. That part of me is broken.',
  blocked: 'I cannot. That part is forbidden to move.',
  excluded_from_automated_control: 'I will not move that part on a voice command.',
  uncalibrated: 'I cannot. That part has never been measured.',
  servo_busy: 'Not now. That part is otherwise engaged.',
  no_retract_below_min: 'I cannot pull that in any further.',
  unknown_part: 'I do not have such a part.',
  no_sound_configured: 'I have nothing to play.'
};

async function speakAck(characterId, match, execution, config) {
  let text;
  if (execution && execution.success) {
    const phrases = (config.ackPhrases && config.ackPhrases.length) ? config.ackPhrases : ['As you command.'];
    text = phrases[Math.floor(Math.random() * phrases.length)];
  } else {
    const reason = execution && (execution.reason || (execution.detail && execution.detail.reason));
    text = (config.refusalPhrases && config.refusalPhrases.length)
      ? config.refusalPhrases[Math.floor(Math.random() * config.refusalPhrases.length)]
      : (REFUSAL_TEXT[reason] || 'I cannot do that.');
  }

  // Suppress BOTH listening paths before a single sample plays, or the
  // character hears its own acknowledgment as the next order.
  const estimatedMs = (text.split(/\s+/).length * 150) + 2500;
  suppressOrders(characterId, estimatedMs);
  try {
    const ws = await import('../elevenLabsWebSocketService.js').then(m => m.default || m);
    ws.suppressMicForCharacter(characterId, estimatedMs);
  } catch (_) { /* WS service not running — standalone suppression is enough */ }

  if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') return;

  const { getTTSConfigForCharacter } = await import('../aiConfigStore.js');
  const ttsService = await import('../elevenLabsTTSService.js').then(m => m.default || m);
  const ttsCfg = await getTTSConfigForCharacter(characterId);
  const gen = await ttsService.generateSpeech(text, ttsCfg.voice_id, ttsCfg);
  if (!gen.success) throw new Error(gen.error || 'TTS generation failed');

  // Jaw-synced when the jaw super-power is armed, same as /conversation/api/say.
  try {
    const jaw = await import('../jawAnimationSuperPowerService.js');
    const jawConfig = await jaw.readJawConfig(characterId);
    if (jawConfig.enabled && jawConfig.servoPartId) {
      await jaw.playWithJawSync(characterId, gen.audioBuffer, gen.contentType);
      return;
    }
  } catch (_) { /* fall through to plain playback */ }

  const playback = await import('../serverPlaybackService.js').then(m => m.default || m);
  const play = await playback.playBufferOnCharacterSpeaker(gen.audioBuffer, {
    contentType: gen.contentType, characterId
  });
  if (!play.success) throw new Error(play.error || 'Playback failed');
}

/** The character's microphone device id, from its own parts.json. */
async function microphoneDeviceFor(characterId) {
  const parts = await loadPartsSafe(characterId);
  const mic = parts.find(p => String(p.type || '').replace(/-/g, '_') === 'microphone' && p.enabled !== false);
  const cfg = (mic && mic.config) || {};
  return cfg.deviceId || cfg.inputDevice || cfg.audioDeviceId || 'default';
}

/**
 * Start the standalone STT listener for a character. No-op when already
 * running or while a conversation session holds the microphone (it will
 * resume automatically when the conversation ends).
 */
export async function startStandaloneListener(characterId) {
  const state = stateFor(characterId);
  state.standaloneWanted = true;
  if (state.standaloneSessionId) return { started: false, reason: 'already_running' };
  if (state.conversationMicHolders > 0) return { started: false, reason: 'yielded_to_conversation' };

  const config = await readFollowOrdersConfig(characterId);
  if (!config.enabled) return { started: false, reason: 'disabled' };

  const listener = await import('../serverSTTListener.js').then(m => m.default || m);
  const deviceId = await microphoneDeviceFor(characterId);
  // startSession returns { success, sessionId } -- NOT a bare id. Assigning the whole
  // object here meant stopStandaloneListener() later called stopSession(<object>) on a
  // Map keyed by string, which always missed: turning Follow Orders OFF left the
  // session running and the microphone held. On a ReSpeaker XVF3800 only one holder
  // can capture at a time, so that orphan blocks the conversation path outright, and
  // _cleanupOldSessions() cannot reap a session whose id was never recorded.
  const started = listener.startSession({
    deviceId,
    model: 'scribe_v2',
    language: 'en',
    onUtterance: (text) => {
      handleTranscript(characterId, text, { source: 'standalone' }).catch(() => { });
    }
  });
  const sessionId = started && started.sessionId ? started.sessionId : null;
  if (!sessionId) {
    console.warn(`[FollowOrders] STT listener did not return a session id for character ${characterId}; not tracking a session we cannot stop`);
    return { started: false, reason: 'no-session-id' };
  }
  state.standaloneSessionId = sessionId;
  console.log(`[FollowOrders] standalone listener up for character ${characterId} (device ${deviceId}, session ${sessionId})`);
  return { started: true, sessionId };
}

export async function stopStandaloneListener(characterId, { keepWanted = false } = {}) {
  const state = stateFor(characterId);
  if (!keepWanted) state.standaloneWanted = false;
  if (!state.standaloneSessionId) return { stopped: false };
  try {
    const listener = await import('../serverSTTListener.js').then(m => m.default || m);
    const res = listener.stopSession(state.standaloneSessionId);
    if (!res || res.success !== true) {
      // Say so loudly rather than logging "listener down" over a mic that is still open.
      console.warn(`[FollowOrders] stopSession(${state.standaloneSessionId}) did not confirm: ${res && res.error ? res.error : 'unknown'} — the microphone may still be held`);
    }
  } catch (err) {
    console.warn(`[FollowOrders] failed stopping standalone session: ${err.message}`);
  }
  console.log(`[FollowOrders] standalone listener down for character ${characterId}`);
  state.standaloneSessionId = null;
  return { stopped: true };
}

/**
 * Conversation mic ownership signals, called by elevenLabsWebSocketService.
 * One capture process per device: yield on start, resume on stop.
 */
export function onConversationMicStart(characterId) {
  if (characterId == null) return;
  const state = stateFor(characterId);
  state.conversationMicHolders += 1;
  if (state.standaloneSessionId) {
    stopStandaloneListener(characterId, { keepWanted: true }).catch(() => { });
    console.log(`[FollowOrders] yielded microphone to conversation session (character ${characterId})`);
  }
}

export function onConversationMicStop(characterId) {
  if (characterId == null) return;
  const state = stateFor(characterId);
  state.conversationMicHolders = Math.max(0, state.conversationMicHolders - 1);
  if (state.conversationMicHolders === 0 && state.standaloneWanted) {
    // Small delay so the conversation's capture process fully releases the
    // device before the standalone session opens it.
    setTimeout(() => {
      startStandaloneListener(characterId).catch(err =>
        console.warn(`[FollowOrders] resume after conversation failed: ${err.message}`));
    }, 1500);
  }
}

/**
 * Server-boot arming: start the standalone listener when the super-power is
 * already enabled for this node's character. The caller passes the character
 * id (server.js knows its selected character) — this module never reads
 * selectedCharacter itself.
 */
export async function initFollowOrders(characterId) {
  if (characterId == null) return;
  try {
    const config = await readFollowOrdersConfig(characterId);
    if (config.enabled) {
      await startStandaloneListener(characterId);
    }
  } catch (err) {
    console.warn(`[FollowOrders] init failed for character ${characterId}: ${err.message}`);
  }
}

export default {
  handleTranscript,
  suppressOrders,
  getHistory,
  clearHistory,
  getListenerStatus,
  startStandaloneListener,
  stopStandaloneListener,
  onConversationMicStart,
  onConversationMicStop,
  initFollowOrders
};
