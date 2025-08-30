/**
 * ElevenLabs Configuration Manager
 * 
 * Ensures ElevenLabs API key and configuration is properly distributed
 * and accessible across all animatronics in the network.
 * 
 * Features:
 * - Validates API key availability
 * - Distributes configuration to remote animatronics
 * - Manages character-specific agent mappings
 * - Provides fallback configuration options
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const logger = require('../scripts/logger');

class ElevenLabsConfigManager {
    constructor() {
        this.hostname = os.hostname();
        this.apiKey = null;
        this.characterAgentMap = new Map();
        this.configPath = path.join(process.cwd(), 'data', 'elevenlabs-config.json');
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
    }

    /**
     * Initialize ElevenLabs configuration
     */
    async initialize() {
        try {
            logger.info('🤖 Initializing ElevenLabs Configuration Manager...');

            // Load API key from environment or config file
            await this.loadApiKey();

            // Load character-agent mappings
            await this.loadCharacterAgentMappings();

            // Validate configuration
            const isValid = await this.validateConfiguration();

            if (isValid) {
                logger.info('✅ ElevenLabs configuration initialized successfully');
                logger.info(`🔑 API key loaded (length: ${this.apiKey ? this.apiKey.length : 0})`);
                logger.info(`🎭 Character agents mapped: ${this.characterAgentMap.size}`);
            } else {
                logger.warn('⚠️ ElevenLabs configuration has issues - some features may not work');
            }

            return {
                success: isValid,
                apiKeyAvailable: !!this.apiKey,
                characterAgents: this.characterAgentMap.size,
                hostname: this.hostname
            };

        } catch (error) {
            logger.error('❌ Failed to initialize ElevenLabs Configuration Manager:', error);
            throw error;
        }
    }

    /**
     * Load API key from environment variables or config file
     */
    async loadApiKey() {
        try {
            // Try environment variable first
            this.apiKey = process.env.ELEVENLABS_API_KEY;

            if (this.apiKey) {
                logger.info('🔑 ElevenLabs API key loaded from environment variable');
                return;
            }

            // Try loading from config file
            try {
                const configData = await fs.readFile(this.configPath, 'utf8');
                const config = JSON.parse(configData);
                
                if (config.apiKey) {
                    this.apiKey = config.apiKey;
                    logger.info('🔑 ElevenLabs API key loaded from config file');
                    return;
                }
            } catch (fileError) {
                // Config file doesn't exist or is invalid - this is okay
            }

            // Try loading from .env file
            try {
                const envPath = path.join(process.cwd(), '.env');
                const envData = await fs.readFile(envPath, 'utf8');
                const envLines = envData.split('\n');
                
                for (const line of envLines) {
                    if (line.startsWith('ELEVENLABS_API_KEY=')) {
                        this.apiKey = line.split('=')[1].trim().replace(/['"]/g, '');
                        logger.info('🔑 ElevenLabs API key loaded from .env file');
                        return;
                    }
                }
            } catch (envError) {
                // .env file doesn't exist - this is okay
            }

            logger.warn('⚠️ ElevenLabs API key not found in environment, config, or .env file');

        } catch (error) {
            logger.error('❌ Error loading ElevenLabs API key:', error);
        }
    }

    /**
     * Load character-agent mappings from characters.json
     */
    async loadCharacterAgentMappings() {
        try {
            const charactersData = await fs.readFile(this.charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            this.characterAgentMap.clear();

            for (const character of characters) {
                if (character.elevenLabsAgentId) {
                    this.characterAgentMap.set(character.id, {
                        characterId: character.id,
                        characterName: character.char_name,
                        agentId: character.elevenLabsAgentId,
                        hostname: this.getHostnameForCharacter(character)
                    });
                }
            }

            logger.info(`🎭 Loaded ${this.characterAgentMap.size} character-agent mappings`);

        } catch (error) {
            logger.error('❌ Error loading character-agent mappings:', error);
        }
    }

    /**
     * Get hostname for a character based on animatronic configuration
     */
    getHostnameForCharacter(character) {
        if (character.animatronic && character.animatronic.rpi_config && character.animatronic.rpi_config.host) {
            const host = character.animatronic.rpi_config.host;
            
            // Map IP addresses to hostnames
            const ipToHostname = {
                '192.168.8.150': 'pumpkinhead',
                '192.168.8.140': 'coffin',
                '192.168.8.120': 'orlok',
                'localhost': 'skulltalker',
                '127.0.0.1': 'skulltalker'
            };

            return ipToHostname[host] || host;
        }

        // Fallback hostname mapping
        const nameToHostname = {
            'Orlok': 'orlok',
            'Coffin Breaker': 'coffin',
            'PumpkinHead': 'pumpkinhead',
            'Skulltalker': 'skulltalker'
        };

        return nameToHostname[character.char_name] || 'unknown';
    }

    /**
     * Validate ElevenLabs configuration
     */
    async validateConfiguration() {
        let isValid = true;
        const issues = [];

        // Check API key
        if (!this.apiKey) {
            issues.push('API key not available');
            isValid = false;
        } else if (this.apiKey.length < 20) {
            issues.push('API key appears to be invalid (too short)');
            isValid = false;
        }

        // Check character mappings
        if (this.characterAgentMap.size === 0) {
            issues.push('No character-agent mappings found');
            isValid = false;
        }

        // Check if current hostname has a character mapping
        const currentCharacterAgent = this.getAgentForHostname(this.hostname);
        if (!currentCharacterAgent) {
            issues.push(`No agent mapping found for hostname ${this.hostname}`);
            // Don't mark as invalid - this might be intentional
        }

        if (issues.length > 0) {
            logger.warn('⚠️ ElevenLabs configuration issues:');
            issues.forEach(issue => logger.warn(`   - ${issue}`));
        }

        return isValid;
    }

    /**
     * Get agent configuration for current hostname
     */
    getAgentForHostname(hostname = null) {
        const targetHostname = hostname || this.hostname;
        
        for (const [characterId, agentInfo] of this.characterAgentMap) {
            if (agentInfo.hostname === targetHostname) {
                return agentInfo;
            }
        }

        return null;
    }

    /**
     * Get all character-agent mappings
     */
    getAllCharacterAgents() {
        const agents = {};
        
        for (const [characterId, agentInfo] of this.characterAgentMap) {
            agents[characterId] = agentInfo.agentId;
        }

        return agents;
    }

    /**
     * Save configuration to file
     */
    async saveConfiguration() {
        try {
            const config = {
                apiKey: this.apiKey,
                characterAgents: Object.fromEntries(this.characterAgentMap),
                lastUpdated: new Date().toISOString(),
                hostname: this.hostname
            };

            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            logger.info('✅ ElevenLabs configuration saved to file');

        } catch (error) {
            logger.error('❌ Error saving ElevenLabs configuration:', error);
        }
    }

    /**
     * Set API key and save configuration
     */
    async setApiKey(apiKey) {
        this.apiKey = apiKey;
        await this.saveConfiguration();
        logger.info('✅ ElevenLabs API key updated');
    }

    /**
     * Get configuration for ElevenLabs services
     */
    getServiceConfiguration() {
        const currentAgent = this.getAgentForHostname();
        
        return {
            apiKey: this.apiKey,
            currentCharacter: currentAgent,
            allAgents: this.getAllCharacterAgents(),
            hostname: this.hostname,
            configValid: !!this.apiKey && this.characterAgentMap.size > 0
        };
    }

    /**
     * Check if ElevenLabs services should be enabled
     */
    shouldEnableElevenLabsServices() {
        return !!this.apiKey && this.characterAgentMap.size > 0;
    }

    /**
     * Get status information
     */
    getStatus() {
        return {
            apiKeyAvailable: !!this.apiKey,
            apiKeyLength: this.apiKey ? this.apiKey.length : 0,
            characterAgents: this.characterAgentMap.size,
            currentHostname: this.hostname,
            currentAgent: this.getAgentForHostname(),
            configValid: this.shouldEnableElevenLabsServices()
        };
    }
}

module.exports = ElevenLabsConfigManager;
