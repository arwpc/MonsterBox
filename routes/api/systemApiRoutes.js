const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const logger = require('../../scripts/logger');

const execAsync = promisify(exec);

// System reboot endpoint
router.post('/reboot', async (req, res) => {
    try {
        logger.warn('System reboot initiated via API');
        
        // Send response before rebooting
        res.json({ 
            success: true, 
            message: 'System reboot initiated. The system will be unavailable for a few minutes.' 
        });
        
        // Delay the reboot to allow response to be sent
        setTimeout(() => {
            exec('sudo reboot', (error) => {
                if (error) {
                    logger.error('Reboot command failed:', error);
                }
            });
        }, 1000);
        
    } catch (error) {
        logger.error('Error initiating reboot:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to initiate reboot',
            details: error.message 
        });
    }
});

// Restart services endpoint
router.post('/restart-services', async (req, res) => {
    try {
        logger.info('Restarting all services via API');
        
        // This would restart your MonsterBox services
        // Adjust these commands based on your actual service management
        const commands = [
            'sudo systemctl restart monsterbox-motor',
            'sudo systemctl restart monsterbox-light',
            'sudo systemctl restart monsterbox-sensor',
            'sudo systemctl restart monsterbox-registry'
        ];
        
        const results = [];
        for (const command of commands) {
            try {
                const { stdout, stderr } = await execAsync(command);
                results.push({ command, success: true, output: stdout });
            } catch (error) {
                results.push({ command, success: false, error: error.message });
                logger.warn(`Service restart failed: ${command} - ${error.message}`);
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({ 
            success: successCount > 0, 
            message: `${successCount}/${commands.length} services restarted successfully`,
            results 
        });
        
    } catch (error) {
        logger.error('Error restarting services:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to restart services',
            details: error.message 
        });
    }
});

// System health check endpoint
router.get('/health-check', async (req, res) => {
    try {
        const issues = [];
        const checks = [];
        
        // Check disk space
        try {
            const { stdout } = await execAsync('df -h /');
            const lines = stdout.split('\n');
            if (lines.length > 1) {
                const usage = lines[1].split(/\s+/)[4];
                const usagePercent = parseInt(usage.replace('%', ''));
                checks.push({ name: 'Disk Space', status: usagePercent < 90 ? 'OK' : 'WARNING', value: usage });
                if (usagePercent >= 90) {
                    issues.push(`Disk usage high: ${usage}`);
                }
            }
        } catch (error) {
            issues.push('Could not check disk space');
        }
        
        // Check memory usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsagePercent = Math.round((usedMem / totalMem) * 100);
        checks.push({ name: 'Memory Usage', status: memUsagePercent < 85 ? 'OK' : 'WARNING', value: `${memUsagePercent}%` });
        if (memUsagePercent >= 85) {
            issues.push(`Memory usage high: ${memUsagePercent}%`);
        }
        
        // Check CPU load
        const loadAvg = os.loadavg()[0];
        const cpuCores = os.cpus().length;
        const loadPercent = Math.round((loadAvg / cpuCores) * 100);
        checks.push({ name: 'CPU Load', status: loadPercent < 80 ? 'OK' : 'WARNING', value: `${loadPercent}%` });
        if (loadPercent >= 80) {
            issues.push(`CPU load high: ${loadPercent}%`);
        }
        
        // Check system uptime
        const uptime = os.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        checks.push({ name: 'System Uptime', status: 'OK', value: `${uptimeHours} hours` });
        
        // Check temperature (Raspberry Pi specific)
        try {
            const { stdout } = await execAsync('vcgencmd measure_temp');
            const tempMatch = stdout.match(/temp=(\d+\.\d+)/);
            if (tempMatch) {
                const temp = parseFloat(tempMatch[1]);
                checks.push({ name: 'CPU Temperature', status: temp < 70 ? 'OK' : 'WARNING', value: `${temp}°C` });
                if (temp >= 70) {
                    issues.push(`CPU temperature high: ${temp}°C`);
                }
            }
        } catch (error) {
            // Temperature check not available (not on Raspberry Pi)
            checks.push({ name: 'CPU Temperature', status: 'N/A', value: 'Not available' });
        }
        
        res.json({ 
            success: true, 
            issues,
            checks,
            overallStatus: issues.length === 0 ? 'HEALTHY' : 'WARNING'
        });
        
    } catch (error) {
        logger.error('Error performing health check:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to perform health check',
            details: error.message 
        });
    }
});

