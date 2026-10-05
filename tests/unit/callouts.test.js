/**
 * Callout mode — scheduling decisions, wake gating, interval gating of wake
 * callouts and config validation.
 *
 * Everything is in-memory with injected deps: no audio is played, no AI is
 * called, no file is written and no real timer is left running.
 */

import { expect } from 'chai';
import {
    CalloutService,
    DEFAULTS,
    MIN_INTERVAL_MS,
    buildCalloutPrompt,
    decideCallout,
    isTransientBlock,
    nextDelayMs,
    normalizeCalloutState,
    planWake,
    validateCalloutPatch,
    wakeCalloutDue
} from '../../services/calloutService.js';
import { isRuntimeStatePath } from '../../services/characterConfigLock.js';

const at = (hh, mm) => new Date(2026, 9, 31, hh, mm, 0).getTime();

// Fire the scheduled tick the way the timer callback does: it clears the
// pending-timer slot before running, which is what lets the tick reschedule.
async function fireTick(svc, characterId) {
    const entry = svc.chars.get(String(characterId));
    if (entry) entry.timer = null;
    await svc._tick(characterId);
}

function makeService({ stored = null, probe = {}, speak, now = at(19, 0) } = {}) {
    const clock = { now };
    const timers = [];
    const calls = { speak: [], write: [], speech: [] };
    const deps = {
        now: () => clock.now,
        random: () => 0.5,
        setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
        clearTimeout: (t) => { if (t) t.cleared = true; },
        readState: async () => stored,
        writeState: async (id, st) => { calls.write.push({ id, st }); stored = st; },
        probe: async () => ({ muted: false, conversationActive: false, queueRunning: false, otherAudioActive: false, ...probe }),
        speak: speak || (async (id, prompt) => { calls.speak.push({ id, prompt }); return { success: true, text: 'Come closer, little ones.' }; }),
        recordSpeech: (id, text) => calls.speech.push({ id, text })
    };
    return { svc: new CalloutService(deps), clock, timers, calls };
}

describe('callouts: runtime state survives a config lock', () => {
    it('callout-state.json is runtime state (writable on a LOCKED character)', () => {
        expect(isRuntimeStatePath('/home/remote/MonsterBox/data/character-1/callout-state.json')).to.equal(true);
    });
});

describe('callouts: normalizeCalloutState()', () => {
    it('absent file reads as disabled with the documented defaults', () => {
        const st = normalizeCalloutState(null);
        expect(st).to.deep.equal({
            enabled: false, intervalMs: 300000, jitterPct: 15,
            quietHours: { start: '23:00', end: '08:00' }, aiOnWake: false, prompt: null, maxWords: 20
        });
        expect(DEFAULTS.intervalMs).to.equal(300000);
    });

    it('keeps explicit null quiet hours and repairs nonsense values', () => {
        const st = normalizeCalloutState({ enabled: true, intervalMs: 5, jitterPct: 900, quietHours: null, maxWords: 'x' });
        expect(st.enabled).to.equal(true);
        expect(st.intervalMs).to.equal(300000);
        expect(st.jitterPct).to.equal(50);
        expect(st.quietHours).to.equal(null);
        expect(st.maxWords).to.equal(20);
        expect(normalizeCalloutState({ quietHours: { start: '25:00', end: '1' } }).quietHours)
            .to.deep.equal({ start: '23:00', end: '08:00' });
    });
});

