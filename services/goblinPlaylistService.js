/**
 * Goblin Playlist Service
 * Handles playlist CRUD operations and deployment to Goblins
 *
 * A playlist is a MonsterBox-side record (data/goblin-playlists.json); what a Goblin
 * actually plays is its own queue (queue.json on the device), which a deploy
 * replaces. A playlist with `role: "show"` is that Goblin's staged show: the
 * keep-alive in goblinManagerService applies it when the Goblin comes back with an
 * empty or different queue, so a unit that was off the network starts its reel the
 * moment it returns.
 *
 * Record shape:
 *   { id, name, description, goblinId (registry id, or "all"), role ("show"|null),
 *     videos: [{ filename, order, duration, bytes?, sha256?, source? }],
 *     loopMode ("none"|"single"|"queue"), clips?: [...reel contents...],
 *     createdAt, updatedAt, lastDeployed, deployments: { [goblinId]: {...} } }
 *
 * `source` is a path ON THIS NODE the file can be copied from when the Goblin does
 * not hold it (the reels live in /home/remote/goblin-reels/reels, outside the repo).
 * The device understands only the loop modes none|single|queue; a one-file queue in
 * "queue" mode is ONE mpv --loop (no respawn between passes).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import goblinManagerService, { sanitizeGoblinFilename } from './goblinManagerService.js';
import { writeJsonAtomic } from './atomicStore.js';

export const DEVICE_LOOP_MODES = ['none', 'single', 'queue'];
export const PLAYLIST_ROLES = ['show'];

/**
 * Validate and normalise playlist input. Returns { ok, value } or { ok:false, error }.
 * `partial` validates only the fields present (updates).
 */
export function normalisePlaylistInput(input = {}, { partial = false, resolve = null } = {}) {
    const out = {};
    if (!partial || input.name !== undefined) {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) return { ok: false, error: 'name is required' };
        out.name = name.slice(0, 200);
    }
    if (input.description !== undefined) out.description = String(input.description || '').slice(0, 4000);
    if (!partial || input.goblinId !== undefined) {
        const raw = typeof input.goblinId === 'string' ? input.goblinId.trim() : '';
        if (!raw) return { ok: false, error: 'goblinId is required (a Goblin id or name, or "all")' };
        if (raw === 'all') out.goblinId = 'all';
        else if (typeof resolve === 'function') {
            const found = resolve(raw);
            if (!found.success) return { ok: false, error: found.error };
            out.goblinId = found.id;
        } else out.goblinId = raw;
    }
    if (!partial || input.videos !== undefined) {
        if (!Array.isArray(input.videos) || !input.videos.length) return { ok: false, error: 'videos must be a non-empty array' };
        const videos = [];
        for (const [index, video] of input.videos.entries()) {
            const rawName = typeof video === 'string' ? video : (video && video.filename);
            const filename = sanitizeGoblinFilename(rawName);
            if (!filename || filename !== String(rawName).trim()) {
                return { ok: false, error: `"${rawName}" is not a name the Goblin player lists (a bare .mp4/.mov/.avi/.mkv filename)` };
            }
            const entry = { filename, order: index + 1, duration: typeof video === 'object' && Number(video.duration) > 0 ? Number(video.duration) : 0 };
            if (typeof video === 'object') {
                if (Number(video.bytes) > 0) entry.bytes = Number(video.bytes);
                if (typeof video.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(video.sha256)) entry.sha256 = video.sha256.toLowerCase();
                if (typeof video.source === 'string' && video.source.trim()) {
                    if (!path.isAbsolute(video.source)) return { ok: false, error: `source for "${filename}" must be an absolute path on this node` };
                    entry.source = video.source;
                }
            }
            videos.push(entry);
        }
        out.videos = videos;
    }
    if (!partial || input.loopMode !== undefined) {
        const loopMode = input.loopMode === undefined ? 'queue' : input.loopMode;
        if (!DEVICE_LOOP_MODES.includes(loopMode)) {
            return { ok: false, error: `loopMode must be one of ${DEVICE_LOOP_MODES.join(', ')} (the Goblin does not understand "${loopMode}")` };
        }
        out.loopMode = loopMode;
    }
    if (input.role !== undefined) {
        if (input.role !== null && input.role !== '' && !PLAYLIST_ROLES.includes(input.role)) {
            return { ok: false, error: `role must be one of ${PLAYLIST_ROLES.join(', ')} or empty` };
        }
        out.role = input.role || null;
    }
    if (input.clips !== undefined) out.clips = Array.isArray(input.clips) ? input.clips : [];
    if (input.notes !== undefined) out.notes = String(input.notes || '').slice(0, 4000);
    return { ok: true, value: out };
}

