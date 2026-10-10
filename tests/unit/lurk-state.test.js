/**
 * Lurk state machine (services/lurkStateService.js) — decision D3 of the
 * castle-tuning mission: one per-node machine, boot into lurking, wake on PIR /
 * POST /wake / AI on, inactivity back to lurking (never mid-conversation),
 * runtime-only capability switches that a LOCKED character honours.
 *
 * Everything runs on injected fakes: no hardware, no sockets, no file writes,
 * no real timers. The runtime-toggle overlay is the REAL one from
 * characterConfigLock, so the tests also prove the jaw/AI-motion readers see
 * what AI mode switched on.
 */

import { expect } from 'chai';
import {
    LurkStateMachine,
    DEFAULT_INACTIVITY_MS,
    RUNTIME_KEYS,
    applyOptOut,
    clampHoldMs,
    countUsableIdlePoses,
    detectCapabilities,
    decideMotion,
    normalizePrefs,
    restingStateFor,
    sleepInMs,
    summarizeResults,
    validatePrefsPatch
} from '../../services/lurkStateService.js';
import {
    forgetRuntimeToggle,
    rememberRuntimeToggle,
    runtimeToggleOverride,
    withRuntimeToggle,
    isRuntimeStatePath
} from '../../services/characterConfigLock.js';
import { readAiMotionConfig } from '../../services/aiMotionSuperPowerService.js';
import { shouldPlay } from '../../services/backgroundMusicService.js';
import { decideCallout, isTransientBlock } from '../../services/calloutService.js';
import { decideLurkScene, queueStarted } from '../../services/lurkSceneService.js';
import { buildCommand } from '../../services/scheduleService.js';
import OrchestrationService from '../../services/orchestrationService.js';

// A character id no node has: the overlay and readers are exercised without
// touching any real character's state.
const CID = 9301;

const ALL_CAPS = () => ({
    agent: { available: true, agentId: 'agent_x' },
    jaw: { available: true, partId: 10 },
    led: { available: true, partId: 3 },
    headTracking: { available: true, webcamId: 9, panServoId: 15 },
    idle: { available: true, poses: 4 },
    aiMotion: { available: true, roles: 3 },
    followOrders: { available: true },
    motionSensor: { available: true, partId: 14, pin: 17, part: { id: 14, pin: 17 } },
    music: { available: true, tracks: 2 }
});

function fakeDeps(over = {}) {
    let now = over.startAt || 1_000_000;
    const timers = [];
    const calls = [];
    const state = {
        agentLive: false, idleRunning: false, headActive: false, watcherActive: false,
        speech: { entries: [], seq: 0 }, playing: false, stored: over.stored || null,
        writes: []
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
        readState: async () => state.stored,
        writeState: async (id, s) => { state.writes.push(s); },
        capabilities: async () => (over.caps ? over.caps() : ALL_CAPS()),
        agent: {
            start: async (id) => { log('agent.start', id); if (over.agentFails) return { enabled: false, error: 'boom' }; state.agentLive = true; return { enabled: true }; },
            stop: async (id) => { log('agent.stop', id); state.agentLive = false; return { enabled: false, stopped: true }; },
            isLive: () => state.agentLive
        },
        idle: {
            start: async (id) => { log('idle.start', id); state.idleRunning = true; },
            stop: async () => { log('idle.stop'); state.idleRunning = false; },
            isRunning: async () => state.idleRunning
        },
        head: {
            start: async (id) => { log('head.start', id); state.headActive = true; return { enabled: true }; },
            stop: async (id) => { log('head.stop', id); state.headActive = false; return { enabled: false }; },
            isOperatorOff: async () => false,
            clearOperatorOff: async () => {},
            isAlwaysOn: async () => !!over.alwaysOn,
            isActive: async () => state.headActive
        },
        overrides: {
            remember: (id, key, value) => rememberRuntimeToggle(id, key, value),
            forget: (id, key) => forgetRuntimeToggle(id, key),
            get: (id, key) => runtimeToggleOverride(id, key)
        },
        randomPoses: { set: async (id, on) => log('randomPoses', on) },
        aiMotion: { isEnabled: async (id) => !!withRuntimeToggle(id, RUNTIME_KEYS.aiMotion, false) },
        jaw: { prewarm: async () => {} },
        led: { idle: async () => {} },
        watcher: {
            start: async (id, part, onMotion) => { log('watcher.start', id); state.watcherActive = true; state.onMotion = onMotion; return { armed: true }; },
            stop: async () => { if (state.watcherActive) log('watcher.stop'); state.watcherActive = false; },
            status: async () => ({ active: state.watcherActive, characterId: CID }),
            statusSync: () => ({ active: state.watcherActive, characterId: CID })
        },
        music: {
            resume: async (id) => { log('music.resume', id); return { resumed: true }; },
            nudge: async () => {},
            statusSync: () => ({ running: true, playing: false })
        },
        speech: { since: (id, seq) => (seq >= state.speech.seq ? { entries: [], seq: state.speech.seq } : state.speech) },
        audio: { recentlyPlaying: () => state.playing },
        subscribeActivity: async () => null
    };
    return {
        deps, calls, state, timers,
        advance(ms) { now += ms; },
        get now() { return now; },
        /** Run every due, uncleared timer (and await the machine's chain). */
        async fireDue(machine) {
            const due = timers.filter(t => !t.cleared && !t.fired && t.at <= now);
            for (const t of due) { t.fired = true; t.fn(); }
            await machine._chain;
            await machine._chain;
        },
        names() { return calls.map(c => c[0]); }
    };
}

