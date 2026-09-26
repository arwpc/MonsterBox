/**
 * Video Library Routes
 * RESTful API for the shared video library system with Goblin deployment
 */

import express from 'express';
import { promises as fs, createReadStream } from 'fs';
import multer from 'multer';
import path from 'path';
import goblinManagerService from '../services/goblinManagerService.js';
import videoLibraryService from '../services/videoLibraryService.js';

const router = express.Router();

/**
 * The name a library video carries on a Goblin's disk: its original upload name, not
 * the UUID storage name (`fileName`) that exists only in data/video-library/files.
 * Sending the UUID name to a Goblin used to "succeed" and show nothing.
 */
function goblinFilenameFor(video) {
    const candidate = video.originalName && videoLibraryService.isValidVideoFormat(video.originalName)
        ? video.originalName
        : (video.title && video.format ? `${video.title}.${video.format}` : video.fileName);
    return path.basename(candidate);
}

/**
 * Copy one library video onto one Goblin and remember where it went.
 */
async function deployLibraryVideo(videoId, goblinId) {
    const streamResult = await videoLibraryService.getVideoStream(videoId);
    if (!streamResult.success) return { status: 404, body: streamResult };
    const video = streamResult.video;
    const result = await goblinManagerService.deployVideoToGoblin(goblinId, {
        sourcePath: streamResult.filePath,
        targetName: goblinFilenameFor(video),
        title: video.title
    });
    if (result.success) {
        const deployments = { ...(video.deployments || {}) };
        deployments[goblinId] = { filename: result.filename, deployedAt: new Date().toISOString(), goblinName: result.goblinName };
        await videoLibraryService.updateVideo(videoId, { deployments });
    }
    return { status: result.success ? 200 : 502, body: { ...result, videoId, goblinId } };
}

// Configure multer for video file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB limit for videos
        files: 5 // Max 5 files at once
    },
    fileFilter: (req, file, cb) => {
        if (videoLibraryService.isValidVideoMime(file.mimetype) ||
            videoLibraryService.isValidVideoFormat(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid video format'), false);
        }
    }
});

// Main video library page
router.get('/', (req, res) => {
    res.renderWithLayout('video-library/index', {
        title: 'Video Library - MonsterBox',
        page: 'video-library',
        pageTitle: 'Video Library',
        styles: ['/css/mb-video-library.css']
    });
});

// API Routes

/**
 * GET /api/library - Get all video files with filtering
 */
router.get('/api/library', async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            category: req.query.category,
            format: req.query.format,
            sortBy: req.query.sortBy,
            favorite: req.query.favorite,
            minDuration: req.query.minDuration ? parseFloat(req.query.minDuration) : undefined,
            maxDuration: req.query.maxDuration ? parseFloat(req.query.maxDuration) : undefined
        };

        const result = await videoLibraryService.getLibrary(filters);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error getting video library:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

router.get('/api/videos', async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            category: req.query.category,
            format: req.query.format,
            sortBy: req.query.sortBy,
            favorite: req.query.favorite,
            minDuration: req.query.minDuration ? parseFloat(req.query.minDuration) : undefined,
            maxDuration: req.query.maxDuration ? parseFloat(req.query.maxDuration) : undefined
        };

        const result = await videoLibraryService.getLibrary(filters);
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error getting video list:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/deploy - Deploy video to specific Goblin (frontend-compatible endpoint)
 */
