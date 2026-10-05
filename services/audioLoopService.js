/**
 * Audio Loop Service - Persistent Background Audio Looping
 * 
 * CRITICAL FIX: Audio marked as "loop" must play continuously until explicitly stopped,
 * independent of UI page navigation or user interaction.
 * 
 * This service manages background audio loops that persist across the entire session.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { runWrapper } from './hardwareService/exec.js';
import serverPlaybackService from './serverPlaybackService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AudioLoopService {
    constructor() {
        // Active loops: Map<characterId, { process, audioFile, deviceId, volume, startTime }>
        this._loops = new Map();
        
        // Loop monitoring interval
        this._monitorInterval = null;
        this._monitorIntervalMs = 5000; // Check every 5 seconds
        
        console.log('🔄 Audio Loop Service initialized');
    }

    /**
     * Start monitoring loops to ensure they stay alive
     */
    startMonitoring() {
        if (this._monitorInterval) return;
        
        this._monitorInterval = setInterval(() => {
            this._checkLoops();
        }, this._monitorIntervalMs);
        
        console.log(`🔄 Audio loop monitoring started (interval: ${this._monitorIntervalMs}ms)`);
    }

    /**
     * Stop monitoring (for cleanup)
     */
    stopMonitoring() {
        if (this._monitorInterval) {
            clearInterval(this._monitorInterval);
            this._monitorInterval = null;
            console.log('🔄 Audio loop monitoring stopped');
        }
    }

    /**
     * Check all loops and restart any that have died
     */
    async _checkLoops() {
        for (const [characterId, loop] of this._loops.entries()) {
            try {
                // A loop is TWO processes. A barge-in (or any other caller of
                // speaker_cli.py stop) pkills every pw-play on the node, which
                // leaves ffmpeg alive but blocked on a pipe nobody reads — the
                // loop then hangs silently forever if only ffmpeg is checked.
                if (_isLoopDead(loop)) {
                    // startLoop refuses while muted, so restarting now would only
                    // write a "died, restarting" line to .err every 5 s on the SD
                    // card. Leave it; the first check after unmute restarts it.
                    if (serverPlaybackService.isSpeakerMuted()) continue;
                    console.warn(`⚠️ Loop for character ${characterId} died, restarting...`);
                    await this._restartLoop(characterId, loop);
                }
            } catch (error) {
                console.error(`❌ Error checking loop for character ${characterId}:`, error.message);
            }
        }
    }

    /**
     * Restart a dead loop
     */
    async _restartLoop(characterId, oldLoop) {
        try {
            // Kill BOTH of the dead loop's own processes. Only its own: the
            // restart must not pkill the node's other players (AI speech).
            _killProcs(oldLoop);

            // Start new loop with same parameters
            await this.startLoop(
                characterId,
                oldLoop.audioFile,
                oldLoop.deviceId,
                oldLoop.volume,
                { ownOnly: true }
            );

            console.log(`✅ Restarted loop for character ${characterId}`);
        } catch (error) {
            console.error(`❌ Failed to restart loop for character ${characterId}:`, error.message);
        }
    }

    /**
     * Start a looping audio file for a character
     * @param {number} characterId - Character ID
     * @param {string} audioFile - Path to audio file
     * @param {string} deviceId - Audio device ID (PipeWire/PulseAudio sink)
     * @param {number} volume - Volume (0-100)
     * @param {{ownOnly?: boolean}} [opts] - ownOnly: replacing an existing loop
     *   kills only that loop's processes, not every player on the node
     * @returns {Promise<boolean>} - Success status
     */
    async startLoop(characterId, audioFile, deviceId = 'default', volume = 100, opts = {}) {
        try {
            // Honour the speaker mute, exactly as serverPlaybackService does.
            //
            // routes/audioLibrary.js sends loop:true straight here, bypassing
            // serverPlaybackService entirely, so a muted node stayed silent on Play
            // but made noise on Loop — and a fleet Emergency Stop could not hold a
            // running loop quiet. Given the mute exists to keep the house asleep,
            // the LOOP is the one that most needs to respect it.
            // Returns false (the documented boolean contract) because the loop genuinely
            // did not start; callers distinguish mute from failure via isSpeakerMuted().
            if (serverPlaybackService.isSpeakerMuted()) {
                console.log(`🔇 Speaker muted — loop for character ${characterId} not started`);
                return false;
            }

            // Stop any existing loop for this character
            await this.stopLoop(characterId, { ownOnly: !!(opts && opts.ownOnly) });

            // Verify audio file exists
            try {
                await fs.access(audioFile);
            } catch (error) {
                throw new Error(`Audio file not found: ${audioFile}`);
            }

            console.log(`🔄 Starting audio loop for character ${characterId}: ${audioFile}`);

            // Test mode - simulate only
            if (process.env.MB_TEST_MODE === '1' && process.env.CI === 'true') {
                this._loops.set(characterId, {
                    process: { killed: false, exitCode: null, kill: () => {} },
                    audioFile,
                    deviceId,
                    volume,
                    startTime: Date.now(),
                    simulated: true
                });
                console.log(`🎭 Simulated audio loop for character ${characterId}`);
                return true;
            }

            // Use ffmpeg to loop audio indefinitely and pipe to pw-play
            // ffmpeg -stream_loop -1 -i input.mp3 -f wav - | pw-play --target <device> -
            
            const env = { ...process.env };
            if (deviceId && deviceId !== 'default') {
                env.PULSE_SINK = deviceId;
            }

            // Start ffmpeg to loop audio
            const ffmpeg = spawn('ffmpeg', [
                '-hide_banner',
                '-loglevel', 'error',
                '-stream_loop', '-1',  // Loop indefinitely
                '-i', audioFile,
                '-af', `volume=${volume/100}`,  // Apply volume
                '-f', 'wav',
                'pipe:1'
            ], { env });

            // Start pw-play to play audio
            const pwplay = spawn('pw-play', [
                '--target', deviceId || 'default',
                '-'
            ], { env });

            // Handle EPIPE before piping to prevent crashes on device disconnect
            pwplay.stdin.on('error', () => {});
            ffmpeg.stdout.pipe(pwplay.stdin);

            // Error handling
            ffmpeg.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg && !msg.includes('ALSA')) {
                    console.error(`⚠️ ffmpeg loop error (char ${characterId}):`, msg);
                }
            });

            pwplay.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg && !msg.includes('ALSA')) {
                    console.error(`⚠️ pw-play loop error (char ${characterId}):`, msg);
                }
            });

            ffmpeg.on('exit', (code) => {
                console.warn(`⚠️ ffmpeg loop exited (char ${characterId}) with code ${code}`);
                // The monitor will restart it
            });

            pwplay.on('exit', (code) => {
                console.warn(`⚠️ pw-play loop exited (char ${characterId}) with code ${code}`);
                // The monitor will restart it
            });

            // A ChildProcess emits 'error' (ENOENT/EACCES/EAGAIN under memory pressure)
            // when the spawn itself fails. With no listener Node turns that into an
            // uncaught exception that crashes the whole server. Log it, drop the loop so
            // the monitor doesn't restart-storm a permanently-missing binary, and stop
            // the sibling process.
            ffmpeg.on('error', (err) => {
                console.error(`❌ ffmpeg loop spawn error (char ${characterId}):`, err.message);
                this._loops.delete(characterId);
                try { pwplay.kill('SIGKILL'); } catch (_) {}
            });

            pwplay.on('error', (err) => {
                console.error(`❌ pw-play loop spawn error (char ${characterId}):`, err.message);
                this._loops.delete(characterId);
                try { ffmpeg.kill('SIGKILL'); } catch (_) {}
            });

            // Store loop info
            this._loops.set(characterId, {
                process: ffmpeg,  // Track ffmpeg as primary process
                pwplay: pwplay,
                audioFile,
                deviceId,
                volume,
                startTime: Date.now()
            });

            // Start monitoring if not already running
            this.startMonitoring();

            console.log(`✅ Started audio loop for character ${characterId} on device ${deviceId}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to start audio loop for character ${characterId}:`, error.message);
            return false;
        }
    }

    /**
     * Stop audio loop for a character
     * @param {number} characterId - Character ID
     * @param {{ownOnly?: boolean}} [opts] - ownOnly: kill ONLY this loop's own
     *   ffmpeg + pw-play PIDs. Without it (the historical behaviour, kept for
     *   existing callers) the stop also runs speaker_cli.py stop, which pkills
     *   EVERY pw-play/mpg123 on the node — including the AI's speech.
     * @returns {Promise<boolean>} - Success status
     */
    async stopLoop(characterId, opts = {}) {
        try {
            const loop = this._loops.get(characterId);
            if (!loop) {
                return true; // Already stopped
            }

            console.log(`🛑 Stopping audio loop for character ${characterId}`);

            // Kill processes
            if (loop.process && !loop.process.killed) {
                try { loop.process.kill('SIGTERM'); } catch (_) {}
                try { loop.process.kill('SIGKILL'); } catch (_) {}
            }

            if (loop.pwplay && !loop.pwplay.killed) {
                try { loop.pwplay.kill('SIGTERM'); } catch (_) {}
                try { loop.pwplay.kill('SIGKILL'); } catch (_) {}
            }

            // Remove from map
            this._loops.delete(characterId);

            // Also stop any other audio on the device to be safe — unless the
            // caller asked to touch only this loop's own processes.
            if (!(opts && opts.ownOnly)) {
                try {
                    await serverPlaybackService.stopForCharacter(characterId);
                } catch (_) {}
            }

            console.log(`✅ Stopped audio loop for character ${characterId}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to stop audio loop for character ${characterId}:`, error.message);
            return false;
        }
    }

    /**
     * Stop all audio loops
     * @returns {Promise<void>}
     */
    async stopAllLoops() {
        console.log(`🛑 Stopping all audio loops (${this._loops.size} active)`);
        
        const characterIds = Array.from(this._loops.keys());
        await Promise.all(characterIds.map(id => this.stopLoop(id)));

        // "Stop all audio" / emergency stop must silence background music too,
        // which plays through playTrack() handles rather than this._loops.
        for (const listener of this._stopAllListeners || []) {
            try { listener(); } catch (error) { console.error('❌ stop-all listener failed:', error.message); }
        }
        
        this.stopMonitoring();
        console.log('✅ All audio loops stopped');
    }

    /**
     * Register a callback run by stopAllLoops() (used by the background-music
     * supervisor, whose tracks are not in this._loops).
     * @param {() => void} listener
     */
    onStopAll(listener) {
        if (typeof listener !== 'function') return;
        if (!this._stopAllListeners) this._stopAllListeners = [];
        if (!this._stopAllListeners.includes(listener)) this._stopAllListeners.push(listener);
    }

    /**
     * Alias for stopAllLoops (for compatibility with tests)
     * @returns {Promise<void>}
     */
    async stopAll() {
        return this.stopAllLoops();
    }

    /**
     * Get status of audio loop service
     * @returns {Object} - Service status info
     */
    getStatus() {
        return {
            activeLoops: this._loops.size,
            monitoringActive: this._monitorInterval !== null,
            loops: this.getActiveLoops()
        };
    }

    /**
     * Get active loops info
     * @returns {Array<Object>} - Array of loop info objects
     */
    getActiveLoops() {
        const loops = [];
        for (const [characterId, loop] of this._loops.entries()) {
            loops.push({
                characterId,
                audioFile: loop.audioFile,
                deviceId: loop.deviceId,
                volume: loop.volume,
                startTime: loop.startTime,
                uptime: Date.now() - loop.startTime,
                isRunning: !_isLoopDead(loop),
                simulated: loop.simulated || false
            });
        }
        return loops;
    }

    /**
     * Check if a character has an active loop
     * @param {number} characterId - Character ID
     * @returns {boolean}
     */
    hasActiveLoop(characterId) {
        return this._loops.has(characterId);
    }

    /**
     * Play ONE file once (no -stream_loop) through the same ffmpeg | pw-play
     * pipeline the loops use, and hand the caller a handle it owns.
     *
     * Used by the background-music supervisor, which rotates tracks and must
     * pause/resume without ever reaching for speaker_cli.py stop (that pkills
     * the AI's voice). stop() kills exactly this handle's two PIDs.
     *
     * Not tracked in this._loops and not restarted by the monitor — the owner
     * decides what happens when `done` resolves.
     *
     * @param {string} audioFile
     * @param {{deviceId?: string, volume?: number, offsetMs?: number, label?: string}} [opts]
     * @returns {{pids: number[], startedAt: number, done: Promise<{code: number|null, signal: string|null, stoppedByOwner: boolean, error?: string}>, stop: () => void}}
     */
    playTrack(audioFile, opts = {}) {
        const deviceId = opts.deviceId || 'default';
        const volume = Number.isFinite(opts.volume) ? Math.max(0, Math.min(100, opts.volume)) : 100;
        const offsetMs = Number.isFinite(opts.offsetMs) && opts.offsetMs > 0 ? opts.offsetMs : 0;
        const label = opts.label || 'track';
        const startedAt = Date.now();

        let stoppedByOwner = false;
        let settled = false;
        let resolveDone;
        const done = new Promise((resolve) => { resolveDone = resolve; });
        const finish = (result) => {
            if (settled) return;
            settled = true;
            resolveDone({ stoppedByOwner, ...result });
        };

        // Test mode: never touch real audio. Resolve only when stopped.
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true') {
            return {
                pids: [],
                startedAt,
                simulated: true,
                done,
                stop: () => { stoppedByOwner = true; finish({ code: null, signal: 'SIGTERM' }); }
            };
        }

        // Headerless PCM, same syntax serverPlaybackService's conversation
        // stream uses (needs --raw on PipeWire 1.4, absent on Bookworm).
        const ffArgs = ['-hide_banner', '-loglevel', 'error'];
        if (offsetMs > 0) ffArgs.push('-ss', (offsetMs / 1000).toFixed(3));
        ffArgs.push('-i', audioFile, '-vn', '-f', 's16le', '-ac', '2', '-ar', '48000', 'pipe:1');

        const pwArgs = [...serverPlaybackService._pwplayRawArgs(),
            '--format', 's16', '--rate', '48000', '--channels', '2',
            '--volume', (volume / 100).toFixed(3)];
        if (deviceId && deviceId !== 'default') pwArgs.push('--target', deviceId);
        pwArgs.push('-');

        const env = { ...process.env };
        if (deviceId && deviceId !== 'default') env.PULSE_SINK = deviceId;

        let ffmpeg = null;
        let pwplay = null;
        const killBoth = () => {
            for (const proc of [ffmpeg, pwplay]) {
                if (proc && proc.exitCode === null && !proc.killed) {
                    try { proc.kill('SIGTERM'); } catch (_) {}
                }
            }
        };

        try {
            ffmpeg = spawn('ffmpeg', ffArgs, { env });
            pwplay = spawn('pw-play', pwArgs, { env });
        } catch (error) {
            console.error(`❌ ${label}: spawn failed:`, error.message);
            killBoth();
            finish({ code: null, signal: null, error: error.message });
            return { pids: [], startedAt, done, stop: () => {} };
        }

        pwplay.stdin.on('error', () => {});
        ffmpeg.stdout.on('error', () => {});
        ffmpeg.stdout.pipe(pwplay.stdin);

        ffmpeg.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.error(`⚠️ ${label} ffmpeg:`, msg);
        });
        pwplay.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.error(`⚠️ ${label} pw-play:`, msg);
        });

        // The track is over when pw-play exits (it drains what ffmpeg wrote).
        // If ffmpeg dies abnormally first, take pw-play down with it; if
        // pw-play dies first (pkilled), ffmpeg would block forever — kill it.
        ffmpeg.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                try { pwplay.kill('SIGTERM'); } catch (_) {}
            }
        });
        pwplay.on('exit', (code, signal) => {
            // pw-play handles SIGTERM itself and exits 0, so its own code cannot
            // tell "the song ended" from "someone pkilled me" or "ffmpeg failed
            // and we killed pw-play". Only a clean ffmpeg exit before pw-play
            // drained is a natural end; otherwise report a non-zero/null code so
            // the owner resumes (interrupted) or counts a failure (bad file)
            // instead of skipping ahead or retry-storming a corrupt track.
            const ffmpegRunning = ffmpeg.exitCode === null && ffmpeg.signalCode === null;
            if (ffmpegRunning) { try { ffmpeg.kill('SIGTERM'); } catch (_) {} }
            let reported = code;
            if (code === 0 && ffmpeg.exitCode !== 0) {
                reported = (ffmpeg.exitCode !== null && ffmpeg.exitCode !== 0) ? ffmpeg.exitCode : null;
            }
            finish({ code: reported, signal, interrupted: ffmpegRunning, ffmpegCode: ffmpeg.exitCode });
        });
        ffmpeg.on('error', (err) => {
            console.error(`❌ ${label}: ffmpeg spawn error:`, err.message);
            killBoth();
            finish({ code: null, signal: null, error: err.message });
        });
        pwplay.on('error', (err) => {
            console.error(`❌ ${label}: pw-play spawn error:`, err.message);
            killBoth();
            finish({ code: null, signal: null, error: err.message });
        });

        return {
            pids: [ffmpeg.pid, pwplay.pid].filter(Boolean),
            startedAt,
            done,
            stop: () => { stoppedByOwner = true; killBoth(); }
        };
    }
}

/** A loop is dead when EITHER half of its ffmpeg | pw-play pipeline is gone. */
function _isLoopDead(loop) {
    if (!loop) return true;
    if (loop.simulated) return false;
    const gone = (proc) => !proc || proc.killed || proc.exitCode !== null;
    if (gone(loop.process)) return true;
    if (loop.pwplay && gone(loop.pwplay)) return true;
    return false;
}

/** Kill only this loop's own processes. */
function _killProcs(loop) {
    for (const proc of [loop && loop.process, loop && loop.pwplay]) {
        if (proc && !proc.killed && proc.exitCode === null) {
            try { proc.kill('SIGTERM'); } catch (_) {}
            try { proc.kill('SIGKILL'); } catch (_) {}
        }
    }
}

export { _isLoopDead as isLoopDead };

// Singleton instance
const audioLoopService = new AudioLoopService();

// Cleanup on process exit
process.on('SIGTERM', async () => {
    await audioLoopService.stopAllLoops();
});

process.on('SIGINT', async () => {
    await audioLoopService.stopAllLoops();
});

export default audioLoopService;
