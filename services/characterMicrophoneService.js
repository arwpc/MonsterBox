const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const characterService = require('./characterService');
const MicrophoneService = require('./microphoneService');

class CharacterMicrophoneService {
    constructor() {
        this.associationsPath = path.join(__dirname, '../data/character-microphone-associations.json');
        this.microphoneService = new MicrophoneService();
    }

    /**
     * Load character-microphone associations
     * @returns {Array} Array of associations
     */
    async loadAssociations() {
        try {
            const data = await fs.readFile(this.associationsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return empty array
                return [];
            }
            throw error;
        }
    }

    /**
     * Save character-microphone associations
     * @param {Array} associations - Array of associations
     */
    async saveAssociations(associations) {
        await fs.writeFile(this.associationsPath, JSON.stringify(associations, null, 2));
    }

    /**
     * Get microphone assigned to a character
     * @param {number} characterId - Character ID
     * @returns {Object|null} Microphone object or null
     */
    async getMicrophoneByCharacter(characterId) {
        try {
            const microphones = await this.microphoneService.getAllMicrophones();
            return microphones.find(mic => mic.characterId === parseInt(characterId)) || null;
        } catch (error) {
            logger.error(`Error getting microphone for character ${characterId}:`, error);
            return null;
        }
    }

    /**
     * Get character assigned to a microphone
     * @param {number} microphoneId - Microphone ID
     * @returns {Object|null} Character object or null
     */
    async getCharacterByMicrophone(microphoneId) {
        try {
            const microphone = await this.microphoneService.getMicrophoneById(microphoneId);
            if (!microphone || !microphone.characterId) {
                return null;
            }
            return await characterService.getCharacterById(microphone.characterId);
        } catch (error) {
            logger.error(`Error getting character for microphone ${microphoneId}:`, error);
            return null;
        }
    }

