/**
 * Goblin Management Service
 * Handles registration, monitoring, and control of MonsterBox Goblins
 */

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import goblinDeploymentService from './goblinDeploymentService.js';
import { writeJsonAtomic, updateJsonUnderLock, SKIP_WRITE } from './atomicStore.js';

/**
 * fetch() with a real timeout. Native fetch silently ignores a `timeout`
 * option, so a hung/unreachable Goblin would otherwise stall the request
 * handler indefinitely. Uses AbortController (no new dependency).
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const GOBLIN_VIDEO_DIR = '/home/remote/media/video';
const GOBLIN_SSH_USER = 'remote';
const GOBLIN_VIDEO_EXT = /^[^.].*\.(mp4|mov|avi|mkv)$/i; // a stem, then an extension the player lists
// Thumbnails of what is on the Goblins' disks, keyed by filename (all three carry
// the same files, so one frame serves every Goblin). Made on the device itself: it
// has ffmpeg, and one 320-px frame over ssh is a few kB — the alternative was
// pulling 700 MB of video across the Wi-Fi to look at it.
const GOBLIN_THUMB_DIR = path.resolve('./data/video-library/goblin-thumbnails');
const GOBLIN_THUMB_MAX_BYTES = 2 * 1024 * 1024;
const shellQuote = (str) => `'${String(str).replace(/'/g, `'\\''`)}'`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function goblinHost(goblin) {
    try { return new URL(goblin.endpoint).hostname; } catch { return goblin.ipAddress || goblin.ip || null; }
}

/**
 * A name the Goblin player will list: a bare basename with a video extension. The
 * device scans its media directory by extension, so anything else lands on disk but
 * never becomes playable.
 */
export function sanitizeGoblinFilename(name) {
    if (typeof name !== 'string') return null;
    const base = path.basename(name.trim()).replace(/[\u0000-\u001f]/g, '');
    if (!base || base === '.' || base === '..' || !GOBLIN_VIDEO_EXT.test(base)) return null;
    return base;
}

/**
 * rsync one file to a Goblin. Uses the fleet SSH password through `sshpass -e`
 * (env var, never argv — same rule as orchestrationService) when it is set, else
 * plain key-based ssh. `-s` keeps a filename with spaces intact on the remote side.
 */
function rsyncToGoblin(sourcePath, host, targetName, timeoutMs = 15 * 60 * 1000) {
    const password = process.env.MONSTERBOX_SSH_PASSWORD || null;
    const sshCmd = `${password ? 'sshpass -e ' : ''}ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=${password ? 'no' : 'yes'}`;
    const args = ['-t', '-s', '--partial', '--inplace', '--timeout=90', '--stats',
        '-e', sshCmd, sourcePath, `${GOBLIN_SSH_USER}@${host}:${GOBLIN_VIDEO_DIR}/${targetName}`];
    return new Promise((resolve) => {
        const env = { ...process.env };
        if (password) env.SSHPASS = password;
        const child = spawn('rsync', args, { env });
        let stdout = '', stderr = '';
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, timeoutMs);
        child.stdout.on('data', d => { stdout += d.toString(); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('error', err => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: err.message, transferred: 0 }); });
        child.on('close', code => {
            clearTimeout(timer);
            const m = /Total transferred file size: ([\d,]+)/.exec(stdout);
            resolve({ code, stdout, stderr, transferred: m ? Number(m[1].replace(/,/g, '')) : null });
        });
    });
}

/**
 * Run ffmpeg on the Goblin and bring back one JPEG frame on stdout. Same credential
 * rule as rsyncToGoblin. `-ss 1` skips the black lead-in most of these clips open with.
 */
function grabFrameOnGoblin(host, name, timeoutMs = 45000) {
    const password = process.env.MONSTERBOX_SSH_PASSWORD || null;
    const remote = `nice -n 10 ffmpeg -nostdin -loglevel error -ss 1 -i ${shellQuote(`${GOBLIN_VIDEO_DIR}/${name}`)} `
        + `-frames:v 1 -vf 'scale=320:-2' -q:v 6 -f image2 pipe:1`;
    const args = ['-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=8', '-o', `BatchMode=${password ? 'no' : 'yes'}`,
        `${GOBLIN_SSH_USER}@${host}`, remote];
    return new Promise((resolve) => {
        const env = { ...process.env };
        if (password) env.SSHPASS = password;
        const child = spawn(password ? 'sshpass' : 'ssh', password ? ['-e', 'ssh', ...args] : args, { env });
        const chunks = []; let size = 0; let stderr = '';
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
        child.stdout.on('data', d => { size += d.length; if (size <= GOBLIN_THUMB_MAX_BYTES) chunks.push(d); });
        child.stderr.on('data', d => { stderr += d.toString(); });
        child.on('error', err => { clearTimeout(timer); resolve({ success: false, error: err.message }); });
        child.on('close', code => {
            clearTimeout(timer);
            const jpeg = Buffer.concat(chunks);
            // A JPEG starts FF D8; anything else is ssh/ffmpeg noise, not a frame.
            if (code !== 0 || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
                resolve({ success: false, error: `ffmpeg on ${host} gave no frame (exit ${code}): ${stderr.trim().split('\n').pop() || 'no detail'}` });
                return;
            }
            resolve({ success: true, jpeg });
        });
    });
}

// ─── Names, display hints, keep-alive: pure helpers (unit-tested directly) ───

/** Lower-cased, trimmed: the second rung of resolveGoblin (case-insensitive name). */
export function goblinNameKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * Letters and digits only, lower-cased: the third rung. Names equal hostnames equal
 * TV labels except for a space ("Goblin 1" / goblin1), so a scene that says
 * "goblin1" or "goblin-1" still lands on the right screen.
 */
export function goblinLooseKey(value) {
    return goblinNameKey(value).replace(/[^a-z0-9]/g, '');
}

/** Where a screen sits and how it reads; free text except orientation. */
export const GOBLIN_DISPLAY_FIELDS = ['location', 'placement', 'orientation', 'readsFrom'];
export const GOBLIN_ORIENTATIONS = ['landscape', 'portrait-cw', 'portrait-ccw', 'unknown'];

/** The filenames in a device queue, in order (device entries are {filename, playCount, …}). */
export function queueFilenames(queue) {
    const videos = queue && Array.isArray(queue.videos) ? queue.videos : [];
    return videos.map(v => (v && typeof v === 'object' ? v.filename : v)).filter(Boolean).map(f => path.basename(String(f)));
}

/** Total spawns the device has counted for its queue (one per mpv start). */
export function queuePlayCount(queue) {
    const videos = queue && Array.isArray(queue.videos) ? queue.videos : [];
    return videos.reduce((sum, v) => sum + (v && Number.isFinite(Number(v.playCount)) ? Number(v.playCount) : 0), 0);
}

/**
 * A respawn storm: mpv dying at spawn and the device starting it again, over and
 * over (42,680 spawns of one 6-second clip on Goblin 3 by 2026-10-09). A healthy
 * one-file loop counts ONE spawn for as long as it runs, and a queue of real clips
 * cannot start a new one faster than every few seconds (the shortest clip is 6 s).
 * So: three or more spawns between two looks, at better than one per 4 s.
 */
export function detectRespawnStorm(previous, current, elapsedMs) {
    if (!previous || !current || !(elapsedMs > 0)) return false;
    const delta = Number(current.playCount) - Number(previous.playCount);
    if (!(delta >= 3)) return false;
    return delta * 4000 > elapsedMs;
}

export const KEEPALIVE_DEFAULTS = Object.freeze({
    enabled: false,
    controllerHost: null,
    pollIntervalMs: 30000,        // one GET /health per Goblin per tick
    minActionIntervalMs: 60000,   // never two starts on one Goblin within a minute
    stoppedDebounceMs: 20000,     // a stopped queue must look stopped on two looks this far apart
    stopHoldMs: 10 * 60 * 1000,   // an operator Stop / Emergency Stop keeps the screen dark this long
    castGuardMs: 180000,          // longest a cast may own the screen before the keep-alive looks again
    castMinGuardMs: 20000,        // never act within this long of a cast starting
    maxBackoffMs: 30 * 60 * 1000,
    startupDelayMs: 45000
});

/**
 * What the keep-alive should do for ONE Goblin right now. Pure: every input is
 * passed in, so the rules are unit-tested without a device.
 *
 *   goblin    { expectedOffline, keepAliveDisabled }
 *   obs       null when the device did not answer, else { videos:[filename], loopMode,
 *             playing (the queue's flag), mpvRunning, currentVideo (basename|null), playCount }
 *   mem       { busy, holdUntil (a Stop issued from this node), lastStopNoHold (that Stop
 *             asked for no hold), needsAttention, stormSuspected, backoffUntil, lastOpAt,
 *             stoppedSince (first look that found nothing playing), pendingReturn (came back
 *             from off the network or a restart), cast: {filename, startedAt}|null }
 *   playlist  { filenames:[...], loopMode } | null — the Goblin's staged show
 *
 * Returns { action: 'none'|'resume'|'apply-playlist', reason, holdUntil? }.
 */
export function decideKeepAlive({ goblin = {}, obs = null, mem = {}, playlist = null, now = Date.now(), config = KEEPALIVE_DEFAULTS } = {}) {
    const cfg = { ...KEEPALIVE_DEFAULTS, ...(config || {}) };
    const none = (reason, extra = {}) => ({ action: 'none', reason, ...extra });
    const clock = (t) => new Date(t).toTimeString().slice(0, 5);
    if (goblin.expectedOffline) return none('expected offline');
    if (goblin.keepAliveDisabled) return none('keep-alive is off for this Goblin');
    if (!obs) return none('not answering');
    if (mem.busy) return none(`busy: ${mem.busy}`);
    if (mem.holdUntil && mem.holdUntil > now) return none(`held after a stop until ${clock(mem.holdUntil)}`, { holdUntil: mem.holdUntil });
    if (mem.needsAttention) return none(`needs attention: ${mem.needsAttention}`);
    if (mem.stormSuspected) return none('respawn storm on the device; not adding starts to it');
    if (mem.backoffUntil && mem.backoffUntil > now) return none(`backing off after a failed attempt until ${clock(mem.backoffUntil)}`);
    const cast = mem.cast;
    if (cast && cast.startedAt) {
        const age = now - cast.startedAt;
        if (age < cfg.castMinGuardMs) return none('cast just started');
        if (age < cfg.castGuardMs && obs.mpvRunning && obs.currentVideo === cast.filename) return none('cast in flight');
    }
    if (mem.lastOpAt && now - mem.lastOpAt < cfg.minActionIntervalMs) return none('another command reached this Goblin less than a minute ago');

    const videos = Array.isArray(obs.videos) ? obs.videos : [];
    const matches = !!playlist && Array.isArray(playlist.filenames)
        && playlist.filenames.length === videos.length
        && playlist.filenames.every((f, k) => f === videos[k])
        && (!playlist.loopMode || playlist.loopMode === obs.loopMode);

    if (mem.pendingReturn && playlist && !matches) {
        return { action: 'apply-playlist', reason: videos.length ? 'came back with a different queue' : 'came back with an empty queue' };
    }
    if (obs.mpvRunning) return none('playing');
    if (!videos.length) {
        return playlist
            ? { action: 'apply-playlist', reason: 'empty queue — a blank screen' }
            : none('empty queue and no staged playlist');
    }
    // The device's playing flag is down: someone stopped this queue (a Stop or an
    // Emergency Stop, possibly from another node). Leave it dark for stopHoldMs from
    // the first look that saw it, unless the stop came from here and asked for no hold.
    if (obs.playing === false && !mem.lastStopNoHold) {
        const until = (mem.stoppedSince || now) + cfg.stopHoldMs;
        if (until > now) return none(`held after a stop until ${clock(until)}`, { holdUntil: until });
    }
    if (!mem.stoppedSince || now - mem.stoppedSince < cfg.stoppedDebounceMs) return none('stopped; confirming on the next look');
    return { action: 'resume', reason: `queue of ${videos.length} stopped for ${Math.round((now - mem.stoppedSince) / 1000)} s` };
}

