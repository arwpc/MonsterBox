/**
 * Mission D1 (2026-10 castle tuning): the pure decisions behind the
 * conversation client, duplex mode, echo-aware barge-in, interrupted-audio
 * filtering, reconnect backoff, noise transcripts and the per-turn latency line.
 *
 * All pure, so every threshold is provable without a socket, a microphone or a
 * node.
 */

import { expect } from 'chai';
import {
    detectDuplexMode,
    echoAwareBargeIn,
    isInterruptedAudio,
    isFirstMessageOverrideRefusal,
    reconnectDelayMs,
    isNoiseTranscript,
    percentiles,
    formatTurnLine,
    turnMetrics,
    HALF_DUPLEX_TAIL_MS
} from '../../services/elevenLabsWebSocketService.js';

// Shapes copied from real parts.json entries on the fleet (names neutralised:
// detection must key on the hardware, never on a character).
const XVF_MIC_UNOWNED = { id: '7', name: 'Microphone (ReSpeaker XVF3800)', type: 'microphone', characterId: null,
    config: { deviceId: 'alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_114993701262200027-00.analog-stereo' } };
const DEFAULT_SPK = { id: '6', name: 'Speaker (ReSpeaker XVF3800)', type: 'speaker', characterId: 42, config: { audioDeviceId: 'default' } };
const XVF_MIC_NAMED = { id: '5', name: 'ReSpeaker XVF3800 Mic Array', type: 'microphone', config: { deviceId: 'alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_114993701262200200-00.analog-stereo' } };
const XVF_SPK_BY_DEVICE = { id: '7', name: 'Mouth', type: 'speaker', config: { audioDeviceId: 'alsa_output.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_114993701262200206-00.analog-stereo' } };
const XVF_MIC_BY_DEVICE = { id: '8', name: 'Ears', type: 'microphone', config: { deviceId: 'alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_114993701262200206-00.analog-stereo' } };
const USB_ADAPTER_MIC = { id: '4', name: 'Microphone', type: 'microphone', config: { deviceId: 'alsa_input.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.mono-fallback' } };
const WEBCAM_MIC = { id: '9', name: 'Webcam microphone', type: 'microphone', config: { deviceId: 'alsa_input.usb-046d_HD_Pro_Webcam_C920-02.analog-stereo' } };

describe('Conversation D1: duplex mode detection', () => {
    it('XVF3800 mic (unowned part, characterId null) + speaker "default" → FULL', () => {
        const d = detectDuplexMode({ micPart: XVF_MIC_UNOWNED, speakerPart: DEFAULT_SPK });
        expect(d.mode).to.equal('full');
        expect(d.source).to.equal('detected');
    });

    it('array named in the part name → FULL', () => {
        expect(detectDuplexMode({ micPart: XVF_MIC_NAMED, speakerPart: { config: { audioDeviceId: 'default' } } }).mode).to.equal('full');
    });

    it('array detected from the device ids alone (generic part names) → FULL', () => {
        expect(detectDuplexMode({ micPart: XVF_MIC_BY_DEVICE, speakerPart: XVF_SPK_BY_DEVICE }).mode).to.equal('full');
    });

    it('a bare USB audio adapter and a webcam mic → HALF', () => {
        expect(detectDuplexMode({ micPart: USB_ADAPTER_MIC, speakerPart: null }).mode).to.equal('half');
        expect(detectDuplexMode({ micPart: WEBCAM_MIC, speakerPart: null }).mode).to.equal('half');
    });

    it('no microphone part → HALF', () => {
        expect(detectDuplexMode({}).mode).to.equal('half');
    });

    it('XVF3800 mic but a different explicit speaker → HALF (the array has no echo reference)', () => {
        const d = detectDuplexMode({ micPart: XVF_MIC_UNOWNED, speakerPart: { config: { audioDeviceId: 'alsa_output.usb-C-Media_Electronics_Inc._USB_Audio_Device-00.analog-stereo' } } });
        expect(d.mode).to.equal('half');
        expect(d.reason).to.match(/no echo reference/);
    });

    it('explicit override wins both ways (env value)', () => {
        expect(detectDuplexMode({ micPart: USB_ADAPTER_MIC, override: 'full' }).mode).to.equal('full');
        expect(detectDuplexMode({ micPart: XVF_MIC_UNOWNED, speakerPart: DEFAULT_SPK, override: 'half' })).to.include({ mode: 'half', source: 'override' });
    });

    it('override from the microphone part config', () => {
        const mic = { ...XVF_MIC_UNOWNED, config: { ...XVF_MIC_UNOWNED.config, duplex: 'half' } };
        expect(detectDuplexMode({ micPart: mic, speakerPart: DEFAULT_SPK })).to.include({ mode: 'half', source: 'override' });
    });

    it('an unrecognised override value falls through to detection', () => {
        expect(detectDuplexMode({ micPart: USB_ADAPTER_MIC, override: 'auto' }).mode).to.equal('half');
    });

    it('half-duplex tail is at most 400 ms', () => {
        expect(HALF_DUPLEX_TAIL_MS).to.be.at.most(400);
    });
});

