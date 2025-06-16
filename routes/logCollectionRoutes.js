/**
 * MonsterBox Log Collection API Routes
 * Provides REST API endpoints for the log collection dashboard
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const CentralLogAggregationService = require('../services/centralLogAggregationService');

// Global service instance
let logAggregationService = null;
let serviceConfig = null;

// Load configuration
async function loadConfig() {
    try {
        const configPath = path.join(process.cwd(), 'data', 'log-aggregation-config.json');
        const configData = await fs.readFile(configPath, 'utf8');
        serviceConfig = JSON.parse(configData);
        return serviceConfig;
    } catch (error) {
        // Return default config if file doesn't exist
        serviceConfig = {
            port: 8781,
            storageDir: "./log/aggregated",
            maxBufferSize: 1000,
            flushInterval: 5000,
            retentionDays: 30,
            compressionEnabled: true,
            indexingEnabled: true,
            collectionInterval: 30,
            bufferSize: 1000,
            errorThreshold: 10,
            warningThreshold: 50,
            alertingEnabled: true,
            emailAlerts: false,
            sources: {
                "orlok": {
                    "host": "192.168.8.120",
                    "services": ["jaw", "ai", "registry", "motor", "light", "main"],
                    "enabled": true
                },
                "coffin": {
                    "host": "192.168.8.140", 
                    "services": ["jaw", "ai", "registry", "motor", "light", "main"],
                    "enabled": true
                }
            }
        };
        return serviceConfig;
    }
}

// Save configuration
async function saveConfig(config) {
    try {
        const configPath = path.join(process.cwd(), 'data', 'log-aggregation-config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        serviceConfig = config;
        return true;
    } catch (error) {
        console.error('Failed to save config:', error);
        return false;
    }
}

// Dashboard route
router.get('/dashboard', async (req, res) => {
    try {
        res.render('log-collection-dashboard', {
            title: 'Log Collection Dashboard',
            user: req.user || null
        });
    } catch (error) {
        console.error('Error rendering dashboard:', error);
        res.status(500).send('Error loading dashboard');
    }
});

// Get service status
router.get('/status', async (req, res) => {
    try {
        const status = {
            isRunning: logAggregationService ? logAggregationService.isRunning : false,
            activeDevices: 0,
            logsPerMinute: 0,
            storageUsed: '0 MB',
            service: logAggregationService ? logAggregationService.getStatus() : null
        };

        // Calculate storage usage
        if (serviceConfig) {
            try {
                const storageDir = path.resolve(serviceConfig.storageDir);
                const stats = await getDirectorySize(storageDir);
                status.storageUsed = formatBytes(stats);
            } catch (error) {
                console.warn('Could not calculate storage usage:', error.message);
            }
        }

        // Count active devices
        if (serviceConfig && serviceConfig.sources) {
            status.activeDevices = Object.values(serviceConfig.sources)
                .filter(source => source.enabled).length;
        }

        res.json(status);
    } catch (error) {
        console.error('Error getting status:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start log collection service
router.post('/start', async (req, res) => {
    try {
        if (logAggregationService && logAggregationService.isRunning) {
            return res.json({ success: false, error: 'Service is already running' });
        }

        await loadConfig();
        logAggregationService = new CentralLogAggregationService(serviceConfig);
        
        const started = await logAggregationService.start();
        
        if (started) {
            res.json({ success: true, message: 'Log collection service started' });
        } else {
            res.json({ success: false, error: 'Failed to start service' });
        }
    } catch (error) {
        console.error('Error starting service:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pause log collection service
router.post('/pause', async (req, res) => {
    try {
        if (!logAggregationService) {
            return res.json({ success: false, error: 'Service is not running' });
        }

        // Implement pause functionality
        logAggregationService.isPaused = true;
        res.json({ success: true, message: 'Log collection paused' });
    } catch (error) {
        console.error('Error pausing service:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop log collection service
router.post('/stop', async (req, res) => {
    try {
        if (!logAggregationService) {
            return res.json({ success: false, error: 'Service is not running' });
        }

        await logAggregationService.stop();
        logAggregationService = null;
        
        res.json({ success: true, message: 'Log collection service stopped' });
    } catch (error) {
        console.error('Error stopping service:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get configuration
router.get('/config', async (req, res) => {
    try {
        const config = await loadConfig();
        res.json(config);
    } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save configuration
router.post('/config', async (req, res) => {
    try {
        const newConfig = { ...serviceConfig, ...req.body };
        const saved = await saveConfig(newConfig);
        
        if (saved) {
            // Restart service if it's running to apply new config
            if (logAggregationService && logAggregationService.isRunning) {
                await logAggregationService.stop();
                logAggregationService = new CentralLogAggregationService(newConfig);
                await logAggregationService.start();
            }
            
            res.json({ success: true, message: 'Configuration saved successfully' });
        } else {
            res.json({ success: false, error: 'Failed to save configuration' });
        }
    } catch (error) {
        console.error('Error saving config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get devices
router.get('/devices', async (req, res) => {
    try {
        const config = await loadConfig();
        const devices = [];
        
        if (config.sources) {
            for (const [name, source] of Object.entries(config.sources)) {
                devices.push({
                    id: name,
                    name: name,
                    ip: source.host,
                    status: source.enabled ? 'healthy' : 'disabled',
                    services: source.services || [],
                    lastSeen: source.lastSeen || null,
                    enabled: source.enabled
                });
            }
        }
        
        res.json(devices);
    } catch (error) {
        console.error('Error getting devices:', error);
        res.status(500).json({ error: error.message });
    }
});

// Add device
router.post('/devices', async (req, res) => {
    try {
        const { name, ip, user = 'remote', services = [] } = req.body;
        
        if (!name || !ip) {
            return res.status(400).json({ success: false, error: 'Name and IP are required' });
        }

        const config = await loadConfig();
        
        if (!config.sources) {
            config.sources = {};
        }
        
        config.sources[name] = {
            host: ip,
            user: user,
            services: services,
            enabled: true,
            addedAt: new Date().toISOString()
        };
        
        const saved = await saveConfig(config);
        
        if (saved) {
            res.json({ success: true, message: 'Device added successfully' });
        } else {
            res.json({ success: false, error: 'Failed to save device' });
        }
    } catch (error) {
        console.error('Error adding device:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Remove device
router.delete('/devices/:id', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const config = await loadConfig();
        
        if (config.sources && config.sources[deviceId]) {
            delete config.sources[deviceId];
            const saved = await saveConfig(config);
            
            if (saved) {
                res.json({ success: true, message: 'Device removed successfully' });
            } else {
                res.json({ success: false, error: 'Failed to save configuration' });
            }
        } else {
            res.status(404).json({ success: false, error: 'Device not found' });
        }
    } catch (error) {
        console.error('Error removing device:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Test device connectivity
router.post('/devices/:id/test', async (req, res) => {
    try {
        const deviceId = req.params.id;
        const config = await loadConfig();
        
        if (!config.sources || !config.sources[deviceId]) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }
        
        const device = config.sources[deviceId];
        
        // Test SSH connectivity
        const testResult = await testDeviceConnectivity(device.host, device.user || 'remote');
        
        res.json({
            success: testResult.success,
            message: testResult.message,
            details: testResult.details
        });
    } catch (error) {
        console.error('Error testing device:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Scan network for devices
router.post('/devices/scan', async (req, res) => {
    try {
        const { network = '192.168.8' } = req.body;
        
        // This is a simplified network scan - in production you'd want more sophisticated discovery
        const discoveredDevices = await scanNetwork(network);
        
        res.json({
            success: true,
            devices: discoveredDevices
        });
    } catch (error) {
        console.error('Error scanning network:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get logs with filtering
router.get('/logs', async (req, res) => {
    try {
        const {
            device,
            service,
            level,
            since,
            until,
            limit = 100
        } = req.query;

        // This would query the actual log storage
        // For now, return empty array
        const logs = [];
        
        res.json({
            logs: logs,
            total: logs.length,
            filters: { device, service, level, since, until, limit }
        });
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper functions
async function getDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
        const files = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            
            if (file.isDirectory()) {
                totalSize += await getDirectorySize(filePath);
            } else {
                const stats = await fs.stat(filePath);
                totalSize += stats.size;
            }
        }
    } catch (error) {
        // Directory might not exist yet
        return 0;
    }
    
    return totalSize;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function testDeviceConnectivity(host, user) {
    return new Promise((resolve) => {
        const sshCredentials = require('../scripts/ssh-credentials');
        const { exec } = require('child_process');
        
        try {
            const command = sshCredentials.buildSSHCommandByHost(host, 'echo "Connection test successful"', { batchMode: true });
            
            exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        message: 'Connection failed',
                        details: error.message
                    });
                } else {
                    resolve({
                        success: true,
                        message: 'Connection successful',
                        details: stdout.trim()
                    });
                }
            });
        } catch (error) {
            resolve({
                success: false,
                message: 'Test failed',
                details: error.message
            });
        }
    });
}

async function scanNetwork(networkBase) {
    // Simplified network scan - ping common IPs
    const devices = [];
    const commonIPs = [120, 140, 101, 102, 103]; // Common MonsterBox device IPs
    
    for (const ip of commonIPs) {
        const fullIP = `${networkBase}.${ip}`;
        
        try {
            const testResult = await testDeviceConnectivity(fullIP, 'remote');
            
            if (testResult.success) {
                devices.push({
                    ip: fullIP,
                    name: `Device-${ip}`,
                    status: 'discovered'
                });
            }
        } catch (error) {
            // Ignore failed pings
        }
    }
    
    return devices;
}

module.exports = router;