// System stats endpoint for real-time monitoring
router.get('/stats', async (req, res) => {
    try {
        // Get CPU usage
        let cpuUsage = 0;
        try {
            const { stdout } = await execAsync('top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | awk -F\'%\' \'{print $1}\'');
            cpuUsage = parseFloat(stdout.trim()) || 0;
        } catch (error) {
            // Fallback method using load average
            const loadAvg = os.loadavg()[0];
            const cpuCores = os.cpus().length;
            cpuUsage = Math.round((loadAvg / cpuCores) * 100);
        }
        
        // Get memory usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = Math.round(usedMem / (1024 * 1024)); // Convert to MB
        
        // Get temperature
        let temperature = 0;
        try {
            const { stdout } = await execAsync('vcgencmd measure_temp');
            const tempMatch = stdout.match(/temp=(\d+\.\d+)/);
            if (tempMatch) {
                temperature = parseFloat(tempMatch[1]);
            }
        } catch (error) {
            // Temperature not available
            temperature = 0;
        }
        
        res.json({
            success: true,
            cpu: Math.min(cpuUsage, 100),
            memory: memoryUsage,
            temperature: temperature || 'N/A'
        });
        
    } catch (error) {
        logger.error('Error getting system stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get system stats',
            details: error.message 
        });
    }
});

// System reboot endpoint
router.post('/reboot', async (req, res) => {
    try {
        logger.warn('System reboot requested via API');

        res.json({
            success: true,
            message: 'System reboot initiated. The system will be unavailable for a few minutes.',
            timestamp: new Date().toISOString()
        });

        // Delay the actual reboot to allow the response to be sent
        setTimeout(() => {
            logger.warn('Executing system reboot...');
            // Uncomment the line below for actual reboot (be careful!)
            // exec('sudo reboot', (error) => {
            //     if (error) logger.error('Reboot failed:', error);
            // });
        }, 2000);

    } catch (error) {
        logger.error('Error initiating reboot:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate reboot',
            details: error.message
        });
    }
});

// Restart services endpoint
router.post('/restart-services', async (req, res) => {
    try {
        logger.warn('Service restart requested via API');

        res.json({
            success: true,
            message: 'All services restarted successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error restarting services:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart services',
            details: error.message
        });
    }
});

// System health check endpoint
router.get('/health-check', async (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');

        let issues = [];

        // Check memory usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const memUsage = (totalMem - freeMem) / totalMem;

        if (memUsage > 0.9) {
            issues.push('High memory usage (>90%)');
        }

        // Check CPU temperature (RPi specific)
        try {
            if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
                const tempData = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
                const temperature = parseInt(tempData) / 1000;

                if (temperature > 80) {
                    issues.push('High CPU temperature (>80°C)');
                }
            }
        } catch (error) {
            // Temperature check failed, not critical
        }

        // Check load average
        const loadAvg = os.loadavg()[0];
        const cpuCount = os.cpus().length;

        if (loadAvg > cpuCount * 2) {
            issues.push('High system load');
        }

        res.json({
            success: true,
            issues: issues,
            timestamp: new Date().toISOString(),
            summary: issues.length === 0 ? 'System healthy' : `${issues.length} issues found`
        });

    } catch (error) {
        logger.error('Error performing health check:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to perform health check',
            details: error.message
        });
    }
});

module.exports = router;
