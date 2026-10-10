/**
 * Goblin name resolver, keep-alive decision rules and respawn-storm detection.
 *
 * The resolver is what lets a scene or an operator say "Goblin 3" instead of an
 * IP-derived id; the one rule that matters most is that two Goblins answering to
 * the same name is an error, never a guess (a cast must not land on the wrong
 * screen). decideKeepAlive is pure, so every rule of the watchdog that STARTS video
 * on real screens is pinned here without a device.
 */

import { expect } from 'chai';
import os from 'os';
import path from 'path';
import goblinManagerService, {
    decideKeepAlive, detectRespawnStorm, goblinLooseKey, goblinNameKey,
    queueFilenames, queuePlayCount, KEEPALIVE_DEFAULTS
} from '../../services/goblinManagerService.js';

const GoblinManager = goblinManagerService.constructor;

async function freshManager(goblins) {
    const m = new GoblinManager();
    // Set synchronously: init() reads the registry only after an await, so it reads
    // this (absent) temp file, finds nothing and clears its map. Wait for that, then
    // populate. Any save goes to the temp file, never data/goblins.json.
    m.goblinsFile = path.join(os.tmpdir(), `goblins-test-${process.pid}-${Date.now()}.json`);
    m.keepAliveFile = path.join(os.tmpdir(), `goblin-keepalive-test-${process.pid}-${Date.now()}.json`);
    await new Promise(r => setTimeout(r, 50));
    m.goblins = new Map(goblins.map(g => [g.id, { status: 'online', endpoint: `http://${g.id}:3001`, capabilities: ['video'], ...g }]));
    return m;
}

describe('Goblin resolver — resolveGoblin(nameOrId)', function () {
    let m;
    before(async function () {
        m = await freshManager([
            { id: 'goblin-192-168-8-40', name: 'Goblin 1' },
            { id: 'goblin-192-168-8-106', name: 'Goblin 2' },
            { id: 'goblin-192-168-8-14', name: 'Goblin 3' }
        ]);
    });

    it('matches the exact registry id first', function () {
        const r = m.resolveGoblin('goblin-192-168-8-14');
        expect(r).to.include({ success: true, id: 'goblin-192-168-8-14', matchedBy: 'id' });
    });

    it('matches a name case-insensitively and trimmed', function () {
        const r = m.resolveGoblin('  goblin 2 ');
        expect(r).to.include({ success: true, id: 'goblin-192-168-8-106', matchedBy: 'name' });
    });

    it('matches the hostname form (spaces and punctuation ignored)', function () {
        expect(m.resolveGoblin('goblin3')).to.include({ success: true, id: 'goblin-192-168-8-14', matchedBy: 'loose-name' });
        expect(m.resolveGoblin('GOBLIN-1')).to.include({ success: true, id: 'goblin-192-168-8-40' });
    });

    it('accepts an object with id or name', function () {
        expect(m.resolveGoblin({ name: 'Goblin 1' }).id).to.equal('goblin-192-168-8-40');
        expect(m.resolveGoblin({ id: 'goblin-192-168-8-106' }).id).to.equal('goblin-192-168-8-106');
    });

    it('reports not found, and an empty input, without guessing', function () {
        expect(m.resolveGoblin('Goblin 9')).to.include({ success: false, notFound: true });
        expect(m.resolveGoblin('')).to.include({ success: false, notFound: true });
        expect(m.resolveGoblin(null)).to.include({ success: false });
    });

    it('refuses an ambiguous name and lists the candidates', function () {
        m.goblins.set('goblin-x', { id: 'goblin-x', name: 'goblin 3', status: 'online', endpoint: 'http://x:3001' });
        try {
            const r = m.resolveGoblin('Goblin 3');
            expect(r.success).to.equal(false);
            expect(r.ambiguous).to.equal(true);
            expect(r.candidates.map(c => c.id)).to.have.members(['goblin-192-168-8-14', 'goblin-x']);
            // The exact id still wins over an ambiguous name.
            expect(m.resolveGoblin('goblin-x').success).to.equal(true);
        } finally {
            m.goblins.delete('goblin-x');
        }
    });

    it('getGoblin accepts a name (the scene executor looks Goblins up through it)', async function () {
        const r = await m.getGoblin('Goblin 3');
        expect(r.success).to.equal(true);
        expect(r.goblin.id).to.equal('goblin-192-168-8-14');
    });

    it('key helpers', function () {
        expect(goblinNameKey(' Goblin 1 ')).to.equal('goblin 1');
        expect(goblinLooseKey('Goblin 1')).to.equal('goblin1');
    });
});

