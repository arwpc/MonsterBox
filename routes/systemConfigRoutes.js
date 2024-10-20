const express = require('express');
const router = express.Router();
const os = require('os');
const { exec } = require('child_process');
const nodeDiskInfo = require('node-disk-info');
const logger = require('../scripts/logger');

router.get('/', async (req, res) => {
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

    // Get drive space information
    let driveInfo = [];
    try {
        const disks = await nodeDiskInfo.getDiskInfo();
        driveInfo = disks.map(disk => ({
            filesystem: disk.filesystem,
            size: (disk.blocks / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            used: (disk.used / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            available: (disk.available / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            mountpoint: disk.mounted
        }));
    } catch (error) {
        logger.error('Error getting disk info:', error);
        driveInfo = [{ error: 'Unable to retrieve drive information' }];
    }

    // Get Wi-Fi signal strength (this command works on Raspberry Pi)
    exec('iwconfig wlan0 | grep -i --color signal', (error, stdout, stderr) => {
        let wifiSignal = 'N/A';
        if (!error) {
            const match = stdout.match(/Signal level=(-\d+)/);
            if (match) {
                wifiSignal = match[1] + ' dBm';
            }
        } else {
            logger.warn('Error getting Wi-Fi signal strength:', error);
        }

        // Get current power (this command works on Raspberry Pi)
        exec('vcgencmd measure_volts', (error, stdout, stderr) => {
            let power = 'N/A';
            if (!error) {
                const match = stdout.match(/volt=(\d+\.\d+)V/);
                if (match) {
                    power = match[1] + ' V';
                }
            } else {
                logger.warn('Error getting current power:', error);
            }

            logger.info('Rendering system-config page with system information');
            res.render('system-config', { 
                systemInfo, 
                ipAddress, 
                wifiSignal, 
                power,
                driveInfo
            });
        });
    });
});

module.exports = router;