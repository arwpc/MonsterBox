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

// Settings file path
const SETTINGS_FILE = path.join(__dirname, '../data/user-settings.json');

// Default settings
const DEFAULT_SETTINGS = {
    theme: 'monsterbox',
    fontSize: 'medium',
    fontFamily: 'terminal',
    accentColor: 'neon-green',
    navigationStyle: 'sidebar',
    animationLevel: 'subtle'
};

// Load user settings
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        }
    } catch (error) {
        logger.warn('Error loading user settings:', error);
    }
    return DEFAULT_SETTINGS;
}

// Save user settings
function saveSettings(settings) {
    try {
        // Ensure data directory exists
        const dataDir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(mergedSettings, null, 2));
        return mergedSettings;
    } catch (error) {
        logger.error('Error saving user settings:', error);
        throw error;
    }
}

// Configuration Dashboard
router.get('/', async (req, res) => {
    try {
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            totalMemory: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            freeMemory: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            cpuCores: os.cpus().length,
            cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
            uptime: (os.uptime() / 3600).toFixed(2) + ' hours',
            loadAverage: os.loadavg()[0].toFixed(2)
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
                capacity: drive.capacity,
                mount: drive.mounted || '/'
            }));
        } catch (error) {
            logger.warn('Error getting disk information:', error);
            driveInfo = [{
                filesystem: 'Unknown',
                size: 'N/A',
                used: 'N/A',
                available: 'N/A',
                capacity: '0%',
                mount: '/',
                error: 'Unable to retrieve disk information'
            }];
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

        // Load user settings
        const userSettings = loadSettings();

        // Available themes
        const availableThemes = [
            { id: 'monsterbox', name: '🖥️ Terminal', description: 'Classic green-on-black terminal aesthetic' },
            { id: 'monsterbox-halloween', name: '🎃 Halloween', description: 'Spooky orange and purple theme' },
            { id: 'monsterbox-retro', name: '👾 Retro', description: 'Enhanced retro computing theme' },
            { id: 'dracula', name: '🧛 Dracula', description: 'Dark purple theme' },
            { id: 'dark', name: '🌙 Dark', description: 'Standard dark theme' },
            { id: 'light', name: '☀️ Light', description: 'Light theme for bright environments' }
        ];

        // Available fonts
        const availableFonts = [
            { id: 'terminal', name: 'VT323', description: 'Classic terminal font' },
            { id: 'retro', name: 'Press Start 2P', description: 'Retro gaming font' },
            { id: 'creepster', name: 'Creepster', description: 'Spooky decorative font' },
            { id: 'mono', name: 'Courier New', description: 'Standard monospace font' }
        ];

        res.render('configuration', {
            title: 'MonsterBox Configuration',
            pageTitle: 'System Configuration',
            pageDescription: 'Manage system settings, themes, and preferences',
            breadcrumbs: [
                { name: 'Home', url: '/' },
                { name: 'Configuration', url: '/configuration' }
            ],
            systemInfo,
            ipAddress,
            wifiSignal,
            power,
            driveInfo,
            userSettings,
            availableThemes,
            availableFonts
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

// Services Monitor route
router.get('/services-monitor', (req, res) => {
    try {
        res.render('hardware-monitor', {
            title: 'Services Monitor',
            pageTitle: 'Services Monitor',
            pageDescription: 'Monitor all MonsterBox services and system status',
            breadcrumbs: [
                { name: 'Home', url: '/', icon: '🏠' },
                { name: 'Configuration', url: '/configuration', icon: '⚙️' },
                { name: 'Services Monitor', current: true }
            ]
        });
    } catch (error) {
        logger.error('Error loading services monitor page:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load services monitor page',
            error: error.message
        });
    }
});

// Redirect legacy microphone configuration to parts management
router.get('/microphone', (req, res) => {
    res.redirect('/parts/microphone/management');
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

// API endpoint to get current settings
router.get('/api/settings', (req, res) => {
    try {
        const settings = loadSettings();
        res.json({ success: true, settings });
    } catch (error) {
        logger.error('Error loading settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load settings',
            details: error.message
        });
    }
});

// API endpoint to save settings
router.post('/api/settings', (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid settings data'
            });
        }

        const savedSettings = saveSettings(settings);
        logger.info('User settings updated:', savedSettings);

        res.json({
            success: true,
            message: 'Settings saved successfully',
            settings: savedSettings
        });
    } catch (error) {
        logger.error('Error saving settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save settings',
            details: error.message
        });
    }
});

// API endpoint to reset settings to defaults
router.post('/api/settings/reset', (req, res) => {
    try {
        const resetSettings = saveSettings(DEFAULT_SETTINGS);
        logger.info('User settings reset to defaults');

        res.json({
            success: true,
            message: 'Settings reset to defaults',
            settings: resetSettings
        });
    } catch (error) {
        logger.error('Error resetting settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset settings',
            details: error.message
        });
    }
});

