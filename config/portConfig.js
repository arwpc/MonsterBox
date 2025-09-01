/**
 * MonsterBox Port Configuration Management
 * 
 * Centralized configuration for port ranges, service priorities,
 * and environment-specific settings
 */

require('dotenv').config();

/**
 * Port configuration based on environment
 */
const portConfig = {
    // Environment-specific configurations
    environments: {
        development: {
            ranges: {
                main: { start: 80, end: 81 },
                websocket: { start: 8000, end: 8199 },
                proxy: { start: 8200, end: 8399 },
                hardware: { start: 8400, end: 8599 },
                elevenlabs: { start: 8600, end: 8699 },
                testing: { start: 8700, end: 8799 },
                reserved: { start: 8800, end: 8999 }
            },
            reserved: [22, 443, 5432, 6379, 27017],
            healthCheck: {
                interval: 30000,
                timeout: 5000,
                retries: 3
            }
        },

        production: {
            ranges: {
                main: { start: 80, end: 81 },
                websocket: { start: 8000, end: 8299 },
                proxy: { start: 8300, end: 8599 },
                hardware: { start: 8600, end: 8799 },
                elevenlabs: { start: 8800, end: 8899 },
                testing: { start: 8900, end: 8999 },
                reserved: { start: 9000, end: 9999 }
            },
            reserved: [22, 443, 5432, 6379, 27017, 8080, 8443],
            healthCheck: {
                interval: 60000,
                timeout: 10000,
                retries: 5
            }
        },

        test: {
            ranges: {
                main: { start: 3100, end: 3199 },
                websocket: { start: 9000, end: 9199 },
                proxy: { start: 9200, end: 9399 },
                hardware: { start: 9400, end: 9599 },
                elevenlabs: { start: 9600, end: 9699 },
                testing: { start: 9700, end: 9799 },
                reserved: { start: 9800, end: 9999 }
            },
            reserved: [22, 443],
            healthCheck: {
                interval: 10000,
                timeout: 2000,
                retries: 2
            }
        }
    },

    // Service type priorities (higher = more important)
    priorities: {
        main: 100,
        hardware: 90,
        websocket: 80,
        elevenlabs: 70,
        proxy: 60,
        testing: 50
    },

    // Service type definitions
    serviceTypes: {
        main: {
            description: 'Main application servers',
            requiresProxy: false,
            autoRestart: true,
            critical: true
        },
        websocket: {
            description: 'Direct WebSocket services',
            requiresProxy: true,
            autoRestart: true,
            critical: true
        },
        proxy: {
            description: 'Browser-compatible proxy services',
            requiresProxy: false,
            autoRestart: true,
            critical: false
        },
        hardware: {
            description: 'Hardware control services',
            requiresProxy: true,
            autoRestart: true,
            critical: true
        },
        elevenlabs: {
            description: 'ElevenLabs Conversational AI services',
            requiresProxy: true,
            autoRestart: true,
            critical: false
        },
        testing: {
            description: 'Testing and development services',
            requiresProxy: false,
            autoRestart: false,
            critical: false
        }
    },

    // Default service configurations
    serviceDefaults: {
        microphone: {
            type: 'hardware',
            tags: ['audio', 'input', 'hardware'],
            dependencies: [],
            script: 'scripts/hardware/microphone_websocket_service.py',
            metadata: {
                description: 'Microphone WebSocket Service',
                protocol: 'websocket'
            }
        },
        audioStream: {
            type: 'websocket',
            tags: ['audio', 'stream', 'output'],
            dependencies: [],
            script: null, // No script - handled by main app
            metadata: {
                description: 'Audio Stream Service (Built-in)',
                protocol: 'websocket'
            }
        },
        elevenLabsConversational: {
            type: 'elevenlabs',
            tags: ['ai', 'conversation', 'elevenlabs'],
            dependencies: ['audioStream'],
            script: null, // No script - handled by main app
            metadata: {
                description: 'ElevenLabs Conversational AI Service (Built-in)',
                protocol: 'websocket'
            }
        },
        hardwareRegistry: {
            type: 'hardware',
            tags: ['registry', 'hardware', 'core'],
            dependencies: [],
            script: null, // No script - handled by unified hub
            metadata: {
                description: 'Hardware Registry Service (Unified Hub)',
                protocol: 'websocket'
            }
        },
        motorService: {
            type: 'hardware',
            tags: ['motor', 'hardware', 'control'],
            dependencies: ['hardwareRegistry'],
            script: null, // No script - handled by unified hub
            metadata: {
                description: 'Motor Control Service (Unified Hub)',
                protocol: 'websocket'
            }
        },
        lightService: {
            type: 'hardware',
            tags: ['light', 'hardware', 'control'],
            dependencies: ['hardwareRegistry'],
            script: null, // No script - handled by unified hub
            metadata: {
                description: 'Light Control Service (Unified Hub)',
                protocol: 'websocket'
            }
        },
        sensorService: {
            type: 'hardware',
            tags: ['sensor', 'hardware', 'input'],
            dependencies: ['hardwareRegistry'],
            script: null, // No script - handled by unified hub
            metadata: {
                description: 'Sensor Service (Unified Hub)',
                protocol: 'websocket'
            }
        },
        webcamService: {
            type: 'hardware',
            tags: ['webcam', 'hardware', 'video'],
            dependencies: ['hardwareRegistry'],
            script: 'scripts/hardware/webcam_service.py',
            metadata: {
                description: 'Webcam Streaming Service',
                protocol: 'websocket'
            }
        },
        actuatorService: {
            type: 'hardware',
            tags: ['actuator', 'hardware', 'control'],
            dependencies: ['hardwareRegistry'],
            script: null, // No script - handled by unified hub
            metadata: {
                description: 'Linear Actuator Service (Unified Hub)',
                protocol: 'websocket'
            }
        },
        servoService: {
            type: 'hardware',
            tags: ['servo', 'hardware', 'control'],
            dependencies: ['hardwareRegistry'],
            script: 'scripts/hardware/servo_websocket_service.py',
            metadata: {
                description: 'Servo Control and Jaw Animation Service',
                protocol: 'websocket'
            }
        },
        headTrackingService: {
            type: 'hardware',
            tags: ['tracking', 'hardware', 'ai'],
            dependencies: ['webcamService'],
            script: 'scripts/hardware/head_tracking_service.py',
            metadata: {
                description: 'Head Tracking Service',
                protocol: 'websocket'
            }
        }
    }
};

