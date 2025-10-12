/**
 * Audio Library Routes
 * RESTful API for the shared audio library system
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import audioLibraryService from '../services/audioLibraryService.js';
import serverPlaybackService from '../services/serverPlaybackService.js';

const router = express.Router();

// Configure multer for audio file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
        files: 10 // Max 10 files at once
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
            'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/flac'
        ];

        if (allowedMimes.includes(file.mimetype) ||
            audioLibraryService.isValidAudioFormat(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid audio format'), false);
        }
    }
});

// Main audio library page
router.get('/', (req, res) => {
    res.render('audio-library/index', {
        title: 'Audio Library',
        pageTitle: 'Audio Library'
    });
});

// API Routes

/**
 * GET /api/library - Get all audio files with filtering
 */
router.get('/api/library', async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            category: req.query.category,
            format: req.query.format,
            tags: req.query.tags ? req.query.tags.split(',') : [],
            favorite: req.query.favorite === 'true',
            sortBy: req.query.sortBy || 'uploadedAt'
        };

        const result = await audioLibraryService.getAudioFiles(filters);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error getting audio library:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load audio library'
        });
    }
});

/**
 * POST /api/search - Advanced search endpoint
 */
router.post('/api/search', async (req, res) => {
    try {
        const filters = req.body;
        const result = await audioLibraryService.getAudioFiles(filters);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error performing advanced search:', error);
        res.status(500).json({
            success: false,
            error: 'Advanced search failed'
        });
    }
});

/**
 * POST /api/upload - Upload new audio files
 */
router.post('/api/upload', upload.array('audioFiles', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No audio files provided'
            });
        }

        const uploadedFiles = [];
        const errors = [];

        for (const file of req.files) {
            try {
                const metadata = {
                    title: req.body.title || path.basename(file.originalname, path.extname(file.originalname)),
                    description: req.body.description || '',
                    category: req.body.category || 'other',
                    tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : []
                };

                const audioEntry = await audioLibraryService.addAudioFile(
                    file.buffer,
                    file.originalname,
                    metadata
                );

                uploadedFiles.push(audioEntry);
            } catch (error) {
                errors.push({
                    filename: file.originalname,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            uploaded: uploadedFiles,
            errors: errors,
            message: `Successfully uploaded ${uploadedFiles.length} file(s)`
        });

    } catch (error) {
        console.error('Error uploading audio files:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload audio files'
        });
    }
});

/**
 * GET /api/audio/:id - Get specific audio file metadata
 */
router.get('/api/audio/:id', async (req, res) => {
    try {
        const audio = await audioLibraryService.getAudioById(req.params.id);

        if (!audio) {
            return res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }

        res.json({
            success: true,
            audio: audio
        });
    } catch (error) {
        console.error('Error getting audio file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get audio file'
        });
    }
});

/**
 * PUT /api/audio/:id - Update audio metadata
 */