// Device management endpoints
const DEVICES_FILE = path.join(__dirname, '../data/devices.json');

// Load devices
function loadDevices() {
    try {
        if (fs.existsSync(DEVICES_FILE)) {
            const data = fs.readFileSync(DEVICES_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.warn('Error loading devices:', error);
    }
    return [];
}

// Save devices
function saveDevices(devices) {
    try {
        const dataDir = path.dirname(DEVICES_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
        return true;
    } catch (error) {
        logger.error('Error saving devices:', error);
        return false;
    }
}

// Get devices
router.get('/api/devices', (req, res) => {
    try {
        const devices = loadDevices();
        res.json({ success: true, devices });
    } catch (error) {
        logger.error('Error loading devices:', error);
        res.status(500).json({ success: false, error: 'Failed to load devices' });
    }
});

// Add device
router.post('/api/devices', (req, res) => {
    try {
        const { ip } = req.body;

        if (!ip) {
            return res.status(400).json({ success: false, error: 'IP address is required' });
        }

        const devices = loadDevices();

        // Check if device already exists
        if (devices.find(device => device.ip === ip)) {
            return res.status(400).json({ success: false, error: 'Device already exists' });
        }

        // Add new device
        devices.push({
            ip,
            status: 'unknown',
            addedAt: new Date().toISOString()
        });

        if (saveDevices(devices)) {
            res.json({ success: true, message: 'Device added successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save device' });
        }
    } catch (error) {
        logger.error('Error adding device:', error);
        res.status(500).json({ success: false, error: 'Failed to add device' });
    }
});

// Scan for devices
router.post('/api/devices/scan', (req, res) => {
    try {
        // This is a simplified scan - in a real implementation, you'd use network scanning
        const devices = loadDevices();

        // Simulate finding devices (you can implement actual network scanning here)
        const foundDevices = [
            { ip: '192.168.1.100', status: 'online' },
            { ip: '192.168.1.101', status: 'online' }
        ];

        let addedCount = 0;
        foundDevices.forEach(foundDevice => {
            if (!devices.find(device => device.ip === foundDevice.ip)) {
                devices.push({
                    ...foundDevice,
                    addedAt: new Date().toISOString()
                });
                addedCount++;
            }
        });

        if (addedCount > 0) {
            saveDevices(devices);
        }

        res.json({
            success: true,
            devices: foundDevices,
            addedCount
        });
    } catch (error) {
        logger.error('Error scanning devices:', error);
        res.status(500).json({ success: false, error: 'Failed to scan devices' });
    }
});

// Sound cleanup analyze endpoint
router.post('/api/cleanup/analyze', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');

        // Paths
        const soundsJsonPath = path.join(__dirname, '../data/sounds.json');
        const soundsDirPath = path.join(__dirname, '../public/sounds');

        // Get all files in the sounds directory
        const files = await fs.readdir(soundsDirPath);

        // Read and parse sounds.json
        const soundsData = await fs.readFile(soundsJsonPath, 'utf8');
        const sounds = JSON.parse(soundsData);

        // Collect all filenames used in sounds.json
        const usedFilenames = new Set();
        sounds.forEach(sound => {
            if (sound && sound.filename) usedFilenames.add(sound.filename);
            if (sound && sound.file) usedFilenames.add(sound.file);
        });

        // Find unused files
        const unusedFiles = files.filter(file => !usedFilenames.has(file));

        logger.info(`Sound cleanup analysis: ${files.length} total files, ${unusedFiles.length} unused`);

        res.json({
            success: true,
            totalFiles: files.length,
            referencedFiles: usedFilenames.size,
            unusedFilesFound: unusedFiles.length,
            unusedFiles: unusedFiles
        });

    } catch (error) {
        logger.error('Error analyzing sound files:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze sound files',
            details: error.message
        });
    }
});

// Sound cleanup execute endpoint
router.post('/api/cleanup/execute', async (req, res) => {
    try {
        const cleanupScript = require('../scripts/cleanup_sounds');

        // Run the actual cleanup
        const result = await cleanupScript();

        if (result.success) {
            logger.info(`Sound cleanup completed: deleted ${result.deletedCount} files`);
            res.json({
                success: true,
                deletedCount: result.deletedCount,
                message: `Successfully deleted ${result.deletedCount} unused sound files`,
                details: result
            });
        } else {
            logger.error('Sound cleanup failed:', result.error);
            res.status(500).json({
                success: false,
                error: result.error,
                details: result
            });
        }

    } catch (error) {
        logger.error('Error executing sound cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute sound cleanup',
            details: error.message
        });
    }
});

module.exports = router;
