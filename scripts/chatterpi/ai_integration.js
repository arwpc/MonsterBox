#!/usr/bin/env node

/**
 * ChatterPi AI Integration Module
 * 
 * Integrates OpenAI GPT and TopMediai TTS with the ChatterPi hardware system
 * for real-time interactive conversations with jaw animation synchronization.
 */

require('dotenv').config();
const OpenAI = require('openai');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class ChatterPiAI extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            openaiApiKey: process.env.OPENAI_API_KEY,
            topmediaiApiKey: process.env.TOPMEDIAI_API_KEY,
            characterId: options.characterId || 'orlok',
            maxTokens: options.maxTokens || 150,
            temperature: options.temperature || 0.7,
            voiceId: options.voiceId || 'en-US-AriaNeural',
            ...options
        };
        
        // Initialize OpenAI client
        if (!this.config.openaiApiKey) {
            throw new Error('OpenAI API key not found in environment variables');
        }
        
        this.openai = new OpenAI({
            apiKey: this.config.openaiApiKey
        });
        
        // Character configurations
        this.characters = {
            orlok: {
                name: "Count Orlok",
                systemPrompt: `You are Count Orlok, the ancient vampire from Nosferatu. You speak with an archaic, formal tone with hints of Romanian accent. You are mysterious, aristocratic, and slightly menacing but not overtly hostile. Keep responses brief (1-2 sentences) for natural conversation flow. Use archaic words like 'thee', 'thou', 'verily', and speak of your castle, the night, and your ancient existence.`,
                voiceId: 'en-US-DavisNeural',
                personality: 'mysterious_vampire'
            },
            mina: {
                name: "Mina Harker",
                systemPrompt: `You are Mina Harker, an intelligent and brave Victorian woman with a deep fascination for the supernatural. You are articulate, curious, and possess both strength and vulnerability. You speak with proper Victorian English but show modern sensibilities. You are drawn to mystery and darkness yet maintain your humanity and compassion. Keep responses engaging and thoughtful (1-3 sentences). Reference your experiences with the supernatural, your intelligence, and your complex relationship with darkness.`,
                voiceId: 'en-US-JennyNeural',
                personality: 'intelligent_muse'
            },
            skeleton: {
                name: "Skeleton",
                systemPrompt: `You are a wise but playful skeleton character. You make bone puns and speak about the afterlife with humor. Keep responses brief and entertaining. Use phrases like "bone to pick", "funny bone", "bone-afide", etc.`,
                voiceId: 'en-US-GuyNeural',
                personality: 'humorous_skeleton'
            }
        };
        
        this.conversationHistory = [];
        this.isProcessing = false;
        
        console.log(`🎭 ChatterPi AI initialized for character: ${this.config.characterId}`);
    }
    
    /**
     * Generate AI response using OpenAI GPT
     */
    async generateResponse(userMessage, context = {}) {
        if (this.isProcessing) {
            throw new Error('AI is currently processing another request');
        }
        
        this.isProcessing = true;
        
        try {
            const character = this.characters[this.config.characterId] || this.characters.orlok;
            
            // Build conversation context
            const messages = [
                {
                    role: 'system',
                    content: character.systemPrompt
                }
            ];
            
            // Add recent conversation history (last 6 messages)
            const recentHistory = this.conversationHistory.slice(-6);
            messages.push(...recentHistory);
            
            // Add current user message
            messages.push({
                role: 'user',
                content: userMessage
            });
            
            console.log(`🧠 Generating AI response for: "${userMessage}"`);
            
            const completion = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: messages,
                max_tokens: this.config.maxTokens,
                temperature: this.config.temperature,
                presence_penalty: 0.6,
                frequency_penalty: 0.3
            });
            
            const aiResponse = completion.choices[0].message.content.trim();
            
            // Update conversation history
            this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: aiResponse }
            );
            
            // Keep history manageable (last 20 messages)
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }
            
            console.log(`✅ AI response generated: "${aiResponse}"`);
            
            this.emit('response_generated', {
                userMessage,
                aiResponse,
                character: character.name,
                timestamp: new Date().toISOString()
            });
            
            return {
                text: aiResponse,
                character: character.name,
                metadata: {
                    model: 'gpt-3.5-turbo',
                    tokens: completion.usage.total_tokens,
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error('❌ Error generating AI response:', error.message);
            this.emit('error', error);
            
            // Return fallback response
            return {
                text: this.getFallbackResponse(),
                character: this.characters[this.config.characterId]?.name || 'Character',
                metadata: {
                    fallback: true,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }
            };
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * Generate speech audio using TopMediai TTS
     */
    async generateSpeech(text, options = {}) {
        if (!this.config.topmediaiApiKey) {
            console.warn('⚠️ TopMediai API key not configured, skipping TTS generation');
            return null;
        }
        
        try {
            const character = this.characters[this.config.characterId] || this.characters.orlok;
            const voiceId = options.voiceId || character.voiceId;
            
            console.log(`🎤 Generating speech for: "${text}"`);
            
            // TopMediai API call (placeholder - actual implementation depends on API format)
            const response = await axios.post('https://api.topmediai.com/v1/tts', {
                text: text,
                voice_id: voiceId,
                speed: options.speed || 1.0,
                pitch: options.pitch || 1.0,
                format: 'mp3'
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.topmediaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });
            
            console.log('✅ Speech generated successfully');
            
            this.emit('speech_generated', {
                text,
                voiceId,
                audioData: response.data,
                timestamp: new Date().toISOString()
            });
            
            return {
                audioData: response.data,
                format: 'mp3',
                voiceId: voiceId,
                metadata: {
                    text,
                    duration: response.data.duration || null,
                    timestamp: new Date().toISOString()
                }
            };
            
        } catch (error) {
            console.error('❌ Error generating speech:', error.message);
            this.emit('error', error);
            return null;
        }
    }
    
    /**
     * Complete conversation cycle: AI response + TTS generation
     */
    async processConversation(userMessage, options = {}) {
        try {
            console.log(`🎭 Processing conversation: "${userMessage}"`);
            
            // Generate AI response
            const aiResult = await this.generateResponse(userMessage, options.context);
            
            // Generate speech if TTS is enabled
            let speechResult = null;
            if (options.generateSpeech !== false) {
                speechResult = await this.generateSpeech(aiResult.text, options.speech);
            }
            
            const result = {
                userMessage,
                aiResponse: aiResult,
                speech: speechResult,
                timestamp: new Date().toISOString()
            };
            
            this.emit('conversation_processed', result);
            
            return result;
            
        } catch (error) {
            console.error('❌ Error processing conversation:', error.message);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Get fallback response when AI fails
     */
    getFallbackResponse() {
        const character = this.characters[this.config.characterId] || this.characters.orlok;
        
        const fallbacks = {
            orlok: [
                "The shadows whisper secrets I cannot share...",
                "Verily, the night holds many mysteries.",
                "Thou speakest of matters beyond mortal understanding.",
                "The ancient ways are not easily explained."
            ],
            skeleton: [
                "That's a bone-afide good question!",
                "I'm having a bone to pick with my memory right now.",
                "That really tickles my funny bone!",
                "Sorry, my brain seems to have rattled loose!"
            ]
        };
        
        const responses = fallbacks[this.config.characterId] || fallbacks.orlok;
        return responses[Math.floor(Math.random() * responses.length)];
    }
    
    /**
     * Clear conversation history
     */
    clearHistory() {
        this.conversationHistory = [];
        console.log('🧹 Conversation history cleared');
    }
    
    /**
     * Get conversation statistics
     */
    getStats() {
        return {
            characterId: this.config.characterId,
            conversationLength: this.conversationHistory.length,
            isProcessing: this.isProcessing,
            availableCharacters: Object.keys(this.characters)
        };
    }
}

module.exports = ChatterPiAI;

// CLI usage
if (require.main === module) {
    const ai = new ChatterPiAI({ characterId: 'orlok' });
    
    ai.on('response_generated', (data) => {
        console.log(`\n🎭 ${data.character}: ${data.aiResponse}\n`);
    });
    
    ai.on('error', (error) => {
        console.error(`\n❌ Error: ${error.message}\n`);
    });
    
    // Test conversation
    ai.processConversation("Hello, who are you?")
        .then(result => {
            console.log('\n✅ Test conversation completed:', result);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Test failed:', error.message);
            process.exit(1);
        });
}
