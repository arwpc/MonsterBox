#!/usr/bin/env node
/**
 * Measure every clip in a Goblin show library so reels can be curated per window.
 *
 *   node scripts/goblins/clip-metrics.mjs [--source DIR] [--out FILE] [--sheets DIR]
 *
 * Defaults: --source /home/remote/goblin-reels/source (the clips rsynced once from a
 * Goblin's /home/remote/media/video), --out <source>/../clip-metrics.json, and no
 * contact sheets unless --sheets is given.
 *
 * Why these numbers: the three windows the Goblins sit behind want different things.
 * A big window seen from the street wants high contrast and little fine detail; the
 * showcase screen wants detail and motion; the tall narrow roof window wants the
 * subject in the middle of the frame. Every metric is sampled at 2 fps on a 320-px
 * proxy, which is plenty for ranking and keeps a 35-minute library to a few minutes
 * of CPU on a Pi 4.
 *
 *   yavg      mean luma (16 = black, 235 = white)
 *   contrast  mean per-frame spread between the 10th and 90th luma percentile
 *   motion    mean absolute luma change between samples 0.5 s apart (signalstats YDIF)
 *   detail    mean edge density (edgedetect, then mean of the edge map)
 *   black     fraction of samples that are essentially black (yavg < 24)
 *   centerLuma / centerEdge  how much brighter / busier the central 32 % strip is than
 *             the whole frame (> 1 means the subject sits in the middle)
 *   focusX    horizontal centre of the lit subject (0 = left edge, 1 = right edge), from a
 *             16-column luma profile weighted by brightness above black; spreadX is how
 *             widely that light is spread (0 = one column, ~0.29 = evenly lit)
 *
 * Read-only on the clips; writes only the JSON and the optional sheets. Runs niced.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SOURCE = path.resolve(opt('source', '/home/remote/goblin-reels/source'));
const OUT = path.resolve(opt('out', path.join(SOURCE, '..', 'clip-metrics.json')));
const SHEETS = opt('sheets', null) ? path.resolve(opt('sheets')) : null;
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const VIDEO_EXT = /\.(mp4|mov|mkv|avi)$/i;

function run(cmd, cmdArgs, { allowFail = false, binary = false } = {}) {
    const r = spawnSync('nice', ['-n', '15', cmd, ...cmdArgs], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 && !allowFail) {
        throw new Error(`${cmd} exited ${r.status}: ${String(r.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
    }
    return r;
}

function probe(file) {
    const r = run('ffprobe', ['-v', 'error', '-show_entries',
        'stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate:format=duration,bit_rate',
        '-of', 'json', file]);
    const j = JSON.parse(r.stdout);
    const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
    const a = (j.streams || []).find(s => s.codec_type === 'audio');
    const [num, den] = String(v.r_frame_rate || '0/1').split('/').map(Number);
    return {
        width: v.width || 0,
        height: v.height || 0,
        fps: den ? Math.round((num / den) * 100) / 100 : 0,
        codec: v.codec_name || null,
        duration: Math.round(Number(j.format && j.format.duration || 0) * 100) / 100,
        kbps: Math.round(Number(j.format && j.format.bit_rate || 0) / 1000),
        hasAudio: !!a
    };
}

/** Parse `metadata=print` output into one object of numbers per frame. */
function parseFrames(text) {
    const frames = [];
    let cur = null;
    for (const line of text.split('\n')) {
        if (line.startsWith('frame:')) { cur = {}; frames.push(cur); continue; }
        const m = /^lavfi\.signalstats\.([A-Z]+)=([-\d.]+)/.exec(line);
        if (m && cur) cur[m[1]] = Number(m[2]);
    }
    return frames;
}

