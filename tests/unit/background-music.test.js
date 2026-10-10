/**
 * Background music supervisor — decision logic, quiet hours, rotation, and the
 * pause/resume contract that keeps music from ever fighting the AI.
 *
 * Everything here is in-memory with injected probes: no audio is played, no
 * file is written, no process is spawned.
 */

import { expect } from 'chai';
import {
    shouldPlay,
    isInQuietHours,
    normalizeConfig,
    validateConfig,
    TrackRotation,
    BackgroundMusicSupervisor,
    DEFAULTS
} from '../../services/backgroundMusicService.js';
import audioLoopService, { isLoopDead } from '../../services/audioLoopService.js';
import serverPlaybackService from '../../services/serverPlaybackService.js';

const at = (hh, mm) => new Date(2026, 9, 4, hh, mm, 0);

describe('backgroundMusic: shouldPlay()', () => {
    const base = { enabled: true, hasTracks: true, msSinceBlocked: Infinity, resumeDelayMs: 5000 };

    it('plays when enabled, has tracks and nothing blocks', () => {
        expect(shouldPlay(base)).to.deep.equal({ play: true, reason: 'playing' });
    });

    it('never plays when disabled or with no tracks', () => {
        expect(shouldPlay({ ...base, enabled: false }).reason).to.equal('disabled');
        expect(shouldPlay({ ...base, hasTracks: false }).reason).to.equal('no-tracks');
        expect(shouldPlay({}).play).to.equal(false);
    });

    it('pauses for an active conversation, a scene queue, other audio, mute and quiet hours', () => {
        expect(shouldPlay({ ...base, conversationActive: true })).to.deep.equal({ play: false, reason: 'conversation' });
        expect(shouldPlay({ ...base, queueRunning: true })).to.deep.equal({ play: false, reason: 'scene-queue' });
        expect(shouldPlay({ ...base, otherAudioActive: true })).to.deep.equal({ play: false, reason: 'other-audio' });
        expect(shouldPlay({ ...base, muted: true })).to.deep.equal({ play: false, reason: 'muted' });
        expect(shouldPlay({ ...base, inQuietHours: true })).to.deep.equal({ play: false, reason: 'quiet-hours' });
    });

    it('waits resumeDelayMs after the last block before resuming', () => {
        expect(shouldPlay({ ...base, msSinceBlocked: 4999 }).reason).to.equal('resume-delay');
        expect(shouldPlay({ ...base, msSinceBlocked: 5000 }).play).to.equal(true);
        expect(shouldPlay({ ...base, msSinceBlocked: 100, resumeDelayMs: 0 }).play).to.equal(true);
    });
});

describe('backgroundMusic: isInQuietHours()', () => {
    it('handles a same-day window', () => {
        const qh = { start: '13:00', end: '15:30' };
        expect(isInQuietHours(qh, at(12, 59))).to.equal(false);
        expect(isInQuietHours(qh, at(13, 0))).to.equal(true);
        expect(isInQuietHours(qh, at(15, 29))).to.equal(true);
        expect(isInQuietHours(qh, at(15, 30))).to.equal(false);
    });

    it('handles a window that wraps midnight', () => {
        const qh = { start: '22:00', end: '07:00' };
        expect(isInQuietHours(qh, at(21, 59))).to.equal(false);
        expect(isInQuietHours(qh, at(22, 0))).to.equal(true);
        expect(isInQuietHours(qh, at(23, 59))).to.equal(true);
        expect(isInQuietHours(qh, at(0, 0))).to.equal(true);
        expect(isInQuietHours(qh, at(6, 59))).to.equal(true);
        expect(isInQuietHours(qh, at(7, 0))).to.equal(false);
        expect(isInQuietHours(qh, at(12, 0))).to.equal(false);
    });

    it('treats null, malformed, and start===end as no quiet hours', () => {
        expect(isInQuietHours(null, at(3, 0))).to.equal(false);
        expect(isInQuietHours({ start: '25:00', end: '07:00' }, at(3, 0))).to.equal(false);
        expect(isInQuietHours({ start: '08:00', end: '08:00' }, at(8, 0))).to.equal(false);
    });
});

