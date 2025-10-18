/**
 * Video Library Routes
 * RESTful API for the shared video library system with Goblin deployment
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import videoLibraryService from '../services/videoLibraryService.js';
import goblinManagerService from '../services/goblinManagerService.js';

const router = express.Router();

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
        title: 'Video Library - MonsterBox 5.3',
        page: 'video-library',
        pageTitle: 'Video Library'
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

/**
 * POST /api/deploy - Deploy video to specific Goblin (frontend-compatible endpoint)
 */
router.post('/api/deploy', async (req, res) => {
    console.log('🎯 POST /api/deploy called with body:', req.body);
    try {
        const { videoId, goblinId } = req.body;

        if (!videoId || !goblinId) {
            return res.status(400).json({ success: false, error: 'Video ID and Goblin ID are required' });
        }

        // Get video data
        const videoResult = await videoLibraryService.getVideo(videoId);
        if (!videoResult.success) {
            return res.status(404).json(videoResult);
        }

        const streamResult = await videoLibraryService.getVideoStream(videoId);
        if (!streamResult.success) {
            return res.status(404).json(streamResult);
        }

        // Read video file
        const videoBuffer = await fs.readFile(streamResult.filePath);

        // Deploy to Goblin
        const deployResult = await goblinManagerService.deployVideoToGoblin(goblinId, {
            filename: videoResult.video.fileName,
            originalName: videoResult.video.originalName,
            title: videoResult.video.title,
            data: videoBuffer.toString('base64')
        });

        res.json(deployResult);
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

            const stream = require('fs').createReadStream(filePath, { start, end });
            stream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': `video/${video.format}`,
                'Content-Disposition': `inline; filename="${video.originalName}"`
            });

            const stream = require('fs').createReadStream(filePath);
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
        
        const stream = require('fs').createReadStream(filePath);
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
        
        const stream = require('fs').createReadStream(result.thumbnailPath);
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
        const { goblinId } = req.body;

        if (!goblinId) {
            return res.status(400).json({ success: false, error: 'Goblin ID is required' });
        }

        // Get video data
        const videoResult = await videoLibraryService.getVideo(req.params.id);
        if (!videoResult.success) {
            return res.status(404).json(videoResult);
        }

        const streamResult = await videoLibraryService.getVideoStream(req.params.id);
        if (!streamResult.success) {
            return res.status(404).json(streamResult);
        }

        // Read video file
        const videoBuffer = await fs.readFile(streamResult.filePath);

        // Deploy to Goblin
        const deployResult = await goblinManagerService.deployVideoToGoblin(goblinId, {
            filename: videoResult.video.fileName,
            originalName: videoResult.video.originalName,
            title: videoResult.video.title,
            data: videoBuffer.toString('base64')
        });

        res.json(deployResult);
    } catch (error) {
        console.error('Error deploying video to Goblin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/video/:id/play-on-goblin - Play video on specific Goblin
 */
router.post('/api/video/:id/play-on-goblin', async (req, res) => {
    try {
        const { goblinId, loop = true } = req.body;
        
        if (!goblinId) {
            return res.status(400).json({ success: false, error: 'Goblin ID is required' });
        }

        // Get video data
        const videoResult = await videoLibraryService.getVideo(req.params.id);
        if (!videoResult.success) {
            return res.status(404).json(videoResult);
        }

        // Play on Goblin
        const playResult = await goblinManagerService.playVideoOnGoblin(goblinId, videoResult.video.fileName, { loop });

        if (playResult.success) {
            // Update play count
            await videoLibraryService.updateVideo(req.params.id, {
                playCount: (videoResult.video.playCount || 0) + 1,
                lastPlayed: new Date().toISOString()
            });
        }

        res.json(playResult);
    } catch (error) {
        console.error('Error playing video on Goblin:', error);
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