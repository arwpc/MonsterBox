/**
 * Speech wake (services/speechWakeService.js + the lurk machine's speech path).
 * Operator 2026-10-26: a guest SPEAKING to a lurking character must wake it the
 * way the PIR does, and the character must answer what they said.
 *
 * The detector is driven frame by frame with synthetic RMS values; the machine
 * runs on injected fakes (no microphone, no Scribe, no sockets, no timers).
 */

import { expect } from 'chai';
import {
    createSpeechGate,
    isOwnEcho,
    pcmRms,
    pcmToWav,
    SpeechWakeListener,
    FRAME_MS,
    DEFAULT_MIN_RMS
} from '../../services/speechWakeService.js';
import {
    LurkStateMachine,
    DEFAULT_WAKE_GUEST_GRACE_MS,
    RUNTIME_KEYS,
    SPEECH_CONFIRM_MIN_GAP_MS,
    SPEECH_CONFIRMS_PER_HOUR,
    decideMotion,
    detectCapabilities,
    normalizePrefs,
    speechConfirmBudget,
    speechFalseWakeCooldownMs,
    summarizeResults,
    validatePrefsPatch,
    wakeGuestDeadline
} from '../../services/lurkStateService.js';
import {
    forgetRuntimeToggle,
    rememberRuntimeToggle,
    runtimeToggleOverride
} from '../../services/characterConfigLock.js';

const CID = 9302;
const PCM = Buffer.alloc(3200);

/** Push `n` frames at `rms` and return the candidates produced. */
function feed(gate, rms, n, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const c = gate.push(typeof rms === 'function' ? rms(i) : rms, { pcm: PCM, ...opts });
        if (c) out.push(c);
    }
    return out;
}

// Speech-like envelope: syllables with short dips, well above a quiet floor.
const talking = (i) => (i % 4 === 3 ? 0.03 : 0.12);

describe('speech wake — detector', () => {
    it('learns the room first, then reports an utterance when it ends', () => {
        const gate = createSpeechGate();
        expect(feed(gate, 0.2, 20)).to.have.length(0);            // during learning nothing fires
        feed(gate, 0.004, 40);                                    // quiet yard
        expect(feed(gate, talking, 15)).to.have.length(0);         // still talking: not over yet
        const done = feed(gate, 0.004, 8);                         // a pause ends it
        expect(done).to.have.length(1);
        expect(done[0].voicedMs).to.be.at.least(400);
        expect(done[0].peakRms).to.be.closeTo(0.12, 1e-9);
        expect(done[0].pcm.length).to.equal(done[0].durationMs / FRAME_MS * PCM.length);
    });

    it('ignores a cough, a clap or a door (too short)', () => {
        const gate = createSpeechGate();
        feed(gate, 0.004, 40);
        expect(feed(gate, 0.3, 2).concat(feed(gate, 0.004, 10))).to.have.length(0);
    });

    it('a noisy node does not trigger on its own background; a close voice still does', () => {
        const gate = createSpeechGate();
        const yard = (i) => 0.02 + 0.012 * Math.sin(i);             // ~Sir Dragomir's ambient
        expect(feed(gate, yard, 300)).to.have.length(0);
        expect(gate.status().threshold).to.be.above(DEFAULT_MIN_RMS);
        feed(gate, (i) => (i % 4 === 3 ? 0.04 : 0.2), 12);
        expect(feed(gate, yard, 8)).to.have.length(1);
    });

    it('drops an utterance in progress while the character itself is speaking', () => {
        const gate = createSpeechGate();
        feed(gate, 0.004, 40);
        feed(gate, 0.12, 4);
        feed(gate, 0.12, 6, { suppressed: true });
        expect(feed(gate, 0.004, 8)).to.have.length(0);
    });

    it('a sustained noise is absorbed into the floor instead of firing forever', () => {
        const gate = createSpeechGate();
        feed(gate, 0.004, 40);
        const before = gate.status().floor;
        feed(gate, 0.08, 50);                                      // a generator starts: one long "utterance"
        expect(gate.status().floor).to.be.above(before);
    });

    it('pcm helpers: RMS and a 44-byte WAV header', () => {
        const buf = Buffer.alloc(320);
        for (let i = 0; i < 160; i++) buf.writeInt16LE(i % 2 ? 16384 : -16384, i * 2);
        expect(pcmRms(buf)).to.be.closeTo(0.5, 1e-6);
        const wav = pcmToWav(buf);
        expect(wav.length).to.equal(44 + 320);
        expect(wav.toString('ascii', 0, 4)).to.equal('RIFF');
        expect(wav.readUInt32LE(24)).to.equal(16000);
    });

    it('recognises the character hearing its own line', () => {
        expect(isOwnEcho('come closer child', ['Come closer, child. The night is long.'])).to.equal(true);
        expect(isOwnEcho('hello is anyone in there', ['Come closer, child.'])).to.equal(false);
        expect(isOwnEcho('', ['anything'])).to.equal(false);
    });
});

