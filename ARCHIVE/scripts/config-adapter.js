#!/usr/bin/env node

/**
 * MonsterBox Configuration Adapter
 * 
 * Provides unified access to character and system configuration data.
 * Adapts the new unified character-based configuration to work with
 * existing MCP log collection and SSH testing scripts.
 */

const fs = require('fs').promises;
const path = require('path');

class ConfigAdapter {
    constructor() {
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.rpiConfigPath = path.join(process.cwd(), 'data', 'rpi-config.json');
        this.animatronicsPath = path.join(process.cwd(), 'data', 'animatronics.json');
        this.characters = null;
        this.rpiConfig = null;
        this.animatronicsConfig = null;
    }

    async loadCharacters() {
        if (!this.characters) {
            try {
                const data = await fs.readFile(this.charactersPath, 'utf8');
                this.characters = JSON.parse(data);
            } catch (error) {
                throw new Error(`Failed to load characters configuration: ${error.message}`);
            }
        }
        return this.characters;
    }

    async loadRpiConfig() {
        if (!this.rpiConfig) {
            try {
                const data = await fs.readFile(this.rpiConfigPath, 'utf8');
                this.rpiConfig = JSON.parse(data);
            } catch (error) {
                throw new Error(`Failed to load RPI configuration: ${error.message}`);
            }
        }
        return this.rpiConfig;
    }

    async loadAnimatronicsConfig() {
        if (!this.animatronicsConfig) {
            try {
                const data = await fs.readFile(this.animatronicsPath, 'utf8');
                this.animatronicsConfig = JSON.parse(data);
            } catch (error) {
                throw new Error(`Failed to load animatronics configuration: ${error.message}`);
            }
        }
        return this.animatronicsConfig;
    }

    /**
     * Get animatronics configuration in the legacy format for backward compatibility
     */
    async getAnimatronicsConfig() {
        const characters = await this.loadCharacters();
        
        const animatronics = {};
        
        characters.forEach(character => {
            if (character.animatronic && character.animatronic.rpi_config) {
                const key = character.char_name.toLowerCase().replace(/\s+/g, '');
                animatronics[key] = {
                    name: character.char_name,
                    character: character.animatronic.character_type,
                    host: character.animatronic.rpi_config.host,
                    user: character.animatronic.rpi_config.user,
                    description: character.animatronic.description,
                    status: character.animatronic.status,
                    enabled: character.animatronic.enabled,
                    services: character.animatronic.services,
                    log_types: character.animatronic.log_types,
                    parts: character.animatronic.animatronic_parts || []
                };
            }
        });

        return {
            animatronics,
            settings: {
                default_user: "remote",
                ssh_key_path: "~/.ssh/id_rsa",
                collection_interval: 300,
                log_retention_days: 30
            }
        };
    }

    /**
     * Get RPI systems configuration in the legacy format for backward compatibility
     */
    async getRpiSystemsConfig() {
        const characters = await this.loadCharacters();
        
        const rpi_systems = [];
        
        characters.forEach(character => {
            if (character.animatronic && character.animatronic.rpi_config && character.animatronic.enabled) {
                const key = character.char_name.toLowerCase().replace(/\s+/g, '');
                rpi_systems.push({
                    name: key,
                    host: character.animatronic.rpi_config.host,
                    user: character.animatronic.rpi_config.user,
                    password_env: character.animatronic.rpi_config.password_env,
                    description: character.animatronic.description,
                    status: character.animatronic.status,
                    enabled: character.animatronic.enabled,
                    services: character.animatronic.services,
                    log_types: character.animatronic.log_types,
                    collection_interval: character.animatronic.rpi_config.collection_interval,
                    max_lines: character.animatronic.rpi_config.max_lines
                });
            }
        });

        return {
            rpi_systems,
            ubuntu_systems: [], // No Ubuntu systems in character config
            collection_settings: {
                default_lines: 100,
                default_since: "1 hour ago",
                retry_attempts: 3,
                timeout_seconds: 30,
                compress_logs: true,
                store_raw_logs: true
            }
        };
    }

    /**
     * Get enabled animatronics only
     */
    async getEnabledAnimatronics() {
        const config = await this.getAnimatronicsConfig();
        const enabled = {};
        
        Object.entries(config.animatronics).forEach(([key, animatronic]) => {
            if (animatronic.enabled !== false) {
                enabled[key] = animatronic;
            }
        });
        
        return { animatronics: enabled, settings: config.settings };
    }

    /**
     * Get enabled RPI systems only
     */
    async getEnabledRpiSystems() {
        const config = await this.getRpiSystemsConfig();
        const enabled = config.rpi_systems.filter(system => system.enabled !== false);
        
        return {
            rpi_systems: enabled,
            ubuntu_systems: config.ubuntu_systems.filter(system => system.enabled !== false),
            collection_settings: config.collection_settings
        };
    }

    /**
     * Get character by ID
     */
    async getCharacterById(id) {
        const characters = await this.loadCharacters();
        return characters.find(char => char.id === parseInt(id));
    }

    /**
     * Get character by name
     */
    async getCharacterByName(name) {
        const characters = await this.loadCharacters();
        return characters.find(char => 
            char.char_name.toLowerCase() === name.toLowerCase()
        );
    }

    /**
     * Update character configuration
     */
    async updateCharacter(id, updates) {
        const characters = await this.loadCharacters();
        const index = characters.findIndex(char => char.id === parseInt(id));
        
        if (index === -1) {
            throw new Error(`Character with ID ${id} not found`);
        }
        
        // Deep merge the updates
        characters[index] = this.deepMerge(characters[index], updates);
        
        // Save back to file
        await fs.writeFile(this.charactersPath, JSON.stringify(characters, null, 2));
        
        // Clear cache
        this.characters = null;
        
        return characters[index];
    }

    /**
     * Deep merge utility function
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
}

module.exports = ConfigAdapter;
