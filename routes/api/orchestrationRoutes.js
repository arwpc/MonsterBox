/**
 * Orchestration API Routes
 * Broadcast/multicast control for all animatronics and Goblins
 */

import express from 'express';
import orchestrationService from '../../services/orchestrationService.js';
import autoAIService from '../../services/autoAIService.js';

const router = express.Router();

/**
 * Get status of all animatronics
 */
router.get('/status', async (req, res) => {
    try {
        const result = await orchestrationService.getAllStatus();
        res.json(result);
    } catch (error) {
        console.error('Error getting orchestration status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get status',
            message: error.message
        });
    }
});

/**
 * Broadcast command to all animatronics
 */
router.post('/broadcast/animatronics', express.json(), async (req, res) => {
    try {
        const { command, params } = req.body;

        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'command is required'
            });
        }

        const result = await orchestrationService.broadcastToAnimatronics(command, params || {});
        res.json(result);
    } catch (error) {
        console.error('Error broadcasting to animatronics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to broadcast command',
            message: error.message
        });
    }
});

/**
 * Broadcast command to all Goblins
 */
router.post('/broadcast/goblins', express.json(), async (req, res) => {
    try {
        const { command, params } = req.body;

        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'command is required'
            });
        }

        const result = await orchestrationService.broadcastToGoblins(command, params || {});
        res.json(result);
    } catch (error) {
        console.error('Error broadcasting to Goblins:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to broadcast command',
            message: error.message
        });
    }
});

/**
 * Broadcast command to all devices (animatronics + Goblins)
 */
router.post('/broadcast/all', express.json(), async (req, res) => {
    try {
        const { command, params } = req.body;

        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'command is required'
            });
        }

        // Broadcast to both animatronics and Goblins
        const [animatronicsResult, goblinsResult] = await Promise.all([
            orchestrationService.broadcastToAnimatronics(command, params || {}),
            orchestrationService.broadcastToGoblins(command, params || {})
        ]);

        res.json({
            success: true,
            command,
            animatronics: animatronicsResult,
            goblins: goblinsResult
        });
    } catch (error) {
        console.error('Error broadcasting to all devices:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to broadcast command',
            message: error.message
        });
    }
});

/**
 * Reboot all animatronics
 */
router.post('/reboot/animatronics', async (req, res) => {
    try {
        const result = await orchestrationService.broadcastToAnimatronics('reboot');
        res.json(result);
    } catch (error) {
        console.error('Error rebooting animatronics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reboot animatronics',
            message: error.message
        });
    }
});

/**
 * Restart services on all animatronics
 */
router.post('/restart-services', async (req, res) => {
    try {
        const result = await orchestrationService.broadcastToAnimatronics('restart-service');
        res.json(result);
    } catch (error) {
        console.error('Error restarting services:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart services',
            message: error.message
        });
    }
});

/**
 * Make all animatronics say something
 */
router.post('/say-all', express.json(), async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        // Each animatronic uses its own character ID
        const results = await Promise.allSettled(
            orchestrationService.animatronics.map(async (animatronic) => {
                return await orchestrationService.executeOnAnimatronic(
                    animatronic,
                    'say',
                    { text, characterId: animatronic.id }
                );
            })
        );

        res.json({
            success: true,
            text,
            results: results.map((r, i) => ({
                animatronic: orchestrationService.animatronics[i].name,
                result: r.value || r.reason
            }))
        });
    } catch (error) {
        console.error('Error making all animatronics speak:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to make animatronics speak',
            message: error.message
        });
    }
});

/**
 * Enable random poses on all animatronics
 */
router.post('/enable-random-poses', express.json(), async (req, res) => {
    try {
        const { cooldownMs, minAmplitude, maxAmplitude } = req.body;

        const results = await Promise.allSettled(
            orchestrationService.animatronics.map(async (animatronic) => {
                return await orchestrationService.executeOnAnimatronic(
                    animatronic,
                    'enable-random-poses',
                    {
                        characterId: animatronic.id,
                        options: { cooldownMs, minAmplitude, maxAmplitude }
                    }
                );
            })
        );

        res.json({
            success: true,
            results: results.map((r, i) => ({
                animatronic: orchestrationService.animatronics[i].name,
                result: r.value || r.reason
            }))
        });
    } catch (error) {
        console.error('Error enabling random poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to enable random poses',
            message: error.message
        });
    }
});

