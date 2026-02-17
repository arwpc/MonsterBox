import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readConfig } from './configService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Character-aware Audio Configuration Service
 * Handles character-specific audio settings including microphones, speakers, STT, TTS, and jaw animation
 */
class CharacterAudioConfigService {
    constructor() {
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
                vadThreshold: 0.40,
                silenceDuration: 200,
                prefixPadding: 300
            },
            microphoneSTTConfigs: {},
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
            speaker: {
                defaultSpeakerId: null,
                audioDeviceId: 'default',
                volume: 85,
                enabled: true
            }
        };
    }

    /**
     * Get character-specific audio configuration directory
     */
    async getAudioConfigDir() {
        const cfg = await readConfig();
        const appRoot = path.resolve(__dirname, '..');
        const dataDir = cfg && cfg.dataPath ? cfg.dataPath : 'data';
        return path.resolve(appRoot, dataDir);
    }

    /**
     * Ensure audio configuration directory exists
     */
    async ensureDir() {
        const baseDir = await this.getAudioConfigDir();
        await fs.mkdir(baseDir, { recursive: true });
    }

    /**
     * Get character audio configuration
     */
    async getCharacterAudioConfig() {
        try {
            const baseDir = await this.getAudioConfigDir();
            const configPath = path.join(baseDir, 'audio-config.json');
            const data = await fs.readFile(configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return default config if file doesn't exist
            return {
                ...this.defaultConfig,
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                characterId: null,
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };
        }
    }

    /**
     * Save character audio configuration
     */
    async saveCharacterAudioConfig(config) {
        await this.ensureDir();
        const baseDir = await this.getAudioConfigDir();
        const configPath = path.join(baseDir, 'audio-config.json');
        
        const updatedConfig = {
            ...config,
            lastModified: new Date().toISOString()
        };
        
        await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
        return updatedConfig;
    }

    /**
     * Update specific audio configuration section
     */
    async updateAudioConfig(section, updates) {
        const config = await this.getCharacterAudioConfig();
        config[section] = { ...config[section], ...updates };
        return await this.saveCharacterAudioConfig(config);
    }

    /**
     * Get microphone configuration
     */
    async getMicrophoneConfig() {
        const config = await this.getCharacterAudioConfig();
        return config.microphone || this.defaultConfig.microphone;
    }

    /**
     * Get speaker configuration
     */
    async getSpeakerConfig() {
        const config = await this.getCharacterAudioConfig();
        return config.speaker || this.defaultConfig.speaker;
    }

    /**
     * Get STT configuration
     */
    async getSTTConfig() {
        const config = await this.getCharacterAudioConfig();
        return config.stt || this.defaultConfig.stt;
    }

    /**
     * Get jaw animation configuration
     */
    async getJawAnimationConfig() {
        const config = await this.getCharacterAudioConfig();
        return config.jawAnimation || this.defaultConfig.jawAnimation;
    }

    /**
     * Get audio processing configuration
     */
    async getAudioProcessingConfig() {
        const config = await this.getCharacterAudioConfig();
        return config.audioProcessing || this.defaultConfig.audioProcessing;
    }
}

export default new CharacterAudioConfigService();
