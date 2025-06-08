/**
 * Robust SSH Service API Routes
 * 
 * Provides REST API endpoints for the robust SSH connection management,
 * including connection testing, command execution, and service monitoring.
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../middleware/auth');
const { requireSSH } = require('../../middleware/rbac');
const robustSSHService = require('../../services/ssh/robustSSHService');
const logger = require('../../scripts/logger');

/**
 * GET /api/robust-ssh/status
 * Get comprehensive status of the robust SSH service
 */
router.get('/status', authenticateJWT, requireSSH, (req, res) => {
    try {
        const status = robustSSHService.getStatus();
        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get robust SSH status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve SSH service status',
            code: 'SSH_STATUS_ERROR'
        });
    }
});

/**
 * GET /api/robust-ssh/hosts
 * Get all configured hosts
 */
router.get('/hosts', authenticateJWT, requireSSH, (req, res) => {
    try {
        const hostConfigs = robustSSHService.getAllHostConfigs();
        res.json({
            success: true,
            data: hostConfigs,
            count: Object.keys(hostConfigs).length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get host configurations:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve host configurations',
            code: 'HOST_CONFIG_ERROR'
        });
    }
});

/**
 * GET /api/robust-ssh/hosts/:hostName
 * Get configuration for specific host
 */
router.get('/hosts/:hostName', authenticateJWT, requireSSH, (req, res) => {
    try {
        const { hostName } = req.params;
        const hostConfig = robustSSHService.getHostConfig(hostName);
        
        if (!hostConfig) {
            return res.status(404).json({
                success: false,
                error: `Host configuration not found for ${hostName}`,
                code: 'HOST_NOT_FOUND'
            });
        }
        
        res.json({
            success: true,
            data: hostConfig,
            hostName,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to get host config for ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve host configuration',
            code: 'HOST_CONFIG_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/test/:hostName
 * Test connection to specific host
 */
router.post('/test/:hostName', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const { hostName } = req.params;
        const result = await robustSSHService.testConnection(hostName);
        
        res.json({
            success: true,
            data: result,
            hostName,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to test connection to ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'CONNECTION_TEST_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/test-all
 * Test connections to all configured hosts
 */
router.post('/test-all', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const results = await robustSSHService.testAllConnections();
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to test all connections:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test connections',
            code: 'CONNECTION_TEST_ALL_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/execute/:hostName
 * Execute command on specific host
 */
router.post('/execute/:hostName', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const { hostName } = req.params;
        const { command, timeout } = req.body;
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Command is required',
                code: 'MISSING_COMMAND'
            });
        }
        
        const options = {};
        if (timeout) options.timeout = parseInt(timeout);
        
        const result = await robustSSHService.executeCommand(hostName, command, options);
        
        res.json({
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to execute command on ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'COMMAND_EXECUTION_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/execute-multiple
 * Execute command on multiple hosts
 */
router.post('/execute-multiple', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const { hostNames, command, timeout } = req.body;
        
        if (!command) {
            return res.status(400).json({
                success: false,
                error: 'Command is required',
                code: 'MISSING_COMMAND'
            });
        }
        
        if (!hostNames || !Array.isArray(hostNames) || hostNames.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Host names array is required',
                code: 'MISSING_HOST_NAMES'
            });
        }
        
        const options = {};
        if (timeout) options.timeout = parseInt(timeout);
        
        const results = await robustSSHService.executeCommandOnHosts(hostNames, command, options);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to execute command on multiple hosts:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'MULTIPLE_COMMAND_EXECUTION_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/reconnect/:hostName
 * Force reconnection to specific host
 */
router.post('/reconnect/:hostName', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const { hostName } = req.params;
        const result = await robustSSHService.forceReconnection(hostName);
        
        res.json({
            success: true,
            message: `Reconnection initiated for ${hostName}`,
            data: result.getStatistics(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to reconnect to ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'RECONNECTION_ERROR'
        });
    }
});

/**
 * GET /api/robust-ssh/statistics
 * Get connection statistics
 */
router.get('/statistics', authenticateJWT, requireSSH, (req, res) => {
    try {
        const statistics = robustSSHService.getConnectionStatistics();
        
        res.json({
            success: true,
            data: statistics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get connection statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve connection statistics',
            code: 'STATISTICS_ERROR'
        });
    }
});

/**
 * PUT /api/robust-ssh/hosts/:hostName
 * Update host configuration
 */
router.put('/hosts/:hostName', authenticateJWT, requireSSH, (req, res) => {
    try {
        const { hostName } = req.params;
        const { host, user, port, connectionTimeout, keepaliveInterval } = req.body;
        
        const updateConfig = {};
        if (host) updateConfig.host = host;
        if (user) updateConfig.user = user;
        if (port) updateConfig.port = parseInt(port);
        if (connectionTimeout) updateConfig.connectionTimeout = parseInt(connectionTimeout);
        if (keepaliveInterval) updateConfig.keepaliveInterval = parseInt(keepaliveInterval);
        
        robustSSHService.updateHostConfig(hostName, updateConfig);
        
        res.json({
            success: true,
            message: `Host configuration updated for ${hostName}`,
            data: robustSSHService.getHostConfig(hostName),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to update host config for ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'HOST_CONFIG_UPDATE_ERROR'
        });
    }
});

/**
 * GET /api/robust-ssh/health
 * Get health status of the robust SSH service
 */
router.get('/health', authenticateJWT, requireSSH, (req, res) => {
    try {
        const status = robustSSHService.getStatus();
        const isHealthy = status.initialized && !status.error;
        
        res.json({
            success: true,
            data: {
                healthy: isHealthy,
                initialized: status.initialized,
                activeConnections: status.connectionPoolStatus ? 
                    Object.values(status.connectionPoolStatus).reduce((sum, pool) => sum + pool.activeConnections, 0) : 0,
                totalHosts: status.hostConfigs ? status.hostConfigs.length : 0,
                lastActivity: status.serviceStats ? status.serviceStats.lastActivity : null,
                uptime: status.serviceStats ? Date.now() - status.serviceStats.startTime.getTime() : 0
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get robust SSH health status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve service health status',
            code: 'HEALTH_CHECK_ERROR'
        });
    }
});

/**
 * POST /api/robust-ssh/restart
 * Restart the robust SSH service
 */
router.post('/restart', authenticateJWT, requireSSH, async (req, res) => {
    try {
        await robustSSHService.shutdown();
        await robustSSHService.initialize();
        
        res.json({
            success: true,
            message: 'Robust SSH service restarted successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to restart robust SSH service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart SSH service',
            code: 'RESTART_ERROR'
        });
    }
});

module.exports = router;