describe('backgroundMusic: config normalization + validation', () => {
    it('fills defaults for a missing block', () => {
        expect(normalizeConfig(undefined)).to.deep.equal({ ...DEFAULTS, tracks: [] });
        expect(normalizeConfig(undefined).volume).to.equal(35);
        expect(normalizeConfig(undefined).resumeDelayMs).to.equal(5000);
    });

    it('clamps volume, stringifies tracks, drops bad quiet hours', () => {
        const cfg = normalizeConfig({ enabled: true, volume: 250, tracks: ['a', 7, '', null], quietHours: { start: 'x', end: '07:00' } });
        expect(cfg.volume).to.equal(100);
        expect(cfg.tracks).to.deep.equal(['a', '7']);
        expect(cfg.quietHours).to.equal(null);
    });

    it('rejects wrong types and accepts a valid body', () => {
        expect(validateConfig({ enabled: 'yes' })).to.have.length(1);
        expect(validateConfig({ volume: 101 })).to.have.length(1);
        expect(validateConfig({ quietHours: { start: '22:00' } })).to.have.length(1);
        expect(validateConfig([])).to.have.length(1);
        expect(validateConfig({ enabled: true, tracks: ['a'], volume: 35, shuffle: true, resumeDelayMs: 5000, quietHours: { start: '22:00', end: '07:00' } })).to.deep.equal([]);
        expect(validateConfig({ quietHours: null })).to.deep.equal([]);
    });
});

describe('backgroundMusic: TrackRotation', () => {
    it('plays each track once per cycle in order, then wraps', () => {
        const r = new TrackRotation(['a', 'b', 'c']);
        const seen = [r.current()];
        for (let i = 0; i < 5; i++) seen.push(r.advance());
        expect(seen).to.deep.equal(['a', 'b', 'c', 'a', 'b', 'c']);
    });

    it('shuffles every track exactly once per cycle and never repeats across the cycle boundary', () => {
        let seed = 42;
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const r = new TrackRotation(['a', 'b', 'c', 'd'], { shuffle: true, random });
        let prev = null;
        for (let cycle = 0; cycle < 25; cycle++) {
            const order = [];
            for (let i = 0; i < 4; i++) {
                const cur = r.current();
                expect(cur).to.not.equal(prev);
                order.push(cur);
                prev = cur;
                r.advance();
            }
            expect(order.slice().sort()).to.deep.equal(['a', 'b', 'c', 'd']);
        }
    });

    it('returns null when empty and resets when the track list changes', () => {
        const r = new TrackRotation([]);
        expect(r.current()).to.equal(null);
        expect(r.advance()).to.equal(null);
        r.setTracks(['x', 'y'], false);
        r.advance();
        expect(r.current()).to.equal('y');
        r.setTracks(['x', 'y'], false); // unchanged list keeps position
        expect(r.current()).to.equal('y');
        r.setTracks(['z'], false);
        expect(r.current()).to.equal('z');
    });
});

function makeHarness(configOverrides = {}) {
    const h = {
        now: 1_000_000,
        probe: { muted: false, conversationActive: false, queueRunning: false, otherAudioUntil: 0 },
        config: { enabled: true, tracks: ['t1', 't2'], volume: 35, resumeDelayMs: 5000, quietHours: null, ...configOverrides },
        plays: [],
        handles: []
    };
    h.deps = {
        now: () => h.now,
        readConfig: async () => h.config,
        probe: async () => ({ ...h.probe }),
        resolveTrack: async (id) => ({ file: `/fake/${id}.mp3`, title: id }),
        resolveDevice: async () => 'default',
        play: async (file, opts) => {
            let resolveDone;
            const handle = {
                file,
                opts,
                startedAt: h.now,
                stopped: false,
                done: new Promise(r => { resolveDone = r; }),
                stop() { handle.stopped = true; resolveDone({ code: 0, stoppedByOwner: true }); },
                end(result) { resolveDone({ stoppedByOwner: false, ...result }); }
            };
            h.plays.push({ file, opts });
            h.handles.push(handle);
            return handle;
        }
    };
    h.sup = new BackgroundMusicSupervisor(3, h.deps);
    h.sup._stopped = false; // drive tick() by hand — no interval timer in tests
    h.flush = () => new Promise(r => setImmediate(r));
    return h;
}

