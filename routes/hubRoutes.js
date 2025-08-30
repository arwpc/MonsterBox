/**
 * Unified Animatronic Hub API Routes
 * 
 * Provides REST API endpoints for the unified hub system.
 * Phase 1: Monitoring endpoints that replace individual service checks
 * 
 * Main endpoint: GET /api/hub/status - returns all service status in one call
 */

const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');

// Hub instance will be injected by the main application
let hubInstance = null;

/**
 * Initialize hub routes with hub instance
 */
function initializeHubRoutes(hub) {
    hubInstance = hub;
    logger.info('🔌 Hub routes initialized with hub instance');
}

/**
 * Middleware to ensure hub is available
 */
function ensureHubAvailable(req, res, next) {
    if (!hubInstance) {
        return res.status(503).json({
            error: 'Hub not available',
            message: 'Unified Animatronic Hub is not initialized'
        });
    }
    
    if (!hubInstance.isInitialized) {
        return res.status(503).json({
            error: 'Hub not ready',
            message: 'Unified Animatronic Hub is initializing'
        });
    }
    
    next();
}

/**
 * GET /api/hub/status
 * Main monitoring endpoint - returns consolidated status of all services
 * Replaces individual service status checks from hardware-monitor.ejs
 */
router.get('/status', ensureHubAvailable, async (req, res) => {
    try {
        logger.debug('Hub status request received');
        await hubInstance.handleStatusRequest(req, res);
    } catch (error) {
        logger.error('Error in hub status route:', error);
        res.status(500).json({
            error: 'Hub status error',
            message: error.message
        });
    }
});

/**
 * GET /api/hub/health
 * Health check endpoint for monitoring systems
 */
router.get('/health', ensureHubAvailable, async (req, res) => {
    try {
        logger.debug('Hub health check request received');
        await hubInstance.handleHealthRequest(req, res);
    } catch (error) {
        logger.error('Error in hub health route:', error);
        res.status(503).json({
            overall: 'error',
            error: error.message
        });
    }
});

/**
 * GET /api/hub/info
 * Get hub information and capabilities
 */
router.get('/info', ensureHubAvailable, async (req, res) => {
    try {
        const info = {
            name: 'Unified Animatronic Hub',
            version: '1.0.0-phase1',
            hostname: hubInstance.config.hostname,
            phase: 'Phase 1: Monitoring Foundation',
            capabilities: [
                'consolidated_service_monitoring',
                'health_status_tracking',
                'remote_character_support'
            ],
            endpoints: {
                status: '/api/hub/status',
                health: '/api/hub/health',
                info: '/api/hub/info'
            },
            uptime: hubInstance.getUptime(),
            services: hubInstance.getServiceSummary()
        };

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            ...info
        });

    } catch (error) {
        logger.error('Error getting hub info:', error);
        res.status(500).json({
            error: 'Failed to get hub info',
            message: error.message
        });
    }
});

/**
 * GET /api/hub/services
 * Get detailed service information (for debugging/admin)
 */
router.get('/services', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance.statusMonitor) {
            return res.status(503).json({
                error: 'Status monitor not available'
            });
        }

        const services = await hubInstance.statusMonitor.checkAllServices();
        const summary = hubInstance.statusMonitor.getSummary();
        const history = hubInstance.statusMonitor.getHealthHistory();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            hostname: hubInstance.config.hostname,
            services,
            summary,
            history: history.slice(-10) // Last 10 entries
        });

    } catch (error) {
        logger.error('Error getting services info:', error);
        res.status(500).json({
            error: 'Failed to get services info',
            message: error.message
        });
    }
});

/**
 * POST /api/hub/refresh
 * Force refresh of service status
 */
router.post('/refresh', ensureHubAvailable, async (req, res) => {
    try {
        logger.info('Manual hub status refresh requested');
        
        if (!hubInstance.statusMonitor) {
            return res.status(503).json({
                error: 'Status monitor not available'
            });
        }

        const services = await hubInstance.statusMonitor.checkAllServices();
        const summary = hubInstance.statusMonitor.getSummary();

        res.json({
            success: true,
            message: 'Service status refreshed',
            timestamp: new Date().toISOString(),
            services,
            summary
        });

    } catch (error) {
        logger.error('Error refreshing hub status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh status',
            message: error.message
        });
    }
});

/**
 * Error handler for hub routes
 */
router.use((error, req, res, next) => {
    logger.error('Hub route error:', error);
    
    res.status(500).json({
        error: 'Hub system error',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

/**
 * 404 handler for unknown hub endpoints
 */
router.use('*', (req, res) => {
    res.status(404).json({
        error: 'Hub endpoint not found',
        path: req.originalUrl,
        availableEndpoints: [
            '/api/hub/status',
            '/api/hub/health',
            '/api/hub/info',
            '/api/hub/services',
            '/api/hub/refresh'
        ]
    });
});

module.exports = {
    router,
    initializeHubRoutes
};
