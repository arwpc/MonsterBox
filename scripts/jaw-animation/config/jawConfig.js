// scripts/jaw-animation/config/jawConfig.js

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../logger');

/**
 * Configuration management for jaw animation system
 * Handles character-specific and global settings
 */
class JawConfig {
    constructor() {
        this.configPath = path.join(__dirname, '..', '..', '..', 'data', 'jaw-animation-config.json');
        this.presetsPath = path.join(__dirname, 'presets.json');
        this.config = null;
        this.presets = null;
    }
    
    /**
     * Initialize configuration system
     * @returns {Promise} Promise that resolves when initialization is complete
     */
    async initialize() {
        try {
            await this.loadConfig();
            await this.loadPresets();
            logger.info('JawConfig initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize JawConfig:', error);
            throw error;
        }
    }
    
    /**
     * Load configuration from file
     * @returns {Promise} Promise that resolves when config is loaded
     */
    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
            logger.debug('Configuration loaded from:', this.configPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Create default configuration if file doesn't exist
                this.config = this.createDefaultConfig();
                await this.saveConfig();
                logger.info('Created default configuration file');
            } else {
                logger.error('Error loading configuration:', error);
                throw error;
            }
        }
    }
    
    /**
     * Load presets from file
     * @returns {Promise} Promise that resolves when presets are loaded
     */
    async loadPresets() {
        try {
            const presetsData = await fs.readFile(this.presetsPath, 'utf8');
            this.presets = JSON.parse(presetsData);
            logger.debug('Presets loaded from:', this.presetsPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Create default presets if file doesn't exist
                this.presets = this.createDefaultPresets();
                await this.savePresets();
                logger.info('Created default presets file');
            } else {
                logger.error('Error loading presets:', error);
                throw error;
            }
        }
    }
    
    /**
     * Save configuration to file
     * @returns {Promise} Promise that resolves when config is saved
     */
    async saveConfig() {
        try {
            await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
            logger.debug('Configuration saved to:', this.configPath);
        } catch (error) {
            logger.error('Error saving configuration:', error);
            throw error;
        }
    }
    
    /**
     * Save presets to file
     * @returns {Promise} Promise that resolves when presets are saved
     */
    async savePresets() {
        try {
            await fs.writeFile(this.presetsPath, JSON.stringify(this.presets, null, 2));
            logger.debug('Presets saved to:', this.presetsPath);
        } catch (error) {
            logger.error('Error saving presets:', error);
            throw error;
        }
    }
    
    /**
     * Get configuration for a specific character
     * @param {number} characterId - Character ID
     * @returns {Object} Character configuration
     */
    getCharacterConfig(characterId) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        
        const characterConfig = this.config.characters[characterId];
        if (!characterConfig) {
            // Return default configuration for character
            return this.createDefaultCharacterConfig();
        }
        
        // Merge with global defaults
        return {
            ...this.config.global,
            ...characterConfig
        };
    }
    
    /**
     * Set configuration for a specific character
     * @param {number} characterId - Character ID
     * @param {Object} config - Configuration object
     * @returns {Promise} Promise that resolves when config is saved
     */
    async setCharacterConfig(characterId, config) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        
        this.config.characters[characterId] = {
            ...this.config.characters[characterId],
            ...config
        };
        
        await this.saveConfig();
        logger.info(`Configuration updated for character ${characterId}`);
    }
    
    /**
     * Get global configuration
     * @returns {Object} Global configuration
     */
    getGlobalConfig() {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        
        return { ...this.config.global };
    }
    
    /**
     * Set global configuration
     * @param {Object} config - Global configuration object
     * @returns {Promise} Promise that resolves when config is saved
     */
    async setGlobalConfig(config) {
        if (!this.config) {
            throw new Error('Configuration not loaded');
        }
        
        this.config.global = {
            ...this.config.global,
            ...config
        };
        
        await this.saveConfig();
        logger.info('Global configuration updated');
    }
    
    /**
     * Get available presets
     * @returns {Object} Available presets
     */
    getPresets() {
        if (!this.presets) {
            throw new Error('Presets not loaded');
        }
        
        return { ...this.presets };
    }
    
    /**
     * Apply preset to character
     * @param {number} characterId - Character ID
     * @param {string} presetName - Preset name
     * @returns {Promise} Promise that resolves when preset is applied
     */
    async applyPreset(characterId, presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            throw new Error(`Preset '${presetName}' not found`);
        }
        
        await this.setCharacterConfig(characterId, preset);
        logger.info(`Applied preset '${presetName}' to character ${characterId}`);
    }
    
    /**
     * Create default configuration
     * @returns {Object} Default configuration
     */
    createDefaultConfig() {
        return {
            version: '1.0.0',
            global: {
                enabled: true,
                audioAnalysis: {
                    sampleRate: 44100,
                    bufferSize: 1024,
                    smoothingFactor: 0.8,
                    volumeThreshold: 0.01,
                    updateInterval: 20
                },
                servoMapping: {
                    responseCurve: 'linear',
                    sensitivity: 1.0,
                    attackTime: 0.05,
                    releaseTime: 0.15,
                    smoothingFactor: 0.7
                },
                performance: {
                    maxCpuUsage: 10,
                    maxMemoryUsage: 50,
                    updateRate: 50
                }
            },
            characters: {}
        };
    }
    
    /**
     * Create default character configuration
     * @returns {Object} Default character configuration
     */
    createDefaultCharacterConfig() {
        return {
            enabled: false,
            servoId: null,
            characterType: 'default',
            servoMapping: {
                minPosition: 0,
                maxPosition: 180,
                responseCurve: 'linear',
                sensitivity: 1.0
            },
            audioAnalysis: {
                volumeThreshold: 0.01,
                smoothingFactor: 0.8
            }
        };
    }
    
    /**
     * Create default presets
     * @returns {Object} Default presets
     */
    createDefaultPresets() {
        return {
            skeleton: {
                characterType: 'skeleton',
                servoMapping: {
                    minPosition: 10,
                    maxPosition: 45,
                    responseCurve: 'exponential',
                    sensitivity: 1.2,
                    attackTime: 0.03,
                    releaseTime: 0.1
                },
                audioAnalysis: {
                    volumeThreshold: 0.005,
                    smoothingFactor: 0.7
                }
            },
            bear: {
                characterType: 'bear',
                servoMapping: {
                    minPosition: 0,
                    maxPosition: 60,
                    responseCurve: 'linear',
                    sensitivity: 0.8,
                    attackTime: 0.05,
                    releaseTime: 0.2
                },
                audioAnalysis: {
                    volumeThreshold: 0.02,
                    smoothingFactor: 0.8
                }
            },
            fish: {
                characterType: 'fish',
                servoMapping: {
                    minPosition: 5,
                    maxPosition: 35,
                    responseCurve: 'logarithmic',
                    sensitivity: 1.5,
                    attackTime: 0.02,
                    releaseTime: 0.08
                },
                audioAnalysis: {
                    volumeThreshold: 0.001,
                    smoothingFactor: 0.6
                }
            },
            demon: {
                characterType: 'demon',
                servoMapping: {
                    minPosition: 0,
                    maxPosition: 70,
                    responseCurve: 'custom',
                    sensitivity: 1.0,
                    attackTime: 0.04,
                    releaseTime: 0.15
                },
                audioAnalysis: {
                    volumeThreshold: 0.01,
                    smoothingFactor: 0.75
                }
            }
        };
    }
    
    /**
     * Validate configuration object
     * @param {Object} config - Configuration to validate
     * @returns {boolean} True if valid
     */
    validateConfig(config) {
        // Basic validation - can be expanded
        if (!config || typeof config !== 'object') {
            return false;
        }
        
        // Check required fields
        const requiredFields = ['enabled'];
        for (const field of requiredFields) {
            if (!(field in config)) {
                return false;
            }
        }
        
        return true;
    }
}

module.exports = JawConfig;