describe('callouts: validateCalloutPatch()', () => {
    it('accepts a complete valid body', () => {
        expect(validateCalloutPatch({
            enabled: true, intervalMs: 300000, jitterPct: 15, quietHours: { start: '22:00', end: '07:30' },
            aiOnWake: false, prompt: 'Say hi.', maxWords: 15
        })).to.deep.equal([]);
        expect(validateCalloutPatch({ quietHours: null })).to.deep.equal([]);
        expect(validateCalloutPatch({})).to.deep.equal([]);
    });

    it('rejects an interval under one minute, bad quiet hours and wrong types', () => {
        expect(validateCalloutPatch({ intervalMs: MIN_INTERVAL_MS - 1 })[0]).to.match(/intervalMs/);
        expect(validateCalloutPatch({ intervalMs: 'soon' })[0]).to.match(/intervalMs/);
        expect(validateCalloutPatch({ quietHours: { start: '23:00' } })[0]).to.match(/quietHours/);
        expect(validateCalloutPatch({ quietHours: { start: '24:00', end: '08:00' } })[0]).to.match(/quietHours/);
        expect(validateCalloutPatch({ quietHours: '23:00-08:00' })[0]).to.match(/quietHours/);
        expect(validateCalloutPatch({ enabled: 'yes' })[0]).to.match(/enabled/);
        expect(validateCalloutPatch({ aiOnWake: 1 })[0]).to.match(/aiOnWake/);
        expect(validateCalloutPatch({ jitterPct: 80 })[0]).to.match(/jitterPct/);
        expect(validateCalloutPatch({ prompt: 42 })[0]).to.match(/prompt/);
        expect(validateCalloutPatch([])).to.have.length(1);
    });

    it('writeState refuses an invalid body without writing', async () => {
        const { svc, calls } = makeService();
        let err;
        try { await svc.writeState(4, { intervalMs: 1000 }); } catch (e) { err = e; }
        expect(err && err.validation).to.be.an('array');
        expect(calls.write).to.have.length(0);
    });
});

describe('callouts: decideCallout()', () => {
    const base = { enabled: true };

    it('speaks when enabled and nothing blocks', () => {
        expect(decideCallout(base)).to.deep.equal({ go: true, reason: 'ok' });
    });

    it('never speaks when disabled (unless an operator test)', () => {
        expect(decideCallout({ enabled: false }).reason).to.equal('disabled');
        expect(decideCallout({ enabled: false, ignoreEnabled: true }).go).to.equal(true);
    });

    it('blocks on quiet hours, mute, active session, scene queue, other audio and an in-flight callout', () => {
        expect(decideCallout({ ...base, inQuietHours: true }).reason).to.equal('quiet-hours');
        expect(decideCallout({ ...base, muted: true }).reason).to.equal('muted');
        expect(decideCallout({ ...base, conversationActive: true }).reason).to.equal('conversation');
        expect(decideCallout({ ...base, queueRunning: true }).reason).to.equal('scene-queue');
        expect(decideCallout({ ...base, otherAudioActive: true }).reason).to.equal('other-audio');
        expect(decideCallout({ ...base, inFlight: true }).reason).to.equal('in-flight');
    });

    it('force bypasses quiet hours only — never mute or a live conversation', () => {
        expect(decideCallout({ ...base, inQuietHours: true, force: true }).go).to.equal(true);
        expect(decideCallout({ ...base, muted: true, force: true }).reason).to.equal('muted');
        expect(decideCallout({ ...base, conversationActive: true, force: true }).reason).to.equal('conversation');
    });

    it('transient blocks retry soon; lasting ones wait an interval', () => {
        expect(isTransientBlock('conversation')).to.equal(true);
        expect(isTransientBlock('scene-queue')).to.equal(true);
        expect(isTransientBlock('quiet-hours')).to.equal(false);
        expect(isTransientBlock('muted')).to.equal(false);
    });
});

describe('callouts: nextDelayMs()', () => {
    it('jitter only lengthens the gap: never shorter than intervalMs, never below one minute', () => {
        expect(nextDelayMs(300000, 15, () => 0.5)).to.equal(322500);
        expect(nextDelayMs(300000, 15, () => 0)).to.equal(300000);
        expect(nextDelayMs(300000, 15, () => 0.999999)).to.be.within(344999, 345000);
        expect(nextDelayMs(60000, 50, () => 0)).to.equal(60000);
        for (let i = 0; i < 200; i++) expect(nextDelayMs(300000, 15)).to.be.at.least(300000);
    });
});

describe('callouts: wake gating', () => {
    it('disabled or absent callout mode starts the agent exactly as today', () => {
        expect(planWake(null)).to.deep.equal({ startAgent: true, calloutMode: false });
        expect(planWake({ enabled: false, aiOnWake: false })).to.deep.equal({ startAgent: true, calloutMode: false });
    });

    it('callout mode with aiOnWake false does NOT start an agent session', () => {
        expect(planWake({ enabled: true })).to.deep.equal({ startAgent: false, calloutMode: true });
        expect(planWake({ enabled: true, aiOnWake: false }).startAgent).to.equal(false);
    });

    it('callout mode with aiOnWake true still starts the agent', () => {
        expect(planWake({ enabled: true, aiOnWake: true })).to.deep.equal({ startAgent: true, calloutMode: true });
    });
});

