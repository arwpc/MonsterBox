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
                provider: 'elevenlabs',
                vadThreshold: 0.5,
                silenceDuration: 200,
                prefixPadding: 300
            },
            // Character + Microphone specific STT settings
            microphoneSTTConfigs: {
                // microphoneId: { stt settings specific to this character + microphone combo }
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
            },
            // Default speaker configuration for all audio output
            speaker: {
                defaultSpeakerId: null, // ID of the speaker part to use for all audio
                outputDevice: 'default', // Audio device ID (fallback if no speaker part)
                volume: 80, // Default volume level (0-100)
                enabled: true // Whether audio output is enabled
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
                characterSpecific: { ...this.defaultConfig.characterSpecific, ...characterConfig.characterSpecific },
                speaker: { ...this.defaultConfig.speaker, ...characterConfig.speaker }
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

    /**
     * Get STT configuration for a specific character + microphone combination
     */
    async getCharacterMicrophoneSTTConfig(characterId, microphoneId) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);

            // Check if there's a specific config for this character + microphone combo
            if (config.microphoneSTTConfigs && config.microphoneSTTConfigs[microphoneId]) {
                return {
                    ...this.defaultConfig.stt,
                    ...config.microphoneSTTConfigs[microphoneId]
                };
            }

            // Fall back to character-level STT config
            return {
                ...this.defaultConfig.stt,
                ...config.stt
            };
        } catch (error) {
            logger.error(`Error getting STT config for character ${characterId} microphone ${microphoneId}:`, error);
            throw error;
        }
    }

    /**
     * Update STT configuration for a specific character + microphone combination
     */
    async updateCharacterMicrophoneSTTConfig(characterId, microphoneId, sttConfig) {
        try {
            const currentConfig = await this.getCharacterAudioConfig(characterId);

            // Initialize microphoneSTTConfigs if it doesn't exist
            if (!currentConfig.microphoneSTTConfigs) {
                currentConfig.microphoneSTTConfigs = {};
            }

            // Update the specific microphone STT config
            currentConfig.microphoneSTTConfigs[microphoneId] = {
                ...currentConfig.microphoneSTTConfigs[microphoneId],
                ...sttConfig,
                lastModified: new Date().toISOString()
            };

            // Update the overall character config
            await this.updateCharacterAudioConfig(characterId, currentConfig);

            logger.info(`Updated STT config for character ${characterId} microphone ${microphoneId}`);
            return currentConfig.microphoneSTTConfigs[microphoneId];
        } catch (error) {
            logger.error(`Error updating STT config for character ${characterId} microphone ${microphoneId}:`, error);
            throw error;
        }
    }

    /**
     * Get all microphone STT configurations for a character
     */
    async getCharacterMicrophoneSTTConfigs(characterId) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);
            return config.microphoneSTTConfigs || {};
        } catch (error) {
            logger.error(`Error getting microphone STT configs for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Delete STT configuration for a specific character + microphone combination
     */
    async deleteCharacterMicrophoneSTTConfig(characterId, microphoneId) {
        try {
            const currentConfig = await this.getCharacterAudioConfig(characterId);

            if (currentConfig.microphoneSTTConfigs && currentConfig.microphoneSTTConfigs[microphoneId]) {
                delete currentConfig.microphoneSTTConfigs[microphoneId];
                await this.updateCharacterAudioConfig(characterId, currentConfig);
                logger.info(`Deleted STT config for character ${characterId} microphone ${microphoneId}`);
                return true;
            }

            return false;
        } catch (error) {
            logger.error(`Error deleting STT config for character ${characterId} microphone ${microphoneId}:`, error);
            throw error;
        }
    }

    /**
     * Get character's default speaker configuration
     */
    async getCharacterSpeakerConfig(characterId) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);
            return config.speaker;
        } catch (error) {
            logger.error(`Error getting speaker config for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Set character's default speaker
     */
    async setCharacterDefaultSpeaker(characterId, speakerId, outputDevice = null, volume = null, enabled = null) {
        try {
            const config = await this.getCharacterAudioConfig(characterId);

            // Update speaker configuration (preserve existing values if not provided)
            config.speaker = {
                ...config.speaker,
                defaultSpeakerId: speakerId,
                ...(outputDevice ? { outputDevice } : {}),
                ...(Number.isFinite(volume) ? { volume: Math.max(0, Math.min(100, Math.floor(volume))) } : {}),
                ...(typeof enabled === 'boolean' ? { enabled } : {})
            };

            // Save the updated configuration
            await this.updateCharacterAudioConfig(characterId, config);

            logger.info(`Set default speaker for character ${characterId}: speakerId=${speakerId}, outputDevice=${outputDevice}, volume=${config.speaker.volume}, enabled=${config.speaker.enabled}`);
            return config.speaker;
        } catch (error) {
            logger.error(`Error setting default speaker for character ${characterId}:`, error);
            throw error;
        }
    }

    /**
     * Get the effective audio output device for a character
     * Returns the speaker part's output device if available, otherwise the fallback device
     */
    async getCharacterAudioOutputDevice(characterId) {
        try {
            const speakerConfig = await this.getCharacterSpeakerConfig(characterId);

            // If a speaker part is configured, get its output device
            if (speakerConfig.defaultSpeakerId) {
                const partService = require('./partService');
                const speakerPart = await partService.getPartById(speakerConfig.defaultSpeakerId);

                if (speakerPart && speakerPart.type === 'speaker' && speakerPart.outputDevice) {
                    logger.info(`Using speaker part ${speakerPart.name} (${speakerPart.outputDevice}) for character ${characterId}`);
                    return {
                        device: speakerPart.outputDevice,
                        volume: speakerPart.volume || speakerConfig.volume || 80,
                        source: 'speaker_part',
                        speakerName: speakerPart.name
                    };
                }
            }

            // Fall back to configured output device or system default
            const device = speakerConfig.outputDevice || 'default';
            logger.info(`Using fallback audio device ${device} for character ${characterId}`);
            return {
                device: device,
                volume: speakerConfig.volume || 80,
                source: 'fallback',
                speakerName: 'System Default'
            };

        } catch (error) {
            logger.error(`Error getting audio output device for character ${characterId}:`, error);
            // Return safe default
            return {
                device: 'default',
                volume: 80,
                source: 'error_fallback',
                speakerName: 'System Default'
            };
        }
    }
}

module.exports = new CharacterAudioConfigService();
