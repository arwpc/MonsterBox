/**
 * Browser Error Reporting Routes
 * Handles console errors, network failures, and webcam-specific errors from the frontend
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

// Ensure error logs directory exists
const ERROR_LOGS_DIR = path.join(__dirname, '..', 'log', 'browser-errors');

async function ensureErrorLogsDir() {
    try {
        await fs.mkdir(ERROR_LOGS_DIR, { recursive: true });
    } catch (error) {
        logger.error('Failed to create error logs directory:', error);
    }
}

// Initialize directory
ensureErrorLogsDir();

/**
 * POST /api/logs/browser-errors
 * Receive and store browser error reports
 */
router.post('/browser-errors', async (req, res) => {
    try {
        const errorReport = req.body;
        const timestamp = new Date().toISOString();
        const reportId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Validate error report structure
        if (!errorReport || typeof errorReport !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid error report format'
            });
        }

        // Enrich error report with server-side metadata
        const enrichedReport = {
            ...errorReport,
            reportId,
            serverTimestamp: timestamp,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
            referer: req.get('Referer'),
            sessionId: req.sessionID
        };

        // Log critical errors immediately
        if (errorReport.totalErrors > 0 || errorReport.totalNetworkErrors > 0) {
            logger.error('Browser errors reported:', {
                reportId,
                totalErrors: errorReport.totalErrors,
                totalNetworkErrors: errorReport.totalNetworkErrors,
                totalWebcamErrors: errorReport.totalWebcamErrors,
                url: errorReport.url,
                userAgent: req.get('User-Agent')
            });
        }

        // Log webcam-specific errors with higher priority
        if (errorReport.totalWebcamErrors > 0) {
            logger.error('Webcam errors detected:', {
                reportId,
                webcamErrors: errorReport.webcamErrors,
                url: errorReport.url
            });
        }

        // Save detailed report to file
        const reportFileName = `error-report-${reportId}.json`;
        const reportFilePath = path.join(ERROR_LOGS_DIR, reportFileName);
        
        await fs.writeFile(reportFilePath, JSON.stringify(enrichedReport, null, 2));

        // Update error summary statistics
        await updateErrorStatistics(enrichedReport);

        res.json({
            success: true,
            reportId,
            message: 'Error report received and processed'
        });

    } catch (error) {
        logger.error('Failed to process browser error report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process error report'
        });
    }
});

/**
 * GET /api/logs/browser-errors/summary
 * Get error summary statistics
 */
router.get('/browser-errors/summary', async (req, res) => {
    try {
        const summaryPath = path.join(ERROR_LOGS_DIR, 'error-summary.json');
        
        try {
            const summaryData = await fs.readFile(summaryPath, 'utf8');
            const summary = JSON.parse(summaryData);
            
            res.json({
                success: true,
                summary
            });
        } catch (error) {
            // Return empty summary if file doesn't exist
            res.json({
                success: true,
                summary: {
                    totalReports: 0,
                    totalErrors: 0,
                    totalWarnings: 0,
                    totalNetworkErrors: 0,
                    totalWebcamErrors: 0,
                    lastUpdated: new Date().toISOString()
                }
            });
        }
    } catch (error) {
        logger.error('Failed to get error summary:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get error summary'
        });
    }
});

/**
 * GET /api/logs/browser-errors/recent
 * Get recent error reports
 */
router.get('/browser-errors/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const files = await fs.readdir(ERROR_LOGS_DIR);
        
        // Filter and sort error report files
        const reportFiles = files
            .filter(file => file.startsWith('error-report-') && file.endsWith('.json'))
            .sort((a, b) => {
                const aTime = a.match(/error-report-(\d+)-/)?.[1];
                const bTime = b.match(/error-report-(\d+)-/)?.[1];
                return parseInt(bTime) - parseInt(aTime);
            })
            .slice(0, limit);

        const reports = [];
        for (const file of reportFiles) {
            try {
                const filePath = path.join(ERROR_LOGS_DIR, file);
                const reportData = await fs.readFile(filePath, 'utf8');
                const report = JSON.parse(reportData);
                
                // Return summary info only, not full error details
                reports.push({
                    reportId: report.reportId,
                    timestamp: report.serverTimestamp,
                    url: report.url,
                    totalErrors: report.totalErrors,
                    totalWarnings: report.totalWarnings,
                    totalNetworkErrors: report.totalNetworkErrors,
                    totalWebcamErrors: report.totalWebcamErrors,
                    userAgent: report.userAgent
                });
            } catch (error) {
                logger.warn(`Failed to read error report ${file}:`, error);
            }
        }

        res.json({
            success: true,
            reports
        });

    } catch (error) {
        logger.error('Failed to get recent error reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get recent error reports'
        });
    }
});

/**
 * GET /api/logs/browser-errors/:reportId
 * Get detailed error report by ID
 */
router.get('/browser-errors/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const reportFileName = `error-report-${reportId}.json`;
        const reportFilePath = path.join(ERROR_LOGS_DIR, reportFileName);

        const reportData = await fs.readFile(reportFilePath, 'utf8');
        const report = JSON.parse(reportData);

        res.json({
            success: true,
            report
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            res.status(404).json({
                success: false,
                error: 'Error report not found'
            });
        } else {
            logger.error('Failed to get error report:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get error report'
            });
        }
    }
});

/**
 * DELETE /api/logs/browser-errors/cleanup
 * Clean up old error reports
 */
router.delete('/browser-errors/cleanup', async (req, res) => {
    try {
        const maxAge = parseInt(req.query.maxAge) || 7; // days
        const cutoffTime = Date.now() - (maxAge * 24 * 60 * 60 * 1000);

        const files = await fs.readdir(ERROR_LOGS_DIR);
        const reportFiles = files.filter(file => 
            file.startsWith('error-report-') && file.endsWith('.json')
        );

        let deletedCount = 0;
        for (const file of reportFiles) {
            const match = file.match(/error-report-(\d+)-/);
            if (match) {
                const fileTime = parseInt(match[1]);
                if (fileTime < cutoffTime) {
                    await fs.unlink(path.join(ERROR_LOGS_DIR, file));
                    deletedCount++;
                }
            }
        }

        res.json({
            success: true,
            message: `Cleaned up ${deletedCount} old error reports`,
            deletedCount
        });

    } catch (error) {
        logger.error('Failed to cleanup error reports:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup error reports'
        });
    }
});

/**
 * Update error statistics summary
 */
async function updateErrorStatistics(errorReport) {
    try {
        const summaryPath = path.join(ERROR_LOGS_DIR, 'error-summary.json');
        
        let summary = {
            totalReports: 0,
            totalErrors: 0,
            totalWarnings: 0,
            totalNetworkErrors: 0,
            totalWebcamErrors: 0,
            lastUpdated: new Date().toISOString()
        };

        try {
            const existingData = await fs.readFile(summaryPath, 'utf8');
            summary = JSON.parse(existingData);
        } catch (error) {
            // File doesn't exist, use default summary
        }

        // Update statistics
        summary.totalReports += 1;
        summary.totalErrors += errorReport.totalErrors || 0;
        summary.totalWarnings += errorReport.totalWarnings || 0;
        summary.totalNetworkErrors += errorReport.totalNetworkErrors || 0;
        summary.totalWebcamErrors += errorReport.totalWebcamErrors || 0;
        summary.lastUpdated = new Date().toISOString();

        await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

    } catch (error) {
        logger.error('Failed to update error statistics:', error);
    }
}

module.exports = router;
