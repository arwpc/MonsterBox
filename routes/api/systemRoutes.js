/**
 * System Information API Routes
 * Provides system information, performance monitoring, logs, settings,
 * SSH key management, and config templates.
 */

import { exec } from 'child_process';
import express from 'express';
import os from 'os';
import { createRequire } from 'module';
import { promisify } from 'util';
import systemService from '../../services/systemService.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const router = express.Router();
const execAsync = promisify(exec);

/**
 * GET /api/system/info - Get system information
 */
router.get('/info', (req, res) => {
    try {
        var systemInfo = {
            success: true,
            version: pkg.version,
            nodeVersion: process.version,
            platform: os.platform() + ' ' + os.arch(),
            hostname: os.hostname(),
            uptime: process.uptime(),
            systemUptime: os.uptime(),
            totalMemory: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            freeMemory: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
            cpuCount: os.cpus().length,
            cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'Unknown'
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
 * GET /api/system/performance - Live performance snapshot
 */
router.get('/performance', async (req, res) => {
    try {
        var snapshot = await systemService.getPerformanceSnapshot();
        res.json({ success: true, performance: snapshot });
    } catch (error) {
        console.error('Error getting performance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/performance/history - Historical performance data
 */
router.get('/performance/history', async (req, res) => {
    try {
        var period = req.query.period || '24h';
        var history = await systemService.getPerformanceHistory(period);
        res.json({ success: true, period: period, data: history });
    } catch (error) {
        console.error('Error getting performance history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/logs - Service journal logs
 */
router.get('/logs', async (req, res) => {
    try {
        var service = req.query.service || 'monsterbox';
        var lines = req.query.lines || 100;
        var since = req.query.since || null;
        var logs = await systemService.getServiceLogs(service, lines, since);
        res.json({ success: true, service: service, logs: logs });
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/logs/services - Available log services
 */
router.get('/logs/services', (req, res) => {
    res.json({ success: true, services: systemService.getAvailableServices() });
});

/**
 * GET /api/system/console - Console output from /var/log/monsterbox.log or .err
 */
router.get('/console', async (req, res) => {
    try {
        var lines = req.query.lines || 100;
        var source = req.query.source || 'stdout';
        var output = await systemService.getConsoleOutput(lines, source);
        res.json({ success: true, source: source, output: output });
    } catch (error) {
        console.error('Error getting console output:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/presets - Performance presets for RPi models
 */
router.get('/presets', (req, res) => {
    res.json({ success: true, presets: systemService.getPerformancePresets() });
});

/**
 * POST /api/system/presets/apply - Apply a performance preset
 */
router.post('/presets/apply', express.json(), async (req, res) => {
    try {
        var presetId = req.body && req.body.presetId;
        if (!presetId) return res.status(400).json({ success: false, error: 'presetId required' });
        var result = await systemService.applyPerformancePreset(presetId);
        res.json(result);
    } catch (error) {
        console.error('Error applying preset:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/settings - All system settings
 */
router.get('/settings', async (req, res) => {
    try {
        var settings = await systemService.getSystemSettings();
        res.json({ success: true, settings: settings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/system/settings - Update a system setting
 */
router.put('/settings', express.json(), async (req, res) => {
    try {
        var category = req.body.category;
        var key = req.body.key;
        var value = req.body.value;
        if (!category || !key) {
            return res.status(400).json({ success: false, error: 'category and key required' });
        }
        var result = await systemService.updateSystemSetting(category, key, value);
        res.json(result);
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/settings/startup - Startup tasks
 */
router.get('/settings/startup', async (req, res) => {
    try {
        var tasks = await systemService.getStartupTasks();
        res.json({ success: true, tasks: tasks });
    } catch (error) {
        console.error('Error getting startup tasks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/system/settings/startup - Enable/disable startup task
 */
router.put('/settings/startup', express.json(), async (req, res) => {
    try {
        var service = req.body.service;
        var enabled = req.body.enabled;
        if (!service) {
            return res.status(400).json({ success: false, error: 'service required' });
        }
        var result = await systemService.setStartupTask(service, !!enabled);
        res.json(result);
    } catch (error) {
        console.error('Error updating startup task:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/ssh/keys - List SSH keys
 */
router.get('/ssh/keys', async (req, res) => {
    try {
        var keys = await systemService.listSSHKeys();
        res.json({ success: true, keys: keys });
    } catch (error) {
        console.error('Error listing SSH keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/ssh/keys/generate - Generate new keypair
 */
router.post('/ssh/keys/generate', express.json(), async (req, res) => {
    try {
        var type = req.body.type || 'ed25519';
        var comment = req.body.comment || '';
        var result = await systemService.generateSSHKey(type, comment);
        res.json(result);
    } catch (error) {
        console.error('Error generating SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/ssh/keys/deploy - Deploy key to host
 */
router.post('/ssh/keys/deploy', express.json(), async (req, res) => {
    try {
        var host = req.body.host;
        var keyName = req.body.keyName;
        if (!host || !keyName) {
            return res.status(400).json({ success: false, error: 'host and keyName required' });
        }
        var result = await systemService.deployKeyToHost(host, keyName);
        res.json(result);
    } catch (error) {
        console.error('Error deploying SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/system/ssh/keys/:name - Delete SSH key
 */
router.delete('/ssh/keys/:name', async (req, res) => {
    try {
        var result = await systemService.deleteSSHKey(req.params.name);
        res.json(result);
    } catch (error) {
        console.error('Error deleting SSH key:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/ssh/authorized - Get authorized keys
 */
router.get('/ssh/authorized', async (req, res) => {
    try {
        var keys = await systemService.getAuthorizedKeys();
        res.json({ success: true, authorizedKeys: keys });
    } catch (error) {
        console.error('Error getting authorized keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/system/templates - List config templates
 */
router.get('/templates', async (req, res) => {
    try {
        var templates = await systemService.listTemplates();
        res.json({ success: true, templates: templates });
    } catch (error) {
        console.error('Error listing templates:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/templates - Save current config as template
 */
router.post('/templates', express.json(), async (req, res) => {
    try {
        var name = req.body.name;
        var description = req.body.description || '';
        var result = await systemService.saveTemplate(name, description);
        res.json(result);
    } catch (error) {
        console.error('Error saving template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/system/templates/:id/apply - Apply template
 */
router.post('/templates/:id/apply', express.json(), async (req, res) => {
    try {
        var targetHost = req.body.targetHost || 'localhost';
        var result = await systemService.applyTemplate(req.params.id, targetHost);
        res.json(result);
    } catch (error) {
        console.error('Error applying template:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/system/templates/:id - Delete template
 */
router.delete('/templates/:id', async (req, res) => {
    try {
        var result = await systemService.deleteTemplate(req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ success: false, error: error.message });
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
        setTimeout(function () {
            console.log('🔄 Initiating system reboot...');
            exec('sudo reboot', function (error) {
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

/**
 * POST /api/system/shutdown - Shutdown the system
 */
router.post('/shutdown', express.json(), async (req, res) => {
    try {
        console.log('⚠️ System shutdown requested');

        res.json({
            success: true,
            message: 'System shutdown initiated.'
        });

        setTimeout(function () {
            exec('sudo shutdown -h now', function (error) {
                if (error) {
                    console.error('Shutdown failed:', error);
                }
            });
        }, 1000);

    } catch (error) {
        console.error('Error initiating shutdown:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate shutdown',
            message: error.message
        });
    }
});

export default router;
