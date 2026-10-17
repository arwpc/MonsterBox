/**
 * Keeps a character's scripted speech pre-recorded, in the background.
 *
 * Scene lines play from the disk cache (ttsCache.js), and while a character is
 * not awake a cache miss is skipped rather than rendered live (sceneExecutor
 * liveSpeechAllowed). So every line must be rendered BEFORE it is needed: at
 * boot (which covers every deploy and reboot) and shortly after a character's
 * scenes are saved. This runs scripts/prerender-scene-tts.mjs, which renders
 * only lines missing from the cache: one ElevenLabs call per new line, ever.
 *
 * One run at a time per node, debounced per character, at low CPU priority so a
 * render never competes with servos or audio. Never runs in test mode.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(APP_ROOT, 'scripts', 'prerender-scene-tts.mjs');

export const SAVE_DEBOUNCE_MS = 60 * 1000;
export const BOOT_DELAY_MS = 3 * 60 * 1000;

const timers = new Map();   // characterId -> timeout
let running = null;         // characterId being rendered
const queued = new Set();   // characterIds due while a run was in flight

function isTestMode() {
    return process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
}

function run(characterId) {
    if (running != null) { queued.add(characterId); return; }
    running = characterId;
    const node = process.execPath;
    const child = spawn('nice', ['-n', '10', node, SCRIPT, String(characterId)], {
        cwd: APP_ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    let summary = '';
    let failures = '';
    child.stdout.on('data', (d) => {
        const m = String(d).match(/prerender-scene-tts:.*$/m);
        if (m) summary = m[0];
    });
    child.stderr.on('data', (d) => { failures += String(d); });
    const done = (code) => {
        if (running !== characterId) return;
        running = null;
        if (summary) console.log(`🎙️ Pre-recorded speech, character ${characterId}: ${summary.replace('prerender-scene-tts: ', '')}`);
        if (code !== 0) console.warn(`⚠️ Pre-recording for character ${characterId} exited ${code}: ${failures.trim().split('\n').slice(-3).join(' | ')}`);
        const next = queued.values().next();
        if (!next.done) { queued.delete(next.value); run(next.value); }
    };
    child.on('error', (err) => { failures += err.message; done(-1); });
    child.on('close', done);
}

/**
 * Render a character's missing scripted lines after `delayMs` (debounced: a burst
 * of scene saves produces one run).
 */
export function schedulePrerender(characterId, { delayMs = SAVE_DEBOUNCE_MS } = {}) {
    if (isTestMode()) return false;
    const id = Number(characterId);
    if (!Number.isInteger(id) || id <= 0) return false;
    clearTimeout(timers.get(id));
    const t = setTimeout(() => { timers.delete(id); run(id); }, delayMs);
    if (typeof t.unref === 'function') t.unref();
    timers.set(id, t);
    return true;
}

export default { schedulePrerender };
