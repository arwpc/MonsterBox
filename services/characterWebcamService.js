const fs = require('fs').promises;
const path = require('path');
const logger = require('../scripts/logger');
const characterService = require('./characterService');
const partService = require('./partService');
const webcamService = require('./webcamService');

class CharacterWebcamService {
    constructor() {
        this.associationsPath = path.join(__dirname, '../data/character-webcam-associations.json');
    }

    /**
     * Load character-webcam associations
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
     * Save character-webcam associations
     * @param {Array} associations - Array of associations
     */
    async saveAssociations(associations) {
        await fs.writeFile(this.associationsPath, JSON.stringify(associations, null, 2));
    }

    /**
     * Assign webcam to character
     * @param {number} characterId - Character ID
     * @param {number} webcamId - Webcam part ID
     * @returns {Object} Assignment result
     */
    async assignWebcam(characterId, webcamId) {
        try {
            // Validate character exists
            const character = await characterService.getCharacterById(characterId);
            if (!character) {
                return {
                    success: false,
                    error: 'Character not found'
                };
            }

            // Validate webcam exists and is a webcam type
            const webcam = await partService.getPartById(webcamId);
            if (!webcam || webcam.type !== 'webcam') {
                return {
                    success: false,
                    error: 'Webcam not found or invalid type'
                };
            }

            // Check if character already has a webcam
            const existingAssociation = await this.getWebcamByCharacter(characterId);
            if (existingAssociation) {
                return {
                    success: false,
                    error: 'Character already has a webcam assigned',
                    existingWebcam: existingAssociation
                };
            }

            // Check if webcam is already assigned to another character
            const webcamAssignment = await this.getCharacterByWebcam(webcamId);
            if (webcamAssignment) {
                return {
                    success: false,
                    error: 'Webcam is already assigned to another character',
                    assignedCharacter: webcamAssignment
                };
            }

            // Update the webcam part to assign it to the character
            const updatedWebcam = await partService.updatePart(webcamId, {
                ...webcam,
                characterId: characterId
            });

            if (!updatedWebcam) {
                return {
                    success: false,
                    error: 'Failed to update webcam assignment'
                };
            }

            // Load and update associations
            const associations = await this.loadAssociations();
            const newAssociation = {
                id: associations.length > 0 ? Math.max(...associations.map(a => a.id)) + 1 : 1,
                characterId: characterId,
                webcamId: webcamId,
                assignedAt: new Date().toISOString(),
                status: 'active'
            };

            associations.push(newAssociation);
            await this.saveAssociations(associations);

            logger.info(`Webcam ${webcamId} assigned to character ${characterId}`);

            return {
                success: true,
                association: newAssociation,
                character: character,
                webcam: updatedWebcam
            };

        } catch (error) {
            logger.error('Error assigning webcam to character:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Remove webcam from character
     * @param {number} characterId - Character ID
     * @returns {Object} Removal result
     */
    async removeWebcam(characterId) {
        try {
            // Get current webcam assignment
            const webcam = await this.getWebcamByCharacter(characterId);
            if (!webcam) {
                return {
                    success: false,
                    error: 'No webcam assigned to this character'
                };
            }

            // Update the webcam part to remove character assignment
            const updatedWebcam = await partService.updatePart(webcam.id, {
                ...webcam,
                characterId: null
            });

            if (!updatedWebcam) {
                return {
                    success: false,
                    error: 'Failed to update webcam assignment'
                };
            }

            // Load and update associations
            const associations = await this.loadAssociations();
            const filteredAssociations = associations.filter(
                assoc => !(assoc.characterId === characterId && assoc.webcamId === webcam.id)
            );

            await this.saveAssociations(filteredAssociations);

            logger.info(`Webcam ${webcam.id} removed from character ${characterId}`);

            return {
                success: true,
                removedWebcam: webcam,
                characterId: characterId
            };

        } catch (error) {
            logger.error('Error removing webcam from character:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get webcam assigned to character
     * @param {number} characterId - Character ID
     * @returns {Object|null} Webcam part or null
     */
    async getWebcamByCharacter(characterId) {
        try {
            const parts = await partService.getPartsByCharacter(characterId);
            return parts.find(part => part.type === 'webcam') || null;
        } catch (error) {
            logger.error('Error getting webcam by character:', error);
            return null;
        }
    }

    /**
     * Get character assigned to webcam
     * @param {number} webcamId - Webcam part ID
     * @returns {Object|null} Character or null
     */
    async getCharacterByWebcam(webcamId) {
        try {
            const webcam = await partService.getPartById(webcamId);
            if (!webcam || webcam.type !== 'webcam' || !webcam.characterId) {
                return null;
            }

            return await characterService.getCharacterById(webcam.characterId);
        } catch (error) {
            logger.error('Error getting character by webcam:', error);
            return null;
        }
    }

    /**
     * Get all character-webcam associations
     * @returns {Array} Array of associations with character and webcam details
     */
    async getAllAssociations() {
        try {
            const associations = await this.loadAssociations();
            const detailedAssociations = [];

            for (const assoc of associations) {
                const character = await characterService.getCharacterById(assoc.characterId);
                const webcam = await partService.getPartById(assoc.webcamId);

                if (character && webcam) {
                    detailedAssociations.push({
                        ...assoc,
                        character: character,
                        webcam: webcam
                    });
                }
            }

            return detailedAssociations;
        } catch (error) {
            logger.error('Error getting all associations:', error);
            return [];
        }
    }

    /**
     * Validate character-webcam association constraints
     * @param {number} characterId - Character ID
     * @param {number} webcamId - Webcam part ID
     * @returns {Object} Validation result
     */
    async validateAssociation(characterId, webcamId) {
        try {
            const errors = [];

            // Check if character exists
            const character = await characterService.getCharacterById(characterId);
            if (!character) {
                errors.push('Character not found');
            }

            // Check if webcam exists and is correct type
            const webcam = await partService.getPartById(webcamId);
            if (!webcam) {
                errors.push('Webcam not found');
            } else if (webcam.type !== 'webcam') {
                errors.push('Part is not a webcam');
            }

            // Check single webcam constraint
            const existingWebcam = await this.getWebcamByCharacter(characterId);
            if (existingWebcam && existingWebcam.id !== webcamId) {
                errors.push('Character already has a different webcam assigned');
            }

            // Check webcam not assigned to another character
            if (webcam && webcam.characterId && webcam.characterId !== characterId) {
                const assignedCharacter = await characterService.getCharacterById(webcam.characterId);
                errors.push(`Webcam is already assigned to character: ${assignedCharacter?.char_name || 'Unknown'}`);
            }

            return {
                valid: errors.length === 0,
                errors: errors,
                character: character,
                webcam: webcam
            };

        } catch (error) {
            logger.error('Error validating association:', error);
            return {
                valid: false,
                errors: ['Validation error: ' + error.message]
            };
        }
    }

    /**
     * Transfer webcam from one character to another
     * @param {number} fromCharacterId - Source character ID
     * @param {number} toCharacterId - Target character ID
     * @returns {Object} Transfer result
     */
    async transferWebcam(fromCharacterId, toCharacterId) {
        try {
            // Get webcam from source character
            const webcam = await this.getWebcamByCharacter(fromCharacterId);
            if (!webcam) {
                return {
                    success: false,
                    error: 'Source character has no webcam assigned'
                };
            }

            // Check if target character already has a webcam
            const targetWebcam = await this.getWebcamByCharacter(toCharacterId);
            if (targetWebcam) {
                return {
                    success: false,
                    error: 'Target character already has a webcam assigned'
                };
            }

            // Remove from source character
            const removeResult = await this.removeWebcam(fromCharacterId);
            if (!removeResult.success) {
                return removeResult;
            }

            // Assign to target character
            const assignResult = await this.assignWebcam(toCharacterId, webcam.id);
            if (!assignResult.success) {
                // Try to restore to original character
                await this.assignWebcam(fromCharacterId, webcam.id);
                return {
                    success: false,
                    error: 'Failed to assign webcam to target character: ' + assignResult.error
                };
            }

            logger.info(`Webcam ${webcam.id} transferred from character ${fromCharacterId} to ${toCharacterId}`);

            return {
                success: true,
                webcam: webcam,
                fromCharacter: await characterService.getCharacterById(fromCharacterId),
                toCharacter: await characterService.getCharacterById(toCharacterId)
            };

        } catch (error) {
            logger.error('Error transferring webcam:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get association statistics
     * @returns {Object} Statistics about character-webcam associations
     */
    async getAssociationStats() {
        try {
            const allCharacters = await characterService.getAllCharacters();
            const allWebcams = (await partService.getAllParts()).filter(part => part.type === 'webcam');
            const associations = await this.getAllAssociations();

            const charactersWithWebcams = associations.length;
            const charactersWithoutWebcams = allCharacters.length - charactersWithWebcams;
            const unassignedWebcams = allWebcams.filter(webcam => !webcam.characterId).length;

            return {
                totalCharacters: allCharacters.length,
                totalWebcams: allWebcams.length,
                charactersWithWebcams: charactersWithWebcams,
                charactersWithoutWebcams: charactersWithoutWebcams,
                unassignedWebcams: unassignedWebcams,
                associations: associations.length
            };

        } catch (error) {
            logger.error('Error getting association stats:', error);
            return {
                totalCharacters: 0,
                totalWebcams: 0,
                charactersWithWebcams: 0,
                charactersWithoutWebcams: 0,
                unassignedWebcams: 0,
                associations: 0,
                error: error.message
            };
        }
    }
}

module.exports = new CharacterWebcamService();