describe('Goblin keep-alive — respawn storm and queue helpers', function () {
    it('counts the device queue', function () {
        const q = { videos: [{ filename: '/home/remote/media/video/a.mp4', playCount: 3 }, { filename: 'b.mp4', playCount: 2 }] };
        expect(queueFilenames(q)).to.deep.equal(['a.mp4', 'b.mp4']);
        expect(queuePlayCount(q)).to.equal(5);
        expect(queueFilenames(null)).to.deep.equal([]);
    });

    it('flags many spawns in a short time as a storm (Goblin 3: 42,680 spawns of a 6 s clip)', function () {
        expect(detectRespawnStorm({ playCount: 100 }, { playCount: 115 }, 30000)).to.equal(true);
    });

    it('does not flag a healthy loop or a real multi-clip queue', function () {
        expect(detectRespawnStorm({ playCount: 1 }, { playCount: 1 }, 30000)).to.equal(false);
        expect(detectRespawnStorm({ playCount: 10 }, { playCount: 12 }, 30000)).to.equal(false);
        expect(detectRespawnStorm({ playCount: 10 }, { playCount: 14 }, 60000)).to.equal(false);
        expect(detectRespawnStorm(null, { playCount: 14 }, 60000)).to.equal(false);
    });
});

describe('Goblin keep-alive — decideKeepAlive rules', function () {
    const now = 10_000_000;
    const cfg = { ...KEEPALIVE_DEFAULTS, enabled: true };
    const stoppedObs = { videos: ['reel.mp4'], loopMode: 'queue', playing: true, mpvRunning: false, currentVideo: null, playCount: 1 };
    const playlist = { filenames: ['reel.mp4'], loopMode: 'queue' };
    const decide = (over = {}) => decideKeepAlive({ goblin: {}, obs: stoppedObs, mem: {}, playlist, now, config: cfg, ...over });

    it('does nothing while the screen is playing', function () {
        expect(decide({ obs: { ...stoppedObs, mpvRunning: true, currentVideo: 'reel.mp4' } }).action).to.equal('none');
    });

    it('resumes a non-empty queue that is down, after two looks', function () {
        expect(decide({ mem: { stoppedSince: now } }).reason).to.match(/confirming/);
        const d = decide({ mem: { stoppedSince: now - cfg.stoppedDebounceMs - 1 } });
        expect(d.action).to.equal('resume');
    });

    it('holds a screen a Stop put dark (queue flag down) for stopHoldMs from the first look', function () {
        const obs = { ...stoppedObs, playing: false };
        const held = decide({ obs, mem: { stoppedSince: now - 60000 } });
        expect(held.action).to.equal('none');
        expect(held.reason).to.match(/held after a stop/);
        const after = decide({ obs, mem: { stoppedSince: now - cfg.stopHoldMs - 1 } });
        expect(after.action).to.equal('resume');
    });

    it('a Stop from this node that asked for no hold may be resumed after the debounce', function () {
        const obs = { ...stoppedObs, playing: false };
        expect(decide({ obs, mem: { lastStopNoHold: true, stoppedSince: now - cfg.stoppedDebounceMs - 1 } }).action).to.equal('resume');
    });

    it('applies the staged playlist to an empty queue (a blank screen)', function () {
        const d = decide({ obs: { ...stoppedObs, videos: [], loopMode: 'none', playing: false } });
        expect(d.action).to.equal('apply-playlist');
        expect(decide({ obs: { ...stoppedObs, videos: [] }, playlist: null }).action).to.equal('none');
    });

    it('applies the staged playlist when a Goblin comes back with a different queue, even while playing', function () {
        const obs = { ...stoppedObs, videos: ['Hugeskelly.mp4'], mpvRunning: true, currentVideo: 'Hugeskelly.mp4' };
        expect(decide({ obs, mem: { pendingReturn: true } }).action).to.equal('apply-playlist');
        // Same queue on return: nothing to apply, and it is playing.
        expect(decide({ obs: { ...stoppedObs, mpvRunning: true, currentVideo: 'reel.mp4' }, mem: { pendingReturn: true } }).action).to.equal('none');
    });

    it('never fires twice within a minute on one Goblin', function () {
        const d = decide({ mem: { stoppedSince: now - 120000, lastOpAt: now - 30000 } });
        expect(d.action).to.equal('none');
        expect(d.reason).to.match(/less than a minute/);
    });

    it('stays off a cast in flight, and right after a cast started', function () {
        const castObs = { ...stoppedObs, playing: false, mpvRunning: true, currentVideo: 'Moon.mp4' };
        expect(decide({ obs: castObs, mem: { cast: { filename: 'Moon.mp4', startedAt: now - 60000 } } }).reason).to.equal('cast in flight');
        expect(decide({ mem: { stoppedSince: now - 120000, cast: { filename: 'Moon.mp4', startedAt: now - 5000 } } }).reason).to.equal('cast just started');
    });

    it('stands down on busy, storm, attention, backoff, offline and expected-offline Goblins', function () {
        const base = { stoppedSince: now - 120000 };
        expect(decide({ mem: { ...base, busy: 'playlist' } }).action).to.equal('none');
        expect(decide({ mem: { ...base, stormSuspected: true } }).action).to.equal('none');
        expect(decide({ mem: { ...base, needsAttention: 'x' } }).action).to.equal('none');
        expect(decide({ mem: { ...base, backoffUntil: now + 1000 } }).action).to.equal('none');
        expect(decide({ mem: { ...base, holdUntil: now + 1000 } }).action).to.equal('none');
        expect(decide({ obs: null, mem: base }).action).to.equal('none');
        expect(decide({ goblin: { expectedOffline: true }, mem: base }).action).to.equal('none');
        expect(decide({ goblin: { keepAliveDisabled: true }, mem: base }).action).to.equal('none');
    });
});

