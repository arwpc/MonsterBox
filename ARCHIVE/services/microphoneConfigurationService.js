const EventEmitter = require('events');
const logger = require('../scripts/logger');
const CharacterMicrophoneService = require('./characterMicrophoneService');
const characterAudioConfigService = require('./characterAudioConfigService');
const MicrophoneService = require('./microphoneService');

class MicrophoneConfigurationService extends EventEmitter {
    constructor() {
        super();
        this.characterMicrophoneService = new CharacterMicrophoneService();
        this.microphoneService = new MicrophoneService();
        this.isInitialized = false;
    }

    /**
     * Initialize the microphone configuration service
     */
    async initialize() {
        try {
            logger.info('🎤⚙️ Initializing Microphone Configuration Service...');
            
            // Initialize character audio config service
            await characterAudioConfigService.initialize();
            
            this.isInitialized = true;
            logger.info('✅ Microphone Configuration Service initialized');
            return true;
        } catch (error) {
            logger.error('❌ Failed to initialize Microphone Configuration Service:', error);
            return false;
        }
    }

    /**
     * Enable microphone for a character
     */
    async enableMicrophoneForCharacter(characterId, microphoneId = null) {
        try {
            logger.info(`🎤 Enabling microphone for character ${characterId}`);

            // If no specific microphone ID provided, find an available one
            if (!microphoneId) {
                const availableMicrophones = await this.microphoneService.getAvailableMicrophones();
                if (availableMicrophones.length === 0) {
                    throw new Error('No available microphones found');
                }
                microphoneId = availableMicrophones[0].id;
            }

            // Assign microphone to character
            const assignResult = await this.characterMicrophoneService.assignMicrophone(characterId, microphoneId);
            if (!assignResult.success) {
                throw new Error(assignResult.error);
            }

            // Update character audio configuration to enable microphone
            await characterAudioConfigService.updateCharacterAudioConfig(characterId, {
                microphone: {
                    enabled: true,
                    assignedMicrophoneId: microphoneId
                }
            });

            logger.info(`✅ Microphone ${microphoneId} enabled for character ${characterId}`);
            
            this.emit('microphone_enabled', {
                characterId: characterId,
                microphoneId: microphoneId,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                characterId: characterId,
                microphoneId: microphoneId,
                microphone: assignResult.microphone
            };

        } catch (error) {
            logger.error(`Error enabling microphone for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Disable microphone for a character
     */
    async disableMicrophoneForCharacter(characterId) {
        try {
            logger.info(`🎤 Disabling microphone for character ${characterId}`);

            // Remove microphone assignment
            const removeResult = await this.characterMicrophoneService.removeMicrophone(characterId);
            if (!removeResult.success) {
                throw new Error(removeResult.error);
            }

            // Update character audio configuration to disable microphone
            await characterAudioConfigService.updateCharacterAudioConfig(characterId, {
                microphone: {
                    enabled: false,
                    assignedMicrophoneId: null
                }
            });

            logger.info(`✅ Microphone disabled for character ${characterId}`);
            
            this.emit('microphone_disabled', {
                characterId: characterId,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                characterId: characterId
            };

        } catch (error) {
            logger.error(`Error disabling microphone for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Configure microphone settings for a character
     */
    async configureMicrophoneForCharacter(characterId, microphoneConfig) {
        try {
            logger.info(`🎤⚙️ Configuring microphone for character ${characterId}`);

            // Validate configuration
            const validation = this.validateMicrophoneConfig(microphoneConfig);
            if (!validation.isValid) {
                throw new Error('Invalid microphone configuration: ' + validation.errors.join(', '));
            }

            // Get current microphone assignment
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                throw new Error(`No microphone assigned to character ${characterId}`);
            }

            // Update microphone hardware configuration
            await this.microphoneService.updateMicrophone(microphone.id, {
                config: {
                    ...microphone.config,
                    ...microphoneConfig
                }
            });

            // Update character audio configuration
            await characterAudioConfigService.updateCharacterAudioConfig(characterId, {
                microphone: microphoneConfig
            });

            logger.info(`✅ Microphone configured for character ${characterId}`);
            
            this.emit('microphone_configured', {
                characterId: characterId,
                microphoneId: microphone.id,
                config: microphoneConfig,
                timestamp: new Date().toISOString()
            });

            return {
                success: true,
                characterId: characterId,
                microphoneId: microphone.id,
                config: microphoneConfig
            };

        } catch (error) {
            logger.error(`Error configuring microphone for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get microphone configuration for a character
     */
    async getMicrophoneConfigForCharacter(characterId) {
        try {
            // Get character audio configuration
            const audioConfig = await characterAudioConfigService.getCharacterAudioConfig(characterId);
            
            // Get microphone assignment
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            
            return {
                characterId: characterId,
                microphoneEnabled: audioConfig.microphone.enabled,
                microphone: microphone,
                configuration: audioConfig.microphone,
                optimizedSettings: await characterAudioConfigService.getOptimizedAudioSettings(characterId)
            };

        } catch (error) {
            logger.error(`Error getting microphone config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Get all character microphone configurations
     */
    async getAllCharacterMicrophoneConfigs() {
        try {
            const allConfigs = await characterAudioConfigService.getAllCharacterAudioConfigs();
            const associations = await this.characterMicrophoneService.getAllAssociations();
            
            const result = {};
            
            // Process each character configuration
            for (const [characterId, config] of Object.entries(allConfigs)) {
                const association = associations.find(a => a.characterId === parseInt(characterId));
                
                result[characterId] = {
                    characterId: parseInt(characterId),
                    microphoneEnabled: config.microphone?.enabled || false,
                    microphone: association?.microphone || null,
                    configuration: config.microphone || {},
                    lastModified: config.lastModified
                };
            }
            
            return result;

        } catch (error) {
            logger.error('Error getting all character microphone configurations:', error);
            throw error;
        }
    }

    /**
     * Test microphone configuration for a character
     */
    async testMicrophoneForCharacter(characterId) {
        try {
            logger.info(`🎤🧪 Testing microphone for character ${characterId}`);

            // Get microphone assignment
            const microphone = await this.characterMicrophoneService.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                return {
                    success: false,
                    error: `No microphone assigned to character ${characterId}`
                };
            }

            // Test microphone functionality
            const testResult = await this.microphoneService.testMicrophone(microphone.id);
            
            if (testResult.success) {
                logger.info(`✅ Microphone test successful for character ${characterId}`);
                
                this.emit('microphone_test_success', {
                    characterId: characterId,
                    microphoneId: microphone.id,
                    testResults: testResult.testResults,
                    timestamp: new Date().toISOString()
                });
            } else {
                logger.warn(`⚠️ Microphone test failed for character ${characterId}: ${testResult.error}`);
                
                this.emit('microphone_test_failed', {
                    characterId: characterId,
                    microphoneId: microphone.id,
                    error: testResult.error,
                    timestamp: new Date().toISOString()
                });
            }

            return {
                success: testResult.success,
                characterId: characterId,
                microphoneId: microphone.id,
                testResults: testResult.testResults,
                error: testResult.error
            };

        } catch (error) {
            logger.error(`Error testing microphone for character ${characterId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate microphone configuration
     */
    validateMicrophoneConfig(config) {
        const errors = [];

        if (config.sensitivity !== undefined) {
            if (typeof config.sensitivity !== 'number' || config.sensitivity < 0.1 || config.sensitivity > 3.0) {
                errors.push('Sensitivity must be between 0.1 and 3.0');
            }
        }

        if (config.voiceActivationThreshold !== undefined) {
            if (typeof config.voiceActivationThreshold !== 'number' || 
                config.voiceActivationThreshold < 0.01 || config.voiceActivationThreshold > 1.0) {
                errors.push('Voice activation threshold must be between 0.01 and 1.0');
            }
        }

        if (config.sampleRate !== undefined) {
            const validSampleRates = [8000, 16000, 22050, 44100, 48000];
            if (!validSampleRates.includes(config.sampleRate)) {
                errors.push('Sample rate must be one of: ' + validSampleRates.join(', '));
            }
        }

        if (config.channels !== undefined) {
            if (![1, 2].includes(config.channels)) {
                errors.push('Channels must be 1 (mono) or 2 (stereo)');
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get microphone configuration status for all characters
     */
    async getMicrophoneStatus() {
        try {
            const allConfigs = await this.getAllCharacterMicrophoneConfigs();
            const availableMicrophones = await this.microphoneService.getAvailableMicrophones();
            const assignedMicrophones = await this.microphoneService.getAssignedMicrophones();

            return {
                totalCharacters: Object.keys(allConfigs).length,
                charactersWithMicrophones: Object.values(allConfigs).filter(c => c.microphone).length,
                charactersWithEnabledMicrophones: Object.values(allConfigs).filter(c => c.microphoneEnabled).length,
                availableMicrophones: availableMicrophones.length,
                assignedMicrophones: assignedMicrophones.length,
                configurations: allConfigs
            };

        } catch (error) {
            logger.error('Error getting microphone status:', error);
            throw error;
        }
    }

    /**
     * Bulk enable/disable microphones for multiple characters
     */
    async bulkConfigureMicrophones(characterIds, enabled) {
        const results = [];

        for (const characterId of characterIds) {
            try {
                let result;
                if (enabled) {
                    result = await this.enableMicrophoneForCharacter(characterId);
                } else {
                    result = await this.disableMicrophoneForCharacter(characterId);
                }
                results.push({ characterId, ...result });
            } catch (error) {
                results.push({
                    characterId,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }
}

module.exports = MicrophoneConfigurationService;
