/**
 * MonsterBox - ElevenLabs WebSocket Conversation Service
 * Real-time streaming conversation with immediate responses
 * 
 * Upgraded: Uses Scribe v2 Realtime for live STT instead of batch transcription
 */

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { getSTTConfig } from './aiConfigStore.js';
import { readConfig } from './configService.js';
import elevenLabsConfigService from './elevenLabsConfigService.js';
import elevenLabsSTTService from './elevenLabsSTTService.js';
import realtimeSTTService from './elevenLabsRealtimeSTTService.js';
import randomPoseService from './randomPoseService.js';
import serverPlaybackService from './serverPlaybackService.js';
import serverSTTListener from './serverSTTListener.js';
import * as jawAnimationService from './jawAnimationSuperPowerService.js';
import gestureEngineService from './gestureEngineService.js';
import { recordSpeech } from './speechLogService.js';

// Absolute floor below which a frame is never treated as speech, whatever the
// adaptive estimate says.
const VOICE_ACTIVITY_RMS = 0.02;

// How much louder than the measured noise floor a frame must be to count as the
// guest speaking. A fixed threshold does not work here: this node's USB audio
// adapter has a constant preamp hiss around 0.027 RMS, ABOVE the old fixed 0.02,
// so the gate could never close and Scribe kept transcribing the hiss as "...".
// Measured on this node's USB audio adapter: floor ~0.027, speech 0.069-0.195 —
// a 2x margin separates them cleanly while adapting to any quieter or noisier
// install, which is why the threshold is derived rather than hardcoded.
const VOICE_GATE_MARGIN = 2.0;

// How long a frame's worth of voice keeps the gate open after the guest stops.
// Long enough to bridge the pauses inside a sentence, short enough that room
// tone and servo whine never accumulate into a "turn" the agent tries to answer.
const MIC_GATE_HANGOVER_MS = 900;

// Set MB_MIC_VOICE_GATE=0 to stream the raw microphone regardless.
const MIC_VOICE_GATE_ENABLED = process.env.MB_MIC_VOICE_GATE !== '0';

// ---------------------------------------------------------------------------
// Barge-in (talking over the character)
//
// The characters were "hard to speak over" for a structural reason, not a
// tuning one: while the character speaks, the mic loop below replaces the real
// microphone with synthetic room floor before it leaves the node. That is
// deliberate and must stay — it is what stops the character's own reply tail
// and the servo whine beside the mic being transcribed back as guest turns. But
// it also means the agent's own turn model literally cannot hear the guest, so
// the 'interruption' event it would otherwise send can never fire. Barge-in has
// to be detected HERE, on frames we are already computing RMS for.
//
// The threshold is learned, never fixed. Nodes differ enormously: an XVF3800
// array does hardware echo cancellation, so the character's own voice comes
// back attenuated, while a bare USB mic hears it at full volume. So we learn an
// ECHO FLOOR from the suppressed frames themselves — i.e. how loud this node
// sounds to itself while talking — and demand a frame clearly above that.
const BARGE_IN_ENABLED = process.env.MB_BARGE_IN !== '0';

// How far above the learned echo floor a frame must sit to count as someone
// else talking. Mirrors VOICE_GATE_MARGIN's job on the noise floor.
const BARGE_IN_MARGIN = 2.2;

// An absolute floor, so a silent node that has learned a near-zero echo floor
// cannot be interrupted by its own faint hiss.
const BARGE_IN_RMS_FLOOR = 0.05;

// Frames are ~250ms, so 3 consecutive frames is ~750ms of sustained speech.
// Hysteresis is what keeps a door slam, a laugh or one loud consonant from
// cutting the character off mid-sentence.
const BARGE_IN_FRAMES = 3;

// The character always gets its opening words out. Without this, the tail of
// the guest's own question — still echoing in the room as the reply starts —
// immediately interrupts the reply it just triggered.
const BARGE_IN_GRACE_MS = 700;

/**
 * Should this frame, in this state, count as the guest talking over the
 * character? Pure and exported so the thresholds can be unit-tested without a
 * socket, a microphone or a node.
 *
 * @param {object} state  { echoFloor, bargeInFrames, speechStartedAt }
 * @param {number} frameRms  0..1 energy of the current frame
 * @param {number} now  epoch ms
 * @returns {{ over: boolean, bargeIn: boolean, threshold: number }}
 */
export function shouldBargeIn(state, frameRms, now) {
    const echoFloor = state && Number.isFinite(state.echoFloor) ? state.echoFloor : 0;
    const threshold = Math.max(BARGE_IN_RMS_FLOOR, echoFloor * BARGE_IN_MARGIN);
    const over = frameRms > threshold;

    // Inside the grace window a loud frame is counted but never fires, so the
    // run has to survive past the grace period to interrupt.
    const startedAt = state && state.speechStartedAt ? state.speechStartedAt : 0;
    const past = !startedAt || (now - startedAt) >= BARGE_IN_GRACE_MS;

    const run = over ? ((state && state.bargeInFrames) || 0) + 1 : 0;
    return { over, bargeIn: past && run >= BARGE_IN_FRAMES, threshold, run };
}

/**
 * Is an agent turn a REPLY to something we asked, or the agent's unprompted
 * opening greeting?
 *
 * A fresh agent socket always opens with the configured first_message as its own
 * turn, before the answer to the question just sent. ElevenLabs distinguishes
 * them: a reply names the message it answers in `in_response_to_ids`; the
 * unprompted greeting carries an empty list.
 *
 * Absent field => ANSWER, deliberately. An agent or API version that does not
 * report the field must keep behaving exactly as it did before rather than
 * having every one of its turns discarded as a greeting, which would make the
 * character fall silent. This layer may only ever suppress a greeting; it must
 * never be able to suppress a real answer.
 *
 * Pure and exported for tests.
 */
export function isAnswerTurn(agentResponseEvent) {
    const ids = agentResponseEvent && agentResponseEvent.in_response_to_ids;
    return !Array.isArray(ids) || ids.length > 0;
}

// ---------------------------------------------------------------------------
// Duplex mode (mission D1)
//
// FULL duplex: the real microphone reaches the agent while the character
// speaks, and the agent's own turn model decides when the guest has
// interrupted (its `interruption` event). Only safe where the microphone
// cancels the character's own voice in hardware: the ReSpeaker XVF3800 is one
// USB device for both directions, so its DSP knows what is being played and
// subtracts it. Decided from the microphone/speaker parts, never from a
// character or a node.
//
// HALF duplex: no echo cancellation (a webcam mic, a bare USB adapter). The
// character's own voice would come straight back as "guest speech", so the
// agent keeps receiving silence while it speaks; an echo-aware local detector
// is the only way a guest can cut in, and the mic reopens at most
// HALF_DUPLEX_TAIL_MS after the speaker falls silent (it used to be 2.5 s, long
// enough to swallow a guest answering the character's closing question).
// ---------------------------------------------------------------------------
export const HALF_DUPLEX_TAIL_MS = 400;

const XVF3800_PATTERN = /xvf[\s_-]?3800/i;

function _partStrings(part) {
    if (!part) return '';
    const cfg = part.config || {};
    return [part.name, part.model, part.modelId, part.inputDevice, part.outputDevice,
        cfg.deviceId, cfg.inputDevice, cfg.audioDeviceId, cfg.outputDevice, cfg.modelId, cfg.model]
        .filter(v => typeof v === 'string').join(' ');
}

function _normaliseDuplex(value) {
    const v = String(value == null ? '' : value).trim().toLowerCase();
    if (v === 'full' || v === 'full-duplex' || v === 'duplex' || v === 'aec') return 'full';
    if (v === 'half' || v === 'half-duplex' || v === 'simplex') return 'half';
    return null;
}

/**
 * Decide a session's duplex mode from the character's audio parts.
 * Pure and exported for tests.
 *
 * Precedence: explicit override (env MB_CONVERSATION_DUPLEX, or `duplex` on the
 * microphone part's config) > hardware detection. Detection says FULL only when
 * the microphone is an XVF3800 AND the speaker is not explicitly some other
 * device: the array cancels only what it plays itself, so an XVF3800 mic next
 * to a separate USB speaker has no echo reference at all. A speaker of
 * "default" (or none) is trusted to be the array, which is how several
 * XVF3800 nodes are configured.
 *
 * @returns {{ mode: 'full'|'half', reason: string, source: 'override'|'detected' }}
 */
export function detectDuplexMode({ micPart = null, speakerPart = null, override = null } = {}) {
    const forced = _normaliseDuplex(override);
    if (forced) return { mode: forced, reason: `override=${override}`, source: 'override' };
    const partForced = _normaliseDuplex(micPart && micPart.config && micPart.config.duplex);
    if (partForced) return { mode: partForced, reason: `microphone part config.duplex=${micPart.config.duplex}`, source: 'override' };

    const micText = _partStrings(micPart);
    if (!micPart || !XVF3800_PATTERN.test(micText)) {
        return { mode: 'half', reason: micPart ? `microphone "${micPart.name || micPart.id}" has no hardware echo cancellation` : 'no microphone part', source: 'detected' };
    }
    const spkCfg = (speakerPart && speakerPart.config) || {};
    const spkDevice = spkCfg.audioDeviceId || spkCfg.deviceId || spkCfg.outputDevice || (speakerPart && speakerPart.outputDevice) || 'default';
    if (spkDevice && spkDevice !== 'default' && !XVF3800_PATTERN.test(String(spkDevice))) {
        return { mode: 'half', reason: `XVF3800 microphone but speaker is "${spkDevice}" (no echo reference)`, source: 'detected' };
    }
    return { mode: 'full', reason: `XVF3800 microphone, speaker=${spkDevice === 'default' ? 'default (assumed the array)' : 'array'}`, source: 'detected' };
}

// Echo-aware barge-in for half-duplex nodes. The old detector compared each
// frame with the QUIETEST frame heard while the character spoke, so every
// louder passage of the character's own voice looked like a guest talking
// over it (self-interruptions, KNOWN-BUGS). This one predicts the echo from
// what is being played right now: expected = coupling x playback level, where
// coupling (mic RMS per unit of playback RMS) is learned from the frames
// themselves. A guest must sit clearly above the PREDICTED echo.
const ECHO_COUPLING_RISE = 0.3;
const ECHO_COUPLING_FALL = 0.05;
// Full duplex: while the character speaks, real mic audio reaches the agent only
// when it clears the PREDICTED echo by this much. Hardware AEC is not perfect:
// measured live on an XVF3800 node the residual was ~0.4 x the playback level,
// enough for the agent to transcribe the character's own lines and interrupt
// itself.
const FULL_DUPLEX_ECHO_MARGIN = 3.0;
const ECHO_MIN_PLAYBACK_RMS = 0.01;

/**
 * Pure and exported for tests.
 * @param {object} state { coupling, bargeInFrames, speechStartedAt, learnFrames }
 * @param {number} micRms     0..1 energy of the mic frame
 * @param {number} playbackRms 0..1 energy of what the speaker played during that frame (+ reverb window)
 * @param {number} now epoch ms
 * @returns {{ bargeIn, run, threshold, expectedEcho, coupling, learnFrames }}
 */
export function echoAwareBargeIn(state, micRms, playbackRms, now) {
    const s = state || {};
    let coupling = Number.isFinite(s.coupling) ? s.coupling : null;
    let learnFrames = s.learnFrames || 0;
    const playing = playbackRms > ECHO_MIN_PLAYBACK_RMS;
    const startedAt = s.speechStartedAt || 0;
    const inGrace = !!startedAt && (now - startedAt) < BARGE_IN_GRACE_MS;

    const expectedEcho = coupling != null ? coupling * playbackRms : 0;
    const threshold = Math.max(BARGE_IN_RMS_FLOOR, expectedEcho * BARGE_IN_MARGIN);
    const over = coupling != null && micRms > threshold;

    // Learn coupling only from frames that look like echo: while playing, and
    // never from a frame that is itself a candidate interruption. The first
    // frames seed it with the MAX ratio seen (conservative: a guest is rarely
    // talking over the first syllables, and over-estimating echo only makes
    // the character harder to interrupt, never self-interrupting).
    if (playing) {
        const ratio = micRms / playbackRms;
        if (coupling == null || learnFrames < 3) {
            coupling = coupling == null ? ratio : Math.max(coupling, ratio);
            learnFrames += 1;
        } else if (!over) {
            // Upper envelope, not a mean: rise fast, fall slowly. The echo
            // ratio swings frame to frame (reverb tails, syllable onsets); a
            // mean let ~1 frame in 3 of the character's own voice through the
            // full-duplex gate on an XVF3800 array (self-transcripts, measured
            // 2026-10-10, coupling ~0.4).
            const a = ratio > coupling ? ECHO_COUPLING_RISE : ECHO_COUPLING_FALL;
            coupling = coupling + a * (ratio - coupling);
            learnFrames += 1;
        }
    }

    const run = (over && !inGrace) ? (s.bargeInFrames || 0) + 1 : 0;
    return {
        bargeIn: run >= BARGE_IN_FRAMES,
        run, threshold, expectedEcho, coupling, learnFrames
    };
}

/**
 * Audio of an interrupted response must never reach the speaker, even when it
 * arrives after the interruption. ElevenLabs numbers events monotonically and
 * the interruption carries the id the conversation resumes from; the official
 * client plays only audio with event_id >= that id. Pure and exported.
 */
export function isInterruptedAudio(eventId, resumeFromEventId) {
    if (resumeFromEventId == null || eventId == null) return false;
    const e = Number(eventId), r = Number(resumeFromEventId);
    if (!Number.isFinite(e) || !Number.isFinite(r)) return false;
    return e < r;
}

/** Did the server refuse our empty first_message override? Pure and exported. */
export function isFirstMessageOverrideRefusal(code, reason) {
    return Number(code) === 1008 && /first_message/i.test(String(reason || ''));
}

/** Backoff for headless reconnects: 1 s, 2 s, 5 s, 10 s, then 30 s. Pure and exported. */
export function reconnectDelayMs(attempt) {
    const steps = [1000, 2000, 5000, 10000, 30000];
    const i = Math.max(0, Math.min(steps.length - 1, (attempt | 0)));
    return steps[i];
}

/**
 * A transcript of pure punctuation ("...", "-") is the agent's ASR hearing
 * room noise, not a guest. It must not count as guest activity (it would keep
 * an empty yard "awake" forever). Pure and exported.
 */
export function isNoiseTranscript(text) {
    return !/[A-Za-z0-9À-ɏ]/.test(String(text || ''));
}

/** p50/p90 of a numeric list (nulls ignored). Pure and exported. */
export function percentiles(values) {
    const v = (values || []).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return { n: 0, p50: null, p90: null };
    const pick = (q) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1) + 0.5))];
    return { n: v.length, p50: pick(0.5), p90: pick(0.9) };
}

const TURN_HISTORY_MAX = 20;
// A "speech end" older than this before the transcript is not this turn's.
const SPEECH_END_MAX_AGE_MS = 15000;
const AGENT_ACTIVITY_THROTTLE_MS = 2000;
const BODY_STATE_MIN_INTERVAL_MS = 5000;
// One-shot asks: the answer is complete once its audio has gone quiet this long
// (unless the agent says so first with agent_response_complete).
const ONE_SHOT_SETTLE_MS = 900;
// A live-session ask waits at most this long for its reply to finish playing.
const ASK_PLAYOUT_CAP_MS = 90000;
// No answer audio at all by now: give up (the caller is answered with text).
const ONE_SHOT_NO_ANSWER_MS = 30000;
// Absolute ceiling for a one-shot, including playing the answer out.
const ONE_SHOT_CEILING_MS = 120000;
// First-message override refusals are remembered this long, then retried, so
// the fast path comes back by itself once the agent allows the override.
const FIRST_MESSAGE_REFUSAL_TTL_MS = 10 * 60 * 1000;

// Set MB_WS_DEBUG=1 to dump per-message WebSocket payload previews. Default
// silent: every conversation message otherwise lands in monsterbox.log and
// wears the SD card.
const WS_DEBUG = process.env.MB_WS_DEBUG === '1';

// Ceiling on waiting for a reply on a live session before the HTTP caller is
// answered with whatever text arrived. Never let a silent agent hang a request.
const ASK_REPLY_TIMEOUT_MS = 30000;

// Quiet after the last audio chunk before a reply is considered complete.
const ASK_SETTLE_MS = 1500;

// 250ms of pcm_16000 at the noise floor. Injected text alone does not close a
// turn — the turn model commits on an audio edge — so this frame is sent right
// after a question to make the agent actually answer. Dithered rather than pure
// zeroes because a perfectly silent buffer reads as a dead stream, not a quiet room.
// 500ms of pcm_16000 silence. Injected text alone does not close a turn — the
// turn model commits on an audio edge — so this is sent right after a text
// question to make the agent actually answer (measured: no reply at all after
// 70s without it).
const TURN_COMMIT_FRAME_B64 = Buffer.alloc(8000 * 2).toString('base64');

// Filler audio for the closed voice gate: TRUE digital silence, not dither.
// Dither keeps the stream alive but ASR transcribes a constant low-level hiss as
// "..." — which becomes a spurious guest turn, exactly the bug being fixed.
// Zeroes give the turn model an unambiguous silence edge (so it commits the
// guest's turn promptly) and give ASR nothing to hallucinate on.
// Cached per length because the mic loop re-frames to one fixed size.
const _floorFrameCache = new Map();
function _floorFrameB64(byteLength) {
    const cached = _floorFrameCache.get(byteLength);
    if (cached) return cached;
    const b64 = Buffer.alloc(byteLength).toString('base64');
    if (_floorFrameCache.size < 8) _floorFrameCache.set(byteLength, b64);
    return b64;
}

/**
 * Log the breakdown of one turn: how long each hop took between the guest
 * falling silent and the character's first sound.
 *
 * A single end-to-end number ("about 12 seconds") is not actionable — it does
 * not say whether to tune end-of-turn detection, the LLM, or TTS. These four
 * deltas do.
 */
export function turnMetrics(t) {
    const d = (a, b) => (Number.isFinite(a) && Number.isFinite(b)) ? Math.round(b - a) : null;
    const anchor = t.speechEndMs || t.transcriptAtMs;
    return {
        speechEndToTranscriptMs: d(t.speechEndMs, t.transcriptAtMs),
        transcriptToFirstAudioMs: d(t.transcriptAtMs, t.firstAudioAtMs),
        firstAudioToPlaybackMs: d(t.firstAudioAtMs, t.playbackStartAtMs),
        speechEndToPlaybackMs: d(anchor, t.playbackStartAtMs),
        replyMs: d(t.playbackStartAtMs, t.playbackEndAtMs)
    };
}

