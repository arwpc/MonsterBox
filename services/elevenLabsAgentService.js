/**
 * MonsterBox 4.0 - ElevenLabs Agent Service
 * Handles AI Agent CRUD operations and management
 */

import axios from 'axios';
import elevenLabsConfigService from './elevenLabsConfigService.js';

class ElevenLabsAgentService {
    constructor() {
        this.config = elevenLabsConfigService.getElevenLabsConfig();
    }

    /**
     * Get all agents
     */
    async getAgents() {
        try {
            const response = await axios.get(
                `${this.config.baseUrl}/convai/agents`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                agents: response.data.agents || []
            };
        } catch (error) {
            console.error('Error fetching agents:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message,
                agents: []
            };
        }
    }

    /**
     * Get a specific agent by ID
     */
    async getAgent(agentId) {
        try {
            const response = await axios.get(
                `${this.config.baseUrl}/convai/agents/${agentId}`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                agent: response.data
            };
        } catch (error) {
            console.error('Error fetching agent:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Create a new agent
     */
    async createAgent(agentData) {
        try {
            const response = await axios.post(
                `${this.config.baseUrl}/convai/agents`,
                agentData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                agent: response.data
            };
        } catch (error) {
            console.error('Error creating agent:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Update an existing agent
     */
    async updateAgent(agentId, agentData) {
        try {
            const response = await axios.patch(
                `${this.config.baseUrl}/convai/agents/${agentId}`,
                agentData,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                agent: response.data
            };
        } catch (error) {
            console.error('Error updating agent:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Delete an agent
     */
    async deleteAgent(agentId) {
        try {
            await axios.delete(
                `${this.config.baseUrl}/convai/agents/${agentId}`,
                {
                    headers: {
                        'xi-api-key': this.config.apiKey
                    },
                    timeout: this.config.timeout
                }
            );

            return {
                success: true,
                message: 'Agent deleted successfully'
            };
        } catch (error) {
            console.error('Error deleting agent:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Get available LLM models
     */
    async getAvailableModels() {
        // Based on ElevenLabs documentation
        return {
            success: true,
            models: [
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    provider: 'OpenAI',
                    description: 'Latest GPT-4 optimized model'
                },
                {
                    id: 'gpt-4o-mini',
                    name: 'GPT-4o Mini',
                    provider: 'OpenAI',
                    description: 'Faster, cost-effective GPT-4 variant'
                },
                {
                    id: 'claude-3-5-sonnet',
                    name: 'Claude 3.5 Sonnet',
                    provider: 'Anthropic',
                    description: 'Advanced reasoning and analysis'
                },
                {
                    id: 'gemini-1.5-flash',
                    name: 'Gemini 1.5 Flash',
                    provider: 'Google',
                    description: 'Fast and efficient multimodal model'
                }
            ]
        };
    }

    /**
     * Create agent template for MonsterBox characters
     */
    createAgentTemplate(characterName, voiceId) {
        const templates = {
            'Orlok': {
                name: `${characterName} - Vampire Agent`,
                prompt: `You are Orlok, an ancient and mysterious vampire. You speak in an old-fashioned, slightly menacing way, but you're actually quite charming to trick-or-treaters. You enjoy Halloween and appreciate children's costumes. Keep responses brief and atmospheric. Always stay in character as a vampire who has lived for centuries.`,
                first_message: "Ah, what have we here? A brave little mortal approaches my domain on this most hallowed of nights...",
                language: "en",
                max_duration: 300,
                voice_id: voiceId
            },
            'default': {
                name: `${characterName} - AI Agent`,
                prompt: `You are ${characterName}, a friendly Halloween character. You love interacting with trick-or-treaters and enjoy the spooky atmosphere of Halloween. Keep your responses brief, engaging, and appropriate for children. Stay in character and make the experience magical for visitors.`,
                first_message: `Hello there! I'm ${characterName}. Happy Halloween! What brings you to my spooky domain tonight?`,
                language: "en",
                max_duration: 300,
                voice_id: voiceId
            }
        };

        return templates[characterName] || templates['default'];
    }

    /**
     * Validate agent configuration
     */
    validateAgentConfig(agentData) {
        const errors = [];

        if (!agentData.name || agentData.name.trim().length === 0) {
            errors.push('Agent name is required');
        }

        if (!agentData.prompt || agentData.prompt.trim().length === 0) {
            errors.push('Agent prompt is required');
        }

        if (!agentData.voice_id) {
            errors.push('Voice ID is required');
        }

        if (agentData.max_duration && (agentData.max_duration < 30 || agentData.max_duration > 600)) {
            errors.push('Max duration must be between 30 and 600 seconds');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Test agent conversation
     */
    async testAgent(agentId, testMessage = "Hello, how are you?") {
        try {
            const result = await this.chatWithAgent(agentId, testMessage);
            return {
                success: result.success,
                message: result.success ? 'Agent test completed successfully' : 'Agent test failed',
                response: result.replyText || null,
                error: result.error || null
            };
        } catch (error) {
            console.error('Agent test error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send a user message to an agent and get a reply
     */
    async chatWithAgent(agentId, userText) {
        try {
            const response = await axios.post(
                `${this.config.baseUrl}/convai/agents/${agentId}/messages`,
                { text: userText },
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.config.timeout
                }
            );

            const data = response.data || {};
            const replyText = data.reply || data.text || data.message || '';
            return { success: true, replyText, raw: data };
        } catch (error) {
            console.error('Agent chat error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }
}

export default new ElevenLabsAgentService();