describe('speech wake — listener yields the microphone', () => {
    function fakeCapture() {
        const opened = [];
        return {
            opened,
            startContinuousCapture(deviceId, onPcm) {
                const h = { deviceId, onPcm, stopped: false, proc: null, stop() { h.stopped = true; } };
                opened.push(h);
                return h;
            }
        };
    }

    it('opens one capture, steps aside for a conversation and comes back after it', async () => {
        const cap = fakeCapture();
        const l = new SpeechWakeListener(cap);
        await l.start(5, { deviceId: 'array' });
        expect(cap.opened).to.have.length(1);
        expect(l.status().listening).to.equal(true);
        l.onConversationMicStart(5);
        expect(cap.opened[0].stopped).to.equal(true);
        expect(l.status().yieldedToConversation).to.equal(true);
        l.onConversationMicStop(5);
        expect(cap.opened).to.have.length(2);
        await l.stop();
        expect(cap.opened[1].stopped).to.equal(true);
        expect(l.status().wanted).to.equal(false);
    });

    it('re-frames the stream into 100 ms frames and reports candidates', async () => {
        const cap = fakeCapture();
        const l = new SpeechWakeListener(cap);
        const got = [];
        await l.start(5, { onCandidate: (c) => got.push(c) });
        const frame = (amp) => { const b = Buffer.alloc(3200); for (let i = 0; i < 1600; i++) b.writeInt16LE(i % 2 ? amp : -amp, i * 2); return b; };
        const push = (amp, n) => { for (let i = 0; i < n; i++) cap.opened[0].onPcm(frame(amp)); };
        push(130, 40);                       // quiet (~0.004)
        for (let s = 0; s < 4; s++) { push(4000, 3); push(1000, 1); }   // speech (~0.12)
        push(130, 8);
        expect(got).to.have.length(1);
        expect(l.status().candidates).to.equal(1);
        await l.stop();
    });
});

