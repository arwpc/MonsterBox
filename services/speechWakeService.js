/**
 * Speech wake — a guest SPEAKING to a lurking character wakes it, the way the
 * PIR does when one walks past.
 *
 * Operator 2026-10-26: "make sure that both SPEECH from a microphone and PIR
 * Motion sensors can both trigger wake up of AI - when someone speaks these
 * animatronics should answer." Until now only the PIR, a schedule or the AI
 * button could wake a node, and three of the six animatronics have no working
 * PIR (PumpkinHead's is dead, Sir Dragomir's has never fired, Groundbreaker has
 * none), so a guest talking to them got silence all night.
 *
 * Why two stages. The ElevenLabs cost policy forbids an always-on agent or STT
 * stream while lurking, so the listening is LOCAL: one capture process, frame
 * energy against an adaptive noise floor, nothing billed. But energy alone
 * cannot tell a guest from the yard: measured 2026-10-26, guest speech on
 * Mina's array reads 0.02-0.12 RMS and her ambient (the neighbours' lurk lines,
 * music, wind) reaches 0.04 at p90 with peaks of 0.13. A pure energy trigger
 * would have the animatronics waking each other all night, and every false
 * wake is a billed agent session. So a local candidate is confirmed by ONE
 * short batch Scribe call (a few seconds of audio, rate-capped) before the
 * node wakes, and the words the guest said are handed to the agent so the
 * character answers THEM instead of reciting its walk-up greeting.
 *
 * The lurk machine (services/lurkStateService.js) owns every decision: when the
 * listener runs (lurking only; it yields the microphone to any conversation),
 * whether a candidate may wake the node (quiet hours, fleet-event holds,
 * cooldowns), and the confirmation budget. This module only listens.
 */

export const SAMPLE_RATE = 16000;
export const FRAME_MS = 100;
const FRAME_BYTES = SAMPLE_RATE * 2 * FRAME_MS / 1000;   // PCM16LE mono

// Detector defaults. A frame is voiced at max(minRms, floor x ratio). Quiet-yard
// floors measured 2026-10-26 at 100 ms ran from 0.002 (Renfield) to 0.027 (Sir
// Dragomir): the ratio keeps a noisy node from triggering on its own background,
// and the minimum keeps a silent one from triggering on a far-off murmur.
export const DEFAULT_MIN_RMS = 0.02;
export const MIN_MIN_RMS = 0.005;
export const MAX_MIN_RMS = 0.5;
export const FLOOR_RATIO = 2.5;
const FLOOR_FAST = 0.05;          // quiet frames: the floor follows the room in ~2 s
const FLOOR_SLOW = 0.002;         // loud frames: a sustained noise is absorbed in ~50 s
const FLOOR_MIN = 0.001;
const PREROLL_FRAMES = 3;         // the start of the first word sits under the threshold
const END_SILENCE_MS = 600;       // a pause this long ends the utterance
const MAX_UTTERANCE_MS = 5000;    // enough for "hello, is anyone in there?"
const MIN_VOICED_MS = 400;        // a cough, a clap or a car door is shorter
const LEARN_MS = 3000;            // the floor is learned before anything can trigger

/**
 * Frame-by-frame utterance detector over RMS values. Pure: no audio, no
 * clocks of its own, so the unit tests drive it frame by frame.
 *
 * push(rms, { suppressed, pcm }) returns null, or a candidate when an
 * utterance ends: { durationMs, voicedMs, peakRms, floor, threshold, pcm }.
 * A suppressed frame (this character's own speaker is playing) discards any
 * utterance in progress and teaches the floor nothing.
 */
