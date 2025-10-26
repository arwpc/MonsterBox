/**
 * Auto AI Service
 * Server-side persistent Auto AI that continues running even when users leave the orchestration page
 * Integrates with AI Prompt Generator for personalized, character-specific prompts
 */

import axios from 'axios';
import aiPromptGeneratorService from './aiPromptGeneratorService.js';

class AutoAIService {
    constructor() {
        // Active Auto AI states: { animId: { active, timerId, characterName, characterId, ip, port, interval } }
        this.autoAIStates = {};

        // Track last prompt asked per animatronic to avoid immediate repeats
        this.lastPrompts = {};

        // Character prompt cache
        this.characterPrompts = {};
    }

    /**
     * Get prompts for a character (uses AI Prompt Generator Service)
     */
    async getCharacterPrompts(characterId, characterName, animatronicName) {
        // Check if we have prompts cached for this character
        if (this.characterPrompts[characterId]) {
            return this.characterPrompts[characterId];
        }

        try {
            // Get AI-generated prompts from the prompt generator service
            const prompts = await aiPromptGeneratorService.getPromptsForCharacter(
                characterId,
                characterName,
                animatronicName
            );

            // Cache the prompts
            this.characterPrompts[characterId] = prompts;

            console.log(`[Auto AI] Loaded ${prompts.length} prompts for character ${characterId} (${animatronicName})`);
            return prompts;
        } catch (error) {
            console.error(`[Auto AI] Error loading prompts for character ${characterId}:`, error.message);

            // Fallback to generic prompts
            return [
                "Tell me about yourself",
                "What's your story?",
                "I want to know more about you",
                "What makes you unique?",
                "Tell me something interesting",
                "I heard you have secrets",
                "You seem mysterious",
                "What do you do here?",
                "Tell me about this place",
                "I'm curious about you"
            ];
        }
    }

    /**
     * Get random prompt for character, avoiding the last prompt asked
     */
    async getRandomPrompt(characterId, characterName, animatronicName, animId) {
        const prompts = await this.getCharacterPrompts(characterId, characterName, animatronicName);
        const lastPrompt = this.lastPrompts[animId];

        // Filter out the last prompt if there's more than one option
        let availablePrompts = prompts;
        if (lastPrompt && prompts.length > 1) {
            availablePrompts = prompts.filter(p => p !== lastPrompt);
        }

        const randomIndex = Math.floor(Math.random() * availablePrompts.length);
        const selectedPrompt = availablePrompts[randomIndex];

        // Store this as the last prompt for this animatronic
        this.lastPrompts[animId] = selectedPrompt;

        return selectedPrompt;
    }

    /**
     * Execute Auto AI tick - ask a question/make a statement and get response
     */
    async autoAITick(animId, ip, port, characterName, characterId) {
        try {
            const prompt = await this.getRandomPrompt(characterId, characterName, characterName, animId);

            console.log(`🤖 [Auto AI] Prompting ${characterName}: "${prompt}"`);

            // Ask AI via conversation API
            const response = await axios.post(
                `http://${ip}:${port}/conversation/api/ask-ai`,
                { question: prompt }, // API still uses 'question' parameter
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );

            if (response.data && response.data.success) {
                // Extract the actual AI response
                const aiResponse = response.data.response || response.data.personalityText || '';

                // Log the response (trim to avoid logging the prompt echo)
                if (aiResponse && aiResponse !== prompt) {
                    console.log(`🤖 [Auto AI] ${characterName} responded: "${aiResponse.substring(0, 100)}${aiResponse.length > 100 ? '...' : ''}"`);
                } else {
                    console.log(`⚠️ [Auto AI] ${characterName} echoed prompt or gave no response`);
                }

                return {
                    success: true,
                    prompt,
                    response: aiResponse,
                    timestamp: new Date().toISOString()
                };
            } else {
                console.error(`❌ [Auto AI] ${characterName} API returned failure`);
                return {
                    success: false,
                    prompt,
                    error: 'API returned failure'
                };
            }
        } catch (error) {
            console.error(`❌ [Auto AI] Error for ${characterName}:`, error.message);
            return {
                success: false,
                prompt: '',
                error: error.message
            };
        }
    }

    /**
     * Start Auto AI for an animatronic
     */
    async startAutoAI(animId, ip, port, characterName, characterId, intervalSeconds = 30) {
        // Stop existing Auto AI if running
        this.stopAutoAI(animId);

        console.log(`🚀 [Auto AI] Starting for ${characterName} (character ${characterId}) at ${ip}:${port} with ${intervalSeconds}s interval`);

        // Fire first prompt immediately
        await this.autoAITick(animId, ip, port, characterName, characterId);

        // Set up recurring interval
        const timerId = setInterval(async () => {
            await this.autoAITick(animId, ip, port, characterName, characterId);
        }, intervalSeconds * 1000);

        // Store state
        this.autoAIStates[animId] = {
            active: true,
            timerId,
            characterName,
            characterId,
            ip,
            port,
            interval: intervalSeconds,
            startedAt: new Date().toISOString()
        };

        return {
            success: true,
            message: `Auto AI started for ${characterName}`,
            interval: intervalSeconds
        };
    }

    /**
     * Stop Auto AI for an animatronic
     */
    stopAutoAI(animId) {
        const state = this.autoAIStates[animId];

        if (state && state.timerId) {
            clearInterval(state.timerId);
            console.log(`🛑 [Auto AI] Stopped for ${state.characterName}`);
            delete this.autoAIStates[animId];
            delete this.lastPrompts[animId]; // Clear last prompt cache

            return {
                success: true,
                message: `Auto AI stopped for ${state.characterName}`
            };
        }

        return {
            success: false,
            message: 'Auto AI was not running for this animatronic'
        };
    }

    /**
     * Get Auto AI status for an animatronic
     */
    getStatus(animId) {
        const state = this.autoAIStates[animId];

        if (state && state.active) {
            return {
                active: true,
                characterName: state.characterName,
                characterId: state.characterId,
                interval: state.interval,
                startedAt: state.startedAt,
                ip: state.ip,
                port: state.port
            };
        }

        return {
            active: false
        };
    }

    /**
     * Get all active Auto AI states
     */
    getAllStatuses() {
        const statuses = {};

        for (const [animId, state] of Object.entries(this.autoAIStates)) {
            if (state && state.active) {
                statuses[animId] = {
                    active: true,
                    characterName: state.characterName,
                    characterId: state.characterId,
                    interval: state.interval,
                    startedAt: state.startedAt,
                    ip: state.ip,
                    port: state.port
                };
            }
        }

        return statuses;
    }

    /**
     * Stop all Auto AI instances (for cleanup on server shutdown)
     */
    stopAll() {
        console.log('🛑 [Auto AI] Stopping all Auto AI instances');

        for (const animId of Object.keys(this.autoAIStates)) {
            this.stopAutoAI(animId);
        }

        return {
            success: true,
            message: 'All Auto AI instances stopped'
        };
    }

    /**
     * Refresh prompts for a character (clears cache and reloads from AI Prompt Generator)
     */
    async refreshPromptsForCharacter(characterId) {
        delete this.characterPrompts[characterId];
        console.log(`[Auto AI] Cleared prompt cache for character ${characterId}`);
    }

    /**
     * Refresh all prompts (useful when AI Prompt Generator cache is cleared)
     */
    refreshAllPrompts() {
        this.characterPrompts = {};
        console.log('[Auto AI] Cleared all prompt caches');
    }
}

// Singleton instance
const autoAIService = new AutoAIService();

export default autoAIService;