describe('backgroundMusic: supervisor', () => {
    it('starts the first track at the configured volume once nothing blocks', async () => {
        const h = makeHarness();
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
        expect(h.plays[0].file).to.equal('/fake/t1.mp3');
        expect(h.plays[0].opts.volume).to.equal(35);
        expect(h.plays[0].opts.offsetMs).to.equal(0);
    });

    it('PAUSES during a conversation and resumes the same track at its offset after resumeDelayMs', async () => {
        const h = makeHarness();
        await h.sup.tick();
        h.now += 30000; // 30 s into t1

        h.probe.conversationActive = true;
        await h.sup.tick();
        expect(h.handles[0].stopped).to.equal(true);
        expect(h.sup.getStatus().playing).to.equal(false);

        h.now += 20000;
        await h.sup.tick(); // still talking
        expect(h.plays).to.have.length(1);

        h.probe.conversationActive = false;
        h.now += 1500;
        await h.sup.tick(); // inside resume delay
        expect(h.plays).to.have.length(1);
        expect(h.sup.getStatus().state).to.equal('resume-delay');

        h.now += 5000;
        await h.sup.tick();
        expect(h.plays).to.have.length(2);
        expect(h.plays[1].file).to.equal('/fake/t1.mp3');
        expect(h.plays[1].opts.offsetMs).to.equal(30000);
    });

    it('pauses for a running scene queue and for other speaker playback', async () => {
        const h = makeHarness();
        h.probe.queueRunning = true;
        await h.sup.tick();
        expect(h.plays).to.have.length(0);
        expect(h.sup.getStatus().state).to.equal('scene-queue');

        h.probe.queueRunning = false;
        h.now += 6000;
        h.probe.otherAudioUntil = h.now + 3000; // a say/TTS clip is on the speaker
        await h.sup.tick();
        expect(h.plays).to.have.length(0);
        expect(h.sup.getStatus().state).to.equal('other-audio');

        h.now += 4000; // clip ended 1 s ago: still inside the resume delay
        await h.sup.tick();
        expect(h.plays).to.have.length(0);
        expect(h.sup.getStatus().state).to.equal('resume-delay');

        h.now += 5000;
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
    });

    it('advances to the next track when one ends naturally', async () => {
        const h = makeHarness();
        await h.sup.tick();
        h.now += 180000;
        h.handles[0].end({ code: 0 });
        await h.flush();
        await h.sup.tick();
        expect(h.plays.map(p => p.file)).to.deep.equal(['/fake/t1.mp3', '/fake/t2.mp3']);
        expect(h.plays[1].opts.offsetMs).to.equal(0);
    });

    it('skips a track that dies on arrival instead of retry-storming it', async () => {
        const h = makeHarness();
        await h.sup.tick();
        h.now += 200;
        h.handles[0].end({ code: 1 });
        await h.flush();
        await h.sup.tick();
        expect(h.plays[1].file).to.equal('/fake/t2.mp3');
    });

    it('stays silent during quiet hours', async () => {
        const h = makeHarness({ quietHours: { start: '00:00', end: '23:59' } });
        h.now = at(12, 0).getTime();
        h.sup._lastBlockedAt = 0;
        await h.sup.tick();
        expect(h.plays).to.have.length(0);
        expect(h.sup.getStatus().state).to.equal('quiet-hours');
    });

    it('stop() kills only its own handle', async () => {
        const h = makeHarness();
        await h.sup.tick();
        h.sup.stop();
        expect(h.handles[0].stopped).to.equal(true);
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
    });
});