describe('callouts: interval gating of wake callouts', () => {
    it('wakeCalloutDue: first wake is due; later wakes only once the interval has passed', () => {
        expect(wakeCalloutDue({ enabled: true, lastCalloutAt: 0, now: 1000, intervalMs: 300000 })).to.equal(true);
        expect(wakeCalloutDue({ enabled: true, lastCalloutAt: 1000, now: 300999, intervalMs: 300000 })).to.equal(false);
        expect(wakeCalloutDue({ enabled: true, lastCalloutAt: 1000, now: 301000, intervalMs: 300000 })).to.equal(true);
        expect(wakeCalloutDue({ enabled: false, lastCalloutAt: 0, now: 1000, intervalMs: 300000 })).to.equal(false);
    });

    it('two PIR wakes inside one interval greet only once', async () => {
        const { svc, clock, calls } = makeService({ stored: { enabled: true, intervalMs: 300000 } });
        const first = await svc.onMotionWake(4);
        expect(first.spoke).to.equal(true);
        clock.now += 60000;
        const second = await svc.onMotionWake(4);
        expect(second).to.deep.equal({ spoke: false, reason: 'not-due' });
        clock.now += 240000;
        const third = await svc.onMotionWake(4);
        expect(third.spoke).to.equal(true);
        expect(calls.speak).to.have.length(2);
        expect(calls.speech[0]).to.deep.equal({ id: 4, text: 'Come closer, little ones.' });
    });

    it('a wake never calls out when callout mode is disabled', async () => {
        const { svc, calls } = makeService({ stored: null });
        expect((await svc.onMotionWake(2)).spoke).to.equal(false);
        expect(calls.speak).to.have.length(0);
    });

    it('a wake inside quiet hours stays silent', async () => {
        const { svc, calls } = makeService({ stored: { enabled: true }, now: at(23, 30) });
        const r = await svc.onMotionWake(5);
        expect(r).to.deep.equal({ spoke: false, reason: 'quiet-hours' });
        expect(calls.speak).to.have.length(0);
    });
});