/** One compact log line per turn. Pure and exported for tests. */
export function formatTurnLine(t) {
    const m = turnMetrics(t);
    const f = (v) => (v == null ? '-' : `${v}ms`);
    return `⏱️  [turn] char=${t.characterId} src=${t.source || 'speech'} mode=${t.mode || '?'} ` +
        `speechEnd→transcript=${f(m.speechEndToTranscriptMs)} transcript→audio=${f(m.transcriptToFirstAudioMs)} ` +
        `audio→play=${f(m.firstAudioToPlaybackMs)} TOTAL=${f(m.speechEndToPlaybackMs)} reply=${f(m.replyMs)} ` +
        `interrupted=${t.interrupted ? 'yes' : 'no'}${t.muted ? ' muted' : ''}${t.coldStart ? ' cold-player' : ''}`;
}

// Minimal WAV encoder for PCM16LE mono (16kHz)
function encodeWavPCM16LE(rawPcm, sampleRate = 16000, channels = 1) {
    try {
        const dataLen = rawPcm.length;
        const blockAlign = channels * 2;
        const byteRate = sampleRate * blockAlign;
        const header = Buffer.alloc(44);
        header.write('RIFF', 0);
        header.writeUInt32LE(36 + dataLen, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);
        header.writeUInt16LE(1, 20);
        header.writeUInt16LE(channels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(16, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataLen, 40);
        return Buffer.concat([header, rawPcm]);
    } catch (_) {
        return Buffer.alloc(0);
    }
}


// Simple heuristics to reduce false STT when expecting English only
function _isBracketedSfx(text) {
    try { return /^\s*\([^)]{1,120}\)\s*$/.test(text); } catch (_) { return false; }
}
function _isLikelyEnglish(text, config) {
    try {
        if (!text) return false;

        // Get configuration values or use defaults
        const minLetterRatio = (config && config.minLetterRatio) ? (config.minLetterRatio / 100) : 0.55;
        const requireVowels = (config && config.requireVowels !== false); // default true

        // Drop if any non-ASCII present (catches many other scripts and emojis)
        if (/[^\x00-\x7F]/.test(text)) return false;
        // Keep if mostly letters/digits/basic punctuation
        var compact = String(text).replace(/\s+/g, '');
        if (!compact) return false;
        var letters = (compact.match(/[A-Za-z]/g) || []).length;
        var total = compact.length;
        if (!letters) return false;
        var ratio = letters / total;
        if (ratio < minLetterRatio) return false;
        // Require at least one vowel to avoid SFX-like tokens (if enabled)
        if (requireVowels && !/[AEIOUaeiou]/.test(text)) return false;
        return true;
    } catch (_) { return false; }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolvePartsPath() {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        if (cfg && cfg.dataPath) {
            return path.resolve(appRoot, cfg.dataPath, 'parts.json');
        }
        return path.resolve(appRoot, 'data', 'parts.json');
    } catch (e) {
        const appRoot = path.resolve(__dirname, '..');
        return path.resolve(appRoot, 'data', 'parts.json');
    }
}

async function resolveCharactersPath() {
    try {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        if (cfg && cfg.dataPath) {
            return path.resolve(appRoot, cfg.dataPath, 'characters.json');
        }
        return path.resolve(appRoot, 'data', 'characters.json');
    } catch (e) {
        const appRoot = path.resolve(__dirname, '..');
        return path.resolve(appRoot, 'data', 'characters.json');
    }
}

async function getAgentIdForCharacter(characterId) {
    // The agent registry is fleet-wide, but resolveCharactersPath() joins
    // cfg.dataPath, which points at the SELECTED character's directory. On a node
    // whose dataPath holds a stale per-character copy (e.g. a test fixture), that
    // copy shadowed the real registry and agent resolution always returned null.
    // Check the dataPath copy first (so a deliberate override still wins), then
    // fall back to the canonical fleet registry at data/characters.json.
    const appRoot = path.resolve(__dirname, '..');
    const candidates = [];
    try { candidates.push(await resolveCharactersPath()); } catch (_) { /* noop */ }
    const rootRegistry = path.resolve(appRoot, 'data', 'characters.json');
    if (!candidates.includes(rootRegistry)) candidates.push(rootRegistry);

    for (const file of candidates) {
        try {
            const content = await fs.readFile(file, 'utf8');
            const parsed = JSON.parse(content);
            const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.characters) ? parsed.characters : null);
            if (!list) continue;
            const c = list.find(ch => Number(ch.id) === Number(characterId));
            if (c && c.elevenLabsAgentId) return String(c.elevenLabsAgentId);
        } catch (_) { /* try next candidate */ }
    }
    return null;
}


/**
 * The character's microphone and speaker parts.
 *
 * parts.json lives in the selected character's own data directory, and several
 * characters' parts carry `characterId: null` (some microphones do), so an
 * exact characterId match is preferred but an unowned part in the same file is
 * accepted. Matching on characterId alone silently resolved such a mic to
 * "default".
 */
async function getAudioPartsForCharacter(characterId) {
    try {
        const partsFile = await resolvePartsPath();
        const parts = JSON.parse(await fs.readFile(partsFile, 'utf8'));
        if (!Array.isArray(parts)) return { mic: null, speaker: null };
        const pick = (type) => {
            const ofType = parts.filter(p => String(p.type).toLowerCase() === type);
            return ofType.find(p => p.characterId != null && Number(p.characterId) === Number(characterId))
                || ofType.find(p => p.characterId == null)
                || null;
        };
        return { mic: pick('microphone'), speaker: pick('speaker') };
    } catch (e) {
        console.warn('⚠️ Could not read audio parts for character:', e.message);
        return { mic: null, speaker: null };
    }
}