export function createSpeechGate(opts = {}) {
    const minRms = Number.isFinite(opts.minRms) && opts.minRms > 0 ? opts.minRms : DEFAULT_MIN_RMS;
    const ratio = Number.isFinite(opts.ratio) && opts.ratio > 1 ? opts.ratio : FLOOR_RATIO;
    const learnFrames = Math.ceil((opts.learnMs != null ? opts.learnMs : LEARN_MS) / FRAME_MS);
    let floor = null;
    let frames = 0;
    let preroll = [];
    let utter = null;          // { frames: [], voiced, silenceMs, peak }

    const threshold = () => Math.max(minRms, (floor || 0) * ratio);

    function finish() {
        const u = utter;
        utter = null;
        if (!u) return null;
        // Trailing silence is not part of what was said.
        const keep = Math.max(1, u.frames.length - Math.round(u.silenceMs / FRAME_MS));
        const kept = u.frames.slice(0, keep);
        const voicedMs = u.voiced * FRAME_MS;
        if (voicedMs < MIN_VOICED_MS) return null;
        const pcmParts = kept.map(f => f.pcm).filter(Boolean);
        return {
            durationMs: kept.length * FRAME_MS,
            voicedMs,
            peakRms: u.peak,
            floor: floor || 0,
            threshold: threshold(),
            pcm: pcmParts.length ? Buffer.concat(pcmParts) : null
        };
    }

    return {
        push(rms, { suppressed = false, pcm = null } = {}) {
            frames += 1;
            const level = Number.isFinite(rms) && rms > 0 ? rms : 0;
            if (suppressed) { utter = null; preroll = []; return null; }
            if (floor == null) floor = Math.max(FLOOR_MIN, level);
            const thr = threshold();
            const voiced = level >= thr;
            floor = Math.max(FLOOR_MIN, floor + (level - floor) * (voiced ? FLOOR_SLOW : FLOOR_FAST));
            const frame = { rms: level, pcm };
            if (frames <= learnFrames) { preroll = [...preroll, frame].slice(-PREROLL_FRAMES); return null; }
            if (!utter) {
                if (!voiced) { preroll = [...preroll, frame].slice(-PREROLL_FRAMES); return null; }
                utter = { frames: [...preroll, frame], voiced: 1, silenceMs: 0, peak: level };
                preroll = [];
                return null;
            }
            utter.frames.push(frame);
            if (voiced) { utter.voiced += 1; utter.silenceMs = 0; utter.peak = Math.max(utter.peak, level); } else utter.silenceMs += FRAME_MS;
            if (utter.silenceMs >= END_SILENCE_MS || utter.frames.length * FRAME_MS >= MAX_UTTERANCE_MS) return finish();
            return null;
        },
        status() {
            return { floor: floor == null ? null : Number(floor.toFixed(4)), threshold: Number(threshold().toFixed(4)), learning: frames <= learnFrames, collecting: !!utter };
        }
    };
}

/** RMS of a PCM16LE buffer, 0..1. */
export function pcmRms(buf) {
    if (!buf || buf.length < 2) return 0;
    const n = Math.floor(buf.length / 2);
    let sum = 0;
    for (let i = 0; i < n; i++) { const s = buf.readInt16LE(i * 2) / 32768; sum += s * s; }
    const rms = Math.sqrt(sum / n);
    return Number.isFinite(rms) ? rms : 0;
}

/** Minimal mono PCM16LE WAV wrapper for the Scribe confirmation. */
export function pcmToWav(pcm, sampleRate = SAMPLE_RATE) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

const words = (text) => String(text || '').toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];

/**
 * Is this transcript the character's own recent line coming back through its
 * microphone? Word overlap against what it said in the last few seconds.
 */
export function isOwnEcho(text, recentLines = []) {
    const heard = words(text);
    if (heard.length === 0) return false;
    for (const line of recentLines) {
        const said = new Set(words(line));
        if (said.size === 0) continue;
        const hits = heard.filter(w => said.has(w)).length;
        if (hits / heard.length >= 0.6) return true;
    }
    return false;
}

/**
 * The listener: one capture process while wanted and no conversation holds the
 * microphone. Every utterance candidate goes to onCandidate; the lurk machine
 * decides what it is worth.
 */
export class SpeechWakeListener {
    constructor(capture = null) {
        this.capture = capture;       // serverSTTListener, loaded on first start()
        this.wanted = null;           // { characterId, deviceId, minRms, onCandidate, isSuppressed }
        this.handle = null;
        this.gate = null;
        this.pending = Buffer.alloc(0);
        this.conversationHolders = new Map();   // characterId(String) -> count
        this.startedAt = null;
        this.frames = 0;
        this.candidates = 0;
        this.lastError = null;
    }