async function bootedMachine(over = {}) {
    const f = fakeDeps(over);
    const m = new LurkStateMachine(f.deps);
    await m.init(CID, { bootDelayMs: 1000 });
    f.advance(1000);
    await f.fireDue(m);
    return { m, f };
}

afterEach(() => {
    for (const key of Object.values(RUNTIME_KEYS)) forgetRuntimeToggle(CID, key);
});

describe('lurk state machine — pure helpers', () => {
    it('normalizes prefs with safe defaults and clamps', () => {
        const d = normalizePrefs(null);
        expect(d.inactivityTimeoutMs).to.equal(DEFAULT_INACTIVITY_MS);
        expect(d.pirWake).to.equal(true);
        expect(d.pirQuietHours).to.deep.equal({ start: '23:00', end: '08:00' });
        expect(d.capabilityOptOut).to.deep.equal([]);
        expect(normalizePrefs({ inactivityTimeoutMs: 10 }).inactivityTimeoutMs).to.equal(30000);
        expect(normalizePrefs({ inactivityTimeoutMs: 0 }).inactivityTimeoutMs).to.equal(0);
        expect(normalizePrefs({ pirQuietHours: null }).pirQuietHours).to.equal(null);
        expect(normalizePrefs({ capabilityOptOut: ['aiMotion', 'nonsense'] }).capabilityOptOut).to.deep.equal(['aiMotion']);
    });

    it('validates prefs patches', () => {
        expect(validatePrefsPatch({ inactivityTimeoutMs: 60000, pirWake: false })).to.deep.equal([]);
        expect(validatePrefsPatch({ inactivityTimeoutMs: -1 })).to.have.length(1);
        expect(validatePrefsPatch({ pirWake: 'yes' })).to.have.length(1);
        expect(validatePrefsPatch({ pirQuietHours: { start: '25:00', end: '08:00' } })).to.have.length(1);
        expect(validatePrefsPatch({ capabilityOptOut: ['music'] })).to.have.length(1);
    });

    it('decides what a motion edge does', () => {
        expect(decideMotion({ state: 'awake' }).action).to.equal('activity');
        expect(decideMotion({ state: 'awake', source: 'pir', inQuietHours: true }).reason).to.equal('quiet-hours');
        expect(decideMotion({ state: 'awake', source: 'simulate', inQuietHours: true }).action).to.equal('activity');
        expect(decideMotion({ state: 'off' }).action).to.equal('ignore');
        expect(decideMotion({ state: 'lurking', inBootGrace: true }).reason).to.equal('boot-grace');
        expect(decideMotion({ state: 'lurking', inQuietHours: true }).reason).to.equal('quiet-hours');
        expect(decideMotion({ state: 'lurking', eventHold: true }).reason).to.equal('event-hold');
        expect(decideMotion({ state: 'lurking', source: 'pir', pirWake: false }).reason).to.equal('pir-wake-off');
        expect(decideMotion({ state: 'lurking', inQuietHours: true, force: true }).action).to.equal('wake');
        expect(decideMotion({ state: 'lurking' }).action).to.equal('wake');
    });

    it('rests in lurking when armed, off when disarmed', () => {
        expect(restingStateFor(true)).to.equal('lurking');
        expect(restingStateFor(false)).to.equal('off');
    });

    it('computes time to sleep, hold clamps, opt-outs and the log summary', () => {
        expect(sleepInMs({ now: 100, lastActivityAt: 50, inactivityTimeoutMs: 1000 })).to.equal(950);
        expect(sleepInMs({ now: 100, lastActivityAt: 50, inactivityTimeoutMs: 0 })).to.equal(null);
        expect(clampHoldMs(1)).to.equal(10000);
        const caps = applyOptOut(ALL_CAPS(), ['aiMotion']);
        expect(caps.aiMotion.available).to.equal(false);
        expect(ALL_CAPS().aiMotion.available).to.equal(true);
        expect(summarizeResults({ agent: { enabled: true }, led: { enabled: false, reason: 'no LED ring' } }))
            .to.equal('agent:on led:n/a(no LED ring)');
    });

    it('stores its state in a runtime-state path the config lock permits', () => {
        expect(isRuntimeStatePath('/home/remote/MonsterBox/data/character-4/lurk-state.json')).to.equal(true);
    });
});

