/**
 * Orchestration API Routes
 * Broadcast/multicast control for all animatronics and Goblins
 */

import express from 'express';
import axios from 'axios';
import https from 'https';
import autoAIService from '../../services/autoAIService.js';
import orchestrationService from '../../services/orchestrationService.js';

// HTTPS agent for self-signed certificates on MonsterBox nodes
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const axiosHttps = axios.create({ httpsAgent });

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

// Backward-compatible alias for health-check used by some tests/UI
router.post('/health-check', async (req, res) => {
    try {
        const result = await orchestrationService.getAllStatus();
        return res.json({ success: true, animatronics: result.animatronics, total: result.animatronics.length });
    } catch (error) {
        return res.status(500).json({ success: false, error: 'health-check failed', message: error.message });
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
router.post('/reboot/animatronics', express.json(), async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(n => parseInt(n)).filter(n => Number.isInteger(n)) : null;

        if (ids && ids.length > 0) {
            // Reboot only specified animatronics
            const selected = orchestrationService.getAllAnimatronics().filter(a => ids.includes(a.id));
            const results = await Promise.allSettled(
                selected.map(async (anim) => {
                    try {
                        const result = await orchestrationService.executeOnAnimatronic(anim, 'reboot');
                        return { animatronic: anim.name, success: true, result };
                    } catch (e) {
                        return { animatronic: anim.name, success: false, error: e.message };
                    }
                })
            );
            return res.json({ success: true, command: 'reboot', results: results.map(r => r.value || r.reason) });
        }

        // Default: reboot all
        const result = await orchestrationService.broadcastToAnimatronics('reboot');
        return res.json(result);
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
 * Reboot all goblins
 */
router.post('/reboot/goblins', express.json(), async (req, res) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : null; // goblin IDs are strings

        if (ids && ids.length > 0) {
            const selected = orchestrationService.goblins.filter(g => ids.includes(g.id));
            const results = await Promise.allSettled(
                selected.map(async (g) => {
                    try {
                        const result = await orchestrationService.executeOnGoblin(g, 'reboot');
                        return { goblin: g.name, success: true, result };
                    } catch (e) {
                        return { goblin: g.name, success: false, error: e.message };
                    }
                })
            );
            return res.json({ success: true, command: 'reboot', results: results.map(r => r.value || r.reason) });
        }

        const result = await orchestrationService.broadcastToGoblins('reboot');
        return res.json(result);
    } catch (error) {
        console.error('Error rebooting goblins:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reboot goblins',
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
        const { text, timeoutMs, globalTimeoutMs } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        const perAnimTimeout = Math.max(1000, Math.min(15000, parseInt(timeoutMs, 10) || 5000));
        const overallTimeout = Math.max(perAnimTimeout, Math.min(20000, parseInt(globalTimeoutMs, 10) || 10000));
        const startedAt = Date.now();

        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true' || process.env.NODE_ENV === 'test') {
            return res.json({
                success: true,
                partial: false,
                testMode: true,
                text,
                timeoutMs: perAnimTimeout,
                elapsedMs: Date.now() - startedAt,
                results: orchestrationService.animatronics.map(anim => ({
                    animatronic: anim.name,
                    success: true,
                    result: { testMode: true }
                }))
            });
        }

        // Launch all tasks and track settlements for early partial response
        const settled = new Array(orchestrationService.animatronics.length).fill(null);
        const tasks = orchestrationService.animatronics.map(async (animatronic, index) => {
            try {
                const value = await orchestrationService.executeOnAnimatronic(
                    animatronic,
                    'say',
                    { text, characterId: animatronic.id, timeoutMs: perAnimTimeout }
                );
                settled[index] = { status: 'fulfilled', value };
            } catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                settled[index] = { status: 'rejected', reason };
            }
        });

        let responded = false;

        // Set up overall timeout for early partial results
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, overallTimeout));

        await Promise.race([
            Promise.all(tasks),
            timeoutPromise
        ]);

        // If not all settled by now, respond with partial results
        const allSettled = settled.every(s => s !== null);
        const buildResponse = () => {
            const formattedResults = settled.map((entry, index) => {
                const animatronic = orchestrationService.animatronics[index];
                if (!entry) {
                    return {
                        animatronic: animatronic.name,
                        success: false,
                        error: 'global timeout'
                    };
                }
                if (entry.status === 'fulfilled') {
                    return {
                        animatronic: animatronic.name,
                        success: true,
                        result: entry.value
                    };
                }
                const reason = entry.reason;
                return {
                    animatronic: animatronic.name,
                    success: false,
                    error: reason
                };
            });
            const anySuccess = formattedResults.some(r => r && r.success);
            const failures = formattedResults.filter(r => !r.success).length;
            return {
                success: anySuccess && failures === 0 ? true : anySuccess, // true if at least one succeeded
                partial: !allSettled || (anySuccess && failures > 0),
                text,
                timeoutMs: perAnimTimeout,
                globalTimeoutMs: overallTimeout,
                elapsedMs: Date.now() - startedAt,
                results: formattedResults
            };
        };

        if (!allSettled) {
            responded = true;
            return res.json(buildResponse());
        }

        // All tasks finished within timeout
        const responsePayload = buildResponse();
        return res.json(responsePayload);
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
        if (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true' || process.env.NODE_ENV === 'test') {
            return res.json({
                success: true,
                total: orchestrationService.animatronics.length,
                successful: orchestrationService.animatronics.length,
                results: orchestrationService.animatronics.map(a => ({ name: a.name, success: true, message: 'Scene started (test mode)' }))
            });
        }
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
            animatronics: statuses,
            statuses,
            summary: {
                total: Object.keys(statuses).length,
                active: Object.values(statuses).filter(status => status && status.active).length
            }
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

/**
 * Proxy webcam stream from specific animatronic
 */
router.get('/animatronic/:id/webcam-stream', async (req, res) => {
    try {
        const animId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animId);

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: 'Animatronic not found'
            });
        }

        // Import axios for streaming
        // Using top-level axiosHttps instance

        // Get the webcam stream URL from the animatronic's conversation API
        const streamUrlResponse = await axiosHttps.get(
            `https://${animatronic.ip}:${animatronic.port}/conversation/api/webcam-stream-url`,
            { timeout: 5000 }
        );

        if (!streamUrlResponse.data || !streamUrlResponse.data.url) {
            return res.status(404).json({
                success: false,
                error: 'Webcam stream URL not available'
            });
        }

        let webcamPath = streamUrlResponse.data.url;
        // If the URL is absolute (contains protocol), extract just the path
        if (webcamPath.startsWith('http')) {
            try { webcamPath = new URL(webcamPath).pathname; } catch (_) { /* keep as-is */ }
        }
        const webcamUrl = `https://${animatronic.ip}:${animatronic.port}${webcamPath}`;

        console.log(`📹 Streaming webcam for ${animatronic.name} from ${webcamUrl}`);

        // Stream the webcam feed
        const response = await axiosHttps({
            method: 'get',
            url: webcamUrl,
            responseType: 'stream',
            timeout: 30000
        });

        // Set headers for MJPEG stream
        res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        // Pipe the stream
        response.data.pipe(res);

        // Handle errors
        response.data.on('error', (error) => {
            console.error(`Webcam stream error for ${animatronic.name}:`, error.message);
            if (!res.headersSent) {
                res.status(500).end();
            }
        });

        req.on('close', () => {
            response.data.destroy();
        });

    } catch (error) {
        console.error('Error proxying webcam stream:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to proxy webcam stream',
                message: error.message
            });
        }
    }
});

