/**
 * Dynamic Character Manager
 * 
 * Enables dynamic character loading via command line arguments.
 * Supports hot reloading of capabilities and persistent character memory.
 * 
 * Usage:
 * - npm start orlok          # Load Orlok character
 * - npm start pumpkinhead    # Load PumpkinHead character
 * - npm start               # Load last used character
 * - npm start --reload      # Hot reload current character
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../scripts/logger');

class DynamicCharacterManager {
    constructor() {
        this.currentCharacter = null;
        this.currentCharacterConfig = null;
        this.lastUsedPath = path.join(process.cwd(), 'data', 'last-used-character.json');
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.partsPath = path.join(process.cwd(), 'data', 'parts.json');
        this.hostname = os.hostname();
        this.serviceWatchers = new Map();
        this.capabilityChangeCallbacks = [];
    }

    /**
     * Initialize dynamic character management from command line arguments
     */
    async initialize() {
        try {
            // Parse command line arguments first (before logging)
            const args = process.argv.slice(2);
            const characterArg = this.parseCharacterArgument(args);

            logger.info('🎭 Initializing Dynamic Character Manager...');

            // Determine which character to load
            const characterToLoad = await this.determineCharacterToLoad(characterArg);

            if (!characterToLoad) {
                throw new Error('No character specified and no last used character found');
            }

            // Load the character
            await this.loadCharacter(characterToLoad);

            // Set up capability watching
            await this.setupCapabilityWatching();

            logger.info(`✅ Dynamic Character Manager initialized for ${this.currentCharacter.name}`);

            return {
                success: true,
                character: this.currentCharacter,
                config: this.currentCharacterConfig,
                capabilities: this.getCharacterCapabilities()
            };

        } catch (error) {
            logger.error('❌ Failed to initialize Dynamic Character Manager:', error);
            throw error;
        }
    }

    /**
     * Parse character argument from command line
     */
    parseCharacterArgument(args) {
        // Handle special flags
        if (args.includes('--list')) {
            this.listAvailableCharacters();
            process.exit(0);
        }

        if (args.includes('--status')) {
            this.showCurrentStatus();
            process.exit(0);
        }

        if (args.includes('--reload')) {
            return { action: 'reload' };
        }

        // Find character name argument
        const characterNames = ['orlok', 'pumpkinhead', 'coffin', 'skulltalker'];
        const specifiedCharacter = args.find(arg => 
            characterNames.includes(arg.toLowerCase()) || 
            characterNames.some(name => name.includes(arg.toLowerCase()))
        );

        if (specifiedCharacter) {
            return { character: specifiedCharacter.toLowerCase() };
        }

        return null;
    }

    /**
     * Determine which character to load based on arguments and history
     */
    async determineCharacterToLoad(characterArg) {
        if (characterArg?.action === 'reload') {
            // Reload current character
            const lastUsed = await this.getLastUsedCharacter();
            if (lastUsed) {
                logger.info(`🔄 Reloading character: ${lastUsed.name}`);
                return lastUsed.name.toLowerCase();
            }
            throw new Error('No current character to reload');
        }

        if (characterArg?.character) {
            // Use specified character
            logger.info(`🎭 Loading specified character: ${characterArg.character}`);
            return characterArg.character;
        }

        // Use last used character for this RPi4b
        const lastUsed = await this.getLastUsedCharacter();
        if (lastUsed) {
            logger.info(`📚 Loading last used character: ${lastUsed.name}`);
            return lastUsed.name.toLowerCase();
        }

        // Fallback to hostname-based detection
        const hostnameCharacter = this.getCharacterFromHostname();
        if (hostnameCharacter) {
            logger.info(`🏠 Loading character based on hostname: ${hostnameCharacter}`);
            return hostnameCharacter;
        }

        return null;
    }

    /**
     * Load a character and configure the system
     */
    async loadCharacter(characterName) {
        try {
            logger.info(`🎭 Loading character: ${characterName}`);

            // Load character data
            const charactersData = await fs.readFile(this.charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            // Find character by name
            const character = characters.find(c => 
                c.char_name.toLowerCase().includes(characterName) ||
                characterName.includes(c.char_name.toLowerCase())
            );

            if (!character) {
                throw new Error(`Character '${characterName}' not found`);
            }

            this.currentCharacter = character;

            // Load character configuration
            this.currentCharacterConfig = await this.buildCharacterConfig(character);

            // Configure network settings
            await this.configureNetworkSettings();

            // Save as last used character
            await this.saveLastUsedCharacter();

            logger.info(`✅ Character ${character.char_name} loaded successfully`);
            logger.info(`🌐 Network: ${this.currentCharacterConfig.network.domain}`);
            logger.info(`🔧 Capabilities: ${this.currentCharacterConfig.capabilities.length}`);

        } catch (error) {
            logger.error(`❌ Failed to load character ${characterName}:`, error);
            throw error;
        }
    }

    /**
     * Build comprehensive character configuration
     */
    async buildCharacterConfig(character) {
        // Load character parts
        const partsData = await fs.readFile(this.partsPath, 'utf8');
        const allParts = JSON.parse(partsData);
        const characterParts = allParts.filter(part => part.characterId === character.id);

        // Extract capabilities from parts
        const capabilities = [...new Set(characterParts.map(part => part.type))];

        // Determine network configuration
        const networkConfig = this.determineNetworkConfig(character);

        // Determine required services
        const services = this.determineRequiredServices(capabilities);

        return {
            characterId: character.id,
            name: character.char_name,
            hostname: networkConfig.hostname,
            network: networkConfig,
            capabilities: capabilities,
            parts: characterParts,
            services: services,
            elevenLabsAgent: character.elevenLabsAgentId,
            lastLoaded: new Date().toISOString()
        };
    }

    /**
     * Determine network configuration for character
     */
    determineNetworkConfig(character) {
        // Use rpi_config.host if available, otherwise use defaults
        const hostname = character.char_name.toLowerCase().replace(/\s+/g, '');
        const preferredIP = character.animatronic?.rpi_config?.host || '192.168.8.100';
        const domain = `${hostname}.monsterbox.local`;

        return {
            hostname,
            preferredIP,
            domain,
            ports: {
                http: 3000,
                https: 8080
            }
        };
    }

    /**
     * Determine required services based on capabilities
     */
    determineRequiredServices(capabilities) {
        const serviceMapping = {
            'sensor': ['sensorService'],
            'servo': ['servoService'],
            'motor': ['motorService'],
            'light': ['lightService'],
            'led': ['lightService'],
            'linear-actuator': ['actuatorService'],
            'webcam': ['webcamService'],
            'microphone': ['microphoneService']
        };

        const requiredServices = new Set([
            'elevenLabsConversational',
            'elevenLabsSTT',
            'elevenLabsSSLProxy',
            'sttSSLProxy'
        ]);

        capabilities.forEach(capability => {
            const services = serviceMapping[capability] || [];
            services.forEach(service => requiredServices.add(service));
        });

        return {
            required: Array.from(requiredServices),
            optional: [],
            autoReload: true
        };
    }

    /**
     * Configure network settings for the character
     */
    async configureNetworkSettings() {
        // This would configure hostname, IP, etc.
        // For now, just log the intended configuration
        logger.info(`🌐 Network configuration for ${this.currentCharacter.char_name}:`);
        logger.info(`   Hostname: ${this.currentCharacterConfig.network.hostname}`);
        logger.info(`   Domain: ${this.currentCharacterConfig.network.domain}`);
        logger.info(`   Preferred IP: ${this.currentCharacterConfig.network.preferredIP}`);
    }

    /**
     * Set up capability watching for hot reloading
     */
    async setupCapabilityWatching() {
        try {
            // Watch characters.json for changes
            const charactersWatcher = fs.watch(this.charactersPath, (eventType) => {
                if (eventType === 'change') {
                    logger.info('📁 Characters configuration changed, checking for updates...');
                    this.handleCapabilityChange('characters');
                }
            });

            // Watch parts.json for changes
            const partsWatcher = fs.watch(this.partsPath, (eventType) => {
                if (eventType === 'change') {
                    logger.info('🔧 Parts configuration changed, checking for updates...');
                    this.handleCapabilityChange('parts');
                }
            });

            this.serviceWatchers.set('characters', charactersWatcher);
            this.serviceWatchers.set('parts', partsWatcher);

            logger.info('👁️ Capability watching enabled for hot reloading');

        } catch (error) {
            logger.warn('⚠️ Could not set up capability watching:', error);
        }
    }

    /**
     * Handle capability changes for hot reloading
     */
    async handleCapabilityChange(source) {
        try {
            logger.info(`🔄 Processing capability change from ${source}...`);

            // Reload character configuration
            const updatedConfig = await this.buildCharacterConfig(this.currentCharacter);

            // Compare with current configuration
            const changes = this.detectConfigurationChanges(this.currentCharacterConfig, updatedConfig);

            if (changes.length > 0) {
                logger.info(`🔄 Detected ${changes.length} capability changes:`);
                changes.forEach(change => logger.info(`   - ${change}`));

                // Update current configuration
                this.currentCharacterConfig = updatedConfig;

                // Notify callbacks about changes
                this.capabilityChangeCallbacks.forEach(callback => {
                    try {
                        callback(changes, updatedConfig);
                    } catch (error) {
                        logger.error('❌ Error in capability change callback:', error);
                    }
                });

                logger.info('✅ Capability changes processed successfully');
            }

        } catch (error) {
            logger.error('❌ Error handling capability change:', error);
        }
    }

    /**
     * Detect configuration changes
     */
    detectConfigurationChanges(oldConfig, newConfig) {
        const changes = [];

        // Check capabilities changes
        const oldCapabilities = new Set(oldConfig.capabilities);
        const newCapabilities = new Set(newConfig.capabilities);

        newCapabilities.forEach(cap => {
            if (!oldCapabilities.has(cap)) {
                changes.push(`Added capability: ${cap}`);
            }
        });

        oldCapabilities.forEach(cap => {
            if (!newCapabilities.has(cap)) {
                changes.push(`Removed capability: ${cap}`);
            }
        });

        // Check services changes
        const oldServices = new Set(oldConfig.services.required);
        const newServices = new Set(newConfig.services.required);

        newServices.forEach(service => {
            if (!oldServices.has(service)) {
                changes.push(`Added service: ${service}`);
            }
        });

        oldServices.forEach(service => {
            if (!newServices.has(service)) {
                changes.push(`Removed service: ${service}`);
            }
        });

        return changes;
    }

    /**
     * Register callback for capability changes
     */
    onCapabilityChange(callback) {
        this.capabilityChangeCallbacks.push(callback);
    }

    /**
     * Get last used character for this RPi4b
     */
    async getLastUsedCharacter() {
        try {
            const data = await fs.readFile(this.lastUsedPath, 'utf8');
            const lastUsedData = JSON.parse(data);
            
            // Check if there's a record for this hostname
            if (lastUsedData[this.hostname]) {
                return lastUsedData[this.hostname];
            }

            return null;
        } catch (error) {
            // File doesn't exist or is invalid
            return null;
        }
    }

    /**
     * Save current character as last used for this RPi4b
     */
    async saveLastUsedCharacter() {
        try {
            let lastUsedData = {};

            // Load existing data
            try {
                const data = await fs.readFile(this.lastUsedPath, 'utf8');
                lastUsedData = JSON.parse(data);
            } catch (error) {
                // File doesn't exist, start with empty object
            }

            // Update data for this hostname
            lastUsedData[this.hostname] = {
                characterId: this.currentCharacter.id,
                name: this.currentCharacter.char_name,
                loadedAt: new Date().toISOString()
            };

            // Save updated data
            await fs.writeFile(this.lastUsedPath, JSON.stringify(lastUsedData, null, 2));

        } catch (error) {
            logger.warn('⚠️ Could not save last used character:', error);
        }
    }

    /**
     * Get character from hostname (fallback)
     */
    getCharacterFromHostname() {
        const hostnameMap = {
            'skulltalker': 'skulltalker',
            'orlok': 'orlok',
            'coffin': 'coffin',
            'pumpkinhead': 'pumpkinhead'
        };

        return hostnameMap[this.hostname.toLowerCase()];
    }

    /**
     * Get current character capabilities
     */
    getCharacterCapabilities() {
        if (!this.currentCharacterConfig) return null;

        return {
            characterId: this.currentCharacterConfig.characterId,
            name: this.currentCharacterConfig.name,
            capabilities: this.currentCharacterConfig.capabilities,
            services: this.currentCharacterConfig.services.required,
            parts: this.currentCharacterConfig.parts.length,
            network: this.currentCharacterConfig.network
        };
    }

    /**
     * List available characters
     */
    async listAvailableCharacters() {
        try {
            const charactersData = await fs.readFile(this.charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            console.log('\n🎭 Available Characters:');
            characters.forEach(character => {
                console.log(`   - ${character.char_name.toLowerCase().replace(/\s+/g, '')} (${character.char_name})`);
            });
            console.log('\nUsage: npm start <character-name>');
            console.log('Example: npm start orlok\n');

        } catch (error) {
            console.error('❌ Error listing characters:', error);
        }
    }

    /**
     * Show current status
     */
    async showCurrentStatus() {
        const lastUsed = await this.getLastUsedCharacter();
        
        console.log('\n📊 Current Status:');
        console.log(`   Hostname: ${this.hostname}`);
        
        if (lastUsed) {
            console.log(`   Last Character: ${lastUsed.name}`);
            console.log(`   Loaded At: ${lastUsed.loadedAt}`);
        } else {
            console.log('   Last Character: None');
        }
        console.log();
    }

    /**
     * Cleanup watchers
     */
    async cleanup() {
        for (const [name, watcher] of this.serviceWatchers) {
            try {
                watcher.close();
                logger.info(`👁️ Stopped watching ${name}`);
            } catch (error) {
                logger.warn(`⚠️ Error stopping ${name} watcher:`, error);
            }
        }
        this.serviceWatchers.clear();
    }

    /**
     * Get current character configuration
     */
    getCurrentCharacterConfig() {
        return this.currentCharacterConfig;
    }

    /**
     * Get current character
     */
    getCurrentCharacter() {
        return this.currentCharacter;
    }
}

module.exports = DynamicCharacterManager;
