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
                // Check if process is still running
                if (!loop.process || loop.process.killed || loop.process.exitCode !== null) {
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
            // Stop old process if it exists
            if (oldLoop.process && !oldLoop.process.killed) {
                try { oldLoop.process.kill('SIGTERM'); } catch (_) {}
            }

            // Start new loop with same parameters
            await this.startLoop(
                characterId,
                oldLoop.audioFile,
                oldLoop.deviceId,
                oldLoop.volume
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
     * @returns {Promise<boolean>} - Success status
     */
    async startLoop(characterId, audioFile, deviceId = 'default', volume = 100) {
        try {
            // Stop any existing loop for this character
            await this.stopLoop(characterId);

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
     * @returns {Promise<boolean>} - Success status
     */
    async stopLoop(characterId) {
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

            // Also stop any other audio on the device to be safe
            try {
                await serverPlaybackService.stopForCharacter(characterId);
            } catch (_) {}

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
        
        this.stopMonitoring();
        console.log('✅ All audio loops stopped');
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
                isRunning: loop.process && !loop.process.killed && loop.process.exitCode === null,
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
}

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
