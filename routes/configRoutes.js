const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const nodeDiskInfo = require('node-disk-info');
const logger = require('../scripts/logger');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// Configuration Dashboard
router.get('/', async (req, res) => {
    try {
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            totalMem: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            freeMem: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            cpus: os.cpus().length,
            uptime: (os.uptime() / 3600).toFixed(2) + ' hours'
        };

        // Get IP address
        const networkInterfaces = os.networkInterfaces();
        const ipAddress = Object.values(networkInterfaces)
            .flat()
            .find(iface => !iface.internal && iface.family === 'IPv4')?.address || 'N/A';

        // Get disk information
        let driveInfo = [];
        try {
            const drives = await nodeDiskInfo.getDiskInfo();
            driveInfo = drives.map(drive => ({
                filesystem: drive.filesystem,
                size: (drive.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                used: (drive.used / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                available: (drive.available / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
                capacity: drive.capacity
            }));
        } catch (error) {
            logger.warn('Error getting disk information:', error);
            driveInfo = [{ error: 'Unable to retrieve disk information' }];
        }

        // Get WiFi signal strength (Linux specific)
        let wifiSignal = 'N/A';
        try {
            const { stdout } = await execAsync('iwconfig 2>/dev/null | grep "Signal level" | head -1');
            const match = stdout.match(/Signal level=(-?\d+)/);
            if (match) {
                wifiSignal = match[1] + ' dBm';
            }
        } catch (error) {
            // WiFi info not available or not on Linux
        }

        // Get current power (Raspberry Pi specific)
        let power = 'N/A';
        try {
            const { stdout } = await execAsync('vcgencmd measure_volts 2>/dev/null');
            const match = stdout.match(/volt=(\d+\.\d+)V/);
            if (match) {
                power = match[1] + ' V';
            }
        } catch (error) {
            // Power info not available or not on Raspberry Pi
        }

        res.render('configuration', {
            title: 'System Configuration',
            systemInfo,
            ipAddress,
            wifiSignal,
            power,
            driveInfo
        });
    } catch (error) {
        logger.error('Configuration page error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load configuration page',
            error: error.message
        });
    }
});

// System maintenance section
router.get('/maintenance', (req, res) => {
    res.render('configuration/maintenance', {
        title: 'System Maintenance'
    });
});

// System reboot endpoint
router.post('/reboot', async (req, res) => {
    try {
        logger.info('System reboot requested');

        res.status(200).json({
            success: true,
            message: 'Reboot command initiated. System will restart in a few seconds.'
        });

        setTimeout(async () => {
            try {
                logger.info('Executing system reboot command');
                await execAsync('sudo reboot');
            } catch (error) {
                logger.error('Failed to execute reboot command:', error);
            }
        }, 1000);
    } catch (error) {
        logger.error('Error processing reboot request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate system reboot',
            details: error.message
        });
    }
});

module.exports = router;
