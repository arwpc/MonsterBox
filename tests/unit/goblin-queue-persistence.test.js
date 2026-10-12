/**
 * The Goblin player's queue survives a power cut.
 *
 * Goblins lose power without a shutdown. queue.json used to be written in place, and a file
 * caught mid-write failed JSON.parse on the next boot and was overwritten with an EMPTY queue,
 * so the unit booted dark until a controller re-sent its show (Goblins 2 and 3, 2026-10-10/11).
 * Pinned here against a temp dir: no device, no mpv.
 */

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const QueueManager = require('../../goblin/src/queueManager.js');

const settle = () => new Promise(resolve => setTimeout(resolve, 200));

describe('Goblin queue persistence (power-cut safety)', function () {
    let baseDir;
    let mediaRoot;
    const make = () => new QueueManager({ mediaRoot, stop: async () => {}, play: async () => {} }, { baseDir });
    const writeJson = (name, obj) => fs.writeFileSync(path.join(baseDir, name), JSON.stringify(obj));
    const readJson = name => JSON.parse(fs.readFileSync(path.join(baseDir, name), 'utf8'));

    beforeEach(function () {
        baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'goblin-q-'));
        mediaRoot = path.join(baseDir, 'media');
        fs.mkdirSync(mediaRoot);
    });

    afterEach(function () {
        fs.rmSync(baseDir, { recursive: true, force: true });
    });

    it('keeps an intact queue.json as-is, including a deliberate stop', async function () {
        writeJson('queue.json', { videos: [{ id: '1', filename: 'a.mp4', playCount: 3 }], currentIndex: 0, loopMode: 'single', playing: false });
        const q = make();
        await q.load();
        expect(q.queue.videos.map(v => v.filename)).to.deep.equal(['a.mp4']);
        expect(q.queue.loopMode).to.equal('single');
        expect(q.queue.playing).to.equal(false);
    });

    it('restores the show from show.json when queue.json is truncated', async function () {
        fs.writeFileSync(path.join(baseDir, 'queue.json'), '');
        writeJson('show.json', { videos: [{ id: '1', filename: 'reel-goblin2-window.mp4', playCount: 9 }], loopMode: 'queue' });
        const q = make();
        await q.load();
        expect(q.queue.videos.map(v => v.filename)).to.deep.equal(['reel-goblin2-window.mp4']);
        expect(q.queue.playing).to.equal(true);
        await settle();
        expect(readJson('queue.json').videos).to.have.length(1);
    });

    it('restores the show when queue.json was saved empty', async function () {
        writeJson('queue.json', { videos: [], currentIndex: 0, loopMode: 'none', playing: false });
        writeJson('show.json', { videos: [{ id: '1', filename: 'Greenskull.mp4' }], loopMode: 'queue' });
        const q = make();
        await q.load();
        expect(q.queue.videos.map(v => v.filename)).to.deep.equal(['Greenskull.mp4']);
        expect(q.queue.loopMode).to.equal('queue');
    });

    it('with nothing to restore, queues the unit reel(s) ahead of loose clips', async function () {
        for (const f of ['Moon.mp4', 'reel-goblin3-roof-strip.mp4', 'notes.txt']) fs.writeFileSync(path.join(mediaRoot, f), 'x');
        const q = make();
        await q.load();
        expect(q.queue.videos.map(v => v.filename)).to.deep.equal(['reel-goblin3-roof-strip.mp4']);
        expect(q.queue.loopMode).to.equal('queue');
        expect(q.queue.playing).to.equal(true);
    });

    it('with no reel and nothing to restore, queues every local clip', async function () {
        for (const f of ['b.mp4', 'a.mkv']) fs.writeFileSync(path.join(mediaRoot, f), 'x');
        const q = make();
        await q.load();
        expect(q.queue.videos.map(v => v.filename)).to.deep.equal(['a.mkv', 'b.mp4']);
    });

    it('writes atomically and records the line-up in show.json', async function () {
        const q = make();
        await q.load();
        await q.add('reel.mp4');
        await settle();
        expect(readJson('queue.json').videos.map(v => v.filename)).to.deep.equal(['reel.mp4']);
        expect(readJson('show.json').videos.map(v => v.filename)).to.deep.equal(['reel.mp4']);
        expect(fs.existsSync(path.join(baseDir, 'queue.json.tmp'))).to.equal(false);
    });

    it('a clear does not erase the remembered show', async function () {
        const q = make();
        await q.load();
        await q.add('reel.mp4');
        await settle();
        await q.clear();
        await settle();
        expect(readJson('queue.json').videos).to.have.length(0);
        expect(readJson('show.json').videos.map(v => v.filename)).to.deep.equal(['reel.mp4']);
    });

    it('backs off an mpv that keeps dying at spawn instead of respawning at once', async function () {
        const q = make();
        await q.load();
        q._lastSpawnAt = Date.now();
        expect(q._respawnDelayMs()).to.equal(0);      // one quick exit: retry now
        q._lastSpawnAt = Date.now();
        expect(q._respawnDelayMs()).to.equal(2000);
        q._lastSpawnAt = Date.now();
        expect(q._respawnDelayMs()).to.equal(4000);
        q._quickExits = 20;
        q._lastSpawnAt = Date.now();
        expect(q._respawnDelayMs()).to.equal(60000);  // capped
        q._lastSpawnAt = Date.now() - 10000;           // a pass that played normally
        expect(q._respawnDelayMs()).to.equal(0);
        expect(q._quickExits).to.equal(0);
    });
});