describe('speech wake — pure decisions', () => {
    it('speech wakes a lurking node, honours its switch, holds and quiet hours', () => {
        expect(decideMotion({ state: 'lurking', source: 'speech' })).to.deep.equal({ action: 'wake', reason: 'speech' });
        expect(decideMotion({ state: 'lurking', source: 'speech', speechWake: false }).reason).to.equal('speech-wake-off');
        expect(decideMotion({ state: 'lurking', source: 'speech', pirWake: false }).action).to.equal('wake');
        expect(decideMotion({ state: 'lurking', source: 'speech', eventHold: true }).reason).to.equal('event-hold');
        expect(decideMotion({ state: 'lurking', source: 'speech', inQuietHours: true }).reason).to.equal('quiet-hours');
        expect(decideMotion({ state: 'lurking', source: 'speech', inRewakeCooldown: true }).reason).to.equal('rewake-cooldown');
        expect(decideMotion({ state: 'off', source: 'speech' }).reason).to.equal('not-lurking');
        expect(decideMotion({ state: 'awake', source: 'speech' }).action).to.equal('activity');
    });

    it('a speech wake gets the same no-guest grace as a PIR wake', () => {
        const base = { since: 1000, lastGuestAt: 1000, wakeGuestGraceMs: 90000 };
        expect(wakeGuestDeadline({ ...base, wake: { source: 'speech' } })).to.equal(91000);
        expect(wakeGuestDeadline({ ...base, wake: { source: 'pir' } })).to.equal(91000);
        expect(wakeGuestDeadline({ ...base, wake: { source: 'api', explicit: true } })).to.equal(null);
    });

    it('false speech wakes rest longer each time, capped at 30 minutes', () => {
        expect(speechFalseWakeCooldownMs(1)).to.equal(2 * 60 * 1000);
        expect(speechFalseWakeCooldownMs(2)).to.equal(4 * 60 * 1000);
        expect(speechFalseWakeCooldownMs(4)).to.equal(16 * 60 * 1000);
        expect(speechFalseWakeCooldownMs(9)).to.equal(30 * 60 * 1000);
    });

    it('budgets Scribe confirmations: one at a time, spaced, capped per hour', () => {
        const now = 10_000_000;
        expect(speechConfirmBudget({ now, times: [] }).ok).to.equal(true);
        expect(speechConfirmBudget({ now, times: [], inFlight: true }).reason).to.equal('confirm-in-flight');
        expect(speechConfirmBudget({ now, times: [now - 1000] }).reason).to.equal('confirm-rate');
        const full = Array.from({ length: SPEECH_CONFIRMS_PER_HOUR }, (_, i) => now - SPEECH_CONFIRM_MIN_GAP_MS - i * 1000);
        expect(speechConfirmBudget({ now, times: full }).reason).to.equal('confirm-budget');
        const old = full.map(t => t - 60 * 60 * 1000);
        expect(speechConfirmBudget({ now, times: old }).ok).to.equal(true);
    });

    it('prefs: speech wake defaults on, its level clamps, patches validate', () => {
        const d = normalizePrefs(null);
        expect(d.speechWake).to.equal(true);
        expect(d.speechWakeMinRms).to.equal(DEFAULT_MIN_RMS);
        expect(normalizePrefs({ speechWake: false }).speechWake).to.equal(false);
        expect(normalizePrefs({ speechWakeMinRms: 9 }).speechWakeMinRms).to.equal(0.5);
        expect(validatePrefsPatch({ speechWake: false, speechWakeMinRms: 0.05 })).to.deep.equal([]);
        expect(validatePrefsPatch({ speechWake: 'on' })).to.have.length(1);
        expect(validatePrefsPatch({ speechWakeMinRms: 0 })).to.have.length(1);
    });

    it('the microphone capability needs a working mic AND an agent to wake', async () => {
        const src = (parts, agent = 'agent_x', broken = []) => ({
            loadParts: async () => parts,
            readJaw: async () => ({}), readHead: async () => ({}), countIdlePoses: async () => 0,
            getAgentId: async () => agent,
            getFault: async (id, partId) => ({ broken: broken.includes(String(partId)) }),
            movableRoles: async () => [], canFollowOrders: async () => ({ ok: false }), readMusic: async () => null
        });
        const mic = { id: 4, type: 'microphone', name: 'Array' };
        expect((await detectCapabilities(CID, src([mic]))).microphone).to.deep.equal({ available: true, partId: 4 });
        expect((await detectCapabilities(CID, src([]))).microphone.reason).to.equal('no microphone');
        expect((await detectCapabilities(CID, src([mic], null))).microphone.reason).to.equal('no agent to wake');
        expect((await detectCapabilities(CID, src([mic], 'a', ['4']))).microphone.reason).to.equal('microphone is listed broken');
        expect((await detectCapabilities(CID, src([{ ...mic, enabled: false }]))).microphone.available).to.equal(false);
    });

    it('the transition log line names the listener', () => {
        expect(summarizeResults({ speech: { listening: true } })).to.equal('speech:on');
        expect(summarizeResults({ speech: { listening: false, reason: 'no microphone' } })).to.equal('speech:n/a(no microphone)');
    });
});

// ---------------------------------------------------------------------------
// The machine, end to end on fakes
// ---------------------------------------------------------------------------

const CAPS = () => ({
    agent: { available: true, agentId: 'agent_x' },
    jaw: { available: false, reason: 'none' },
    led: { available: false, reason: 'none' },
    headTracking: { available: false, reason: 'none' },
    idle: { available: false, reason: 'none' },
    aiMotion: { available: false, reason: 'none' },
    followOrders: { available: false, reason: 'none' },
    motionSensor: { available: false, reason: 'no motion sensor' },
    microphone: { available: true, partId: 4 },
    music: { available: false, reason: 'none' }
});

