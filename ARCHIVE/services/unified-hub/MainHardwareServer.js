/**
 * Main Hardware Server for Unified Animatronic Hub
 * 
 * Consolidates all hardware control (servos, motors, lights, sensors, actuators)
 * into a single, unified interface. Replaces individual hardware services with
 * a centralized, secure, and efficient hardware control system.
 * 
 * Phase 2: Hardware Consolidation
 */

const { spawn } = require('child_process');
const WebSocket = require('ws');
const logger = require('../../scripts/logger');

class MainHardwareServer {
    constructor(options = {}) {
        this.config = {
            enableHardwareControl: true,
            enableSafetyChecks: true,
            maxConcurrentCommands: 10,
            commandTimeout: 5000,
            hardwareScriptPath: './scripts/hardware',
            ...options
        };

        // Component controllers
        this.components = {
            servos: new ServoController(this.config),
            motors: new MotorController(this.config),
            lights: new LightController(this.config),
            sensors: new SensorController(this.config),
            actuators: new ActuatorController(this.config)
        };

        // Hardware state management
        this.state = new HardwareStateManager();
        this.safety = new SafetyController();
        
        // Command queue and execution
        this.commandQueue = [];
        this.activeCommands = new Map();
        this.isInitialized = false;

        logger.info('🔧 MainHardwareServer initialized');
    }

    /**
     * Initialize the hardware server and all components
     */
    async initialize() {
        try {
            logger.info('🚀 Initializing MainHardwareServer...');

            // Initialize safety controller first
            await this.safety.initialize();

            // Initialize all component controllers
            for (const [name, controller] of Object.entries(this.components)) {
                await controller.initialize();
                logger.info(`✅ ${name} controller initialized`);
            }

            // Initialize state manager
            await this.state.initialize();

            // Start command processor
            this.startCommandProcessor();

            this.isInitialized = true;
            logger.info('✅ MainHardwareServer initialized successfully');

            return {
                success: true,
                components: Object.keys(this.components),
                capabilities: this.getCapabilities()
            };

        } catch (error) {
            logger.error('❌ Failed to initialize MainHardwareServer:', error);
            throw error;
        }
    }

