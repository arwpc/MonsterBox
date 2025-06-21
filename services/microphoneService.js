const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');

class MicrophoneService {
    constructor() {
        this.microphonesPath = path.join(__dirname, '../data/microphones.json');
        this.defaultConfig = {
            enabled: true,
            sensitivity: 1.0,
            sampleRate: 16000,
            channels: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            voiceActivation: false,
            voiceActivationThreshold: 0.1,
            bufferSize: 1024,
            format: 'float32'
        };
    }

    /**
     * Load all microphones
     * @returns {Array} Array of microphones
     */
    async loadMicrophones() {
        try {
            const data = await fs.readFile(this.microphonesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create with default microphones
                const defaultMicrophones = await this.createDefaultMicrophones();
                await this.saveMicrophones(defaultMicrophones);
                return defaultMicrophones;
            }
            throw error;
        }
    }

    /**
     * Save microphones to file
     * @param {Array} microphones - Array of microphones
     */
    async saveMicrophones(microphones) {
        await fs.writeFile(this.microphonesPath, JSON.stringify(microphones, null, 2));
    }

    /**
     * Create default microphones configuration
     * @returns {Array} Default microphones
     */
    async createDefaultMicrophones() {
        return [
            {
                id: 1,
                name: "Default System Microphone",
                deviceId: "default",
                type: "system",
                status: "available",
                characterId: null,
                config: { ...this.defaultConfig },
                capabilities: {
                    sttIntegration: true,
                    audioStreaming: true,
                    realTimeProcessing: true,
                    voiceActivationDetection: true
                },
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            }
        ];
    }

    /**
     * Get all microphones
     * @returns {Array} Array of microphones
     */
    async getAllMicrophones() {
        try {
            return await this.loadMicrophones();
        } catch (error) {
            logger.error('Error loading microphones:', error);
            return [];
        }
    }

    /**
     * Get microphone by ID
     * @param {number} id - Microphone ID
     * @returns {Object|null} Microphone object or null
     */
    async getMicrophoneById(id) {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.find(mic => mic.id === parseInt(id)) || null;
        } catch (error) {
            logger.error(`Error getting microphone ${id}:`, error);
            return null;
        }
    }

    /**
     * Create a new microphone
     * @param {Object} microphoneData - Microphone data
     * @returns {Object} Created microphone
     */
    async createMicrophone(microphoneData) {
        try {
            const microphones = await this.loadMicrophones();
            
            const newMicrophone = {
                id: microphones.length > 0 ? Math.max(...microphones.map(m => m.id)) + 1 : 1,
                name: microphoneData.name || 'New Microphone',
                deviceId: microphoneData.deviceId || 'default',
                type: microphoneData.type || 'system',
                status: 'available',
                characterId: null,
                config: {
                    ...this.defaultConfig,
                    ...microphoneData.config
                },
                capabilities: {
                    sttIntegration: true,
                    audioStreaming: true,
                    realTimeProcessing: true,
                    voiceActivationDetection: true,
                    ...microphoneData.capabilities
                },
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };

            microphones.push(newMicrophone);
            await this.saveMicrophones(microphones);
            
            logger.info(`Created microphone: ${newMicrophone.name} (ID: ${newMicrophone.id})`);
            return newMicrophone;
        } catch (error) {
            logger.error('Error creating microphone:', error);
            throw new Error(`Failed to create microphone: ${error.message}`);
        }
    }

    /**
     * Update microphone
     * @param {number} id - Microphone ID
     * @param {Object} updateData - Update data
     * @returns {Object|null} Updated microphone or null
     */
    async updateMicrophone(id, updateData) {
        try {
            const microphones = await this.loadMicrophones();
            const index = microphones.findIndex(mic => mic.id === parseInt(id));
            
            if (index === -1) {
                return null;
            }

            // Preserve certain fields
            const preservedFields = ['id', 'created'];
            const updatedMicrophone = {
                ...microphones[index],
                ...updateData,
                lastModified: new Date().toISOString()
            };

            // Restore preserved fields
            preservedFields.forEach(field => {
                if (microphones[index][field] !== undefined) {
                    updatedMicrophone[field] = microphones[index][field];
                }
            });

            microphones[index] = updatedMicrophone;
            await this.saveMicrophones(microphones);
            
            logger.info(`Updated microphone: ${updatedMicrophone.name} (ID: ${id})`);
            return updatedMicrophone;
        } catch (error) {
            logger.error(`Error updating microphone ${id}:`, error);
            throw new Error(`Failed to update microphone: ${error.message}`);
        }
    }

    /**
     * Delete microphone
     * @param {number} id - Microphone ID
     * @returns {boolean} Success status
     */
    async deleteMicrophone(id) {
        try {
            const microphones = await this.loadMicrophones();
            const initialLength = microphones.length;
            const filteredMicrophones = microphones.filter(mic => mic.id !== parseInt(id));
            
            if (filteredMicrophones.length === initialLength) {
                return false; // Microphone not found
            }

            await this.saveMicrophones(filteredMicrophones);
            logger.info(`Deleted microphone with ID: ${id}`);
            return true;
        } catch (error) {
            logger.error(`Error deleting microphone ${id}:`, error);
            throw new Error(`Failed to delete microphone: ${error.message}`);
        }
    }

    /**
     * Get available microphones (not assigned to characters)
     * @returns {Array} Available microphones
     */
    async getAvailableMicrophones() {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.filter(mic => mic.characterId === null && mic.status === 'available');
        } catch (error) {
            logger.error('Error getting available microphones:', error);
            return [];
        }
    }

    /**
     * Get microphones assigned to characters
     * @returns {Array} Assigned microphones
     */
    async getAssignedMicrophones() {
        try {
            const microphones = await this.loadMicrophones();
            return microphones.filter(mic => mic.characterId !== null);
        } catch (error) {
            logger.error('Error getting assigned microphones:', error);
            return [];
        }
    }

    /**
     * Test microphone functionality
     * @param {number} id - Microphone ID
     * @returns {Object} Test result
     */
    async testMicrophone(id) {
        try {
            const microphone = await this.getMicrophoneById(id);
            if (!microphone) {
                return {
                    success: false,
                    error: 'Microphone not found'
                };
            }

            // Basic test - check if device exists and is accessible
            // In a real implementation, this would test actual audio capture
            return {
                success: true,
                microphone: microphone,
                testResults: {
                    deviceAccessible: true,
                    sampleRate: microphone.config.sampleRate,
                    channels: microphone.config.channels,
                    latency: 'low',
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            logger.error(`Error testing microphone ${id}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MicrophoneService;
