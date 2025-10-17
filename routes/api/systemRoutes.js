/**
 * System Information API Routes
 * Provides system information and status
 */

import express from 'express';
import os from 'os';

const router = express.Router();

/**
 * GET /api/system/info - Get system information
 */
router.get('/info', (req, res) => {
    try {
        const systemInfo = {
            success: true,
            nodeVersion: process.version,
            platform: `${os.platform()} ${os.arch()}`,
            hostname: os.hostname(),
            uptime: process.uptime(),
            totalMemory: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            freeMemory: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            cpuCount: os.cpus().length,
            cpuModel: os.cpus()[0]?.model || 'Unknown'
        };
        
        res.json(systemInfo);
    } catch (error) {
        console.error('Error getting system info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system information',
            message: error.message
        });
    }
});

export default router;

