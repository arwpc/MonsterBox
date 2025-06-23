/**
 * Service Management API Routes
 * 
 * Provides REST API endpoints for the centralized service management system
 */

const express = require('express');
const router = express.Router();
const logger = require('../scripts/logger');

/**
 * Get system status
 */
router.get('/status', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const status = global.serviceIntegration.getSystemStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error getting system status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get service connections for frontend
 */
router.get('/connections', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const connections = global.serviceIntegration.getServiceConnections();
        res.json(connections);
    } catch (error) {
        logger.error('Error getting service connections:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get specific service information
 */
router.get('/service/:serviceName', async (req, res) => {
    try {
        const { serviceName } = req.params;
        
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const serviceInfo = global.serviceIntegration.getServiceInfo(serviceName);
        
        if (!serviceInfo.discovery && !serviceInfo.manager.processInfo) {
            return res.status(404).json({ error: 'Service not found' });
        }
        
        res.json(serviceInfo);
    } catch (error) {
        logger.error(`Error getting service info for ${req.params.serviceName}:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Start a service
 */
router.post('/service/:serviceName/start', async (req, res) => {
    try {
        const { serviceName } = req.params;
        const customConfig = req.body || {};
        
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        logger.info(`API request to start service: ${serviceName}`);
        
        const registration = await global.serviceIntegration.startService(serviceName, customConfig);
        
        res.json({
            success: true,
            message: `Service ${serviceName} started successfully`,
            registration
        });
    } catch (error) {
        logger.error(`Error starting service ${req.params.serviceName}:`, error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Stop a service
 */
router.post('/service/:serviceName/stop', async (req, res) => {
    try {
        const { serviceName } = req.params;
        
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        logger.info(`API request to stop service: ${serviceName}`);
        
        const result = await global.serviceIntegration.stopService(serviceName);
        
        res.json({
            success: true,
            message: `Service ${serviceName} stopped successfully`,
            result
        });
    } catch (error) {
        logger.error(`Error stopping service ${req.params.serviceName}:`, error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Restart a service
 */
router.post('/service/:serviceName/restart', async (req, res) => {
    try {
        const { serviceName } = req.params;
        
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        logger.info(`API request to restart service: ${serviceName}`);
        
        const registration = await global.serviceIntegration.restartService(serviceName);
        
        res.json({
            success: true,
            message: `Service ${serviceName} restarted successfully`,
            registration
        });
    } catch (error) {
        logger.error(`Error restarting service ${req.params.serviceName}:`, error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Start all services
 */
router.post('/start-all', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        logger.info('API request to start all services');
        
        const results = await global.serviceIntegration.startAllServices();
        
        res.json({
            success: true,
            message: 'Service startup completed',
            results
        });
    } catch (error) {
        logger.error('Error starting all services:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Stop all services
 */
router.post('/stop-all', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        logger.info('API request to stop all services');
        
        const results = await global.serviceIntegration.stopAllServices();
        
        res.json({
            success: true,
            message: 'Service shutdown completed',
            results
        });
    } catch (error) {
        logger.error('Error stopping all services:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

/**
 * Perform health check
 */
router.get('/health', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const healthStatus = await global.serviceIntegration.performHealthCheck();
        
        const statusCode = healthStatus.overall === 'healthy' ? 200 : 
                          healthStatus.overall === 'degraded' ? 207 : 503;
        
        res.status(statusCode).json(healthStatus);
    } catch (error) {
        logger.error('Error performing health check:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get port usage statistics
 */
router.get('/ports', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const status = global.serviceIntegration.getSystemStatus();
        
        res.json({
            portManager: status.portManager,
            proxyManager: status.proxyManager,
            services: Object.fromEntries(
                Object.entries(status.services).map(([name, service]) => [
                    name,
                    {
                        name: service.name,
                        port: service.port,
                        proxyPort: service.proxyPort,
                        type: service.type,
                        status: service.status
                    }
                ])
            )
        });
    } catch (error) {
        logger.error('Error getting port information:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get legacy port mappings for backward compatibility
 */
router.get('/legacy-ports', async (req, res) => {
    try {
        if (!global.serviceIntegration) {
            return res.status(503).json({
                error: 'Service integration not available',
                legacy: true
            });
        }
        
        const legacyPorts = global.serviceIntegration.getLegacyServicePorts();
        
        res.json(legacyPorts);
    } catch (error) {
        logger.error('Error getting legacy port mappings:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
