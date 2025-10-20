/**
 * Goblin Video Service
 * Handles video scanning, playback control, and status monitoring for Goblins
 */

import axios from 'axios';
import goblinManagerService from './goblinManagerService.js';

class GoblinVideoService {
    constructor() {
        this.videoCache = new Map(); // Cache video metadata by goblinId
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Scan videos from a specific Goblin
     * @param {string} goblinId - Goblin ID
     * @returns {Promise<Object>} Scan result with videos array
     */
    async scanGoblinVideos(goblinId) {
        try {
            const goblin = goblinManagerService.getGoblin(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is offline' };
            }

            const response = await axios.get(`${goblin.endpoint}/api/videos/scan`, {
                timeout: 60000 // 60 second timeout for scanning
            });

            if (response.data.success) {
                // Cache the results
                this.videoCache.set(goblinId, {
                    videos: response.data.videos,
                    scannedAt: new Date().toISOString()
                });

                return {
                    success: true,
                    goblinId,
                    videos: response.data.videos,
                    scannedAt: new Date().toISOString()
                };
            }

            return { success: false, error: 'Scan failed' };
        } catch (error) {
            console.error(`Error scanning videos from ${goblinId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Scan videos from all online Goblins
     * @returns {Promise<Object>} Results for each Goblin
     */
    async scanAllGoblinVideos() {
        try {
            const goblins = goblinManagerService.getAllGoblins();
            const onlineGoblins = goblins.filter(g => g.status === 'online');

            const results = {};
            
            // Scan all Goblins in parallel
            await Promise.all(
                onlineGoblins.map(async (goblin) => {
                    results[goblin.id] = await this.scanGoblinVideos(goblin.id);
                })
            );

            return {
                success: true,
                results,
                totalGoblins: onlineGoblins.length,
                scannedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error scanning all Goblin videos:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get cached videos for a Goblin
     * @param {string} goblinId - Goblin ID
     * @returns {Object|null} Cached video data or null
     */
    getGoblinVideos(goblinId) {
        const cached = this.videoCache.get(goblinId);
        if (!cached) return null;

        // Check if cache is still valid
        const age = Date.now() - new Date(cached.scannedAt).getTime();
        if (age > this.cacheTimeout) {
            this.videoCache.delete(goblinId);
            return null;
        }

        return cached;
    }

    /**
     * Get all cached videos across all Goblins
     * @returns {Object} Videos grouped by Goblin ID
     */
    getAllGoblinVideos() {
        const result = {};
        
        for (const [goblinId, data] of this.videoCache.entries()) {
            const age = Date.now() - new Date(data.scannedAt).getTime();
            if (age <= this.cacheTimeout) {
                result[goblinId] = data;
            } else {
                this.videoCache.delete(goblinId);
            }
        }

        return result;
    }

    /**
     * Play a video immediately on a Goblin
     * @param {string} goblinId - Goblin ID
     * @param {string} filename - Video filename
     * @param {Object} options - Playback options
     * @returns {Promise<Object>} Playback result
     */
    async playVideoImmediate(goblinId, filename, options = {}) {
        try {
            const goblin = goblinManagerService.getGoblin(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is offline' };
            }

            const response = await axios.post(
                `${goblin.endpoint}/api/video/play-immediate`,
                {
                    filename,
                    returnToQueue: options.returnToQueue !== false // Default true
                },
                { timeout: 5000 }
            );

            return response.data;
        } catch (error) {
            console.error(`Error playing video on ${goblinId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get playback status from a Goblin
     * @param {string} goblinId - Goblin ID
     * @returns {Promise<Object>} Status data
     */
    async getPlaybackStatus(goblinId) {
        try {
            const goblin = goblinManagerService.getGoblin(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is offline' };
            }

            const response = await axios.get(`${goblin.endpoint}/api/status`, {
                timeout: 5000
            });

            return response.data;
        } catch (error) {
            console.error(`Error getting status from ${goblinId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Stop playback on a Goblin
     * @param {string} goblinId - Goblin ID
     * @returns {Promise<Object>} Result
     */
    async stopPlayback(goblinId) {
        try {
            const goblin = goblinManagerService.getGoblin(goblinId);
            if (!goblin) {
                return { success: false, error: 'Goblin not found' };
            }

            if (goblin.status !== 'online') {
                return { success: false, error: 'Goblin is offline' };
            }

            const response = await axios.post(`${goblin.endpoint}/stop-all`, {}, {
                timeout: 5000
            });

            return response.data;
        } catch (error) {
            console.error(`Error stopping playback on ${goblinId}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clear video cache for a Goblin or all Goblins
     * @param {string|null} goblinId - Goblin ID or null for all
     */
    clearCache(goblinId = null) {
        if (goblinId) {
            this.videoCache.delete(goblinId);
        } else {
            this.videoCache.clear();
        }
    }
}

// Export singleton instance
const goblinVideoService = new GoblinVideoService();
export default goblinVideoService;