class GoblinPlaylistService {
    constructor() {
        this.playlistsFile = path.resolve('./data/goblin-playlists.json');
        this.playlists = [];
        // The keep-alive asks for each Goblin's staged show, and reports back when it
        // applied one so the playlist records where it went.
        goblinManagerService.setStagedPlaylistProvider(
            (goblinId) => this.getShowPlaylist(goblinId),
            (playlistId, goblinId, result) => this.recordDeployment(playlistId, goblinId, result, 'keep-alive')
        );
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
            const parsed = JSON.parse(data);
            this.playlists = Array.isArray(parsed) ? parsed : [];
            const shows = this.playlists.filter(p => p.role === 'show').length;
            console.log(`📋 Loaded ${this.playlists.length} Goblin playlists (${shows} staged show${shows === 1 ? '' : 's'})`);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty array
            console.log('📋 Starting with empty Goblin playlist registry');
            this.playlists = [];
        }
    }

    async savePlaylists() {
        try {
            await writeJsonAtomic(this.playlistsFile, this.playlists);
            return true;
        } catch (error) {
            console.error('Error saving playlists:', error);
            return false;
        }
    }

    _resolver() {
        return (nameOrId) => goblinManagerService.resolveGoblin(nameOrId);
    }

    /**
     * Create a new playlist
     * @param {Object} playlistData - Playlist data (goblinId may be a Goblin name)
     * @returns {Promise<Object>} Created playlist
     */
    async createPlaylist(playlistData) {
        try {
            const checked = normalisePlaylistInput(playlistData || {}, { resolve: this._resolver() });
            if (!checked.ok) return { success: false, error: checked.error };
            const now = new Date().toISOString();
            const playlist = {
                id: typeof playlistData.id === 'string' && /^[A-Za-z0-9._-]{3,80}$/.test(playlistData.id) && !this.getPlaylist(playlistData.id)
                    ? playlistData.id : randomUUID(),
                description: '',
                role: null,
                ...checked.value,
                createdAt: now,
                updatedAt: now,
                lastDeployed: null
            };
            if (playlist.role === 'show') this._demoteOtherShows(playlist.goblinId, playlist.id);

            this.playlists.push(playlist);
            await this.savePlaylists();

            return { success: true, playlist };
        } catch (error) {
            console.error('Error creating playlist:', error);
            return { success: false, error: error.message };
        }
    }

    /** One staged show per Goblin: a new one takes the role from the old. */
    _demoteOtherShows(goblinId, keepId) {
        for (const p of this.playlists) {
            if (p.id !== keepId && p.role === 'show' && p.goblinId === goblinId) {
                p.role = null;
                p.updatedAt = new Date().toISOString();
            }
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

    /** The staged show for a Goblin (id or name), or null. */
    getShowPlaylist(goblinId) {
        const found = goblinManagerService.resolveGoblin(goblinId);
        const id = found.success ? found.id : goblinId;
        const shows = this.playlists.filter(p => p.role === 'show' && p.goblinId === id && Array.isArray(p.videos) && p.videos.length);
        shows.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        return shows[0] || null;
    }

    /**
     * Get all playlists with optional filtering
     * @param {Object} filters - Filter options
     * @returns {Array} Filtered playlists
     */
    getAllPlaylists(filters = {}) {
        let result = [...this.playlists];

        if (filters.goblinId) {
            const found = goblinManagerService.resolveGoblin(filters.goblinId);
            const id = found.success ? found.id : filters.goblinId;
            result = result.filter(p => p.goblinId === id || p.goblinId === 'all');
        }

        if (filters.role) {
            result = result.filter(p => p.role === filters.role);
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
            const checked = normalisePlaylistInput(updates || {}, { partial: true, resolve: this._resolver() });
            if (!checked.ok) return { success: false, error: checked.error };

            const playlist = this.playlists[index];
            Object.assign(playlist, checked.value);
            playlist.updatedAt = new Date().toISOString();
            if (playlist.role === 'show') this._demoteOtherShows(playlist.goblinId, playlist.id);

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

    /** Remember where a playlist went and whether the device proved it. */
    async recordDeployment(playlistId, goblinId, result, by = 'deploy') {
        const playlist = this.getPlaylist(playlistId);
        if (!playlist) return false;
        const at = new Date().toISOString();
        playlist.deployments = playlist.deployments || {};
        playlist.deployments[goblinId] = {
            at,
            by,
            verified: !!result.success,
            showing: result.playback ? result.playback.currentVideo : null,
            copied: Array.isArray(result.copied) ? result.copied.map(c => c.filename) : [],
            error: result.success ? null : (result.error || 'failed')
        };
        if (result.success) playlist.lastDeployed = at;
        return this.savePlaylists();
    }

    /**
     * Deploy playlist to Goblin(s), hardened. Per Goblin (one after another, so two
     * reels are never pushed over the Wi-Fi at once): the device is pinged, its own
     * listing is checked for every file (a missing one is copied from its `source`
     * on this node, or the deploy is refused before anything on the device changes),
     * the queue is replaced under that Goblin's lock and the result is proven by two
     * device reads with a steady spawn counter. `deployed` lists only proven Goblins.
     *
     * @param {string} id - Playlist ID
     * @param {Array|string} goblinIds - Goblin ids or names, or 'all' (every online Goblin)
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
            let requested = [];
            if (goblinIds === 'all') {
                const result = await goblinManagerService.getGoblins();
                const goblins = result.success ? result.goblins : [];
                requested = goblins.filter(g => g.status === 'online').map(g => g.id);
            } else if (Array.isArray(goblinIds)) {
                requested = goblinIds;
            } else {
                requested = [goblinIds];
            }

            const results = { deployed: [], failed: [], details: [] };
            const seen = new Set();
            for (const target of requested) {
                const found = goblinManagerService.resolveGoblin(target);
                if (!found.success) {
                    results.failed.push({ goblinId: String(target), error: found.error });
                    continue;
                }
                if (seen.has(found.id)) continue;
                seen.add(found.id);
                const outcome = await goblinManagerService.applyPlaylistToGoblin(found.id, playlist, { startImmediately: startImmediately !== false, opKind: 'deploy' });
                results.details.push({
                    goblinId: found.id,
                    goblinName: outcome.goblinName || found.goblin.name,
                    success: !!outcome.success,
                    copied: outcome.copied || [],
                    spawns: outcome.spawns ?? null,
                    playback: outcome.playback || null,
                    error: outcome.error || null
                });
                if (outcome.success) results.deployed.push(found.id);
                else results.failed.push({ goblinId: found.id, error: outcome.error || 'failed' });
                if (startImmediately !== false) await this.recordDeployment(playlist.id, found.id, outcome, 'deploy');
            }

            return {
                success: results.deployed.length > 0 && results.failed.length === 0,
                playlistId: playlist.id,
                deployed: results.deployed,
                failed: results.failed,
                results: results.details
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
