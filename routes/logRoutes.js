const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

const LOG_DIR = path.join(__dirname, '..', 'log');
const LINES_PER_PAGE = 100;

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';

        logger.debug(`Accessing logs page ${page} with search: "${search}"`);

        // Get list of log files
        const files = await fs.readdir(LOG_DIR);
        const logFiles = await Promise.all(
            files
                .filter(file => file.startsWith('MonsterBox-') && file.endsWith('.log'))
                .map(async file => {
                    const stats = await fs.stat(path.join(LOG_DIR, file));
                    return { name: file, mtime: stats.mtime };
                })
        );
        
        // Sort files by modification time, most recent first
        logFiles.sort((a, b) => b.mtime - a.mtime);

        if (logFiles.length === 0) {
            logger.warn('No log files found');
            return res.render('logs', {
                logs: ['No log files found. The application may not have generated any logs yet.'],
                currentPage: 1,
                totalPages: 1,
                search: search,
                error: 'No log files found'
            });
        }

        // Read content from all log files
        let allLogs = [];
        for (const file of logFiles) {
            const content = await fs.readFile(path.join(LOG_DIR, file.name), 'utf8');
            allLogs = allLogs.concat(content.split('\n').filter(line => line.trim() !== ''));
        }

        // Reverse to show newest logs first
        allLogs.reverse();

        let filteredLogs = allLogs;
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filteredLogs = allLogs.filter(line => searchRegex.test(line));
            logger.debug(`Filtered logs for search "${search}". Found ${filteredLogs.length} matching lines.`);
        }

        const totalPages = Math.ceil(filteredLogs.length / LINES_PER_PAGE);
        const startIndex = (page - 1) * LINES_PER_PAGE;
        const endIndex = startIndex + LINES_PER_PAGE;
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

        logger.debug(`Rendering logs page ${page} of ${totalPages}`);

        res.render('logs', {
            logs: paginatedLogs,
            currentPage: page,
            totalPages: totalPages,
            search: search
        });
    } catch (error) {
        logger.error('Error reading log files:', error);
        res.status(500).render('logs', {
            logs: ['An error occurred while reading the log files.'],
            currentPage: 1,
            totalPages: 1,
            search: '',
            error: error.message
        });
    }
});

router.post('/clear', async (req, res) => {
    try {
        logger.info('Attempting to clear all log files');

        const files = await fs.readdir(LOG_DIR);
        const logFiles = files.filter(file => file.startsWith('MonsterBox-') && file.endsWith('.log'));

        for (const file of logFiles) {
            await fs.writeFile(path.join(LOG_DIR, file), '', 'utf8');
            logger.debug(`Cleared contents of log file: ${file}`);
        }

        logger.info('All log files have been cleared successfully');
        res.json({ success: true, message: 'All logs cleared successfully' });
    } catch (error) {
        logger.error('Error clearing log files:', error);
        res.status(500).json({ success: false, error: 'Failed to clear logs: ' + error.message });
    }
});

module.exports = router;