router.post('/api/deploy', async (req, res) => {
    try {
        const { videoId, goblinId } = req.body || {};
        if (!videoId || !goblinId) {
            return res.status(400).json({ success: false, error: 'Video ID and Goblin ID are required' });
        }
        const { status, body } = await deployLibraryVideo(videoId, goblinId);
        res.status(status).json(body);
    } catch (error) {
        console.error('Error deploying video to Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/upload - Upload video files
 */
router.post('/api/upload', upload.array('videoFiles', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'No video files provided' });
        }

        const results = [];
        const errors = [];

        for (const file of req.files) {
            const metadata = {
                originalname: file.originalname,
                title: req.body.title || path.basename(file.originalname, path.extname(file.originalname)),
                description: req.body.description || '',
                category: req.body.category || 'other',
                tags: req.body.tags || ''
            };

            const result = await videoLibraryService.addVideo(file.buffer, metadata);

            if (result.success) {
                results.push(result.video);
            } else {
                errors.push({
                    filename: file.originalname,
                    error: result.error
                });
            }
        }

        res.json({
            success: true,
            uploaded: results,
            errors: errors,
            totalUploaded: results.length,
            totalErrors: errors.length
        });
    } catch (error) {
        console.error('Error uploading videos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/video/:id - Get video details
 */
router.get('/api/video/:id', async (req, res) => {
    try {
        const result = await videoLibraryService.getVideo(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error getting video:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * PUT /api/video/:id - Update video metadata
 */
router.put('/api/video/:id', async (req, res) => {
    try {
        const updates = {
            title: req.body.title,
            description: req.body.description,
            category: req.body.category,
            tags: req.body.tags,
            favorite: req.body.favorite
        };

        // Remove undefined values
        Object.keys(updates).forEach(key =>
            updates[key] === undefined && delete updates[key]
        );

        const result = await videoLibraryService.updateVideo(req.params.id, updates);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error updating video:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * DELETE /api/video/:id - Delete video
 */
router.delete('/api/video/:id', async (req, res) => {
    try {
        const result = await videoLibraryService.deleteVideo(req.params.id);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/video/:id/stream - Stream video file
 */
router.get('/api/video/:id/stream', async (req, res) => {
    try {
        const result = await videoLibraryService.getVideoStream(req.params.id);

        if (!result.success) {
            return res.status(404).json(result);
        }

        const { filePath, video } = result;
        const stat = await fs.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            // Support for video streaming with range requests
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': `video/${video.format}`,
                'Content-Disposition': `inline; filename="${video.originalName}"`
            });

            const stream = createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': `video/${video.format}`,
                'Content-Disposition': `inline; filename="${video.originalName}"`
            });

            const stream = createReadStream(filePath);
            stream.pipe(res);
        }
    } catch (error) {
        console.error('Error streaming video:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/video/:id/download - Download video file
 */
router.get('/api/video/:id/download', async (req, res) => {
    try {
        const result = await videoLibraryService.getVideoStream(req.params.id);

        if (!result.success) {
            return res.status(404).json(result);
        }

        const { filePath, video } = result;

        res.setHeader('Content-Disposition', `attachment; filename="${video.originalName}"`);
        res.setHeader('Content-Type', `video/${video.format}`);

        const stream = createReadStream(filePath);
        stream.pipe(res);
    } catch (error) {
        console.error('Error downloading video:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/video/:id/thumbnail - Get video thumbnail
 */
router.get('/api/video/:id/thumbnail', async (req, res) => {
    try {
        const result = await videoLibraryService.getThumbnail(req.params.id);

        if (!result.success) {
            return res.status(404).json(result);
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

        const stream = createReadStream(result.thumbnailPath);
        stream.pipe(res);
    } catch (error) {
        console.error('Error getting thumbnail:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * POST /api/video/:id/deploy - Deploy video to specific Goblin (legacy endpoint)
 */
router.post('/api/video/:id/deploy', async (req, res) => {
    try {
        const { goblinId } = req.body || {};
        if (!goblinId) {
            return res.status(400).json({ success: false, error: 'Goblin ID is required' });
        }
        const { status, body } = await deployLibraryVideo(req.params.id, goblinId);
        res.status(status).json(body);
    } catch (error) {
        console.error('Error deploying video to Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/video/:id/play-on-goblin - Play a library video on a Goblin.
 * Body: { goblinId, mode: 'once'|'loop', deploy: true }
 * If the Goblin does not hold the file yet it is copied over first (unless
 * `deploy:false`). Success means the device reports mpv showing that file.
 */
router.post('/api/video/:id/play-on-goblin', async (req, res) => {
    try {
        const { goblinId, mode, loop, deploy } = req.body || {};
        if (!goblinId) {
            return res.status(400).json({ success: false, error: 'Goblin ID is required' });
        }
        const videoResult = await videoLibraryService.getVideo(req.params.id);
        if (!videoResult.success) {
            return res.status(404).json(videoResult);
        }
        const video = videoResult.video;
        const filename = goblinFilenameFor(video);
        const wantLoop = mode === 'loop' || (mode === undefined && loop === true);

        let playResult = await goblinManagerService.playVideoOnGoblin(goblinId, filename, { loop: wantLoop });
        let deployed = false;
        if (!playResult.success && playResult.notOnGoblin && deploy !== false) {
            const { body } = await deployLibraryVideo(req.params.id, goblinId);
            if (!body.success) {
                return res.status(502).json({ ...body, filename });
            }
            deployed = true;
            playResult = await goblinManagerService.playVideoOnGoblin(goblinId, body.filename, { loop: wantLoop, checkPresence: false });
        }

        if (playResult.success) {
            await videoLibraryService.updateVideo(req.params.id, {
                playCount: (video.playCount || 0) + 1,
                lastPlayed: new Date().toISOString()
            });
        }
        res.status(playResult.success ? 200 : 502).json({ ...playResult, deployed, filename, mode: wantLoop ? 'loop' : 'once' });
    } catch (error) {
        console.error('Error playing video on Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/video/:id/favorite - Toggle the favourite flag (the page has called this
 * since the redesign; it was never served, so every heart click 404'd).
 */
router.post('/api/video/:id/favorite', async (req, res) => {
    try {
        const videoResult = await videoLibraryService.getVideo(req.params.id);
        if (!videoResult.success) return res.status(404).json(videoResult);
        const favorite = typeof req.body?.favorite === 'boolean' ? req.body.favorite : !videoResult.video.favorite;
        const result = await videoLibraryService.updateVideo(req.params.id, { favorite });
        res.status(result.success ? 200 : 500).json({ ...result, favorite });
    } catch (error) {
        console.error('Error toggling favorite:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/video/:id/play - Record a local preview play (play count + last played).
 */
router.post('/api/video/:id/play', async (req, res) => {
    try {
        const videoResult = await videoLibraryService.getVideo(req.params.id);
        if (!videoResult.success) return res.status(404).json(videoResult);
        const result = await videoLibraryService.updateVideo(req.params.id, {
            playCount: (videoResult.video.playCount || 0) + 1,
            lastPlayed: new Date().toISOString()
        });
        res.status(result.success ? 200 : 500).json(result);
    } catch (error) {
        console.error('Error recording play:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== Videos that live on the Goblins themselves =====

/**
 * GET /api/goblins/:id/videos?rescan=1 - What is on that Goblin's disk right now,
 * read from the device (not MonsterBox's stale cache), plus its playback state.
 */
router.get('/api/goblins/:id/videos', async (req, res) => {
    try {
        const rescan = req.query.rescan === '1' || req.query.rescan === 'true';
        const result = await goblinManagerService.listGoblinVideos(req.params.id, { rescan });
        res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
        console.error('Error listing Goblin videos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/goblins/:id/playback - Live playback status from the device.
 */
router.get('/api/goblins/:id/playback', async (req, res) => {
    try {
        const result = await goblinManagerService.getGoblinPlayback(req.params.id);
        res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
        console.error('Error reading Goblin playback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/goblins/:id/play - Play a file already on the Goblin.
 * Body: { filename, mode: 'once'|'loop' }
 */
router.post('/api/goblins/:id/play', async (req, res) => {
    try {
        const { filename, mode } = req.body || {};
        if (!filename || typeof filename !== 'string') {
            return res.status(400).json({ success: false, error: 'filename is required' });
        }
        const result = mode === 'loop'
            ? await goblinManagerService.loopVideoOnGoblin(req.params.id, filename)
            : await goblinManagerService.playVideoOnGoblin(req.params.id, filename);
        res.status(result.success ? 200 : 502).json({ ...result, mode: mode === 'loop' ? 'loop' : 'once' });
    } catch (error) {
        console.error('Error playing Goblin video:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/goblins/:id/stop - Stop playback and the queue on a Goblin.
 */
router.post('/api/goblins/:id/stop', async (req, res) => {
    try {
        const result = await goblinManagerService.stopGoblin(req.params.id);
        res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
        console.error('Error stopping Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/goblins/:id/resume - The all-clear: start the Goblin's own queue loop
 * again after a stop (Emergency Stop, the Stop button, a suite that fired one).
 */
router.post('/api/goblins/:id/resume', async (req, res) => {
    try {
        const result = await goblinManagerService.resumeGoblinQueue(req.params.id);
        res.status(result.success ? 200 : 502).json(result);
    } catch (error) {
        console.error('Error resuming Goblin queue:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/search - Advanced video search
 */
router.post('/api/search', async (req, res) => {
    try {
        const filters = req.body;
        const result = await videoLibraryService.getLibrary(filters);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('Error performing video search:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

/**
 * GET /api/stats - Get video library statistics
 */
router.get('/api/stats', async (req, res) => {
    try {
        const result = await videoLibraryService.getStorageStats();
        res.json(result);
    } catch (error) {
        console.error('Error getting video library stats:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Error handling middleware
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Video file too large. Maximum size is 500MB per file.'
            });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                error: 'Too many files. Maximum 5 files per upload.'
            });
        }
    }

    res.status(400).json({
        success: false,
        error: error.message || 'Upload failed'
    });
});

export default router;