function fakeDeps(over = {}) {
    let now = over.startAt || 5_000_000;
    const timers = [];
    const calls = [];
    const state = {
        agentLive: false, playing: false, heard: over.heard != null ? over.heard : 'hello, is anyone in there?',
        speech: { entries: [], seq: 0 }, listening: false, handOff: over.handOff || { sent: true }
    };
    const log = (name, ...args) => calls.push([name, ...args]);
    const deps = {
        now: () => now,
        setTimeout: (fn, ms) => { const t = { fn, at: now + ms, cleared: false }; timers.push(t); return t; },
        clearTimeout: (t) => { if (t) t.cleared = true; },
        settle: async () => {},
        testMode: () => false,
        log: () => {},
        warn: () => {},
        readState: async () => null,
        writeState: async () => {},
        capabilities: async () => (over.caps ? over.caps() : CAPS()),
        agent: {
            start: async (id, opts) => { log('agent.start', opts || {}); state.agentLive = true; return { enabled: true }; },
            stop: async () => { log('agent.stop'); state.agentLive = false; return { enabled: false, stopped: true }; },
            isLive: () => state.agentLive
        },
        idle: { start: async () => {}, stop: async () => {}, isRunning: async () => false },
        head: {
            start: async () => ({ enabled: false }), stop: async () => ({ enabled: false }),
            isOperatorOff: async () => false, clearOperatorOff: async () => {}, isAlwaysOn: async () => false, isActive: async () => false
        },
        overrides: {
            remember: (id, key, value) => rememberRuntimeToggle(id, key, value),
            forget: (id, key) => forgetRuntimeToggle(id, key),
            get: (id, key) => runtimeToggleOverride(id, key)
        },
        randomPoses: { set: async () => {} },
        aiMotion: { isEnabled: async () => false },
        jaw: { prewarm: async () => {} },
        led: { idle: async () => {} },
        watcher: { start: async () => ({ armed: true }), stop: async () => {}, status: async () => ({ active: false }), statusSync: () => null },
        speechWake: {
            start: async (id, opts) => { log('speech.start', opts.minRms); state.listening = true; state.listenOpts = opts; return { wanted: true, listening: true }; },
            stop: async () => { if (state.listening) log('speech.stop'); state.listening = false; },
            yieldMic: async () => log('speech.yield'),
            statusSync: () => ({ listening: state.listening }),
            confirm: async () => { log('speech.confirm'); if (state.heard instanceof Error) throw state.heard; return state.heard; },
            recordGuest: (id, text) => { log('speech.record', text); state.speech = { entries: [...state.speech.entries, { at: new Date(now).toISOString(), speaker: 'guest', text }], seq: state.speech.seq + 1 }; },
            handOff: async (id, text) => { log('speech.handOff', text); return state.handOff; }
        },
        music: { resume: async () => ({ resumed: true }), nudge: async () => {}, statusSync: () => null },
        speech: { since: (id, seq) => (seq >= state.speech.seq ? { entries: seq === 0 ? state.speech.entries : [], seq: state.speech.seq } : state.speech) },
        audio: { recentlyPlaying: () => state.playing, sceneActive: () => !!state.scenePlaying },
        subscribeActivity: async () => null
    };
    return {
        deps, calls, state, timers,
        advance(ms) { now += ms; },
        get now() { return now; },
        async fireDue(machine) {
            const due = timers.filter(t => !t.cleared && !t.fired && t.at <= now);
            for (const t of due) { t.fired = true; t.fn(); }
            await machine._chain;
            await machine._chain;
        },
        names() { return calls.map(c => c[0]); }
    };
}

async function lurkingMachine(over = {}) {
    const f = fakeDeps(over);
    const m = new LurkStateMachine(f.deps);
    await m.init(CID, { bootDelayMs: 1000 });
    f.advance(1000);
    await f.fireDue(m);
    m.entry.prefs.pirQuietHours = null;      // the fake clock sits at an arbitrary hour
    f.advance(61 * 1000);                    // past the boot grace
    return { m, f };
}

const candidate = (over = {}) => ({ pcm: PCM, voicedMs: 800, peakRms: 0.12, floor: 0.01, threshold: 0.025, ...over });

afterEach(() => {
    for (const key of Object.values(RUNTIME_KEYS)) forgetRuntimeToggle(CID, key);
});

