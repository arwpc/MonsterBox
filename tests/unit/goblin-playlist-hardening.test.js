/**
 * The hardened playlist deploy (applyPlaylistToGoblin / deployPlaylist).
 *
 * The old deploy trusted the registry's online flag, never checked that the files
 * were on the device (a missing file is mpv exit 2 and a respawn storm), proved
 * nothing, and could interleave two command sequences on one device. Each of those
 * is pinned here against a stubbed device: no network, no data/ writes.
 */

import { expect } from 'chai';
import os from 'os';
import path from 'path';
import goblinManagerService from '../../services/goblinManagerService.js';
import { normalisePlaylistInput, DEVICE_LOOP_MODES } from '../../services/goblinPlaylistService.js';

const GoblinManager = goblinManagerService.constructor;
const GID = 'goblin-192-168-8-106';

/** A fake Goblin: /media lists `onDisk`; /queue/* mutate a fake queue; /playback-status reads it. */
function fakeDevice({ onDisk = ['reel.mp4'], storm = false } = {}) {
    const dev = { calls: [], queue: { videos: [], loopMode: 'none', playing: false }, mpv: null, spawns: 0 };
    dev.json = async (goblin, pathname, options = {}) => {
        const method = (options && options.method) || 'GET';
        const body = options && options.body ? JSON.parse(options.body) : {};
        dev.calls.push(`${method} ${pathname}`);
        if (pathname === '/media' || pathname === '/api/videos/scan') return { success: true, videos: onDisk.map(f => ({ filename: f, size: 1 })) };
        if (pathname === '/queue/stop') { dev.queue.playing = false; dev.mpv = null; return { success: true }; }
        if (pathname === '/queue/clear') { dev.queue.videos = []; return { success: true }; }
        if (pathname === '/queue/add') { dev.queue.videos.push({ filename: body.filename, playCount: 0 }); return { success: true }; }
        if (pathname === '/queue/start') {
            dev.queue.playing = true; dev.queue.loopMode = body.loopMode;
            dev.mpv = storm ? null : dev.queue.videos[0].filename;
            dev.queue.videos[0].playCount += 1;
            return { success: true };
        }
        if (pathname === '/playback-status') {
            if (storm && dev.queue.playing && dev.queue.videos.length) dev.queue.videos[0].playCount += 5; // mpv dying at spawn and being restarted
            return {
                success: true, playing: !!dev.mpv, mpvRunning: !!dev.mpv,
                currentVideo: dev.mpv ? `/home/remote/media/video/${dev.mpv}` : null,
                queue: JSON.parse(JSON.stringify(dev.queue))
            };
        }
        throw new Error(`unexpected ${pathname}`);
    };
    return dev;
}

async function managerWith(dev) {
    const m = new GoblinManager();
    m.goblinsFile = path.join(os.tmpdir(), `goblins-hardening-${process.pid}-${Date.now()}.json`);
    await new Promise(r => setTimeout(r, 50)); // init() reads the absent temp file and clears; then populate
    m.goblins = new Map([[GID, { id: GID, name: 'Goblin 2', status: 'online', endpoint: 'http://fake:3001' }]]);
    m.proofDelays = { first: 0, settle: 0 };
    m.pingGoblin = async () => { dev.calls.push('PING'); return { success: true, online: true }; };
    m._goblinJson = dev.json;
    m.getGoblinPlayback = async (id) => {
        const st = await dev.json(null, '/playback-status');
        return { success: true, goblinId: id, mpvRunning: st.mpvRunning, playing: st.playing, currentVideo: st.currentVideo ? path.basename(st.currentVideo) : null, queue: st.queue };
    };
    return m;
}

const reel = { id: 'show-goblin-2', name: 'Goblin 2 reel', videos: [{ filename: 'reel.mp4', order: 1 }], loopMode: 'queue' };

