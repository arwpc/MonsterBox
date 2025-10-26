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
 * Make a specific animatronic say something (direct speech without AI processing)
 */
router.post('/animatronic/:id/say', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        const animatronic = orchestrationService.animatronics.find(a => a.id === parseInt(id));
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const result = await orchestrationService.executeOnAnimatronic(
            animatronic,
            'say-direct',
            { text }
        );

        res.json({
            success: true,
            animatronic: animatronic.name,
            text,
            result
        });
    } catch (error) {
        console.error('Error making animatronic speak:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to make animatronic speak',
            message: error.message
        });
    }
});

/**
 * Ask AI on a specific animatronic using WebSocket conversation system
 */
router.post('/animatronic/:id/ask-ai', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        const animatronic = orchestrationService.animatronics.find(a => a.id === parseInt(id));
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const result = await orchestrationService.executeOnAnimatronic(
            animatronic,
            'ask-ai',
            { text }
        );

        res.json({
            success: true,
            animatronic: animatronic.name,
            text,
            result
        });
    } catch (error) {
        console.error('Error asking AI:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to ask AI',
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
 * Get audio files from a specific animatronic
 */
router.get('/animatronic/:id/audio-files', async (req, res) => {
    try {
        const { id } = req.params;

        const animatronic = orchestrationService.animatronics.find(a => a.id === parseInt(id));
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const result = await orchestrationService.getAudioFiles(animatronic.ip, animatronic.port);
        res.json(result);
    } catch (error) {
        console.error('Error getting audio files:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get audio files',
            message: error.message
        });
    }
});

/**
 * Play audio on a specific animatronic
 */
router.post('/animatronic/:id/play-audio', express.json(), async (req, res) => {
    try {
        const { id } = req.params;
        const { audioId, loop } = req.body;

        if (!audioId) {
            return res.status(400).json({
                success: false,
                error: 'audioId is required'
            });
        }

        const animatronic = orchestrationService.animatronics.find(a => a.id === parseInt(id));
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        // Get character ID from the animatronic (fetch it if not cached)
        let characterId = animatronic.characterId;
        if (!characterId) {
            try {
                const health = await orchestrationService.healthCheck(animatronic.ip, animatronic.port);
                characterId = health.characterId || 1;
                // Cache it for next time
                animatronic.characterId = characterId;
            } catch (error) {
                // Default to 1 if we can't fetch it
                characterId = 1;
            }
        }

        const result = await orchestrationService.playAudio(
            animatronic.ip,
            animatronic.port,
            audioId,
            characterId,
            loop || false
        );

        res.json({
            success: true,
            animatronic: animatronic.name,
            audioId,
            characterId,
            loop,
            result
        });
    } catch (error) {
        console.error('Error playing audio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to play audio',
            message: error.message
        });
    }
});

/**
 * Stop audio on a specific animatronic
 */
router.post('/animatronic/:id/stop-audio', async (req, res) => {
    try {
        const { id } = req.params;

        const animatronic = orchestrationService.animatronics.find(a => a.id === parseInt(id));
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const result = await orchestrationService.stopAudio(animatronic.ip, animatronic.port);

        res.json({
            success: true,
            animatronic: animatronic.name,
            result
        });
    } catch (error) {
        console.error('Error stopping audio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop audio',
            message: error.message
        });
    }
});

/**
 * Start Auto AI for an animatronic
 * POST /api/orchestration/animatronic/:id/auto-ai/start
 */
router.post('/animatronic/:id/auto-ai/start', express.json(), async (req, res) => {
    try {
        const animId = parseInt(req.params.id);
        const { interval } = req.body; // Optional: interval in seconds (default 30)

        const animatronic = orchestrationService.getAnimatronicById(animId);
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const intervalSeconds = interval && Number.isInteger(interval) && interval > 0 ? interval : 30;
        
        const result = await autoAIService.startAutoAI(
            animId,
            animatronic.ip,
            animatronic.port,
            animatronic.name,
            intervalSeconds
        );

        res.json({
            success: true,
            animatronic: animatronic.name,
            result
        });
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
 * Stop Auto AI for an animatronic
 * POST /api/orchestration/animatronic/:id/auto-ai/stop
 */
router.post('/animatronic/:id/auto-ai/stop', express.json(), async (req, res) => {
    try {
        const animId = parseInt(req.params.id);

        const animatronic = orchestrationService.getAnimatronicById(animId);
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const result = autoAIService.stopAutoAI(animId);

        res.json({
            success: true,
            animatronic: animatronic.name,
            result
        });
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
 * Get Auto AI status for an animatronic
 * GET /api/orchestration/animatronic/:id/auto-ai/status
 */
router.get('/animatronic/:id/auto-ai/status', async (req, res) => {
    try {
        const animId = parseInt(req.params.id);

        const animatronic = orchestrationService.getAnimatronicById(animId);
        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        const status = autoAIService.getStatus(animId);

        res.json({
            success: true,
            animatronic: animatronic.name,
            autoAI: status
        });
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
 * Get all Auto AI statuses
 * GET /api/orchestration/auto-ai/status
 */
router.get('/auto-ai/status', async (req, res) => {
    try {
        const statuses = autoAIService.getAllStatuses();

        res.json({
            success: true,
            autoAI: statuses
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
 * Stop all Auto AI instances
 * POST /api/orchestration/auto-ai/stop-all
 */
router.post('/auto-ai/stop-all', express.json(), async (req, res) => {
    try {
        const result = autoAIService.stopAll();

        res.json({
            success: true,
            result
        });
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

