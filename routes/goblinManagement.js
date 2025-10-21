/**
 * Goblin Management Routes
 * API endpoints for Goblin registration, monitoring, and control
 */

import express from 'express';
import goblinManagerService from '../services/goblinManagerService.js';
import goblinVideoService from '../services/goblinVideoService.js';
import goblinPlaylistService from '../services/goblinPlaylistService.js';

const router = express.Router();

// Main Goblin management page
router.get('/', (req, res) => {
    res.renderWithLayout('goblin-management/index', {
        title: 'Goblin Management - MonsterBox 5.3',
        page: 'goblin-management',
        pageTitle: 'Goblin Management'
    });
});

// API Routes

/**
 * POST /api/register - Register a new Goblin
 */
router.post('/api/register', async (req, res) => {
    try {
        const result = await goblinManagerService.registerGoblin(req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error registering Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/deploy-and-register - 👽 FACEHUGGER DEPLOYMENT! 👽
 * Deploy Goblin system to a fresh host, then register it
 */
router.post('/api/deploy-and-register', async (req, res) => {
    try {
        const { goblinData, sshPassword } = req.body;

        if (!goblinData || !sshPassword) {
            return res.status(400).json({
                success: false,
                error: 'Missing goblinData or sshPassword'
            });
        }

        // Set up SSE for progress updates
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const progressCallback = (progress) => {
            res.write(`data: ${JSON.stringify(progress)}\n\n`);
        };

        const result = await goblinManagerService.deployAndRegisterGoblin(
            goblinData,
            sshPassword,
            progressCallback
        );

        // Send final result
        res.write(`data: ${JSON.stringify({ ...result, final: true })}\n\n`);
        res.end();

    } catch (error) {
        console.error('Error in facehugger deployment:', error);
        res.write(`data: ${JSON.stringify({
            success: false,
            error: error.message,
            final: true
        })}\n\n`);
        res.end();
    }
});

/**
 * DELETE /api/goblin/:id - Unregister a Goblin
 */
router.delete('/api/goblin/:id', async (req, res) => {
    try {
        const result = await goblinManagerService.unregisterGoblin(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error unregistering Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/goblins - Get all Goblins with optional filtering
 */
router.get('/api/goblins', async (req, res) => {
    try {
        const options = {
            status: req.query.status,
            capability: req.query.capability,
            available: req.query.available === 'true'
        };

        const result = await goblinManagerService.getGoblins(options);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error getting Goblins:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/goblin/:id - Get specific Goblin details
 */
router.get('/api/goblin/:id', async (req, res) => {
    try {
        const result = await goblinManagerService.getGoblin(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error getting Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * PUT /api/goblin/:id/settings - Update Goblin settings
 */
router.put('/api/goblin/:id/settings', async (req, res) => {
    try {
        const result = await goblinManagerService.updateGoblinSettings(req.params.id, req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error updating Goblin settings:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/lock - Lock a Goblin
 */
router.post('/api/goblin/:id/lock', async (req, res) => {
    try {
        const { lockingEntity } = req.body;

        if (!lockingEntity) {
            return res.status(400).json({ success: false, error: 'Locking entity is required' });
        }

        const result = await goblinManagerService.lockGoblin(req.params.id, lockingEntity);

        if (result.success) {
            res.json(result);
        } else {
            res.status(409).json(result); // Conflict status for locked resources
        }
    } catch (error) {
        console.error('Error locking Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/unlock - Unlock a Goblin
 */
router.post('/api/goblin/:id/unlock', async (req, res) => {
    try {
        const { unlockingEntity } = req.body;

        if (!unlockingEntity) {
            return res.status(400).json({ success: false, error: 'Unlocking entity is required' });
        }

        const result = await goblinManagerService.unlockGoblin(req.params.id, unlockingEntity);

        if (result.success) {
            res.json(result);
        } else {
            res.status(403).json(result); // Forbidden status for unauthorized unlock
        }
    } catch (error) {
        console.error('Error unlocking Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/heartbeat - Goblin heartbeat/status update
 */
router.post('/api/goblin/:id/heartbeat', async (req, res) => {
    try {
        const statusUpdate = req.body || {};
        const result = await goblinManagerService.heartbeat(req.params.id, statusUpdate);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error processing Goblin heartbeat:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/deploy-video - Deploy video to specific Goblin
 */
router.post('/api/goblin/:id/deploy-video', async (req, res) => {
    try {
        const result = await goblinManagerService.deployVideoToGoblin(req.params.id, req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error deploying video to Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/play-video - Play video on specific Goblin
 */
router.post('/api/goblin/:id/play-video', async (req, res) => {
    try {
        const { filename, ...options } = req.body;

        if (!filename) {
            return res.status(400).json({ success: false, error: 'Filename is required' });
        }

        const result = await goblinManagerService.playVideoOnGoblin(req.params.id, filename, options);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error playing video on Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblin/:id/stop-all - Stop all playback on Goblin
 */
router.post('/api/goblin/:id/stop-all', async (req, res) => {
    try {
        const goblinResult = await goblinManagerService.getGoblin(req.params.id);

        if (!goblinResult.success) {
            return res.status(404).json(goblinResult);
        }

        const goblin = goblinResult.goblin;

        if (goblin.status !== 'online') {
            return res.status(400).json({ success: false, error: 'Goblin is not online' });
        }

        // Send stop command to Goblin
        const response = await fetch(`${goblin.endpoint}/stop-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });

        const result = await response.json();
        res.json(result);
    } catch (error) {
        console.error('Error stopping playback on Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/goblin/:id/status - Get current Goblin status
 * Always tests live connection regardless of stored status
 */
router.get('/api/goblin/:id/status', async (req, res) => {
    try {
        const goblinResult = await goblinManagerService.getGoblin(req.params.id);

        if (!goblinResult.success) {
            return res.status(404).json(goblinResult);
        }

        const goblin = goblinResult.goblin;

        // Always test live connection regardless of stored status
        try {
            const response = await fetch(`${goblin.endpoint}/health`, {
                timeout: 5000
            });

            if (response.ok) {
                const liveStatus = await response.json();

                // Update goblin status to online if connection successful
                if (goblin.status !== 'online') {
                    goblin.status = 'online';
                    goblin.lastSeen = new Date().toISOString();
                    await goblinManagerService.heartbeat(goblin.id);
                }

                res.json({
                    success: true,
                    status: 'online',
                    goblin: goblin,
                    live: liveStatus
                });
            } else {
                // Update goblin status to offline if connection failed
                if (goblin.status !== 'offline') {
                    goblin.status = 'offline';
                }

                res.json({
                    success: true,
                    status: 'offline',
                    goblin: goblin
                });
            }
        } catch (error) {
            // Update goblin status to offline if connection failed
            if (goblin.status !== 'offline') {
                goblin.status = 'offline';
            }

            res.json({
                success: true,
                status: 'offline',
                goblin: goblin,
                error: error.message
            });
        }
    } catch (error) {
        console.error('Error getting Goblin status:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/stats - Get overall Goblin statistics
 */
router.get('/api/stats', async (req, res) => {
    try {
        const stats = goblinManagerService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        console.error('Error getting Goblin stats:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/broadcast - Broadcast command to all available Goblins
 */
router.post('/api/broadcast', async (req, res) => {
    try {
        const { command, data } = req.body;

        if (!command) {
            return res.status(400).json({ success: false, error: 'Command is required' });
        }

        const goblinsResult = await goblinManagerService.getGoblins({ available: true });

        if (!goblinsResult.success) {
            return res.status(500).json(goblinsResult);
        }

        const results = [];
        const promises = goblinsResult.goblins.map(async (goblin) => {
            try {
                const response = await fetch(`${goblin.endpoint}/${command}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data || {}),
                    timeout: 10000
                });

                const result = await response.json();
                return { goblinId: goblin.id, success: true, result };
            } catch (error) {
                return { goblinId: goblin.id, success: false, error: error.message };
            }
        });

        const allResults = await Promise.allSettled(promises);

        allResults.forEach((promise, index) => {
            if (promise.status === 'fulfilled') {
                results.push(promise.value);
            } else {
                results.push({
                    goblinId: goblinsResult.goblins[index].id,
                    success: false,
                    error: promise.reason.message
                });
            }
        });

        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;

        res.json({
            success: true,
            command,
            totalGoblins: results.length,
            successful,
            failed,
            results
        });
    } catch (error) {
        console.error('Error broadcasting to Goblins:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ===== Video Management Routes =====

/**
 * POST /api/goblins/:id/scan-videos - Scan videos from a specific Goblin
 */
router.post('/api/goblins/:id/scan-videos', async (req, res) => {
    try {
        const result = await goblinVideoService.scanGoblinVideos(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error scanning Goblin videos:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblins/scan-all-videos - Scan videos from all online Goblins
 */
router.post('/api/goblins/scan-all-videos', async (req, res) => {
    try {
        const result = await goblinVideoService.scanAllGoblinVideos();
        res.json(result);
    } catch (error) {
        console.error('Error scanning all Goblin videos:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/goblins/:id/videos - Get cached videos for a Goblin
 */
router.get('/api/goblins/:id/videos', (req, res) => {
    try {
        const videos = goblinVideoService.getGoblinVideos(req.params.id);

        if (videos) {
            res.json({ success: true, ...videos });
        } else {
            res.json({ success: false, error: 'No cached videos. Run scan first.' });
        }
    } catch (error) {
        console.error('Error getting Goblin videos:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/videos/all - Get all cached videos across all Goblins
 */
router.get('/api/videos/all', (req, res) => {
    try {
        const videos = goblinVideoService.getAllGoblinVideos();
        res.json({ success: true, videos });
    } catch (error) {
        console.error('Error getting all Goblin videos:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/goblins/:id/play-video - Play video immediately on a Goblin
 */
router.post('/api/goblins/:id/play-video', async (req, res) => {
    try {
        const { filename, returnToQueue } = req.body;

        if (!filename) {
            return res.status(400).json({ success: false, error: 'Missing filename' });
        }

        const result = await goblinVideoService.playVideoImmediate(
            req.params.id,
            filename,
            { returnToQueue }
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error playing video on Goblin:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/goblins/:id/status - Get playback status from a Goblin
 */
router.get('/api/goblins/:id/status', async (req, res) => {
    try {
        const result = await goblinVideoService.getPlaybackStatus(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error getting Goblin status:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ===== Playlist Management Routes =====

/**
 * GET /api/playlists - Get all playlists
 */
router.get('/api/playlists', (req, res) => {
    try {
        const filters = {
            goblinId: req.query.goblinId,
            search: req.query.search
        };

        const playlists = goblinPlaylistService.getAllPlaylists(filters);
        res.json({ success: true, playlists });
    } catch (error) {
        console.error('Error getting playlists:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/playlists/:id - Get playlist by ID
 */
router.get('/api/playlists/:id', (req, res) => {
    try {
        const playlist = goblinPlaylistService.getPlaylist(req.params.id);

        if (playlist) {
            res.json({ success: true, playlist });
        } else {
            res.status(404).json({ success: false, error: 'Playlist not found' });
        }
    } catch (error) {
        console.error('Error getting playlist:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/playlists - Create new playlist
 */
router.post('/api/playlists', async (req, res) => {
    try {
        const result = await goblinPlaylistService.createPlaylist(req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * PUT /api/playlists/:id - Update playlist
 */
router.put('/api/playlists/:id', async (req, res) => {
    try {
        const result = await goblinPlaylistService.updatePlaylist(req.params.id, req.body);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error updating playlist:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * DELETE /api/playlists/:id - Delete playlist
 */
router.delete('/api/playlists/:id', async (req, res) => {
    try {
        const result = await goblinPlaylistService.deletePlaylist(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error deleting playlist:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/playlists/:id/deploy - Deploy playlist to Goblin(s)
 */
router.post('/api/playlists/:id/deploy', async (req, res) => {
    try {
        const { goblinIds, startImmediately = true } = req.body;

        if (!goblinIds) {
            return res.status(400).json({ success: false, error: 'Missing goblinIds' });
        }

        const result = await goblinPlaylistService.deployPlaylist(
            req.params.id,
            goblinIds,
            startImmediately
        );

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Error deploying playlist:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;