describe('Goblin playlist — input contract', function () {
    it('accepts only device loop modes', function () {
        expect(DEVICE_LOOP_MODES).to.deep.equal(['none', 'single', 'queue']);
        const r = normalisePlaylistInput({ name: 'x', goblinId: GID, videos: ['a.mp4'], loopMode: 'sequential' });
        expect(r.ok).to.equal(false);
        expect(r.error).to.match(/does not understand "sequential"/);
    });

    it('refuses names the player cannot list and relative sources', function () {
        expect(normalisePlaylistInput({ name: 'x', goblinId: GID, videos: ['sub/a.mp4'] }).ok).to.equal(false);
        expect(normalisePlaylistInput({ name: 'x', goblinId: GID, videos: ['notes.txt'] }).ok).to.equal(false);
        expect(normalisePlaylistInput({ name: 'x', goblinId: GID, videos: [] }).ok).to.equal(false);
        expect(normalisePlaylistInput({ name: 'x', goblinId: GID, videos: [{ filename: 'a.mp4', source: 'reels/a.mp4' }] }).ok).to.equal(false);
    });

    it('resolves a Goblin name to its id and defaults to loop', function () {
        const resolve = (n) => (n === 'Goblin 2' ? { success: true, id: GID } : { success: false, error: 'nope' });
        const r = normalisePlaylistInput({ name: 'x', goblinId: 'Goblin 2', videos: ['a.mp4'], role: 'show' }, { resolve });
        expect(r.ok).to.equal(true);
        expect(r.value).to.include({ goblinId: GID, loopMode: 'queue', role: 'show' });
        expect(r.value.videos[0]).to.include({ filename: 'a.mp4', order: 1 });
        expect(normalisePlaylistInput({ name: 'x', goblinId: 'Goblin 9', videos: ['a.mp4'] }, { resolve }).ok).to.equal(false);
    });
});

describe('Goblin playlist — hardened apply', function () {
    this.timeout(15000);

    it('pings first, applies, and proves it by two reads with a steady spawn count', async function () {
        const dev = fakeDevice();
        const m = await managerWith(dev);
        const r = await m.applyPlaylistToGoblin('Goblin 2', reel);
        expect(r.success, r.error).to.equal(true);
        expect(dev.calls[0]).to.equal('PING');
        expect(dev.calls).to.include('GET /media');
        expect(dev.calls.filter(c => c === 'POST /queue/start')).to.have.length(1);
        expect(r.spawns).to.equal(0);
        expect(r.reads).to.have.length(2);
        expect(r.playback.currentVideo).to.equal('reel.mp4');
    });

    it('refuses a file the device does not hold (and has no source) before touching the queue', async function () {
        const dev = fakeDevice({ onDisk: ['other.mp4'] });
        const m = await managerWith(dev);
        const r = await m.applyPlaylistToGoblin(GID, reel);
        expect(r.success).to.equal(false);
        expect(r.missing).to.deep.equal(['reel.mp4']);
        expect(dev.calls.some(c => c.startsWith('POST /queue'))).to.equal(false);
    });

    it('a start that cannot hold the display fails its proof and is stopped (no respawn storm left behind)', async function () {
        const dev = fakeDevice({ storm: true });
        const m = await managerWith(dev);
        const r = await m.applyPlaylistToGoblin(GID, reel);
        expect(r.success).to.equal(false);
        expect(r.stoppedAfterFailure).to.equal(true);
        expect(dev.calls[dev.calls.length - 1]).to.equal('POST /queue/stop');
        expect(dev.queue.playing).to.equal(false);
    });

    it('one playlist at a time per Goblin', async function () {
        const dev = fakeDevice();
        const m = await managerWith(dev);
        const [a, b] = await Promise.all([m.applyPlaylistToGoblin(GID, reel), m.applyPlaylistToGoblin(GID, reel)]);
        const results = [a, b];
        expect(results.filter(r => r.success)).to.have.length(1);
        expect(results.filter(r => r.busy)).to.have.length(1);
        expect(dev.calls.filter(c => c === 'POST /queue/start')).to.have.length(1);
    });

    it('a busy Goblin turns the keep-alive away without waiting', async function () {
        const dev = fakeDevice();
        const m = await managerWith(dev);
        let release;
        const holder = m._withGoblinLock(GID, 'test holder', () => new Promise(r => { release = r; }));
        const r = await m._withGoblinLock(GID, 'keep-alive resume', async () => ({ success: true }), { waitMs: 0 });
        expect(r.busy).to.equal(true);
        expect(r.error).to.match(/test holder/);
        release({ success: true });
        await holder;
        expect(m.busyLabel(GID)).to.equal(null);
    });
});
