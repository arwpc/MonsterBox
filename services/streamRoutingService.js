/**
 * Stream Routing Service
 * Handles real-time audio stream routing and management for PipeWire
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import pipewireService from './pipewireService.js';

const pexec = promisify(exec);

/**
 * Service for managing active audio streams and routing
 */
class StreamRoutingService {
    constructor() {
        this.activeStreams = new Map(); // Track active playback streams
        this.streamCounter = 0;
    }

    /**
     * Register a new audio stream
     */
    registerStream(pid, filename, deviceId, partId = null) {
        const streamId = ++this.streamCounter;
        const stream = {
            id: streamId,
            pid: pid,
            filename: filename,
            deviceId: deviceId,
            partId: partId,
            startTime: new Date(),
            status: 'playing'
        };
        
        this.activeStreams.set(streamId, stream);
        console.log(`🎵 Registered stream ${streamId}: ${filename} -> ${deviceId}`);
        return streamId;
    }

    /**
     * Unregister a stream
     */
    unregisterStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            this.activeStreams.delete(streamId);
            console.log(`🛑 Unregistered stream ${streamId}`);
            return true;
        }
        return false;
    }

    /**
     * Get all active streams
     */
    getActiveStreams() {
        return Array.from(this.activeStreams.values());
    }

    /**
     * Get streams for a specific part
     */
    getStreamsForPart(partId) {
        return Array.from(this.activeStreams.values()).filter(stream => stream.partId === partId);
    }

    /**
     * Move a stream to a different sink
     */
    async moveStreamToSink(streamId, newSinkId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            throw new Error(`Stream ${streamId} not found`);
        }

        try {
            // Get current sink inputs to find the matching stream
            const sinkInputs = await pipewireService.listSinkInputs();
            
            // Try to match by PID or other criteria
            let targetSinkInput = null;
            for (const input of sinkInputs) {
                // This is a simplified matching - in practice, you might need more sophisticated matching
                if (input.clientId && input.clientId.includes(stream.pid.toString())) {
                    targetSinkInput = input;
                    break;
                }
            }

            if (!targetSinkInput) {
                // If we can't find the exact sink input, try moving all inputs to the new sink
                console.log(`⚠️ Could not find specific sink input for stream ${streamId}, trying to move all active streams`);
                for (const input of sinkInputs) {
                    try {
                        await pipewireService.moveSinkInput(input.id, newSinkId);
                    } catch (err) {
                        console.log(`Failed to move sink input ${input.id}: ${err.message}`);
                    }
                }
            } else {
                // Move the specific sink input
                const result = await pipewireService.moveSinkInput(targetSinkInput.id, newSinkId);
                if (!result.success) {
                    throw new Error(result.error);
                }
            }

            // Update our stream record
            stream.deviceId = newSinkId;
            stream.lastMoved = new Date();
            this.activeStreams.set(streamId, stream);

            console.log(`🔄 Moved stream ${streamId} to sink ${newSinkId}`);
            return { success: true, streamId, newSinkId };

        } catch (error) {
            console.error(`Failed to move stream ${streamId}:`, error.message);
            throw error;
        }
    }

    /**
     * Stop a specific stream
     */
    async stopStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            throw new Error(`Stream ${streamId} not found`);
        }

        try {
            // Try to kill the process
            process.kill(stream.pid, 'SIGTERM');
            
            // Wait a bit and force kill if necessary
            setTimeout(() => {
                try {
                    process.kill(stream.pid, 'SIGKILL');
                } catch (err) {
                    // Process already dead, ignore
                }
            }, 1000);

            // Update stream status
            stream.status = 'stopped';
            stream.stopTime = new Date();
            
            console.log(`🛑 Stopped stream ${streamId} (PID: ${stream.pid})`);
            return { success: true, streamId };

        } catch (error) {
            if (error.code === 'ESRCH') {
                // Process already dead
                stream.status = 'stopped';
                console.log(`🛑 Stream ${streamId} process already stopped`);
                return { success: true, streamId };
            }
            throw error;
        }
    }

    /**
     * Stop all streams for a specific part
     */
    async stopStreamsForPart(partId) {
        const streams = this.getStreamsForPart(partId);
        const results = [];

        for (const stream of streams) {
            try {
                const result = await this.stopStream(stream.id);
                results.push(result);
            } catch (error) {
                results.push({ success: false, streamId: stream.id, error: error.message });
            }
        }

        return results;
    }

    /**
     * Clean up dead streams
     */
    async cleanupDeadStreams() {
        const deadStreams = [];
        
        for (const [streamId, stream] of this.activeStreams) {
            try {
                // Check if process is still alive
                process.kill(stream.pid, 0);
            } catch (error) {
                if (error.code === 'ESRCH') {
                    // Process is dead
                    deadStreams.push(streamId);
                }
            }
        }

        // Remove dead streams
        for (const streamId of deadStreams) {
            this.unregisterStream(streamId);
        }

        if (deadStreams.length > 0) {
            console.log(`🧹 Cleaned up ${deadStreams.length} dead streams`);
        }

        return deadStreams;
    }

    /**
     * Get stream statistics
     */
    getStreamStats() {
        const streams = this.getActiveStreams();
        const stats = {
            total: streams.length,
            playing: streams.filter(s => s.status === 'playing').length,
            stopped: streams.filter(s => s.status === 'stopped').length,
            byDevice: {}
        };

        // Group by device
        for (const stream of streams) {
            if (!stats.byDevice[stream.deviceId]) {
                stats.byDevice[stream.deviceId] = 0;
            }
            stats.byDevice[stream.deviceId]++;
        }

        return stats;
    }

    /**
     * Move all streams from one sink to another
     */
    async moveAllStreamsToSink(fromSinkId, toSinkId) {
        const streams = this.getActiveStreams().filter(s => s.deviceId === fromSinkId);
        const results = [];

        for (const stream of streams) {
            try {
                const result = await this.moveStreamToSink(stream.id, toSinkId);
                results.push(result);
            } catch (error) {
                results.push({ success: false, streamId: stream.id, error: error.message });
            }
        }

        return results;
    }

    /**
     * Get detailed stream information
     */
    getStreamDetails(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) {
            return null;
        }

        return {
            ...stream,
            duration: stream.startTime ? Date.now() - stream.startTime.getTime() : 0,
            isAlive: this.isStreamAlive(stream.pid)
        };
    }

    /**
     * Check if a stream process is still alive
     */
    isStreamAlive(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Start periodic cleanup of dead streams
     */
    startPeriodicCleanup(intervalMs = 30000) {
        setInterval(() => {
            this.cleanupDeadStreams().catch(err => {
                console.error('Stream cleanup error:', err.message);
            });
        }, intervalMs);
        
        console.log(`🧹 Started periodic stream cleanup (${intervalMs}ms interval)`);
    }
}

// Export singleton instance
export default new StreamRoutingService();
