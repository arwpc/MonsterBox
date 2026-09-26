/**
 * Goblin Management Service
 * Handles registration, monitoring, and control of MonsterBox Goblins
 */

import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import goblinDeploymentService from './goblinDeploymentService.js';
import { writeJsonAtomic } from './atomicStore.js';

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

class GoblinManagerService {
    constructor() {
        this.goblinsFile = path.resolve('./data/goblins.json');
        this.goblins = new Map(); // In-memory goblin registry
        this.lockTimeout = 3 * 60 * 1000; // 3 minutes in milliseconds
        this.heartbeatInterval = 30 * 1000; // 30 seconds

        this.init();
        this.startHeartbeatMonitor();
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

            const goblin = {
                id: goblinId,
                name: metadata.name || goblinId,  // Use friendly name from metadata or fallback to ID
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
                location: metadata.location || '',
                description: metadata.description || '',
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

    async getGoblin(goblinId) {
        try {
            const goblin = this.goblins.get(goblinId);

            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            return { success: true, goblin };
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
    async _onlineGoblin(goblinId) {
        const goblin = this.goblins.get(goblinId);
        if (!goblin) return { error: 'Goblin not found' };
        if (goblin.status !== 'online') {
            // Every Goblin is marked offline at startup and only comes back on the 30 s
            // reconnect tick, so the first minute after a restart refused real devices.
            // Ask the device itself before saying no (skipping units shelved on purpose).
            if (!this.isExpectedOffline(goblin)) await this.pingGoblin(goblinId);
            if (goblin.status !== 'online') return { error: `${goblin.name || goblinId} is not online` };
        }
        return { goblin };
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
     * Play a file that is on the Goblin's disk, once, interrupting whatever is showing
     * (the device returns to its queue afterwards unless told otherwise). The device
     * answers success the instant it spawns mpv — before mpv can fail on a bad file —
     * so success here means the device reports mpv running on that file ~1.5 s later.
     */
    async playVideoOnGoblin(goblinId, filename, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            if (options.checkPresence !== false && !(await this._isOnGoblin(goblin, filename))) {
                return { success: false, notOnGoblin: true, error: `"${filename}" is not on ${goblin.name || goblinId} — deploy it first` };
            }
            if (options.loop) {
                return this.loopVideoOnGoblin(goblinId, filename, { checkPresence: false });
            }
            const result = await this._goblinJson(goblin, '/api/video/play-immediate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, returnToQueue: options.returnToQueue !== false })
            }, 10000);
            if (!result.success) return { ...result, success: false };
            const proof = await this._confirmPlaying(goblinId, filename);
            return { ...result, ...proof, goblinName: goblin.name, filename };
        } catch (err) {
            console.error(`Error playing video on goblin ${goblinId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Make one file the Goblin's whole looping queue — what a show display runs all
     * night. Replaces the current queue; proven by the device reporting the queue
     * playing that file in loop mode.
     */
    async loopVideoOnGoblin(goblinId, filename, options = {}) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            if (options.checkPresence !== false && !(await this._isOnGoblin(goblin, filename))) {
                return { success: false, notOnGoblin: true, error: `"${filename}" is not on ${goblin.name || goblinId} — deploy it first` };
            }
            const post = (pathname, body) => this._goblinJson(goblin, pathname, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body || {})
            }, 10000);
            await post('/stop-all');
            await post('/queue/clear');
            await post('/queue/add', { filename, position: 'end' });
            await post('/queue/start', { loopMode: 'queue' });
            const proof = await this._confirmPlaying(goblinId, filename);
            const looping = !!(proof.playback && proof.playback.queue && proof.playback.queue.loopMode === 'queue');
            return {
                ...proof,
                success: proof.success && looping,
                loop: looping,
                goblinName: goblin.name,
                filename,
                error: proof.success && !looping ? `${goblin.name} is playing "${filename}" but its queue is not in loop mode` : proof.error
            };
        } catch (err) {
            console.error(`Error looping video on goblin ${goblinId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /** Stop mpv and the queue on a Goblin, proven by the device reporting mpv stopped. */
    async stopGoblin(goblinId) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            await this._goblinJson(goblin, '/stop-all', { method: 'POST' }, 10000);
            await sleep(800);
            const playback = await this.getGoblinPlayback(goblinId);
            const stopped = playback.success && !playback.mpvRunning;
            return {
                success: stopped,
                goblinName: goblin.name,
                playback: playback.success ? playback : null,
                error: stopped ? undefined : `${goblin.name} still reports mpv running`
            };
        } catch (err) {
            console.error(`Error stopping goblin ${goblinId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * The all-clear after a stop: start the Goblin's OWN queue again, in the loop
     * mode it already carries (the device persists its queue across a stop). This
     * is what puts a screen back on its show after a fleet Emergency Stop, and
     * what a test suite that fired one owes the devices afterwards. Nothing is
     * cleared or added; proven by the device reporting mpv on the queue's file.
     */
    async resumeGoblinQueue(goblinId) {
        const { goblin, error } = await this._onlineGoblin(goblinId);
        if (error) return { success: false, error };
        try {
            const before = await this.getGoblinPlayback(goblinId);
            const loopMode = (before.success && before.queue && before.queue.loopMode) || 'queue';
            const started = await this._goblinJson(goblin, '/queue/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loopMode })
            }, 10000);
            if (!started.success) return { success: false, goblinName: goblin.name, error: started.error || `${goblin.name} refused to start its queue` };
            await sleep(1500);
            const playback = await this.getGoblinPlayback(goblinId);
            const showing = playback.success && playback.mpvRunning;
            return {
                success: showing,
                goblinName: goblin.name,
                loopMode,
                playback: playback.success ? playback : null,
                error: showing ? undefined : `${goblin.name} started its queue but mpv is not running (is the queue empty?)`
            };
        } catch (err) {
            console.error(`Error resuming queue on goblin ${goblinId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    async _confirmPlaying(goblinId, filename) {
        await sleep(1500);
        const playback = await this.getGoblinPlayback(goblinId);
        if (!playback.success) {
            return { success: false, accepted: true, error: `Play accepted but the Goblin's status could not be read: ${playback.error}` };
        }
        const showing = playback.mpvRunning && playback.currentVideo === filename;
        return {
            success: showing,
            accepted: true,
            verified: showing,
            playback,
            error: showing ? undefined : `Goblin accepted "${filename}" but mpv is ${playback.mpvRunning ? `showing "${playback.currentVideo}"` : 'not running'} — the file is probably unplayable`
        };
    }

    async pingGoblin(goblinId) {
        try {
            const goblin = this.goblins.get(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            const axios = (await import('axios')).default;
            const response = await axios.get(`${goblin.endpoint}/health`, {
                timeout: 5000
            });

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