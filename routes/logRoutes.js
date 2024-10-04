const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'log');
const LINES_PER_PAGE = 100;

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';

        // Get list of log files
        const files = await fs.readdir(LOG_DIR);
        const logFiles = files.filter(file => file.startsWith('MonsterBox-') && file.endsWith('.log'))
                              .sort((a, b) => b.localeCompare(a)); // Sort in descending order

        if (logFiles.length === 0) {
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
            const content = await fs.readFile(path.join(LOG_DIR, file), 'utf8');
            allLogs = allLogs.concat(content.split('\n').filter(line => line.trim() !== ''));
        }

        // Reverse to show newest logs first
        allLogs.reverse();

        let filteredLogs = allLogs;
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            filteredLogs = allLogs.filter(line => searchRegex.test(line));
        }

        const totalPages = Math.ceil(filteredLogs.length / LINES_PER_PAGE);
        const startIndex = (page - 1) * LINES_PER_PAGE;
        const endIndex = startIndex + LINES_PER_PAGE;
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

        res.render('logs', {
            logs: paginatedLogs,
            currentPage: page,
            totalPages: totalPages,
            search: search
        });
    } catch (error) {
        console.error('Error reading log files:', error);
        res.status(500).render('logs', {
            logs: ['An error occurred while reading the log files.'],
            currentPage: 1,
            totalPages: 1,
            search: '',
            error: error.message
        });
    }
});

module.exports = router;