    /** Listen for this character until stop(). Re-calling with new options restarts. */
    async start(characterId, opts = {}) {
        if (!this.capture) this.capture = (await import('./serverSTTListener.js')).default;
        this.wanted = {
            characterId: Number(characterId),
            deviceId: opts.deviceId || 'default',
            minRms: opts.minRms,
            onCandidate: typeof opts.onCandidate === 'function' ? opts.onCandidate : () => {},
            isSuppressed: typeof opts.isSuppressed === 'function' ? opts.isSuppressed : () => false
        };
        this._close();
        this._reconcile();
        return this.status();
    }

    /** Stop listening and release the microphone (waits briefly for the recorder to exit). */
    async stop() {
        this.wanted = null;
        await this._close({ wait: true });
        return this.status();
    }

    /** Release the microphone without forgetting what is wanted (a wake is starting the agent). */
    async yieldMic() {
        await this._close({ wait: true });
    }

    /** A conversation session opened this character's microphone: get out of its way. */
    onConversationMicStart(characterId) {
        const key = String(characterId);
        this.conversationHolders.set(key, (this.conversationHolders.get(key) || 0) + 1);
        this._reconcile();
    }

    onConversationMicStop(characterId) {
        const key = String(characterId);
        this.conversationHolders.set(key, Math.max(0, (this.conversationHolders.get(key) || 0) - 1));
        this._reconcile();
    }

    status() {
        const w = this.wanted;
        return {
            wanted: !!w,
            characterId: w ? w.characterId : null,
            listening: !!this.handle,
            yieldedToConversation: !!(w && (this.conversationHolders.get(String(w.characterId)) || 0) > 0),
            deviceId: w ? w.deviceId : null,
            since: this.startedAt ? new Date(this.startedAt).toISOString() : null,
            frames: this.frames,
            candidates: this.candidates,
            gate: this.gate ? this.gate.status() : null,
            lastError: this.lastError
        };
    }

    _reconcile() {
        const w = this.wanted;
        const held = w && (this.conversationHolders.get(String(w.characterId)) || 0) > 0;
        if (!w || held) { this._close(); return; }
        if (this.handle || !this.capture) return;
        this.gate = createSpeechGate({ minRms: w.minRms });
        this.pending = Buffer.alloc(0);
        this.startedAt = Date.now();
        this.frames = 0;
        this.lastError = null;
        const wanted = w;
        this.handle = this.capture.startContinuousCapture(w.deviceId, (buf) => {
            if (this.wanted !== wanted || !this.handle) return;
            this.pending = this.pending.length ? Buffer.concat([this.pending, buf]) : buf;
            while (this.pending.length >= FRAME_BYTES) {
                const pcm = Buffer.from(this.pending.subarray(0, FRAME_BYTES));
                this.pending = this.pending.subarray(FRAME_BYTES);
                this._frame(wanted, pcm);
            }
        }, (err) => {
            this.lastError = err && err.message ? err.message : String(err);
            console.warn(`[SpeechWake] microphone capture failed for character ${wanted.characterId}: ${this.lastError}`);
        });
    }

    _frame(wanted, pcm) {
        this.frames += 1;
        let suppressed = false;
        try { suppressed = !!wanted.isSuppressed(); } catch (_) { /* listen */ }
        const cand = this.gate.push(pcmRms(pcm), { suppressed, pcm });
        if (!cand) return;
        this.candidates += 1;
        try { wanted.onCandidate(cand); } catch (e) { console.warn(`[SpeechWake] candidate handler failed: ${e.message}`); }
    }

    async _close({ wait = false } = {}) {
        const h = this.handle;
        this.handle = null;
        this.pending = Buffer.alloc(0);
        if (!h) return;
        const proc = h.proc;
        try { h.stop(); } catch (_) { /* gone */ }
        // The agent's recorder opens the same device next; give ours a moment to let go.
        if (wait && proc && proc.exitCode == null && proc.signalCode == null) {
            await new Promise(resolve => {
                const t = setTimeout(resolve, 1000);
                proc.once('close', () => { clearTimeout(t); resolve(); });
            });
        }
    }
}

const speechWakeListener = new SpeechWakeListener();
export default speechWakeListener;
