#!/usr/bin/env node
/**
 * Build one pre-concatenated reel per Goblin from a plan.
 *
 *   node scripts/goblins/build-reels.mjs --plan PLAN.json [--source DIR] [--out DIR] [--only NAME]
 *
 * Why one file per Goblin: a one-file queue in loop mode is ONE mpv --loop on the
 * device. A multi-clip queue respawns mpv per clip (a black flash each time, and the
 * kill path that produced the 2026-10 respawn storms). So the curation happens here,
 * on the MonsterBox node, and the device just loops a single file.
 *
 * Output spec for a Pi 3B: 1280x720, H.264 High@4.0, 30 fps CFR, ~2.5 Mbit/s
 * (3.5 peak), keyframe every 2 s, no audio track (Goblin audio is off), faststart.
 *
 * Plan shape:
 *   { "reels": [ { "name": "goblin2-window.mp4", "mode": "full" | "center-strip",
 *                  "stripAspect": 0.5625, "zoom": 1.0,
 *                  "clips": [ { "file": "Moon.mp4", "start": 0, "end": null,
 *                               "trimBlack": true, "focusX": 0.5 } ] } ] }
 *
 *   full          the whole frame, letterboxed/pillarboxed into 1280x720.
 *   center-strip  for a tall narrow window in front of a landscape TV: a vertical
 *                 strip (stripAspect = width/height, default 9:16) is cut from the
 *                 source around the subject (focusX, 0..1, from clip-metrics), scaled
 *                 to the full 720-px height and centred on a black 1280x720 frame.
 *                 `zoom` > 1 tightens the strip further so a small subject fills it.
 *                 If the TV turns out to be physically mounted portrait, render with
 *                 "transpose": "cw"|"ccw" on the reel instead (a 720x1280 strip,
 *                 rotated onto the landscape-scanned panel).
 *   trimBlack     cut black lead-in/lead-out (blackdetect) beyond 0.4 s, so the
 *                 window-projection clips do not leave the screen dark between figures.
 *
 * Every clip is faded in and out over 0.4 s so the joins are soft. Segments are
 * encoded one at a time under `nice -n 10` (the Pi is shared with the show), then
 * joined with the concat demuxer (stream copy). A manifest NAME.json lands next to
 * each reel: the clips, their in/out points, the reel's duration, bytes and sha256.
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PLAN = opt('plan', null);
const SOURCE = path.resolve(opt('source', '/home/remote/goblin-reels/source'));
const OUT = path.resolve(opt('out', '/home/remote/goblin-reels/reels'));
const ONLY = opt('only', null);
const FADE = 0.4;
const W = 1280, H = 720, FPS = 30;

if (!PLAN) {
    console.error('usage: build-reels.mjs --plan PLAN.json [--source DIR] [--out DIR] [--only NAME]');
    process.exit(2);
}

function run(cmd, argv, { capture = false } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn('nice', ['-n', '10', cmd, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { if (capture) out += d; });
        child.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(-100000); });
        child.on('error', reject);
        child.on('close', code => (code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))));
    });
}

async function probeDuration(file) {
    const { out } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { capture: true });
    return Number(out.trim());
}

/** First and last non-black instants (blackdetect on a 160-px proxy). */
async function nonBlackSpan(file, duration) {
    const { err } = await run('ffmpeg', ['-nostdin', '-hide_banner', '-i', file, '-an',
        '-vf', 'scale=160:-2,blackdetect=d=0.3:pix_th=0.10:pic_th=0.98', '-f', 'null', '-']);
    const spans = [...err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [Number(m[1]), Number(m[2])]);
    let start = 0, end = duration;
    const lead = spans.find(s => s[0] <= 0.1);
    if (lead) start = Math.max(0, lead[1] - FADE);
    const tail = spans.find(s => s[1] >= duration - 0.2);
    if (tail) end = Math.min(duration, tail[0] + FADE);
    const blackInside = spans.filter(s => s !== lead && s !== tail).reduce((t, s) => t + (s[1] - s[0]), 0);
    return { start, end, blackInside, spans };
}

