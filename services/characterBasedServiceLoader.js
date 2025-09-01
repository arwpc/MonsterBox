/**
 * Character-Based Service Loader
 * 
 * Loads only the services needed based on each character's defined parts and capabilities.
 * Eliminates service startup errors by only starting services for parts that exist.
 * 
 * Features:
 * - Analyzes character parts from data/parts.json
 * - Only starts services for parts that exist for the current character
 * - Supports webcam, microphone, sensors, actuators, lights, motors, servos
 * - Ensures ElevenLabs API key works for all animatronics
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../scripts/logger');

class CharacterBasedServiceLoader {
    constructor(dynamicCharacterManager = null) {
        this.hostname = os.hostname();
        this.characterId = null;
        this.characterParts = [];
        this.requiredServices = new Set();
        this.availableServices = new Map();
        this.dynamicCharacterManager = dynamicCharacterManager;

        // Define service mappings based on part types
        this.serviceMapping = {
            'webcam': {
                serviceName: 'webcamService',
                required: true,
                script: 'scripts/hardware/webcam_websocket_service.py',
                port: 8774
            },
            'microphone': {
                serviceName: 'microphoneService',
                required: true,
                script: 'scripts/hardware/microphone_websocket_service.py',
                port: 8776
            },
            'sensor': {
                serviceName: 'sensorService',
                required: true,
                script: 'scripts/hardware/sensor_websocket_service.py',
                port: 8773
            },
            'linear-actuator': {
                serviceName: 'actuatorService',
                required: true,
                script: 'scripts/hardware/actuator_websocket_service.py',
                port: 8775
            },
            'light': {
                serviceName: 'lightService',
                required: true,
                script: 'scripts/hardware/light_websocket_service.py',
                port: 8772
            },
            'led': {
                serviceName: 'lightService', // LEDs use same service as lights
                required: true,
                script: 'scripts/hardware/light_websocket_service.py',
                port: 8772
            },
            'motor': {
                serviceName: 'motorService',
                required: true,
                script: 'scripts/hardware/motor_websocket_service.py',
                port: 8771
            },
            'servo': {
                serviceName: 'servoService',
                required: true,
                script: 'scripts/hardware/servo_websocket_service.py',
                port: 8779
            }
        };

        // Always required services (regardless of parts)
        this.alwaysRequiredServices = [
            'elevenLabsConversational',
            'elevenLabsSTT',
            'elevenLabsSSLProxy',
            'sttSSLProxy'
        ];
    }

    /**
     * Initialize the character-based service loader
     */
    async initialize() {
        try {
            logger.info(`🎭 Initializing Character-Based Service Loader for ${this.hostname}`);

            // Use dynamic character manager if available
            if (this.dynamicCharacterManager) {
                const characterConfig = this.dynamicCharacterManager.getCurrentCharacterConfig();
                if (characterConfig) {
                    this.characterId = characterConfig.characterId;
                    this.characterParts = characterConfig.parts;
                    this.requiredServices = new Set(characterConfig.services.required);

                    logger.info(`🎭 Using dynamic character: ${characterConfig.name} (ID: ${this.characterId})`);
                    logger.info(`✅ Character ${this.characterId} requires ${this.requiredServices.size} services`);
                    logger.info(`📋 Required services: ${Array.from(this.requiredServices).join(', ')}`);

                    return {
                        characterId: this.characterId,
                        requiredServices: Array.from(this.requiredServices),
                        characterParts: this.characterParts.length,
                        dynamicLoading: true
                    };
                }
            }

            // Fallback to hostname-based detection
            this.characterId = await this.getCharacterIdFromHostname();

            if (!this.characterId) {
                logger.warn(`⚠️ Could not determine character ID for hostname ${this.hostname}, using default services`);
                return this.getDefaultServices();
            }

            // Load character parts
            this.characterParts = await this.loadCharacterParts(this.characterId);

            // Determine required services based on parts
            this.requiredServices = this.determineRequiredServices();

            logger.info(`✅ Character ${this.characterId} requires ${this.requiredServices.size} services`);
            logger.info(`📋 Required services: ${Array.from(this.requiredServices).join(', ')}`);

            return {
                characterId: this.characterId,
                requiredServices: Array.from(this.requiredServices),
                characterParts: this.characterParts.length,
                dynamicLoading: false
            };

        } catch (error) {
            logger.error('❌ Failed to initialize Character-Based Service Loader:', error);
            throw error;
        }
    }

    /**
     * Get character ID from hostname
     */
    async getCharacterIdFromHostname() {
        try {
            // Load characters.json to map hostnames to character IDs
            const charactersPath = path.join(process.cwd(), 'data', 'characters.json');
            const charactersData = await fs.readFile(charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            // Map hostnames to character IDs
            const hostnameMap = {
                'skulltalker': 4,
                'orlok': 1,
                'coffin': 2,
                'pumpkinhead': 3
            };

            // Try direct hostname mapping first
            if (hostnameMap[this.hostname.toLowerCase()]) {
                return hostnameMap[this.hostname.toLowerCase()];
            }

            // Try to find character by animatronic host configuration
            for (const character of characters) {
                if (character.animatronic &&
                    character.animatronic.rpi_config &&
                    character.animatronic.rpi_config.host) {

                    const host = character.animatronic.rpi_config.host;
                    // Extract hostname from IP or use direct hostname
                    if (host.includes(this.hostname) ||
                        hostnameMap[character.char_name.toLowerCase()] === character.id) {
                        return character.id;
                    }
                }
            }

            // Default fallback
            logger.warn(`⚠️ No character mapping found for hostname ${this.hostname}`);
            return null;

        } catch (error) {
            logger.error('❌ Error determining character ID from hostname:', error);
            return null;
        }
    }

    /**
     * Load character parts from parts.json
     */
    async loadCharacterParts(characterId) {
        try {
            const partsPath = path.join(process.cwd(), 'data', 'parts.json');
            const partsData = await fs.readFile(partsPath, 'utf8');
            const allParts = JSON.parse(partsData);

            // Filter parts for this character
            const characterParts = allParts.filter(part => part.characterId === characterId);

            logger.info(`📋 Character ${characterId} has ${characterParts.length} parts:`);
            characterParts.forEach(part => {
                logger.info(`   - ${part.name} (${part.type})`);
            });

            return characterParts;

        } catch (error) {
            logger.error('❌ Error loading character parts:', error);
            return [];
        }
    }

    /**
     * Determine required services based on character parts
     */
    determineRequiredServices() {
        const services = new Set();

        // Add always required services
        this.alwaysRequiredServices.forEach(service => services.add(service));

        // Add services based on parts
        const partTypes = new Set(this.characterParts.map(part => part.type));

        for (const partType of partTypes) {
            if (this.serviceMapping[partType]) {
                services.add(this.serviceMapping[partType].serviceName);
            }
        }

        return services;
    }

    /**
     * Get default services (fallback when character detection fails)
     */
    getDefaultServices() {
        const defaultServices = new Set(this.alwaysRequiredServices);

        // Add basic hardware services for unknown characters
        defaultServices.add('lightService');
        defaultServices.add('sensorService');

        return {
            characterId: null,
            requiredServices: Array.from(defaultServices),
            characterParts: 0
        };
    }

    /**
     * Check if a service should be started for this character
     */
    shouldStartService(serviceName) {
        return this.requiredServices.has(serviceName);
    }

    /**
     * Get service configuration for a specific service
     */
    getServiceConfig(serviceName) {
        // Find the service mapping
        for (const [partType, config] of Object.entries(this.serviceMapping)) {
            if (config.serviceName === serviceName) {
                return config;
            }
        }

        // Check for always required services
        const alwaysRequiredConfigs = {
            'elevenLabsConversational': {
                serviceName: 'elevenLabsConversational',
                required: true,
                type: 'elevenlabs',
                port: 8771
            },
            'elevenLabsSTT': {
                serviceName: 'elevenLabsSTT',
                required: true,
                type: 'elevenlabs',
                port: 8778
            },
            'elevenLabsSSLProxy': {
                serviceName: 'elevenLabsSSLProxy',
                required: true,
                type: 'proxy',
                port: 8872
            },
            'sttSSLProxy': {
                serviceName: 'sttSSLProxy',
                required: true,
                type: 'proxy',
                port: 8873
            }
        };

        return alwaysRequiredConfigs[serviceName] || null;
    }

    /**
     * Get filtered service list for service manager
     */
    getFilteredServiceList(originalServices) {
        const filteredServices = {};

        for (const [serviceName, config] of Object.entries(originalServices)) {
            if (this.shouldStartService(serviceName)) {
                filteredServices[serviceName] = config;
            } else {
                logger.info(`⏭️ Skipping ${serviceName} - not required for character ${this.characterId}`);
            }
        }

        return filteredServices;
    }

    /**
     * Get character capabilities summary
     */
    getCharacterCapabilities() {
        const capabilities = {
            characterId: this.characterId,
            hostname: this.hostname,
            parts: {},
            services: Array.from(this.requiredServices)
        };

        // Group parts by type
        for (const part of this.characterParts) {
            if (!capabilities.parts[part.type]) {
                capabilities.parts[part.type] = [];
            }
            capabilities.parts[part.type].push({
                id: part.id,
                name: part.name
            });
        }

        return capabilities;
    }

    /**
     * Validate ElevenLabs configuration for this character
     */
    async validateElevenLabsConfig() {
        try {
            // Check if ElevenLabs API key is available
            const apiKey = process.env.ELEVENLABS_API_KEY;
            if (!apiKey) {
                logger.warn('⚠️ ElevenLabs API key not found in environment variables');
                return false;
            }

            // Load character data to check for agent ID
            const charactersPath = path.join(process.cwd(), 'data', 'characters.json');
            const charactersData = await fs.readFile(charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            const character = characters.find(c => c.id === this.characterId);
            if (!character || !character.elevenLabsAgentId) {
                logger.warn(`⚠️ Character ${this.characterId} does not have ElevenLabs agent ID configured`);
                return false;
            }

            logger.info(`✅ ElevenLabs configuration validated for character ${this.characterId} (agent: ${character.elevenLabsAgentId})`);
            return true;

        } catch (error) {
            logger.error('❌ Error validating ElevenLabs configuration:', error);
            return false;
        }
    }
}

module.exports = CharacterBasedServiceLoader;
