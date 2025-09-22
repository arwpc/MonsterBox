/**
 * MonsterBox 4.0 - ElevenLabs Configuration Service
 * Secure API key management and ElevenLabs-specific configuration
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ElevenLabsConfigService {
    constructor() {
        this.config = {};
        this.loadEnvironment();
    }

    /**
     * Load environment variables from .env file
     */
    loadEnvironment() {
        const envPath = path.join(__dirname, '..', '.env');

        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');

            lines.forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    if (key && valueParts.length > 0) {
                        let value = valueParts.join('=');

                        // Remove inline comments (everything after # that's not inside quotes)
                        const commentIndex = value.indexOf('#');
                        if (commentIndex !== -1) {
                            // Check if # is inside quotes
                            const beforeComment = value.substring(0, commentIndex);
                            const quoteCount = (beforeComment.match(/"/g) || []).length;
                            if (quoteCount % 2 === 0) {
                                // Even number of quotes means # is outside quotes, so it's a comment
                                value = value.substring(0, commentIndex).trim();
                            }
                        }

                        // Remove quotes if present
                        value = value.replace(/^["']|["']$/g, '');
                        this.config[key.trim()] = value;
                    }
                }
            });
        }

        // Override with actual environment variables
        Object.keys(process.env).forEach(key => {
            this.config[key] = process.env[key];
        });
    }

    /**
     * Get ElevenLabs API configuration
     */
    getElevenLabsConfig() {
        let apiKey = this.config.ELEVENLABS_API_KEY;

        // Secure file-based fallback: /etc/monsterbox/elevenlabs.key (chmod 600)
        if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
            try {
                const keyPath = '/etc/monsterbox/elevenlabs.key';
                if (fs.existsSync(keyPath)) {
                    const raw = fs.readFileSync(keyPath, 'utf8');
                    const k = (raw || '').trim();
                    if (k) apiKey = k;
                }
            } catch (_) { /* ignore */ }
        }

        if (!apiKey || apiKey === 'your_elevenlabs_api_key_here') {
            throw new Error('ElevenLabs API key not configured. Set ELEVENLABS_API_KEY or provide /etc/monsterbox/elevenlabs.key (600).');
        }

        return {
            apiKey: apiKey,
            baseUrl: this.config.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1',
            timeout: parseInt(this.config.WEBSOCKET_TIMEOUT) || 30000,
            conversationTimeout: parseInt(this.config.ELEVENLABS_CONVERSATION_TIMEOUT) || 120000,
            reconnectAttempts: parseInt(this.config.WEBSOCKET_RECONNECT_ATTEMPTS) || 3
        };
    }

    /**
     * Get audio configuration
     */
    getAudioConfig() {
        return {
            sampleRate: parseInt(this.config.AUDIO_SAMPLE_RATE) || 44100,
            channels: parseInt(this.config.AUDIO_CHANNELS) || 1,
            format: this.config.AUDIO_FORMAT || 'wav'
        };
    }

    /**
     * Validate ElevenLabs API key format
     */
    validateElevenLabsApiKey(apiKey) {
        if (!apiKey) return false;
        if (apiKey === 'your_elevenlabs_api_key_here') return false;
        if (!apiKey.startsWith('sk_')) return false;
        if (apiKey.length < 20) return false;
        return true;
    }

    /**
     * Check if ElevenLabs is properly configured
     */
    isElevenLabsConfigured() {
        try {
            const config = this.getElevenLabsConfig();
            return this.validateElevenLabsApiKey(config.apiKey);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get masked API key for display (security)
     */
    getMaskedApiKey() {
        try {
            const config = this.getElevenLabsConfig();
            const key = config.apiKey;
            if (key.length > 8) {
                return key.substring(0, 8) + '...' + key.substring(key.length - 4);
            }
            return '***';
        } catch (error) {
            return 'Not configured';
        }
    }
}

// Export singleton instance
export default new ElevenLabsConfigService();