function filterFor(reel, clip, inDur) {
    const tail = `setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=${FADE},fade=t=out:st=${Math.max(0, inDur - FADE).toFixed(3)}:d=${FADE}`;
    if (reel.mode === 'center-strip') {
        const aspect = Number(reel.stripAspect) || 9 / 16;
        const zoom = Math.max(1, Number(clip.zoom || reel.zoom) || 1);
        const fx = Math.min(1, Math.max(0, Number.isFinite(Number(clip.focusX)) ? Number(clip.focusX) : 0.5));
        const fy = Math.min(1, Math.max(0, Number.isFinite(Number(clip.focusY)) ? Number(clip.focusY) : 0.5));
        // Strip of height ih/zoom and width = that * aspect, centred on the subject, kept inside the frame.
        const ch = `trunc(ih/${zoom}/2)*2`;
        const cw = `trunc(min(iw\\,ih/${zoom}*${aspect})/2)*2`;
        const cx = `max(0\\,min(iw-${cw}\\,iw*${fx}-${cw}/2))`;
        const cy = `max(0\\,min(ih-${ch}\\,ih*${fy}-${ch}/2))`;
        const sw = Math.round(H * aspect / 2) * 2;
        let vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${sw}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`;
        if (reel.transpose === 'cw') vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${H}:${W}:force_original_aspect_ratio=decrease,pad=${H}:${W}:(ow-iw)/2:(oh-ih)/2:black,transpose=1`;
        if (reel.transpose === 'ccw') vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${H}:${W}:force_original_aspect_ratio=decrease,pad=${H}:${W}:(ow-iw)/2:(oh-ih)/2:black,transpose=2`;
        return `${vf},${tail}`;
    }
    return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,${tail}`;
}

async function sha256(file) {
    return new Promise((resolve, reject) => {
        const h = createHash('sha256');
        createReadStream(file).on('data', d => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
    });
}

async function buildReel(reel) {
    const work = path.join(OUT, `.work-${path.parse(reel.name).name}`);
    await fs.mkdir(work, { recursive: true });
    const segments = [];
    const clips = [];
    let t = 0;
    for (const [k, clip] of reel.clips.entries()) {
        const src = path.join(SOURCE, clip.file);
        const duration = await probeDuration(src);
        let start = Number(clip.start) || 0;
        let end = clip.end ? Math.min(duration, Number(clip.end)) : duration;
        let black = null;
        if (clip.trimBlack) {
            black = await nonBlackSpan(src, duration);
            start = Math.max(start, black.start);
            end = Math.min(end, black.end);
        }
        const inDur = Math.max(1, end - start);
        const seg = path.join(work, `${String(k).padStart(2, '0')}.mp4`);
        const t0 = Date.now();
        await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', start.toFixed(3), '-t', inDur.toFixed(3), '-i', src, '-an',
            '-vf', filterFor(reel, clip, inDur),
            '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.0',
            '-b:v', '2500k', '-maxrate', '3500k', '-bufsize', '5000k',
            '-g', String(FPS * 2), '-keyint_min', String(FPS * 2), '-sc_threshold', '0',
            '-r', String(FPS), '-video_track_timescale', '15360', '-threads', '3', seg]);
        const segDur = await probeDuration(seg);
        console.log(`  ${reel.name} ${k + 1}/${reel.clips.length} ${clip.file} ${start.toFixed(1)}-${end.toFixed(1)} s -> ${segDur.toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s)${black && black.blackInside > 2 ? ` [${black.blackInside.toFixed(1)} s black inside]` : ''}`);
        segments.push(seg);
        clips.push({ file: clip.file, in: Number(start.toFixed(2)), out: Number(end.toFixed(2)), at: Number(t.toFixed(2)), duration: Number(segDur.toFixed(2)), focusX: reel.mode === 'center-strip' ? (clip.focusX ?? 0.5) : undefined, why: clip.why });
        t += segDur;
    }
    const list = path.join(work, 'list.txt');
    await fs.writeFile(list, segments.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
    const target = path.join(OUT, reel.name);
    await run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', target]);
    const duration = await probeDuration(target);
    const stat = await fs.stat(target);
    const manifest = {
        name: reel.name, goblin: reel.goblin, mode: reel.mode || 'full', stripAspect: reel.mode === 'center-strip' ? (reel.stripAspect || 9 / 16) : undefined,
        transpose: reel.transpose, purpose: reel.purpose, builtAt: new Date().toISOString(),
        spec: `${W}x${H} H.264 High@4.0 ${FPS} fps, 2.5 Mbit/s (3.5 peak), GOP 2 s, no audio`,
        duration: Number(duration.toFixed(2)), bytes: stat.size, sha256: await sha256(target), clips
    };
    await fs.writeFile(path.join(OUT, `${path.parse(reel.name).name}.json`), JSON.stringify(manifest, null, 2) + '\n');
    await fs.rm(work, { recursive: true, force: true });
    console.log(`built ${target}: ${duration.toFixed(1)} s, ${(stat.size / 1e6).toFixed(1)} MB, ${clips.length} clips`);
    return manifest;
}

const plan = JSON.parse(await fs.readFile(PLAN, 'utf-8'));
await fs.mkdir(OUT, { recursive: true });
for (const reel of plan.reels) {
    if (ONLY && reel.name !== ONLY) continue;
    await buildReel(reel);
}
