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
 * POST /api/hub/hardware
 * Execute hardware commands through unified interface
 * Phase 2: Hardware Consolidation endpoint
 */
router.post('/hardware', ensureHubAvailable, async (req, res) => {
    try {
        logger.info('Hardware command received:', req.body);

        if (!hubInstance.hardwareServer) {
            return res.status(503).json({
                error: 'Hardware server not available',
                message: 'MainHardwareServer is not initialized'
            });
        }

        const command = req.body;
        const result = await hubInstance.hardwareServer.executeCommand(command);

        if (result.success) {
            res.json({
                success: true,
                message: 'Hardware command executed',
                timestamp: new Date().toISOString(),
                commandId: result.commandId,
                result: result.result
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Hardware command failed',
                message: result.error,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        logger.error('Error executing hardware command:', error);
        res.status(500).json({
            success: false,
            error: 'Hardware command execution failed',
            message: error.message
        });
    }
});

/**
 * GET /api/hub/hardware
 * Get current hardware status and capabilities
 */
router.get('/hardware', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance.hardwareServer) {
            return res.status(503).json({
                error: 'Hardware server not available'
            });
        }

        const status = await hubInstance.hardwareServer.getHardwareStatus();
        const capabilities = hubInstance.hardwareServer.getCapabilities();

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            status,
            capabilities
        });

    } catch (error) {
        logger.error('Error getting hardware status:', error);
        res.status(500).json({
            error: 'Failed to get hardware status',
            message: error.message
        });
    }
});

/**
 * POST /api/hub/hardware/emergency-stop
 * Emergency stop all hardware
 */
router.post('/hardware/emergency-stop', ensureHubAvailable, async (req, res) => {
    try {
        logger.warn('🚨 Emergency stop requested');

        if (!hubInstance.hardwareServer) {
            return res.status(503).json({
                error: 'Hardware server not available'
            });
        }

        await hubInstance.hardwareServer.emergencyStop();

        res.json({
            success: true,
            message: 'Emergency stop executed',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error executing emergency stop:', error);
        res.status(500).json({
            success: false,
            error: 'Emergency stop failed',
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

// ========================================
// Phase 3: Integrated Service Endpoints
// ========================================

/**
 * GET /api/hub/microphone/status
 * Get microphone service status
 */
router.get('/microphone/status', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance || !hubInstance.microphoneService) {
            return res.status(503).json({
                success: false,
                error: 'Microphone service not available'
            });
        }

        const microphones = await hubInstance.microphoneService.loadMicrophones();
        const status = {
            available: microphones.length,
            active: microphones.filter(m => m.status === 'active').length,
            microphones: microphones.map(m => ({
                id: m.id,
                name: m.name,
                status: m.status,
                type: m.type
            }))
        };

        res.json({
            success: true,
            microphone: status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error getting microphone status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/hub/microphone/start_recording
 * Start microphone recording
 */
router.post('/microphone/start_recording', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance || !hubInstance.microphoneService) {
            return res.status(503).json({
                success: false,
                error: 'Microphone service not available'
            });
        }

        const { microphoneId } = req.body;
        const result = await hubInstance.microphoneService.startMonitoring(microphoneId);

        res.json({
            success: result,
            message: result ? 'Recording started' : 'Failed to start recording',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error starting microphone recording:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/hub/webcam/status
 * Get webcam service status
 */
router.get('/webcam/status', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance || !hubInstance.webcamService) {
            return res.status(503).json({
                success: false,
                error: 'Webcam service not available'
            });
        }

        const webcams = await hubInstance.webcamService.loadWebcams();
        const status = {
            available: webcams.length,
            active: webcams.filter(w => w.status === 'active').length,
            webcams: webcams.map(w => ({
                id: w.id,
                name: w.name,
                status: w.status,
                deviceId: w.deviceId
            }))
        };

        res.json({
            success: true,
            webcam: status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error getting webcam status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/hub/ai/status
 * Get AI service status
 */
router.get('/ai/status', ensureHubAvailable, async (req, res) => {
    try {
        if (!hubInstance || !hubInstance.aiService) {
            return res.status(503).json({
                success: false,
                error: 'AI service not available'
            });
        }

        const agents = hubInstance.aiService.agents || new Map();
        const status = {
            available: agents.size,
            active: hubInstance.aiService.activeConnections ? hubInstance.aiService.activeConnections.size : 0,
            agents: Array.from(agents.entries()).map(([id, agent]) => ({
                id,
                name: agent.name,
                voice: agent.voice
            }))
        };

        res.json({
            success: true,
            ai: status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error getting AI status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
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
            '/api/hub/refresh',
            // Phase 3 endpoints
            '/api/hub/microphone/status',
            '/api/hub/microphone/start_recording',
            '/api/hub/microphone/stop_recording',
            '/api/hub/webcam/status',
            '/api/hub/webcam/snapshot',
            '/api/hub/webcam/stream',
            '/api/hub/ai/status',
            '/api/hub/ai/agents'
        ]
    });
});

module.exports = {
    router,
    initializeHubRoutes
};