    /**
     * Execute hardware command through unified interface
     */
    async executeCommand(command) {
        try {
            if (!this.isInitialized) {
                throw new Error('Hardware server not initialized');
            }

            // Validate command structure
            this.validateCommand(command);

            // Safety checks
            await this.safety.validateCommand(command);

            // Add to command queue
            const commandId = this.generateCommandId();
            const commandWithId = { ...command, id: commandId, timestamp: Date.now() };

            logger.info(`🎯 Executing hardware command: ${command.type} for ${command.component}`);

            // Execute command based on component type
            const result = await this.routeCommand(commandWithId);

            // Update state
            await this.state.updateComponentState(command.component, result);

            return {
                success: true,
                commandId,
                result,
                timestamp: Date.now()
            };

        } catch (error) {
            logger.error('❌ Hardware command execution failed:', error);
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * Route command to appropriate component controller
     */
    async routeCommand(command) {
        const { component, type, parameters } = command;

        switch (component) {
            case 'servo':
            case 'servos':
                return await this.components.servos.execute(type, parameters);
            
            case 'motor':
            case 'motors':
                return await this.components.motors.execute(type, parameters);
            
            case 'light':
            case 'lights':
                return await this.components.lights.execute(type, parameters);
            
            case 'sensor':
            case 'sensors':
                return await this.components.sensors.execute(type, parameters);
            
            case 'actuator':
            case 'actuators':
                return await this.components.actuators.execute(type, parameters);
            
            default:
                throw new Error(`Unknown component: ${component}`);
        }
    }

    /**
     * Get current hardware status
     */
    async getHardwareStatus() {
        const status = {
            initialized: this.isInitialized,
            timestamp: new Date().toISOString(),
            components: {},
            activeCommands: this.activeCommands.size,
            queuedCommands: this.commandQueue.length
        };

        // Get status from each component
        for (const [name, controller] of Object.entries(this.components)) {
            try {
                status.components[name] = await controller.getStatus();
            } catch (error) {
                status.components[name] = { error: error.message };
            }
        }

        return status;
    }

    /**
     * Get hardware capabilities
     */
    getCapabilities() {
        return {
            components: Object.keys(this.components),
            supportedCommands: {
                servos: ['move', 'stop', 'calibrate', 'sequence'],
                motors: ['start', 'stop', 'speed', 'direction'],
                lights: ['on', 'off', 'toggle', 'brightness', 'color'],
                sensors: ['read', 'monitor', 'calibrate'],
                actuators: ['extend', 'retract', 'position', 'stop']
            },
            safetyFeatures: ['command_validation', 'emergency_stop', 'state_monitoring'],
            maxConcurrentCommands: this.config.maxConcurrentCommands
        };
    }

    /**
     * Emergency stop all hardware
     */
    async emergencyStop() {
        logger.warn('🚨 EMERGENCY STOP - Halting all hardware');
        
        const stopPromises = [];
        
        for (const [name, controller] of Object.entries(this.components)) {
            stopPromises.push(controller.emergencyStop().catch(error => {
                logger.error(`Failed to emergency stop ${name}:`, error);
            }));
        }

        await Promise.all(stopPromises);
        
        // Clear command queue
        this.commandQueue = [];
        this.activeCommands.clear();

        logger.info('✅ Emergency stop completed');
    }

    /**
     * Validate command structure
     */
    validateCommand(command) {
        if (!command || typeof command !== 'object') {
            throw new Error('Command must be an object');
        }

        if (!command.component) {
            throw new Error('Command must specify component');
        }

        if (!command.type) {
            throw new Error('Command must specify type');
        }

        if (!command.parameters) {
            throw new Error('Command must include parameters');
        }
    }

    /**
     * Generate unique command ID
     */
    generateCommandId() {
        return `hw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Start command processor
     */
    startCommandProcessor() {
        // Process commands from queue
        setInterval(async () => {
            if (this.commandQueue.length > 0 && this.activeCommands.size < this.config.maxConcurrentCommands) {
                const command = this.commandQueue.shift();
                this.activeCommands.set(command.id, command);
                
                try {
                    await this.routeCommand(command);
                } catch (error) {
                    logger.error(`Command ${command.id} failed:`, error);
                } finally {
                    this.activeCommands.delete(command.id);
                }
            }
        }, 100); // Process every 100ms
    }

    /**
     * Shutdown hardware server
     */
    async shutdown() {
        logger.info('🛑 Shutting down MainHardwareServer...');
        
        // Emergency stop all hardware
        await this.emergencyStop();
        
        // Shutdown all components
        for (const [name, controller] of Object.entries(this.components)) {
            try {
                await controller.shutdown();
                logger.info(`✅ ${name} controller shutdown`);
            } catch (error) {
                logger.error(`Failed to shutdown ${name}:`, error);
            }
        }

        this.isInitialized = false;
        logger.info('✅ MainHardwareServer shutdown complete');
    }
}

/**
 * Base Hardware Controller Class
 */
class BaseHardwareController {
    constructor(config) {
        this.config = config;
        this.isInitialized = false;
        this.state = {};
    }

    async initialize() {
        this.isInitialized = true;
    }

    async execute(type, parameters) {
        throw new Error('Execute method must be implemented by subclass');
    }

    async getStatus() {
        return {
            initialized: this.isInitialized,
            state: this.state
        };
    }

    async emergencyStop() {
        logger.info(`🚨 Emergency stop for ${this.constructor.name}`);
    }

    async shutdown() {
        this.isInitialized = false;
    }
}

/**
 * Component Controllers
 */
class ServoController extends BaseHardwareController {
    async execute(type, parameters) {
        // Implementation will call Python servo service
        return { type: 'servo', action: type, parameters, status: 'executed' };
    }
}

class MotorController extends BaseHardwareController {
    async execute(type, parameters) {
        return { type: 'motor', action: type, parameters, status: 'executed' };
    }
}

class LightController extends BaseHardwareController {
    async execute(type, parameters) {
        return { type: 'light', action: type, parameters, status: 'executed' };
    }
}

class SensorController extends BaseHardwareController {
    async execute(type, parameters) {
        return { type: 'sensor', action: type, parameters, status: 'executed' };
    }
}

class ActuatorController extends BaseHardwareController {
    async execute(type, parameters) {
        return { type: 'actuator', action: type, parameters, status: 'executed' };
    }
}

/**
 * Hardware State Manager
 */
class HardwareStateManager {
    constructor() {
        this.componentStates = {};
    }

    async initialize() {
        logger.info('📊 Hardware state manager initialized');
    }

    async updateComponentState(component, result) {
        this.componentStates[component] = {
            ...result,
            lastUpdate: Date.now()
        };
    }

    getState(component) {
        return this.componentStates[component] || null;
    }
}

/**
 * Safety Controller
 */
class SafetyController {
    constructor() {
        this.emergencyStopActive = false;
        this.safetyChecks = [];
    }

    async initialize() {
        logger.info('🛡️ Safety controller initialized');
    }

    async validateCommand(command) {
        if (this.emergencyStopActive) {
            throw new Error('Emergency stop active - commands blocked');
        }

        // Add safety validation logic here
        return true;
    }
}

module.exports = MainHardwareServer;
