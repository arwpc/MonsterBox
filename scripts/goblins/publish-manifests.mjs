#!/usr/bin/env node
/**
 * Publish what each Goblin holds: data/goblin-manifests/<goblinId>.json, one per unit
 * in the registry (data/goblins.json). The scene validator checks every goblin-video
 * cast against these, and the Video Control reels are listed in them once deployed.
 *
 *   node scripts/goblins/publish-manifests.mjs [--source DIR] [--reels DIR]
 *        [--assume "Goblin 4=Goblin 3"] [--dry-run]
 *
 * Per Goblin, the file list comes from (first that works):
 *   live      GET <endpoint>/media (the device's own listing; a cheap read)
 *   previous  the manifest published before (a unit off the network keeps its list)
 *   gold      backups/goblins-gold-*\/<goblinId>/videos.manifest.tsv (video files only)
 *   assumed   --assume "A=B": unit A holds what unit B's manifest lists (a unit that
 *             was provisioned from another and has never been listed live)
 * Metadata (duration, resolution, fps, audio) comes from ffprobe of an identical local
 * copy (same name and size) in --source (default /home/remote/goblin-reels/source) or
 * --reels (default /home/remote/goblin-reels/reels); probes are cached next to them.
 * A staged show playlist's files that the unit does not hold yet go in `staged`, not in
 * `clips` (the manager moves them into `clips` when it copies them there).
 *
 * Read-only on the devices. Hosts come from the registry, never from this file.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { writeJsonAtomic } from '../../services/atomicStore.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const optAll = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SOURCE = path.resolve(opt('source', '/home/remote/goblin-reels/source'));
const REELS = path.resolve(opt('reels', '/home/remote/goblin-reels/reels'));
const OUT = path.join(ROOT, 'data', 'goblin-manifests');
const DRY = args.includes('--dry-run');
const VIDEO = /\.(mp4|mov|avi|mkv)$/i;
const PROBE_CACHE = path.join(path.dirname(SOURCE), 'probe-cache.json');

const readJson = async (file, fallback = null) => {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (_) { return fallback; }
};

async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function ffprobe(file) {
    return new Promise((resolve) => {
        const child = spawn('nice', ['-n', '10', 'ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate', '-of', 'json', file]);
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.on('error', () => resolve(null));
        child.on('close', (code) => {
            if (code !== 0) return resolve(null);
            try {
                const j = JSON.parse(out);
                const v = (j.streams || []).find(s => s.codec_type === 'video') || {};
                const a = (j.streams || []).find(s => s.codec_type === 'audio');
                const [n, d] = String(v.avg_frame_rate || '0/1').split('/').map(Number);
                resolve({
                    duration: Number(Number(j.format && j.format.duration).toFixed(2)) || null,
                    resolution: v.width && v.height ? `${v.width}x${v.height}` : null,
                    fps: d ? Number((n / d).toFixed(3)) : null,
                    codec: v.codec_name || null,
                    audio: a ? a.codec_name : null
                });
            } catch (_) { resolve(null); }
        });
    });
}

async function goldList(goblinId) {
    const backups = path.join(ROOT, 'backups');
    let dirs = [];
    try { dirs = (await fs.readdir(backups)).filter(d => d.startsWith('goblins-gold-')).sort().reverse(); } catch (_) { return null; }
    for (const d of dirs) {
        try {
            const text = await fs.readFile(path.join(backups, d, goblinId, 'videos.manifest.tsv'), 'utf8');
            const rows = text.split(/\r?\n/).slice(1).map(l => l.split('\t')).filter(r => r[0] && VIDEO.test(r[0]));
            return { detail: `${d}/${goblinId}/videos.manifest.tsv`, files: rows.map(r => ({ filename: r[0], bytes: Number(r[1]) || null, sha256: r[2] || undefined })) };
        } catch (_) { /* not in this snapshot */ }
    }
    return null;
}

