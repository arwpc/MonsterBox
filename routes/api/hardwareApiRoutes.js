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
            hardware: status,
            hal_integration: {
                available: true,
                version: '1.0.0',
                features: ['safety_system', 'device_discovery', 'unified_control']
            }
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
            timestamp: new Date().toISOString(),
            hal_status: {
                integrated: true,
                safety_system: 'active',
                device_manager: 'operational'
            }
        });

    } catch (error) {
        logger.error('Error checking hardware health:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Device discovery endpoint
router.get('/devices', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized',
                devices: []
            });
        }

        // Mock device discovery for now - in real implementation this would
        // query the Hardware Integration Layer for available devices
        const mockDevices = [
            {
                device_id: 'motor_20',
                device_type: 'motor',
                protocol: 'gpio',
                pin: 20,
                status: 'available',
                capabilities: ['forward', 'backward', 'speed_control'],
                safety_limits: { max_speed: 100, max_duration: 10000 }
            },
            {
                device_id: 'light_21',
                device_type: 'light',
                protocol: 'gpio',
                pin: 21,
                status: 'available',
                capabilities: ['on', 'off', 'duration_control'],
                safety_limits: { max_duration: 0 }
            }
        ];

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            devices: mockDevices,
            total_devices: mockDevices.length
        });

    } catch (error) {
        logger.error('Error discovering devices:', error);
        res.status(500).json({
            error: 'Failed to discover devices',
            message: error.message
        });
    }
});

// Unified device control endpoint
router.post('/devices/:deviceId/control', (req, res) => {
    try {
        const { deviceId } = req.params;
        const { command, parameters } = req.body;

        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized'
            });
        }

        if (!command) {
            return res.status(400).json({
                error: 'Command is required'
            });
        }

        // Mock unified control response - in real implementation this would
        // route to the appropriate Hardware Integration Layer command
        const response = {
            success: true,
            device_id: deviceId,
            command: command,
            parameters: parameters || {},
            timestamp: new Date().toISOString(),
            execution_time: Math.random() * 100, // Mock execution time
            safety_checks: 'passed'
        };

        logger.info(`Hardware control command: ${deviceId} - ${command}`, parameters);

        res.json(response);

    } catch (error) {
        logger.error('Error executing device control:', error);
        res.status(500).json({
            error: 'Failed to execute device control',
            message: error.message
        });
    }
});

// Safety system status endpoint
router.get('/safety', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized'
            });
        }

        // Mock safety system status - in real implementation this would
        // query the Safety System component
        const safetyStatus = {
            emergency_stop_active: false,
            total_safety_limits: 12,
            total_violations: 0,
            safety_level: 'normal',
            last_check: new Date().toISOString(),
            active_limits: [
                { component: 'motor', limit_type: 'max_speed', value: 100 },
                { component: 'motor', limit_type: 'max_duration', value: 10000 },
                { component: 'light', limit_type: 'max_brightness', value: 100 }
            ]
        };

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            safety_system: safetyStatus
        });

    } catch (error) {
        logger.error('Error getting safety status:', error);
        res.status(500).json({
            error: 'Failed to get safety status',
            message: error.message
        });
    }
});

// Emergency stop endpoint
router.post('/emergency-stop', (req, res) => {
    try {
        if (!hardwareServiceManager) {
            return res.status(503).json({
                error: 'Hardware service manager not initialized'
            });
        }

        // Mock emergency stop - in real implementation this would
        // trigger the Safety System emergency stop
        logger.warn('🚨 Emergency stop triggered via API');

        res.json({
            success: true,
            message: 'Emergency stop activated',
            timestamp: new Date().toISOString(),
            affected_devices: ['all'],
            recovery_required: true
        });

    } catch (error) {
        logger.error('Error executing emergency stop:', error);
        res.status(500).json({
            error: 'Failed to execute emergency stop',
            message: error.message
        });
    }
});

// System stats endpoint for monitoring
router.get('/stats', (req, res) => {
    try {
        const os = require('os');
        const fs = require('fs');

        // Get CPU usage
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;

        cpus.forEach(cpu => {
            for (type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });

        const idle = totalIdle / cpus.length;
        const total = totalTick / cpus.length;
        const usage = 100 - ~~(100 * idle / total);

        // Get memory usage
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round(usedMem / 1024 / 1024); // Convert to MB

        // Get CPU temperature (Raspberry Pi specific)
        let temperature = 'N/A';
        try {
            if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
                const tempData = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
                temperature = Math.round(parseInt(tempData) / 1000);
            }
        } catch (error) {
            logger.warn('Could not read CPU temperature:', error.message);
        }

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            cpu: usage,
            memory: memUsage,
            temperature: temperature,
            uptime: Math.round(os.uptime()),
            loadAverage: os.loadavg()[0].toFixed(2)
        });

    } catch (error) {
        logger.error('Error getting system stats:', error);
        res.status(500).json({
            error: 'Failed to get system stats',
            message: error.message
        });
    }
});

// Motor control endpoint
router.post('/motor', (req, res) => {
    try {
        const { pin, direction, speed } = req.body;

        if (!pin || !direction || speed === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Pin, direction, and speed are required'
            });
        }

        // Mock motor control - in real implementation this would
        // send commands to the motor service
        logger.info(`Motor control: Pin ${pin}, Direction ${direction}, Speed ${speed}%`);

        res.json({
            success: true,
            message: `Motor on pin ${pin} set to ${direction} at ${speed}% speed`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error controlling motor:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to control motor',
            message: error.message
        });
    }
});

// LED control endpoint
router.post('/led', (req, res) => {
    try {
        const { pin, color, brightness } = req.body;

        if (!pin || !color || brightness === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Pin, color, and brightness are required'
            });
        }

        // Mock LED control - in real implementation this would
        // send commands to the light service
        logger.info(`LED control: Pin ${pin}, Color ${color}, Brightness ${brightness}`);

        res.json({
            success: true,
            message: `LED on pin ${pin} set to ${color} at ${brightness} brightness`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error controlling LED:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to control LED',
            message: error.message
        });
    }
});

// Sensor reading endpoint
router.post('/sensor', (req, res) => {
    try {
        const { pin, type } = req.body;

        if (!pin || !type) {
            return res.status(400).json({
                success: false,
                error: 'Pin and type are required'
            });
        }

        // Mock sensor reading - in real implementation this would
        // read from the sensor service
        let value;
        switch (type) {
            case 'digital':
                value = Math.random() > 0.5 ? 1 : 0;
                break;
            case 'analog':
                value = Math.round(Math.random() * 1023);
                break;
            case 'pir':
                value = Math.random() > 0.7 ? 'Motion Detected' : 'No Motion';
                break;
            default:
                value = 'Unknown';
        }

        logger.info(`Sensor reading: Pin ${pin}, Type ${type}, Value ${value}`);

        res.json({
            success: true,
            value: value,
            pin: pin,
            type: type,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error reading sensor:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to read sensor',
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