describe('lurk state machine — capabilities from the character\'s own parts', () => {
    // A node whose servos are dead (listed broken) but whose lamp works: the
    // machine must not rely on head tracking, servo idle poses or the jaw.
    const parts = [
        { id: 1, type: 'servo', name: 'Jaw' }, { id: 2, type: 'servo', name: 'Neck' },
        { id: 5, type: 'light', name: 'Lamp' }, { id: 7, type: 'webcam', name: 'Cam' },
        { id: 9, type: 'motion_sensor', name: 'PIR', pin: 26 }
    ];
    const poses = [
        { id: 1, tags: ['idle'], parts: [{ partId: 1 }, { partId: 2 }] },
        { id: 2, tags: ['idle', 'breath'], parts: [{ partId: 2 }] },
        { id: 3, tags: ['speech'], parts: [{ partId: 5 }] }
    ];
    const src = (broken) => ({
        loadParts: async () => parts,
        readJaw: async () => ({ servoPartId: 1 }),
        readHead: async () => ({ panServoId: '2' }),
        countIdlePoses: async (id, brokenIds) => countUsableIdlePoses(poses, brokenIds),
        getAgentId: async () => 'agent_x',
        getFault: async (id, pid) => ({ broken: broken.includes(Number(pid)) }),
        movableRoles: async (list) => list.filter(p => p.type === 'light' || p.type === 'servo').map(p => ({ partId: String(p.id), movable: p.type === 'servo', role: p.type === 'light' ? 'light' : 'head' })),
        canFollowOrders: async () => ({ ok: true }),
        readMusic: async () => null
    });

    it('counts only idle poses that move a working part', () => {
        expect(countUsableIdlePoses(poses, new Set())).to.deep.equal({ usable: 2, total: 2 });
        expect(countUsableIdlePoses(poses, new Set(['2']))).to.deep.equal({ usable: 1, total: 2 });
        expect(countUsableIdlePoses(poses, new Set(['1', '2']))).to.deep.equal({ usable: 0, total: 2 });
    });

    it('dead servos: no jaw, no head tracking, no idle movement — the lamp still counts for AI motion', async () => {
        const caps = await detectCapabilities(2, src([1, 2]));
        expect(caps.jaw).to.include({ available: false, reason: 'jaw servo is listed broken' });
        expect(caps.headTracking).to.include({ available: false, reason: 'pan servo is listed broken' });
        expect(caps.idle).to.include({ available: false, reason: 'every idle pose moves only parts listed broken' });
        expect(caps.aiMotion.available).to.equal(true);
        expect(caps.aiMotion.roles).to.equal(1);
        expect(caps.motionSensor.available).to.equal(true);
        expect(caps.brokenParts.partIds).to.have.members(['1', '2']);
    });

    it('healthy parts: everything the parts support is available', async () => {
        const caps = await detectCapabilities(2, src([]));
        expect(caps.jaw.available).to.equal(true);
        expect(caps.headTracking.available).to.equal(true);
        expect(caps.idle).to.include({ available: true, poses: 2 });
        expect(caps.led.available).to.equal(false);
        expect(caps.brokenParts).to.equal(undefined);
    });
});

