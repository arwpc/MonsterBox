/**
 * Mission D1 (2026-10 castle tuning): serverPlaybackService persistent players.
 *
 * - one player per session (owner): a browser tab can never stop the headless
 *   agent's speech;
 * - stops drain (finish what the player holds) unless they are interruptions;
 * - chunks reach the player in call order, with and without a known device.
 *
 * pw-play is replaced by a fake child process through the injectable `_spawn`;
 * no sound server is touched.
 */

import { expect } from 'chai';
import { EventEmitter } from 'events';
import playback from '../../services/serverPlaybackService.js';

class FakeStdin extends EventEmitter {
    constructor() { super(); this.chunks = []; this.ended = false; }
    write(buf) { if (this.ended) throw new Error('write after end'); this.chunks.push(Buffer.from(buf)); return true; }
    end() { this.ended = true; }
}
class FakeProc extends EventEmitter {
    constructor(args) {
        super();
        this.args = args; this.stdin = new FakeStdin(); this.stderr = new EventEmitter();
        this.killed = false; this.exitCode = null; this.signalCode = null; this.signals = [];
    }
    kill(sig) { this.signals.push(sig); this.killed = true; this.signalCode = sig; setImmediate(() => this.emit('exit', null, sig)); return true; }
    exitNormally() { this.exitCode = 0; this.emit('exit', 0, null); }
}

describe('Playback D1: owner-keyed persistent players, drain, ordering', () => {
    const CHAR = 992;
    let procs, saved;

    beforeEach(() => {
        procs = [];
        saved = { spawn: playback._spawn, avail: playback._pwplayAvailable, raw: playback._pwplayRaw, muted: playback._speakerMuted, resolve: playback._resolveDeviceId };
        playback._spawn = (cmd, args) => { const p = new FakeProc(args); p.cmd = cmd; procs.push(p); return p; };
        playback._pwplayAvailable = true;
        playback._pwplayRaw = false;
        playback._speakerMuted = false; // field only: never persisted by this test
    });

    afterEach(async () => {
        await playback.stopPcmStream({ characterId: CHAR });
        for (const rec of [...playback._draining]) if (rec.characterKey === String(CHAR)) playback._draining.delete(rec);
        playback._spawn = saved.spawn; playback._pwplayAvailable = saved.avail; playback._pwplayRaw = saved.raw;
        playback._speakerMuted = saved.muted; playback._resolveDeviceId = saved.resolve;
    });

    const buf = (n, fill) => Buffer.alloc(n, fill);

    it('two sessions of one character get two players; stopping one leaves the other', async () => {
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'headless', deviceId: 'sink' });
        await playback.writePcmStream(buf(320, 2), { characterId: CHAR, owner: 'browser', deviceId: 'sink' });
        expect(procs).to.have.length(2);
        await playback.stopPcmStream({ characterId: CHAR, owner: 'browser' });
        expect(procs[1].killed).to.equal(true);
        expect(procs[0].killed).to.equal(false);
        // The headless player keeps receiving audio.
        await playback.writePcmStream(buf(320, 3), { characterId: CHAR, owner: 'headless', deviceId: 'sink' });
        expect(procs).to.have.length(2);
        expect(procs[0].stdin.chunks).to.have.length(2);
    });

    it('a drained stop ends input but does not kill; the player finishes on its own', async () => {
        await playback.writePcmStream(buf(32000, 1), { characterId: CHAR, owner: 's1', deviceId: 'sink' });
        await playback.stopPcmStream({ characterId: CHAR, owner: 's1', drain: true });
        const p = procs[0];
        expect(p.stdin.ended).to.equal(true);
        expect(p.killed).to.equal(false);
        expect(playback.getPlaybackHorizon({ characterId: CHAR })).to.be.greaterThan(Date.now());
        p.exitNormally();
        expect([...playback._draining].some(r => r.proc === p)).to.equal(false);
    });

    it('a new write after a drained stop opens a fresh player instead of writing into the closing one', async () => {
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 's1', deviceId: 'sink' });
        await playback.stopPcmStream({ characterId: CHAR, owner: 's1', drain: true });
        await playback.writePcmStream(buf(320, 2), { characterId: CHAR, owner: 's1', deviceId: 'sink' });
        expect(procs).to.have.length(2);
        expect(procs[0].stdin.chunks).to.have.length(1);
    });

    it('an interruption kills only that owner, including a player that was draining', async () => {
        await playback.writePcmStream(buf(32000, 1), { characterId: CHAR, owner: 'a', deviceId: 'sink' });
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'b', deviceId: 'sink' });
        await playback.stopPcmStream({ characterId: CHAR, owner: 'a', drain: true });
        await playback.interruptPlayback({ characterId: CHAR, owner: 'a' });
        expect(procs[0].killed).to.equal(true);
        expect(procs[1].killed).to.equal(false);
    });

    it('a stop with no owner still stops everything the character has (historical contract)', async () => {
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'a', deviceId: 'sink' });
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'b', deviceId: 'sink' });
        await playback.stopStream({ characterId: CHAR });
        expect(procs.every(p => p.killed)).to.equal(true);
    });

    it('known device: writes reach stdin synchronously, in call order', () => {
        for (let i = 0; i < 8; i++) playback.writePcmStream(buf(100, i), { characterId: CHAR, owner: 'o', deviceId: 'sink' });
        expect(procs[0].stdin.chunks.map(c => c[0])).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('unknown device: un-awaited writes still play in call order despite uneven resolution delays', async () => {
        let n = 0;
        playback._resolveDeviceId = async () => { const d = [30, 0, 15, 5, 0, 20][n++ % 6]; await new Promise(r => setTimeout(r, d)); return 'sink'; };
        const writes = [];
        for (let i = 0; i < 6; i++) writes.push(playback.writePcmStream(buf(100, i), { characterId: CHAR, owner: 'legacy' }));
        await Promise.all(writes);
        expect(procs[0].stdin.chunks.map(c => c[0])).to.deep.equal([0, 1, 2, 3, 4, 5]);
    });

    it('reports the modelled start and end of each chunk (for latency and echo prediction)', async () => {
        const r1 = await playback.writePcmStream(buf(32000, 1), { characterId: CHAR, owner: 'o', deviceId: 'sink', sampleRate: 16000 });
        const r2 = await playback.writePcmStream(buf(16000, 1), { characterId: CHAR, owner: 'o', deviceId: 'sink', sampleRate: 16000 });
        expect(r1.coldStart).to.equal(true);
        expect(r2.coldStart).to.equal(false);
        expect(r2.startsAtMs).to.be.closeTo(r1.playsUntilMs, 1);
        expect(r2.playsUntilMs - r2.startsAtMs).to.be.closeTo(500, 1);
    });

    it('a player that fails to spawn is reported, not thrown (no unhandled error event)', async () => {
        await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'x', deviceId: 'sink' });
        expect(() => procs[0].emit('error', new Error('spawn pw-play ENOENT'))).to.not.throw();
        const r = await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'x', deviceId: 'sink' });
        expect(r.success).to.equal(true);
        expect(procs).to.have.length(2);
    });

    it('muted: nothing is spawned and the write says so', async () => {
        playback._speakerMuted = true;
        const r = await playback.writePcmStream(buf(320, 1), { characterId: CHAR, owner: 'm', deviceId: 'sink' });
        expect(r).to.include({ success: true, muted: true });
        expect(procs).to.have.length(0);
    });
});
