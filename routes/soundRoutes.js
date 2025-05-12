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

// DEFINE NON-DYNAMIC ROUTES FIRST

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

// ADD THE CLEANUP ROUTE BEFORE THE DYNAMIC ID ROUTES
// Simple cleanup route that calls our simplified Python script
router.post('/simple-cleanup', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, '../simple_cleanup_sounds.py');
        
        logger.info(`Running simple cleanup script: ${scriptPath}`);
        
        // First run without --delete to analyze only
        const analyzeCommand = process.platform === 'win32' ? 'python' : 'python3';
        const analyzeProcess = spawn(analyzeCommand, [scriptPath]);
        
        let output = '';
        let unusedFilesCount = 0;
        let unusedFilesList = [];
        
        analyzeProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            logger.debug(`Script output: ${chunk}`);
            
            // Extract the count of unused files
            const countMatch = chunk.match(/Found (\d+) unused files/);
            if (countMatch && countMatch[1]) {
                unusedFilesCount = parseInt(countMatch[1]);
            }
            
            // Extract the list of files (if any)
            const fileMatches = chunk.match(/\s\s(.+)$/gm);
            if (fileMatches) {
                fileMatches.forEach(match => {
                    const file = match.trim();
                    if (file && !file.startsWith('Found') && !file.startsWith('No unused')) {
                        unusedFilesList.push(file);
                    }
                });
            }
        });
        
        analyzeProcess.stderr.on('data', (data) => {
            logger.error(`Script error: ${data}`);
        });
        
        await new Promise((resolve, reject) => {
            analyzeProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Analysis completed successfully, found ${unusedFilesCount} unused files`);
                    resolve();
                } else {
                    logger.error(`Analysis process exited with code ${code}`);
                    reject(new Error(`Script exited with code ${code}`));
                }
            });
        });
        
        // If analysis found no unused files, we're done
        if (unusedFilesCount === 0) {
            return res.json({
                success: true,
                message: 'No unused sound files found.',
                unusedFilesCount: 0,
                unusedFiles: []
            });
        }
        
        // If delete was requested, run again with the --delete flag
        if (req.body && req.body.delete === true) {
            logger.info('Running cleanup script with --delete flag');
            
            const deleteCommand = process.platform === 'win32' ? 'python' : 'python3';
            const deleteProcess = spawn(deleteCommand, [scriptPath, '--delete']);
            
            let deleteOutput = '';
            let deletedCount = 0;
            
            deleteProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                deleteOutput += chunk;
                logger.debug(`Delete script output: ${chunk}`);
                
                // Extract the count of deleted files
                const match = chunk.match(/Successfully deleted (\d+) unused sound files/);
                if (match && match[1]) {
                    deletedCount = parseInt(match[1]);
                }
            });
            
            deleteProcess.stderr.on('data', (data) => {
                logger.error(`Delete script error: ${data}`);
            });
            
            await new Promise((resolve, reject) => {
                deleteProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info(`Deletion completed successfully, deleted ${deletedCount} files`);
                        resolve();
                    } else {
                        logger.error(`Deletion process exited with code ${code}`);
                        reject(new Error(`Delete script exited with code ${code}`));
                    }
                });
            });
            
            return res.json({
                success: true,
                message: `Successfully deleted ${deletedCount} unused sound files.`,
                deletedCount: deletedCount,
                output: deleteOutput
            });
        }
        
        // Just return the analysis results
        return res.json({
            success: true,
            message: `Found ${unusedFilesCount} unused sound files.`,
            unusedFilesCount: unusedFilesCount,
            unusedFiles: unusedFilesList
        });
        
    } catch (error) {
        logger.error('Error running cleanup script:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform cleanup',
            details: error.message
        });
    }
});

// DYNAMIC ID ROUTES GO AFTER SPECIFIC ROUTES

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

router.post('/:id', upload.single('sound_files'), async (req, res) => {
    try {
        // Enhanced ID validation
        const rawId = req.params.id;
        if (!rawId || rawId === 'undefined' || rawId === 'null') {
            logger.error(`Invalid sound ID provided in URL: ${rawId}`);
            return res.status(400).render('error', { error: 'Invalid sound ID provided' });
        }
        
        const id = parseInt(rawId, 10);
        if (isNaN(id) || id <= 0) {
            logger.error(`Sound ID is not a valid number: ${rawId}`);
            return res.status(400).render('error', { error: 'Sound ID must be a valid number' });
        }
        
        // Check if sound exists before proceeding
        const existingSound = await soundService.getSoundById(id);
        if (!existingSound) {
            logger.error(`Sound with ID ${id} not found`);
            return res.status(404).render('error', { error: `Sound with ID ${id} not found` });
        }
        
        const characterIds = req.body.characterIds ? (Array.isArray(req.body.characterIds) ? req.body.characterIds.map(Number) : [Number(req.body.characterIds)]) : [];
        const updatedSound = {
            name: req.body.name,
            characterIds: characterIds
        };
        
        if (req.body.file_option === 'replace' && req.file) {
            if (existingSound.filename) {
                const oldFilePath = path.join(__dirname, '../public/sounds', existingSound.filename);
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
        // Enhanced ID validation
        const rawId = req.params.id;
        if (!rawId || rawId === 'undefined' || rawId === 'null') {
            logger.error(`Invalid sound ID provided in URL: ${rawId}`);
            return res.status(400).json({ 
                error: 'Invalid sound ID', 
                details: `Sound ID is invalid: ${rawId}` 
            });
        }
        
        const soundId = parseInt(rawId, 10);
        if (isNaN(soundId) || soundId <= 0) {
            logger.error(`Sound ID is not a valid number: ${rawId}`);
            return res.status(400).json({ 
                error: 'Invalid sound ID', 
                details: `Sound ID must be a valid number, received: ${rawId}` 
            });
        }
        
        logger.info('Attempting to play sound with ID:', soundId);

        const sound = await soundService.getSoundById(soundId);
        
        if (!sound) {
            logger.warn('Sound not found for ID:', soundId);
            return res.status(404).json({ error: 'Sound not found', details: `No sound with id ${soundId}`, soundId });
        }

        logger.info('Found sound:', sound);
        
        // Validate that sound has a filename
        if (!sound.filename) {
            logger.error(`Sound ${soundId} has no associated filename`);
            return res.status(400).json({ 
                error: 'Invalid sound configuration', 
                details: `Sound ${soundId} has no associated file` 
            });
        }

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
        // Enhanced ID validation
        const rawId = req.params.id;
        if (!rawId || rawId === 'undefined' || rawId === 'null') {
            logger.error(`Invalid sound ID provided in URL: ${rawId}`);
            return res.status(400).json({ 
                error: 'Invalid sound ID', 
                details: `Sound ID is invalid: ${rawId}` 
            });
        }
        
        const id = parseInt(rawId, 10);
        if (isNaN(id) || id <= 0) {
            logger.error(`Sound ID is not a valid number: ${rawId}`);
            return res.status(400).json({ 
                error: 'Invalid sound ID', 
                details: `Sound ID must be a valid number, received: ${rawId}` 
            });
        }
        
        // Check if sound exists before attempting to delete
        const sound = await soundService.getSoundById(id);
        if (!sound) {
            logger.warn(`Sound with ID ${id} not found for deletion`);
            return res.status(404).json({ 
                error: 'Sound not found', 
                details: `No sound with id ${id} exists` 
            });
        }
        
        // Delete the associated file if it exists
        if (sound.filename) {
            const filePath = path.join(__dirname, '../public/sounds', sound.filename);
            await fs.unlink(filePath).catch(err => logger.warn(`Failed to delete sound file: ${err.message}`));
        }
        
        // Delete the sound record itself
        await soundService.deleteSound(id);
        res.status(200).json({ message: 'Sound deleted successfully' });
    } catch (error) {
        logger.error('Error deleting sound:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// All cleanup functionality has been moved to the dedicated /cleanup route

module.exports = router;
