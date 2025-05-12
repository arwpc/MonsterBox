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

// NOTE: The following routes are deprecated and replaced by the Python-based cleanup
// They are kept commented for reference but not used anymore

/*
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
*/

/*
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
        
        // Step 1: Verify files are in the sounds directory
        const soundsDir = path.join(__dirname, '../public/sounds');
        const existingFiles = await fs.readdir(soundsDir);
        const filesToDelete = files.filter(file => existingFiles.includes(file));
        
        // Step 2: Get sound data directly from the file to avoid any service calls that might update sounds
        let sounds = [];
        try {
            const data = await fs.readFile(path.join(__dirname, '../data/sounds.json'), 'utf8');
            sounds = JSON.parse(data);
            logger.debug(`Successfully loaded ${sounds.length} sounds from file directly`);
        } catch (err) {
            logger.warn(`Failed to load sounds.json directly: ${err.message}, using empty array instead`);
            // Continue with empty array - safer to assume no sounds than risk error
        }
        
        // Step 3: Build a set of all filenames used by sounds
        const usedFilenames = new Set();
        for (const sound of sounds) {
            if (sound && sound.filename) usedFilenames.add(sound.filename);
            if (sound && sound.file) usedFilenames.add(sound.file);
        }
        
        // Step 4: Filter to only include files that are truly unused
        const safeToDelete = filesToDelete.filter(file => !usedFilenames.has(file));
        
        if (safeToDelete.length !== filesToDelete.length) {
            logger.warn(`Found ${filesToDelete.length - safeToDelete.length} referenced files in the deletion list. These will be skipped.`);
        }
        
        // Step 5: Delete the files
        let deletedCount = 0;
        const errors = [];
        const successfullyDeleted = [];
        
        for (const file of safeToDelete) {
            try {
                const filePath = path.join(soundsDir, file);
                await fs.unlink(filePath);
                deletedCount++;
                successfullyDeleted.push(file);
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
            deleted: successfullyDeleted,
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
*/
/*
// Direct cleanup route using the dedicated script
router.post('/direct-cleanup', async (req, res) => {
    try {
        const dryRun = req.body && req.body.dryRun === true;
        
        if (dryRun) {
            logger.info('Starting analysis of unused sound files (dry run)');
        } else {
            logger.info('Starting direct cleanup of unused sound files');
        }
        
        // Path to sounds directory and sounds.json
        const soundsDir = path.join(__dirname, '../public/sounds');
        const soundsJsonPath = path.join(__dirname, '../data/sounds.json');
        
        // Get all files in the sounds directory
        const files = await fs.readdir(soundsDir);
        logger.info(`Found ${files.length} files in sounds directory`);
        
        // Read and parse sounds.json directly to avoid triggering any service calls
        const soundsData = await fs.readFile(soundsJsonPath, 'utf8');
        const sounds = JSON.parse(soundsData);
        logger.info(`Found ${sounds.length} sound entries in sounds.json`);
        
        // Collect all filenames used in sounds.json
        const usedFilenames = new Set();
        for (const sound of sounds) {
            if (sound && sound.filename) usedFilenames.add(sound.filename);
            if (sound && sound.file) usedFilenames.add(sound.file);
        }
        logger.info(`${usedFilenames.size} unique filenames referenced in sounds.json`);
        
        // Find unused files
        const unusedFiles = files.filter(file => !usedFilenames.has(file));
        logger.info(`Found ${unusedFiles.length} unused files`);
        
        // For dry run, just return the analysis results
        if (dryRun) {
            return res.json({
                success: true,
                totalFiles: files.length,
                referencedFiles: usedFilenames.size,
                unusedFilesFound: unusedFiles.length,
                unusedFiles: unusedFiles
            });
        }
        
        // Delete unused files
        let deletedCount = 0;
        const failures = [];
        
        for (const file of unusedFiles) {
            try {
                const filePath = path.join(soundsDir, file);
                await fs.unlink(filePath);
                deletedCount++;
                logger.debug(`Deleted unused sound file: ${file}`);
            } catch (error) {
                logger.error(`Failed to delete ${file}:`, error);
                failures.push({ file, error: error.message });
            }
        }
        
        logger.info(`Direct cleanup completed: ${deletedCount} files deleted`);
        
        res.json({
            success: true,
            totalFiles: files.length,
            referencedFiles: usedFilenames.size,
            unusedFilesFound: unusedFiles.length,
            deletedCount: deletedCount,
            failures: failures
        });
    } catch (error) {
        logger.error('Error during direct cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform direct cleanup',
            details: error.message
        });
    }
});
*/

// Python-based cleanup route (this should be more reliable on Raspberry Pi)
router.post('/python-cleanup', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        const pythonScriptPath = path.join(__dirname, '../scripts/cleanup_sounds.py');
        
        logger.info(`Running Python cleanup script: ${pythonScriptPath}`);
        
        // First run to analyze (without --delete flag)
        const analyzeProcess = spawn('python3', [pythonScriptPath]);
        
        let analysisOutput = '';
        let unusedFilesCount = 0;
        
        analyzeProcess.stdout.on('data', (data) => {
            const output = data.toString();
            analysisOutput += output;
            logger.debug(`Python script output: ${output}`);
            
            // Try to extract the count of unused files
            const match = output.match(/Found (\d+) unused sound files/);
            if (match && match[1]) {
                unusedFilesCount = parseInt(match[1]);
            }
        });
        
        analyzeProcess.stderr.on('data', (data) => {
            logger.error(`Python script error: ${data}`);
        });
        
        await new Promise((resolve, reject) => {
            analyzeProcess.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Analysis completed successfully, found ${unusedFilesCount} unused files`);
                    resolve();
                } else {
                    logger.error(`Analysis process exited with code ${code}`);
                    reject(new Error(`Python script exited with code ${code}`));
                }
            });
        });
        
        // If analysis found no unused files, we're done
        if (unusedFilesCount === 0) {
            return res.json({
                success: true,
                message: 'No unused sound files found.',
                deletedCount: 0
            });
        }
        
        // If we should delete, run with --delete flag
        if (req.body && req.body.delete === true) {
            logger.info('Running Python cleanup script with --delete flag');
            
            const deleteProcess = spawn('python3', [pythonScriptPath, '--delete']);
            let deleteOutput = '';
            let deletedCount = 0;
            
            deleteProcess.stdout.on('data', (data) => {
                const output = data.toString();
                deleteOutput += output;
                logger.debug(`Python delete script output: ${output}`);
                
                // Try to extract the count of deleted files
                const match = output.match(/Deleted (\d+) unused sound files/);
                if (match && match[1]) {
                    deletedCount = parseInt(match[1]);
                }
            });
            
            deleteProcess.stderr.on('data', (data) => {
                logger.error(`Python delete script error: ${data}`);
            });
            
            await new Promise((resolve, reject) => {
                deleteProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info(`Deletion completed successfully, deleted ${deletedCount} files`);
                        resolve();
                    } else {
                        logger.error(`Deletion process exited with code ${code}`);
                        reject(new Error(`Python delete script exited with code ${code}`));
                    }
                });
            });
            
            return res.json({
                success: true,
                message: `Successfully deleted ${deletedCount} unused sound files.`,
                deletedCount,
                output: deleteOutput
            });
        }
        
        // If we're just analyzing, return the analysis results
        return res.json({
            success: true,
            message: `Found ${unusedFilesCount} unused sound files.`,
            unusedFilesCount,
            output: analysisOutput
        });
        
    } catch (error) {
        logger.error('Error running Python cleanup script:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform Python-based cleanup',
            details: error.message
        });
    }
});

module.exports = router;