describe('speech wake — the lurk machine', () => {
    it('listens while lurking, at the node\'s own level', async () => {
        const { m, f } = await lurkingMachine();
        expect(f.state.listening).to.equal(true);
        expect(f.calls.find(c => c[0] === 'speech.start')[1]).to.equal(DEFAULT_MIN_RMS);
        expect(m.getStatus(CID).speech.available).to.equal(true);
        expect(m.entry.lastTransition.results.speech.listening).to.equal(true);
    });

    it('a guest speaking wakes the node and the agent answers their words (no greeting)', async () => {
        const { m, f } = await lurkingMachine();
        const r = await m.handleSpeechCandidate(CID, candidate());
        expect(r.action).to.equal('wake');
        expect(m.getState(CID)).to.equal('awake');
        expect(m.entry.wake.source).to.equal('speech');
        const names = f.names();
        // Confirmed, logged, mic released, agent started quietly, words handed over, listener off.
        expect(names.indexOf('speech.confirm')).to.be.below(names.indexOf('speech.record'));
        expect(names.indexOf('speech.yield')).to.be.below(names.indexOf('agent.start'));
        expect(f.calls.find(c => c[0] === 'agent.start')[1]).to.deep.equal({ noGreeting: true });
        expect(f.calls.find(c => c[0] === 'speech.handOff')[1]).to.equal('hello, is anyone in there?');
        expect(names).to.include('speech.stop');
        expect(m.entry.lastTransition.results.agent.answered).to.equal(true);
        expect(m.getStatus(CID).speech.wakes).to.equal(1);
    });

    it('a PIR wake keeps its greeting', async () => {
        const { m, f } = await lurkingMachine();
        await m.handleMotion(CID, { source: 'pir', force: true });
        expect(f.calls.find(c => c[0] === 'agent.start')[1]).to.deep.equal({});
    });

    it('noise without words, or the character\'s own line, does not wake it', async () => {
        const a = await lurkingMachine({ heard: '(wind blowing)' });
        a.f.state.heard = '...';
        expect((await a.m.handleSpeechCandidate(CID, candidate())).reason).to.equal('no-words');
        expect(a.m.getState(CID)).to.equal('lurking');

        const b = await lurkingMachine({ heard: 'come closer child' });
        b.f.state.speech = { entries: [{ at: new Date(b.f.now).toISOString(), speaker: 'character', text: 'Come closer, child.' }], seq: 1 };
        expect((await b.m.handleSpeechCandidate(CID, candidate())).reason).to.equal('own-voice');
        expect(b.m.getState(CID)).to.equal('lurking');
    });

    it('spends no Scribe call when the node could not wake anyway', async () => {
        const { m, f } = await lurkingMachine();
        f.state.playing = true;
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('own-speaker');
        f.state.playing = false;
        m.entry.prefs.pirQuietHours = { start: '00:00', end: '23:59' };
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('quiet-hours');
        m.entry.prefs.pirQuietHours = null;
        m.entry.prefs.speechWake = false;
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('speech-wake-off');
        expect(f.names()).to.not.include('speech.confirm');
    });

    it('a lurk bark or any scene on its own speaker is not a guest (frames suppressed, no Scribe call)', async () => {
        const { m, f } = await lurkingMachine();
        f.state.scenePlaying = true;
        expect(f.state.listenOpts.isSuppressed()).to.equal(true);
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('own-speaker');
        f.state.scenePlaying = false;
        expect(f.state.listenOpts.isSuppressed()).to.equal(false);
        expect(f.names()).to.not.include('speech.confirm');
    });

    it('the scene executor reports a scene for its character until a tail after it ends', async () => {
        const { executeScene, isSceneActive } = await import('../../services/scenes/sceneExecutor.js');
        expect(isSceneActive(CID, 2500)).to.equal(false);
        await executeScene({ id: 'sw-test', name: 'empty', steps: [] }, CID, null, {});
        expect(isSceneActive(CID, 2500)).to.equal(true);
        expect(isSceneActive(CID, 2500, Date.now() + 3000)).to.equal(false);
        await executeScene({ id: 'sw-dry', name: 'dry', steps: [] }, CID + 1, null, { dryRun: true });
        expect(isSceneActive(CID + 1, 2500)).to.equal(false);
    });

    it('a fleet event hold ignores speech', async () => {
        const { m, f } = await lurkingMachine();
        await m.eventHold(CID, { reason: 'show' });
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('event-hold');
        expect(f.names()).to.not.include('speech.confirm');
    });

    it('rate-limits confirmations and survives a failed one', async () => {
        const { m, f } = await lurkingMachine({ heard: '' });
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('no-words');
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('confirm-rate');
        f.advance(SPEECH_CONFIRM_MIN_GAP_MS);
        f.state.heard = new Error('network down');
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('confirm-failed');
        expect(m.entry.speech.confirming).to.equal(false);
        expect(m.getStatus(CID).speech.confirmsLastHour).to.equal(2);
    });

    it('a speech wake nobody answers sleeps after the grace and rests longer each time', async () => {
        const { m, f } = await lurkingMachine();
        await m.handleSpeechCandidate(CID, candidate());
        expect(m.getState(CID)).to.equal('awake');
        f.advance(DEFAULT_WAKE_GUEST_GRACE_MS);
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('lurking');
        expect(m.entry.lastTransition.reason).to.equal('no-guest-after-wake');
        expect(f.state.listening).to.equal(true);                      // listening again
        expect(m.entry.speech.falseWakeStreak).to.equal(1);
        expect(m.entry.pirCooldownUntil).to.equal(0);                  // the PIR is not punished
        expect((await m.handleSpeechCandidate(CID, candidate())).reason).to.equal('rewake-cooldown');
        f.advance(speechFalseWakeCooldownMs(1));
        await m.handleSpeechCandidate(CID, candidate());
        f.advance(DEFAULT_WAKE_GUEST_GRACE_MS);
        await f.fireDue(m);
        expect(m.entry.speech.falseWakeStreak).to.equal(2);
        expect(m.getStatus(CID).speech.rewakeCooldownMs).to.equal(speechFalseWakeCooldownMs(2));
    });

    it('a guest who keeps talking keeps the speech wake, and clears the false-wake streak', async () => {
        const { m, f } = await lurkingMachine();
        m.entry.speech.falseWakeStreak = 3;
        await m.handleSpeechCandidate(CID, candidate());
        f.advance(20 * 1000);
        f.state.speech = { entries: [...f.state.speech.entries, { at: new Date(f.now).toISOString(), speaker: 'guest', text: 'are you a vampire?' }], seq: f.state.speech.seq + 1 };
        f.advance(DEFAULT_WAKE_GUEST_GRACE_MS);
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('awake');
        expect(m.entry.speech.falseWakeStreak).to.equal(0);
    });

    it('awake speech is just activity; off stops the listener', async () => {
        const { m, f } = await lurkingMachine();
        await m.wake(CID, { source: 'api', explicit: true });
        expect(f.state.listening).to.equal(false);
        expect((await m.simulateSpeech(CID, 'hi')).action).to.equal('activity');
        await m.disarm(CID, {});
        expect(m.getState(CID)).to.equal('off');
        expect(f.state.listening).to.equal(false);
    });

    it('a failed hand-off still leaves the agent awake and listening', async () => {
        const { m } = await lurkingMachine({ handOff: { sent: false, reason: 'no ready agent session' } });
        await m.handleSpeechCandidate(CID, candidate());
        expect(m.getState(CID)).to.equal('awake');
        expect(m.entry.lastTransition.results.agent).to.include({ enabled: true, answered: false, handOff: 'no ready agent session' });
    });

    it('simulate takes the real path after the microphone; force bypasses quiet hours', async () => {
        const { m, f } = await lurkingMachine();
        m.entry.prefs.pirQuietHours = { start: '00:00', end: '23:59' };
        expect((await m.simulateSpeech(CID, 'good evening')).reason).to.equal('quiet-hours');
        const r = await m.simulateSpeech(CID, 'good evening', { force: true });
        expect(r.action).to.equal('wake');
        expect(f.calls.find(c => c[0] === 'speech.handOff')[1]).to.equal('good evening');
        expect(f.names()).to.not.include('speech.confirm');
    });

    it('switching speech wake off while lurking stops the listener; on starts it again', async () => {
        const { m, f } = await lurkingMachine();
        await m.setPrefs(CID, { speechWake: false });
        expect(f.state.listening).to.equal(false);
        await m.setPrefs(CID, { speechWake: true, speechWakeMinRms: 0.04 });
        expect(f.state.listening).to.equal(true);
        expect(f.state.listenOpts.minRms).to.equal(0.04);
    });

    it('a node without a microphone (or without the dependency) never listens', async () => {
        const { m, f } = await lurkingMachine({ caps: () => ({ ...CAPS(), microphone: { available: false, reason: 'no microphone' } }) });
        expect(f.state.listening).to.equal(false);
        expect(m.entry.lastTransition.results.speech.reason).to.equal('no microphone');

        const bare = fakeDeps();
        delete bare.deps.speechWake;
        const b = new LurkStateMachine(bare.deps);
        await b.init(CID, { bootDelayMs: 0 });
        await bare.fireDue(b);
        expect(b.getState(CID)).to.equal('lurking');
        expect(b.getStatus(CID).speech.listener).to.equal(null);
    });
});