describe('callouts: scheduler', () => {
    const prevTestMode = process.env.MB_TEST_MODE;
    before(() => { delete process.env.MB_TEST_MODE; });
    after(() => { if (prevTestMode !== undefined) process.env.MB_TEST_MODE = prevTestMode; });

    it('apply() schedules one unref-able timer and stop clears it', async () => {
        const { svc, timers } = makeService({ stored: { enabled: true, intervalMs: 300000 } });
        const status = await svc.apply(3);
        expect(status.running).to.equal(true);
        expect(timers).to.have.length(1);
        expect(timers[0].ms).to.equal(nextDelayMs(300000, 15, () => 0.5));
        svc.stopAll();
        expect(timers[0].cleared).to.equal(true);
        expect(svc.getStatus(3).running).to.equal(false);
    });

    it('a tick speaks once and reschedules a full interval', async () => {
        const { svc, timers, calls } = makeService({ stored: { enabled: true, intervalMs: 300000 } });
        await svc.apply(3);
        await fireTick(svc, 3);
        expect(calls.speak).to.have.length(1);
        expect(calls.speak[0].prompt).to.match(/at most 20 words/);
        expect(timers[timers.length - 1].ms).to.equal(nextDelayMs(300000, 15, () => 0.5));
        svc.stopAll();
    });

    it('a tick blocked by a live conversation retries in 30 s without speaking', async () => {
        const { svc, timers, calls } = makeService({ stored: { enabled: true }, probe: { conversationActive: true } });
        await svc.apply(3);
        await fireTick(svc, 3);
        expect(calls.speak).to.have.length(0);
        expect(timers[timers.length - 1].ms).to.equal(30000);
        svc.stopAll();
    });

    it('a tick in quiet hours or while muted waits a full interval', async () => {
        const quiet = makeService({ stored: { enabled: true }, now: at(2, 0) });
        await quiet.svc.apply(3);
        await fireTick(quiet.svc, 3);
        expect(quiet.calls.speak).to.have.length(0);
        expect(quiet.timers[quiet.timers.length - 1].ms).to.equal(nextDelayMs(300000, 15, () => 0.5));
        quiet.svc.stopAll();

        const muted = makeService({ stored: { enabled: true }, probe: { muted: true } });
        await muted.svc.apply(3);
        await fireTick(muted.svc, 3);
        expect(muted.calls.speak).to.have.length(0);
        muted.svc.stopAll();
    });

    it('a scene queue blocks the callout', async () => {
        const { svc, calls } = makeService({ stored: { enabled: true }, probe: { queueRunning: true } });
        await svc.apply(3);
        expect((await svc.performCallout(3)).reason).to.equal('scene-queue');
        expect(calls.speak).to.have.length(0);
        svc.stopAll();
    });

    it('an AI failure is skipped, not retried in a loop', async () => {
        let attempts = 0;
        const { svc, timers } = makeService({
            stored: { enabled: true },
            speak: async () => { attempts += 1; throw new Error('quota exhausted'); }
        });
        await svc.apply(3);
        const origError = console.error;
        let logged = 0;
        console.error = () => { logged += 1; };
        try {
            await fireTick(svc, 3);
            await fireTick(svc, 3);
        } finally { console.error = origError; }
        expect(attempts).to.equal(2);
        expect(logged).to.equal(1);
        expect(timers[timers.length - 1].ms).to.equal(nextDelayMs(300000, 15, () => 0.5));
        svc.stopAll();
    });

    it('a tick and a wake arriving together speak ONCE (slot claimed before the async probe)', async () => {
        let release;
        const gate = new Promise(r => { release = r; });
        const { svc, calls } = makeService({ stored: { enabled: true } });
        svc.deps.probe = async () => { await gate; return {}; };
        await svc.apply(3);
        const a = svc.performCallout(3, { source: 'schedule' });
        const b = svc.onMotionWake(3);
        release();
        const results = await Promise.all([a, b]);
        expect(calls.speak).to.have.length(1);
        expect(results.filter(r => r.spoke)).to.have.length(1);
        svc.stopAll();
    });

    it('a scheduled tick never speaks within intervalMs of the last spoken line', async () => {
        const { svc, clock, timers, calls } = makeService({ stored: { enabled: true, intervalMs: 300000 } });
        await svc.apply(3);
        expect((await svc.testCallout(3)).spoke).to.equal(true);
        clock.now += 60000;
        await fireTick(svc, 3);
        expect(calls.speak).to.have.length(1);
        expect(timers[timers.length - 1].ms).to.equal(240000);
        clock.now += 240000;
        await fireTick(svc, 3);
        expect(calls.speak).to.have.length(2);
        svc.stopAll();
    });

    it('re-applying the config never leaves two timers live', async () => {
        const { svc, timers } = makeService({ stored: { enabled: true } });
        await svc.apply(3);
        await svc.writeState(3, { enabled: true, intervalMs: 120000 });
        await svc.apply(3);
        expect(timers.filter(t => !t.cleared)).to.have.length(1);
        svc.stopAll();
        expect(timers.filter(t => !t.cleared)).to.have.length(0);
    });

    it('disabling via writeState stops the scheduler and persists', async () => {
        const { svc, calls } = makeService({ stored: { enabled: true } });
        await svc.apply(3);
        const st = await svc.writeState(3, { enabled: false });
        expect(st.enabled).to.equal(false);
        expect(calls.write[0].st.enabled).to.equal(false);
        expect(svc.getStatus(3).running).to.equal(false);
    });

    it('operator test ignores the interval and enabled flag but honors quiet hours unless forced', async () => {
        const { svc, calls } = makeService({ stored: { enabled: false }, now: at(23, 30) });
        expect((await svc.testCallout(1)).reason).to.equal('quiet-hours');
        expect((await svc.testCallout(1, { force: true })).spoke).to.equal(true);
        expect(calls.speak).to.have.length(1);
    });
});

describe('callouts: buildCalloutPrompt()', () => {
    it('asks for one in-character line within maxWords and no question', () => {
        const p = buildCalloutPrompt({ maxWords: 12 }, () => 0);
        expect(p).to.match(/ONE short sentence of at most 12 words/);
        expect(p).to.match(/Do not ask a question/);
    });

    it('an operator prompt override is used verbatim', () => {
        expect(buildCalloutPrompt({ prompt: 'Howl at the moon.' })).to.equal('Howl at the moon.');
    });
});
