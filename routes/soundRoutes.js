// File: routes/soundRoutes.js

const express = require('express');
const path = require('path');
const soundService = require('../services/soundService');
const characterService = require('../services/characterService');
const soundController = require('../controllers/soundController');
const multer = require('multer');
const fs = require('fs').promises;
const router = express.Router();
const logger = require('../scripts/logger');

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/sounds/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

router.get('/', async (req, res) => {
    try {
        const [characters, sounds] = await Promise.all([
            characterService.getAllCharacters(),
            soundService.getAllSounds()
        ]);
        res.render('sounds', { title: 'Sounds', characters, sounds });
    } catch (error) {
        logger.error('Error fetching sounds and characters:', error);
        res.status(500).render('error', { error: 'Failed to fetch sounds and characters' });
    }
});

router.get('/new', async (req, res) => {
    try {
        const characters = await characterService.getAllCharacters();
        res.render('sound-form', { title: 'Add New Sound', action: '/sounds', sound: null, characters });
    } catch (error) {
        logger.error('Error fetching characters:', error);
        res.status(500).render('error', { error: 'Failed to fetch characters' });
    }
});

router.get('/:id/edit', async (req, res) => {
    try {
        const [sound, characters] = await Promise.all([
            soundService.getSoundById(parseInt(req.params.id)),
            characterService.getAllCharacters()
        ]);
        if (sound) {
            res.render('sound-form', { title: 'Edit Sound', action: `/sounds/${sound.id}`, sound, characters });
        } else {
            res.status(404).render('error', { error: 'Sound not found' });
        }
    } catch (error) {
        logger.error('Error fetching sound:', error);
        res.status(500).render('error', { error: 'Failed to fetch sound' });
    }
});

router.post('/', upload.array('sound_files'), async (req, res) => {
    try {
        const characterIds = req.body.characterIds ? (Array.isArray(req.body.characterIds) ? req.body.characterIds.map(Number) : [Number(req.body.characterIds)]) : [];
        const soundDataArray = req.files.map(file => ({
            name: req.body.name || file.originalname.split('.').slice(0, -1).join('.'), // Use provided name or filename without extension
            filename: file.filename,
            characterIds: characterIds
        }));
        
        await soundService.createMultipleSounds(soundDataArray);
        res.redirect('/sounds');
    } catch (error) {
        logger.error('Error adding sounds:', error);
        res.status(500).render('error', { error: 'Failed to add sounds' });
    }
});

router.post('/:id', upload.single('sound_files'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const characterIds = req.body.characterIds ? (Array.isArray(req.body.characterIds) ? req.body.characterIds.map(Number) : [Number(req.body.characterIds)]) : [];
        const updatedSound = {
            name: req.body.name,
            characterIds: characterIds
        };
        
        if (req.body.file_option === 'replace' && req.file) {
            const sound = await soundService.getSoundById(id);
            if (sound && sound.filename) {
                const oldFilePath = path.join(__dirname, '../public/sounds', sound.filename);
                await fs.unlink(oldFilePath).catch(err => logger.warn(`Failed to delete old sound file: ${err.message}`));
            }
            updatedSound.filename = req.file.filename;
        }

        await soundService.updateSound(id, updatedSound);
        res.redirect('/sounds');
    } catch (error) {
        logger.error('Error updating sound:', error);
        res.status(500).render('error', { error: 'Failed to update sound' });
    }
});