describe('lurk state machine — transitions', () => {
    it('boots into LURKING: idle loop, head tracking, PIR and music — never the agent', async () => {
        const { m, f } = await bootedMachine();
        expect(m.getState(CID)).to.equal('lurking');
        const n = f.names();
        expect(n).to.include.members(['idle.start', 'head.start', 'watcher.start', 'music.resume']);
        expect(n).to.not.include('agent.start');
        expect(f.state.writes.at(-1).state).to.equal('lurking');
    });

    it('a wake starts the agent FIRST and alone, then switches capabilities on in memory only', async () => {
        const { m, f } = await bootedMachine();
        f.calls.length = 0;
        const r = await m.wake(CID, { source: 'api' });
        expect(r.success).to.equal(true);
        expect(m.getState(CID)).to.equal('awake');
        const n = f.names();
        // The idle loop pauses before the agent's cold start (PumpkinHead stagger)...
        expect(n.indexOf('idle.stop')).to.be.lessThan(n.indexOf('agent.start'));
        // ...and comes back after it.
        expect(n.lastIndexOf('idle.start')).to.be.greaterThan(n.indexOf('agent.start'));
        // Runtime overlay: the readers see the switches although the "disk" says false.
        expect(withRuntimeToggle(CID, 'jawAnimation.enabled', false)).to.equal(true);
        expect(withRuntimeToggle(CID, 'jawAnimation.ledSync.enabled', false)).to.equal(true);
        expect(withRuntimeToggle(CID, 'followOrders.enabled', false)).to.equal(true);
        const aim = await readAiMotionConfig(CID);
        expect(aim.enabled).to.equal(true);
        expect(r.results.jaw.enabled).to.equal(true);
    });

    it('a capability the parts do not support stays off with its reason', async () => {
        const { m } = await bootedMachine({ caps: () => ({ ...ALL_CAPS(), jaw: { available: false, reason: 'no jaw servo configured' } }) });
        const r = await m.wake(CID, { source: 'api' });
        expect(r.results.jaw).to.deep.equal({ enabled: false, reason: 'no jaw servo configured' });
        expect(runtimeToggleOverride(CID, 'jawAnimation.enabled')).to.equal(undefined);
    });

    it('AI off returns to lurking and drops exactly the switches the wake set', async () => {
        const { m, f } = await bootedMachine();
        await m.wake(CID, { source: 'api' });
        // The operator flips AI Motion off while awake: that value is theirs now.
        rememberRuntimeToggle(CID, 'aiMotion.enabled', false);
        await m.aiOff(CID);
        expect(m.getState(CID)).to.equal('lurking');
        expect(f.state.agentLive).to.equal(false);
        expect(runtimeToggleOverride(CID, 'jawAnimation.enabled')).to.equal(undefined);
        expect(runtimeToggleOverride(CID, 'aiMotion.enabled')).to.equal(false);
    });

    it('inactivity returns to lurking, but never while speech or reply audio is recent', async () => {
        const { m, f } = await bootedMachine();
        await m.wake(CID, { source: 'pir' });
        // Guest speech logged 4 minutes in pushes the sleep out.
        f.advance(4 * 60 * 1000);
        f.state.speech = { entries: [{ at: new Date(f.now).toISOString(), speaker: 'guest', text: 'who are you?' }], seq: 1 };
        f.advance(60 * 1000 + 10);
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('awake');
        // Quiet for the full timeout, but the reply is still draining from the speaker.
        f.advance(5 * 60 * 1000);
        f.state.playing = true;
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('awake');
        // Genuinely quiet: back to lurking.
        f.state.playing = false;
        f.advance(5 * 60 * 1000 + 10);
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('lurking');
        expect(f.state.agentLive).to.equal(false);
    });

    it('an agent talking to room noise cannot keep a node awake forever', async () => {
        const { m, f } = await bootedMachine();
        await m.wake(CID, { source: 'pir' });
        // The agent "replies" every minute; ASR noise is logged as guest "...".
        for (let i = 0; i < 16; i++) {
            f.advance(60 * 1000);
            m.noteActivity(CID, 'agent_speech');
            m.entry.prefs.pirQuietHours = null;
            await m.handleMotion(CID, { source: 'pir' }); // a restless PIR is not a guest
            f.state.speech = { entries: [{ at: new Date(f.now).toISOString(), speaker: 'guest', text: '...' }], seq: i + 2 };
            await f.fireDue(m);
            if (m.getState(CID) !== 'awake') break;
        }
        expect(m.getState(CID)).to.equal('lurking');
        expect(m.entry.lastTransition.reason).to.equal('no-guest-activity');
        // The restless PIR cannot wake it straight back up.
        m.entry.prefs.pirQuietHours = null;
        expect((await m.handleMotion(CID, { source: 'pir' })).reason).to.equal('rewake-cooldown');
        f.advance(5 * 60 * 1000 + 1);
        expect((await m.handleMotion(CID, { source: 'pir' })).action).to.equal('wake');
        // 3 x the 5-minute timeout after the wake, not sooner.
        expect(f.now - m.entry.lastTransition.at).to.be.at.most(60 * 1000);
    });

    it('activity events (the conversation hook) keep it awake', async () => {
        const { m, f } = await bootedMachine();
        await m.wake(CID, { source: 'api' });
        f.advance(4 * 60 * 1000);
        expect(m.noteActivity(CID, 'guest-speech')).to.equal(true);
        f.advance(60 * 1000 + 10);
        await f.fireDue(m);
        expect(m.getState(CID)).to.equal('awake');
    });

    it('PIR: ignored during boot grace, wakes after, is activity while awake', async () => {
        const { m, f } = await bootedMachine();
        const early = await m.handleMotion(CID, { source: 'pir' });
        expect(early.reason).to.equal('boot-grace');
        f.advance(2 * 60 * 1000);
        // Quiet hours default 23:00-08:00; pin the wall clock outside them.
        m.entry.prefs.pirQuietHours = null;
        const r = await m.handleMotion(CID, { source: 'pir' });
        expect(r.action).to.equal('wake');
        expect(m.getState(CID)).to.equal('awake');
        const again = await m.handleMotion(CID, { source: 'pir' });
        expect(again.action).to.equal('activity');
    });

    it('a disarmed (off) machine ignores the PIR but an explicit wake still works and returns to off', async () => {
        const { m, f } = await bootedMachine();
        await m.disarm(CID);
        expect(m.getState(CID)).to.equal('off');
        expect(f.state.watcherActive).to.equal(false);
        expect((await m.handleMotion(CID, { source: 'pir' })).reason).to.equal('not-lurking');
        await m.wake(CID, { source: 'schedule' });
        expect(m.getState(CID)).to.equal('awake');
        await m.aiOff(CID);
        expect(m.getState(CID)).to.equal('off');
    });

    it('panic stops head tracking even when always-on; Lurk OFF leaves always-on tracking running', async () => {
        const a = await bootedMachine({ alwaysOn: true });
        await a.m.disarm(CID);
        expect(a.f.state.headActive).to.equal(true);
        await a.m.panic(CID);
        expect(a.f.state.headActive).to.equal(false);
    });

    it('a fleet event hold pauses idle + head, blocks PIR wakes, and release restores them', async () => {
        const { m, f } = await bootedMachine();
        f.advance(2 * 60 * 1000);
        m.entry.prefs.pirQuietHours = null;
        await m.eventHold(CID, { reason: 'ceremony' });
        expect(f.state.idleRunning).to.equal(false);
        expect(f.state.headActive).to.equal(false);
        expect(m.getGateState(CID)).to.equal('event');
        expect((await m.handleMotion(CID, { source: 'pir' })).reason).to.equal('event-hold');
        const rel = await m.eventRelease(CID);
        expect(rel.released).to.equal(true);
        expect(f.state.idleRunning).to.equal(true);
        expect(f.state.headActive).to.equal(true);
        expect(m.getGateState(CID)).to.equal('lurking');
    });

    it('event hold and release are idempotent and self-expire', async () => {
        const { m, f } = await bootedMachine();
        const h1 = await m.eventHold(CID, { reason: 'ceremony', maxMs: 60000 });
        const h2 = await m.eventHold(CID, { reason: 'ceremony', maxMs: 60000 });
        expect(h1.held).to.equal(true);
        expect(h2.alreadyHeld).to.equal(true);
        expect(h2.hold.remembered.idle).to.equal(true); // the FIRST hold's memory survives
        const r1 = await m.eventRelease(CID);
        const r2 = await m.eventRelease(CID);
        expect(r1.released).to.equal(true);
        expect(r2).to.include({ success: true, released: false, reason: 'not-held' });
        // A hold nobody releases gives the node back by itself.
        await m.eventHold(CID, { maxMs: 30000 });
        f.advance(30001);
        await f.fireDue(m);
        expect(m.getGateState(CID)).to.equal('lurking');
        expect(f.state.idleRunning).to.equal(true);
    });

    it('an event hold never tears down an awake conversation', async () => {
        const { m, f } = await bootedMachine();
        await m.wake(CID, { source: 'api' });
        await m.eventHold(CID, { reason: 'song' });
        expect(m.getState(CID)).to.equal('awake');
        expect(f.state.agentLive).to.equal(true);
        await m.eventRelease(CID);
        expect(m.getState(CID)).to.equal('awake');
    });

    it('refuses to animate a character this node does not own', async () => {
        const { m } = await bootedMachine();
        const r = await m.wake(CID + 1, { nodeCharacterId: CID });
        expect(r.success).to.equal(false);
        expect(m.getState(CID)).to.equal('lurking');
    });

    it('a failed agent still wakes the body and reports the error', async () => {
        const { m } = await bootedMachine({ agentFails: true });
        const r = await m.aiOn(CID);
        expect(m.getState(CID)).to.equal('awake');
        expect(r.results.agent.enabled).to.equal(false);
        expect(r.results.jaw.enabled).to.equal(true);
    });
});