class GoblinManagerService {
    constructor() {
        this.goblinsFile = path.resolve('./data/goblins.json');
        this.keepAliveFile = path.resolve('./data/goblin-keepalive.json');
        // What each Goblin holds, per unit (scripts/goblins/publish-manifests.mjs writes
        // them in full; a verified copy from here adds its file). The scene validator
        // checks every goblin-video cast against these.
        this.manifestDir = path.resolve('./data/goblin-manifests');
        // Runtime stop bookkeeping (who stopped a screen, its hold, when it was first
        // seen dark), so a MonsterBox restart neither forgets a "no hold" Stop nor
        // restarts a stopped screen's 10-minute hold clock. Written only when it changes.
        this.keepAliveStateFile = path.resolve('./data/goblin-keepalive-state.json');
        this.goblins = new Map(); // In-memory goblin registry
        this.lockTimeout = 3 * 60 * 1000; // 3 minutes in milliseconds
        this.heartbeatInterval = 30 * 1000; // 30 seconds

        // One command sequence at a time per Goblin (stop/clear/add/start, a cast, a
        // playlist deploy, a keep-alive resume). Two sequences interleaved on one
        // device is how a second mpv gets spawned while the first still holds the
        // display: every later spawn then dies at start and the device respawns
        // it once a second (the "one mpv" rule).
        this._opLocks = new Map();   // goblinId -> { label, since, tail: Promise }
        this._lastOp = new Map();    // goblinId -> { at, kind }
        this._casts = new Map();     // goblinId -> { filename, startedAt }
        this._holds = new Map();     // goblinId -> { until, reason, at }
        // Device proof timing: first look after the start, then a second look this much
        // later. A file mpv cannot hold (display owned by a stray mpv, TV off) still
        // looks "running" 1.5 s in; the second look and the spawn count catch it.
        this.proofDelays = { first: 1500, settle: 8000 };
        this.keepAlive = {
            config: { ...KEEPALIVE_DEFAULTS },
            running: false,
            timer: null,
            startTimer: null,
            reason: 'not started',
            mem: new Map(),          // goblinId -> per-Goblin keep-alive memory
            lastTickAt: null,
            ticks: 0
        };
        this._stagedPlaylistProvider = null;

        this.init();
        // A test process (tests/setup.js sets NODE_ENV=test) must not run a fleet
        // monitor: the 30 s tick inside a mocha run dialled every Goblin and wrote
        // data/goblins.json from the TEST process, so the file's mtime moved on every
        // gate run while the server itself was leaving it alone. A test that wants
        // the monitor starts it explicitly. The same goes for the keep-alive, which
        // STARTS video on real screens.
        if (process.env.NODE_ENV !== 'test') {
            this.startHeartbeatMonitor();
            this.initKeepAlive().catch(err => console.error('❌ Goblin keep-alive failed to start:', err.message));
        }
    }

    async init() {
        try {
            // Create data directory if needed
            const dataDir = path.dirname(this.goblinsFile);
            await fs.mkdir(dataDir, { recursive: true });

            // Load existing goblins from file
            await this.loadGoblins();

            console.log('✅ Goblin Manager Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Goblin Manager Service:', error);
        }
    }

    async loadGoblins() {
        try {
            const data = await fs.readFile(this.goblinsFile, 'utf-8');
            const savedGoblins = JSON.parse(data);

            // Load saved goblins into memory map
            savedGoblins.forEach(goblin => {
                // Mark all loaded goblins as offline initially
                goblin.status = 'offline';
                goblin.lastSeen = goblin.lastSeen || new Date().toISOString();

                // Add default name, location, description for backward compatibility
                goblin.name = goblin.name || goblin.id;
                goblin.location = goblin.location || '';
                goblin.description = goblin.description || '';

                this.goblins.set(goblin.id, goblin);
            });

            console.log(`📡 Loaded ${savedGoblins.length} goblins from registry`);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty registry
            console.error('❌ Error loading goblins:', error.message);
            console.log('📡 Starting with empty goblin registry');
            this.goblins.clear();
        }
    }

    async saveGoblins() {
        try {
            const goblinsArray = Array.from(this.goblins.values());
            await writeJsonAtomic(this.goblinsFile, goblinsArray);
            return true;
        } catch (error) {
            console.error('Error saving goblins:', error);
            return false;
        }
    }