describe('audioLoopService: own-only stop + dead pw-play detection', () => {
    it('treats a loop whose pw-play died as dead even while ffmpeg runs', () => {
        const alive = { killed: false, exitCode: null };
        expect(isLoopDead({ process: alive, pwplay: alive })).to.equal(false);
        expect(isLoopDead({ process: alive, pwplay: { killed: false, exitCode: 0 } })).to.equal(true);
        expect(isLoopDead({ process: { killed: true, exitCode: null }, pwplay: alive })).to.equal(true);
        expect(isLoopDead({ simulated: true, process: alive })).to.equal(false);
    });

    it('stopLoop(id, {ownOnly:true}) never calls the node-wide stopForCharacter pkill', async () => {
        const original = serverPlaybackService.stopForCharacter;
        let calls = 0;
        serverPlaybackService.stopForCharacter = async () => { calls += 1; return { success: true }; };
        try {
            const kills = [];
            const proc = (name) => ({ killed: false, exitCode: null, kill: (sig) => kills.push(`${name}:${sig}`) });
            audioLoopService._loops.set('bgm-test', { process: proc('ff'), pwplay: proc('pw'), startTime: Date.now() });
            await audioLoopService.stopLoop('bgm-test', { ownOnly: true });
            expect(calls).to.equal(0);
            expect(kills).to.include('ff:SIGTERM');
            expect(kills).to.include('pw:SIGTERM');
            expect(audioLoopService.hasActiveLoop('bgm-test')).to.equal(false);

            // Historical behaviour preserved for existing callers.
            audioLoopService._loops.set('bgm-test', { process: proc('ff'), pwplay: proc('pw'), startTime: Date.now() });
            await audioLoopService.stopLoop('bgm-test');
            expect(calls).to.equal(1);
        } finally {
            serverPlaybackService.stopForCharacter = original;
            audioLoopService._loops.delete('bgm-test');
        }
    });

    it('playTrack() in test mode spawns nothing and resolves done on stop()', async () => {
        const prev = process.env.MB_TEST_MODE;
        process.env.MB_TEST_MODE = '1';
        try {
            const handle = audioLoopService.playTrack('/nonexistent.mp3', { volume: 35 });
            expect(handle.pids).to.deep.equal([]);
            handle.stop();
            const result = await handle.done;
            expect(result.stoppedByOwner).to.equal(true);
        } finally {
            if (prev === undefined) delete process.env.MB_TEST_MODE; else process.env.MB_TEST_MODE = prev;
        }
    });
});

describe('backgroundMusic: lurk state gate and operator pause (decision D3)', () => {
    it('plays while lurking, pauses on a wake, resumes at the offset after lurking returns', async () => {
        const h = makeHarness();
        h.probe.lurkState = 'lurking';
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
        h.now += 20000;
        h.probe.lurkState = 'awake';
        await h.sup.tick();
        expect(h.handles[0].stopped).to.equal(true);
        expect(h.sup.getStatus().state).to.equal('awake');
        h.now += 60000;
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
        h.probe.lurkState = 'lurking';
        h.now += 1000;
        await h.sup.tick(); // the resume delay still runs after a wake
        expect(h.plays).to.have.length(1);
        h.now += 6000;
        await h.sup.tick();
        expect(h.plays).to.have.length(2);
        expect(h.plays[1].opts.offsetMs).to.equal(20000);
    });

    it('a fleet event hold or Lurk OFF keeps it silent', async () => {
        const h = makeHarness();
        h.probe.lurkState = 'event';
        await h.sup.tick();
        expect(h.plays).to.have.length(0);
        expect(h.sup.getStatus().state).to.equal('event-hold');
        h.probe.lurkState = 'off';
        await h.sup.tick();
        expect(h.sup.getStatus().state).to.equal('not-lurking');
    });

    it('Stop-All pauses without destroying the supervisor; resume() brings it back', async () => {
        const h = makeHarness();
        h.probe.lurkState = 'lurking';
        await h.sup.tick();
        h.now += 10000;
        h.sup.pause('stop-all');
        expect(h.handles[0].stopped).to.equal(true);
        h.now += 60000;
        await h.sup.tick();
        expect(h.plays).to.have.length(1);
        expect(h.sup.getStatus()).to.include({ paused: true, state: 'paused' });
        h.sup.resume();
        h.now += 6000;
        await h.sup.tick();
        expect(h.plays).to.have.length(2);
        expect(h.plays[1].opts.offsetMs).to.equal(10000);
    });
});