router.put('/api/audio/:id', async (req, res) => {
    try {
        const updates = {
            title: req.body.title,
            description: req.body.description,
            tags: req.body.tags,
            category: req.body.category,
            favorite: req.body.favorite
        };

        const updatedAudio = await audioLibraryService.updateAudio(req.params.id, updates);

        res.json({
            success: true,
            audio: updatedAudio,
            message: 'Audio metadata updated successfully'
        });
    } catch (error) {
        console.error('Error updating audio:', error);
        res.status(error.message === 'Audio file not found' ? 404 : 500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/audio/:id - Delete audio file
 */
router.delete('/api/audio/:id', async (req, res) => {
    try {
        await audioLibraryService.deleteAudio(req.params.id);

        res.json({
            success: true,
            message: 'Audio file deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting audio:', error);
        res.status(error.message === 'Audio file not found' ? 404 : 500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/audio/:id/play - Play audio on character speaker
 */
router.post('/api/audio/:id/play', async (req, res) => {
    try {
        const { characterId, volume, speakerPartId } = req.body;
        const audio = await audioLibraryService.getAudioById(req.params.id);

        if (!audio) {
            return res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }

        // Get the audio file path
        const audioFilePath = audioLibraryService.getAudioFilePath(audio.filename);

        // Read the audio file
        const audioBuffer = await fs.readFile(audioFilePath);

        // Play through selected speaker (if provided) or character's configured speaker
        const playResult = await serverPlaybackService.playBufferOnCharacterSpeaker(audioBuffer, {
            characterId: characterId,
            speakerPartId: speakerPartId,
            contentType: `audio/${audio.format}`,
            volume: volume || 80
        });

        if (playResult.success) {
            // Record the play event
            await audioLibraryService.recordPlay(req.params.id);

            res.json({
                success: true,
                message: `Playing \"${audio.title}\" on ${speakerPartId ? `speaker part ${speakerPartId}` : `character ${characterId} speaker`}`,
                device: playResult.deviceId,
                audio: {
                    id: audio.id,
                    title: audio.title,
                    duration: audio.duration
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to play audio',
                details: playResult.error
            });
        }

    } catch (error) {
        console.error('Error playing audio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to play audio file'
        });
    }
});

/**
 * GET /api/audio/:id/download - Download audio file
 */
router.get('/api/audio/:id/download', async (req, res) => {
    try {
        const audio = await audioLibraryService.getAudioById(req.params.id);

        if (!audio) {
            return res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }

        const audioFilePath = audioLibraryService.getAudioFilePath(audio.filename);

        res.setHeader('Content-Disposition', `attachment; filename="${audio.originalFilename}"`);
        res.setHeader('Content-Type', `audio/${audio.format}`);

        const fileStream = await fs.readFile(audioFilePath);
        res.send(fileStream);

    } catch (error) {
        console.error('Error downloading audio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to download audio file'
        });
    }
});

/**
 * GET /api/audio/:id/waveform - Get waveform data
 */
router.get('/api/audio/:id/waveform', async (req, res) => {
    try {
        const audio = await audioLibraryService.getAudioById(req.params.id);

        if (!audio) {
            return res.status(404).json({
                success: false,
                error: 'Audio file not found'
            });
        }

        // For now, return basic waveform info
        // In a full implementation, this would return actual waveform data
        res.json({
            success: true,
            waveform: {
                generated: audio.waveformGenerated,
                duration: audio.duration,
                sampleRate: audio.sampleRate,
                channels: audio.channels
            }
        });

    } catch (error) {
        console.error('Error getting waveform:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get waveform data'
        });
    }
});

/**
 * POST /api/search - Advanced search
 */
router.post('/api/search', async (req, res) => {
    try {
        const filters = {
            search: req.body.search,
            category: req.body.category,
            format: req.body.format,
            tags: req.body.tags || [],
            favorite: req.body.favorite,
            sortBy: req.body.sortBy || 'uploadedAt',
            minDuration: req.body.minDuration,
            maxDuration: req.body.maxDuration,
            minFileSize: req.body.minFileSize,
            maxFileSize: req.body.maxFileSize
        };

        const result = await audioLibraryService.getAudioFiles(filters);
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error searching audio library:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to search audio library'
        });
    }
});

/**
 * GET /api/audio-select - Get audio files for selection in scenes/poses
 */
router.get('/api/audio-select', async (req, res) => {
    try {
        const filters = {
            search: req.query.search,
            category: req.query.category,
            format: req.query.format,
            sortBy: req.query.sortBy || 'title'
        };

        const result = await audioLibraryService.getAudioFiles(filters);

        // Return simplified format for selection dropdowns
        const audioOptions = result.audio.map(audio => ({
            id: audio.id,
            title: audio.title,
            description: audio.description,
            duration: audio.duration,
            format: audio.format,
            category: audio.category,
            filename: audio.filename
        }));

        res.json({
            success: true,
            audio: audioOptions,
            totalFiles: result.totalFiles
        });
    } catch (error) {
        console.error('Error getting audio selection:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load audio selection'
        });
    }
});

/**
 * POST /api/audio/stop-all - Stop all audio playback
 * Note: This route is mounted at /audio-library, so the full path is /audio-library/api/audio/stop-all
 * But we also need it at /api/audio/stop-all for direct API calls
 */
router.post('/api/audio/stop-all', async (req, res) => {
    try {
        // Stop all audio streams
        await serverPlaybackService.stopAll();

        res.json({
            success: true,
            message: 'All audio playback stopped'
        });
    } catch (error) {
        console.error('Error stopping audio:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to stop audio playback'
        });
    }
});

export default router;
