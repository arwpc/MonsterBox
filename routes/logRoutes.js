const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const LOG_FILE_PATH = path.join(__dirname, '..', 'logs', 'app.log');
const LINES_PER_PAGE = 100;

router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const search = req.query.search || '';

        // Check if the log file exists
        try {
            await fs.access(LOG_FILE_PATH, fs.constants.F_OK);
        } catch (error) {
            console.error(`Log file does not exist at ${LOG_FILE_PATH}`);
            return res.render('logs', {
                logs: ['No log file found. The application may not have generated any logs yet.'],
                currentPage: 1,
                totalPages: 1,
                search: search,
                error: 'Log file not found'
            });
        }

        const content = await fs.readFile(LOG_FILE_PATH, 'utf8');

        if (content.trim() === '') {
            return res.render('logs', {
                logs: ['The log file is empty.'],
                currentPage: 1,
                totalPages: 1,
                search: search
            });
        }

        const lines = content.split('\n').reverse(); // Reverse to show newest logs first

        let filteredLines = lines;
        if (search) {
            filteredLines = lines.filter(line => line.toLowerCase().includes(search.toLowerCase()));
        }

        const totalPages = Math.ceil(filteredLines.length / LINES_PER_PAGE);
        const startIndex = (page - 1) * LINES_PER_PAGE;
        const endIndex = startIndex + LINES_PER_PAGE;
        const paginatedLines = filteredLines.slice(startIndex, endIndex);

        res.render('logs', {
            logs: paginatedLines,
            currentPage: page,
            totalPages: totalPages,
            search: search
        });
    } catch (error) {
        console.error('Error reading log file:', error);
        res.status(500).render('logs', {
            logs: ['An error occurred while reading the log file.'],
            currentPage: 1,
            totalPages: 1,
            search: '',
            error: error.message
        });
    }
});

module.exports = router;