/**
 * Audio Loop API Routes
 * Persistent background audio looping endpoints
 */

import express from 'express';
import audioLoopService from '../../services/audioLoopService.js';
import audioLibraryService from '../../services/audioLibraryService.js';
import path from 'path';
import fs from 'fs/promises';
import { resolveCharacter } from '../../services/characterContext.js';
import backgroundMusicService, {
    readBackgroundMusicConfig,
    writeBackgroundMusicConfig,
    validateConfig as validateBackgroundMusicConfig
} from '../../services/backgroundMusicService.js';
import { isConfigLockedError } from '../../services/characterConfigLock.js';

const router = express.Router();

/**
 * Start audio loop for a character
 * POST /api/audio-loop/start
 * Body: { characterId, audioId, deviceId?, volume? }
 */
router.post('/start', express.json(), async (req, res) => {
    try {
        const { characterId, audioId, deviceId, volume } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'characterId is required'
            });
        }

        if (!audioId) {
            return res.status(400).json({
                success: false,
                error: 'audioId is required'
            });
        }

        // Resolve audio file path from library
        let audioFile = null;
        
        // Try to find in audio library
        try {
            const library = await audioLibraryService.getAudioFiles({});
            const audioItem = library.audio.find(a => a.id === audioId || a.filename === audioId);
            
            if (audioItem) {
                // Construct full path to audio file
                const appRoot = path.resolve(process.cwd());
                audioFile = path.resolve(appRoot, 'data', 'audio-library', 'files', audioItem.filename);
            }
        } catch (error) {
            console.error('Error loading audio library:', error.message);
        }

        // Only play files resolved from the audio library. Previously an
        // unresolved id was treated as a raw filesystem path, letting a request
        // play (or probe for) arbitrary local files.
        if (!audioFile) {
            return res.status(404).json({
                success: false,
                error: `Audio file not found: ${audioId}`
            });
        }

        // Verify file exists
        try {
            await fs.access(audioFile);
        } catch (error) {
            return res.status(404).json({
                success: false,
                error: `Audio file not found: ${audioId}`
            });
        }

        // Start the loop
        const success = await audioLoopService.startLoop(
            characterId,
            audioFile,
            deviceId || 'default',
            volume || 100
        );

        if (success) {
            res.json({
                success: true,
                message: `Started audio loop for character ${characterId}`,
                characterId,
                audioFile,
                deviceId: deviceId || 'default',
                volume: volume || 100
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to start audio loop'
            });
        }

    } catch (error) {
        console.error('Error starting audio loop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Stop audio loop for a character
 * POST /api/audio-loop/stop
 * Body: { characterId }
 */
router.post('/stop', express.json(), async (req, res) => {
    try {
        const { characterId } = req.body;

        if (!characterId) {
            return res.status(400).json({
                success: false,
                error: 'characterId is required'
            });
        }

        const success = await audioLoopService.stopLoop(characterId);

        res.json({
            success,
            message: success 
                ? `Stopped audio loop for character ${characterId}`
                : `No active loop for character ${characterId}`
        });

    } catch (error) {
        console.error('Error stopping audio loop:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Stop all audio loops
 * POST /api/audio-loop/stop-all
 */
router.post('/stop-all', async (req, res) => {
    try {
        await audioLoopService.stopAllLoops();

        res.json({
            success: true,
            message: 'Stopped all audio loops'
        });

    } catch (error) {
        console.error('Error stopping all loops:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get active loops status
 * GET /api/audio-loop/status
 */
router.get('/status', (req, res) => {
    try {
        const loops = audioLoopService.getActiveLoops();

        res.json({
            success: true,
            loops,
            count: loops.length
        });

    } catch (error) {
        console.error('Error getting loop status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Background music config + live supervisor status for the resolved character.
 * GET /api/audio-loop/background[?characterId=N]
 */
router.get('/background', async (req, res) => {
    try {
        const ctx = await resolveCharacter(req);
        if (!ctx) return res.status(400).json({ success: false, error: 'No character selected' });
        const config = await readBackgroundMusicConfig(ctx.id);
        res.json({ success: true, characterId: ctx.id, config, status: backgroundMusicService.getStatus(ctx.id) });
    } catch (error) {
        console.error('Error reading background music config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Save the background music block (merged over the stored one) and start/stop
 * the supervisor immediately to match.
 * POST /api/audio-loop/background[?characterId=N]
 * Body: { enabled?, tracks?, volume?, shuffle?, resumeDelayMs?, quietHours? }
 */
router.post('/background', express.json(), async (req, res) => {
    try {
        const ctx = await resolveCharacter(req);
        if (!ctx) return res.status(400).json({ success: false, error: 'No character selected' });
        const body = req.body || {};
        const errors = validateBackgroundMusicConfig(body);
        if (errors.length) return res.status(400).json({ success: false, error: errors.join('; '), errors });

        const config = await writeBackgroundMusicConfig(ctx.id, body);
        if (config.enabled) backgroundMusicService.start(ctx.id);
        else backgroundMusicService.stop(ctx.id);

        res.json({ success: true, characterId: ctx.id, config, status: backgroundMusicService.getStatus(ctx.id) });
    } catch (error) {
        if (isConfigLockedError(error)) {
            return res.status(423).json({ success: false, code: error.code, error: error.message });
        }
        console.error('Error saving background music config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Check if character has active loop
 * GET /api/audio-loop/status/:characterId
 */
router.get('/status/:characterId', (req, res) => {
    try {
        const characterId = parseInt(req.params.characterId);
        const hasLoop = audioLoopService.hasActiveLoop(characterId);
        const loops = audioLoopService.getActiveLoops();
        const loop = loops.find(l => l.characterId === characterId);

        res.json({
            success: true,
            characterId,
            hasLoop,
            loop: loop || null
        });

    } catch (error) {
        console.error('Error checking loop status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