    async registerGoblin(goblinData) {
        try {
            const {
                goblinId,
                endpoint,
                capabilities = ['video', 'audio'],
                platform = 'unknown',
                version = '1.0.0',
                metadata = {}
            } = goblinData;

            if (!goblinId || !endpoint) {
                return { success: false, error: 'Missing required fields: goblinId and endpoint' };
            }

            const existing = this.goblins.get(goblinId) || {};
            // Where the screen sits and how it reads is operator knowledge, not device
            // state: a re-registration that does not mention it keeps what is recorded.
            const display = {};
            for (const field of GOBLIN_DISPLAY_FIELDS) {
                const value = metadata[field] !== undefined ? metadata[field] : existing[field];
                if (value !== undefined && value !== null && value !== '') display[field] = value;
            }
            const goblin = {
                id: goblinId,
                name: metadata.name || existing.name || goblinId,  // friendly name from metadata, else the recorded one, else the ID
                endpoint,
                capabilities,
                platform,
                version,
                status: 'online',
                registeredAt: this.goblins.has(goblinId) ?
                    this.goblins.get(goblinId).registeredAt :
                    new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                lockedBy: null,
                lockedAt: null,
                ...display,
                location: display.location || '',
                description: metadata.description || existing.description || '',
                // Operator intent, not state: survives re-registration so a
                // storage-shelf goblin that briefly comes up for maintenance
                // doesn't silently rejoin the reconnect loop when it goes
                // back in the box (UP-12).
                ...(this.goblins.get(goblinId)?.expectedOffline === true ? { expectedOffline: true } : {}),
                settings: {
                    audioEnabled: true,
                    videoEnabled: true,
                    volume: 100,
                    autoLock: false,
                    ...this.goblins.get(goblinId)?.settings
                }
            };

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`👹 Goblin registered: ${goblinId} (${goblin.name}) at ${endpoint}`);
            return { success: true, goblin };
        } catch (error) {
            console.error('Error registering goblin:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 👽 FACEHUGGER DEPLOYMENT! 👽
     * Deploy Goblin system to a fresh host, then register it
     */
    async deployAndRegisterGoblin(goblinData, sshPassword, progressCallback) {
        try {
            const { goblinId, endpoint, metadata = {} } = goblinData;

            if (!goblinId || !endpoint) {
                return { success: false, error: 'Missing required fields: goblinId and endpoint' };
            }

            if (!sshPassword) {
                return { success: false, error: 'SSH password required for deployment' };
            }

            // Extract IP from endpoint (e.g., "http://192.168.8.161:3001" -> "192.168.8.161")
            const ipMatch = endpoint.match(/\/\/([^:]+)/);
            if (!ipMatch) {
                return { success: false, error: 'Invalid endpoint format' };
            }
            const ipAddress = ipMatch[1];

            console.log(`👽 FACEHUGGER DEPLOYING to ${ipAddress}...`);

            // Deploy using the facehugger service
            const deployResult = await goblinDeploymentService.deployToHost(
                goblinId,
                ipAddress,
                sshPassword,
                progressCallback
            );

            if (!deployResult.success) {
                return {
                    success: false,
                    error: `Deployment failed: ${deployResult.error}`,
                    deploymentId: deployResult.deploymentId
                };
            }

            // Now register the goblin
            const registerResult = await this.registerGoblin(goblinData);

            if (registerResult.success) {
                console.log(`👽 FACEHUGGER SUCCESS! Goblin ${goblinId} deployed and registered!`);
            }

            return {
                ...registerResult,
                deployed: true,
                deploymentId: deployResult.deploymentId,
                message: `👽 Goblin ${goblinId} deployed and registered successfully!`
            };

        } catch (error) {
            console.error('Error in facehugger deployment:', error);
            return { success: false, error: error.message };
        }
    }

    async unregisterGoblin(goblinId) {
        try {
            if (!this.goblins.has(goblinId)) {
                return { success: false, error: 'Goblin not found' };
            }

            this.goblins.delete(goblinId);
            await this.saveGoblins();

            console.log(`👋 Goblin unregistered: ${goblinId}`);
            return { success: true, message: 'Goblin unregistered successfully' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getGoblins(options = {}) {
        try {
            let goblins = Array.from(this.goblins.values());

            // Apply filters
            if (options.status) {
                goblins = goblins.filter(g => g.status === options.status);
            }

            if (options.capability) {
                goblins = goblins.filter(g => g.capabilities.includes(options.capability));
            }

            if (options.available) {
                goblins = goblins.filter(g => g.status === 'online' && !g.lockedBy);
            }

            // Sort by last seen (most recent first)
            goblins.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

            return {
                success: true,
                goblins,
                total: goblins.length,
                online: goblins.filter(g => g.status === 'online').length,
                available: goblins.filter(g => g.status === 'online' && !g.lockedBy).length
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Find a Goblin by what a person or a scene calls it. In order: the exact
     * registry id (`goblin-192-168-8-14`), then the name case-insensitively
     * ("goblin 3"), then the name with spaces and punctuation ignored ("goblin3",
     * the unit's hostname). Two Goblins answering to the same name is an error, never
     * a guess: a cast must not land on the wrong screen.
     *
     * @param {string|{id?:string,name?:string}} nameOrId
     * @returns {{success:true, goblin:object, id:string, matchedBy:'id'|'name'|'loose-name'}
     *          |{success:false, error:string, notFound?:true, ambiguous?:true, candidates?:Array}}
     */
    resolveGoblin(nameOrId) {
        const raw = nameOrId && typeof nameOrId === 'object' ? (nameOrId.id || nameOrId.name) : nameOrId;
        const key = String(raw ?? '').trim();
        if (!key) return { success: false, notFound: true, error: 'A Goblin name or id is required' };
        const exact = this.goblins.get(key);
        if (exact) return { success: true, goblin: exact, id: exact.id, matchedBy: 'id' };
        const all = Array.from(this.goblins.values()).filter(g => g && g.id);
        const pick = (matches, matchedBy) => {
            if (matches.length === 1) return { success: true, goblin: matches[0], id: matches[0].id, matchedBy };
            if (matches.length > 1) {
                return {
                    success: false,
                    ambiguous: true,
                    candidates: matches.map(g => ({ id: g.id, name: g.name })),
                    error: `"${key}" matches ${matches.length} Goblins (${matches.map(g => g.id).join(', ')}) — use the id`
                };
            }
            return null;
        };
        const byName = pick(all.filter(g => goblinNameKey(g.name) === goblinNameKey(key)), 'name');
        if (byName) return byName;
        const loose = goblinLooseKey(key);
        const byLoose = loose ? pick(all.filter(g => goblinLooseKey(g.name) === loose), 'loose-name') : null;
        if (byLoose) return byLoose;
        return { success: false, notFound: true, error: `No Goblin with id or name "${key}"` };
    }

    async getGoblin(goblinId) {
        try {
            // Accepts a name as well as an id (resolveGoblin): the scene executor looks a
            // Goblin up here before casting, so a step may name its screen.
            const found = this.resolveGoblin(goblinId);
            if (!found.success) {
                return { success: false, error: found.ambiguous ? found.error : 'Goblin not found', ambiguous: !!found.ambiguous };
            }
            return { success: true, goblin: found.goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async updateGoblinSettings(goblinId, settings) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            // Update settings
            goblin.settings = { ...goblin.settings, ...settings };
            goblin.lastUpdated = new Date().toISOString();

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            // Push settings to Goblin if it's online
            if (goblin.status === 'online') {
                try {
                    await fetchWithTimeout(`${goblin.endpoint}/settings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(settings)
                    }, 5000);
                } catch (error) {
                    console.warn(`Failed to push settings to goblin ${goblinId}:`, error.message);
                }
            }

            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async lockGoblin(goblinId, lockingEntity) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is not online' };
            }

            if (goblin.lockedBy && goblin.lockedBy !== lockingEntity) {
                const lockAge = Date.now() - new Date(goblin.lockedAt).getTime();
                if (lockAge < this.lockTimeout) {
                    return {
                        success: false,
                        error: `Goblin is locked by ${goblin.lockedBy}`,
                        lockedBy: goblin.lockedBy,
                        lockedAt: goblin.lockedAt,
                        timeRemaining: this.lockTimeout - lockAge
                    };
                }
                // Lock expired, proceed with new lock
            }

            goblin.lockedBy = lockingEntity;
            goblin.lockedAt = new Date().toISOString();

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`🔒 Goblin locked: ${goblinId} by ${lockingEntity}`);
            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async unlockGoblin(goblinId, unlockingEntity) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            // Allow unlocking by the same entity or if lock expired
            const lockAge = goblin.lockedAt ? Date.now() - new Date(goblin.lockedAt).getTime() : 0;
            const canUnlock = !goblin.lockedBy ||
                goblin.lockedBy === unlockingEntity ||
                lockAge >= this.lockTimeout;

            if (!canUnlock) {
                return { success: false, error: 'Cannot unlock goblin' };
            }

            goblin.lockedBy = null;
            goblin.lockedAt = null;

            this.goblins.set(goblinId, goblin);
            await this.saveGoblins();

            console.log(`🔓 Goblin unlocked: ${goblinId}`);
            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async heartbeat(goblinId, statusUpdate = {}) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not registered' };
            }

            // Update status
            goblin.status = 'online';
            goblin.lastSeen = new Date().toISOString();

            // Update any provided status fields
            if (statusUpdate.memory) goblin.memory = statusUpdate.memory;
            if (statusUpdate.uptime) goblin.uptime = statusUpdate.uptime;
            if (statusUpdate.currentVideo) goblin.currentVideo = statusUpdate.currentVideo;
            if (statusUpdate.currentAudio) goblin.currentAudio = statusUpdate.currentAudio;

            this.goblins.set(goblinId, goblin);

            // Check for lock expiration
            if (goblin.lockedBy && goblin.lockedAt) {
                const lockAge = Date.now() - new Date(goblin.lockedAt).getTime();
                if (lockAge >= this.lockTimeout) {
                    console.log(`⏰ Lock expired for goblin: ${goblinId}`);
                    goblin.lockedBy = null;
                    goblin.lockedAt = null;
                    this.goblins.set(goblinId, goblin);
                }
            }

            return { success: true, goblin };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Resolve a registered, online Goblin or explain why not.
     */
    async _onlineGoblin(goblinId, { ping = false } = {}) {
        const found = this.resolveGoblin(goblinId);
        if (!found.success) return { error: found.ambiguous ? found.error : 'Goblin not found' };
        const goblin = found.goblin;
        if (goblin.status !== 'online' || ping) {
            // Every Goblin is marked offline at startup and only comes back on the 30 s
            // reconnect tick, so the first minute after a restart refused real devices.
            // Ask the device itself before saying no (skipping units shelved on purpose).
            // `ping` asks even when the registry says online: a deploy must not trust a
            // flag that can be two minutes old.
            if (!this.isExpectedOffline(goblin)) {
                const answer = await this.pingGoblin(goblin.id);
                if (ping && answer && answer.success && !answer.online) goblin.status = 'offline';
            }
            if (goblin.status !== 'online') return { error: `${goblin.name || goblin.id} is not online` };
        }
        return { goblin };
    }

    // ─── Per-Goblin serialization, casts, holds ──────────────────────────────

    /**
     * Run `fn` as the only command sequence on this Goblin. Callers queue behind a
     * running sequence for up to `waitMs` (0 = do not wait: the keep-alive skips a
     * busy Goblin rather than queue behind a deploy). Not re-entrant: public methods
     * take the lock and call the `_…Unlocked` internals.
     */
    async _withGoblinLock(goblinId, label, fn, { waitMs = 30000 } = {}) {
        this._opRunning = this._opRunning || new Map();
        const tailEntry = this._opLocks.get(goblinId);
        const busyError = (waited) => {
            const running = this._opRunning.get(goblinId) || tailEntry;
            const what = running ? running.label : 'another command';
            return { success: false, busy: true, error: `${this._goblinLabel(goblinId)} is busy (${what})${waited ? ` — waited ${Math.round(waitMs / 1000)} s` : ''}` };
        };
        if (tailEntry && waitMs === 0) return busyError(false);
        const previous = tailEntry ? tailEntry.tail : Promise.resolve();
        let release;
        const mine = new Promise(resolve => { release = resolve; });
        const entry = { label, tail: previous.then(() => mine) };
        this._opLocks.set(goblinId, entry);
        const finish = () => {
            release();
            if (this._opLocks.get(goblinId) === entry) this._opLocks.delete(goblinId);
        };
        if (tailEntry) {
            let timer;
            let timedOut = false;
            await Promise.race([previous, new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve(); }, waitMs); })]);
            clearTimeout(timer);
            if (timedOut) {
                // Give our place back without running: the line still waits for the
                // holder, then passes straight through us.
                previous.then(finish, finish);
                return busyError(true);
            }
        }
        this._opRunning.set(goblinId, { label, since: Date.now() });
        try {
            return await fn();
        } finally {
            this._opRunning.delete(goblinId);
            finish();
        }
    }

    /** What is running on (or queued for) a Goblin right now, if anything. */
    busyLabel(goblinId) {
        const running = this._opRunning && this._opRunning.get(goblinId);
        if (running) return running.label;
        const queued = this._opLocks.get(goblinId);
        return queued ? queued.label : null;
    }

    /**
     * Remember that a command reached this Goblin. The keep-alive leaves a Goblin
     * alone for a minute after any command, and a command that puts video back on
     * the screen ends any hold an earlier Stop placed.
     */
    _noteOp(goblinId, kind) {
        this._lastOp.set(goblinId, { at: Date.now(), kind });
        // A one-off cast is not an all-clear: a scene casting to a screen the operator
        // stopped must not hand that screen back to the keep-alive.
        if (['loop', 'resume', 'deploy'].includes(kind)) {
            if (this._holds.delete(goblinId)) {
                console.log(`🎞️ Goblin keep-alive: hold on ${this._goblinLabel(goblinId)} released by a ${kind} command`);
                this._persistKeepAliveState();
            }
            const mem = this.keepAlive.mem.get(goblinId);
            if (mem && mem.needsAttention && kind !== 'play') mem.needsAttention = null;
        }
    }

    _goblinLabel(goblinId) {
        const g = this.goblins.get(goblinId);
        return g && g.name ? `${g.name}` : goblinId;
    }

    /** Keep the keep-alive away from a stopped screen for `holdMs` (0 = no hold). */
    holdKeepAlive(goblinId, holdMs, reason = 'stopped') {
        if (!(holdMs > 0)) { this._holds.delete(goblinId); return null; }
        const hold = { until: Date.now() + holdMs, reason, at: Date.now() };
        this._holds.set(goblinId, hold);
        return hold;
    }

    releaseHold(goblinId) {
        const found = this.resolveGoblin(goblinId);
        if (!found.success) return { success: false, error: found.error };
        const had = this._holds.delete(found.id);
        this._persistKeepAliveState();
        const mem = this.keepAlive.mem.get(found.id);
        if (mem) { mem.needsAttention = null; mem.stormSuspected = false; mem.backoffUntil = 0; mem.failures = 0; }
        return { success: true, goblinId: found.id, released: had };
    }

    async _goblinJson(goblin, pathname, options = {}, timeoutMs = 5000) {
        const response = await fetchWithTimeout(`${goblin.endpoint}${pathname}`, options, timeoutMs);
        let body = null;
        try { body = await response.json(); } catch { body = null; }
        if (!response.ok) {
            throw new Error(`${pathname} → HTTP ${response.status}${body && body.error ? `: ${body.error}` : ''}`);
        }
        return body || {};
    }

    /**
     * What is on the Goblin's own disk, straight from the device (its cached list, or
     * a fresh directory scan when `rescan` is set), plus what it is playing right now.
     * The names here are the ONLY names the device can play.
     */
    async listGoblinVideos(goblinId, { rescan = false } = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            const list = await this._goblinJson(goblin, rescan ? '/api/videos/scan' : '/media', {}, rescan ? 60000 : 8000);
            const videos = Array.isArray(list.videos) ? list.videos : [];
            const playback = await this.getGoblinPlayback(goblinId);
            return { success: true, goblinId, videos, playback: playback.success ? playback : null };
        } catch (err) {
            console.error(`Error listing videos on goblin ${goblinId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * A JPEG frame of a video on a Goblin's disk, as a local file path. Cache first
     * (`data/video-library/goblin-thumbnails/<sha1 of filename>.jpg`), then the
     * library's own thumbnail when it holds a video of the same original name, else
     * one frame grabbed by ffmpeg ON the Goblin over ssh (niced, one at a time per
     * device so a page of 72 rows cannot stack 72 decoders on a Pi 3B+ that is
     * playing). `refresh` discards the cached frame first.
     */
    async getGoblinThumbnail(goblinId, filename, { refresh = false } = {}) {
        const name = sanitizeGoblinFilename(filename);
        if (!name) return { success: false, error: 'not a Goblin video filename' };
        const dir = this.thumbnailDir || GOBLIN_THUMB_DIR;
        const key = createHash('sha1').update(name).digest('hex');
        const cached = path.join(dir, `${key}.jpg`);
        try {
            if (refresh) await fs.unlink(cached).catch(() => {});
            const st = await fs.stat(cached);
            if (st.size > 0) return { success: true, path: cached, source: 'cache' };
        } catch (_) { /* not cached */ }
        await fs.mkdir(dir, { recursive: true });

        // The library may already hold this very video (deployed from here) with a frame.
        try {
            const { default: videoLibraryService } = await import('./videoLibraryService.js');
            const lib = await videoLibraryService.getLibrary({});
            const match = (lib && lib.success && Array.isArray(lib.videos) ? lib.videos : [])
                .find(v => v && v.originalName === name && v.thumbnailPath);
            if (match) {
                const src = path.join(videoLibraryService.thumbnailsDir, match.thumbnailPath);
                await fs.copyFile(src, cached);
                return { success: true, path: cached, source: 'library' };
            }
        } catch (_) { /* no library match — ask the device */ }

        const found = this.resolveGoblin(goblinId);
        if (!found.success) return { success: false, error: found.ambiguous ? found.error : 'Goblin not found' };
        const goblin = found.goblin;
        const host = goblinHost(goblin);
        if (!host) return { success: false, error: 'Goblin has no reachable host in its endpoint' };

        // One grab at a time per device; every waiter for the same file gets the same result.
        this._thumbQueues = this._thumbQueues || new Map();
        const prev = this._thumbQueues.get(host) || Promise.resolve();
        const job = prev.catch(() => {}).then(async () => {
            try {
                const st = await fs.stat(cached);
                if (st.size > 0) return { success: true, path: cached, source: 'cache' };
            } catch (_) { /* generate */ }
            const grab = await grabFrameOnGoblin(host, name);
            if (!grab.success) return grab;
            const tmp = `${cached}.${process.pid}.tmp`;
            await fs.writeFile(tmp, grab.jpeg);
            await fs.rename(tmp, cached);
            return { success: true, path: cached, source: 'goblin' };
        });
        this._thumbQueues.set(host, job);
        return job;
    }

    /**
     * Playback truth from the device: mpv running or not, which file, queue loop mode.
     * `currentVideo` is normalised to the bare filename (the device reports a full path).
     */
    async getGoblinPlayback(goblinId) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            const st = await this._goblinJson(goblin, '/playback-status', {}, 5000);
            const current = typeof st.currentVideo === 'string' ? path.basename(st.currentVideo) : null;
            return {
                success: true,
                goblinId,
                playing: !!st.playing,
                mpvRunning: !!st.mpvRunning,
                currentVideo: current,
                queue: st.queue || null
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    async _isOnGoblin(goblin, filename) {
        const check = async (pathname, timeoutMs) => {
            const list = await this._goblinJson(goblin, pathname, {}, timeoutMs);
            return (Array.isArray(list.videos) ? list.videos : []).some(v => v && v.filename === filename);
        };
        if (await check('/media', 8000)) return true;
        // The device caches its listing; a file that just arrived needs a rescan.
        return check('/api/videos/scan', 60000);
    }

    /**
     * Copy a video file from this node onto a Goblin's media directory over SSH.
     *
     * The previous implementation POSTed the whole file base64-encoded to a
     * `/deploy-video` endpoint the device never had, after buffering it in RAM and
     * tripping the JSON body limit — every deploy failed and some reported success.
     * rsync over the fleet SSH credential streams it, resumes a partial copy, and
     * skips a file the Goblin already holds byte-for-byte. Afterwards the device is
     * asked to rescan and the file is only reported deployed when it lists it at the
     * expected size.
     *
     * @param {string} goblinId
     * @param {{sourcePath:string, targetName:string, title?:string}} videoData
     */
    async deployVideoToGoblin(goblinId, videoData = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        if (!videoData.sourcePath) {
            return { success: false, error: 'deployVideoToGoblin needs a sourcePath on this node (base64 upload is no longer supported)' };
        }
        const targetName = sanitizeGoblinFilename(videoData.targetName);
        if (!targetName) {
            return { success: false, error: `"${videoData.targetName}" is not a filename the Goblin player will list (needs .mp4/.mov/.avi/.mkv)` };
        }
        let sourceSize;
        try {
            sourceSize = (await fs.stat(videoData.sourcePath)).size;
        } catch (err) {
            return { success: false, error: `Source file missing on this node: ${err.message}` };
        }
        const host = goblinHost(goblin);
        if (!host) return { success: false, error: 'Goblin has no reachable host in its endpoint' };

        const started = Date.now();
        const copy = await rsyncToGoblin(videoData.sourcePath, host, targetName);
        if (copy.code !== 0) {
            console.error(`Error deploying video to goblin ${goblinId}: rsync exit ${copy.code}: ${copy.stderr.trim()}`);
            return { success: false, error: `Copy to ${goblin.name || host} failed (rsync exit ${copy.code}): ${copy.stderr.trim().split('\n').pop() || 'no detail'}` };
        }

        try {
            const list = await this._goblinJson(goblin, '/api/videos/scan', {}, 60000);
            const entry = (Array.isArray(list.videos) ? list.videos : []).find(v => v && v.filename === targetName);
            if (!entry) {
                return { success: false, error: `Copied, but ${goblin.name || host} does not list "${targetName}" after a rescan` };
            }
            if (Number(entry.size) !== sourceSize) {
                return { success: false, error: `"${targetName}" on ${goblin.name || host} is ${entry.size} bytes, expected ${sourceSize}` };
            }
            console.log(`📹 Video deployed to goblin ${goblinId}: ${videoData.title || targetName} (${sourceSize} bytes, ${Date.now() - started} ms${copy.transferred ? '' : ', already present'})`);
            await this._noteFileInManifest(goblin, targetName, sourceSize);
            return {
                success: true,
                goblinId,
                goblinName: goblin.name,
                filename: targetName,
                size: sourceSize,
                transferred: copy.transferred,
                elapsedMs: Date.now() - started
            };
        } catch (err) {
            console.error(`Error verifying video on goblin ${goblinId}:`, err.message);
            return { success: false, error: `Copied, but the rescan on ${goblin.name || host} failed: ${err.message}` };
        }
    }

    /**
     * A copy to this Goblin was verified against its own listing: record the file in
     * data/goblin-manifests/<id>.json (and drop it from `staged`), so a scene casting
     * it validates. Only touches an existing manifest; the publisher creates them.
     */
    async _noteFileInManifest(goblin, filename, bytes) {
        if (!this.manifestDir) return;
        const file = path.join(this.manifestDir, `${goblin.id}.json`);
        try {
            await fs.access(file);
        } catch (_) {
            return;
        }
        try {
            await updateJsonUnderLock(file, (manifest) => {
                if (!manifest || !Array.isArray(manifest.clips)) return SKIP_WRITE;
                const staged = Array.isArray(manifest.staged) ? manifest.staged : [];
                const stagedEntry = staged.find(s => s && s.filename === filename);
                const existing = manifest.clips.find(c => c && c.filename === filename);
                if (existing && existing.bytes === bytes && !stagedEntry) return SKIP_WRITE;
                const entry = { ...(stagedEntry && stagedEntry.meta ? stagedEntry.meta : {}), ...(existing || {}), filename, bytes, copiedAt: new Date().toISOString() };
                manifest.clips = manifest.clips.filter(c => c && c.filename !== filename).concat([entry]);
                manifest.staged = staged.filter(s => s && s.filename !== filename);
                manifest.count = manifest.clips.length;
                manifest.updatedAt = entry.copiedAt;
                return manifest;
            }, { defaultValue: null });
        } catch (err) {
            console.warn(`⚠️ Goblin manifest for ${goblin.name || goblin.id} not updated after copying ${filename}: ${err.message}`);
        }
    }

    /**
     * Play a file that is on the Goblin's disk, once, interrupting whatever is showing
     * (the device returns to its queue afterwards unless told otherwise). The device
     * answers success the instant it spawns mpv — before mpv can fail on a bad file —
     * so success here means the device reports mpv running on that file ~1.5 s later.
     * A cast is serialized with every other command on that Goblin (two overlapping
     * casts were one way to orphan an mpv) and remembered, so the keep-alive stays off
     * the screen while it plays. `goblinId` may be a Goblin name (resolveGoblin).
     */
    async playVideoOnGoblin(goblinId, filename, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        if (options.loop) {
            return this.loopVideoOnGoblin(goblin.id, filename, { checkPresence: options.checkPresence, waitMs: options.waitMs });
        }
        return this._withGoblinLock(goblin.id, `cast ${filename}`, async () => {
            try {
                if (options.checkPresence !== false && !(await this._isOnGoblin(goblin, filename))) {
                    return { success: false, notOnGoblin: true, error: `"${filename}" is not on ${goblin.name || goblin.id} — deploy it first` };
                }
                this._casts.set(goblin.id, { filename: path.basename(String(filename)), startedAt: Date.now() });
                this._noteOp(goblin.id, 'play');
                const result = await this._goblinJson(goblin, '/api/video/play-immediate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, returnToQueue: options.returnToQueue !== false })
                }, 10000);
                if (!result.success) return { ...result, success: false };
                const proof = await this._confirmPlaying(goblin.id, filename);
                return { ...result, ...proof, goblinName: goblin.name, filename };
            } catch (err) {
                console.error(`Error playing video on goblin ${goblin.id}:`, err.message);
                return { success: false, error: err.message };
            }
        }, { waitMs: options.waitMs ?? 8000 });
    }

    /**
     * Make one file the Goblin's whole looping queue — what a show display runs all
     * night (a one-file queue in loop mode is ONE mpv --loop on the device). Replaces
     * the current queue; proven by two device reads `proofDelays.settle` apart:
     * mpv on that file, queue playing in loop mode, and no new spawns in between.
     */
    async loopVideoOnGoblin(goblinId, filename, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        return this._withGoblinLock(goblin.id, `loop ${filename}`, async () => {
            try {
                if (options.checkPresence !== false && !(await this._isOnGoblin(goblin, filename))) {
                    return { success: false, notOnGoblin: true, error: `"${filename}" is not on ${goblin.name || goblin.id} — deploy it first` };
                }
                const result = await this._replaceQueueAndProve(goblin, [filename], 'queue', 'loop');
                return { ...result, loop: !!result.success, goblinName: goblin.name, filename };
            } catch (err) {
                console.error(`Error looping video on goblin ${goblin.id}:`, err.message);
                return { success: false, error: err.message };
            }
        }, { waitMs: options.waitMs ?? 30000 });
    }

    /**
     * Stop mpv and the queue on a Goblin, proven by the device reporting mpv stopped.
     *
     * Stops with `/queue/stop`, not `/stop-all`. The device's /stop-all kills mpv
     * BEFORE it lowers the queue's playing flag, so the dying mpv's exit handler can
     * start the queue's clip again in the middle of the stop; that respawn is then
     * forgotten by the server and keeps the display while every later spawn dies at
     * start (the orphan found on Goblin 3 on 2026-10-09, 26 h old, beside 42,680
     * failed spawns). /queue/stop lowers the flag first. A cast's return-to-queue
     * handler can still restart the queue under the stop, so the result is read
     * back and stopped once more if mpv is up again.
     *
     * The stop also holds the keep-alive off this screen for `holdMs` (default the
     * keep-alive's stopHoldMs; 0 = no hold, the keep-alive may bring it back).
     */
    async stopGoblin(goblinId, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        const holdMs = options.holdMs !== undefined && options.holdMs !== null ? Math.max(0, Number(options.holdMs) || 0) : this.keepAlive.config.stopHoldMs;
        // Hold before the stop: a keep-alive look landing in between must not undo it.
        const hold = this.holdKeepAlive(goblin.id, holdMs, options.reason || 'stopped by a command');
        this._lastStop = this._lastStop || new Map();
        this._lastStop.set(goblin.id, { at: Date.now(), holdMs });
        this._lastOp.set(goblin.id, { at: Date.now(), kind: 'stop' });
        this._persistKeepAliveState();
        return this._withGoblinLock(goblin.id, 'stop', async () => {
            try {
                this._noteOp(goblin.id, 'stop');
                this._casts.delete(goblin.id);
                const playback = await this._stopSafely(goblin);
                const stopped = playback.success && !playback.mpvRunning;
                return {
                    success: stopped,
                    goblinName: goblin.name,
                    playback: playback.success ? playback : null,
                    hold: hold ? { until: new Date(hold.until).toISOString(), minutes: Math.round(holdMs / 60000) } : null,
                    error: stopped ? undefined : `${goblin.name} still reports mpv running`
                };
            } catch (err) {
                console.error(`Error stopping goblin ${goblin.id}:`, err.message);
                return { success: false, error: err.message };
            }
        }, { waitMs: options.waitMs ?? 15000 });
    }

    /**
     * The all-clear after a stop: start the Goblin's OWN queue again, in the loop
     * mode it already carries (the device persists its queue across a stop). This
     * is what puts a screen back on its show after a fleet Emergency Stop, and
     * what a test suite that fired one owes the devices afterwards. Nothing is
     * cleared or added. A queue that is already playing is left alone (a second
     * start on a playing device spawns a second mpv). Proven like a loop: two
     * reads, no new spawns between them.
     */
    async resumeGoblinQueue(goblinId, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        return this._withGoblinLock(goblin.id, options.label || 'resume', () => this._resumeUnlocked(goblin, options), { waitMs: options.waitMs ?? 30000 });
    }

    async _resumeUnlocked(goblin, options = {}) {
        try {
            const before = await this.getGoblinPlayback(goblin.id);
            if (!before.success) return { success: false, goblinName: goblin.name, error: before.error };
            const files = queueFilenames(before.queue);
            const loopMode = (before.queue && before.queue.loopMode) || 'queue';
            if (!files.length) {
                return { success: false, goblinName: goblin.name, loopMode, playback: before, error: `${goblin.name}'s queue is empty — nothing to resume (deploy its playlist instead)` };
            }
            this._noteOp(goblin.id, options.opKind || 'resume');
            if (before.mpvRunning && before.queue && before.queue.playing) {
                return { success: true, alreadyPlaying: true, goblinName: goblin.name, loopMode, playback: before };
            }
            if (before.mpvRunning) {
                // A one-off clip is on screen with the queue down: stop it cleanly first.
                await this._stopSafely(goblin);
            }
            this._casts.delete(goblin.id);
            await this._post(goblin, '/queue/start', { loopMode });
            const proof = await this._settledProof(goblin, { files, loopMode });
            return { ...proof, goblinName: goblin.name, loopMode };
        } catch (err) {
            console.error(`Error resuming queue on goblin ${goblin.id}:`, err.message);
            return { success: false, goblinName: goblin.name, error: err.message };
        }
    }

    async _post(goblin, pathname, body = {}, timeoutMs = 10000) {
        return this._goblinJson(goblin, pathname, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }, timeoutMs);
    }

    /** /queue/stop, read back, and once more if mpv came back up under it. */
    async _stopSafely(goblin) {
        await this._post(goblin, '/queue/stop');
        await sleep(800);
        let playback = await this.getGoblinPlayback(goblin.id);
        if (playback.success && playback.mpvRunning) {
            await this._post(goblin, '/queue/stop');
            await sleep(1000);
            playback = await this.getGoblinPlayback(goblin.id);
        }
        return playback;
    }

    /**
     * Replace the Goblin's queue with `files` and start it in `loopMode`, then prove
     * it. Caller holds the Goblin lock. On a failed proof the device is not left
     * retrying: a start that cannot hold the display is stopped again.
     */
    async _replaceQueueAndProve(goblin, files, loopMode, opKind, { start = true } = {}) {
        this._noteOp(goblin.id, opKind);
        this._casts.delete(goblin.id);
        const stopped = await this._stopSafely(goblin);
        if (stopped.success && stopped.mpvRunning) {
            return { success: false, goblinName: goblin.name, error: `${goblin.name} would not stop its current video, so nothing new was started`, playback: stopped };
        }
        await this._post(goblin, '/queue/clear');
        for (const filename of files) await this._post(goblin, '/queue/add', { filename, position: 'end' });
        if (!start) return { success: true, started: false, goblinName: goblin.name };
        await this._post(goblin, '/queue/start', { loopMode });
        return this._settledProof(goblin, { files, loopMode });
    }

    /**
     * The device's own word, twice. The first read 1.5 s after a start, the second
     * `settle` later. Both must show mpv on a playlist file, the queue playing in the
     * expected loop mode with exactly the expected files; and the spawn counter must
     * not move between them for a one-file loop (a few for a real multi-clip queue).
     * A start that fails this and left the device retrying is stopped (`/queue/stop`)
     * so it cannot become a respawn storm.
     */
    async _settledProof(goblin, { files, loopMode }) {
        const want = files.map(f => path.basename(String(f)));
        const single = want.length === 1;
        const read = async () => {
            let st;
            try { st = await this._goblinJson(goblin, '/playback-status', {}, 5000); } catch (err) { return { ok: false, error: err.message }; }
            const queue = st.queue || {};
            const current = typeof st.currentVideo === 'string' ? path.basename(st.currentVideo) : null;
            const queued = queueFilenames(queue);
            const checks = {
                mpvRunning: !!st.mpvRunning,
                onPlaylistFile: !!current && want.includes(current),
                queuePlaying: queue.playing === true,
                loopMode: !loopMode || queue.loopMode === loopMode,
                queueMatches: queued.length === want.length && want.every((f, k) => f === queued[k])
            };
            return {
                ok: Object.values(checks).every(Boolean), checks, current, playCount: queuePlayCount(queue),
                playback: { success: true, goblinId: goblin.id, playing: !!st.playing, mpvRunning: !!st.mpvRunning, currentVideo: current, queue: st.queue || null }
            };
        };
        await sleep(this.proofDelays.first);
        const first = await read();
        await sleep(this.proofDelays.settle);
        const second = await read();
        const spawns = Number.isFinite(first.playCount) && Number.isFinite(second.playCount) ? second.playCount - first.playCount : null;
        const spawnLimit = single ? 0 : Math.ceil(this.proofDelays.settle / 6000) + 1;
        const storm = spawns !== null && spawns > spawnLimit;
        const success = !!(first.ok && second.ok && !storm);
        let error;
        if (!success) {
            const c = second.checks || {};
            if (second.error) error = `could not read ${goblin.name}'s status: ${second.error}`;
            else if (storm) error = `mpv started ${spawns} times in ${Math.round(this.proofDelays.settle / 1000)} s — it cannot hold the display (a stray mpv owning it, or the TV off or on another input)`;
            else if (!c.mpvRunning) error = `mpv is not running ${Math.round((this.proofDelays.first + this.proofDelays.settle) / 1000)} s after the start — the file is unplayable or the display is unavailable`;
            else if (!c.onPlaylistFile) error = `mpv is showing "${second.current}", not ${want.length === 1 ? `"${want[0]}"` : 'the playlist'}`;
            else if (!c.queueMatches) error = `${goblin.name}'s queue does not hold the expected files`;
            else if (!c.loopMode) error = `${goblin.name}'s queue is not in ${loopMode} mode`;
            else if (!c.queuePlaying) error = `${goblin.name}'s queue is not playing`;
            else error = `${goblin.name} did not look settled on the first read`;
        }
        let stoppedAfterFailure = false;
        const retrying = second.playback && second.playback.queue && second.playback.queue.playing === true && !second.playback.mpvRunning;
        if (!success && (storm || retrying)) {
            try {
                await this._post(goblin, '/queue/stop');
                stoppedAfterFailure = true;
                console.warn(`⚠️ Goblin ${goblin.name}: start failed its proof (${error}); queue stopped so the device does not keep respawning mpv`);
            } catch (err) {
                console.warn(`⚠️ Goblin ${goblin.name}: start failed its proof and the follow-up stop failed too: ${err.message}`);
            }
        }
        return {
            success,
            accepted: true,
            verified: success,
            storm,
            spawns,
            stoppedAfterFailure,
            playback: second.playback || first.playback || null,
            reads: [first, second].map(r => ({ ok: !!r.ok, current: r.current || null, playCount: Number.isFinite(r.playCount) ? r.playCount : null, checks: r.checks || null, error: r.error })),
            error
        };
    }

    async _confirmPlaying(goblinId, filename) {
        await sleep(this.proofDelays.first);
        const playback = await this.getGoblinPlayback(goblinId);
        if (!playback.success) {
            return { success: false, accepted: true, error: `Play accepted but the Goblin's status could not be read: ${playback.error}` };
        }
        const showing = playback.mpvRunning && playback.currentVideo === path.basename(String(filename));
        return {
            success: showing,
            accepted: true,
            verified: showing,
            playback,
            error: showing ? undefined : `Goblin accepted "${filename}" but mpv is ${playback.mpvRunning ? `showing "${playback.currentVideo}"` : 'not running'} — the file is probably unplayable`
        };
    }

    // ─── Playlists on the device (the hardened deploy) ───────────────────────

    /**
     * Put a playlist on a Goblin and prove it plays. In order:
     *   1. ping the device (never trust the registry's flag),
     *   2. compare the playlist with the device's own listing; copy any missing file
     *      that has a `source` on this node (rsync), refuse if one has none,
     *   3. under the Goblin's lock: stop safely, clear, add, start in its loop mode,
     *   4. prove it with two reads and a steady spawn counter.
     * A Stop that lands while files are still copying wins: nothing is started.
     *
     * @param {string} goblinId  id or name
     * @param {{id?:string,name?:string,videos:Array<{filename:string,source?:string}>,loopMode?:string}} playlist
     * @param {{startImmediately?:boolean, opKind?:string, lockWaitMs?:number}} options
     */
    async applyPlaylistToGoblin(goblinId, playlist, options = {}) {
        const startedAt = Date.now();
        const { goblin, error } = await this._onlineGoblin(goblinId, { ping: true });
        if (error) return { success: false, goblinId, error };
        const files = (playlist && Array.isArray(playlist.videos) ? playlist.videos : [])
            .slice().sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(v => (typeof v === 'string' ? { filename: v } : { ...v }))
            .map(v => ({ ...v, filename: sanitizeGoblinFilename(v.filename) }));
        if (!files.length) return { success: false, goblinId: goblin.id, goblinName: goblin.name, error: 'the playlist has no videos' };
        const bad = files.find(v => !v.filename);
        if (bad) return { success: false, goblinId: goblin.id, goblinName: goblin.name, error: 'the playlist names a file the Goblin player cannot list (needs a bare .mp4/.mov/.avi/.mkv name)' };
        const loopMode = ['none', 'single', 'queue'].includes(playlist.loopMode) ? playlist.loopMode : 'queue';

        this._deploying = this._deploying || new Map();
        if (this._deploying.has(goblin.id)) {
            return { success: false, busy: true, goblinId: goblin.id, goblinName: goblin.name, error: `${goblin.name} is already receiving a playlist (${this._deploying.get(goblin.id)})` };
        }
        this._deploying.set(goblin.id, playlist.name || playlist.id || 'playlist');
        try {
            // 2. presence, against the device's own listing
            let listing;
            try {
                listing = await this._goblinJson(goblin, '/media', {}, 8000);
            } catch (err) {
                return { success: false, goblinId: goblin.id, goblinName: goblin.name, error: `could not read ${goblin.name}'s media list: ${err.message}` };
            }
            const onDevice = new Map((Array.isArray(listing.videos) ? listing.videos : []).map(v => [v.filename, v]));
            let missing = files.filter(v => !onDevice.has(v.filename));
            if (missing.length) {
                // The listing is cached for 5 min on the device; a file that just landed needs a rescan.
                try {
                    const fresh = await this._goblinJson(goblin, '/api/videos/scan', {}, 60000);
                    for (const v of (Array.isArray(fresh.videos) ? fresh.videos : [])) onDevice.set(v.filename, v);
                    missing = files.filter(v => !onDevice.has(v.filename));
                } catch (_) { /* keep the cached answer */ }
            }
            const copied = [];
            for (const v of missing) {
                if (!v.source) {
                    return { success: false, goblinId: goblin.id, goblinName: goblin.name, missing: missing.map(m => m.filename), error: `"${v.filename}" is not on ${goblin.name} and the playlist has no source for it on this node` };
                }
                const deployed = await this.deployVideoToGoblin(goblin.id, { sourcePath: v.source, targetName: v.filename, title: playlist.name });
                if (!deployed.success) {
                    return { success: false, goblinId: goblin.id, goblinName: goblin.name, copied, error: `copying "${v.filename}" to ${goblin.name} failed: ${deployed.error}` };
                }
                copied.push({ filename: v.filename, bytes: deployed.size, transferred: deployed.transferred, elapsedMs: deployed.elapsedMs });
            }
            // A Stop issued while the files were copying wins.
            const hold = this._holds.get(goblin.id);
            if (hold && hold.at >= startedAt) {
                return { success: false, goblinId: goblin.id, goblinName: goblin.name, copied, error: `${goblin.name} was stopped while the playlist was copying; not starting it` };
            }
            // 3 + 4, as the only command sequence on this Goblin
            const result = await this._withGoblinLock(goblin.id, `playlist ${playlist.name || playlist.id || ''}`.trim(),
                () => this._replaceQueueAndProve(goblin, files.map(v => v.filename), loopMode, options.opKind || 'deploy', { start: options.startImmediately !== false }),
                { waitMs: options.lockWaitMs ?? 30000 });
            return { ...result, goblinId: goblin.id, goblinName: goblin.name, loopMode, files: files.map(v => v.filename), copied };
        } catch (err) {
            console.error(`Error applying playlist to goblin ${goblin.id}:`, err.message);
            return { success: false, goblinId: goblin.id, goblinName: goblin.name, error: err.message };
        } finally {
            this._deploying.delete(goblin.id);
        }
    }

    async pingGoblin(goblinId) {
        try {
            const found = this.resolveGoblin(goblinId);
            if (!found.success) {
                return { success: false, error: found.ambiguous ? found.error : 'Goblin not found' };
            }
            const goblin = found.goblin;
            // Native fetch with a real timeout (fetchWithTimeout), the same client every
            // other device call here uses.
            const response = await fetchWithTimeout(`${goblin.endpoint}/health`, {}, 5000);

            if (response.status === 200) {
                // Goblin is responsive. Only a status TRANSITION is persisted: the
                // registry used to be rewritten on every successful re-ping, which
                // for three healthy devices was ~1,700 tmp+rename writes a day to the
                // SD card and a perpetually dirty data/goblins.json. lastSeen still
                // advances in memory (the API and the sort read it from there).
                const wasOffline = goblin.status !== 'online';
                goblin.status = 'online';
                goblin.lastSeen = new Date().toISOString();
                if (wasOffline) await this.saveGoblins();
                return { success: true, online: true, goblin };
            }

            return { success: true, online: false };
        } catch (error) {
            return { success: true, online: false, error: error.message };
        }
    }

    /**
     * A goblin the operator has marked expected-offline (a unit on the storage
     * shelf) must not be dialed while it is down: the reconnect loop otherwise
     * retries it every 30s FOREVER — pure network and log churn against a box
     * that is unplugged on purpose (v11 audit UP-12). The flag never blocks an
     * ONLINE goblin: if the unit comes up and heartbeats in, it works normally.
     * Settable without a new route via the existing settings API:
     *   PUT /goblin-management/api/goblin/:id/settings { "expectedOffline": true }
     * (honored from goblin.settings), or top-level on the registry record.
     */
    isExpectedOffline(goblin) {
        return !!(goblin && (goblin.expectedOffline === true
            || (goblin.settings && goblin.settings.expectedOffline === true)));
    }

    async attemptReconnectAll() {
        const offlineGoblins = Array.from(this.goblins.values())
            .filter(g => g.status === 'offline' && g.endpoint && !this.isExpectedOffline(g));

        if (offlineGoblins.length === 0) {
            return { success: true, attempted: 0, reconnected: 0 };
        }

        // Log the attempt at most once every 10 minutes. This line used to print
        // on every ~30s retry and, with goblins permanently offline, became 63%
        // of an 8.5MB service log in one night — pure SD-card wear. The retry
        // behaviour is unchanged; only the narration is throttled. State CHANGES
        // (went offline / reconnected) still log every time below.
        const now = Date.now();
        if (!this._lastReconnectLogAt || (now - this._lastReconnectLogAt) > 10 * 60 * 1000) {
            console.log(`🔄 Attempting to reconnect ${offlineGoblins.length} offline goblins... (retrying every cycle; this line logs at most every 10min)`);
            this._lastReconnectLogAt = now;
        }

        const results = await Promise.allSettled(
            offlineGoblins.map(goblin => this.pingGoblin(goblin.id))
        );

        const reconnected = results.filter(r =>
            r.status === 'fulfilled' && r.value.success && r.value.online
        ).length;

        if (reconnected > 0) {
            console.log(`✅ Reconnected ${reconnected} goblin(s)`);
        }

        return {
            success: true,
            attempted: offlineGoblins.length,
            reconnected
        };
    }

    startHeartbeatMonitor() {
        // Guard against stacking: nothing stored the handle, so a second call
        // (re-init, tests) would run two monitors dialing every offline goblin
        // forever.
        if (this._heartbeatTimer) return;
        this._heartbeatTimer = setInterval(async () => {
            const now = Date.now();
            let changed = false;

            for (const [goblinId, goblin] of this.goblins) {
                const lastSeen = new Date(goblin.lastSeen).getTime();
                const timeSinceLastSeen = now - lastSeen;

                // Nothing heartbeats in (the device never registers or calls the
                // heartbeat alias), so a Goblin's lastSeen only moves when WE ping it.
                // Expiring it after 2 minutes and re-pinging it in the same tick made
                // every healthy Goblin flap offline→online every ~150 s, with a
                // registry save and a "went offline" line each time. Ask the device
                // first; only a Goblin that does not answer is marked offline.
                if (goblin.status === 'online' && timeSinceLastSeen > 2 * 60 * 1000) {
                    const alive = !this.isExpectedOffline(goblin) && (await this.pingGoblin(goblinId)).online;
                    if (!alive) {
                        console.log(`💀 Goblin went offline: ${goblinId}${this.isExpectedOffline(goblin) ? ' (expected — reconnect loop will not dial it)' : ''}`);
                        goblin.status = 'offline';
                        changed = true;
                    }
                }

                // Auto-unlock if locked too long without heartbeat
                if (goblin.lockedBy && goblin.lockedAt) {
                    const lockAge = now - new Date(goblin.lockedAt).getTime();
                    if (lockAge >= this.lockTimeout) {
                        console.log(`🔓 Auto-unlocked goblin: ${goblinId}`);
                        goblin.lockedBy = null;
                        goblin.lockedAt = null;
                        changed = true;
                    }
                }
            }

            if (changed) {
                await this.saveGoblins();
            }

            // Attempt to reconnect offline goblins every 30 seconds
            await this.attemptReconnectAll();

        }, this.heartbeatInterval);

        console.log('💓 Goblin heartbeat monitor started');
    }

    // ─── Display hints ───────────────────────────────────────────────────────

    /**
     * Record where a screen is and how it reads (location, placement, orientation,
     * readsFrom). Operator knowledge that the board shows and the reels were cut for;
     * survives re-registration. Orientation is one of GOBLIN_ORIENTATIONS.
     */
    async updateGoblinDisplay(goblinId, hints = {}) {
        const found = this.resolveGoblin(goblinId);
        if (!found.success) return { success: false, error: found.error };
        const goblin = found.goblin;
        const changes = {};
        for (const field of GOBLIN_DISPLAY_FIELDS) {
            if (hints[field] === undefined) continue;
            const value = hints[field] === null ? '' : String(hints[field]).trim().slice(0, 300);
            if (field === 'orientation' && value && !GOBLIN_ORIENTATIONS.includes(value)) {
                return { success: false, error: `orientation must be one of ${GOBLIN_ORIENTATIONS.join(', ')}` };
            }
            changes[field] = value;
        }
        if (!Object.keys(changes).length) return { success: false, error: `nothing to change (fields: ${GOBLIN_DISPLAY_FIELDS.join(', ')})` };
        Object.assign(goblin, changes, { lastUpdated: new Date().toISOString() });
        await this.saveGoblins();
        return { success: true, goblin };
    }

    displayHints(goblin) {
        const out = {};
        for (const field of GOBLIN_DISPLAY_FIELDS) out[field] = goblin && goblin[field] ? goblin[field] : '';
        return out;
    }

    // ─── Keep-alive: video back on every screen that should have it ──────────
    //
    // One node runs it (data/goblin-keepalive.json names the controller host; the
    // file travels to every node with a deploy, and every node runs this service).
    // Every pollIntervalMs it reads each Goblin's /playback-status (and /health for
    // uptime) and decides with decideKeepAlive():
    //   - a non-empty queue that is stopped is started again (after two looks, and
    //     after the hold a Stop places: a Stop from this node holds stopHoldMs, a stop
    //     seen on the device from anywhere else is held stopHoldMs from when it was
    //     first seen, so a fleet Emergency Stop keeps the screens dark that long and a
    //     forgotten all-clear does not keep them dark all night);
    //   - a Goblin that comes back (off the network, or restarted) with an empty or
    //     different queue, or any Goblin with an EMPTY queue, gets its staged playlist,
    //     files copied from this node first when the device lacks them.
    // It never restarts goblin.service or reboots anything, fires at most one start
    // per Goblin per minute, never during a cast or another command, and stands down
    // on a Goblin whose start could not hold the display until someone looks at it.

    setStagedPlaylistProvider(provider, onApplied = null) {
        this._stagedPlaylistProvider = typeof provider === 'function' ? provider : null;
        this._playlistAppliedHook = typeof onApplied === 'function' ? onApplied : null;
    }

    stagedPlaylistFor(goblinId) {
        try {
            return this._stagedPlaylistProvider ? (this._stagedPlaylistProvider(goblinId) || null) : null;
        } catch (err) {
            console.error('Goblin keep-alive: staged playlist lookup failed:', err.message);
            return null;
        }
    }

    async loadKeepAliveConfig() {
        let fileConfig = {};
        try {
            fileConfig = JSON.parse(await fs.readFile(this.keepAliveFile, 'utf-8')) || {};
        } catch (err) {
            if (err.code !== 'ENOENT') console.warn(`⚠️ Goblin keep-alive: ${this.keepAliveFile} is unreadable (${err.message}); keep-alive off`);
        }
        const cfg = { ...KEEPALIVE_DEFAULTS };
        for (const key of Object.keys(KEEPALIVE_DEFAULTS)) {
            if (fileConfig[key] !== undefined && fileConfig[key] !== null) cfg[key] = fileConfig[key];
        }
        const num = (key, min) => { cfg[key] = Math.max(min, Number(cfg[key]) || KEEPALIVE_DEFAULTS[key]); };
        num('pollIntervalMs', 10000);
        num('minActionIntervalMs', 60000); // the one-start-per-minute floor is not configurable away
        num('stoppedDebounceMs', 10000);
        num('stopHoldMs', 0);
        num('castGuardMs', 30000);
        num('castMinGuardMs', 5000);
        num('maxBackoffMs', 120000);
        num('startupDelayMs', 0);
        cfg.enabled = cfg.enabled === true;
        cfg.controllerHost = cfg.controllerHost ? String(cfg.controllerHost) : null;
        this.keepAlive.config = cfg;
        return cfg;
    }

    /** Whether THIS node runs the keep-alive, and why (env MB_GOBLIN_KEEPALIVE=on|off overrides the file). */
    keepAliveRole() {
        const env = String(process.env.MB_GOBLIN_KEEPALIVE || '').trim().toLowerCase();
        const host = os.hostname();
        const cfg = this.keepAlive.config;
        if (['off', '0', 'false', 'no'].includes(env)) return { run: false, reason: 'MB_GOBLIN_KEEPALIVE=off' };
        if (['on', '1', 'true', 'yes'].includes(env)) return { run: true, reason: 'MB_GOBLIN_KEEPALIVE=on' };
        if (!cfg.enabled) return { run: false, reason: `disabled in ${path.basename(this.keepAliveFile)}` };
        if (!cfg.controllerHost) return { run: false, reason: `no controllerHost in ${path.basename(this.keepAliveFile)}` };
        if (goblinNameKey(cfg.controllerHost) !== goblinNameKey(host)) return { run: false, reason: `the controller is ${cfg.controllerHost}; this node is ${host}` };
        return { run: true, reason: `this node (${host}) is the controller` };
    }

    async initKeepAlive() {
        await this.loadKeepAliveConfig();
        const role = this.keepAliveRole();
        this.keepAlive.reason = role.reason;
        if (!role.run) {
            console.log(`🎞️ Goblin keep-alive: not running on this node (${role.reason})`);
            return;
        }
        await this.restoreKeepAliveState();
        this.startKeepAlive();
    }

    /** Snapshot of the stop bookkeeping that must survive a restart. */
    keepAliveStateSnapshot() {
        const ids = new Set([...this._holds.keys(), ...((this._lastStop && this._lastStop.keys()) || []), ...this.keepAlive.mem.keys()]);
        const goblins = {};
        for (const id of ids) {
            const mem = this.keepAlive.mem.get(id);
            const hold = this._holds.get(id);
            const lastStop = this._lastStop && this._lastStop.get(id);
            const lastOp = this._lastOp.get(id);
            const entry = {};
            if (mem && mem.stoppedSince) entry.stoppedSince = mem.stoppedSince;
            if (hold && hold.until > Date.now()) entry.hold = hold;
            if (lastStop) entry.lastStop = lastStop;
            if (lastOp) entry.lastOp = lastOp;
            if (Object.keys(entry).length) goblins[id] = entry;
        }
        return { savedAt: new Date().toISOString(), goblins };
    }

    /** Debounced write of keepAliveStateSnapshot() (only the controller writes it). */
    _persistKeepAliveState() {
        if (!this.keepAlive.running || !this.keepAliveStateFile) return;
        if (this._kaStateTimer) return;
        this._kaStateTimer = setTimeout(async () => {
            this._kaStateTimer = null;
            try {
                await writeJsonAtomic(this.keepAliveStateFile, this.keepAliveStateSnapshot());
            } catch (err) {
                console.warn(`⚠️ Goblin keep-alive: could not save ${path.basename(this.keepAliveStateFile)}: ${err.message}`);
            }
        }, 2000);
    }

    /** Put back what the last process knew about stopped screens (entries older than a day are dropped). */
    async restoreKeepAliveState() {
        let raw;
        try {
            raw = JSON.parse(await fs.readFile(this.keepAliveStateFile, 'utf-8'));
        } catch (err) {
            if (err.code !== 'ENOENT') console.warn(`⚠️ Goblin keep-alive: ${path.basename(this.keepAliveStateFile)} unreadable (${err.message}); starting fresh`);
            return 0;
        }
        const now = Date.now();
        const dayAgo = now - 24 * 3600 * 1000;
        let restored = 0;
        for (const [id, entry] of Object.entries((raw && raw.goblins) || {})) {
            if (!this.goblins.has(id) || !entry) continue;
            if (Number(entry.stoppedSince) > dayAgo) this._kaMem(id).stoppedSince = Number(entry.stoppedSince);
            if (entry.hold && Number(entry.hold.until) > now) this._holds.set(id, { ...entry.hold, until: Number(entry.hold.until) });
            if (entry.lastStop && Number(entry.lastStop.at) > dayAgo) {
                this._lastStop = this._lastStop || new Map();
                this._lastStop.set(id, { at: Number(entry.lastStop.at), holdMs: Number(entry.lastStop.holdMs) || 0 });
            }
            if (entry.lastOp && Number(entry.lastOp.at) > dayAgo && !this._lastOp.has(id)) this._lastOp.set(id, { at: Number(entry.lastOp.at), kind: String(entry.lastOp.kind) });
            restored += 1;
        }
        if (restored) console.log(`🎞️ Goblin keep-alive: restored stop bookkeeping for ${restored} Goblin(s) from ${path.basename(this.keepAliveStateFile)} (saved ${raw.savedAt})`);
        return restored;
    }

    startKeepAlive() {
        if (this.keepAlive.running) return;
        const cfg = this.keepAlive.config;
        this.keepAlive.running = true;
        this.keepAlive.startedAt = Date.now();
        console.log(`🎞️ Goblin keep-alive: running on ${os.hostname()} — looks every ${Math.round(cfg.pollIntervalMs / 1000)} s, at most one start per Goblin per ${Math.round(cfg.minActionIntervalMs / 1000)} s, a stop holds a screen ${Math.round(cfg.stopHoldMs / 60000)} min, first look in ${Math.round(cfg.startupDelayMs / 1000)} s`);
        const tick = () => this.keepAliveTick().catch(err => console.error('❌ Goblin keep-alive tick failed:', err.message));
        this.keepAlive.startTimer = setTimeout(() => {
            this.keepAlive.startTimer = null;
            if (!this.keepAlive.running) return;
            tick();
            this.keepAlive.timer = setInterval(tick, cfg.pollIntervalMs);
        }, cfg.startupDelayMs);
    }

    stopKeepAlive(reason = 'stopped') {
        if (this.keepAlive.startTimer) clearTimeout(this.keepAlive.startTimer);
        if (this.keepAlive.timer) clearInterval(this.keepAlive.timer);
        this.keepAlive.startTimer = null;
        this.keepAlive.timer = null;
        if (this.keepAlive.running) console.log(`🎞️ Goblin keep-alive: stopped (${reason})`);
        this.keepAlive.running = false;
        this.keepAlive.reason = reason;
    }

    /** Turn the keep-alive on or off for the fleet (persisted; this node becomes the controller when turning on). */
    async setKeepAliveEnabled(enabled) {
        let raw = {};
        try { raw = JSON.parse(await fs.readFile(this.keepAliveFile, 'utf-8')) || {}; } catch (_) { raw = {}; }
        raw.enabled = enabled === true;
        if (raw.enabled && !raw.controllerHost) raw.controllerHost = os.hostname();
        await writeJsonAtomic(this.keepAliveFile, raw);
        await this.loadKeepAliveConfig();
        const role = this.keepAliveRole();
        if (role.run) { this.keepAlive.reason = role.reason; this.startKeepAlive(); } else this.stopKeepAlive(role.reason);
        return this.getKeepAliveStatus();
    }

    _kaMem(goblinId) {
        let mem = this.keepAlive.mem.get(goblinId);
        if (!mem) {
            mem = {
                lastObs: null, failedLooks: 0, firstFailAt: null, seenOffline: false, pendingReturn: false,
                stoppedSince: null, stormSuspected: false, needsAttention: null, failures: 0, backoffUntil: 0,
                lastAction: null, lastDecision: null, checking: false
            };
            this.keepAlive.mem.set(goblinId, mem);
        }
        return mem;
    }

    /** One look at a Goblin: queue, mpv and its file from /playback-status, uptime from /health. */
    async _observeGoblin(goblin) {
        let st;
        try { st = await this._goblinJson(goblin, '/playback-status', {}, 5000); } catch (_) { return null; }
        let uptime = null;
        try { const h = await this._goblinJson(goblin, '/health', {}, 5000); uptime = Number(h.uptime); } catch (_) { /* keep null */ }
        const queue = st.queue || {};
        return {
            at: Date.now(),
            uptime: Number.isFinite(uptime) ? uptime : null,
            videos: queueFilenames(queue),
            loopMode: queue.loopMode || 'none',
            playing: queue.playing === true,
            mpvRunning: !!st.mpvRunning,
            currentVideo: typeof st.currentVideo === 'string' ? path.basename(st.currentVideo) : null,
            playCount: queuePlayCount(queue)
        };
    }

    async keepAliveTick() {
        if (!this.keepAlive.running) return;
        this.keepAlive.lastTickAt = Date.now();
        this.keepAlive.ticks += 1;
        const goblins = Array.from(this.goblins.values()).filter(g => g && g.id && g.endpoint);
        await Promise.allSettled(goblins.map(g => this._keepAliveCheck(g)));
    }

    async _keepAliveCheck(goblin) {
        const mem = this._kaMem(goblin.id);
        if (mem.checking) return;
        mem.checking = true;
        try {
            const cfg = this.keepAlive.config;
            const name = goblin.name || goblin.id;
            if (this.isExpectedOffline(goblin) && goblin.status !== 'online') {
                mem.lastDecision = { at: Date.now(), action: 'none', reason: 'expected offline' };
                return;
            }
            const obs = await this._observeGoblin(goblin);
            const now = Date.now();
            if (!obs) {
                mem.failedLooks += 1;
                if (!mem.firstFailAt) mem.firstFailAt = now;
                // Away for real: two missed looks a minute apart (one Wi-Fi blip is not a return).
                if (!mem.seenOffline && mem.failedLooks >= 2 && now - mem.firstFailAt >= 60000) mem.seenOffline = true;
                mem.lastDecision = { at: now, action: 'none', reason: 'not answering' };
                return;
            }
            const prev = mem.lastObs;
            if (mem.seenOffline) {
                mem.pendingReturn = true;
                mem.seenOffline = false;
                console.log(`🎞️ Goblin keep-alive: ${name} is back (queue: ${obs.videos.length ? obs.videos.join(', ') : 'empty'}, ${obs.mpvRunning ? `showing ${obs.currentVideo}` : 'nothing on screen'})`);
            }
            mem.failedLooks = 0;
            mem.firstFailAt = null;
            if (prev && Number.isFinite(prev.uptime) && Number.isFinite(obs.uptime) && obs.uptime + 5 < prev.uptime) {
                // The player restarted (service restart or reboot): a stray mpv cannot have
                // survived it, so whatever the keep-alive stood down for is gone too.
                mem.pendingReturn = true;
                mem.needsAttention = null;
                mem.stormSuspected = false;
                mem.failures = 0;
                mem.backoffUntil = 0;
                console.log(`🎞️ Goblin keep-alive: ${name}'s player restarted (uptime ${Math.round(prev.uptime)} s → ${Math.round(obs.uptime)} s)`);
            }
            if (prev && detectRespawnStorm(prev, obs, obs.at - prev.at)) {
                if (!mem.stormSuspected) {
                    console.warn(`⚠️ Goblin keep-alive: ${name} is in a respawn storm (${obs.playCount - prev.playCount} mpv starts in ${Math.round((obs.at - prev.at) / 1000)} s) — not adding starts; check \`pgrep -c mpv\` on the unit`);
                }
                mem.stormSuspected = true;
            } else if (mem.stormSuspected && prev && obs.playCount === prev.playCount) {
                mem.stormSuspected = false;
                console.log(`🎞️ Goblin keep-alive: ${name}'s respawn storm is over (spawn count steady at ${obs.playCount})`);
            }
            const stoppedBefore = mem.stoppedSince;
            // Dark-since tracks the QUEUE, not mpv: a cast to a stopped screen runs mpv
            // while the queue stays down, and must not restart the stop's hold clock
            // (a scene casting every few minutes would otherwise keep it dark forever).
            if (obs.mpvRunning && obs.playing) mem.stoppedSince = null;
            else if (!mem.stoppedSince) mem.stoppedSince = now;
            if (stoppedBefore !== mem.stoppedSince) this._persistKeepAliveState();
            const cast = this._casts.get(goblin.id);
            if (cast) {
                const age = now - cast.startedAt;
                const castOver = age > cfg.castGuardMs
                    || (obs.mpvRunning && obs.currentVideo !== cast.filename)
                    || (!obs.mpvRunning && age > cfg.castMinGuardMs);
                if (castOver) this._casts.delete(goblin.id);
            }
            mem.lastObs = obs;

            const staged = this.stagedPlaylistFor(goblin.id);
            const playlist = staged && Array.isArray(staged.videos) && staged.videos.length
                ? { filenames: staged.videos.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map(v => path.basename(String(v.filename))), loopMode: staged.loopMode || 'queue' }
                : null;
            const lastOp = this._lastOp.get(goblin.id);
            const lastStop = this._lastStop && this._lastStop.get(goblin.id);
            const hold = this._holds.get(goblin.id);
            if (hold && hold.until <= now) this._holds.delete(goblin.id);
            const busy = this.busyLabel(goblin.id) || (this._deploying && this._deploying.get(goblin.id) ? `copying playlist ${this._deploying.get(goblin.id)}` : null);
            const decision = decideKeepAlive({
                goblin: {
                    expectedOffline: this.isExpectedOffline(goblin) && goblin.status !== 'online',
                    keepAliveDisabled: goblin.keepAlive === false || (goblin.settings && goblin.settings.keepAlive === false)
                },
                obs,
                mem: {
                    busy,
                    holdUntil: hold && hold.until > now ? hold.until : 0,
                    lastStopNoHold: !!(lastStop && lastStop.holdMs === 0 && lastOp && lastOp.kind === 'stop'),
                    needsAttention: mem.needsAttention,
                    stormSuspected: mem.stormSuspected,
                    backoffUntil: mem.backoffUntil,
                    lastOpAt: lastOp ? lastOp.at : 0,
                    stoppedSince: mem.stoppedSince,
                    pendingReturn: mem.pendingReturn,
                    cast: this._casts.get(goblin.id) || null
                },
                playlist,
                now,
                config: cfg
            });
            // A return is handled once the queue is the staged show (or there is none to apply).
            if (mem.pendingReturn && (!playlist || this._queueMatches(obs, playlist))) mem.pendingReturn = false;
            const previousReason = mem.lastDecision && mem.lastDecision.reason;
            mem.lastDecision = { at: now, action: decision.action, reason: decision.reason, holdUntil: decision.holdUntil || null };
            if (decision.action === 'none') {
                // Narrate only the decisions that explain a dark screen, and only when they change.
                if (decision.reason !== previousReason && /held|attention|storm|backing off/.test(decision.reason)) {
                    console.log(`🎞️ Goblin keep-alive: ${name} — ${decision.reason}`);
                }
                return;
            }
            if (decision.action === 'resume') {
                console.log(`🎞️ Goblin keep-alive: ${name} — ${decision.reason}; starting its queue again (${obs.videos.join(', ')}, ${obs.loopMode})`);
                const result = await this.resumeGoblinQueue(goblin.id, { waitMs: 0, label: 'keep-alive resume', opKind: 'keepalive' });
                this._afterKeepAliveAction(goblin, mem, 'resume', decision, result);
                return;
            }
            if (decision.action === 'apply-playlist') {
                console.log(`🎞️ Goblin keep-alive: ${name} — ${decision.reason}; applying its staged playlist "${staged.name || staged.id}" (${playlist.filenames.join(', ')})`);
                const result = await this.applyPlaylistToGoblin(goblin.id, staged, { opKind: 'keepalive', lockWaitMs: 0 });
                this._afterKeepAliveAction(goblin, mem, 'apply-playlist', decision, result);
                if (result.success && this._playlistAppliedHook) {
                    try { await this._playlistAppliedHook(staged.id, goblin.id, result); } catch (err) { console.error('Goblin keep-alive: recording the playlist deploy failed:', err.message); }
                }
            }
        } finally {
            mem.checking = false;
        }
    }

    _queueMatches(obs, playlist) {
        return !!(obs && playlist && playlist.filenames.length === obs.videos.length
            && playlist.filenames.every((f, k) => f === obs.videos[k])
            && (!playlist.loopMode || playlist.loopMode === obs.loopMode));
    }

    _afterKeepAliveAction(goblin, mem, action, decision, result) {
        const cfg = this.keepAlive.config;
        const name = goblin.name || goblin.id;
        mem.lastAction = {
            at: Date.now(), action, reason: decision.reason, ok: !!result.success, busy: !!result.busy,
            error: result.success ? null : (result.error || 'failed'), spawns: result.spawns ?? null,
            showing: result.playback ? result.playback.currentVideo : null, copied: result.copied || undefined
        };
        if (result.success) {
            mem.failures = 0;
            mem.backoffUntil = 0;
            mem.pendingReturn = false;
            mem.stoppedSince = null;
            this._persistKeepAliveState();
            const pb = result.playback || {};
            console.log(`✅ Goblin keep-alive: ${name} — ${action} proven: mpv on "${pb.currentVideo}", queue ${pb.queue ? pb.queue.loopMode : '?'} and playing, spawn count steady over ${Math.round(this.proofDelays.settle / 1000)} s${result.copied && result.copied.length ? ` (copied ${result.copied.map(c => c.filename).join(', ')} first)` : ''}`);
            return;
        }
        if (result.busy) return; // someone else is working on this Goblin; look again next tick
        mem.failures += 1;
        const backoff = Math.min(cfg.maxBackoffMs, 2 * 60000 * 2 ** (mem.failures - 1));
        mem.backoffUntil = Date.now() + backoff;
        if (result.storm || result.stoppedAfterFailure) {
            mem.needsAttention = `${action} could not hold the display (${result.error})`;
        }
        console.warn(`⚠️ Goblin keep-alive: ${name} — ${action} failed: ${result.error}; ${mem.needsAttention ? 'standing down on this Goblin until it restarts or someone starts it by hand (check `pgrep -c mpv` on the unit)' : `next try in ${Math.round(backoff / 60000)} min`}`);
    }

    /** Everything the keep-alive knows, per Goblin (GET /video-library/api/goblins/keepalive and the board). */
    getKeepAliveStatus() {
        const cfg = this.keepAlive.config;
        const iso = (t) => (t ? new Date(t).toISOString() : null);
        const goblins = Array.from(this.goblins.values()).filter(g => g && g.id).map(g => this.keepAliveStatusFor(g.id));
        return {
            success: true,
            running: this.keepAlive.running,
            reason: this.keepAlive.reason,
            host: os.hostname(),
            controllerHost: cfg.controllerHost,
            config: { ...cfg },
            startedAt: iso(this.keepAlive.startedAt),
            lastTickAt: iso(this.keepAlive.lastTickAt),
            ticks: this.keepAlive.ticks,
            goblins
        };
    }

    keepAliveStatusFor(goblinId) {
        const iso = (t) => (t ? new Date(t).toISOString() : null);
        const g = this.goblins.get(goblinId) || { id: goblinId };
        const mem = this.keepAlive.mem.get(goblinId) || {};
        const hold = this._holds.get(goblinId);
        const cast = this._casts.get(goblinId);
        const staged = this.stagedPlaylistFor(goblinId);
        return {
            id: goblinId,
            name: g.name || goblinId,
            running: this.keepAlive.running,
            busy: this.busyLabel(goblinId) || (this._deploying && this._deploying.get(goblinId)) || null,
            hold: hold && hold.until > Date.now() ? { until: iso(hold.until), reason: hold.reason } : null,
            cast: cast ? { filename: cast.filename, startedAt: iso(cast.startedAt) } : null,
            stagedPlaylist: staged ? { id: staged.id, name: staged.name, files: (staged.videos || []).map(v => v.filename), loopMode: staged.loopMode || 'queue' } : null,
            lastDecision: mem.lastDecision ? { ...mem.lastDecision, at: iso(mem.lastDecision.at), holdUntil: iso(mem.lastDecision.holdUntil) } : null,
            lastAction: mem.lastAction ? { ...mem.lastAction, at: iso(mem.lastAction.at) } : null,
            needsAttention: mem.needsAttention || null,
            stormSuspected: !!mem.stormSuspected,
            pendingReturn: !!mem.pendingReturn,
            backoffUntil: mem.backoffUntil && mem.backoffUntil > Date.now() ? iso(mem.backoffUntil) : null,
            lastLook: mem.lastObs ? {
                at: iso(mem.lastObs.at), mpvRunning: mem.lastObs.mpvRunning, currentVideo: mem.lastObs.currentVideo,
                queue: mem.lastObs.videos, loopMode: mem.lastObs.loopMode, playing: mem.lastObs.playing,
                playCount: mem.lastObs.playCount, uptime: mem.lastObs.uptime
            } : null
        };
    }

    getStats() {
        const goblins = Array.from(this.goblins.values());

        return {
            total: goblins.length,
            online: goblins.filter(g => g.status === 'online').length,
            offline: goblins.filter(g => g.status === 'offline').length,
            expectedOffline: goblins.filter(g => this.isExpectedOffline(g)).length,
            locked: goblins.filter(g => g.lockedBy).length,
            available: goblins.filter(g => g.status === 'online' && !g.lockedBy).length,
            capabilities: {
                video: goblins.filter(g => g.capabilities.includes('video')).length,
                audio: goblins.filter(g => g.capabilities.includes('audio')).length
            }
        };
    }
}

export default new GoblinManagerService();