describe('Conversation D1: echo-aware barge-in (half duplex)', () => {
    const START = 1_000_000;
    const LATE = START + 5000;

    // Run frames of [micRms, playbackRms]; returns { fired, state }.
    function run(frames, { now = LATE, state = { speechStartedAt: START } } = {}) {
        let s = { ...state };
        let fired = false;
        for (const [mic, play] of frames) {
            const v = echoAwareBargeIn(s, mic, play, now);
            s = { ...s, coupling: v.coupling, learnFrames: v.learnFrames, bargeInFrames: v.run };
            if (v.bargeIn) { fired = true; break; }
        }
        return { fired, state: s };
    }

    it('the character\'s own voice never interrupts it, even in its LOUD passages', () => {
        // Echo = 0.6 x playback. The old quietest-frame floor learned ~0.03 from
        // the soft frames, then 0.3 frames (2.2x margin = 0.066) "interrupted".
        const frames = [];
        for (let i = 0; i < 40; i++) {
            const play = (i % 5 === 0) ? 0.5 : 0.05; // loud syllables among soft ones
            frames.push([0.6 * play, play]);
        }
        expect(run(frames).fired).to.equal(false);
    });

    it('a guest clearly above the predicted echo interrupts after 3 frames', () => {
        const learn = [[0.03, 0.05], [0.03, 0.05], [0.03, 0.05], [0.03, 0.05]];
        const guest = [[0.4, 0.05], [0.4, 0.05], [0.4, 0.05]];
        expect(run([...learn, ...guest]).fired).to.equal(true);
    });

    it('two loud frames are not enough (door slam, laugh)', () => {
        const learn = [[0.03, 0.05], [0.03, 0.05], [0.03, 0.05], [0.03, 0.05]];
        expect(run([...learn, [0.4, 0.05], [0.4, 0.05], [0.03, 0.05], [0.4, 0.05]]).fired).to.equal(false);
    });

    it('never fires inside the grace window at the start of a reply', () => {
        const frames = [[0.03, 0.05], [0.03, 0.05], [0.03, 0.05], [0.03, 0.05], [0.5, 0.05], [0.5, 0.05], [0.5, 0.05], [0.5, 0.05]];
        expect(run(frames, { now: START + 100 }).fired).to.equal(false);
    });

    it('cannot fire before it has learned the coupling', () => {
        const v = echoAwareBargeIn({ speechStartedAt: START }, 0.9, 0.0, LATE);
        expect(v.bargeIn).to.equal(false);
        expect(v.run).to.equal(0);
    });

    it('a candidate interruption is not learned as echo', () => {
        const learned = run([[0.03, 0.05], [0.03, 0.05], [0.03, 0.05], [0.03, 0.05]]).state;
        const v = echoAwareBargeIn(learned, 0.4, 0.05, LATE);
        expect(v.coupling).to.be.closeTo(learned.coupling, 1e-9);
    });

    it('threshold follows the playback level (scales with what is being said)', () => {
        const learned = run([[0.06, 0.1], [0.06, 0.1], [0.06, 0.1], [0.06, 0.1]]).state;
        const quiet = echoAwareBargeIn(learned, 0, 0.05, LATE).threshold;
        const loud = echoAwareBargeIn(learned, 0, 0.5, LATE).threshold;
        expect(loud).to.be.greaterThan(quiet);
    });
});

