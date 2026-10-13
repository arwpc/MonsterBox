/**
 * The Goblin player keeps track of the mpv that is on screen when the one it replaced exits late.
 *
 * A hardware-decoding mpv on a Pi 3 can take seconds to exit after SIGTERM. The old exit handler
 * nulled this.process and fired onEnd whenever ANY mpv exited, so after a fleet-event cast the reel
 * kept playing while the player reported nothing running, and a keep-alive start then spawned a
 * second mpv against a held display (Goblins 2 and 3, 2026-10-12). Pinned with a fake `mpv` on PATH.
 */

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

describe('Goblin mpv process tracking', function () {
    this.timeout(15000);
    let binDir;
    let savedPath;
    let controller;

    before(function () {
        binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-mpv-'));
        // Ignores SIGTERM for MPV_LINGER seconds (a slow hardware decoder), else plays "forever".
        fs.writeFileSync(path.join(binDir, 'mpv'),
            '#!/bin/bash\ntrap \'sleep "${MPV_LINGER:-0}"; exit 0\' TERM\nwhile true; do sleep 0.1; done\n', { mode: 0o755 });
        savedPath = process.env.PATH;
        process.env.PATH = `${binDir}:${savedPath}`;
    });

    after(function () {
        process.env.PATH = savedPath;
        fs.rmSync(binDir, { recursive: true, force: true });
    });

    afterEach(async function () {
        if (controller) {
            process.env.MPV_LINGER = '0';
            await controller.destroy();
            controller = null;
        }
        delete process.env.MPV_LINGER;
    });

    const make = () => {
        const MPVController = require('../../goblin/src/mpvController.js');
        controller = new MPVController({ mediaRoot: binDir });
        return controller;
    };

    it('a replaced mpv exiting late neither drops the new one nor ends its pass', async function () {
        const mpv = make();
        const ended = [];
        mpv.onEnd = finished => ended.push(finished);

        process.env.MPV_LINGER = '1.5';               // the cast lingers 1.5 s after SIGTERM
        await mpv.play('cast.mp4');
        const castProc = mpv.process;
        await new Promise(r => setTimeout(r, 300));

        process.env.MPV_LINGER = '0';
        await mpv.play('reel.mp4', { loop: true });
        const reelProc = mpv.process;
        expect(reelProc).to.not.equal(castProc);

        await new Promise(r => setTimeout(r, 2500));  // well past the cast's late exit
        expect(castProc.signalCode !== null || castProc.exitCode !== null, 'cast mpv has exited').to.equal(true);
        expect(mpv.process, 'still tracking the reel').to.equal(reelProc);
        expect(mpv.currentVideo).to.equal('reel.mp4');
        expect(ended, 'a replaced mpv must not end the new pass').to.deep.equal([]);
    });

    it('waits for a slow mpv to let go of the display before returning from stop()', async function () {
        const mpv = make();
        process.env.MPV_LINGER = '1.5';
        await mpv.play('cast.mp4');
        const proc = mpv.process;
        await new Promise(r => setTimeout(r, 300));
        const started = Date.now();
        await mpv.stop();
        expect(Date.now() - started, 'stop() waited for the exit').to.be.greaterThan(1000);
        expect(proc.signalCode !== null || proc.exitCode !== null, 'mpv exited before stop() returned').to.equal(true);
    });

    it('a natural end of the current mpv still ends the pass', async function () {
        const mpv = make();
        const ended = [];
        mpv.onEnd = finished => ended.push(finished);
        await mpv.play('clip.mp4');
        mpv.process.kill('SIGTERM');                  // as if the clip finished
        await new Promise(r => setTimeout(r, 500));
        expect(ended).to.deep.equal(['clip.mp4']);
        expect(mpv.process).to.equal(null);
    });
});