// Capture-device resolution is deliberately left on its historical exact-match
// rule: widening it would move an XVF3800 node's live capture from "default" to the
// array's explicit source name, a separate change to the XVF3800 capture path
// (see docs/hardware/RESPEAKER-XVF3800.md, Capture traps) that needs its own
// FRAMES proof. Duplex detection uses getAudioPartsForCharacter() above.
async function getMicrophoneDeviceForCharacter(characterId) {
    try {
        const partsFile = await resolvePartsPath();
        const content = await fs.readFile(partsFile, 'utf8');
        const parts = JSON.parse(content);
        if (Array.isArray(parts)) {
            const mic = parts.find(p => String(p.type).toLowerCase() === 'microphone' && Number(p.characterId) === Number(characterId));
            if (mic) {
                const cfg = mic.config || {};
                return cfg.deviceId || cfg.inputDevice || cfg.audioDeviceId || mic.inputDevice || 'default';
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not resolve microphone for character:', e.message);
    }
    return 'default';
}


class ElevenLabsWebSocketService extends EventEmitter {
    constructor() {
        super();
        // Lazy config (see getter) — a missing API key must not throw at import
        // time and crash the whole server via `export default new ...`.
        this._config = null;
        this.activeConnections = new Map(); // sessionId -> connection info
        // characterId -> sessionId for headless (server-initiated) agent sessions.
        // Headless sessions have no browser client; they are started by the
        // /conversation/api/ai-on toggle and keep the agent live on the node.
        this.headlessSessions = new Map();
        this.wsServer = null;
        this.port = 8795; // Dedicated port for AI chat WebSocket

        // Hardening: Session management
        this.sessionTimeoutMs = 3600000; // 1 hour max session duration
        this.cleanupIntervalMs = 60000; // cleanup every minute
        this._cleanupTimer = null;

        // characterId -> finished turns (newest last), for getTurnLatency().
        this._turnHistory = new Map();
        // characterId -> last agent_speech activity emit (throttle).
        this._agentActivityAt = new Map();
        // agentId -> time the server refused an empty first_message override.
        this._firstMessageRefusedAt = new Map();
        // characterId -> [{ start, end, rms }] of what the speaker is playing,
        // for the half-duplex echo-aware barge-in.
        this._playbackEnvelope = new Map();
        // characterId -> { at, text } of the last body-state update sent.
        this._bodyStateSent = new Map();
        // Lets tests replace the network edge (signed URL + socket) and the jaw.
        this._openAgentSocket = null;
        this._jaw = jawAnimationService;

        console.log('🎤 ElevenLabsWebSocketService initialized with hardening');
    }

    get config() {
        if (!this._config) this._config = elevenLabsConfigService.getElevenLabsConfig();
        return this._config;
    }

    /**
     * Cleanup old/stale sessions
     */
    _cleanupOldSessions() {
        const now = Date.now();
        const toDelete = [];

        for (const [sessionId, connection] of this.activeConnections.entries()) {
            // A connection registered without a startTime (or with one that was
            // serialized to a string) crashed this timer with an uncaught
            // exception — 21 process-fatal hits in one night's log on one node.
            // Treat an unknown start as "just started": it will age out on a
            // later pass once a real timestamp discrepancy no longer matters.
            const startMs = connection.startTime instanceof Date
                ? connection.startTime.getTime()
                : Number(new Date(connection.startTime || now));
            const age = now - (Number.isFinite(startMs) ? startMs : now);

            // Headless sessions are owned by an explicit on/off toggle, not by a
            // browser lifetime. Reaping a live one on age would silently switch the
            // agent off; they are torn down deterministically by
            // setAgentEnabledForCharacter(id, false) instead.
            // A wanted headless session between reconnect attempts is inactive
            // for a few seconds; reaping it then would end AI mode for good.
            if (connection.headless && (connection.isActive || connection._wanted)) continue;

            // Remove sessions older than timeout OR inactive for 5 minutes
            const inactive = !connection.isActive && age > 300000;
            const expired = age > this.sessionTimeoutMs;

            if (expired || inactive) {
                console.log(`🧹 Cleaning up session ${sessionId} (age=${Math.round(age / 1000)}s, active=${connection.isActive})`);

                // Close WebSocket connections
                try {
                    if (connection.clientWs && connection.clientWs.readyState === WebSocket.OPEN) {
                        connection.clientWs.close();
                    }
                } catch (e) {
                    console.warn(`⚠️ Error closing client WS for ${sessionId}:`, e.message);
                }

                try {
                    if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        connection.elevenLabsWs.close();
                    }
                } catch (e) {
                    console.warn(`⚠️ Error closing ElevenLabs WS for ${sessionId}:`, e.message);
                }

                // Stop server mic loop (clear the timer too, or it fires once more)
                connection.serverMicActive = false;
                if (connection.serverMicTimer) {
                    try { clearTimeout(connection.serverMicTimer); } catch (_) { /* noop */ }
                    connection.serverMicTimer = null;
                }
                // Kill the long-lived capture process, else it orphans and holds the mic
                if (connection.micCaptureHandle) {
                    try { connection.micCaptureHandle.stop(); } catch (_) { /* noop */ }
                    connection.micCaptureHandle = null;
                }

                // Stop any Scribe realtime session, else its keepalive interval leaks
                try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }

                // Stop the streaming jaw driver's 50ms timer
                if (connection.characterId != null) {
                    try { this._jaw.stopPcmJawStream(connection.characterId); } catch (_) { /* noop */ }
                    // Return the eyes to their resting look when the session ends.
                    import('./ledInteractionService.js').then(m => m.default.setInteractionState(connection.characterId, 'idle')).catch(() => {});
                }

                toDelete.push(sessionId);
            }
        }

        toDelete.forEach(id => {
            this.activeConnections.delete(id);
            // Drop any headless mapping pointing at a reaped session
            for (const [charKey, sid] of this.headlessSessions.entries()) {
                if (sid === id) this.headlessSessions.delete(charKey);
            }
        });

        if (toDelete.length > 0) {
            console.log(`🧹 Cleaned up ${toDelete.length} old WebSocket sessions`);
        }
    }

    /**
     * Start WebSocket server for real-time chat
     * @param {object} [httpsServer] - Optional HTTPS server to attach WSS to at /ai-chat
     */
    async startWebSocketServer(httpsServer) {
        // Body awareness rides every conversation this server hosts.
        this._initBodyStateBridge();
        return new Promise((resolve, reject) => {
            try {
                // Primary WS server on dedicated port (HTTP clients)
                this.wsServer = new WebSocketServer({
                    port: this.port,
                    host: '0.0.0.0', // Explicitly bind to IPv4
                    perMessageDeflate: false,
                    verifyClient: (info) => {
                        console.log(`🔍 WebSocket connection attempt from: ${info.origin || 'unknown'} (${info.req.connection.remoteAddress})`);
                        return true; // Accept all connections for now
                    }
                });

                this.wsServer.on('connection', (ws, req) => {
                    this.handleClientConnection(ws, req);
                });

                this.wsServer.on('listening', () => {
                    console.log(`🌐 ElevenLabs Chat WebSocket server listening on port ${this.port}`);

                    // Attach secondary WSS to HTTPS server at /ai-chat (HTTPS clients)
                    if (httpsServer) {
                        try {
                            this.wssServer = new WebSocketServer({
                                server: httpsServer,
                                path: '/ai-chat',
                                perMessageDeflate: false
                            });
                            this.wssServer.on('connection', (ws, req) => {
                                this.handleClientConnection(ws, req);
                            });
                            console.log(`🔒 Secure WebSocket (WSS) attached to HTTPS server at /ai-chat`);
                        } catch (e) {
                            console.warn(`⚠️  Failed to attach WSS to HTTPS server:`, e.message);
                        }
                    }

                    // Start periodic cleanup
                    this._cleanupTimer = setInterval(() => {
                        this._cleanupOldSessions();
                    }, this.cleanupIntervalMs);
                    console.log(`🧹 Session cleanup timer started (every ${this.cleanupIntervalMs / 1000}s)`);

                    resolve();
                });

                this.wsServer.on('error', (error) => {
                    console.error('❌ Chat WebSocket server error:', error.message);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle new client connection
     */
    handleClientConnection(ws, req) {
        const sessionId = this.generateSessionId();
        console.log(`🔌 New chat client connected: ${sessionId}`);

        const connection = this._createConnectionRecord(sessionId, ws);

        this.activeConnections.set(sessionId, connection);

        ws.on('message', (data) => {
            this.handleClientMessage(sessionId, data);
        });

        ws.on('close', () => {
            this.handleClientDisconnect(sessionId);
        });

        ws.on('error', (error) => {
            console.error(`❌ Client WebSocket error for ${sessionId}:`, error.message);
            this.handleClientDisconnect(sessionId);
        });

        // Send welcome message
        this.sendToClient(sessionId, {
            type: 'connected',
            sessionId: sessionId,
            message: 'Connected to MonsterBox AI Chat'
        });
    }

    /**
     * Handle message from client
     */
    async handleClientMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) {
                console.error(`❌ Connection not found: ${sessionId}`);
                return;
            }

            switch (message.type) {
                case 'start_conversation':
                    // Initialize pending message queue
                    connection.pendingMessages = [];
                    connection.conversationReady = false;
                    await this.startConversation(sessionId, message.agentId);
                    // Start Scribe v2 Realtime STT for live transcription
                    // (mic loop is deferred until conversation_initiation_metadata is received)
                    if (connection.useRealtimeSTT) {
                        this._startRealtimeSTTSession(sessionId).catch(e => console.error('RT-STT start error:', e.message));
                    }
                    break;

                case 'start_transcription_only':
                    // Start transcription-only mode (no agent, just STT)
                    console.log(`🎤 Starting transcription-only mode for session ${sessionId}`);
                    connection.isActive = true;
                    connection.transcriptionOnly = true;
                    // Start Scribe v2 Realtime STT for live transcription
                    if (connection.useRealtimeSTT) {
                        this._startRealtimeSTTSession(sessionId).catch(e => console.error('RT-STT start error:', e.message));
                    }
                    this.sendToClient(sessionId, {
                        type: 'transcription_started',
                        message: 'Transcription-only mode active - speak into the microphone'
                    });
                    // Start server mic loop for transcription
                    if (connection.micSource === 'server') {
                        this._startServerMicLoop(sessionId).catch(function () { /* noop */ });
                    }
                    break;

                case 'stop_transcription':
                    // Stop transcription-only mode
                    console.log(`🛑 Stopping transcription for session ${sessionId}`);
                    connection.isActive = false;
                    connection.transcriptionOnly = false;
                    this._stopRealtimeSTTSession(sessionId);
                    this._stopServerMicLoop(sessionId, false);
                    this.sendToClient(sessionId, {
                        type: 'transcription_stopped',
                        message: 'Transcription stopped'
                    });
                    break;

                case 'send_message':
                    await this.sendMessageToAgent(sessionId, message.text);
                    break;

                case 'set_character':
                    connection.characterId = (typeof message.characterId !== 'undefined' ? message.characterId : null);
                    // Send breadcrumb so client can display active character id
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_character', data: { characterId: connection.characterId } });
                    break;

                case 'set_output_mode':
                    connection.outputMode = (message && message.mode === 'local') ? 'local' : 'server';
                    break;

                case 'set_mic_source':
                    connection.micSource = (message && message.source === 'browser') ? 'browser' : 'server';
                    // Breadcrumb for UI
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_mic_source', data: { source: connection.micSource } });
                    if (connection.isActive) {
                        if (connection.micSource === 'server') this._startServerMicLoop(sessionId);
                        else this._stopServerMicLoop(sessionId, true);
                    }
                    break;

                case 'set_audio_playback':
                    // Toggle whether AI audio is played through character speaker
                    connection.audioPlaybackEnabled = !!(message && message.enabled);
                    this.sendToClient(sessionId, { type: 'debug', originalType: 'set_audio_playback', data: { enabled: connection.audioPlaybackEnabled } });
                    break;

                case 'set_speaker_part':
                    // Override which speaker part to route audio through
                    connection.speakerPartId = message.speakerPartId || null;
                    console.log(`🔊 Speaker part set to ${connection.speakerPartId} for session ${sessionId}`);
                    // Stop THIS session's player so the next chunk opens one on the
                    // new device. Only its own: stopping the character's shared
                    // player used to cut the headless agent off mid-sentence.
                    connection._speakerDeviceId = null;
                    connection._speakerDevicePromise = null;
                    if (connection.characterId != null) {
                        try { serverPlaybackService.stopStream({ characterId: connection.characterId, owner: sessionId }); } catch (_) { }
                    }
                    break;

                case 'set_stt_language':
                    try {
                        const lang = (message && message.language) ? String(message.language).toLowerCase() : '';
                        connection.sttLanguage = lang ? (lang.length > 2 ? lang.slice(0, 2) : lang) : null;
                        this.sendToClient(sessionId, { type: 'debug', originalType: 'set_stt_language', data: { language: connection.sttLanguage } });
                    } catch (_) { /* noop */ }
                    break;

                case 'browser_audio_chunk':
                    // Forward browser-sent PCM16k (base64) to ElevenLabs ConvAI + Scribe STT
                    try {
                        const audio64 = (message && message.audio) ? String(message.audio) : '';
                        if (!audio64) break;

                        // Echo suppression: skip forwarding while AI audio is playing through speakers
                        const browserNow = Date.now();
                        const browserSuppressed = connection && connection.suppressMicUntilMs && (browserNow < connection.suppressMicUntilMs);

                        // Forward to ElevenLabs ConvAI agent (skip during echo suppression;
                        // a browser mic has no hardware echo cancellation we can know of)
                        if (connection && !browserSuppressed && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                            connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: audio64 }));
                        }

                        // Also forward to Scribe v2 Realtime STT for live transcription (skip during echo suppression)
                        if (!browserSuppressed && connection && connection.realtimeSTTSession && connection.realtimeSTTSession.isConnected) {
                            const rawPcm = Buffer.from(audio64, 'base64');
                            connection.realtimeSTTSession.sendPCMBuffer(rawPcm);
                        }
                    } catch (_) { /* noop */ }
                    break;

                case 'eos':
                    // Client signals end-of-speech explicitly
                    this._sendEmptyAudioChunkToAgent(sessionId);
                    break;

                case 'end_conversation':
                    await this.endConversation(sessionId);
                    this._stopRealtimeSTTSession(sessionId);
                    this._stopServerMicLoop(sessionId, true);
                    break;

                default:
                    console.warn(`❓ Unknown message type: ${message.type}`);
            }

        } catch (error) {
            console.error(`❌ Error handling client message for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to process message'
            });
        }
    }

    /**
     * Start conversation with ElevenLabs agent using real-time WebSocket API
     */
    async startConversation(sessionId, agentId, opts = {}) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return false;

        try {
            // If no agentId provided, try to resolve from character mapping (characters.json)
            if ((!agentId || agentId === 'null' || agentId === 'undefined') && connection.characterId != null) {
                try {
                    const resolved = await getAgentIdForCharacter(connection.characterId);
                    if (resolved) {
                        agentId = resolved;
                        console.log(`🧠 Resolved agentId ${agentId} for character ${connection.characterId}`);
                    }
                } catch (_) { /* noop */ }
            }
            console.log(`🚀 Starting real-time conversation with agent: ${agentId}${opts.reconnect ? ' (reconnect)' : ''}`);

            // Close any existing ElevenLabs connection. Forget it FIRST so its
            // close handler knows it has been superseded and does nothing.
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                const old = connection.elevenLabsWs;
                connection._agentSocket = null;
                connection.elevenLabsWs = null;
                try { old.close(); } catch (_) { /* noop */ }
            }

            // A reconnect must not replay the walk-up greeting: ask for an empty
            // first message (the agent then waits for the guest). Agents that do
            // not allow the override refuse the whole conversation (close 1008),
            // so a recent refusal is remembered and the greeting is filtered
            // client-side instead (see _suppressGreeting).
            const wantEmptyFirst = !!opts.reconnect && !this._firstMessageRefusedRecently(agentId);
            const override = wantEmptyFirst ? { agent: { first_message: '' } } : {};
            connection._suppressGreeting = !!opts.reconnect && !wantEmptyFirst;
            connection._greetingVerdicts = new Map();
            connection._greetingStaged = new Map();
            connection._resumeFromEventId = null;
            connection._sentEmptyFirstMessage = wantEmptyFirst;

            const elevenLabsWs = await this._connectAgent(agentId);
            connection._agentSocket = elevenLabsWs;
            connection._connecting = true;

            elevenLabsWs.on('open', () => {
                if (connection._agentSocket !== elevenLabsWs) return;
                console.log(`⚡ Connected to ElevenLabs real-time agent: ${agentId}`);
                connection.elevenLabsWs = elevenLabsWs;
                connection.agentId = agentId;
                connection._connecting = false;
                connection._socketOpenedAt = Date.now();
                // Mark as active but NOT ready for messages until conversation_initiation_metadata received
                connection.isActive = true;
                connection.conversationReady = false;
                connection.pendingMessages = connection.pendingMessages || [];

                elevenLabsWs.send(JSON.stringify({
                    type: 'conversation_initiation_client_data',
                    conversation_config_override: override
                }));
            });

            elevenLabsWs.on('message', (data) => {
                if (connection._agentSocket !== elevenLabsWs) return;
                this.handleElevenLabsMessage(sessionId, data);
            });

            elevenLabsWs.on('close', (code, reason) => {
                const reasonText = String(reason || '');
                // A socket we replaced (reconnect, restart) must not tear down
                // the connection that now belongs to its successor.
                if (connection._agentSocket !== elevenLabsWs) return;
                console.log(`🔌 ElevenLabs real-time connection closed for ${sessionId} (code=${code}, reason=${reasonText || 'none'})`);
                connection._agentSocket = null;
                connection._connecting = false;
                connection.elevenLabsWs = null;
                connection.isActive = false;
                connection.conversationReady = false;
                this._finalizeTurn(connection, 'socket closed');
                // Settle any question still waiting on this socket, or its HTTP
                // caller would block until the full ask timeout for no reason.
                try { this._abortPendingAsk(sessionId, `socket closed (code=${code})`); } catch (_) { /* noop */ }

                const refused = isFirstMessageOverrideRefusal(code, reasonText);
                if (refused) {
                    this._firstMessageRefusedAt.set(String(agentId), Date.now());
                    console.warn(`⚠️ Agent ${agentId} refused the empty first_message override: reconnecting without it; the greeting will be filtered client-side`);
                }

                // Let the character finish the sentence it was saying: a closed
                // socket (max duration, network drop, AI off) is not an
                // interruption. Only this session's own player is touched.
                if (connection.characterId != null) {
                    try { serverPlaybackService.stopStream({ characterId: connection.characterId, owner: sessionId, drain: true }); } catch (_) { /* noop */ }
                }

                if (this._shouldReconnect(sessionId)) {
                    this._scheduleReconnect(sessionId, { immediate: refused, code, reason: reasonText });
                    return;
                }
                this.sendToClient(sessionId, {
                    type: 'conversation_ended',
                    message: 'Real-time conversation ended'
                });
            });

            elevenLabsWs.on('error', (error) => {
                console.error(`❌ ElevenLabs real-time WebSocket error for ${sessionId}:`, error.message);
                this.sendToClient(sessionId, {
                    type: 'error',
                    message: 'Real-time agent connection failed'
                });
            });
            return true;

        } catch (error) {
            connection._connecting = false;
            console.error(`❌ Failed to start real-time conversation for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to connect to real-time agent: ' + error.message
            });
            return false;
        }
    }

    /**
     * Signed URL + socket. One place, so tests can replace the network edge
     * (`service._openAgentSocket = async (agentId) => fakeSocket`).
     */
    async _connectAgent(agentId) {
        if (typeof this._openAgentSocket === 'function') return this._openAgentSocket(agentId);
        const signedUrlResponse = await fetch(
            `${this.config.baseUrl}/convai/conversation/get-signed-url?agent_id=${agentId}`,
            { method: 'GET', headers: { 'xi-api-key': this.config.apiKey, 'Content-Type': 'application/json' } }
        );
        if (!signedUrlResponse.ok) {
            throw new Error(`Failed to get signed URL: HTTP ${signedUrlResponse.status}`);
        }
        const { signed_url } = await signedUrlResponse.json();
        console.log(`🔗 Got signed URL for agent ${agentId}`);
        return new WebSocket(signed_url);
    }

    _firstMessageRefusedRecently(agentId) {
        const at = this._firstMessageRefusedAt.get(String(agentId));
        return !!(at && (Date.now() - at) < FIRST_MESSAGE_REFUSAL_TTL_MS);
    }

    /** Is this still the character's wanted headless session? */
    _shouldReconnect(sessionId) {
        const c = this.activeConnections.get(sessionId);
        if (!c || !c.headless || !c._wanted) return false;
        return this.headlessSessions.get(String(c.characterId)) === sessionId;
    }

    /**
     * Reopen a headless session's agent socket after it closed underneath us
     * (the agent's max call duration, a network drop, an idle close). The
     * connection record, its microphone capture process and its player all
     * survive; only the socket is new, and it opens without a greeting.
     */
    _scheduleReconnect(sessionId, info = {}) {
        const c = this.activeConnections.get(sessionId);
        if (!c) return;
        if (c._reconnectTimer) return;
        // A session that stayed up a minute earned a fresh backoff.
        if (c._socketOpenedAt && (Date.now() - c._socketOpenedAt) > 60000) c._reconnectAttempt = 0;
        const attempt = c._reconnectAttempt || 0;
        const delay = info.immediate ? 250 : reconnectDelayMs(attempt);
        c._reconnectAttempt = attempt + 1;
        console.log(`🔁 [reconnect] character ${c.characterId} session ${sessionId}: attempt ${attempt + 1} in ${delay}ms (closed code=${info.code}${info.reason ? `, "${info.reason}"` : ''})`);
        c._reconnectTimer = setTimeout(async () => {
            c._reconnectTimer = null;
            if (!this._shouldReconnect(sessionId)) return;
            const ok = await this.startConversation(sessionId, c.agentId || null, { reconnect: true });
            if (!ok && this._shouldReconnect(sessionId)) {
                this._scheduleReconnect(sessionId, { code: 'connect-failed' });
            }
        }, delay);
        if (c._reconnectTimer.unref) c._reconnectTimer.unref();
    }

    _cancelReconnect(connection) {
        if (connection && connection._reconnectTimer) {
            clearTimeout(connection._reconnectTimer);
            connection._reconnectTimer = null;
        }
    }

    /**
     * Send message to ElevenLabs agent via real-time WebSocket
     */
    async sendMessageToAgent(sessionId, text) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active session'
            });
            return;
        }

        // If conversation is being established but not yet ready, queue the message
        if (connection.isActive && !connection.conversationReady) {
            console.log(`⏳ Queuing message (conversation starting): "${text}"`);
            if (!connection.pendingMessages) connection.pendingMessages = [];
            connection.pendingMessages.push(text);
            return;
        }

        if (!connection.elevenLabsWs || !connection.isActive || !connection.conversationReady) {
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'No active real-time conversation'
            });
            return;
        }

        try {
            console.log(`📤 Sending text to real-time agent: "${text}"`);

            // Send text message to ElevenLabs real-time WebSocket
            const message = {
                type: 'user_message',
                text: text
            };

            connection.elevenLabsWs.send(JSON.stringify(message));
            console.log(`✅ Text message sent to real-time agent for ${sessionId}`);

        } catch (error) {
            console.error(`❌ Failed to send message to real-time agent for ${sessionId}:`, error.message);
            this.sendToClient(sessionId, {
                type: 'error',
                message: 'Failed to send message to real-time agent: ' + error.message
            });
        }
    }

    /**
     * Handle message from ElevenLabs real-time WebSocket
     */
    handleElevenLabsMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            const connection = this.activeConnections.get(sessionId);

            if (!connection) return;



            switch (message.type) {
                case 'conversation_initiation_metadata':
                    console.log(`🎯 Conversation initiated for ${sessionId}`);
                    connection.conversationReady = true;
                    // Fresh visitor, fresh gesture budget — cooldowns and
                    // per-conversation caps are what stop a character repeating
                    // the same move at everyone who walks up.
                    if (connection.characterId != null) {
                        gestureEngineService.startConversation(connection.characterId);
                    }
                    // Detect output audio format from agent config (default: pcm_16000)
                    try {
                        const meta = message.conversation_initiation_metadata_event || {};
                        const fmt = meta.agent_output_audio_format || '';
                        connection.audioOutputFormat = fmt || 'pcm_16000';
                        console.log(`🔊 Agent output audio format: "${fmt}" (using: "${connection.audioOutputFormat}")`);
                        // Log the full metadata keys for debugging
                        console.log(`🔊 ConvAI metadata keys:`, JSON.stringify(Object.keys(meta)));
                    } catch (_) {
                        connection.audioOutputFormat = 'pcm_16000';
                    }

                    if (connection._reconnectAttempt) {
                        console.log(`🔁 [reconnect] character ${connection.characterId} session ${sessionId} reconnected ` +
                            `(${connection._sentEmptyFirstMessage ? 'empty first_message override' : 'greeting filtered client-side'})`);
                    }
                    // Resolve the speaker once for the session, before the first chunk.
                    this._ensureSpeakerDevice(connection);

                    // NOW notify the client that conversation is ready
                    this.sendToClient(sessionId, {
                        type: 'conversation_started',
                        agentId: connection.agentId,
                        message: 'Connected to real-time agent - ready for instant chat!'
                    });

                    // Start server mic loop only after conversation is fully initialized
                    if (connection.micSource === 'server') {
                        try { this._startServerMicLoop(sessionId); } catch (_) { }
                    }

                    // Opening body context: tell the agent where its body
                    // already is, so "is your arm up?" works even when the arm
                    // was raised before this conversation began.
                    // Sent on this socket only (a new conversation has no memory of
                    // what earlier sockets were told).
                    if (connection.characterId != null) {
                        import('./bodyStateService.js').then(m => {
                            const summary = (m.default || m).summarize(connection.characterId);
                            if (summary && connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                                connection.elevenLabsWs.send(JSON.stringify({ type: 'contextual_update', text: summary, context_id: 'body_state_summary' }));
                                this._bodyStateSent.set(String(connection.characterId), { at: Date.now(), text: summary });
                            }
                        }).catch(() => { /* optional */ });
                    }

                    // Flush any pending text messages that arrived before conversation was ready
                    if (connection.pendingMessages && connection.pendingMessages.length > 0) {
                        const pending = connection.pendingMessages.splice(0);
                        for (const pendingText of pending) {
                            console.log(`📤 Flushing pending message: "${pendingText}"`);
                            this.sendMessageToAgent(sessionId, pendingText);
                        }
                    }
                    break;

                case 'audio':
                    this._handleAgentAudio(sessionId, connection, message);
                    break;

                case 'user_transcript':
                    // Forward user transcript from ElevenLabs to client
                    try {
                        const userText = (message.user_transcription_event && message.user_transcription_event.user_transcript)
                            || message.text || '';
                        if (userText) {
                            // Hardening: Track successful transcription
                            connection.transcriptCount += 1;
                            connection.consecutiveErrors = 0; // Reset error counter on success
                            console.log(`✅ Session ${sessionId}: Transcribed "${userText}" (count=${connection.transcriptCount})`);

                            // Follow Orders tap — the agent-ASR path, which is
                            // the only transcript source on headless sessions.
                            // The listener dedupes against the Scribe tap via
                            // its cooldown window.
                            this._followOrdersHook(connection.characterId, userText, { sessionId, source: 'agent_asr' });

                            // Speech log: what the guest said, so the dashboard AI
                            // panel shows the whole conversation even when nobody
                            // has the page open on the mic session.
                            recordSpeech(connection.characterId, {
                                speaker: 'guest', source: 'agent', text: userText
                            });

                            // Guest finished a turn — show "thinking" on the eyes
                            // while the agent composes its reply (no-op without an
                            // LED ring; speaking then takes over during playback).
                            import('./ledInteractionService.js').then(m => m.default.setInteractionState(connection.characterId, 'thinking')).catch(() => {});

                            // Guest speech is activity (keeps the character awake);
                            // ASR noise ("...") is not.
                            const noise = isNoiseTranscript(userText);
                            if (!noise) this._emitActivity(connection, 'guest_speech', { text: userText });

                            // Start the turn clock at the guest's last voiced frame,
                            // if the mic heard one recently enough to be this turn's.
                            const nowT = Date.now();
                            const lastVoice = connection._lastVoiceAtMs || null;
                            this._startTurn(connection, {
                                source: noise ? 'noise' : 'speech',
                                speechEndMs: (lastVoice && (nowT - lastVoice) < SPEECH_END_MAX_AGE_MS) ? lastVoice : null,
                                transcriptAtMs: nowT,
                                text: userText
                            });

                            // Send user transcript event to client (single event, no duplicates)
                            this.sendToClient(sessionId, {
                                type: 'user_transcript',
                                user_transcription_event: message.user_transcription_event || { user_transcript: userText },
                                timestamp: Date.now()
                            });
                        }
                    } catch (err) {
                        console.error(`❌ Session ${sessionId}: Error handling user_transcript:`, err.message);
                        connection.consecutiveErrors += 1;
                        connection.lastError = err.message;
                    }
                    break;

                case 'agent_response':
                    // Text-only agent response
                    const responseText = message.agent_response_event?.agent_response ||
                        message.agent_response ||
                        message.text ||
                        message.message ||
                        '';

                    if (connection._turn && !connection._turn.responseAtMs) {
                        connection._turn.responseAtMs = Date.now();
                    }

                    // Greeting filter after a reconnect whose empty-first-message
                    // override was refused: classify the turn, then release or
                    // drop the audio staged for it.
                    if (connection._suppressGreeting) {
                        const evt = message.agent_response_event;
                        if (evt && evt.event_id !== undefined) {
                            const answer = isAnswerTurn(evt);
                            this._releaseGreetingStage(sessionId, connection, evt.event_id, answer);
                            if (!answer) {
                                console.log(`🔇 [reconnect] dropped replayed greeting: "${String(responseText).slice(0, 60)}"`);
                                break;
                            }
                        }
                    }

                    // Speech log: the character's own line, from the live agent.
                    if (responseText) {
                        this._emitActivity(connection, 'agent_speech', { text: responseText, prompted: this._turnIsPrompted(connection._turn) });
                        recordSpeech(connection.characterId, {
                            speaker: 'character', source: 'agent', text: responseText
                        });
                    }

                    // Feed a question asked via askAgentQuestion() on this live session.
                    if (connection._pendingAsk && responseText) {
                        const p = connection._pendingAsk;
                        p.responseText = p.responseText ? `${p.responseText} ${responseText}` : responseText;
                        this._settlePendingAsk(sessionId);
                    }

                    if (responseText) {
                        // Record this turn's response length and re-arm one ambient
                        // "sway" attempt for it. The audio events carry no text, so
                        // the during-speech trigger must key off the length captured
                        // here (see the audio_chunk handler below).
                        connection._ambientTurnLen = responseText.length;
                        connection._ambientFiredThisTurn = false;
                        this.sendToClient(sessionId, {
                            type: 'agent_response',
                            text: responseText,
                            timestamp: Date.now(),
                            realTime: true
                        });
                    }
                    break;

                case 'ping':
                    // Handle ping/pong for connection keepalive (silent)
                    if (message.ping_event && connection.elevenLabsWs) {
                        const pongMessage = {
                            type: 'pong',
                            event_id: message.ping_event.event_id
                        };
                        connection.elevenLabsWs.send(JSON.stringify(pongMessage));
                    }
                    break;

                case 'conversation_end':
                    console.log(`🔚 Conversation ended by ElevenLabs for ${sessionId}`);
                    if (connection) {
                        connection.aiSpeaking = false;
                        connection.speechStartedAt = 0;
                        connection.accumulatedAudioMs = 0;
                        if (connection.characterId != null) {
                            gestureEngineService.endConversation(connection.characterId);
                        }
                    }
                    this.sendToClient(sessionId, {
                        type: 'conversation_ended',
                        message: 'Conversation ended by agent'
                    });
                    break;

                case 'interruption':
                    // One shared path with the local detector. This used to stop
                    // audio only, leaving the jaw flapping to a dead speaker and the
                    // eyes stuck in the speaking crossfade, and it never dropped the
                    // queued agent audio — so the PCM writer could respawn the player
                    // that had just been killed.
                    //
                    // D1: the agent's turn model is the judge of interruptions.
                    // Honour it for THIS session's player only, and refuse every
                    // chunk of the interrupted response, including late ones.
                    this._handleAgentInterruption(sessionId, connection, message.interruption_event || {});
                    break;

                case 'agent_response_complete':
                    // The agent finished generating this response. Settle a live
                    // ask now instead of waiting out the quiet timer.
                    if (connection._pendingAsk && connection._pendingAsk.sawAudio) {
                        connection._pendingAsk.complete = true;
                        this._settlePendingAsk(sessionId);
                    }
                    break;

                case 'client_tool_call': {
                    // The agent asked its body to do something. All logic lives in
                    // the gesture service; this is routing only, so whatever shape
                    // the tool protocol takes, the motion rules stay in one place.
                    const call = message.client_tool_call || {};
                    const result = gestureEngineService.handleAgentToolCall(
                        connection?.characterId,
                        call.tool_name,
                        call.parameters || {},
                        { kidMode: connection?.kidMode === true }
                    );
                    // Answer immediately and unconditionally. Motion is
                    // fire-and-forget: making the agent wait on a servo is exactly
                    // the freeze-while-talking failure the gesture spec exists to
                    // prevent, and a gesture that fails must not stall the reply.
                    if (call.tool_call_id && connection?.elevenLabsWs
                        && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        connection.elevenLabsWs.send(JSON.stringify({
                            type: 'client_tool_result',
                            tool_call_id: call.tool_call_id,
                            result: result.handled ? 'ok' : 'ignored',
                            is_error: false
                        }));
                    }
                    break;
                }

                default:
                    // Ignore unknown message types to keep console clean
                    break;
            }

        } catch (error) {
            console.error(`❌ Error handling ElevenLabs real-time message for ${sessionId}:`, error.message);
            console.error('Raw message:', data.toString());
        }
    }

    /**
     * A reply is "done" once it has gone quiet for ASK_SETTLE_MS. The agent
     * streams text and audio in fragments with no end-of-reply marker we can
     * rely on, so each new fragment pushes the settle deadline out.
     */
    _settlePendingAsk(sessionId) {
        const c = this.activeConnections.get(sessionId);
        const p = c && c._pendingAsk;
        if (!p) return;
        clearTimeout(p.settleTimer);
        // agent_response_complete (when the agent sends it) ends the wait for
        // more fragments; a short quiet still lets the final chunk land.
        const settleMs = p.complete ? 300 : ASK_SETTLE_MS;
        p.settleTimer = setTimeout(() => {
            const still = this.activeConnections.get(sessionId);
            if (!still || still._pendingAsk !== p) return;
            still._pendingAsk = null;
            clearTimeout(p.hardTimer);
            this._resolveAskAfterPlayout(sessionId, p, {
                success: true,
                response: p.responseText || 'Response received',
                viaSession: sessionId
            });
        }, settleMs);
    }

    /**
     * Answer a live-session question only once its reply has finished PLAYING.
     *
     * The agent streams a reply far faster than real time, so "no new chunk for
     * a moment" happens while the speaker still has seconds to go. Callers that
     * chain on the answer (a scene's askAI step runs the next step right after)
     * overlapped the character's own line. Waits on this session's player
     * horizon and the modelled end of its audio (which also holds while the
     * app-level mute is on, so scene timing does not change with mute), bounded
     * by ASK_PLAYOUT_CAP_MS. An interruption empties both, so it answers at once.
     */
    async _resolveAskAfterPlayout(sessionId, p, result) {
        if (p.waitForPlayback === false) { p.resolve(result); return; }
        const capAt = Date.now() + ASK_PLAYOUT_CAP_MS;
        try {
            for (;;) {
                const c = this.activeConnections.get(sessionId);
                if (!c) break;
                const horizon = Math.max(
                    Number(serverPlaybackService.getPlaybackHorizon({ characterId: c.characterId, owner: sessionId })) || 0,
                    Number(c.playbackEndsAtMs) || 0);
                const left = horizon - Date.now();
                if (left <= 0 || Date.now() >= capAt) break;
                await new Promise(r => setTimeout(r, Math.min(200, Math.max(20, left))));
            }
        } catch (_) { /* answer regardless */ }
        p.resolve({ ...result, playedOut: true });
    }

    /**
     * Release any question waiting on this session. Called when the socket dies
     * or the session is torn down, so an in-flight HTTP request settles instead
     * of waiting out its full timeout.
     */
    _abortPendingAsk(sessionId, reason) {
        const c = this.activeConnections.get(sessionId);
        const p = c && c._pendingAsk;
        if (!p) return;
        c._pendingAsk = null;
        clearTimeout(p.settleTimer);
        clearTimeout(p.hardTimer);
        p.resolve({
            success: !!p.responseText,
            response: p.responseText || '',
            viaSession: sessionId,
            aborted: reason || 'session ended'
        });
    }

    /**
     * End conversation and close ElevenLabs WebSocket
     */
    async endConversation(sessionId, { drain = true } = {}) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Ending a conversation is not an interruption: this session's player
        // finishes the sentence it holds, then exits. Other sessions' players
        // (the headless agent, a scene line) are not touched.
        if (connection.characterId != null) {
            try { await serverPlaybackService.stopStream({ characterId: connection.characterId, owner: sessionId, drain }); } catch (_) { /* best-effort */ }
        }

        // Close ElevenLabs WebSocket if active
        if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
            try {
                console.log(`🔌 Closing ElevenLabs real-time connection for ${sessionId}`);
                // Forget it first: its close handler must not reconnect or re-drain.
                connection._agentSocket = null;
                connection.elevenLabsWs.close();
            } catch (error) {
                console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
            }
            connection.elevenLabsWs = null;
        }

        connection.isActive = false;
        connection.agentId = null;

        this.sendToClient(sessionId, {
            type: 'conversation_ended',
            message: 'Real-time conversation ended'
        });
    }

    /**
     * Build a connection record. Shared by browser clients and headless
     * (server-initiated) agent sessions so the two can never drift apart.
     * @param {string} sessionId
     * @param {object|null} clientWs - null for headless sessions
     */
    _createConnectionRecord(sessionId, clientWs) {
        return {
            sessionId,
            clientWs: clientWs || null,
            elevenLabsWs: null,
            agentId: null,
            isActive: false,
            startTime: new Date(),
            characterId: null,
            outputMode: 'server',
            micSource: 'server',
            transcriptionOnly: false,
            serverMicTimer: null,
            serverMicActive: false,
            sttLastAt: 0,
            sttPcm: Buffer.alloc(0),
            _dbgLastTs: 0,
            sttLanguage: null,
            suppressMicUntilMs: 0,
            aiSpeaking: false,
            speechStartedAt: 0,
            accumulatedAudioMs: 0,
            // Wall-clock time the queued reply audio is expected to finish playing.
            playbackEndsAtMs: 0,
            audioBuffer: [],
            audioPlaying: false,
            realtimeSTTSession: null,
            useRealtimeSTT: true,
            headless: false,
            consecutiveErrors: 0,
            maxConsecutiveErrors: 10,
            lastError: null,
            transcriptCount: 0,
            audioChunkCount: 0
        };
    }

    /**
     * Wait until a connection's agent socket reports ready, so callers get a
     * real result instead of an optimistic one. Resolves false on timeout.
     */
    async _waitForAgentReady(sessionId, timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const c = this.activeConnections.get(sessionId);
            if (!c) return false;
            if (c.isActive && c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN) return true;
            await new Promise(r => setTimeout(r, 100));
        }
        return false;
    }

    /**
     * Start or stop a headless (no browser client) conversational agent session
     * for a character. This is what makes the /conversation/api/ai-on toggle real.
     *
     * Enable is idempotent: a second enable while a live session exists is a
     * no-op rather than a second agent socket + second mic loop.
     *
     * @param {number|string} characterId
     * @param {boolean} enabled
     * @returns {Promise<{success:boolean, enabled:boolean, sessionId?:string, agentId?:string, error?:string}>}
     */
    async setAgentEnabledForCharacter(characterId, enabled, opts = {}) {
        if (characterId == null) {
            return { success: false, enabled: false, error: 'No character selected' };
        }
        const key = String(characterId);

        // ---- DISABLE ----------------------------------------------------
        if (!enabled) {
            const sessionId = this.headlessSessions.get(key);
            if (!sessionId) {
                return { success: true, enabled: false, alreadyStopped: true };
            }
            // Remove the mapping first so a concurrent toggle cannot re-enter.
            this.headlessSessions.delete(key);
            // Default: let the current sentence finish. opts.immediate (panic,
            // emergency stop): cut it now.
            await this._teardownHeadlessSession(sessionId, { drain: !opts.immediate });
            console.log(`🛑 Headless agent session stopped for character ${key} (${sessionId}${opts.immediate ? ', immediate' : ''})`);
            return { success: true, enabled: false, sessionId };
        }

        // ---- ENABLE -----------------------------------------------------
        const existingId = this.headlessSessions.get(key);
        if (existingId) {
            const existing = this.activeConnections.get(existingId);
            if (existing && (existing.isActive || existing._reconnectTimer || existing._connecting)) {
                console.log(`ℹ️ Headless agent already running for character ${key} (${existingId})`);
                return { success: true, enabled: true, sessionId: existingId, agentId: existing.agentId, alreadyRunning: true };
            }
            // Stale mapping (session died) — clean it up before starting fresh.
            this.headlessSessions.delete(key);
            await this._teardownHeadlessSession(existingId);
        }

        let agentId = null;
        try {
            agentId = await getAgentIdForCharacter(characterId);
        } catch (_) { /* handled below */ }
        if (!agentId) {
            return { success: false, enabled: false, error: `No ElevenLabs agent configured for character ${key}` };
        }

        const sessionId = this.generateSessionId();
        const connection = this._createConnectionRecord(sessionId, null);
        connection.characterId = Number(characterId);
        connection.headless = true;
        // Wanted until AI mode is switched off: the socket is reopened (without
        // a greeting) whenever ElevenLabs closes it underneath us.
        connection._wanted = true;
        // The agent performs its own ASR; a parallel Scribe/batch STT stream would
        // only feed a browser client that does not exist here.
        connection.useRealtimeSTT = false;
        this.activeConnections.set(sessionId, connection);
        this.headlessSessions.set(key, sessionId);

        try {
            await this.startConversation(sessionId, agentId);
            const ready = await this._waitForAgentReady(sessionId);
            if (!ready) {
                this.headlessSessions.delete(key);
                await this._teardownHeadlessSession(sessionId);
                return { success: false, enabled: false, error: 'Timed out connecting to ElevenLabs agent' };
            }
            await this._startServerMicLoop(sessionId);
            console.log(`✅ Headless agent session started for character ${key} (${sessionId}, agent ${agentId})`);
            return { success: true, enabled: true, sessionId, agentId };
        } catch (e) {
            this.headlessSessions.delete(key);
            await this._teardownHeadlessSession(sessionId);
            return { success: false, enabled: false, error: e && e.message ? e.message : 'Failed to start agent' };
        }
    }

    /**
     * Fully tear down a headless session: mic loop, STT session, agent socket,
     * timers and the activeConnections entry. Safe to call repeatedly.
     */
    async _teardownHeadlessSession(sessionId, { drain = true } = {}) {
        const pre = this.activeConnections.get(sessionId);
        if (pre) { pre._wanted = false; this._cancelReconnect(pre); }
        // Settle any in-flight question first so its caller is not left hanging
        // on a session we are about to delete.
        try { this._abortPendingAsk(sessionId, 'agent disabled'); } catch (_) { /* noop */ }
        try { this._stopServerMicLoop(sessionId, true); } catch (_) { /* noop */ }
        try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }
        try { await this.endConversation(sessionId, { drain }); } catch (_) { /* noop */ }

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            connection.isActive = false;
            connection.serverMicActive = false;
            if (connection.serverMicTimer) {
                try { clearTimeout(connection.serverMicTimer); } catch (_) { /* noop */ }
                connection.serverMicTimer = null;
            }
            // Drop buffered audio so the playback loop exits promptly.
            connection.audioBuffer = [];
            const sock = connection.elevenLabsWs || connection._agentSocket;
            connection._agentSocket = null;
            if (sock) {
                try {
                    if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
                        sock.close();
                    }
                } catch (_) { /* noop */ }
                connection.elevenLabsWs = null;
            }
            this._finalizeTurn(connection, 'session ended');
            if (connection.characterId != null) {
                // AI off / sleep: let the current sentence finish (drained, own player only).
                try { await serverPlaybackService.stopStream({ characterId: connection.characterId, owner: sessionId, drain }); } catch (_) { /* noop */ }
                // Stop the streaming jaw driver, else its 50ms timer outlives the socket.
                try { this._jaw.stopPcmJawStream(connection.characterId); } catch (_) { /* noop */ }
            }
        }
        this.activeConnections.delete(sessionId);
    }

    /**
     * True if a headless agent session is currently live for a character.
     */
    isAgentEnabledForCharacter(characterId) {
        if (characterId == null) return false;
        const sessionId = this.headlessSessions.get(String(characterId));
        if (!sessionId) return false;
        const c = this.activeConnections.get(sessionId);
        // Between reconnect attempts AI mode is still ON: the socket is being
        // reopened. Reporting "off" here made pollers think the agent had died.
        return !!(c && (c.isActive || (c._wanted && (c._reconnectTimer || c._connecting))));
    }

    /**
     * True while ANY conversation session (browser or headless) for a character
     * is live, or its reply audio is still draining out of the speaker. The
     * background-music supervisor pauses on this: the character's mic hears its
     * own speaker, so music during a conversation is fed to the agent as speech.
     * In-memory only — safe to poll every tick.
     */
    hasActiveSession(characterId) {
        if (characterId == null) return false;
        const now = Date.now();
        for (const [, c] of this.activeConnections) {
            if (Number(c.characterId) !== Number(characterId)) continue;
            if (c.isActive || c.audioPlaying || (c.playbackEndsAtMs || 0) > now) return true;
        }
        return false;
    }

    /**
     * Start a Scribe v2 Realtime STT session for a connection.
     * Streams partial/committed transcripts to the browser client.
     */
    async _startRealtimeSTTSession(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;

        // Destroy any existing session
        if (connection.realtimeSTTSession) {
            try { connection.realtimeSTTSession.disconnect('restart'); } catch (_) { /* noop */ }
            connection.realtimeSTTSession = null;
        }

        try {
            const sttCfg = await getSTTConfig();
            const lang = (connection.sttLanguage && connection.sttLanguage !== 'auto')
                ? connection.sttLanguage
                : (sttCfg.language && sttCfg.language !== 'auto' ? sttCfg.language : null);

            const session = await realtimeSTTService.createSession({
                sessionId: `rt_${sessionId}`,
                languageCode: lang || undefined,
                commitStrategy: 'vad',
                vadSilenceThresholdSecs: 1.5,
                vadThreshold: 0.4,
                includeTimestamps: true,
                includeLanguageDetection: true,
                previousText: null
            });

            connection.realtimeSTTSession = session;

            // Wire Scribe events → client WebSocket
            session.on('partial_transcript', (data) => {
                if (!data.text) return;
                this.sendToClient(sessionId, {
                    type: 'stt_partial',
                    text: data.text,
                    timestamp: data.timestamp,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('committed_transcript', (data) => {
                if (!data.text) return;
                // Apply the same English/SFX filtering as before
                let allow = true;
                try {
                    const filterSfx = (sttCfg.filterSfx !== false);
                    const validateEnglish = (sttCfg.validateEnglish !== false);
                    const effectiveLang = (lang || 'en').slice(0, 2);

                    if (effectiveLang === 'en') {
                        if (filterSfx && _isBracketedSfx(data.text)) {
                            allow = false;
                            console.log(`❌ [RT-STT] Filtered (SFX): "${data.text}"`);
                        } else if (validateEnglish && !_isLikelyEnglish(data.text, sttCfg)) {
                            allow = false;
                            console.log(`❌ [RT-STT] Filtered (non-English): "${data.text}"`);
                        }
                    }
                } catch (_) { /* noop */ }

                if (allow) {
                    console.log(`✅ [RT-STT] Accepted: "${data.text}"`);
                    // Follow Orders tap: same filtered text the UI trusts.
                    this._followOrdersHook(connection.characterId, data.text, { sessionId, source: 'scribe' });
                    // Primary transcript event for UI
                    this.sendToClient(sessionId, {
                        type: 'stt_committed',
                        text: data.text,
                        timestamp: data.timestamp,
                        source: 'scribe_v2_realtime'
                    });
                    // Also send as stt_partial for backward compatibility with existing UI
                    this.sendToClient(sessionId, {
                        type: 'stt_partial',
                        text: data.text,
                        timestamp: data.timestamp,
                        final: true,
                        source: 'scribe_v2_realtime'
                    });
                }
            });

            session.on('committed_transcript_with_timestamps', (data) => {
                if (!data.text) return;
                // Send word-level timestamps (useful for jaw animation sync on input)
                this.sendToClient(sessionId, {
                    type: 'stt_timestamps',
                    text: data.text,
                    words: data.words,
                    languageCode: data.languageCode,
                    timestamp: data.timestamp,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('scribe_error', (data) => {
                console.error(`❌ [RT-STT] Scribe error for ${sessionId}:`, data.type, data.message);
                this.sendToClient(sessionId, {
                    type: 'stt_error',
                    message: `Scribe: ${data.type} - ${data.message}`,
                    source: 'scribe_v2_realtime'
                });
            });

            session.on('disconnected', () => {
                console.log(`🔌 [RT-STT] Session disconnected for ${sessionId}`);
                connection.realtimeSTTSession = null;
            });

            console.log(`✅ [RT-STT] Scribe v2 Realtime session started for ${sessionId}`);
            this.sendToClient(sessionId, {
                type: 'debug',
                originalType: 'realtime_stt_started',
                data: { model: 'scribe_v2_realtime', language: lang || 'auto', strategy: 'vad' }
            });

        } catch (error) {
            console.error(`❌ [RT-STT] Failed to start for ${sessionId}:`, error.message);
            connection.useRealtimeSTT = false; // Fall back to batch STT
            this.sendToClient(sessionId, {
                type: 'debug',
                originalType: 'realtime_stt_fallback',
                data: { error: error.message, fallback: 'batch_stt' }
            });
        }
    }

    /**
     * Stop a Scribe v2 Realtime STT session for a connection
     */
    _stopRealtimeSTTSession(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        if (connection.realtimeSTTSession) {
            try { connection.realtimeSTTSession.disconnect('session_stop'); } catch (_) { /* noop */ }
            connection.realtimeSTTSession = null;
        }
    }

    /**
     * Server microphone capture loop -> send user_audio_chunk to ElevenLabs
     */
    // Optional WAV denoise/bandpass using ffmpeg if available
    async _filterWavForSTT(wavBuf, filterConfig) {
        try {
            // Skip filtering if buffer is too small (< 1KB)
            if (!wavBuf || wavBuf.length < 1024) return wavBuf;

            // Get filter settings from config or use defaults
            const highpass = (filterConfig && filterConfig.highpassFreq) || 180;
            const lowpass = (filterConfig && filterConfig.lowpassFreq) || 4200;
            const denoise = (filterConfig && filterConfig.denoiseLevel) || -22;

            return await new Promise(function (resolve) {
                try {
                    // Build optimized filter chain
                    const filterChain = 'highpass=f=' + highpass + ',lowpass=f=' + lowpass + ',afftdn=nf=' + denoise;

                    // Use faster FFmpeg options for real-time processing
                    const ff = spawn('ffmpeg', [
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-f', 'wav',
                        '-i', 'pipe:0',
                        '-ac', '1',
                        '-ar', '16000',
                        '-af', filterChain,
                        '-f', 'wav',
                        'pipe:1'
                    ]);

                    let out = Buffer.alloc(0);
                    let errored = false;

                    ff.stdout.on('data', function (d) { out = Buffer.concat([out, d]); });
                    ff.stderr.on('data', function () { /* ignore stderr */ });
                    ff.on('error', function () { errored = true; resolve(wavBuf); });
                    ff.on('close', function (code) {
                        if (errored || code !== 0 || out.length < 44) {
                            resolve(wavBuf);
                        } else {
                            resolve(out);
                        }
                    });

                    // Set timeout to prevent hanging
                    setTimeout(function () {
                        if (!errored) {
                            try { ff.kill(); } catch (_) { }
                            errored = true;
                            resolve(wavBuf);
                        }
                    }, 5000);

                    ff.stdin.end(wavBuf);
                } catch (e) {
                    resolve(wavBuf);
                }
            });
        } catch (_) { return wavBuf; }
    }

    /**
     * Inject non-interrupting context into every live agent conversation for
     * a character: `contextual_update` is a socket message, not a config
     * override, so the locked agent configs don't gate it and no persona is
     * edited. Per current ElevenLabs docs it never interrupts speech and is
     * reflected on the agent's next turn; `context_id` makes newer state
     * supersede older instead of piling up in the LLM context.
     */
    sendContextualUpdate(characterId, text, contextId = null) {
        if (characterId == null || !text) return 0;
        let sent = 0;
        for (const [, connection] of this.activeConnections) {
            if (Number(connection.characterId) !== Number(characterId)) continue;
            // One-shot ask sockets live for one line; context sent there is
            // billed as input tokens and never used.
            if (connection.ephemeralAsk) continue;
            const ws = connection.elevenLabsWs;
            if (!ws || ws.readyState !== WebSocket.OPEN) continue;
            try {
                const payload = { type: 'contextual_update', text };
                if (contextId) payload.context_id = contextId;
                ws.send(JSON.stringify(payload));
                sent += 1;
            } catch (_) { /* a dying socket is not worth a log line here */ }
        }
        return sent;
    }

    /**
     * Bridge body-state changes into live conversations.
     *
     * At most ONE contextual update per character per BODY_STATE_MIN_INTERVAL_MS,
     * and only when its text changed. The old bridge sent one per part every
     * ~0.5 s while the idle loop moved: one node's callout conversations carried
     * ~106 empty agent entries each and billed 17.5k input tokens for a
     * 25-token line. Changes that arrive inside the interval are merged into
     * the next update, so the newest state is never lost, only batched.
     */
    _initBodyStateBridge() {
        if (this._bodyStateBridgeUp) return;
        this._bodyStateBridgeUp = true;
        this._bodyStatePending = new Map(); // characterId -> { timer, partIds:Set, pose:boolean }
        import('./bodyStateService.js').then(m => {
            const bodyState = m.default || m;
            this._bodyStateModule = bodyState;
            bodyState.onChange(({ characterId, kind, partId }) => {
                try { this._noteBodyStateChange(characterId, kind, partId); } catch (_) { /* never break the motion path */ }
            });
            console.log('🧠 Body-state → contextual_update bridge armed (≤1 update / 5 s / character, on change only)');
        }).catch(() => { /* body state unavailable — conversations work without it */ });
    }

    _noteBodyStateChange(characterId, kind, partId) {
        const key = String(characterId);
        let pending = this._bodyStatePending.get(key);
        if (!pending) {
            pending = { timer: null, partIds: new Set(), pose: false };
            this._bodyStatePending.set(key, pending);
        }
        if (kind === 'part' && partId != null) pending.partIds.add(partId);
        if (kind === 'pose') pending.pose = true;
        if (pending.timer) return;
        const last = this._bodyStateSent.get(key);
        const wait = Math.max(500, last ? (last.at + BODY_STATE_MIN_INTERVAL_MS - Date.now()) : 500);
        pending.timer = setTimeout(() => this._flushBodyState(characterId), wait);
        if (pending.timer.unref) pending.timer.unref();
    }

    _flushBodyState(characterId) {
        const key = String(characterId);
        const pending = this._bodyStatePending.get(key);
        this._bodyStatePending.delete(key);
        const bodyState = this._bodyStateModule;
        if (!pending || !bodyState) return;
        try {
            const sentences = [];
            if (pending.pose) {
                const d = bodyState.describePose(characterId);
                if (d && d.text) sentences.push(d.text);
            }
            for (const pid of pending.partIds) {
                const d = bodyState.describeChange(characterId, pid);
                if (d && d.text) sentences.push(d.text);
            }
            const text = sentences.join(' ');
            if (!text) return;
            const last = this._bodyStateSent.get(key);
            if (last && last.text === text) return; // nothing new to say
            const sent = this.sendContextualUpdate(characterId, text, 'body_state_change');
            if (sent > 0) this._bodyStateSent.set(key, { at: Date.now(), text });
        } catch (_) { /* context is best-effort */ }
    }

    /**
     * Follow Orders tap. Lazy import (the executor's ack path imports back
     * into this service) and fire-and-forget: a matcher fault must never
     * break the conversation pipeline.
     */
    _followOrdersHook(characterId, text, meta) {
        if (characterId == null || !text) return;
        import('./followOrders/followOrdersListener.js')
            .then(m => (m.default || m).handleTranscript(characterId, text, meta))
            .catch(() => { /* listener unavailable — nothing to do */ });
    }

    _followOrdersMicSignal(characterId, event) {
        if (characterId == null) return;
        import('./followOrders/followOrdersListener.js')
            .then(m => {
                const listener = m.default || m;
                if (event === 'start') listener.onConversationMicStart(characterId);
                else listener.onConversationMicStop(characterId);
            })
            .catch(() => { /* noop */ });
    }

    async _startServerMicLoop(sessionId) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        if (connection.serverMicActive) return;
        connection.serverMicActive = true;
        // One capture process per device: the standalone Follow Orders
        // listener yields the microphone while this session holds it.
        this._followOrdersMicSignal(connection.characterId, 'start');

        // Handles ONE frame of microphone PCM16LE. Driven by the continuous capture
        // stream below rather than by a polling timer, so it now sees every frame
        // instead of only the ~34% that survived the old spawn-per-tick gaps.
        const handleFrame = async (raw) => {
            if (!connection.serverMicActive) return;
            // Check if Scribe v2 Realtime session is connected
            const realtimeReady = !!(connection.realtimeSTTSession && connection.realtimeSTTSession.isConnected);
            try {
                const deviceId = connection._lastDevId || 'default';
                if (raw && raw.length) {

                    // Current time and suppression check (avoid echo during server playback)
                    const now = Date.now();
                    const suppressed = connection.suppressMicUntilMs && (now < connection.suppressMicUntilMs);

                    // Frame energy, computed BEFORE anything is forwarded so it can
                    // gate the agent stream. (It used to be computed further down,
                    // after the send, so it could only ever be used for reporting.)
                    let frameRms = 0;
                    try {
                        let sumSq = 0;
                        const n = Math.floor(raw.length / 2);
                        for (let si = 0; si < n; si++) {
                            const s = raw.readInt16LE(si * 2);
                            sumSq += s * s;
                        }
                        frameRms = Math.min(1, Math.sqrt(sumSq / (n || 1)) / 32768);
                    } catch (_) { frameRms = 0; }

                    // Track the room's noise floor so the voice gate adapts to the
                    // install instead of assuming a level. Latches onto any quieter
                    // frame immediately and creeps upward slowly, so a single cough
                    // cannot raise it but a genuinely noisier room is followed.
                    // Never updated while suppressed — the character's own voice must
                    // not be learned as "silence".
                    if (!suppressed) {
                        connection._noiseFloor = (connection._noiseFloor == null)
                            ? frameRms
                            : Math.min(frameRms, connection._noiseFloor * 1.0008 + 0.00002);
                    }

                    const fullDuplex = connection.duplexMode === 'full';
                    const voiceThreshold = Math.max(
                        VOICE_ACTIVITY_RMS,
                        (connection._noiseFloor || 0) * VOICE_GATE_MARGIN
                    );

                    // What the speaker played during this frame (plus a reverb
                    // window): the basis of the echo prediction.
                    const playbackRms = this._playbackLevel(connection.characterId, now - 250 - 300, now);
                    const playing = playbackRms > ECHO_MIN_PLAYBACK_RMS;

                    // Echo-aware state, shared by both modes: how loud the
                    // character's own voice comes back per unit of playback level.
                    let guestThreshold = voiceThreshold;
                    if (playing) {
                        const verdict = echoAwareBargeIn({
                            coupling: connection._echoCoupling,
                            learnFrames: connection._echoLearnFrames,
                            bargeInFrames: connection._bargeInFrames,
                            speechStartedAt: connection.speechStartedAt
                        }, frameRms, playbackRms, now);
                        connection._echoCoupling = verdict.coupling;
                        connection._echoLearnFrames = verdict.learnFrames;
                        connection._bargeInFrames = verdict.run;
                        if (fullDuplex) {
                            // Until the coupling is learned (first frames of a
                            // reply, inside the grace window) nothing is trusted.
                            guestThreshold = (verdict.learnFrames <= 3)
                                ? Infinity
                                : Math.max(voiceThreshold, BARGE_IN_RMS_FLOOR,
                                    verdict.coupling * playbackRms * FULL_DUPLEX_ECHO_MARGIN);
                        } else {
                            guestThreshold = Math.max(voiceThreshold, verdict.threshold);
                        }

                        // HALF duplex only: the agent cannot hear the guest while
                        // the character speaks, so a sustained frame clearly above
                        // the predicted echo is the guest talking over it. FULL
                        // duplex leaves the decision to the agent (its
                        // 'interruption' event), which hears the real audio.
                        if (!fullDuplex && BARGE_IN_ENABLED && suppressed && connection.aiSpeaking && verdict.bargeIn) {
                            connection._bargeInFrames = 0;
                            this._bargeIn(sessionId, 'guest', { scope: 'character' });
                        }
                    } else {
                        connection._bargeInFrames = 0;
                    }

                    // Did the GUEST make this sound? In half duplex a suppressed
                    // frame is the character by definition; otherwise a frame must
                    // clear both the room gate and the predicted echo.
                    const guestVoice = fullDuplex
                        ? frameRms > guestThreshold
                        : (!suppressed && frameRms > guestThreshold);
                    if (guestVoice) {
                        connection._lastVoiceAtMs = now;
                    }

                    // Voice gate: forward to the agent only while the guest is
                    // actually making sound, plus a short hangover to bridge the
                    // pauses inside a sentence.
                    //
                    // Without this, an idle-but-enabled agent receives an unbroken
                    // stream of room tone — and the idle micro-movement servos are
                    // right next to the microphone. The agent's ASR hallucinates
                    // short tokens on that ("Yes.", "..."), each of which becomes a
                    // spurious guest turn the character then answers.
                    const voiceGateOpen = !!(connection._lastVoiceAtMs &&
                        (now - connection._lastVoiceAtMs) < MIC_GATE_HANGOVER_MS);

                    // 1) Stream to the ConvAI agent. The stream must never go absent:
                    //    the turn-detection model runs on a continuous audio timeline,
                    //    and simply not sending frames leaves it unable to decide the
                    //    turn ended (measured: replies took 9-13s, or never came).
                    //    So when the gate is closed we substitute digital silence.
                    //
                    //    HALF duplex: silence while the character speaks (suppressed).
                    //    FULL duplex: suppression does not apply to the agent stream;
                    //    the array has already removed the character's voice, so the
                    //    guest is heard while the character talks, which is what
                    //    lets the agent's own turn model interrupt it.
                    // Full duplex while the speaker plays: this frame must be the
                    // guest (no hangover, which would let the character's own
                    // voice ride on a guest's last syllable).
                    const blockedByEcho = fullDuplex ? (playing && !guestVoice) : !!suppressed;
                    const sentReal = !blockedByEcho && (!MIC_VOICE_GATE_ENABLED || voiceGateOpen);
                    if (connection.elevenLabsWs &&
                        connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                        const payload = sentReal ? raw.toString('base64') : _floorFrameB64(raw.length);
                        try {
                            connection.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: payload }));
                        } catch (_) { /* non-fatal */ }
                    }

                    // 2) Stream to Scribe v2 Realtime for live STT (unless suppressed)
                    if (!suppressed && realtimeReady) {
                        // Send raw PCM directly to Scribe v2 Realtime — no batch polling needed!
                        connection.realtimeSTTSession.sendPCMBuffer(raw);
                    }
                    // 2b) Fallback: Batch STT if Scribe v2 Realtime is not available.
                    //     Skipped for headless sessions: the agent does its own ASR and
                    //     there is no browser client to receive transcripts, so this would
                    //     burn STT credits every 2.5s for nothing.
                    else if (!suppressed && !realtimeReady && !connection.headless && (!connection.sttLastAt || (now - connection.sttLastAt) >= 2500)) {
                        // Accumulate PCM for batch STT fallback
                        try {
                            if (!connection.sttPcm) connection.sttPcm = Buffer.alloc(0);
                            connection.sttPcm = Buffer.concat([connection.sttPcm, raw]);
                            const maxBytes = 16000 * 2 * 6; // 6 seconds
                            if (connection.sttPcm.length > maxBytes) {
                                connection.sttPcm = connection.sttPcm.slice(connection.sttPcm.length - maxBytes);
                            }
                        } catch (_) { /* noop */ }

                        connection.sttLastAt = now;
                        try {
                            const sttCfg = await getSTTConfig();
                            const pcmForStt = (connection.sttPcm && connection.sttPcm.length >= 80000)
                                ? connection.sttPcm.slice(-Math.min(connection.sttPcm.length, 16000 * 2 * 6))
                                : null;
                            if (pcmForStt) {
                                let sttWav = encodeWavPCM16LE(pcmForStt, 16000, 1);
                                const lang = (connection.sttLanguage && connection.sttLanguage !== 'auto') ? connection.sttLanguage : (sttCfg.language || 'auto');
                                const audioFilterEnabled = (sttCfg.audioFilterEnabled !== false);
                                try {
                                    if (process.env.MB_STT_FILTER === '1' || (audioFilterEnabled && lang && lang.slice(0, 2) === 'en')) {
                                        sttWav = await this._filterWavForSTT(sttWav, sttCfg);
                                    }
                                } catch (_) { /* keep original on failure */ }

                                const result = await elevenLabsSTTService.transcribeAudio(sttWav, { mimeType: 'audio/wav', model: sttCfg.model, language: lang });
                                const text = (result && result.success && (result.transcript || result.text)) ? String(result.transcript || result.text).trim() : '';

                                if (text) {
                                    let allow = true;
                                    const filterSfx = (sttCfg.filterSfx !== false);
                                    const validateEnglish = (sttCfg.validateEnglish !== false);
                                    if ((lang || '').slice(0, 2) === 'en' && process.env.MB_AUTOTUNE_ALLOW_SFX !== '1') {
                                        if (filterSfx && _isBracketedSfx(text)) allow = false;
                                        else if (validateEnglish && !_isLikelyEnglish(text, sttCfg)) allow = false;
                                    }
                                    if (allow) {
                                        this.sendToClient(sessionId, { type: 'stt_partial', text: text, timestamp: now, source: 'batch_scribe_v2' });
                                        connection.sttPcm = Buffer.alloc(0);
                                    }
                                }
                            }
                        } catch (e) {
                            try {
                                const msg = (e && (e.message || e.error || e.toString && e.toString())) || 'STT failed';
                                this.sendToClient(sessionId, { type: 'stt_error', message: String(msg).slice(0, 200) });
                            } catch (_) { /* noop */ }
                        }
                    } else if (!suppressed && !realtimeReady && !connection.headless) {
                        // Still accumulate PCM for batch fallback between throttle windows
                        try {
                            if (!connection.sttPcm) connection.sttPcm = Buffer.alloc(0);
                            connection.sttPcm = Buffer.concat([connection.sttPcm, raw]);
                            const maxBytes = 16000 * 2 * 6;
                            if (connection.sttPcm.length > maxBytes) {
                                connection.sttPcm = connection.sttPcm.slice(connection.sttPcm.length - maxBytes);
                            }
                        } catch (_) { /* noop */ }
                    }

                    // 3) Report the frame level to the browser VU meter. The RMS and
                    //    the _lastVoiceAtMs timestamp are computed at the top of this
                    //    handler, because the voice gate needs them before deciding
                    //    whether to forward the frame.
                    const rmsLevel = frameRms;

                    // Send audio level to browser every ~500ms (every other tick at 250ms)
                    if (!connection._vuLastTs || (now - connection._vuLastTs) >= 500) {
                        connection._vuLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'audio_level', level: Math.round(rmsLevel * 100) }); } catch (_) { }
                    }

                    // 3b) Server-side breadcrumb for the mic path. Logged only on a
                    //     suppression transition or when the guest is actually audible,
                    //     and at most once a second, so it stays off the SD card during
                    //     idle hours but is there when a turn goes missing.
                    const loud = frameRms > voiceThreshold;
                    if (suppressed !== connection._dbgWasSuppressed ||
                        (loud && (!connection._dbgVoiceTs || (now - connection._dbgVoiceTs) >= 1000))) {
                        if (loud) connection._dbgVoiceTs = now;
                        connection._dbgWasSuppressed = suppressed;
                        console.log(`🎤 [mic] session=${sessionId} mode=${connection.duplexMode || '?'} rms=${frameRms.toFixed(3)} ` +
                            `floor=${(connection._noiseFloor || 0).toFixed(3)} gate=${voiceThreshold.toFixed(3)} ` +
                            `suppressed=${!!suppressed} forMs=${suppressed ? Math.round(connection.suppressMicUntilMs - now) : 0} ` +
                            `play=${playbackRms.toFixed(3)} echoK=${connection._echoCoupling != null ? connection._echoCoupling.toFixed(2) : '-'} sentReal=${sentReal}`);
                    }

                    // 4) Periodic client breadcrumb with device and bytes captured (once per second)
                    if (!connection._dbgLastTs || (now - connection._dbgLastTs) >= 1000) {
                        connection._dbgLastTs = now;
                        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_tick', data: { deviceId, bytes: raw.length, suppressed: !!suppressed, realtimeSTT: realtimeReady } }); } catch (_) { }
                    }
                }
            } catch (_) { /* ignore per-frame errors */ }
        };

        // Resolve the capture device once. The stream stays open for the life of
        // the session, so changing microphones now requires restarting the session
        // (previously it was re-resolved every tick, which is what made each tick
        // pay full device-resolution + process-spawn cost).
        let deviceId = 'default';
        if (connection.characterId != null) {
            try { deviceId = await getMicrophoneDeviceForCharacter(connection.characterId); } catch (_) { deviceId = 'default'; }
        } else {
            // microphoneDeviceId is what the operator's mic dropdown writes, and it is
            // the only device key getSTTConfig() actually surfaces — its return is an
            // explicit literal that never carries `deviceId`, so the old
            // `cfg.deviceId || cfg.microphoneDeviceId` read could only ever resolve to
            // the second operand. The raw stt-config.json on some nodes still holds a
            // stale `deviceId` (e.g. "pulse"); it is inert HERE, but see KNOWN-BUGS for
            // the capture paths that read the raw file directly.
            try { const cfg = await getSTTConfig(); deviceId = cfg.microphoneDeviceId || 'default'; } catch (_) { deviceId = 'default'; }
        }
        connection._lastDevId = deviceId;
        try { this.sendToClient(sessionId, { type: 'debug', originalType: 'server_mic_device', data: { deviceId } }); } catch (_) { }

        // Duplex mode, decided once per session and logged so the operator can
        // see which behaviour a node is running.
        await this._resolveDuplexMode(connection);

        // Re-frame the continuous byte stream into steady 250ms frames (8000 bytes
        // at 16kHz mono PCM16) so every downstream consumer keeps the cadence it
        // was written for — only the silence between chunks is gone.
        const FRAME_BYTES = 8000;
        let pending = Buffer.alloc(0);

        connection.micCaptureHandle = serverSTTListener.startContinuousCapture(deviceId, (buf) => {
            if (!connection.serverMicActive || !connection.isActive) return;
            pending = pending.length ? Buffer.concat([pending, buf]) : buf;
            while (pending.length >= FRAME_BYTES) {
                const frame = Buffer.from(pending.subarray(0, FRAME_BYTES));
                pending = pending.subarray(FRAME_BYTES);
                handleFrame(frame).catch(() => { });
            }
        }, (err) => {
            console.error(`🎤 Continuous mic capture failed for ${sessionId}: ${err && err.message}`);
        });

        console.log(`🎤 Continuous mic capture started for ${sessionId} (device=${deviceId})`);
    }

    _stopServerMicLoop(sessionId, sendEos) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) return;
        const wasActive = connection.serverMicActive;
        connection.serverMicActive = false;
        // Symmetric with the start signal: only announce a real release, so
        // the standalone Follow Orders listener's holder count stays honest.
        if (wasActive) this._followOrdersMicSignal(connection.characterId, 'stop');
        if (connection.serverMicTimer) { try { clearTimeout(connection.serverMicTimer); } catch (_) { } connection.serverMicTimer = null; }
        // Kill the long-lived capture process, or it keeps holding the microphone
        // (and streaming into a dead session) after the agent is switched off.
        if (connection.micCaptureHandle) {
            try { connection.micCaptureHandle.stop(); } catch (_) { }
            connection.micCaptureHandle = null;
        }
        if (sendEos) this._sendEmptyAudioChunkToAgent(sessionId);
    }

    _sendEmptyAudioChunkToAgent(sessionId) {
        const c = this.activeConnections.get(sessionId);
        try {
            if (c && c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN) {
                c.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: '' }));
            }
        } catch (_) { /* noop */ }
    }


    /**
     * Handle client disconnect
     */
    handleClientDisconnect(sessionId) {
        console.log(`🔌 Client disconnected: ${sessionId}`);

        // Stop any server mic loop and send EOS
        try { this._stopServerMicLoop(sessionId, true); } catch (_) { /* noop */ }
        // Stop Scribe v2 Realtime STT session
        try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }

        const connection = this.activeConnections.get(sessionId);
        if (connection) {
            // A browser tab closing must never silence the headless agent: only
            // this session's own player is touched, and it finishes its sentence.
            if (connection.characterId != null) {
                try { serverPlaybackService.stopStream({ characterId: connection.characterId, owner: sessionId, drain: true }); } catch (_) { /* noop */ }
            }
            // Close ElevenLabs WebSocket if active
            if (connection.elevenLabsWs && connection.elevenLabsWs.readyState === WebSocket.OPEN) {
                try {
                    connection._agentSocket = null;
                    console.log(`🔌 Closing ElevenLabs connection for disconnected client ${sessionId}`);
                    connection.elevenLabsWs.close();
                } catch (error) {
                    console.warn(`⚠️ Error closing ElevenLabs connection: ${error.message}`);
                }
            }
            this.activeConnections.delete(sessionId);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(sessionId, message) {
        const connection = this.activeConnections.get(sessionId);
        if (connection && connection.clientWs && connection.clientWs.readyState === WebSocket.OPEN) {
            connection.clientWs.send(JSON.stringify(message));
        }
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Get active connections count
     */
    getActiveConnectionsCount() {
        return this.activeConnections.size;
    }

    /**
     * Get summary of active sessions for status display
     */
    getActiveSessions() {
        const sessions = [];
        for (const [id, c] of this.activeConnections) {
            sessions.push({
                sessionId: id, isActive: !!c.isActive, characterId: c.characterId,
                headless: !!c.headless, oneShot: !!c.ephemeralAsk,
                duplexMode: c.duplexMode || null,
                reconnecting: !!(c._reconnectTimer || (c._wanted && c._connecting)),
                reconnects: c._reconnectCount || 0
            });
        }
        return sessions;
    }

    // ------------------------------------------------------------------
    // Activity (for the lurk/inactivity logic)
    // ------------------------------------------------------------------

    /**
     * Subscribe to conversation activity: guest speech (a real user transcript,
     * never ASR noise like "...") and agent speech. The handler receives
     * `{ characterId, kind: 'guest_speech'|'agent_speech', sessionId, headless,
     * oneShot, at, prompted?, text? }`. Agent speech is reported at most once
     * per 2 s per character.
     *
     * `prompted` (agent speech only) is true when the line answers a real guest
     * transcript, an ask or a one-shot question, and false when the agent is
     * talking on its own: measured live on 2026-10-09, an agent left alone in
     * an empty room re-engages every ~10-15 s off its turn-timeout "..." turns.
     * Inactivity logic should count guest speech and prompted agent speech
     * only, or an empty yard never goes back to sleep.
     *
     * Returns an unsubscribe function. Handlers cannot break the conversation:
     * their exceptions are caught.
     */
    onActivity(handler) {
        if (typeof handler !== 'function') return () => {};
        const safe = (evt) => { try { handler(evt); } catch (e) { console.warn('⚠️ activity handler failed:', e && e.message); } };
        this.on('activity', safe);
        return () => this.off('activity', safe);
    }

    _turnIsPrompted(turn) {
        return !!(turn && (turn.source === 'speech' || turn.source === 'ask-ai' || turn.source === 'one-shot'));
    }

    _emitActivity(connection, kind, extra = {}) {
        if (!connection || connection.characterId == null) return;
        const now = Date.now();
        if (kind === 'agent_speech') {
            const key = String(connection.characterId);
            const last = this._agentActivityAt.get(key) || 0;
            if (now - last < AGENT_ACTIVITY_THROTTLE_MS) return;
            this._agentActivityAt.set(key, now);
        }
        const evt = {
            characterId: connection.characterId, kind,
            sessionId: connection.sessionId, headless: !!connection.headless,
            oneShot: !!connection.ephemeralAsk, at: now
        };
        if (kind === 'agent_speech') evt.prompted = extra.prompted === true;
        if (extra.text) evt.text = String(extra.text).slice(0, 200);
        try { this.emit('activity', evt); } catch (e) { console.warn('⚠️ activity emit failed:', e && e.message); }
    }

    // ------------------------------------------------------------------
    // Duplex mode
    // ------------------------------------------------------------------

    async _resolveDuplexMode(connection) {
        if (!connection || connection.duplexMode) return connection && connection.duplexMode;
        let decision;
        try {
            const parts = connection.characterId != null
                ? await getAudioPartsForCharacter(connection.characterId)
                : { mic: null, speaker: null };
            decision = detectDuplexMode({
                micPart: parts.mic, speakerPart: parts.speaker,
                override: process.env.MB_CONVERSATION_DUPLEX || null
            });
        } catch (e) {
            decision = { mode: 'half', reason: `detection failed (${e && e.message})`, source: 'detected' };
        }
        // A browser mic session's audio comes from the browser, whose echo
        // cancellation we cannot see: half duplex.
        if (connection.micSource === 'browser' && decision.source !== 'override') {
            decision = { mode: 'half', reason: 'browser microphone', source: 'detected' };
        }
        connection.duplexMode = decision.mode;
        connection.duplexReason = decision.reason;
        console.log(`🎛️  [duplex] character ${connection.characterId} session ${connection.sessionId}: ` +
            `${decision.mode.toUpperCase()} duplex (${decision.source}: ${decision.reason})` +
            (decision.mode === 'full' ? ': real mic audio flows while speaking; the agent decides interruptions'
                : `: mic suppressed while speaking, echo-aware barge-in ${BARGE_IN_ENABLED ? 'on' : 'OFF (MB_BARGE_IN=0)'}, tail ${HALF_DUPLEX_TAIL_MS}ms`));
        return decision.mode;
    }

    /** Duplex mode of a character's live session(s), for status routes. */
    getConversationMode(characterId) {
        for (const [, c] of this.activeConnections) {
            if (Number(c.characterId) === Number(characterId) && c.duplexMode && !c.ephemeralAsk) {
                return { mode: c.duplexMode, reason: c.duplexReason, sessionId: c.sessionId };
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Playback (ordered, device resolved once, owner-keyed)
    // ------------------------------------------------------------------

    _ensureSpeakerDevice(connection) {
        if (connection._speakerDeviceId) return Promise.resolve(connection._speakerDeviceId);
        if (!connection._speakerDevicePromise) {
            connection._speakerDevicePromise = serverPlaybackService.resolveSpeakerDevice({
                characterId: connection.characterId,
                speakerPartId: connection.speakerPartId
            }).then((dev) => {
                connection._speakerDeviceId = dev || 'default';
                return connection._speakerDeviceId;
            }).catch(() => {
                connection._speakerDeviceId = 'default';
                return 'default';
            });
        }
        return connection._speakerDevicePromise;
    }

    /**
     * Hand one PCM chunk to this session's own player, in arrival order.
     * Until the device is known, chunks wait in a per-session queue that is
     * flushed in order; afterwards each write is synchronous up to stdin.
     */
    _writeAgentPcm(connection, buffer, sampleRate, volume) {
        const opts = {
            characterId: connection.characterId, owner: connection.sessionId,
            volume, sampleRate, kind: 'ai'
        };
        if (connection._speakerDeviceId) {
            return serverPlaybackService.writePcmStream(buffer, { ...opts, deviceId: connection._speakerDeviceId });
        }
        if (!connection._pcmPreDevice) connection._pcmPreDevice = [];
        return new Promise((resolve) => {
            connection._pcmPreDevice.push({ buffer, resolve });
            if (connection._pcmPreDevice.length > 1) return;
            this._ensureSpeakerDevice(connection).then((dev) => {
                const queued = connection._pcmPreDevice || [];
                connection._pcmPreDevice = null;
                for (const q of queued) {
                    q.resolve(serverPlaybackService.writePcmStream(q.buffer, { ...opts, deviceId: dev }));
                }
            });
        });
    }

    /** Remember what the speaker plays, for the echo prediction. */
    _notePlayback(characterId, startMs, endMs, rms) {
        if (characterId == null) return;
        const key = String(characterId);
        let env = this._playbackEnvelope.get(key);
        if (!env) { env = []; this._playbackEnvelope.set(key, env); }
        env.push({ start: startMs, end: endMs, rms });
        const cutoff = Date.now() - 5000;
        while (env.length && env[0].end < cutoff) env.shift();
        if (env.length > 400) env.splice(0, env.length - 400);
    }

    _playbackLevel(characterId, fromMs, toMs) {
        const env = characterId == null ? null : this._playbackEnvelope.get(String(characterId));
        if (!env || !env.length) return 0;
        let level = 0;
        for (let i = env.length - 1; i >= 0; i--) {
            const seg = env[i];
            if (seg.end < fromMs) break;
            if (seg.start <= toMs && seg.end >= fromMs && seg.rms > level) level = seg.rms;
        }
        return level;
    }

    _clearPlaybackEnvelope(characterId) {
        if (characterId != null) this._playbackEnvelope.delete(String(characterId));
    }

    /**
     * One agent audio event on a live (headless or browser) session.
     */
    _handleAgentAudio(sessionId, connection, message) {
        const ev = message && message.audio_event;
        if (!ev) return;
        const c = connection;
        const audioData = ev.audio_base_64;
        const eid = ev.event_id;

        // Audio of an interrupted response, however late it arrives, is dropped.
        if (isInterruptedAudio(eid, c._resumeFromEventId)) return;
        // Fallback for an interruption that named no event: a short time window.
        if (c.discardAgentAudioUntilMs && Date.now() < c.discardAgentAudioUntilMs) return;

        // A turn already classified as the replayed greeting stays dropped,
        // including chunks that arrive after its agent_response (measured on
        // the live XVF3800 node: ~1 s of greeting tail leaked when the filter stepped aside).
        if (eid !== undefined && c._greetingVerdicts && c._greetingVerdicts.get(eid) === 'greeting') return;

        // Reconnect without the empty-first-message override: hold audio until
        // its turn is classified, so the replayed greeting can be dropped.
        if (c._suppressGreeting && eid !== undefined && audioData) {
            const verdict = c._greetingVerdicts.get(eid);
            if (verdict === 'greeting') return;
            if (verdict !== 'answer') {
                if (!c._greetingStaged.has(eid)) c._greetingStaged.set(eid, []);
                c._greetingStaged.get(eid).push(message);
                return;
            }
        }
        this._playAgentAudio(sessionId, c, message);
    }

    _releaseGreetingStage(sessionId, c, eid, isAnswer) {
        c._greetingVerdicts.set(eid, isAnswer ? 'answer' : 'greeting');
        const staged = c._greetingStaged.get(eid) || [];
        c._greetingStaged.delete(eid);
        // The filter's job is the one greeting at the start of a reconnected
        // conversation; once any turn is classified it steps aside.
        c._suppressGreeting = false;
        if (isAnswer) for (const m of staged) this._playAgentAudio(sessionId, c, m);
    }

    _playAgentAudio(sessionId, c, message) {
        const ev = message.audio_event;
        const audioData = ev.audio_base_64;
        const responseText = ev.agent_response || ev.text || null;
        if (ev.event_id !== undefined) c._currentAudioEventId = ev.event_id;

        // Audio counts as reply activity for a question asked on this
        // session, a filler line or a reply that is still streaming
        // must keep the caller waiting rather than settling early.
        if (c._pendingAsk && audioData) {
            c._pendingAsk.sawAudio = true;
            this._settlePendingAsk(sessionId);
        }

        if (audioData) {
            const audioBuffer = Buffer.from(audioData, 'base64');
            const fmt = c.audioOutputFormat || 'pcm_16000';
            const isPcm = fmt.startsWith('pcm_');
            const sampleRate = isPcm ? (parseInt(fmt.split('_')[1]) || 16000) : 16000;
            const nowMs = Date.now();
            const UTTERANCE_GAP_MS = 1200;
            const newUtterance = !c.aiSpeaking || (c.lastAudioChunkAt && (nowMs - c.lastAudioChunkAt) > UTTERANCE_GAP_MS);
            if (newUtterance) {
                c.aiSpeaking = true;
                c.speechStartedAt = nowMs;
                c.accumulatedAudioMs = 0;
            }
            c.lastAudioChunkAt = nowMs;

            // Turn clock: the first chunk of a new utterance is the reply's first audio.
            if (!c._turn || c._turn.firstAudioAtMs) {
                if (newUtterance) {
                    // A reply nobody asked for on this socket (a soft-timeout
                    // filler, an agent-initiated line): still a turn worth timing.
                    this._startTurn(c, { source: 'agent', transcriptAtMs: null });
                }
            }
            const turn = c._turn;
            const firstOfTurn = turn && !turn.firstAudioAtMs;
            if (firstOfTurn) turn.firstAudioAtMs = nowMs;
            this._emitActivity(c, 'agent_speech', { prompted: this._turnIsPrompted(turn) });

            const chunkMs = isPcm ? (audioBuffer.length / (sampleRate * 2)) * 1000 : (audioBuffer.length * 8 / 128);
            c.accumulatedAudioMs += chunkMs;

            // Model when the speaker will actually FALL SILENT, not when the
            // bytes arrived: ElevenLabs streams far faster than real time.
            const startMs = Math.max(c.playbackEndsAtMs || 0, nowMs);
            c.playbackEndsAtMs = startMs + chunkMs;

            // Half-duplex echo suppression until the speaker is quiet plus a
            // short tail (room reverb, capture buffering). Character-wide: one
            // speaker, one microphone, possibly several sessions. In full
            // duplex this window no longer gates the agent stream (see the mic
            // loop); it still gates browser STT and tells the music supervisor
            // the character is talking.
            this._suppressMicUntil(c.characterId, c.playbackEndsAtMs + HALF_DUPLEX_TAIL_MS);

            // Playback envelope for the echo prediction.
            if (isPcm) {
                let sum = 0;
                const n = audioBuffer.length >> 1;
                for (let k = 0; k < n; k++) { const smp = audioBuffer.readInt16LE(k * 2); sum += smp * smp; }
                this._notePlayback(c.characterId, startMs, startMs + chunkMs, n ? Math.sqrt(sum / n) / 32768 : 0);
            }

            try {
                if (c.audioPlaybackEnabled !== false) {
                    if (!c._audioChunkCount) {
                        c._audioChunkCount = 0;
                        console.log(`🔊 First audio chunk: ${audioBuffer.length} bytes, format="${fmt}", charId=${c.characterId}, owner=${sessionId}`);
                    }
                    c._audioChunkCount++;
                    let write;
                    if (isPcm) {
                        write = this._writeAgentPcm(c, audioBuffer, sampleRate, 90);
                        // Jaw from the same PCM, paced by the streaming driver.
                        try {
                            this._jaw.driveJawFromPcmStream(c.characterId, audioBuffer, sampleRate).catch(() => {});
                        } catch (_) { /* non-fatal */ }
                    } else {
                        write = serverPlaybackService.writeMp3Stream(audioBuffer, {
                            characterId: c.characterId, owner: sessionId,
                            speakerPartId: c.speakerPartId, volume: 90, kind: 'ai'
                        });
                    }
                    Promise.resolve(write).then((r) => {
                        if (!turn) return;
                        if (r && r.muted) turn.muted = true;
                        if (firstOfTurn) {
                            turn.playbackStartAtMs = (r && Number.isFinite(r.startsAtMs)) ? r.startsAtMs : Date.now();
                            if (r && r.coldStart) turn.coldStart = true;
                        }
                        const end = (r && Number.isFinite(r.playsUntilMs)) ? r.playsUntilMs : c.playbackEndsAtMs;
                        if (!turn.interruptedAt) turn.playbackEndAtMs = Math.max(turn.playbackEndAtMs || 0, end);
                        // Only for the turn this chunk belongs to: a late write
                        // callback of the previous reply must not arm (and then
                        // silently drop) the turn that has just started.
                        if (c._turn === turn) this._armTurnFinalize(c);
                    }).catch(err => {
                        console.error(`❌ AI audio playback ERROR:`, err && err.message ? err.message : err);
                    });
                } else if (turn) {
                    if (firstOfTurn) turn.playbackStartAtMs = nowMs;
                    turn.playbackEndAtMs = c.playbackEndsAtMs;
                    if (c._turn === turn) this._armTurnFinalize(c);
                }
            } catch (e) {
                console.error('❌ CRITICAL: Error playing AI audio:', e);
            }
        }

        // Send audio chunk to client (type 'audio_chunk', NOT agent_response)
        const chunkMsg = { type: 'audio_chunk', audio: audioData, timestamp: Date.now(), realTime: true };
        if (responseText) chunkMsg.text = responseText;
        this.sendToClient(sessionId, chunkMsg);

        // A safe random pose ("sway") ONCE per agent turn while it speaks, if
        // AI Motion ambient is enabled (keys off the agent_response length).
        try {
            if (c.characterId != null && !c._ambientFiredThisTurn && (c._ambientTurnLen || 0) >= 50) {
                c._ambientFiredThisTurn = true;
                randomPoseService.triggerDuringTTS(c.characterId, c._ambientTurnLen);
            }
        } catch (_) { /* noop */ }
    }

    /**
     * The agent decided the guest interrupted. Stop THIS session's player now
     * (no drain), refuse every remaining chunk of the interrupted response, and
     * reopen the mic. Nothing else on the node is touched.
     */
    _handleAgentInterruption(sessionId, connection, evt) {
        if (evt && evt.event_id != null) connection._resumeFromEventId = evt.event_id;
        if (connection._turn) connection._turn.interrupted = true;
        this._bargeIn(sessionId, 'agent', { scope: 'session', hasEventId: evt && evt.event_id != null });
    }

    // ------------------------------------------------------------------
    // Per-turn latency
    // ------------------------------------------------------------------

    _startTurn(connection, fields) {
        this._finalizeTurn(connection, 'next turn');
        connection._turn = {
            characterId: connection.characterId,
            sessionId: connection.sessionId,
            mode: connection.ephemeralAsk ? 'one-shot' : (connection.duplexMode || null),
            source: fields.source || 'speech',
            speechEndMs: fields.speechEndMs || null,
            transcriptAtMs: ('transcriptAtMs' in fields) ? fields.transcriptAtMs : Date.now(),
            responseAtMs: null,
            firstAudioAtMs: null,
            playbackStartAtMs: null,
            playbackEndAtMs: null,
            interrupted: false,
            text: fields.text ? String(fields.text).slice(0, 120) : null
        };
        return connection._turn;
    }

    _armTurnFinalize(connection) {
        const t = connection._turn;
        if (!t) return;
        if (connection._turnTimer) clearTimeout(connection._turnTimer);
        const wait = Math.max(300, (t.playbackEndAtMs || Date.now()) - Date.now() + 500);
        connection._turnTimer = setTimeout(() => {
            connection._turnTimer = null;
            if (connection._turn === t && t.firstAudioAtMs) this._finalizeTurn(connection, 'played out');
        }, wait);
        if (connection._turnTimer.unref) connection._turnTimer.unref();
    }

    /** Close the current turn: log one line, keep it in memory. */
    _finalizeTurn(connection, why) {
        const t = connection && connection._turn;
        if (!t) return null;
        connection._turn = null;
        if (connection._turnTimer) { clearTimeout(connection._turnTimer); connection._turnTimer = null; }
        // A guest turn the agent never answered, or noise, is not a latency sample.
        if (!t.firstAudioAtMs) return null;
        t.endedBy = why;
        t.metrics = turnMetrics(t);
        const key = String(t.characterId);
        let list = this._turnHistory.get(key);
        if (!list) { list = []; this._turnHistory.set(key, list); }
        list.push({ ...t, at: new Date(t.firstAudioAtMs).toISOString() });
        while (list.length > TURN_HISTORY_MAX) list.shift();
        console.log(formatTurnLine(t));
        return t;
    }

    /**
     * Recent turn latencies for a character (newest last) plus p50/p90, for a
     * status route. In memory only; empty after a restart.
     */
    getTurnLatency(characterId) {
        const list = this._turnHistory.get(String(characterId)) || [];
        const turns = list.map(t => ({
            at: t.at, source: t.source, mode: t.mode, interrupted: !!t.interrupted,
            muted: !!t.muted, coldStart: !!t.coldStart, text: t.text, ...t.metrics
        }));
        const answered = turns.filter(t => t.source === 'speech' || t.source === 'ask-ai' || t.source === 'one-shot');
        return {
            characterId: Number(characterId),
            count: turns.length,
            summary: {
                speechEndToPlaybackMs: percentiles(answered.map(t => t.speechEndToPlaybackMs)),
                transcriptToFirstAudioMs: percentiles(answered.map(t => t.transcriptToFirstAudioMs)),
                firstAudioToPlaybackMs: percentiles(turns.map(t => t.firstAudioToPlaybackMs)),
                interrupted: turns.filter(t => t.interrupted).length
            },
            turns
        };
    }

    /**
     * Stop WebSocket server
     */
    /**
     * Start continuous audio playback from buffer
     * Streams buffered chunks as a continuous MP3 stream to avoid gaps
     */
    async _startAudioPlayback(sessionId) {
        const c = this.activeConnections.get(sessionId);
        if (!c || c.audioPlaying) return;

        c.audioPlaying = true;
        let finished;
        c._playbackDone = new Promise(r => { finished = r; });
        console.log(`🔊 Starting audio playback for session ${sessionId}, character ${c.characterId}`);

        // Light the eyes from the agent audio for any character with an LED ring
        // (no-op otherwise). Works alongside — or instead of — the jaw.
        c._ledSpeak = null;
        try {
            const ledAnim = (await import('./ledAnimationService.js')).default;
            const ledSpeak = (await import('./ledSpeakingSync.js')).default;
            const sync = await ledAnim.resolveLedSync(c.characterId);
            if (sync.partId != null && sync.enabled && await ledSpeak.begin(c.characterId, { ...sync })) {
                c._ledSpeak = ledSpeak;
            }
        } catch (_) { c._ledSpeak = null; }

        try {
            // Resolve the speaker once for this socket: no disk reads per chunk.
            await this._ensureSpeakerDevice(c);
            while ((Array.isArray(c.audioBuffer) && c.audioBuffer.length > 0) || c.isActive) {
                if (!c.audioBuffer || c.audioBuffer.length === 0) {
                    await new Promise(resolve => setTimeout(resolve, 20));
                    continue;
                }

                // Take everything queued (bounded) in arrival order. No priming
                // wait: the player buffers, and the agent streams faster than
                // real time, so waiting for N chunks only delayed first sound
                // (and a reply shorter than N chunks waited for the socket to close).
                const chunksToPlay = c.audioBuffer.splice(0, 12);
                // Decode each base64 chunk separately then concatenate raw buffers.
                // Joining base64 strings corrupts data (padding '=' in the middle).
                const audioBuffer = Buffer.concat(chunksToPlay.map(chunk => Buffer.from(chunk, 'base64')));

                const fmt = c.audioOutputFormat || 'pcm_16000';
                let result;
                if (fmt.startsWith('pcm_')) {
                    const sampleRate = parseInt(fmt.split('_')[1]) || 16000;
                    let sum = 0;
                    const samples = audioBuffer.length >> 1;
                    for (let k = 0; k < samples; k++) { const smp = audioBuffer.readInt16LE(k * 2); sum += smp * smp; }
                    const rms = samples > 0 ? Math.sqrt(sum / samples) / 32768 : 0;
                    // Feed the eyes an amplitude for this PCM aggregate; the LED's
                    // own envelope (sensitivity/smoothing/attack/release) shapes it.
                    if (c._ledSpeak) c._ledSpeak.noteLevel(c.characterId, Math.min(1, rms * 4));
                    result = await serverPlaybackService.writePcmStream(audioBuffer, {
                        characterId: c.characterId,
                        owner: sessionId,
                        deviceId: c._speakerDeviceId,
                        volume: 100,
                        sampleRate,
                        kind: 'ai'
                    });
                    // The jaw used to stay shut through every one-shot line
                    // (callouts, scene askAI); drive it like the live path does.
                    try { this._jaw.driveJawFromPcmStream(c.characterId, audioBuffer, sampleRate).catch(() => {}); } catch (_) { /* non-fatal */ }
                    const durationMs = (audioBuffer.length / (sampleRate * 2)) * 1000;
                    const startMs = (result && Number.isFinite(result.startsAtMs)) ? result.startsAtMs : Date.now();
                    const endMs = (result && Number.isFinite(result.playsUntilMs)) ? result.playsUntilMs : startMs + durationMs;
                    this._notePlayback(c.characterId, startMs, endMs, rms);
                    c.playbackEndsAtMs = Math.max(c.playbackEndsAtMs || 0, endMs);
                    // Character-wide: this audio comes out of the shared speaker.
                    this._suppressMicUntil(c.characterId, endMs + HALF_DUPLEX_TAIL_MS);
                    const t = c._turn;
                    if (t) {
                        if (!t.playbackStartAtMs) {
                            t.playbackStartAtMs = startMs;
                            if (result && result.coldStart) t.coldStart = true;
                        }
                        if (result && result.muted) t.muted = true;
                        t.playbackEndAtMs = Math.max(t.playbackEndAtMs || 0, endMs);
                    }
                } else {
                    result = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
                        characterId: c.characterId,
                        contentType: 'audio/mpeg',
                        volume: 100
                    });
                    this._suppressMicUntil(c.characterId, Date.now() + 3000);
                }
                if (result && !result.success) {
                    console.error(`❌ Audio playback failed: ${result.error}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error in audio playback loop:`, error.message);
        } finally {
            c.audioPlaying = false;
            console.log(`🔇 Audio playback loop finished for session ${sessionId}`);
            // Settle the eyes back to their resting state.
            try { if (c._ledSpeak) c._ledSpeak.end(c.characterId).catch(() => {}); } catch (_) {}
            c._ledSpeak = null;
            finished();
        }
    }

    /**
     * Suppress mic input for all active sessions of a character (echo suppression).
     * @param {number} characterId - Character ID to suppress
     * @param {number} durationMs - Duration in milliseconds
     */
    suppressMicForCharacter(characterId, durationMs) {
        this._suppressMicUntil(characterId, Date.now() + durationMs);
    }

    /**
     * Hold the mic closed on every session belonging to a character until an
     * absolute deadline. One character has one speaker and one microphone, so
     * echo suppression has to be character-wide: a per-session deadline leaves
     * any other session's mic loop streaming the character's own voice back to
     * the agent as if the guest had spoken.
     *
     * The deadline only ever moves later, never earlier, so a new utterance
     * starting while the previous one is still draining out of the speaker
     * cannot shorten the window.
     */
    _suppressMicUntil(characterId, untilMs) {
        if (!Number.isFinite(untilMs)) return;
        for (const [, connection] of this.activeConnections) {
            if (characterId == null || Number(connection.characterId) === Number(characterId)) {
                connection.suppressMicUntilMs = Math.max(connection.suppressMicUntilMs || 0, untilMs);
            }
        }
    }

    /**
     * Lift echo suppression NOW, character-wide.
     *
     * _suppressMicUntil deliberately only ever moves the deadline later, so it
     * cannot reopen the microphone. Barge-in is the one case that must: the
     * character has been cut off, so there is no longer any speech of its own to
     * keep out, and the guest is mid-sentence and needs to be heard.
     */
    _clearMicSuppression(characterId) {
        for (const [, connection] of this.activeConnections) {
            if (characterId == null || Number(connection.characterId) === Number(characterId)) {
                connection.suppressMicUntilMs = 0;
                connection.aiSpeaking = false;
                connection.speechStartedAt = 0;
                connection.accumulatedAudioMs = 0;
                connection.playbackEndsAtMs = 0;
                connection._bargeInFrames = 0;
                connection._echoFloor = null;
            }
        }
    }

    /**
     * Cut the character off mid-sentence and hand the turn back to the guest.
     *
     * Called both by the local detector in the mic loop (the only thing that can
     * notice a guest talking over a character whose mic feed is suppressed) and
     * by the agent's own 'interruption' event. Character-independent: everything
     * keys off connection.characterId.
     *
     * Order matters. The discard window is set FIRST, because ElevenLabs audio
     * chunks are still arriving and the PCM writer would otherwise respawn the
     * player we are about to kill — the cut would visibly un-cut itself.
     */
    _bargeIn(sessionId, reason = 'guest', opts = {}) {
        const connection = this.activeConnections.get(sessionId);
        const characterId = connection ? connection.characterId : null;
        // 'session'   : the agent's interruption, only this session's player.
        // 'character' : a local barge-in or an operator stop, every
        //               conversation player of this character (never the node).
        const scope = opts.scope || 'character';
        const targets = [];
        for (const [sid, c] of this.activeConnections) {
            if (scope === 'session' ? sid === sessionId
                : (characterId != null && Number(c.characterId) === Number(characterId)) || sid === sessionId) {
                targets.push([sid, c]);
            }
        }

        // 1. Refuse the rest of the cut response. With an event id (the agent's
        //    interruption) that is exact and lasts however late chunks arrive;
        //    without one, refuse everything up to the response being played,
        //    plus a short time window as a safety net.
        for (const [, c] of targets) {
            c.audioBuffer = [];
            if (!opts.hasEventId) {
                if (c._currentAudioEventId != null && Number.isFinite(Number(c._currentAudioEventId))) {
                    c._resumeFromEventId = Math.max(Number(c._resumeFromEventId) || 0, Number(c._currentAudioEventId) + 1);
                }
                c.discardAgentAudioUntilMs = Date.now() + 1200;
            }
            if (c._turn) {
                // Report what actually played, not the planned length.
                const nowCut = Date.now();
                c._turn.interrupted = true;
                c._turn.interruptedAt = nowCut;
                if (c._turn.playbackEndAtMs) c._turn.playbackEndAtMs = Math.min(c._turn.playbackEndAtMs, nowCut);
            }
            if (c._askOneShot) c._askOneShot.interrupted = true;
        }

        // 2. Stop the audio NOW (no drain). Owner-scoped: background music, a
        //    scene line or another character's session keep playing.
        try {
            if (characterId != null) {
                if (scope === 'session') serverPlaybackService.interruptPlayback({ characterId, owner: sessionId });
                else serverPlaybackService.stopStream({ characterId });
            } else {
                serverPlaybackService.stopAll();
            }
        } catch (_) { /* best-effort */ }
        if (characterId != null) this._clearPlaybackEnvelope(characterId);

        // 3. Stop the body. Without this the jaw keeps flapping to a dead speaker
        //    and the eyes stay in the audio-reactive speaking crossfade.
        (async () => {
            try {
                const jaw = this._jaw;
                if (characterId != null) {
                    try { jaw.stopPcmJawStream(characterId); } catch (_) { /* noop */ }
                    try { jaw.cancelJawDrive(characterId); } catch (_) { /* noop */ }
                }
            } catch (_) { /* jaw optional */ }
            try {
                const led = await import('./ledInteractionService.js');
                if (characterId != null) {
                    // .default: this service has no named exports. Straight to
                    // 'listening' — the guest has the floor. No-op without an led_ring.
                    await led.default.setInteractionState(characterId, 'listening');
                }
            } catch (_) { /* LEDs optional */ }
        })();

        // 4. Reopen the microphone (half duplex) so the guest is heard from here.
        this._clearMicSuppression(characterId);

        console.log(`✋ Barge-in (${reason}, scope=${scope}): character ${characterId} cut off, mic reopened`);

        // 5. Existing client message type; both browser clients already handle it.
        for (const [sid] of targets) this.sendToClient(sid, { type: 'interruption', reason });
    }

    /**
     * Interrupt whatever a character is currently saying, from outside a session
     * (an operator button, a fleet-wide stop). No-op if it is not speaking.
     */
    bargeInForCharacter(characterId, reason = 'manual') {
        let hit = false;
        for (const [sessionId, c] of this.activeConnections) {
            if (Number(c.characterId) === Number(characterId)) {
                this._bargeIn(sessionId, reason, { scope: 'character' });
                hit = true;
                break; // _bargeIn already fans out across this character's sessions
            }
        }
        if (!hit && characterId != null) {
            // No live session, but audio may still be playing from /api/say or a scene.
            try { serverPlaybackService.stopForCharacter(characterId); } catch (_) { /* noop */ }
        }
        return { success: true, interrupted: hit };
    }

    async stopWebSocketServer() {
        // Clear session cleanup timer to prevent leaks
        if (this._cleanupTimer) {
            clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }

        if (this.wsServer) {
            // Close all active connections
            for (const [sessionId, connection] of this.activeConnections) {
                // Stop server mic loops
                try { this._stopServerMicLoop(sessionId, false); } catch (_) { /* noop */ }
                // Stop realtime STT sessions
                try { this._stopRealtimeSTTSession(sessionId); } catch (_) { /* noop */ }
                // Stop audio streams
                if (connection.characterId != null) {
                    try { serverPlaybackService.stopStream({ characterId: connection.characterId }); } catch (_) { /* noop */ }
                }
                if (connection.elevenLabsWs) {
                    try { connection.elevenLabsWs.close(); } catch (_) { /* noop */ }
                }
                if (connection.clientWs) {
                    try { connection.clientWs.close(); } catch (_) { /* noop */ }
                }
            }

            this.activeConnections.clear();

            // Close WSS server if attached
            if (this.wssServer) {
                try { this.wssServer.close(); } catch (_) { /* noop */ }
                this.wssServer = null;
            }

            return new Promise((resolve) => {
                this.wsServer.close(() => {
                    console.log('🛑 ElevenLabs Chat WebSocket server stopped');
                    resolve();
                });
            });
        }
    }

    /**
     * Find a live agent session for a character that a question can be asked on.
     * Prefers the headless session (the /conversation/api/ai-on toggle); falls back
     * to any active session — e.g. a browser client on the conversation page — that
     * already has an initiated agent socket.
     *
     * Returns a sessionId or null. Ephemeral ask-sockets are never returned: they
     * are one-shot and are torn down as soon as their own question resolves.
     */
    _findLiveAgentSession(characterId) {
        if (characterId == null) return null;
        const usable = (sid) => {
            const c = this.activeConnections.get(sid);
            return !!(c && c.isActive && c.conversationReady && !c.ephemeralAsk &&
                c.elevenLabsWs && c.elevenLabsWs.readyState === WebSocket.OPEN);
        };

        const headlessId = this.headlessSessions.get(String(characterId));
        if (headlessId && usable(headlessId)) return headlessId;

        for (const [sid, c] of this.activeConnections.entries()) {
            if (Number(c.characterId) === Number(characterId) && usable(sid)) return sid;
        }
        return null;
    }

    /**
     * Ask a question on an already-open agent session and await the reply.
     *
     * Why this exists: opening a socket per question cost a signed-URL fetch, a TLS
     * handshake, a conversation_initiation round trip AND the agent's entire spoken
     * first_message (~4-5s of greeting the guest has to sit through) before the
     * answer even started — and it threw away all conversation memory every turn.
     *
     * Questions are serialised per connection through _askChain so two concurrent
     * callers cannot interleave their replies onto each other's promise.
     *
     * @returns {Promise<{success:boolean, response:string, viaSession:string}>}
     * @throws {Error} with .beforeSend === true only if nothing was sent, so the
     *         caller may safely fall back without the agent hearing the question twice.
     */
    async _askOnLiveSession(sessionId, text, opts = {}) {
        const connection = this.activeConnections.get(sessionId);
        if (!connection) {
            const e = new Error('Session disappeared'); e.beforeSend = true; throw e;
        }

        const prior = connection._askChain || Promise.resolve();
        let release;
        connection._askChain = new Promise(r => { release = r; });
        try { await prior; } catch (_) { /* a previous question failing must not poison the queue */ }

        try {
            // Re-check after waiting our turn: the socket may have died in the queue.
            const c = this.activeConnections.get(sessionId);
            if (!c || !c.isActive || !c.conversationReady ||
                !c.elevenLabsWs || c.elevenLabsWs.readyState !== WebSocket.OPEN) {
                const e = new Error('Agent socket not open'); e.beforeSend = true; throw e;
            }

            const pending = {
                text,
                responseText: '',
                sawAudio: false,
                resolve: null,
                settleTimer: null,
                hardTimer: null,
                capTimer: null,
                waitForPlayback: opts.waitForPlayback !== false
            };
            const done = new Promise(res => { pending.resolve = res; });
            c._pendingAsk = pending;

            // Start the turn clock so the same latency table covers this path.
            // No guest speech is involved in a text question, so there is no
            // speech-end to measure from. Leaving _lastVoiceAtMs in here reported
            // whatever the mic last heard — usually the tail of the PREVIOUS reply —
            // as this turn's speech-end, inventing several seconds of latency that
            // never happened.
            this._startTurn(c, { source: 'ask-ai', speechEndMs: null, transcriptAtMs: Date.now(), text });

            try {
                c.elevenLabsWs.send(JSON.stringify({ type: 'user_message', text }));
            } catch (err) {
                c._pendingAsk = null;
                const e = new Error(`Send failed: ${err.message}`); e.beforeSend = true; throw e;
            }

            // The turn-detection model commits a turn on an audio edge, not on the
            // text frame. With the server mic loop running one arrives on its own;
            // when the mic is suppressed or idle, nothing would ever close the turn
            // and the agent stays silent forever (measured: no reply after 70s).
            // A short frame of room-floor audio gives it the edge it needs.
            setTimeout(() => {
                try {
                    const still = this.activeConnections.get(sessionId);
                    if (still && still._pendingAsk === pending &&
                        still.elevenLabsWs && still.elevenLabsWs.readyState === WebSocket.OPEN) {
                        still.elevenLabsWs.send(JSON.stringify({ user_audio_chunk: TURN_COMMIT_FRAME_B64 }));
                    }
                } catch (_) { /* non-fatal */ }
            }, 150);

            // Ceiling for an agent that never answers, so an HTTP caller can
            // never hang. Once the reply has started, the settle path answers
            // after it has played instead: cutting the wait mid-line would let
            // a scene's next step overlap it.
            pending.hardTimer = setTimeout(() => {
                const still = this.activeConnections.get(sessionId);
                if (pending.sawAudio && still && still._pendingAsk === pending) return;
                if (still && still._pendingAsk === pending) still._pendingAsk = null;
                pending.resolve({
                    success: true,
                    response: pending.responseText || 'Response received',
                    viaSession: sessionId,
                    timedOut: true
                });
            }, ASK_REPLY_TIMEOUT_MS);
            // Absolute bound, whatever the agent does.
            pending.capTimer = setTimeout(() => {
                const still = this.activeConnections.get(sessionId);
                if (still && still._pendingAsk === pending) still._pendingAsk = null;
                pending.resolve({
                    success: true,
                    response: pending.responseText || 'Response received',
                    viaSession: sessionId,
                    timedOut: true
                });
            }, ASK_REPLY_TIMEOUT_MS + ASK_PLAYOUT_CAP_MS);

            const result = await done;
            clearTimeout(pending.hardTimer);
            clearTimeout(pending.settleTimer);
            clearTimeout(pending.capTimer);
            return result;
        } finally {
            release();
        }
    }

    /**
     * Send a text question to an agent and play the response through character speaker.
     *
     * Uses the character's live agent session when one exists (fast: no handshake,
     * no repeated greeting, conversation memory preserved across turns) and only
     * opens a throwaway socket when nothing is running.
     *
     * Contract (the scene executor's askAI step depends on both):
     * - resolves only AFTER the reply audio has finished playing, on both paths,
     *   so the next scene step never overlaps the line (live path: pass
     *   `{ waitForPlayback: false }` to get the text as soon as it is complete);
     * - `viaSession` is set only on the live path, whose handler already wrote the
     *   line to the speech log; the one-shot path logs nothing (callers log).
     *
     * @param {string} agentId - ElevenLabs agent ID
     * @param {string} text - Question text
     * @param {number} characterId - Character ID for audio playback
     * @param {{waitForPlayback?: boolean}} [opts]
     * @returns {Promise<{success: boolean, response: string, viaSession?: string}>}
     */
    async askAgentQuestion(agentId, text, characterId, opts = {}) {
        const liveSession = this._findLiveAgentSession(characterId);
        if (liveSession) {
            try {
                const r = await this._askOnLiveSession(liveSession, text, opts);
                console.log(`⚡ Answered on live session ${liveSession} (no new socket)`);
                return r;
            } catch (e) {
                if (!e || !e.beforeSend) {
                    // The agent already has the question; asking again on a new socket
                    // would make the character answer twice.
                    throw e;
                }
                console.warn(`⚠️ Live session ${liveSession} unusable (${e.message}) — opening a one-shot socket`);
            }
        }
        return this._askAgentQuestionEphemeral(agentId, text, characterId);
    }

    /**
     * Fallback path: open a dedicated socket for one question. Only used when the
     * character has no live agent session (callouts, scene askAI, ask-ai while
     * AI mode is off).
     *
     * Asks for an empty first_message so the agent does not generate (and
     * stream, and bill) a walk-up greeting that would only be thrown away; an
     * agent that refuses the override is remembered and asked again without
     * it, with the greeting filtered by turn. Ends when the ANSWER has finished
     * playing, not on a 30 s timer.
     */
    async _askAgentQuestionEphemeral(agentId, text, characterId) {
        const t0 = Date.now();
        let emptyFirst = !this._firstMessageRefusedRecently(agentId);
        for (let attempt = 0; attempt < 2; attempt++) {
            const outcome = await this._askOneShotOnce(agentId, text, characterId, { emptyFirst, t0 });
            if (outcome.refusedOverride && emptyFirst) {
                this._firstMessageRefusedAt.set(String(agentId), Date.now());
                console.warn(`⚠️ Agent ${agentId} refused the empty first_message override: asking again with the greeting filtered`);
                emptyFirst = false;
                continue;
            }
            return outcome.result;
        }
        return { success: false, response: '', error: 'override refused twice' };
    }

    _askOneShotOnce(agentId, text, characterId, { emptyFirst, t0 }) {
        return new Promise(async (resolve, reject) => {
            let sessionId = null;
            let connection = null;
            let settled = false;
            let responseText = '';           // every agent text fragment
            let repliedText = '';            // text from turns that answer US
            const stagedAudio = new Map();   // event_id -> [base64 chunk]
            const eventVerdict = new Map();  // event_id -> 'greeting' | 'answer'
            const answerEvents = new Set();
            let answerAudioSeen = false;
            let answerComplete = false;
            let settleTimer = null, noAnswerTimer = null, ceilingTimer = null;
            let finishing = false;

            const clearTimers = () => {
                clearTimeout(settleTimer); clearTimeout(noAnswerTimer); clearTimeout(ceilingTimer);
            };
            const done = (value, isError) => {
                if (settled) return;
                settled = true;
                clearTimers();
                if (sessionId) this.activeConnections.delete(sessionId);
                if (isError) reject(value); else resolve(value);
            };
            const queueAnswerAudio = (b64) => {
                if (!connection._turn.firstAudioAtMs) connection._turn.firstAudioAtMs = Date.now();
                connection.audioBuffer.push(b64);
                answerAudioSeen = true;
            };
            const releaseStaged = (eid) => {
                const chunks = stagedAudio.get(eid);
                stagedAudio.delete(eid);
                if (chunks) for (const b64 of chunks) queueAnswerAudio(b64);
            };
            const armSettle = () => {
                clearTimeout(settleTimer);
                if (!answerAudioSeen) return;
                settleTimer = setTimeout(() => finish('reply complete (quiet)'), answerComplete ? 150 : ONE_SHOT_SETTLE_MS);
            };

            // The answer is in: close the socket, let the player finish what it
            // holds, then answer the caller. Never cuts the reply.
            const finish = async (why) => {
                if (finishing || settled) return;
                finishing = true;
                clearTimeout(settleTimer); clearTimeout(noAnswerTimer);
                // Anything never classified still gets played rather than swallowed.
                for (const eid of [...stagedAudio.keys()]) releaseStaged(eid);
                const ws = connection.elevenLabsWs;
                connection._closingByUs = true;
                try { if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close(); } catch (_) { /* noop */ }
                connection.isActive = false;
                try { if (connection._playbackDone) await connection._playbackDone; } catch (_) { /* noop */ }
                // Wait for the speaker to actually go quiet.
                const ceilingAt = t0 + ONE_SHOT_CEILING_MS;
                while (!settled) {
                    const horizon = serverPlaybackService.getPlaybackHorizon({ characterId, owner: sessionId });
                    if (horizon <= Date.now() || Date.now() >= ceilingAt) break;
                    await new Promise(r => setTimeout(r, Math.min(200, Math.max(20, horizon - Date.now()))));
                }
                try {
                    await serverPlaybackService.stopPcmStream({ characterId, owner: sessionId, drain: true });
                } catch (err) {
                    console.warn(`⚠️  could not drain PCM stream for character ${characterId}: ${err.message}`);
                }
                try { this._jaw.driveJawFromAmplitude(characterId, 0).catch(() => {}); } catch (_) { /* noop */ }
                if (connection._turn) {
                    connection._turn.source = 'one-shot';
                    this._finalizeTurn(connection, why);
                }
                const finalText = repliedText || responseText;
                console.log(`📝 One-shot reply finished (${why}) in ${Date.now() - t0}ms: "${String(finalText || '').slice(0, 100)}"`);
                done({ success: true, response: finalText || 'Response received', oneShot: true, elapsedMs: Date.now() - t0, endedBy: why });
            };

            try {
                sessionId = this.generateSessionId();
                connection = {
                    sessionId,
                    clientWs: null,
                    elevenLabsWs: null,
                    agentId,
                    isActive: true,
                    startTime: new Date(),
                    characterId,
                    outputMode: 'server',
                    micSource: 'server',
                    audioBuffer: [],
                    audioPlaying: false,
                    suppressMicUntilMs: 0,
                    playbackEndsAtMs: 0,
                    // Marks this as a one-shot socket so _findLiveAgentSession
                    // never routes a later question onto it, and so body-state
                    // updates are never sent to it.
                    ephemeralAsk: true
                };
                connection._askOneShot = { interrupted: false };
                this.activeConnections.set(sessionId, connection);
                this._startTurn(connection, { source: 'one-shot', transcriptAtMs: null, text });

                const elevenLabsWs = await this._connectAgent(agentId);
                connection.elevenLabsWs = elevenLabsWs;

                elevenLabsWs.on('open', () => {
                    console.log(`🎯 Connected to agent ${agentId} for question (${emptyFirst ? 'no greeting' : 'greeting filtered'}, ${Date.now() - t0}ms)`);
                    elevenLabsWs.send(JSON.stringify({
                        type: 'conversation_initiation_client_data',
                        conversation_config_override: emptyFirst ? { agent: { first_message: '' } } : {}
                    }));
                    this._startAudioPlayback(sessionId);
                });

                elevenLabsWs.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        if (WS_DEBUG && message.type !== 'ping' && message.type !== 'audio') {
                            console.log(`🔍 WebSocket message type: ${message.type}`, JSON.stringify(message).substring(0, 200));
                        }
                        if (message.type === 'conversation_initiation_metadata') {
                            connection.audioOutputFormat = (message.conversation_initiation_metadata_event || {}).agent_output_audio_format || 'pcm_16000';
                            elevenLabsWs.send(JSON.stringify({ type: 'user_message', text }));
                            connection._turn.transcriptAtMs = Date.now();
                        } else if (message.type === 'audio' && message.audio_event) {
                            if (finishing) return;
                            const b64 = message.audio_event.audio_base_64;
                            if (b64) {
                                const eid = message.audio_event.event_id;
                                const verdict = eventVerdict.get(eid);
                                if (verdict === 'answer') {
                                    queueAnswerAudio(b64);
                                    this._emitActivity(connection, 'agent_speech', { prompted: true });
                                    armSettle();
                                } else if (verdict === 'greeting') {
                                    // the walk-up greeting, not the answer
                                } else {
                                    if (!stagedAudio.has(eid)) stagedAudio.set(eid, []);
                                    stagedAudio.get(eid).push(b64);
                                }
                            }
                        } else if (message.type === 'agent_response') {
                            const evt = message.agent_response_event;
                            const fragment = (evt && evt.agent_response) || message.agent_response || message.text || '';
                            const isAnswer = isAnswerTurn(evt);
                            if (evt && evt.event_id !== undefined) {
                                eventVerdict.set(evt.event_id, isAnswer ? 'answer' : 'greeting');
                                if (isAnswer) { answerEvents.add(evt.event_id); releaseStaged(evt.event_id); armSettle(); }
                                else stagedAudio.delete(evt.event_id);
                            }
                            if (fragment) {
                                if (!connection._turn.responseAtMs) connection._turn.responseAtMs = Date.now();
                                responseText = responseText ? `${responseText} ${fragment}` : fragment;
                                if (isAnswer) {
                                    // Not logged here: one-shot callers log the line
                                    // themselves (callouts as 'callout', the scene
                                    // askAI step when viaSession is absent).
                                    repliedText = repliedText ? `${repliedText} ${fragment}` : fragment;
                                } else {
                                    console.log(`🔇 Suppressed agent greeting (unprompted turn): "${String(fragment).substring(0, 60)}..."`);
                                }
                            }
                        } else if (message.type === 'agent_response_complete') {
                            const eid = message.agent_response_complete_event && message.agent_response_complete_event.event_id;
                            if (eid === undefined || answerEvents.has(eid)) { answerComplete = true; armSettle(); }
                        } else if (message.type === 'ping' && message.ping_event) {
                            elevenLabsWs.send(JSON.stringify({ type: 'pong', event_id: message.ping_event.event_id }));
                        }
                    } catch (err) {
                        console.error('❌ Message parse error:', err);
                    }
                });

                elevenLabsWs.on('close', (code, reason) => {
                    const reasonText = String(reason || '');
                    if (!connection._closingByUs) {
                        console.log(`🔌 One-shot agent connection closed by server (code=${code}${reasonText ? `, "${reasonText}"` : ''})`);
                    }
                    if (!finishing && !answerAudioSeen && isFirstMessageOverrideRefusal(code, reasonText)) {
                        connection.isActive = false;
                        done({ refusedOverride: true });
                        return;
                    }
                    if (!finishing) finish(`socket closed (code=${code})`);
                });

                elevenLabsWs.on('error', (error) => {
                    console.error('❌ Agent WebSocket error:', error && error.message ? error.message : error);
                    if (!finishing && !answerAudioSeen) {
                        connection.isActive = false;
                        done(error, true);
                    }
                });

                // No answer audio at all by now: give up (never cuts a reply).
                noAnswerTimer = setTimeout(() => {
                    if (answerAudioSeen || finishing) return;
                    if (elevenLabsWs.readyState === WebSocket.OPEN || elevenLabsWs.readyState === WebSocket.CONNECTING) {
                        if (elevenLabsWs.readyState === WebSocket.CONNECTING) { try { elevenLabsWs.terminate(); } catch (_) { /* noop */ } }
                    }
                    finish('no answer audio within 30s');
                }, ONE_SHOT_NO_ANSWER_MS);
                // Absolute ceiling, including play-out.
                ceilingTimer = setTimeout(async () => {
                    if (settled) return;
                    console.warn(`⚠️ One-shot ask hit the ${ONE_SHOT_CEILING_MS}ms ceiling: stopping`);
                    try { await serverPlaybackService.stopPcmStream({ characterId, owner: sessionId }); } catch (_) { /* noop */ }
                    connection.isActive = false;
                    done({ success: true, response: repliedText || responseText || 'Response received', oneShot: true, endedBy: 'ceiling' });
                }, ONE_SHOT_CEILING_MS + 2000);

            } catch (error) {
                done(error, true);
            }
        }).then((v) => (v && v.refusedOverride) ? v : { result: v });
    }
}

export default new ElevenLabsWebSocketService();