describe('lurk-gated features', () => {
    it('background music plays only while lurking and not operator-paused', () => {
        const base = { enabled: true, hasTracks: true, msSinceBlocked: Infinity };
        expect(shouldPlay({ ...base, lurkState: 'lurking' }).play).to.equal(true);
        expect(shouldPlay({ ...base, lurkState: 'awake' }).reason).to.equal('awake');
        expect(shouldPlay({ ...base, lurkState: 'event' }).reason).to.equal('event-hold');
        expect(shouldPlay({ ...base, lurkState: 'off' }).reason).to.equal('not-lurking');
        expect(shouldPlay({ ...base, lurkState: null }).play).to.equal(true);
        expect(shouldPlay({ ...base, lurkState: 'lurking', operatorPaused: true }).reason).to.equal('paused');
    });

    it('callouts speak only while lurking (operator test excepted)', () => {
        expect(decideCallout({ enabled: true, lurkState: 'lurking' }).go).to.equal(true);
        expect(decideCallout({ enabled: true, lurkState: 'awake' }).reason).to.equal('awake');
        expect(decideCallout({ enabled: true, lurkState: null }).reason).to.equal('not-lurking');
        expect(decideCallout({ enabled: false, ignoreEnabled: true, lurkState: 'awake' }).go).to.equal(true);
        expect(isTransientBlock('awake')).to.equal(true);
    });

    it('lurk scenes: started queue detection no longer reports a false "did not start"', () => {
        // The status startWithConfig returns: the only item already shifted off.
        expect(queueStarted({ running: true, length: 0, nowPlaying: null })).to.equal(true);
        expect(queueStarted({ running: false, length: 0, nowPlaying: null })).to.equal(false);
        expect(queueStarted(null)).to.equal(false);
        expect(decideLurkScene({ enabled: true, hasScenes: true, lurking: false }).reason).to.equal('not-lurking');
        expect(decideLurkScene({ enabled: true, hasScenes: true, lurking: true, guestsPresent: true }).reason).to.equal('guests-present');
    });

    it('the schedule wake action posts to the node\'s wake endpoint', () => {
        const cmd = buildCommand({ type: 'wake', characterId: 4 });
        expect(cmd).to.include('/conversation/api/wake?characterId=4');
        expect(cmd).to.include('"source":"schedule"');
        expect(cmd).to.include('wake.log');
        expect(() => buildCommand({ type: 'wake' })).to.throw(/character/);
    });

    it('the fleet superpower map has an ai key with a wake-sized timeout', () => {
        const call = OrchestrationService.constructor.SUPERPOWER_ENDPOINTS.ai(true);
        expect(call.path).to.equal('/conversation/api/ai-on');
        expect(call.body).to.deep.equal({ enabled: true });
        expect(call.timeout).to.be.greaterThan(8000);
    });
});