/**
 * Get audio files from an animatronic (proxy to animatronic's API)
 */
router.get('/animatronic/:id/audio-files', async (req, res) => {
    try {
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        // Proxy request to animatronic's audio files API with robust fallbacks
        // Using top-level axiosHttps instance

        const tryEndpoints = async () => {
            const endpoints = [
                { url: `https://${animatronic.ip}:${animatronic.port}/audio-library/api/audio-select`, type: 'array' },
                { url: `https://${animatronic.ip}:${animatronic.port}/audio-library/api/library?format=legacy`, type: 'object-legacy' },
                { url: `https://${animatronic.ip}:${animatronic.port}/audio-library/api/library`, type: 'object' }
            ];

            let lastError;
            for (const ep of endpoints) {
                try {
                    const resp = await axiosHttps.get(ep.url, { timeout: 8000 });
                    let files = [];
                    if (Array.isArray(resp.data)) {
                        files = resp.data;
                    } else if (resp.data && (resp.data.audio || resp.data.files)) {
                        files = resp.data.audio || resp.data.files || [];
                    }
                    if (files && files.length >= 0) {
                        return files;
                    }
                } catch (e) {
                    lastError = e;
                    // try next endpoint
                }
            }
            if (lastError) throw lastError;
            return [];
        };

        let files = await tryEndpoints();

        // Deduplicate by filename (case-insensitive) to avoid duplicates across migrations
        const seen = new Set();
        const unique = [];
        for (const f of files) {
            const key = (f.filename || f.title || f.id || '').toString().trim().toLowerCase();
            if (!key) continue;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(f);
            }
        }

        return res.json({ success: true, audio: unique, files: unique, totalFiles: unique.length });
    } catch (error) {
        console.error(`Error getting audio files for animatronic ${req.params.id}:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to get audio files',
            message: error.message
        });
    }
});

/**
 * Get webcam stream URL from an animatronic (proxy to animatronic's API)
 */
router.get('/animatronic/:id/webcam-url', async (req, res) => {
    try {
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        // Proxy request to animatronic's webcam URL API (will fail if offline)
        // Using top-level axiosHttps instance
        // Retry webcam URL too, slightly longer timeout
        const maxAttempts = 2;
        let response;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                response = await axiosHttps.get(`https://${animatronic.ip}:${animatronic.port}/conversation/api/webcam-stream-url`, {
                    timeout: 8000
                });
                break;
            } catch (e) {
                if (attempt >= maxAttempts) throw e;
                await new Promise(r => setTimeout(r, 300));
            }
        }

        // Return the webcam stream URL
        // The animatronic returns an absolute URL, but we need to ensure it points to the correct IP
        if (response.data && response.data.success && response.data.url) {
            let webcamUrl = response.data.url;

            // If the URL is absolute (starts with http), extract the path and rebuild it
            if (webcamUrl.startsWith('http')) {
                const urlObj = new URL(webcamUrl);
                webcamUrl = urlObj.pathname;
            }

            // Build the full URL with the animatronic's IP
            const fullUrl = `https://${animatronic.ip}:${animatronic.port}${webcamUrl}`;

            res.json({
                success: true,
                url: fullUrl
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Webcam URL not available'
            });
        }
    } catch (error) {
        console.error(`Error getting webcam URL for animatronic ${req.params.id}:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to get webcam URL',
            message: error.message
        });
    }
});

/**
 * Make a specific animatronic say text (TTS)
 */
router.post('/animatronic/:id/say', express.json(), async (req, res) => {
    try {
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);
        const { text } = req.body;

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        // Proxy to animatronic's generate-and-play API
        // Using top-level axiosHttps instance
        const response = await axiosHttps.post(
            `https://${animatronic.ip}:${animatronic.port}/api/elevenlabs/generate-and-play`,
            { text, characterId: animatronic.characterId },
            { timeout: 30000 }
        );

        res.json({
            success: true,
            message: `${animatronic.name} is speaking`,
            data: response.data
        });
    } catch (error) {
        console.error(`Error making animatronic ${req.params.id} say:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to make animatronic speak',
            message: error.message
        });
    }
});

/**
 * Ask AI on a specific animatronic
 */
router.post('/animatronic/:id/ask-ai', express.json(), async (req, res) => {
    try {
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);
        const { text } = req.body;

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'text is required'
            });
        }

        // Prefer device agent-speak API with explicit characterId to avoid reliance on device-selected character
        // Using top-level axiosHttps instance
        const url = `https://${animatronic.ip}:${animatronic.port}/api/elevenlabs/agent-speak`;
        try {
            const response = await axiosHttps.post(
                url,
                { text, characterId: animatronic.characterId, fallbackToTTS: true },
                { timeout: 60000 }
            );

            if (response.data && response.data.success) {
                // Extract the actual AI response text
                const aiResponseText = response.data.personalityText || response.data.text || response.data.response || response.data.agentResponse || 'Response generated';

                return res.json({
                    success: true,
                    message: `AI responded from ${animatronic.name}`,
                    data: {
                        ...response.data,
                        text: aiResponseText  // Always include the actual response text
                    }
                });
            }

            // Fallback to simple TTS generate-and-play if agent fails
            const details = response.data && (response.data.error || response.data.message);
            console.warn(`Ask-AI primary failed for ${animatronic.name} -> ${url}: ${details || 'unknown error'}, trying generate-and-play`);
        } catch (e) {
            const status = e?.response?.status;
            const data = e?.response?.data;
            console.warn(`Ask-AI proxy error -> ${url} [${status || 'no-status'}]:`, e.message, data ? `payload: ${JSON.stringify(data).slice(0, 500)}` : '', 'Using TTS fallback...');
        }

        // Fallback path: use generate-and-play which is widely available across device versions
        try {
            const ttsUrl = `https://${animatronic.ip}:${animatronic.port}/api/elevenlabs/generate-and-play`;
            const tts = await axiosHttps.post(ttsUrl, { text, characterId: animatronic.characterId }, { timeout: 60000 });
            if (tts.data && tts.data.success) {
                return res.json({
                    success: true,
                    message: `AI (TTS) responded from ${animatronic.name}`,
                    data: {
                        ...tts.data,
                        text: text,  // Return the original text as the response for TTS fallback
                        fallback: 'generate-and-play'
                    }
                });
            }
            const d = tts.data && (tts.data.error || tts.data.message);
            return res.status(500).json({ success: false, error: 'Ask AI failed', message: d || 'TTS fallback failed', device: { url: ttsUrl } });
        } catch (fbErr) {
            const fbs = fbErr?.response?.status;
            const fbd = fbErr?.response?.data;
            console.error(`Ask-AI TTS fallback error for ${animatronic.name} -> generate-and-play [${fbs || 'no-status'}]:`, fbErr.message, fbd ? `payload: ${JSON.stringify(fbd).slice(0, 500)}` : '');
            return res.status(500).json({ success: false, error: 'Failed to ask AI', message: fbErr.message, status: fbs, details: fbd && (fbd.error || fbd.message) });
        }
    } catch (error) {
        console.error(`Error asking AI on animatronic ${req.params.id}:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to ask AI',
            message: error.message
        });
    }
});

/**
 * Play audio on a specific animatronic
 */
router.post('/animatronic/:id/play-audio', express.json(), async (req, res) => {
    try {
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);
        const { audioId, volume, audioTitle, filename, loop } = req.body;

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        if (!audioId) {
            return res.status(400).json({
                success: false,
                error: 'audioId is required'
            });
        }

        // First try animatronic's audio playback API (exact ID): /audio-library/api/audio/:id/play
        // Using top-level axiosHttps instance
        const url = `https://${animatronic.ip}:${animatronic.port}/audio-library/api/audio/${encodeURIComponent(audioId)}/play`;
        try {
            const response = await axiosHttps.post(
                url,
                {
                    characterId: animatronic.characterId,
                    volume: Number.isFinite(volume) ? volume : 100,
                    loop: loop === true  // Pass loop parameter to the device
                },
                { timeout: 30000 }
            );

            if (!response.data || response.data.success === false) {
                const details = response.data && (response.data.error || response.data.message);
                // Fallback to conversation play-audio which supports flexible identifiers
                throw new Error(details || 'Device returned failure');
            }

            return res.json({
                success: true,
                message: `Playing audio on ${animatronic.name}`,
                data: response.data
            });
        } catch (e) {
            const status = e?.response?.status;
            const data = e?.response?.data;
            console.warn(`Play-audio primary failed for ${animatronic.name} -> ${url} [${status || 'no-status'}]:`, (e && e.message) || 'error');
            // Attempt fallback A: device conversation API can resolve by multiple fields (newer builds)
            try {
                const fallbackUrl = `https://${animatronic.ip}:${animatronic.port}/conversation/api/play-audio`;
                const body = {
                    audioId,
                    audio: { id: audioId, title: audioTitle || undefined, filename: filename || undefined },
                    text: audioTitle || undefined,
                    characterId: animatronic.characterId,
                    volume: Number.isFinite(volume) ? volume : 100,
                    loop: loop === true  // Include loop in fallback
                };
                const fb = await axiosHttps.post(fallbackUrl, body, { timeout: 30000 });
                if (fb.data && fb.data.success) {
                    return res.json({ success: true, message: `Playing audio on ${animatronic.name} (fallback)`, data: fb.data, fallback: true });
                }
                const det = fb.data && (fb.data.error || fb.data.message);
                console.warn(`Play-audio conversation fallback failed for ${animatronic.name}: ${det || 'unknown'}, trying stop-gap...`);
            } catch (fbErr) {
                const fbs = fbErr?.response?.status;
                const fbd = fbErr?.response?.data;
                console.warn(`Play-audio fallback error -> ${animatronic.name} conversation/play-audio [${fbs || 'no-status'}]:`, fbErr.message, fbd ? `payload: ${JSON.stringify(fbd).slice(0, 500)}` : '');
            }

            // Attempt fallback B: try to resolve by filename via audio-library directly (older builds)
            try {
                if (filename) {
                    const altUrl = `https://${animatronic.ip}:${animatronic.port}/audio-library/api/audio/play-by-filename`;
                    const altBody = {
                        filename,
                        characterId: animatronic.characterId,
                        volume: Number.isFinite(volume) ? volume : 100,
                        loop: loop === true  // Include loop in filename fallback
                    };
                    const alt = await axiosHttps.post(altUrl, altBody, { timeout: 30000 }).catch(() => null);
                    if (alt && alt.data && alt.data.success) {
                        return res.json({ success: true, message: `Playing audio on ${animatronic.name} (filename)`, data: alt.data, fallback: 'filename' });
                    }
                }
            } catch (_) { /* ignore */ }

            return res.status(500).json({ success: false, error: 'Failed to play audio', message: (data && (data.error || data.message)) || e.message });
        }
    } catch (error) {
        console.error(`Error playing audio on animatronic ${req.params.id}:`, error.message);
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
        const animatronicId = parseInt(req.params.id);
        const animatronic = orchestrationService.getAnimatronicById(animatronicId);

        if (!animatronic) {
            return res.status(404).json({
                success: false,
                error: `Animatronic ${animatronicId} not found`
            });
        }

        // Try multiple known endpoints across versions
        // Using top-level axiosHttps instance

        // A) Newer: audio-library mounted route
        const tryStop = async (endpoint) => {
            try {
                const resp = await axiosHttps.post(endpoint, {}, { timeout: 8000 });
                if (resp.data && resp.data.success) return { ok: true, data: resp.data };
                return { ok: false, error: resp.data && (resp.data.error || resp.data.message) };
            } catch (err) {
                return { ok: false, error: err.message, status: err?.response?.status };
            }
        };

        const endpoints = [
            `https://${animatronic.ip}:${animatronic.port}/audio-library/api/audio/stop-all`,
            `https://${animatronic.ip}:${animatronic.port}/api/audio/stop-all`
        ];

        for (const ep of endpoints) {
            const r = await tryStop(ep);
            if (r.ok) {
                return res.json({ success: true, message: `Stopped audio on ${animatronic.name}`, data: r.data, device: { url: ep } });
            }
            console.warn(`Stop-audio attempt failed for ${animatronic.name} -> ${ep}: ${r.error || 'unknown error'}${r.status ? ` [${r.status}]` : ''}`);
        }

        return res.status(500).json({ success: false, error: 'Failed to stop audio', message: 'All stop endpoints failed' });
    } catch (error) {
        console.error(`Error stopping audio on animatronic ${req.params.id}:`, error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to stop audio',
            message: error.message
        });
    }
});

export default router;