describe('Conversation D1: interrupted audio, refusal, backoff, noise', () => {
    it('drops audio of the interrupted response (event id below the resume id)', () => {
        expect(isInterruptedAudio(5, 6)).to.equal(true);
        expect(isInterruptedAudio(6, 6)).to.equal(false);
        expect(isInterruptedAudio(7, 6)).to.equal(false);
    });

    it('drops nothing without an interruption or an event id', () => {
        expect(isInterruptedAudio(5, null)).to.equal(false);
        expect(isInterruptedAudio(undefined, 6)).to.equal(false);
    });

    it('recognises the live refusal of the empty first_message override', () => {
        // Exact close observed from a live fleet agent on 2026-10-09 22:2x.
        expect(isFirstMessageOverrideRefusal(1008, "Override for field 'first_message' is not allowed by config.")).to.equal(true);
        expect(isFirstMessageOverrideRefusal(1000, 'Max call duration exceeded')).to.equal(false);
        expect(isFirstMessageOverrideRefusal(1008, 'Policy violation')).to.equal(false);
    });

    it('reconnect backoff climbs and caps at 30 s', () => {
        expect([0, 1, 2, 3, 4, 5, 50].map(reconnectDelayMs)).to.deep.equal([1000, 2000, 5000, 10000, 30000, 30000, 30000]);
    });

    it('ASR noise is not guest speech', () => {
        expect(isNoiseTranscript('...')).to.equal(true);
        expect(isNoiseTranscript(' - ')).to.equal(true);
        expect(isNoiseTranscript('')).to.equal(true);
        expect(isNoiseTranscript('Yes.')).to.equal(false);
        expect(isNoiseTranscript('Who are you?')).to.equal(false);
    });
});

describe('Conversation D1: per-turn latency', () => {
    it('percentiles ignore missing values', () => {
        expect(percentiles([null, 100, 300, 200])).to.deep.equal({ n: 3, p50: 200, p90: 300 });
        expect(percentiles([])).to.deep.equal({ n: 0, p50: null, p90: null });
    });

    it('metrics and one compact log line', () => {
        const t = {
            characterId: 42, source: 'speech', mode: 'full',
            speechEndMs: 1000, transcriptAtMs: 1400, firstAudioAtMs: 2300,
            playbackStartAtMs: 2320, playbackEndAtMs: 6320, interrupted: true
        };
        expect(turnMetrics(t)).to.deep.equal({
            speechEndToTranscriptMs: 400, transcriptToFirstAudioMs: 900,
            firstAudioToPlaybackMs: 20, speechEndToPlaybackMs: 1320, replyMs: 4000
        });
        const line = formatTurnLine(t);
        expect(line).to.contain('[turn] char=42');
        expect(line).to.contain('TOTAL=1320ms');
        expect(line).to.contain('interrupted=yes');
        expect(line.split('\n')).to.have.length(1);
    });

    it('a text question (no speech end) is timed from the question', () => {
        const m = turnMetrics({ transcriptAtMs: 1000, firstAudioAtMs: 1800, playbackStartAtMs: 1810 });
        expect(m.speechEndToTranscriptMs).to.equal(null);
        expect(m.speechEndToPlaybackMs).to.equal(810);
    });
});