/**
 * Disable random poses on all animatronics
 */
router.post('/disable-random-poses', async (req, res) => {
    try {
        const result = await orchestrationService.broadcastToAnimatronics('disable-random-poses');
        res.json(result);
    } catch (error) {
        console.error('Error disabling random poses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disable random poses',
            message: error.message
        });
    }
});

/**
 * Update configuration on all animatronics
 */
router.post('/update-config', express.json(), async (req, res) => {
    try {
        const { config } = req.body;

        if (!config) {
            return res.status(400).json({
                success: false,
                error: 'config is required'
            });
        }

        const result = await orchestrationService.broadcastToAnimatronics('update-config', { config });
        res.json(result);
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update config',
            message: error.message
        });
    }
});

/**
 * Deploy code to all animatronics
 */
router.post('/deploy-code', async (req, res) => {
    try {
        const result = await orchestrationService.broadcastToAnimatronics('deploy-code');
        res.json(result);
    } catch (error) {
        console.error('Error deploying code:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deploy code',
            message: error.message
        });
    }
});

/**
 * Start all queue loops on all animatronics
 */
router.post('/start-all-queue-loops', async (req, res) => {
    try {
        const result = await orchestrationService.startAllQueueLoops();
        res.json(result);
    } catch (error) {
        console.error('Error starting queue loops:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start queue loops',
            message: error.message
        });
    }
});

/**
 * AUTO AI ROUTES
 */

/**
 * Start Auto AI for a specific animatronic
 */
router.post('/animatronic/:id/auto-ai/start', express.json(), async (req, res) => {
    try {
        const animId = parseInt(req.params.id);
        const { interval } = req.body;
        
        const animatronic = orchestrationService.getAnimatronicById(animId);
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animId} not found`
            });
        }

        const intervalSeconds = interval || 30; // Default 30 seconds
        
        const result = await autoAIService.startAutoAI(
            animId,
            animatronic.ip,
            animatronic.port,
            animatronic.name,
            animatronic.characterId,
            intervalSeconds
        );

        res.json(result);
    } catch (error) {
        console.error('Error starting Auto AI:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start Auto AI',
            message: error.message
        });
    }
});

/**
 * Stop Auto AI for a specific animatronic
 */
router.post('/animatronic/:id/auto-ai/stop', async (req, res) => {
    try {
        const animId = parseInt(req.params.id);
        const result = autoAIService.stopAutoAI(animId);
        res.json(result);
    } catch (error) {
        console.error('Error stopping Auto AI:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop Auto AI',
            message: error.message
        });
    }
});

/**
 * Get Auto AI status for a specific animatronic
 */
router.get('/animatronic/:id/auto-ai/status', async (req, res) => {
    try {
        const animId = parseInt(req.params.id);
        const status = autoAIService.getStatus(animId);
        res.json(status);
    } catch (error) {
        console.error('Error getting Auto AI status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Auto AI status',
            message: error.message
        });
    }
});

/**
 * Get Auto AI status for all animatronics
 */
router.get('/auto-ai/status', async (req, res) => {
    try {
        const statuses = autoAIService.getAllStatuses();
        res.json({
            success: true,
            statuses
        });
    } catch (error) {
        console.error('Error getting all Auto AI statuses:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get Auto AI statuses',
            message: error.message
        });
    }
});

/**
 * Stop Auto AI for all animatronics
 */
router.post('/auto-ai/stop-all', async (req, res) => {
    try {
        const result = autoAIService.stopAll();
        res.json(result);
    } catch (error) {
        console.error('Error stopping all Auto AI:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop all Auto AI',
            message: error.message
        });
    }
});

export default router;

