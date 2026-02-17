import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Character-aware Microphone Service
 * Handles character-specific microphone configurations and hardware management
 */
class MicrophoneService {
    constructor() {
        this.defaultMicrophoneConfig = {
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
            format: 'pcm_s16le'
        };
    }

    /**
     * Get character-specific microphones directory
     */
    async getMicrophonesDir() {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
        return path.resolve(appRoot, dataDir);
    }

    /**
     * Ensure microphones directory exists
     */
    async ensureDir() {
        const baseDir = await this.getMicrophonesDir();
        await fs.mkdir(baseDir, { recursive: true });
    }

    /**
     * Get all microphones for current character
     */
    async getAllMicrophones() {
        try {
            const baseDir = await this.getMicrophonesDir();
            const microphonesPath = path.join(baseDir, 'microphones.json');
            const data = await fs.readFile(microphonesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return empty array if file doesn't exist
            return [];
        }
    }

    /**
     * Get microphone by ID
     */
    async getMicrophoneById(id) {
        const microphones = await this.getAllMicrophones();
        return microphones.find(mic => mic.id === parseInt(id));
    }

    /**
     * Get available microphones (not assigned to other characters)
     */
    async getAvailableMicrophones() {
        const microphones = await this.getAllMicrophones();
        return microphones.filter(mic => mic.status === 'available' || mic.status === 'assigned');
    }

    /**
     * Create new microphone
     */
    async createMicrophone(microphoneData) {
        await this.ensureDir();
        const microphones = await this.getAllMicrophones();
        
        // Generate new ID
        const maxId = microphones.length > 0 ? Math.max(...microphones.map(m => m.id)) : 0;
        const newId = maxId + 1;

        const newMicrophone = {
            id: newId,
            name: microphoneData.name || `Microphone ${newId}`,
            deviceId: microphoneData.deviceId || 'default',
            type: microphoneData.type || 'system',
            status: 'assigned',
            characterId: microphoneData.characterId || null,
            config: {
                ...this.defaultMicrophoneConfig,
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
        return newMicrophone;
    }

    /**
     * Update microphone
     */
    async updateMicrophone(id, updates) {
        const microphones = await this.getAllMicrophones();
        const index = microphones.findIndex(mic => mic.id === parseInt(id));
        
        if (index === -1) {
            throw new Error(`Microphone with ID ${id} not found`);
        }

        microphones[index] = {
            ...microphones[index],
            ...updates,
            lastModified: new Date().toISOString()
        };

        await this.saveMicrophones(microphones);
        return microphones[index];
    }

    /**
     * Delete microphone
     */
    async deleteMicrophone(id) {
        const microphones = await this.getAllMicrophones();
        const filteredMicrophones = microphones.filter(mic => mic.id !== parseInt(id));
        
        if (filteredMicrophones.length === microphones.length) {
            throw new Error(`Microphone with ID ${id} not found`);
        }

        await this.saveMicrophones(filteredMicrophones);
        return true;
    }

    /**
     * Save microphones to file
     */
    async saveMicrophones(microphones) {
        await this.ensureDir();
        const baseDir = await this.getMicrophonesDir();
        const microphonesPath = path.join(baseDir, 'microphones.json');
        await fs.writeFile(microphonesPath, JSON.stringify(microphones, null, 2), 'utf8');
    }

    /**
     * Get microphone configuration for character
     */
    async getMicrophoneConfigForCharacter(characterId) {
        const microphones = await this.getAllMicrophones();
        const characterMicrophone = microphones.find(mic => 
            mic.characterId === parseInt(characterId) && mic.status === 'assigned'
        );
        
        return characterMicrophone ? characterMicrophone.config : this.defaultMicrophoneConfig;
    }

    /**
     * Assign microphone to character
     */
    async assignMicrophoneToCharacter(microphoneId, characterId) {
        return await this.updateMicrophone(microphoneId, {
            characterId: parseInt(characterId),
            status: 'assigned'
        });
    }

    /**
     * Unassign microphone from character
     */
    async unassignMicrophoneFromCharacter(microphoneId) {
        return await this.updateMicrophone(microphoneId, {
            characterId: null,
            status: 'available'
        });
    }
}

export default new MicrophoneService();
