/**
 * Character Audio Configuration Service for MonsterBox
 * Manages per-character audio settings including microphone sensitivity,
 * voice activation, STT preferences, and jaw animation parameters
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

class CharacterAudioConfigService {
    constructor() {
        this.configPath = path.join(__dirname, '../data/character-audio-config.json');
        this.defaultConfig = {
            microphone: {
                enabled: true,
                sensitivity: 1.0,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                voiceActivation: false,
                voiceActivationThreshold: 0.1
            },
            stt: {
                enabled: true,
                language: 'en',
                confidenceThreshold: 0.7,
                realTimeProcessing: true,
                provider: 'elevenlabs'
            },
            jawAnimation: {
                enabled: true,
                sensitivity: 1.2,
                responseCurve: 'exponential',
                attackTime: 0.03,
                releaseTime: 0.1,
                minPosition: 45,
                maxPosition: 10,
                volumeThreshold: 0.005,
                smoothingFactor: 0.7
            },
            audioProcessing: {
                sampleRate: 16000,
                channels: 1,
                bufferSize: 1024,
                processingDelay: 100,
                enableRealTimeEffects: false
            },
            characterSpecific: {
                voiceProfile: 'default',
                emotionalResponse: true,
                contextAwareness: true,
                personalityAdjustments: true
            }
        };
    }

    /**
     * Initialize the service and ensure config file exists
     */
    async initialize() {
        try {
            await this.ensureConfigFile();
            logger.info('Character Audio Config Service initialized');
            return true;
        } catch (error) {
            logger.error('Failed to initialize Character Audio Config Service:', error);
            return false;
        }
    }

    /**
     * Ensure the configuration file exists with default structure
     */
    async ensureConfigFile() {
        try {
            await fs.access(this.configPath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                const initialConfig = {
                    version: '1.0.0',
                    lastUpdated: new Date().toISOString(),
                    characters: {}
                };
                await fs.writeFile(this.configPath, JSON.stringify(initialConfig, null, 2));
                logger.info('Created character audio configuration file');
            } else {
                throw error;
            }
        }
    }

    /**
     * Load all character audio configurations
     */
    async loadConfigurations() {
        try {
            const data = await fs.readFile(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error loading character audio configurations:', error);
            return { version: '1.0.0', lastUpdated: new Date().toISOString(), characters: {} };
        }
    }

    /**
     * Save character audio configurations
     */
    async saveConfigurations(config) {
        try {
            config.lastUpdated = new Date().toISOString();
            await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
            logger.debug('Character audio configurations saved');
        } catch (error) {
            logger.error('Error saving character audio configurations:', error);
            throw error;
        }
    }

    /**
     * Get audio configuration for a specific character
     */
    async getCharacterAudioConfig(characterId) {
        try {
            const config = await this.loadConfigurations();
            const characterConfig = config.characters[characterId];
            
            if (!characterConfig) {
                // Return default configuration for new characters
                return {
                    characterId: parseInt(characterId),
                    ...this.defaultConfig,
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                };
            }
            
            // Merge with defaults to ensure all fields are present
            return {
                characterId: parseInt(characterId),
                ...this.defaultConfig,
                ...characterConfig,
                microphone: { ...this.defaultConfig.microphone, ...characterConfig.microphone },
                stt: { ...this.defaultConfig.stt, ...characterConfig.stt },
                jawAnimation: { ...this.defaultConfig.jawAnimation, ...characterConfig.jawAnimation },
                audioProcessing: { ...this.defaultConfig.audioProcessing, ...characterConfig.audioProcessing },
                characterSpecific: { ...this.defaultConfig.characterSpecific, ...characterConfig.characterSpecific }
            };
        } catch (error) {
            logger.error(`Error getting audio config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Update audio configuration for a specific character
     */
    async updateCharacterAudioConfig(characterId, updates) {
        try {
            const config = await this.loadConfigurations();
            
            if (!config.characters[characterId]) {
                config.characters[characterId] = {
                    characterId: parseInt(characterId),
                    created: new Date().toISOString()
                };
            }
            
            // Deep merge the updates
            const currentConfig = config.characters[characterId];
            config.characters[characterId] = {
                ...currentConfig,
                ...updates,
                characterId: parseInt(characterId),
                lastModified: new Date().toISOString(),
                microphone: { ...currentConfig.microphone, ...updates.microphone },
                stt: { ...currentConfig.stt, ...updates.stt },
                jawAnimation: { ...currentConfig.jawAnimation, ...updates.jawAnimation },
                audioProcessing: { ...currentConfig.audioProcessing, ...updates.audioProcessing },
                characterSpecific: { ...currentConfig.characterSpecific, ...updates.characterSpecific }
            };
            
            await this.saveConfigurations(config);
            
            logger.info(`Updated audio configuration for character ${characterId}`);
            return config.characters[characterId];
        } catch (error) {
            logger.error(`Error updating audio config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Get all character audio configurations
     */
    async getAllCharacterAudioConfigs() {
        try {
            const config = await this.loadConfigurations();
            return config.characters;
        } catch (error) {
            logger.error('Error getting all character audio configurations:', error);
            throw error;
        }
    }

    /**
     * Delete audio configuration for a character
     */
    async deleteCharacterAudioConfig(characterId) {
        try {
            const config = await this.loadConfigurations();
            
            if (config.characters[characterId]) {
                delete config.characters[characterId];
                await this.saveConfigurations(config);
                logger.info(`Deleted audio configuration for character ${characterId}`);
                return true;
            }
            
            return false;
        } catch (error) {
            logger.error(`Error deleting audio config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Get optimized audio settings for real-time processing
     */
    async getOptimizedAudioSettings(characterId) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);
            
            return {
                microphone: {
                    sampleRate: config.audioProcessing.sampleRate,
                    channels: config.audioProcessing.channels,
                    echoCancellation: config.microphone.echoCancellation,
                    noiseSuppression: config.microphone.noiseSuppression,
                    autoGainControl: config.microphone.autoGainControl,
                    sensitivity: config.microphone.sensitivity
                },
                processing: {
                    bufferSize: config.audioProcessing.bufferSize,
                    processingDelay: config.audioProcessing.processingDelay,
                    voiceActivation: config.microphone.voiceActivation,
                    voiceActivationThreshold: config.microphone.voiceActivationThreshold
                },
                jawAnimation: {
                    enabled: config.jawAnimation.enabled,
                    sensitivity: config.jawAnimation.sensitivity,
                    responseCurve: config.jawAnimation.responseCurve,
                    attackTime: config.jawAnimation.attackTime,
                    releaseTime: config.jawAnimation.releaseTime,
                    volumeThreshold: config.jawAnimation.volumeThreshold,
                    smoothingFactor: config.jawAnimation.smoothingFactor
                },
                stt: {
                    enabled: config.stt.enabled,
                    language: config.stt.language,
                    confidenceThreshold: config.stt.confidenceThreshold,
                    realTimeProcessing: config.stt.realTimeProcessing
                }
            };
        } catch (error) {
            logger.error(`Error getting optimized audio settings for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Validate audio configuration
     */
    validateAudioConfig(config) {
        const errors = [];
        
        // Validate microphone settings
        if (config.microphone) {
            if (typeof config.microphone.sensitivity !== 'number' || 
                config.microphone.sensitivity < 0.1 || config.microphone.sensitivity > 3.0) {
                errors.push('Microphone sensitivity must be between 0.1 and 3.0');
            }
            
            if (typeof config.microphone.voiceActivationThreshold !== 'number' || 
                config.microphone.voiceActivationThreshold < 0.01 || config.microphone.voiceActivationThreshold > 1.0) {
                errors.push('Voice activation threshold must be between 0.01 and 1.0');
            }
        }
        
        // Validate jaw animation settings
        if (config.jawAnimation) {
            if (typeof config.jawAnimation.sensitivity !== 'number' || 
                config.jawAnimation.sensitivity < 0.1 || config.jawAnimation.sensitivity > 5.0) {
                errors.push('Jaw animation sensitivity must be between 0.1 and 5.0');
            }
            
            if (typeof config.jawAnimation.attackTime !== 'number' || 
                config.jawAnimation.attackTime < 0.01 || config.jawAnimation.attackTime > 1.0) {
                errors.push('Attack time must be between 0.01 and 1.0 seconds');
            }
        }
        
        // Validate STT settings
        if (config.stt) {
            if (typeof config.stt.confidenceThreshold !== 'number' || 
                config.stt.confidenceThreshold < 0.1 || config.stt.confidenceThreshold > 1.0) {
                errors.push('STT confidence threshold must be between 0.1 and 1.0');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Export character audio configuration
     */
    async exportCharacterAudioConfig(characterId) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);
            return {
                characterId: characterId,
                exportDate: new Date().toISOString(),
                config: config
            };
        } catch (error) {
            logger.error(`Error exporting audio config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Import character audio configuration
     */
    async importCharacterAudioConfig(characterId, importData) {
        try {
            const validation = this.validateAudioConfig(importData.config);
            if (!validation.isValid) {
                throw new Error('Invalid configuration: ' + validation.errors.join(', '));
            }
            
            await this.updateCharacterAudioConfig(characterId, importData.config);
            logger.info(`Imported audio configuration for character ${characterId}`);
            return true;
        } catch (error) {
            logger.error(`Error importing audio config for character ${characterId}:`, error);
            throw error;
        }
    }
}

module.exports = new CharacterAudioConfigService();