describe('Goblin keep-alive — which node runs it', function () {
    let m;
    let savedEnv;
    before(async function () {
        m = await freshManager([]);
        savedEnv = process.env.MB_GOBLIN_KEEPALIVE;
        delete process.env.MB_GOBLIN_KEEPALIVE;
    });
    after(function () {
        if (savedEnv === undefined) delete process.env.MB_GOBLIN_KEEPALIVE; else process.env.MB_GOBLIN_KEEPALIVE = savedEnv;
    });

    it('runs only on the controller host named in the config', function () {
        m.keepAlive.config = { ...KEEPALIVE_DEFAULTS, enabled: true, controllerHost: os.hostname() };
        expect(m.keepAliveRole().run).to.equal(true);
        m.keepAlive.config = { ...KEEPALIVE_DEFAULTS, enabled: true, controllerHost: 'some-other-node' };
        expect(m.keepAliveRole().run).to.equal(false);
        m.keepAlive.config = { ...KEEPALIVE_DEFAULTS, enabled: false, controllerHost: os.hostname() };
        expect(m.keepAliveRole().run).to.equal(false);
    });

    it('MB_GOBLIN_KEEPALIVE overrides the file', function () {
        m.keepAlive.config = { ...KEEPALIVE_DEFAULTS, enabled: true, controllerHost: os.hostname() };
        process.env.MB_GOBLIN_KEEPALIVE = 'off';
        expect(m.keepAliveRole().run).to.equal(false);
        delete process.env.MB_GOBLIN_KEEPALIVE;
    });
});

describe('Goblin keep-alive — stop bookkeeping survives a restart', function () {
    it('restores a no-hold Stop, a live hold and when the screen was first seen dark', async function () {
        const a = await freshManager([{ id: 'g2', name: 'Goblin 2' }, { id: 'g3', name: 'Goblin 3' }]);
        a.keepAliveStateFile = path.join(os.tmpdir(), `goblin-ka-state-${process.pid}-${Date.now()}.json`);
        const t = Date.now() - 120000;
        a._kaMem('g3').stoppedSince = t;
        a._lastStop = new Map([['g3', { at: t, holdMs: 0 }]]);
        a._lastOp.set('g3', { at: t, kind: 'stop' });
        a.holdKeepAlive('g2', 5 * 60000, 'operator stop');
        const { writeJsonAtomic } = await import('../../services/atomicStore.js');
        await writeJsonAtomic(a.keepAliveStateFile, a.keepAliveStateSnapshot());

        const b = await freshManager([{ id: 'g2', name: 'Goblin 2' }, { id: 'g3', name: 'Goblin 3' }]);
        b.keepAliveStateFile = a.keepAliveStateFile;
        expect(await b.restoreKeepAliveState()).to.equal(2);
        expect(b._kaMem('g3').stoppedSince).to.equal(t);
        expect(b._lastStop.get('g3')).to.deep.equal({ at: t, holdMs: 0 });
        expect(b._lastOp.get('g3').kind).to.equal('stop');
        expect(b._holds.get('g2').until).to.be.greaterThan(Date.now());
    });
});
