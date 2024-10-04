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

        const content = await fs.readFile(LOG_FILE_PATH, 'utf8');
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
        res.status(500).send('Error reading log file');
    }
});

module.exports = router;