/**
 * Get configuration for current environment
 */
function getEnvironmentConfig() {
    const env = process.env.NODE_ENV || 'development';
    const config = portConfig.environments[env];

    if (!config) {
        throw new Error(`Unknown environment: ${env}`);
    }

    return {
        ...config,
        environment: env,
        priorities: portConfig.priorities,
        serviceTypes: portConfig.serviceTypes,
        serviceDefaults: portConfig.serviceDefaults
    };
}

/**
 * Get service configuration by name
 */
function getServiceConfig(serviceName) {
    const defaults = portConfig.serviceDefaults[serviceName];
    if (!defaults) {
        return null;
    }

    const envConfig = getEnvironmentConfig();
    const serviceType = envConfig.serviceTypes[defaults.type];

    return {
        name: serviceName,
        ...defaults,
        ...serviceType,
        priority: envConfig.priorities[defaults.type] || 50
    };
}

/**
 * Get all service configurations
 */
function getAllServiceConfigs() {
    const configs = {};

    for (const serviceName of Object.keys(portConfig.serviceDefaults)) {
        configs[serviceName] = getServiceConfig(serviceName);
    }

    return configs;
}

/**
 * Validate port configuration
 */
function validateConfig() {
    const envConfig = getEnvironmentConfig();
    const errors = [];

    // Check for overlapping ranges
    const ranges = Object.entries(envConfig.ranges);
    for (let i = 0; i < ranges.length; i++) {
        for (let j = i + 1; j < ranges.length; j++) {
            const [name1, range1] = ranges[i];
            const [name2, range2] = ranges[j];

            if (range1.start <= range2.end && range2.start <= range1.end) {
                errors.push(`Port ranges overlap: ${name1} (${range1.start}-${range1.end}) and ${name2} (${range2.start}-${range2.end})`);
            }
        }
    }

    // Check for reserved ports in ranges
    for (const [rangeName, range] of ranges) {
        for (const reservedPort of envConfig.reserved) {
            if (reservedPort >= range.start && reservedPort <= range.end) {
                errors.push(`Reserved port ${reservedPort} is within range ${rangeName} (${range.start}-${range.end})`);
            }
        }
    }

    // Check service dependencies
    const serviceNames = Object.keys(portConfig.serviceDefaults);
    for (const [serviceName, config] of Object.entries(portConfig.serviceDefaults)) {
        for (const dependency of config.dependencies) {
            if (!serviceNames.includes(dependency)) {
                errors.push(`Service ${serviceName} has unknown dependency: ${dependency}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Get port range for service type
 */
function getPortRange(serviceType) {
    const envConfig = getEnvironmentConfig();
    return envConfig.ranges[serviceType] || null;
}

/**
 * Check if port is reserved
 */
function isPortReserved(port) {
    const envConfig = getEnvironmentConfig();
    return envConfig.reserved.includes(port);
}

/**
 * Get service priority
 */
function getServicePriority(serviceType) {
    return portConfig.priorities[serviceType] || 50;
}

module.exports = {
    portConfig,
    getEnvironmentConfig,
    getServiceConfig,
    getAllServiceConfigs,
    validateConfig,
    getPortRange,
    isPortReserved,
    getServicePriority
};
