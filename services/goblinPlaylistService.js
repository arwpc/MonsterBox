/**
 * Goblin Playlist Service
 * Handles playlist CRUD operations and deployment to Goblins
 */

import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import { randomUUID } from 'crypto';
import goblinManagerService from './goblinManagerService.js';

class GoblinPlaylistService {
    constructor() {
        this.playlistsFile = path.resolve('./data/goblin-playlists.json');
        this.playlists = [];
        this.init();
    }

    async init() {
        try {
            // Create data directory if needed
            const dataDir = path.dirname(this.playlistsFile);
            await fs.mkdir(dataDir, { recursive: true });

            // Load existing playlists
            await this.loadPlaylists();

            console.log('✅ Goblin Playlist Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Goblin Playlist Service:', error);
        }
    }

    async loadPlaylists() {
        try {
            const data = await fs.readFile(this.playlistsFile, 'utf-8');
            this.playlists = JSON.parse(data);
            console.log(`📋 Loaded ${this.playlists.length} Goblin playlists`);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty array
            console.log('📋 Starting with empty Goblin playlist registry');
            this.playlists = [];
        }
    }

    async savePlaylists() {
        try {
            await fs.writeFile(this.playlistsFile, JSON.stringify(this.playlists, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving playlists:', error);
            return false;
        }
    }

    /**
     * Create a new playlist
     * @param {Object} playlistData - Playlist data
     * @returns {Promise<Object>} Created playlist
     */
    async createPlaylist(playlistData) {
        try {
            const { name, description, goblinId, videos, loopMode = 'queue' } = playlistData;

            if (!name || !goblinId || !videos || !Array.isArray(videos)) {
                return { success: false, error: 'Missing required fields' };
            }

            const playlist = {
                id: randomUUID(),
                name,
                description: description || '',
                goblinId,
                videos: videos.map((video, index) => ({
                    filename: typeof video === 'string' ? video : video.filename,
                    order: index + 1,
                    duration: typeof video === 'object' ? video.duration : 0
                })),
                loopMode,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                lastDeployed: null
            };

            this.playlists.push(playlist);
            await this.savePlaylists();

            return { success: true, playlist };
        } catch (error) {
            console.error('Error creating playlist:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get playlist by ID
     * @param {string} id - Playlist ID
     * @returns {Object|null} Playlist or null
     */
    getPlaylist(id) {
        return this.playlists.find(p => p.id === id) || null;
    }

    /**
     * Get all playlists with optional filtering
     * @param {Object} filters - Filter options
     * @returns {Array} Filtered playlists
     */
    getAllPlaylists(filters = {}) {
        let result = [...this.playlists];

        if (filters.goblinId) {
            result = result.filter(p => p.goblinId === filters.goblinId || p.goblinId === 'all');
        }

        if (filters.search) {
            const search = filters.search.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(search) ||
                (p.description && p.description.toLowerCase().includes(search))
            );
        }

        // Sort by updatedAt descending
        result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        return result;
    }

    /**
     * Update playlist
     * @param {string} id - Playlist ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Update result
     */
    async updatePlaylist(id, updates) {
        try {
            const index = this.playlists.findIndex(p => p.id === id);
            if (index === -1) {
                return { success: false, error: 'Playlist not found' };
            }

            const playlist = this.playlists[index];

            // Update allowed fields
            if (updates.name) playlist.name = updates.name;
            if (updates.description !== undefined) playlist.description = updates.description;
            if (updates.goblinId) playlist.goblinId = updates.goblinId;
            if (updates.loopMode) playlist.loopMode = updates.loopMode;

            if (updates.videos && Array.isArray(updates.videos)) {
                playlist.videos = updates.videos.map((video, index) => ({
                    filename: typeof video === 'string' ? video : video.filename,
                    order: index + 1,
                    duration: typeof video === 'object' ? video.duration : 0
                }));
            }

            playlist.updatedAt = new Date().toISOString();

            await this.savePlaylists();

            return { success: true, playlist };
        } catch (error) {
            console.error('Error updating playlist:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Delete playlist
     * @param {string} id - Playlist ID
     * @returns {Promise<Object>} Delete result
     */
    async deletePlaylist(id) {
        try {
            const index = this.playlists.findIndex(p => p.id === id);
            if (index === -1) {
                return { success: false, error: 'Playlist not found' };
            }

            this.playlists.splice(index, 1);
            await this.savePlaylists();

            return { success: true };
        } catch (error) {
            console.error('Error deleting playlist:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Deploy playlist to Goblin(s)
     * @param {string} id - Playlist ID
     * @param {Array|string} goblinIds - Goblin IDs or 'all'
     * @param {boolean} startImmediately - Start playback immediately
     * @returns {Promise<Object>} Deployment result
     */
    async deployPlaylist(id, goblinIds, startImmediately = true) {
        try {
            const playlist = this.getPlaylist(id);
            if (!playlist) {
                return { success: false, error: 'Playlist not found' };
            }

            // Determine target Goblins
            let targets = [];
            if (goblinIds === 'all') {
                const result = await goblinManagerService.getGoblins();
                const goblins = result.success ? result.goblins : [];
                targets = goblins
                    .filter(g => g.status === 'online')
                    .map(g => g.id);
            } else if (Array.isArray(goblinIds)) {
                targets = goblinIds;
            } else {
                targets = [goblinIds];
            }

            const results = {
                deployed: [],
                failed: []
            };

            // Deploy to each Goblin
            for (const goblinId of targets) {
                try {
                    // getGoblin is async and resolves to { success, goblin }; without
                    // await, `goblin` was a Promise so this check ALWAYS failed and no
                    // playlist ever deployed, even to online Goblins.
                    const goblinResult = await goblinManagerService.getGoblin(goblinId);
                    const goblin = goblinResult.success ? goblinResult.goblin : null;
                    if (!goblin || goblin.status !== 'online') {
                        results.failed.push({ goblinId, error: 'Goblin offline or not found' });
                        continue;
                    }

                    // Clear existing queue
                    await axios.post(`${goblin.endpoint}/queue/clear`, {}, { timeout: 5000 });

                    // Add videos to queue
                    for (const video of playlist.videos) {
                        await axios.post(
                            `${goblin.endpoint}/queue/add`,
                            { filename: video.filename },
                            { timeout: 5000 }
                        );
                    }

                    // Start playback if requested
                    if (startImmediately) {
                        await axios.post(
                            `${goblin.endpoint}/queue/start`,
                            { loopMode: playlist.loopMode },
                            { timeout: 5000 }
                        );
                    }

                    results.deployed.push(goblinId);
                } catch (error) {
                    console.error(`Error deploying to ${goblinId}:`, error.message);
                    results.failed.push({ goblinId, error: error.message });
                }
            }

            // Update lastDeployed timestamp
            const playlistIndex = this.playlists.findIndex(p => p.id === id);
            if (playlistIndex !== -1) {
                this.playlists[playlistIndex].lastDeployed = new Date().toISOString();
                await this.savePlaylists();
            }

            return {
                success: true,
                deployed: results.deployed,
                failed: results.failed
            };
        } catch (error) {
            console.error('Error deploying playlist:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get playlists for a specific Goblin
     * @param {string} goblinId - Goblin ID
     * @returns {Array} Playlists for this Goblin
     */
    getPlaylistsForGoblin(goblinId) {
        return this.playlists.filter(p => p.goblinId === goblinId || p.goblinId === 'all');
    }
}

// Export singleton instance
const goblinPlaylistService = new GoblinPlaylistService();
export default goblinPlaylistService;

