/**
 * SSH Connection Monitor API Routes
 * 
 * Provides REST API endpoints for SSH connection monitoring,
 * real-time status updates, and connection management.
 */

const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../../middleware/auth');
const { requireSSH } = require('../../middleware/rbac');
const connectionMonitorService = require('../../services/ssh/connectionMonitorService');
const logger = require('../../scripts/logger');

/**
 * GET /api/connection-monitor/status
 * Get current connection status for all hosts
 */
router.get('/status', authenticateJWT, requireSSH, (req, res) => {
    try {
        const status = connectionMonitorService.getConnectionStatus();
        res.json({
            success: true,
            data: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get connection status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve connection status',
            code: 'CONNECTION_STATUS_ERROR'
        });
    }
});

/**
 * GET /api/connection-monitor/status/:hostName
 * Get connection status for specific host
 */
router.get('/status/:hostName', authenticateJWT, requireSSH, (req, res) => {
    try {
        const { hostName } = req.params;
        const status = connectionMonitorService.getHostStatus(hostName);
        
        if (status.error) {
            return res.status(404).json({
                success: false,
                error: status.error,
                code: 'HOST_NOT_FOUND'
            });
        }
        
        res.json({
            success: true,
            data: status,
            hostName,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to get status for host ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve host status',
            code: 'HOST_STATUS_ERROR'
        });
    }
});

/**
 * POST /api/connection-monitor/check/:hostName
 * Force connection check for specific host
 */
router.post('/check/:hostName', authenticateJWT, requireSSH, async (req, res) => {
    try {
        const { hostName } = req.params;
        const result = await connectionMonitorService.forceCheckHost(hostName);
        
        res.json({
            success: true,
            data: result,
            hostName,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to force check host ${req.params.hostName}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            code: 'FORCE_CHECK_ERROR'
        });
    }
});

/**
 * GET /api/connection-monitor/history
 * Get connection history for all hosts or specific host
 */
router.get('/history', authenticateJWT, requireSSH, (req, res) => {
    try {
        const { hostName, limit } = req.query;
        const parsedLimit = limit ? parseInt(limit) : 100;
        
        const history = connectionMonitorService.getConnectionHistory(hostName, parsedLimit);
        
        res.json({
            success: true,
            data: history,
            count: history.length,
            hostName: hostName || 'all',
            limit: parsedLimit,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get connection history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve connection history',
            code: 'HISTORY_ERROR'
        });
    }
});

/**
 * GET /api/connection-monitor/statistics
 * Get monitoring statistics
 */
router.get('/statistics', authenticateJWT, requireSSH, (req, res) => {
    try {
        const statistics = connectionMonitorService.getStatistics();
        
        res.json({
            success: true,
            data: statistics,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get monitoring statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve monitoring statistics',
            code: 'STATISTICS_ERROR'
        });
    }
});

/**
 * GET /api/connection-monitor/disconnected
 * Get list of currently disconnected hosts
 */
router.get('/disconnected', authenticateJWT, requireSSH, (req, res) => {
    try {
        const disconnectedHosts = connectionMonitorService.getDisconnectedHosts();
        
        res.json({
            success: true,
            data: disconnectedHosts,
            count: disconnectedHosts.length,
            hasDisconnected: disconnectedHosts.length > 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get disconnected hosts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve disconnected hosts',
            code: 'DISCONNECTED_HOSTS_ERROR'
        });
    }
});

/**
 * PUT /api/connection-monitor/thresholds
 * Update alert thresholds
 */
router.put('/thresholds', authenticateJWT, requireSSH, (req, res) => {
    try {
        const { consecutiveFailures, uptimeBelow, responseTimeAbove } = req.body;
        
        const newThresholds = {};
        if (consecutiveFailures !== undefined) newThresholds.consecutiveFailures = parseInt(consecutiveFailures);
        if (uptimeBelow !== undefined) newThresholds.uptimeBelow = parseFloat(uptimeBelow);
        if (responseTimeAbove !== undefined) newThresholds.responseTimeAbove = parseInt(responseTimeAbove);
        
        connectionMonitorService.updateAlertThresholds(newThresholds);
        
        res.json({
            success: true,
            message: 'Alert thresholds updated successfully',
            data: newThresholds,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to update alert thresholds:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update alert thresholds',
            code: 'THRESHOLD_UPDATE_ERROR'
        });
    }
});

/**
 * POST /api/connection-monitor/restart
 * Restart the connection monitoring service
 */
router.post('/restart', authenticateJWT, requireSSH, async (req, res) => {
    try {
        await connectionMonitorService.restart();
        
        res.json({
            success: true,
            message: 'Connection monitoring service restarted successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to restart connection monitoring service:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to restart monitoring service',
            code: 'RESTART_ERROR'
        });
    }
});

/**
 * GET /api/connection-monitor/health
 * Get health status of the monitoring service itself
 */
router.get('/health', authenticateJWT, requireSSH, (req, res) => {
    try {
        const isHealthy = connectionMonitorService.isInitialized;
        const lastUpdate = connectionMonitorService.lastStatusUpdate;
        
        res.json({
            success: true,
            data: {
                healthy: isHealthy,
                initialized: connectionMonitorService.isInitialized,
                lastUpdate: lastUpdate,
                uptime: lastUpdate ? Date.now() - lastUpdate.getTime() : null
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get monitoring service health:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve service health',
            code: 'HEALTH_CHECK_ERROR'
        });
    }
});

/**
 * WebSocket endpoint for real-time connection status updates
 * This would be implemented with Socket.IO in a real application
 */
router.get('/stream', authenticateJWT, requireSSH, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send initial status
    const initialStatus = connectionMonitorService.getConnectionStatus();
    res.write(`data: ${JSON.stringify({
        type: 'initial',
        data: initialStatus,
        timestamp: new Date().toISOString()
    })}\n\n`);
    
    // Setup event listeners for real-time updates
    const handleConnectionRestored = (hostName, state) => {
        res.write(`data: ${JSON.stringify({
            type: 'connectionRestored',
            hostName,
            data: state,
            timestamp: new Date().toISOString()
        })}\n\n`);
    };
    
    const handleConnectionLost = (hostName, state) => {
        res.write(`data: ${JSON.stringify({
            type: 'connectionLost',
            hostName,
            data: state,
            timestamp: new Date().toISOString()
        })}\n\n`);
    };
    
    const handleStateChanged = (hostName, state) => {
        res.write(`data: ${JSON.stringify({
            type: 'stateChanged',
            hostName,
            data: state,
            timestamp: new Date().toISOString()
        })}\n\n`);
    };
    
    // Register event listeners
    connectionMonitorService.on('connectionRestored', handleConnectionRestored);
    connectionMonitorService.on('connectionLost', handleConnectionLost);
    connectionMonitorService.on('connectionStateChanged', handleStateChanged);
    
    // Cleanup on client disconnect
    req.on('close', () => {
        connectionMonitorService.removeListener('connectionRestored', handleConnectionRestored);
        connectionMonitorService.removeListener('connectionLost', handleConnectionLost);
        connectionMonitorService.removeListener('connectionStateChanged', handleStateChanged);
    });
});

module.exports = router;
