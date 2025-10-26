/**
 * Auto AI Service
 * Server-side persistent Auto AI that continues running even when users leave the orchestration page
 */

import axios from 'axios';

class AutoAIService {
    constructor() {
        // Active Auto AI states: { animId: { active, timerId, characterName, ip, port, interval } }
        this.autoAIStates = {};
        
        // Character-specific question banks
        this.characterQuestions = {
            orlok: [
                "What is it like to live forever?",
                "Do you miss the sunlight?",
                "Tell me about your castle in Transylvania",
                "What is your favorite type of blood?",
                "How do you pass the endless nights?",
                "What do you think of modern technology?",
                "Do you have any vampire friends?",
                "What was the world like 500 years ago?",
                "Are you afraid of crosses and garlic?",
                "What is your greatest power?"
            ],
            coffin: [
                "How long have you been in that coffin?",
                "What does it feel like to be undead?",
                "Do you dream while you rest?",
                "Tell me about your life before death",
                "What scares an undead creature?",
                "Do you remember your funeral?",
                "What's the worst thing about being trapped?",
                "Can you feel the passage of time?",
                "What would you do if you were free?",
                "Do you have any regrets?"
            ],
            pumpkin: [
                "How did you become a living pumpkin?",
                "What's your favorite Halloween tradition?",
                "Do you like being carved?",
                "Tell me about the pumpkin patch you came from",
                "What's it like having a candle inside you?",
                "Are you friends with other pumpkins?",
                "What's your scariest Halloween memory?",
                "Do you rot like other pumpkins?",
                "What do you think about Thanksgiving?",
                "Can you grow new vines?"
            ],
            ground: [
                "What lurks beneath the earth?",
                "How deep can you dig?",
                "Tell me about the creatures you've met underground",
                "What does the soil taste like?",
                "Do you feel earthquakes coming?",
                "What's the darkest place you've been?",
                "Can you sense people walking above you?",
                "What treasures have you found buried?",
                "Are you afraid of drowning in underground water?",
                "What's your favorite thing about living below?"
            ],
            skull: [
                "What do you remember from when you had flesh?",
                "Does it hurt to be just bones?",
                "Who were you before you became a skull?",
                "Do your bones ache in the cold?",
                "What's the oldest memory in your skull?",
                "Can you hear without ears?",
                "What would you tell your living self?",
                "Do you miss having a heartbeat?",
                "What's it like to grin forever?",
                "Are you lonely being just bones?"
            ],
            default: [
                "What is your purpose?",
                "Tell me your story",
                "What brings you joy?",
                "What do you fear most?",
                "If you could change one thing, what would it be?",
                "What is your greatest memory?",
                "Do you believe in magic?",
                "What would you like humans to know about you?",
                "What makes you different from others?",
                "What is your secret wish?"
            ]
        };

        // Track last question asked per animatronic to avoid immediate repeats
        this.lastQuestions = {};
    }

    /**
     * Get character type from animatronic name
     */
    getCharacterType(name) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('orlok')) return 'orlok';
        if (nameLower.includes('coffin')) return 'coffin';
        if (nameLower.includes('pumpkin')) return 'pumpkin';
        if (nameLower.includes('ground')) return 'ground';
        if (nameLower.includes('skull')) return 'skull';
        return 'default';
    }

    /**
     * Get random question for character, avoiding the last question asked
     */
    getRandomQuestion(characterType, animId) {
        const questions = this.characterQuestions[characterType] || this.characterQuestions.default;
        const lastQuestion = this.lastQuestions[animId];
        
        // Filter out the last question if there's more than one option
        let availableQuestions = questions;
        if (lastQuestion && questions.length > 1) {
            availableQuestions = questions.filter(q => q !== lastQuestion);
        }
        
        const randomIndex = Math.floor(Math.random() * availableQuestions.length);
        const selectedQuestion = availableQuestions[randomIndex];
        
        // Store this as the last question for this animatronic
        this.lastQuestions[animId] = selectedQuestion;
        
        return selectedQuestion;
    }

    /**
     * Execute Auto AI tick - ask a question and get response
     */
    async autoAITick(animId, ip, port, name) {
        try {
            const characterType = this.getCharacterType(name);
            const question = this.getRandomQuestion(characterType, animId);
            
            console.log(`🤖 [Auto AI] Asking ${name}: "${question}"`);
            
            // Ask AI via conversation API
            const response = await axios.post(
                `http://${ip}:${port}/conversation/api/ask-ai`,
                { question },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );

            if (response.data && response.data.success) {
                // Extract the actual AI response (personalityText is the AI's response)
                const aiResponse = response.data.response || response.data.personalityText || '';
                
                // Log the response (trim to avoid logging the question echo)
                if (aiResponse && aiResponse !== question) {
                    console.log(`🤖 [Auto AI] ${name} responded: "${aiResponse.substring(0, 100)}${aiResponse.length > 100 ? '...' : ''}"`);
                } else {
                    console.log(`⚠️ [Auto AI] ${name} echoed question or gave no response`);
                }
                
                return {
                    success: true,
                    question,
                    response: aiResponse,
                    timestamp: new Date().toISOString()
                };
            } else {
                console.error(`❌ [Auto AI] ${name} API returned failure`);
                return {
                    success: false,
                    question,
                    error: 'API returned failure'
                };
            }
        } catch (error) {
            console.error(`❌ [Auto AI] Error for ${name}:`, error.message);
            return {
                success: false,
                question: '',
                error: error.message
            };
        }
    }

    /**
     * Start Auto AI for an animatronic
     */
    async startAutoAI(animId, ip, port, name, intervalSeconds = 30) {
        // Stop existing Auto AI if running
        this.stopAutoAI(animId);

        console.log(`🚀 [Auto AI] Starting for ${name} (${ip}:${port}) with ${intervalSeconds}s interval`);

        // Fire first question immediately
        await this.autoAITick(animId, ip, port, name);

        // Set up recurring interval
        const timerId = setInterval(async () => {
            await this.autoAITick(animId, ip, port, name);
        }, intervalSeconds * 1000);

        // Store state
        this.autoAIStates[animId] = {
            active: true,
            timerId,
            characterName: name,
            ip,
            port,
            interval: intervalSeconds,
            startedAt: new Date().toISOString()
        };

        return {
            success: true,
            message: `Auto AI started for ${name}`,
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
            delete this.lastQuestions[animId]; // Clear last question cache
            
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
}

// Singleton instance
const autoAIService = new AutoAIService();

export default autoAIService;
