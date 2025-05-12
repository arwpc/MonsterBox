// Direct route to handle cleanup button
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const router = express.Router();
const logger = require('../scripts/logger');

// Simple endpoint that runs our cleanup script with --delete flag
router.post('/run', async (req, res) => {
    try {
        const scriptPath = path.join(__dirname, '../simple_cleanup_sounds.py');
        logger.info(`Running cleanup script: ${scriptPath}`);
        
        // Use python on Windows, python3 on Linux
        const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
        const args = ['--delete']; // Always delete the files
        
        const process = spawn(pythonCommand, [scriptPath, ...args]);
        
        let output = '';
        let deletedCount = 0;
        
        process.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            logger.info(`Cleanup output: ${chunk}`);
            
            // Get the number of deleted files
            const match = chunk.match(/Successfully deleted (\d+) unused sound files/);
            if (match && match[1]) {
                deletedCount = parseInt(match[1]);
            }
        });
        
        process.stderr.on('data', (data) => {
            logger.error(`Cleanup error: ${data}`);
        });
        
        await new Promise((resolve, reject) => {
            process.on('close', (code) => {
                if (code === 0) {
                    logger.info('Cleanup completed successfully');
                    resolve();
                } else {
                    logger.error(`Cleanup failed with code ${code}`);
                    reject(new Error(`Process exited with code ${code}`));
                }
            });
        });
        
        // Return the result
        return res.json({
            success: true,
            message: deletedCount > 0 
                ? `Successfully deleted ${deletedCount} unused sound files.` 
                : 'No unused sound files found.',
            deletedCount
        });
        
    } catch (error) {
        logger.error('Error running cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run cleanup',
            details: error.message
        });
    }
});

module.exports = router;