function resolveName(registry, ref) {
    const key = String(ref || '').trim().toLowerCase();
    const loose = key.replace(/[^a-z0-9]/g, '');
    const byId = registry.find(g => g.id === ref);
    if (byId) return byId;
    const byName = registry.filter(g => String(g.name || '').trim().toLowerCase() === key);
    if (byName.length === 1) return byName[0];
    const byLoose = registry.filter(g => String(g.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === loose);
    return byLoose.length === 1 ? byLoose[0] : null;
}

const registry = await readJson(path.join(ROOT, 'data', 'goblins.json'), []);
const playlists = await readJson(path.join(ROOT, 'data', 'goblin-playlists.json'), []);
const probeCache = await readJson(PROBE_CACHE, {});
const assumed = new Map();
for (const pair of optAll('assume')) {
    const [a, b] = pair.split('=');
    const ga = resolveName(registry, a);
    const gb = resolveName(registry, b);
    if (!ga || !gb) { console.error(`--assume "${pair}": no unique Goblin for ${!ga ? a : b}`); process.exit(2); }
    assumed.set(ga.id, gb.id);
}
if (!DRY) await fs.mkdir(OUT, { recursive: true });

async function metaFor(filename, bytes) {
    for (const dir of [REELS, SOURCE]) {
        const local = path.join(dir, filename);
        let st;
        try { st = await fs.stat(local); } catch (_) { continue; }
        if (bytes && st.size !== bytes) continue; // a different file under the same name
        const key = `${filename}|${st.size}|${Math.round(st.mtimeMs)}`;
        if (!probeCache[key]) {
            const probed = await ffprobe(local);
            if (probed) probeCache[key] = probed;
        }
        if (probeCache[key]) return { ...probeCache[key], kind: dir === REELS ? 'reel' : 'clip' };
    }
    return { kind: /^reel-/i.test(filename) ? 'reel' : 'clip' };
}

const results = {};
const ordered = registry.slice().sort((a, b) => (assumed.has(a.id) ? 1 : 0) - (assumed.has(b.id) ? 1 : 0));
for (const g of ordered) {
    const previous = await readJson(path.join(OUT, `${g.id}.json`));
    let files = null, source = null, detail = null;
    try {
        const media = await fetchJson(`${g.endpoint}/media`);
        files = (Array.isArray(media.videos) ? media.videos : []).filter(v => v && VIDEO.test(v.filename))
            .map(v => ({ filename: v.filename, bytes: Number(v.size) || null }));
        source = 'live';
        detail = `GET ${g.endpoint}/media at ${new Date().toISOString()}`;
    } catch (err) {
        detail = `device did not answer (${err.name === 'AbortError' ? 'timeout' : err.message})`;
    }
    if (!files && previous && Array.isArray(previous.clips) && previous.clips.length) {
        files = previous.clips.map(c => ({ filename: c.filename, bytes: c.bytes || null }));
        source = 'previous';
        detail += `; kept the list published ${previous.publishedAt} (${previous.source})`;
    }
    if (!files) {
        const gold = await goldList(g.id);
        if (gold) { files = gold.files; source = 'gold'; detail += `; ${gold.detail}`; }
    }
    if (!files && assumed.has(g.id)) {
        const other = results[assumed.get(g.id)] || await readJson(path.join(OUT, `${assumed.get(g.id)}.json`));
        if (other && Array.isArray(other.clips)) {
            files = other.clips.filter(c => c.kind !== 'reel').map(c => ({ filename: c.filename, bytes: c.bytes || null }));
            source = 'assumed';
            detail += `; assumed to hold ${other.name || other.goblinId}'s clips (provisioned from it), reels excluded`;
        }
    }
    if (!files) {
        console.log(`${g.name}: no list from any source; not publishing (${detail})`);
        continue;
    }
    const clips = [];
    for (const f of files.sort((a, b) => a.filename.localeCompare(b.filename, 'en', { numeric: true }))) {
        clips.push({ filename: f.filename, bytes: f.bytes, ...(await metaFor(f.filename, f.bytes)) });
    }
    const have = new Set(clips.map(c => c.filename));
    const staged = [];
    for (const p of playlists.filter(pl => pl && pl.role === 'show' && pl.goblinId === g.id)) {
        for (const v of p.videos || []) {
            if (have.has(v.filename)) continue;
            staged.push({ filename: v.filename, playlistId: p.id, source: v.source || null, meta: { bytes: v.bytes || null, ...(await metaFor(v.filename, v.bytes)) } });
        }
    }
    const manifest = {
        goblinId: g.id,
        name: g.name,
        publishedAt: new Date().toISOString(),
        source,
        sourceDetail: detail,
        note: 'clips = the video files this unit holds (what a scene may cast to it). staged = files of its staged show playlist that are not on the unit yet; the keep-alive copies them when it returns.',
        count: clips.length,
        clips,
        staged
    };
    results[g.id] = manifest;
    console.log(`${g.name}: ${clips.length} files (${source})${staged.length ? `, staged: ${staged.map(s => s.filename).join(', ')}` : ''}`);
    if (!DRY) await writeJsonAtomic(path.join(OUT, `${g.id}.json`), manifest);
}
if (!DRY) await writeJsonAtomic(PROBE_CACHE, probeCache);
