/**
 * System Information API Routes
 * Provides system information and status
 */

import { exec } from 'child_process';
import express from 'express';
import os from 'os';
import { promisify } from 'util';

const router = express.Router();
const execAsync = promisify(exec);

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

/**
 * POST /api/system/reboot - Reboot the animatronic
 */
router.post('/reboot', express.json(), async (req, res) => {
    try {
        console.log('⚠️ System reboot requested');

        // Send success response immediately before reboot
        res.json({
            success: true,
            message: 'System reboot initiated. Device will be unavailable for about 60 seconds.'
        });

        // Delay reboot slightly to allow response to be sent
        setTimeout(() => {
            console.log('🔄 Initiating system reboot...');
            // Use sudo reboot - assumes passwordless sudo is configured
            exec('sudo reboot', (error) => {
                if (error) {
                    console.error('Reboot failed:', error);
                }
            });
        }, 1000);

    } catch (error) {
        console.error('Error initiating reboot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate reboot',
            message: error.message
        });
    }
});

export default router;