const mean = (xs) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function measure(file, tmp) {
    const names = ['full', 'edge', 'center', 'centerEdge'].map(n => path.join(tmp, `${n}.txt`));
    names.forEach(n => { try { fs.unlinkSync(n); } catch { /* fresh */ } });
    const edge = 'edgedetect=low=0.08:high=0.25';
    const graph = [
        '[0:v]fps=2,scale=320:-2,format=yuv420p,split=5[a][b][c][d][e]',
        `[a]signalstats,metadata=mode=print:file=${names[0]}[ao]`,
        `[b]${edge},signalstats,metadata=mode=print:file=${names[1]}[bo]`,
        `[c]crop=iw*0.32:ih,signalstats,metadata=mode=print:file=${names[2]}[co]`,
        `[d]crop=iw*0.32:ih,${edge},signalstats,metadata=mode=print:file=${names[3]}[do]`,
        '[e]format=gray,scale=16:1:flags=area[eo]'
    ].join(';');
    const raw = run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file, '-filter_complex', graph,
        '-map', '[ao]', '-f', 'null', '-', '-map', '[bo]', '-f', 'null', '-',
        '-map', '[co]', '-f', 'null', '-', '-map', '[do]', '-f', 'null', '-',
        '-map', '[eo]', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { binary: true }).stdout;
    // Column profile: mean luma per sixteenth of the width over every sample, then the
    // brightness-above-black centre of mass (where the subject is) and its spread.
    const cols = new Array(16).fill(0);
    const nFrames = Math.floor(raw.length / 16);
    for (let f = 0; f < nFrames; f++) for (let c = 0; c < 16; c++) cols[c] += raw[f * 16 + c] / nFrames;
    const weights = cols.map(v => Math.max(0, v - 24));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const centres = cols.map((_, c) => (c + 0.5) / 16);
    const focusX = wsum > 0 ? weights.reduce((a, w, c) => a + w * centres[c], 0) / wsum : 0.5;
    const spreadX = wsum > 0 ? Math.sqrt(weights.reduce((a, w, c) => a + w * (centres[c] - focusX) ** 2, 0) / wsum) : 0.29;
    const [full, edges, center, centerEdges] = names.map(n => parseFrames(fs.readFileSync(n, 'utf8')));
    const yavg = mean(full.map(f => f.YAVG));
    const edgeAvg = mean(edges.map(f => f.YAVG));
    return {
        samples: full.length,
        yavg: round(yavg),
        contrast: round(mean(full.map(f => (f.YHIGH ?? 0) - (f.YLOW ?? 0)))),
        motion: round(mean(full.slice(1).map(f => f.YDIF ?? 0))),
        detail: round(edgeAvg),
        black: round(full.filter(f => f.YAVG < 24).length / Math.max(1, full.length)),
        centerLuma: round(mean(center.map(f => f.YAVG)) / Math.max(1, yavg)),
        centerEdge: round(mean(centerEdges.map(f => f.YAVG)) / Math.max(0.01, edgeAvg)),
        focusX: round(focusX, 3),
        spreadX: round(spreadX, 3),
        profile: cols.map(v => Math.round(v))
    };
}

/** One labelled row of six frames per clip; rows stacked four to a sheet. */
function contactRow(file, info, tmp, index) {
    const times = [0.08, 0.25, 0.42, 0.58, 0.75, 0.92].map(f => Math.max(0, info.duration * f));
    const inputs = times.flatMap(t => ['-ss', t.toFixed(2), '-i', file]);
    const label = path.join(tmp, `label-${index}.txt`);
    fs.writeFileSync(label, `${path.basename(file)}   ${info.duration}s  ${info.width}x${info.height}  ${info.hasAudio ? 'audio' : 'silent'}`);
    const scaled = times.map((_, i) => `[${i}:v]scale=256:144:force_original_aspect_ratio=decrease,pad=256:144:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`);
    const graph = `${scaled.join(';')};${times.map((_, i) => `[v${i}]`).join('')}hstack=inputs=6,`
        + `pad=iw:ih+26:0:26:color=0x202020,drawtext=fontfile=${FONT}:textfile=${label}:x=6:y=5:fontsize=17:fontcolor=white`;
    const out = path.join(tmp, `row-${String(index).padStart(3, '0')}.png`);
    run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
        '-filter_complex', graph, '-frames:v', '1', out]);
    return out;
}

function main() {
    const files = fs.readdirSync(SOURCE).filter(f => VIDEO_EXT.test(f) && !f.startsWith('.')).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!files.length) throw new Error(`no clips in ${SOURCE}`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'goblin-metrics-'));
    const results = [];
    const rows = [];
    files.forEach((name, i) => {
        const file = path.join(SOURCE, name);
        const info = probe(file);
        const m = measure(file, tmp);
        results.push({ filename: name, bytes: fs.statSync(file).size, ...info, ...m });
        if (SHEETS) rows.push(contactRow(file, info, tmp, i));
        process.stdout.write(`${String(i + 1).padStart(2)}/${files.length} ${name}  y=${m.yavg} c=${m.contrast} mo=${m.motion} d=${m.detail} bl=${m.black} cl=${m.centerLuma} ce=${m.centerEdge} fx=${m.focusX} sx=${m.spreadX}\n`);
    });
    fs.writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: SOURCE, clips: results }, null, 2)}\n`);
    console.log(`wrote ${OUT} (${results.length} clips)`);
    if (SHEETS) {
        fs.mkdirSync(SHEETS, { recursive: true });
        for (let s = 0; s * 4 < rows.length; s++) {
            const group = rows.slice(s * 4, s * 4 + 4);
            const out = path.join(SHEETS, `sheet-${String(s + 1).padStart(2, '0')}.jpg`);
            const ins = group.flatMap(r => ['-i', r]);
            const graph = group.length > 1 ? `${group.map((_, i) => `[${i}:v]`).join('')}vstack=inputs=${group.length}` : '[0:v]null';
            run('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...ins, '-filter_complex', graph, '-q:v', '4', out]);
        }
        console.log(`wrote ${Math.ceil(rows.length / 4)} contact sheets to ${SHEETS}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
}

main();
