/**
 * AI Prompt Generator Service
 * Generates personalized questions and statements based on ElevenLabs Agent configuration
 * Uses agent personality prompts and knowledge base to create relevant conversation starters
 * that will elicit interesting responses from the AI character
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import elevenLabsConfigService from './elevenLabsConfigService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIPromptGeneratorService {
    constructor() {
        // Cache for agent configurations and generated prompts
        this.agentConfigCache = {};
        this.generatedPromptsCache = {};
        this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    }

    /**
     * Get agent configuration from ElevenLabs API
     */
    async getAgentConfig(agentId) {
        // Check cache first
        if (this.agentConfigCache.has(agentId)) {
            const cached = this.agentConfigCache.get(agentId);
            if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
                console.log(`[AI Prompt Generator] Using cached agent config for ${agentId}`);
                return cached.data;
            }
        }

        try {
            const { apiKey, baseUrl } = elevenLabsConfigService.getElevenLabsConfig();

            // GET /v1/convai/agents/:agent_id
            const response = await axios.get(
                `${baseUrl}/convai/agents/${agentId}`,
                {
                    headers: {
                        'xi-api-key': apiKey
                    },
                    timeout: 10000
                }
            );

            const agentData = response.data;

            // Cache the configuration
            this.agentConfigCache.set(agentId, {
                data: agentData,
                timestamp: Date.now()
            });

            console.log(`[AI Prompt Generator] Fetched agent config for ${agentId}`);
            return agentData;
        } catch (error) {
            console.error(`[AI Prompt Generator] Failed to fetch agent config:`, error.message);
            return null;
        }
    }

    /**
     * Extract key themes and topics from agent configuration
     */
    extractAgentThemes(agentConfig) {
        const themes = {
            personality: [],
            knowledge: [],
            conversationStyle: []
        };

        // Extract from agent prompt
        if (agentConfig.conversation_config?.agent?.prompt?.prompt) {
            const prompt = agentConfig.conversation_config.agent.prompt.prompt;
            themes.personality.push(...this.extractKeyPhrases(prompt));
        }

        // Extract from first message
        if (agentConfig.conversation_config?.agent?.first_message) {
            const firstMessage = agentConfig.conversation_config.agent.first_message;
            themes.conversationStyle.push(...this.extractKeyPhrases(firstMessage));
        }

        // Extract from knowledge base if available
        if (agentConfig.conversation_config?.agent?.prompt?.knowledge_base) {
            const kb = agentConfig.conversation_config.agent.prompt.knowledge_base;
            if (Array.isArray(kb)) {
                kb.forEach(doc => {
                    if (typeof doc === 'string') {
                        themes.knowledge.push(...this.extractKeyPhrases(doc));
                    }
                });
            }
        }

        return themes;
    }

    /**
     * Extract key phrases from text using simple NLP techniques
     */
    extractKeyPhrases(text) {
        if (!text) return [];

        // Remove common words and extract meaningful phrases
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);

        // Extract statements about identity and interesting facts
        const keyPhrases = sentences
            .filter(s => {
                const lower = s.toLowerCase();
                return (
                    lower.includes('i am') ||
                    lower.includes('i was') ||
                    lower.includes('i have') ||
                    lower.includes('my') ||
                    lower.includes('you') ||
                    s.includes('?')
                );
            })
            .map(s => s.trim())
            .slice(0, 5);

        return keyPhrases;
    }

    /**
     * Generate prompts (questions and statements) based on extracted themes
     * Mix of questions, statements, and provocative prompts to elicit interesting responses
     */
    async generateThematicPrompts(characterName, agentConfig, themes) {
        const prompts = [];

        // Get agent personality prompt
        const personalityPrompt = agentConfig.conversation_config?.agent?.prompt?.prompt || '';
        const firstMessage = agentConfig.conversation_config?.agent?.first_message || '';

        // Generate prompts that align with the agent's personality
        const promptTemplates = [
            // Identity-based prompts
            { template: "Tell me what makes you unique", weight: 1.0 },
            { template: "I want to know your story", weight: 1.0 },
            { template: "Describe a typical day in your existence", weight: 0.9 },
            { template: "What's the most important thing about you?", weight: 0.9 },

            // Emotional/personality-driven prompts
            { template: "I heard you have a dark secret", weight: 0.9 },
            { template: "Tell me what you care about most", weight: 0.8 },
            { template: "Something seems different about you today", weight: 0.8 },
            { template: "You must have seen some terrible things", weight: 0.8 },
            { template: "I sense great power in you", weight: 0.7 },
            { template: "There's sadness in your eyes", weight: 0.7 },

            // Story and background prompts
            { template: "I've heard stories about your past", weight: 0.9 },
            { template: "Tell me about the moment that changed you forever", weight: 0.9 },
            { template: "You weren't always like this, were you?", weight: 0.9 },
            { template: "Someone told me about what happened to you", weight: 0.8 },
            { template: "I know you've been here a long time", weight: 0.7 },

            // Provocative statements
            { template: "They say you're dangerous", weight: 0.8 },
            { template: "I'm not afraid of you", weight: 0.8 },
            { template: "You're not as scary as they say", weight: 0.7 },
            { template: "I think there's more to you than meets the eye", weight: 0.7 },
            { template: "People don't understand you", weight: 0.7 },

            // Contextual prompts based on themes
            ...this.generateContextualPrompts(themes, personalityPrompt)
        ];

        // Sort by weight and select top prompts
        promptTemplates.sort((a, b) => b.weight - a.weight);

        // Take top 15 prompts
        for (let i = 0; i < Math.min(15, promptTemplates.length); i++) {
            prompts.push(promptTemplates[i].template);
        }

        // Ensure we have at least 10 prompts
        while (prompts.length < 10) {
            prompts.push(this.generateFallbackPrompts(characterName)[prompts.length % 5]);
        }

        return prompts;
    }

    /**
     * Generate contextual prompts based on personality themes
     * Returns questions, statements, and provocations
     */
    generateContextualPrompts(themes, personalityPrompt) {
        const prompts = [];
        const prompt = personalityPrompt.toLowerCase();

        // Vampire/dark creature themed
        if (prompt.includes('vampire') || prompt.includes('blood') || prompt.includes('immortal')) {
            prompts.push(
                { template: "You must have lived through centuries of history", weight: 1.0 },
                { template: "Tell me about your immortality", weight: 1.0 },
                { template: "I heard you knew someone from the old country", weight: 0.9 },
                { template: "The night must feel different to you", weight: 0.9 },
                { template: "Sunlight must be a distant memory", weight: 0.8 },
                { template: "Blood calls to you, doesn't it?", weight: 0.8 },
                { template: "I know what you really are", weight: 0.8 },
                { template: "Being a predator must be lonely", weight: 0.7 }
            );
        }

        // Undead/zombie/coffin themed
        if (prompt.includes('undead') || prompt.includes('coffin') || prompt.includes('grave') || prompt.includes('cemetery')) {
            prompts.push(
                { template: "Death wasn't the end for you", weight: 1.0 },
                { template: "Tell me what it's like between life and death", weight: 1.0 },
                { template: "You remember your last breath, don't you?", weight: 0.9 },
                { template: "The grave couldn't hold you", weight: 0.9 },
                { template: "I can see you're not fully here anymore", weight: 0.8 },
                { template: "Something keeps you bound to this world", weight: 0.8 },
                { template: "You're trapped between two worlds", weight: 0.7 },
                { template: "I heard you clawing at your coffin lid", weight: 0.7 }
            );
        }

        // Pumpkin/Halloween themed
        if (prompt.includes('pumpkin') || prompt.includes('jack') || prompt.includes('halloween')) {
            prompts.push(
                { template: "You're more than just a decoration", weight: 1.0 },
                { template: "Tell me about the magic that brought you to life", weight: 1.0 },
                { template: "Halloween must be special for you", weight: 0.9 },
                { template: "I've seen what you do on October nights", weight: 0.9 },
                { template: "That carved smile hides something darker", weight: 0.8 },
                { template: "You remember the pumpkin patch", weight: 0.8 },
                { template: "The harvest moon affects you, doesn't it?", weight: 0.7 },
                { template: "You're the spirit of Halloween itself", weight: 0.7 }
            );
        }

        // Ground/earth/buried themed
        if (prompt.includes('ground') || prompt.includes('earth') || prompt.includes('buried') || prompt.includes('underground')) {
            prompts.push(
                { template: "You know the secrets beneath our feet", weight: 1.0 },
                { template: "Tell me what you've found underground", weight: 1.0 },
                { template: "The earth speaks to you in ways others can't hear", weight: 0.9 },
                { template: "I felt the ground shake when you moved", weight: 0.9 },
                { template: "Darkness is your home", weight: 0.8 },
                { template: "You've been buried for so long", weight: 0.8 },
                { template: "The soil remembers everything", weight: 0.7 },
                { template: "Rising from the earth must be exhausting", weight: 0.7 }
            );
        }

        // Skeleton/skull themed
        if (prompt.includes('skeleton') || prompt.includes('skull') || prompt.includes('bones')) {
            prompts.push(
                { template: "You're older than you look", weight: 1.0 },
                { template: "Tell me about when you had flesh", weight: 1.0 },
                { template: "Those bones have a story to tell", weight: 0.9 },
                { template: "I can see right through you now", weight: 0.9 },
                { template: "You don't need skin to feel pain, do you?", weight: 0.8 },
                { template: "Your skull holds ancient memories", weight: 0.8 },
                { template: "Time has stripped everything away", weight: 0.7 },
                { template: "You're nothing but death walking", weight: 0.7 }
            );
        }

        // Horror/scary themed
        if (prompt.includes('scary') || prompt.includes('horror') || prompt.includes('terrify') || prompt.includes('fear')) {
            prompts.push(
                { template: "You feed on fear, don't you?", weight: 0.9 },
                { template: "Tell me about your victims", weight: 0.9 },
                { template: "I can see the darkness inside you", weight: 0.8 },
                { template: "You enjoy watching people run", weight: 0.8 },
                { template: "Screams are music to your ears", weight: 0.7 }
            );
        }

        // Monster/creature themed
        if (prompt.includes('monster') || prompt.includes('creature') || prompt.includes('beast')) {
            prompts.push(
                { template: "You're not human anymore, are you?", weight: 0.9 },
                { template: "Tell me about your transformation", weight: 0.9 },
                { template: "The monster inside you took over", weight: 0.8 },
                { template: "I see the beast beneath the surface", weight: 0.8 },
                { template: "You can't control it, can you?", weight: 0.7 }
            );
        }

        // Extract conversational topics from personality themes
        themes.personality.forEach(phrase => {
            const lower = phrase.toLowerCase();
            if (lower.includes('i am') || lower.includes('i was')) {
                // Convert "I am X" to "Tell me about being X"
                const aboutWhat = phrase.replace(/i am/i, '').replace(/i was/i, '').trim();
                if (aboutWhat.length > 5) {
                    prompts.push({
                        template: `Tell me about ${aboutWhat}`,
                        weight: 0.6
                    });
                }
            }
        });

        return prompts;
    }

    /**
     * Generate fallback prompts when agent config is not available
     * Mix of questions and statements for variety
     */
    generateFallbackPrompts(characterName) {
        return [
            `Tell me about yourself`,
            `What's your story?`,
            `I want to know more about you`,
            `What makes you unique?`,
            `Tell me something interesting`,
            `I heard you have secrets`,
            `You seem mysterious`,
            `What do you do here?`,
            `Tell me about this place`,
            `I'm curious about you`,
            `There's something different about you`,
            `I can sense your power`,
            `You've been here a long time`,
            `I know you have stories to tell`,
            `Something draws me to you`
        ];
    }

    /**
     * Get prompts for a specific character
     * Loads agent_id from character's tts-config.json and generates personalized prompts
     * @param {number} characterId - Character ID (e.g., 2 for character-2)
     * @param {string} characterName - Character display name
     * @param {string} animatronicName - Animatronic name for fallback
     * @returns {Promise<string[]>} Array of prompts (questions and statements)
     */
    async getPromptsForCharacter(characterId, characterName = null, animatronicName = null) {
        // Check cache first
        const cacheKey = `char_${characterId}`;
        if (this.generatedPromptsCache.has(cacheKey)) {
            const cached = this.generatedPromptsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
                console.log(`[AI Prompt Generator] Using cached prompts for character ${characterId}`);
                return cached.prompts;
            }
        }

        try {
            // Load character's TTS config to get agent ID
            const configPath = path.join(__dirname, '..', 'data', `character-${characterId}`, 'ai-config', 'tts-config.json');

            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.agent_id) {
                console.log(`[AI Prompt Generator] No agent_id found in tts-config.json for character ${characterId}`);
                return this.generateFallbackPrompts(characterName || animatronicName || 'Unknown');
            }

            // Get agent configuration
            const agentConfig = await this.getAgentConfig(config.agent_id);
            if (!agentConfig) {
                console.log(`[AI Prompt Generator] Could not fetch agent config for ${config.agent_id}`);
                return this.generateFallbackPrompts(characterName || animatronicName || 'Unknown');
            }

            // Extract themes from agent configuration
            const themes = this.extractAgentThemes(agentConfig);

            // Generate personalized prompts
            const prompts = await this.generateThematicPrompts(
                characterName || animatronicName || 'Unknown',
                agentConfig,
                themes
            );

            // Cache the generated prompts
            this.generatedPromptsCache.set(cacheKey, {
                prompts,
                timestamp: Date.now()
            });

            console.log(`[AI Prompt Generator] Generated ${prompts.length} personalized prompts for character ${characterId}`);
            return prompts;
        } catch (error) {
            console.error(`[AI Prompt Generator] Error loading character config:`, error.message);
            return this.generateFallbackPrompts(characterName || animatronicName || 'Unknown');
        }
    }

    /**
     * Clear caches (useful for testing or forcing refresh)
     */
    clearCaches() {
        this.agentConfigCache.clear();
        this.generatedPromptsCache.clear();
        console.log('[AI Prompt Generator] Caches cleared');
    }
}

// Convert to Map for better caching
AIPromptGeneratorService.prototype.agentConfigCache = new Map();
AIPromptGeneratorService.prototype.generatedPromptsCache = new Map();

// Singleton instance
const aiPromptGeneratorService = new AIPromptGeneratorService();

export default aiPromptGeneratorService;