router.post('/:id/play', async (req, res) => {
    try {
        const soundId = parseInt(req.params.id);
        logger.info('Attempting to play sound with ID:', soundId);

        const sound = await soundService.getSoundById(soundId);
        
        if (!sound) {
            logger.warn('Sound not found for ID:', soundId);
            return res.status(404).json({ error: 'Sound not found', details: `No sound with id ${soundId}`, soundId });
        }

        logger.info('Found sound:', sound);

        const filePath = path.resolve(__dirname, '..', 'public', 'sounds', sound.filename);
        logger.info('Absolute file path:', filePath);

        try {
            await fs.access(filePath, fs.constants.R_OK);
            logger.info('File exists and is readable:', filePath);
        } catch (error) {
            logger.error('File access error:', error);
            return res.status(404).json({ error: 'Sound file not accessible', details: error.message, filePath });
        }

        // Use soundController to play the sound
        await soundController.startSoundPlayer();
        const result = await soundController.playSound(sound.id, filePath);

        res.status(200).json({ 
            message: 'Playing sound on character',
            sound: sound.name,
            file: sound.filename,
            result: result
        });

    } catch (error) {
        logger.error('Error in /play route:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.post('/:id/delete', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const sound = await soundService.getSoundById(id);
        if (sound && sound.filename) {
            const filePath = path.join(__dirname, '../public/sounds', sound.filename);
            await fs.unlink(filePath).catch(err => logger.warn(`Failed to delete sound file: ${err.message}`));
        }
        await soundService.deleteSound(id);
        res.status(200).json({ message: 'Sound deleted successfully' });
    } catch (error) {
        logger.error('Error deleting sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// Analyze unused sound files
router.post('/cleanup/analyze', async (req, res) => {
    try {
        logger.info('Analyzing unused sound files');
        
        // Get all sound files in the directory
        const soundsDir = path.join(__dirname, '../public/sounds');
        const allFiles = await fs.readdir(soundsDir);
        
        // Get all sounds from database
        const sounds = await soundService.getAllSounds();
        
        // Create a set of filenames that are in use
        const usedFilenames = new Set();
        const validSounds = sounds.filter(s => s && typeof s.id === 'number');
        
        // Prevent NaN issues by only processing valid sounds
        for (const sound of validSounds) {
            if (sound.filename) usedFilenames.add(sound.filename);
            if (sound.file) usedFilenames.add(sound.file);
        }
        
        // Find unused files
        const unusedFiles = allFiles.filter(file => !usedFilenames.has(file));
        
        logger.info(`Analysis complete: ${unusedFiles.length} unused files found out of ${allFiles.length} total files`);
        res.json({
            success: true, 
            total: allFiles.length,
            used: usedFilenames.size,
            unused: unusedFiles,
            unusedCount: unusedFiles.length
        });
    } catch (error) {
        logger.error('Error analyzing unused sound files:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to analyze unused sound files',
            details: error.message 
        });
    }
});

// Delete unused sound files
router.post('/cleanup', async (req, res) => {
    try {
        const { files } = req.body;
        if (!files || !Array.isArray(files)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid request: files array is required' 
            });
        }
        
        logger.info(`Attempting to delete ${files.length} unused sound files`);
        
        // Make sure we're only deleting files that are actually in the sounds directory
        const soundsDir = path.join(__dirname, '../public/sounds');
        const existingFiles = await fs.readdir(soundsDir);
        const filesToDelete = files.filter(file => existingFiles.includes(file));
        
        // Get all sounds to verify none are referencing these files
        // This helps prevent orphaned database entries
        const sounds = await soundService.getAllSounds();
        const usedFilenames = new Set();
        for (const sound of sounds) {
            if (sound.filename) usedFilenames.add(sound.filename);
            if (sound.file) usedFilenames.add(sound.file);
        }
        
        // Double-check that none of the files we're about to delete are actually referenced
        // This is an additional safety check
        const safeToDelete = filesToDelete.filter(file => !usedFilenames.has(file));
        
        if (safeToDelete.length !== filesToDelete.length) {
            logger.warn(`Found ${filesToDelete.length - safeToDelete.length} referenced files in the deletion list. These will be skipped.`);
        }
        
        // Delete the files
        let deletedCount = 0;
        const errors = [];
        
        for (const file of safeToDelete) {
            try {
                const filePath = path.join(soundsDir, file);
                await fs.unlink(filePath);
                deletedCount++;
                logger.debug(`Deleted unused sound file: ${file}`);
            } catch (err) {
                logger.error(`Failed to delete file ${file}:`, err);
                errors.push({ file, error: err.message });
            }
        }
        
        logger.info(`Cleanup complete: deleted ${deletedCount} out of ${safeToDelete.length} unused sound files`);
        res.json({
            success: true,
            totalProcessed: safeToDelete.length,
            totalDeleted: deletedCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        logger.error('Error cleaning up unused sound files:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to clean up unused sound files',
            details: error.message 
        });
    }
});

module.exports = router;
