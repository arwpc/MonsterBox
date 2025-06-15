/**
 * Hardware API Routes
 * Provides REST API endpoints for hardware service status and control
 */

const express = require('express');
const router = express.Router();
const logger = require('../../scripts/logger');

let hardwareServiceManager = null;

// Set hardware service manager instance
function setHardwareServiceManager(manager) {
    hardwareServiceManager = manager;
}

// Get hardware service status
router.get('/status', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized',
                status: 'unavailable'
            });
        }

        const status = hardwareServiceManager.getServiceStatus();
        
        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            hardware: status
        });
        
    } catch (error) {
        logger.error('Error getting hardware status:', error);
        res.status(500).json({
            error: 'Failed to get hardware status',
            message: error.message
        });
    }
});

// Get detailed service information
router.get('/services', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized',
                services: []
            });
        }

        const status = hardwareServiceManager.getServiceStatus();
        
        const serviceDetails = Object.entries(status.services).map(([name, service]) => ({
            name,
            port: service.port,
            status: service.status,
            url: `ws://localhost:${service.port}`,
            description: getServiceDescription(name)
        }));

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            isRunning: status.isRunning,
            processId: status.processId,
            services: serviceDetails
        });
        
    } catch (error) {
        logger.error('Error getting service details:', error);
        res.status(500).json({
            error: 'Failed to get service details',
            message: error.message
        });
    }
});

// Start character services
router.post('/character/:id/start', async (req, res) => {
    try {
        const characterId = parseInt(req.params.id);
        
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized'
            });
        }

        const success = await hardwareServiceManager.startCharacterServices(characterId);
        
        if (success) {
            res.json({
                success: true,
                message: `Services started for character ${characterId}`,
                characterId
            });
        } else {
            res.status(500).json({
                error: `Failed to start services for character ${characterId}`,
                characterId
            });
        }
        
    } catch (error) {
        logger.error('Error starting character services:', error);
        res.status(500).json({
            error: 'Failed to start character services',
            message: error.message
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                status: 'unavailable',
                message: 'Hardware service manager not initialized'
            });
        }

        const status = hardwareServiceManager.getServiceStatus();
        const isHealthy = status.isRunning && Object.values(status.services).some(s => s.status === 'online');
        
        res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'healthy' : 'unhealthy',
            isRunning: status.isRunning,
            onlineServices: Object.values(status.services).filter(s => s.status === 'online').length,
            totalServices: Object.keys(status.services).length,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        logger.error('Error checking hardware health:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get service description
function getServiceDescription(serviceName) {
    const descriptions = {
        registry: 'Service Registry - Manages service discovery and registration',
        main: 'Main Hardware Server - Coordinates all hardware operations',
        motor: 'Motor Service - Controls servo motors and actuators',
        light: 'Light Service - Manages LED strips and lighting effects'
    };
    
    return descriptions[serviceName] || `${serviceName} service`;
}

module.exports = {
    router,
    setHardwareServiceManager
};
