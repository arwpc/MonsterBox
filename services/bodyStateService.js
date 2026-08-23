/**
 * Body State Service — proprioception by intent.
 *
 * Tracks what each character's body was last COMMANDED to do (there are no
 * encoders, so this is belief, not measurement) and renders it as short
 * speakable sentences. The conversation layer feeds these to the ElevenLabs
 * agent as contextual updates, so a character ordered to raise its arm knows
 * the arm is up and can talk about it.
 *
 * Deliberately in-memory only (SD-card discipline): state resets on service
 * restart, which is honest — after a restart nobody knows where the parts
 * physically sit until something commands them again.
 */
import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

// String(characterId) -> {
//   parts: Map<partId, { partName, type, semantic, value, at, source }>,
//   lastPose:    { name, at }    | null,
//   lastGesture: { id, at }      | null,
//   lastOrder:   { transcript, at } | null
// }
const states = new Map();

function stateFor(characterId) {
  const key = String(characterId);
  if (!states.has(key)) {
    states.set(key, { parts: new Map(), lastPose: null, lastGesture: null, lastOrder: null });
  }
  return states.get(key);
}

/** Speakable label for a raw controlPart action when no verb is known. */
function semanticForAction(action, params = {}) {
  switch (action) {
    case 'turnOn': return 'on';
    case 'turnOff': return 'off';
    case 'toggle': return 'toggled';
    case 'extend': return 'extended';
    case 'retract': return 'retracted';
    case 'stop': return 'stopped';
    case 'moveToAngle': return typeof params.angleDeg === 'number' ? `at ${Math.round(params.angleDeg)} degrees` : 'moved';
    case 'control': return params.direction === 'backward' || params.direction === 'reverse' ? 'running backward' : 'running forward';
    case 'play': return 'playing a sound';
    default: return null;
  }
}

/** Verb-level semantics from a follow-orders execution — the richest signal. */
const VERB_SEMANTIC = {
  open: 'raised',
  close: 'lowered',
  on: 'glowing',
  off: 'dark',
  toggle: 'toggled',
  quiet: 'silent',
  play: 'playing a sound',
  stop: 'stopped'
};

/**
 * Record one part-level state change. `info.semantic` wins when provided;
 * otherwise it is derived from the action. Never throws.
 */
export function recordPartAction(characterId, part, info = {}) {
  try {
    if (characterId == null || !part || part.partId == null) return;
    const semantic = info.semantic
      || (info.verb && VERB_SEMANTIC[info.verb])
      || semanticForAction(info.action, info.params);
    if (!semantic) return;
    const state = stateFor(characterId);
    state.parts.set(String(part.partId), {
      partName: part.partName || part.name || `part ${part.partId}`,
      type: part.type || 'part',
      semantic,
      value: info.value ?? null,
      at: Date.now(),
      source: info.source || 'unknown'
    });
    emitter.emit('change', { characterId, kind: 'part', partId: String(part.partId), source: info.source });
  } catch (_) { /* state tracking must never break the motion path */ }
}

export function recordPose(characterId, poseName, info = {}) {
  try {
    if (characterId == null || !poseName) return;
    const state = stateFor(characterId);
    state.lastPose = { name: poseName, at: Date.now() };
    emitter.emit('change', { characterId, kind: 'pose', poseName, source: info.source });
  } catch (_) { /* noop */ }
}

export function recordGesture(characterId, gestureId, info = {}) {
  try {
    if (characterId == null || !gestureId) return;
    const state = stateFor(characterId);
    state.lastGesture = { id: gestureId, at: Date.now() };
    emitter.emit('change', { characterId, kind: 'gesture', gestureId, source: info.source });
  } catch (_) { /* noop */ }
}

/** Note the spoken order itself, so updates can be event-framed. */
export function recordOrder(characterId, transcript) {
  try {
    if (characterId == null) return;
    stateFor(characterId).lastOrder = { transcript, at: Date.now() };
  } catch (_) { /* noop */ }
}

/**
 * One short paragraph of current body state for conversation start.
 * Addressed to the agent in second person; assembled purely from data.
 */
export function summarize(characterId) {
  const state = states.get(String(characterId));
  if (!state) return null;
  const sentences = [];
  for (const info of state.parts.values()) {
    sentences.push(`Your ${info.partName} is ${info.semantic}.`);
  }
  if (state.lastPose) sentences.push(`You are holding your "${state.lastPose.name}" pose.`);
  if (!sentences.length) return null;
  return sentences.join(' ');
}

/**
 * One sentence describing the latest change to a part, event-framed when it
 * came from a spoken order. Returns { text, contextId } — contextId keys the
 * ElevenLabs contextual update so newer state supersedes older for the same
 * part instead of piling up.
 */
export function describeChange(characterId, partId) {
  const state = states.get(String(characterId));
  const info = state && state.parts.get(String(partId));
  if (!info) return null;
  const orderRecent = state.lastOrder && (Date.now() - state.lastOrder.at) < 10000;
  const text = info.source === 'follow-orders' && orderRecent
    ? `You just obeyed a spoken order ("${state.lastOrder.transcript}"): your ${info.partName} is now ${info.semantic}.`
    : `Your ${info.partName} is now ${info.semantic}.`;
  return { text, contextId: `body_state_part_${partId}` };
}

export function describePose(characterId) {
  const state = states.get(String(characterId));
  if (!state || !state.lastPose) return null;
  const orderRecent = state.lastOrder && (Date.now() - state.lastOrder.at) < 10000;
  const text = orderRecent
    ? `You just obeyed a spoken order ("${state.lastOrder.transcript}"): you moved into your "${state.lastPose.name}" pose.`
    : `You moved into your "${state.lastPose.name}" pose.`;
  return { text, contextId: 'body_state_pose' };
}

export function getBodyState(characterId) {
  const state = states.get(String(characterId));
  if (!state) return { parts: [], lastPose: null, lastGesture: null };
  return {
    parts: [...state.parts.entries()].map(([partId, info]) => ({ partId, ...info })),
    lastPose: state.lastPose,
    lastGesture: state.lastGesture
  };
}

export function clearBodyState(characterId) {
  states.delete(String(characterId));
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function onChange(cb) {
  emitter.on('change', cb);
  return () => emitter.off('change', cb);
}

export default {
  recordPartAction,
  recordPose,
  recordGesture,
  recordOrder,
  summarize,
  describeChange,
  describePose,
  getBodyState,
  clearBodyState,
  onChange
};
