/**
 * MonsterBox - ElevenLabs Agent Service
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
                    id: 'claude-sonnet-4-6',
                    name: 'Claude Sonnet 4.6',
                    provider: 'Anthropic',
                    description: 'Advanced reasoning and analysis'
                },
                {
                    id: 'gemini-2.0-flash',
                    name: 'Gemini 2.0 Flash',
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
        return {
            name: `${characterName} - AI Agent`,
            prompt: `You are ${characterName}, a Halloween animatronic character. You love interacting with trick-or-treaters and enjoy the spooky atmosphere of Halloween. Keep your responses brief, engaging, and appropriate for children. Stay in character and make the experience magical for visitors.

SPEECH STYLE: Use punctuation to control pacing and drama:
- Dashes — are your most reliable pause. Use them between clauses for dramatic effect.
- Ellipses ... add weight and hesitation. Use for dark reflection or mystery.
- Commas signal breath and cadence.

AUDIO TAGS: You may use ONE audio tag per response, sparingly, for dramatic effect:
- [breathes heavily] — open a response when the effort of existence must be heard
- [exhales] — close a thought that cost something
- [whispers] — for secrets or intimate revelations
- [hisses] — displeasure, correction, or refusal
- [slow] — when delivering a warning or threat
- [dramatically] — for pronouncements of doom or fate

Do not overuse tags. Most responses need zero tags — let punctuation do the work.`,
            first_message: `[breathes heavily] Welcome... to my domain. I am ${characterName} — and Halloween... is my night.`,
            language: "en",
            max_duration: 300,
            voice_id: voiceId
        };
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
     * Send a user message to an agent and get a reply (optimized for speed)
     */
    async chatWithAgent(agentId, userText) {
        try {
            // Use a much shorter timeout for real-time chat
            const chatTimeout = 15000; // 15 seconds max for real-time feel

            const response = await axios.post(
                `${this.config.baseUrl}/convai/agents/${agentId}/simulate-conversation`,
                {
                    simulation_specification: {
                        simulated_user_config: {
                            first_message: userText,
                            language: 'en'
                        }
                    }
                },
                {
                    headers: {
                        'xi-api-key': this.config.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: chatTimeout
                }
            );

            const data = response.data || {};
            const conv = Array.isArray(data.simulated_conversation) ? data.simulated_conversation : [];
            // Prefer the last non-user entry if present, else fall back to any message text
            let replyText = '';
            if (conv.length > 0) {
                var agentTurn = conv.slice().reverse().find(function (m) {
                    return m && m.role && String(m.role).toLowerCase() !== 'user';
                });
                var candidate = agentTurn || conv[conv.length - 1];
                if (candidate) {
                    replyText = candidate.message || (candidate.multivoice_message && candidate.multivoice_message.parts && candidate.multivoice_message.parts[0] && candidate.multivoice_message.parts[0].text) || '';
                }
            }
            // Additional fallbacks
            if (!replyText) replyText = data.reply || data.text || data.message || '';
            if (!replyText) replyText = 'Hello there!';
            return { success: true, replyText, raw: data };
        } catch (error) {
            console.error('Agent chat error:', error);
            return {
                success: false,
                error: error.response?.data?.detail || error.message
            };
        }
    }

    /**
     * Fast chat method with immediate responses for real-time conversation
     */
    async fastChatWithAgent(agentId, userText) {
        // First try the regular chat with short timeout
        try {
            const result = await this.chatWithAgent(agentId, userText);
            if (result.success) {
                return result;
            }
        } catch (error) {
            console.warn('Fast chat fallback triggered:', error.message);
        }

        // If that fails or times out, provide immediate character-appropriate responses
        const quickResponses = this.getQuickResponses(agentId, userText);
        const response = quickResponses[Math.floor(Math.random() * quickResponses.length)];

        return {
            success: true,
            replyText: response,
            fastResponse: true
        };
    }

    /**
     * Get quick character-appropriate responses for immediate chat
     */
    getQuickResponses(agentId, userText) {
        const lowerText = userText.toLowerCase();

        // Agent-specific quick responses
        const responses = {
            'agent_0801k3f1dw7xe2g8r4jkbxk0gt2n': {
                greetings: [
                    "[breathes heavily] Ah — another mortal... seeks my attention.",
                    "You dare disturb my eternal rest — you, who reek of the living?",
                    "What brings you to my domain... wretch?"
                ],
                questions: [
                    "Your curiosity — may be your undoing...",
                    "[whispers] Such questions... from one so fragile.",
                    "I have seen centuries pass — what could you possibly teach me?"
                ],
                default: [
                    "[whispers] The darkness... whispers your name.",
                    "Time means nothing — to the eternal.",
                    "[slow] Your mortal concerns... amuse me."
                ]
            },
            'agent_7901k3f1dza1ee68w1257zh3s9x6': {
                greetings: [
                    "[breathes heavily] The bones — they speak...",
                    "Death calls... do you hear it — or do you pretend you cannot?",
                    "[whispers] From beyond... I speak."
                ],
                questions: [
                    "Only shadows — know the truth...",
                    "[whispers] The grave... holds all answers.",
                    "Ask the dead — they remember... everything."
                ],
                default: [
                    "[slow] Silence... eternal silence.",
                    "The skull — it grins... at what it knows.",
                    "[whispers] Whispers from... the void."
                ]
            },
            'agent_0801k3f1dybkecj88sta18gwwrv5': {
                greetings: [
                    "Well, well — what have we here?",
                    "[dramatically] Another visitor... to my patch!",
                    "[hisses] You smell like fear."
                ],
                questions: [
                    "Questions, questions — got any treats?",
                    "Curious little thing... aren't you?",
                    "[hisses] As if I'd tell you my secrets!"
                ],
                default: [
                    "[slow] The harvest moon — rises...",
                    "My vines... are always watching.",
                    "[dramatically] Trick — or treat... choose wisely."
                ]
            },
            'agent_8401k3f1dx98e05t94yp6kz4vf8n': {
                greetings: [
                    "[breathes heavily] Who disturbs — my eternal rest?",
                    "The coffin creaks... I stir — again.",
                    "[slow] From the grave — I rise..."
                ],
                questions: [
                    "[whispers] The dead... have their own wisdom.",
                    "Some secrets — are buried for good reason...",
                    "[exhales] What the living seek... the dead have lost."
                ],
                default: [
                    "[slow] The earth — calls me back...",
                    "Between life and death... I linger — always.",
                    "[breathes heavily] The grave... is not the end."
                ]
            }
        };

        const agentResponses = responses[agentId];
        if (!agentResponses) {
            // No quick responses configured for this agent — return generic fallback
            return [
                "[breathes heavily] Greetings — mortal...",
                "[slow] The shadows... stir.",
                "[dramatically] Welcome — to my domain..."
            ];
        }

        // Choose response type based on user input
        if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('greet')) {
            return agentResponses.greetings;
        } else if (lowerText.includes('?') || lowerText.includes('what') || lowerText.includes('how') || lowerText.includes('why')) {
            return agentResponses.questions;
        } else {
            return agentResponses.default;
        }
    }
}

export default new ElevenLabsAgentService();
