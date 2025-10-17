/**
 * Goblin Management Routes
 * API endpoints for Goblin registration, monitoring, and control
 */

import express from 'express';
import goblinManagerService from '../services/goblinManagerService.js';

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
 */
router.get('/api/goblin/:id/status', async (req, res) => {
    try {
        const goblinResult = await goblinManagerService.getGoblin(req.params.id);
        
        if (!goblinResult.success) {
            return res.status(404).json(goblinResult);
        }

        const goblin = goblinResult.goblin;
        
        if (goblin.status !== 'online') {
            return res.json({ 
                success: true, 
                status: 'offline',
                goblin: goblin 
            });
        }

        // Get live status from Goblin
        try {
            const response = await fetch(`${goblin.endpoint}/health`, {
                timeout: 5000
            });

            if (response.ok) {
                const liveStatus = await response.json();
                res.json({
                    success: true,
                    status: 'online',
                    goblin: goblin,
                    live: liveStatus
                });
            } else {
                res.json({
                    success: true,
                    status: 'unreachable',
                    goblin: goblin
                });
            }
        } catch (error) {
            res.json({
                success: true,
                status: 'unreachable',
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

export default router;