    /**
     * Assign microphone to character
     * @param {number} characterId - Character ID
     * @param {number} microphoneId - Microphone ID
     * @returns {Object} Assignment result
     */
    async assignMicrophone(characterId, microphoneId) {
        try {
            // Validate character exists
            const character = await characterService.getCharacterById(characterId);
            if (!character) {
                return {
                    success: false,
                    error: 'Character not found'
                };
            }

            // Validate microphone exists and is available
            const microphone = await this.microphoneService.getMicrophoneById(microphoneId);
            if (!microphone) {
                return {
                    success: false,
                    error: 'Microphone not found'
                };
            }

            if (microphone.characterId !== null) {
                return {
                    success: false,
                    error: 'Microphone is already assigned to another character'
                };
            }

            // Check if character already has a microphone assigned
            const existingMicrophone = await this.getMicrophoneByCharacter(characterId);
            if (existingMicrophone) {
                return {
                    success: false,
                    error: 'Character already has a microphone assigned'
                };
            }

            // Update the microphone to assign it to the character
            const updatedMicrophone = await this.microphoneService.updateMicrophone(microphoneId, {
                ...microphone,
                characterId: characterId,
                status: 'assigned'
            });

            if (!updatedMicrophone) {
                return {
                    success: false,
                    error: 'Failed to update microphone assignment'
                };
            }

            // Load and update associations
            const associations = await this.loadAssociations();
            const newAssociation = {
                id: associations.length > 0 ? Math.max(...associations.map(a => a.id)) + 1 : 1,
                characterId: characterId,
                microphoneId: microphoneId,
                assignedAt: new Date().toISOString(),
                status: 'active'
            };

            associations.push(newAssociation);
            await this.saveAssociations(associations);

            logger.info(`Microphone ${microphoneId} assigned to character ${characterId}`);

            return {
                success: true,
                association: newAssociation,
                character: character,
                microphone: updatedMicrophone
            };

        } catch (error) {
            logger.error('Error assigning microphone to character:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Remove microphone from character
     * @param {number} characterId - Character ID
     * @returns {Object} Removal result
     */
    async removeMicrophone(characterId) {
        try {
            // Get current microphone assignment
            const microphone = await this.getMicrophoneByCharacter(characterId);
            if (!microphone) {
                return {
                    success: false,
                    error: 'No microphone assigned to this character'
                };
            }

            // Update the microphone to remove character assignment
            const updatedMicrophone = await this.microphoneService.updateMicrophone(microphone.id, {
                ...microphone,
                characterId: null,
                status: 'available'
            });

            if (!updatedMicrophone) {
                return {
                    success: false,
                    error: 'Failed to update microphone assignment'
                };
            }

            // Update associations
            const associations = await this.loadAssociations();
            const updatedAssociations = associations.map(assoc => {
                if (assoc.characterId === characterId && assoc.microphoneId === microphone.id) {
                    return {
                        ...assoc,
                        status: 'removed',
                        removedAt: new Date().toISOString()
                    };
                }
                return assoc;
            });

            await this.saveAssociations(updatedAssociations);

            logger.info(`Microphone ${microphone.id} removed from character ${characterId}`);

            return {
                success: true,
                character: await characterService.getCharacterById(characterId),
                microphone: updatedMicrophone
            };

        } catch (error) {
            logger.error('Error removing microphone from character:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Transfer microphone from one character to another
     * @param {number} fromCharacterId - Source character ID
     * @param {number} toCharacterId - Target character ID
     * @returns {Object} Transfer result
     */
    async transferMicrophone(fromCharacterId, toCharacterId) {
        try {
            // Validate both characters exist
            const fromCharacter = await characterService.getCharacterById(fromCharacterId);
            const toCharacter = await characterService.getCharacterById(toCharacterId);

            if (!fromCharacter || !toCharacter) {
                return {
                    success: false,
                    error: 'One or both characters not found'
                };
            }

            // Get microphone from source character
            const microphone = await this.getMicrophoneByCharacter(fromCharacterId);
            if (!microphone) {
                return {
                    success: false,
                    error: 'Source character has no microphone assigned'
                };
            }

            // Check if target character already has a microphone
            const existingMicrophone = await this.getMicrophoneByCharacter(toCharacterId);
            if (existingMicrophone) {
                return {
                    success: false,
                    error: 'Target character already has a microphone assigned'
                };
            }

            // Remove from source character
            const removeResult = await this.removeMicrophone(fromCharacterId);
            if (!removeResult.success) {
                return removeResult;
            }

            // Assign to target character
            const assignResult = await this.assignMicrophone(toCharacterId, microphone.id);
            if (!assignResult.success) {
                // Try to restore to original character
                await this.assignMicrophone(fromCharacterId, microphone.id);
                return {
                    success: false,
                    error: 'Failed to assign microphone to target character: ' + assignResult.error
                };
            }

            logger.info(`Microphone ${microphone.id} transferred from character ${fromCharacterId} to ${toCharacterId}`);

            return {
                success: true,
                microphone: microphone,
                fromCharacter: fromCharacter,
                toCharacter: toCharacter
            };

        } catch (error) {
            logger.error('Error transferring microphone:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get all character-microphone associations
     * @returns {Array} Array of associations with character and microphone details
     */
    async getAllAssociations() {
        try {
            const associations = await this.loadAssociations();
            const detailedAssociations = [];

            for (const assoc of associations) {
                if (assoc.status === 'active') {
                    const character = await characterService.getCharacterById(assoc.characterId);
                    const microphone = await this.microphoneService.getMicrophoneById(assoc.microphoneId);
                    
                    if (character && microphone) {
                        detailedAssociations.push({
                            ...assoc,
                            character: character,
                            microphone: microphone
                        });
                    }
                }
            }

            return detailedAssociations;
        } catch (error) {
            logger.error('Error getting all associations:', error);
            return [];
        }
    }
}

module.exports = CharacterMicrophoneService;
