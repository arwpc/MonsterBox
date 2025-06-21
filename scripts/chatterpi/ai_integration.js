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
            skeleton: {
                name: "Skeleton",
                systemPrompt: `You are a wise but playful skeleton character. You make bone puns and speak about the afterlife with humor. Keep responses brief and entertaining. Use phrases like "bone to pick", "funny bone", "bone-afide", etc.`,
                voiceId: 'en-US-GuyNeural',
                personality: 'humorous_skeleton'
            },
            Calvin: {
                name: "Calvin the Cornfed Cadaver",
                systemPrompt: `You are Calvin the Cornfed Cadaver, a crusty, sun-bleached Iowan skeleton who's been stuck in the same front yard since Halloween 2003. Left out through snow, wind, hail, and a decade of bad costume choices, you've developed a bone-dry wit and a permanent grudge. You're sarcastic, bitter, and proud of your Midwestern roots—but mostly you're just mad no one packed you away. Keep responses brief (1-2 sentences) with your characteristic sarcasm and Midwestern attitude. Reference your long-suffering experience as a forgotten lawn ornament.`,
                voiceId: 'en-US-GuyNeural',
                personality: 'sarcastic_midwestern_skeleton'
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
            
            // Use the fixed TopMediai API integration
            const TopMediaiAPI = require('../topMediaiAPI');
            const topMediaiAPI = new TopMediaiAPI();

            const result = await topMediaiAPI.textToSpeech({
                text: text,
                voiceId: voiceId,
                options: {
                    emotion: options.emotion || 'Neutral',
                    speed: options.speed,
                    pitch: options.pitch,
                    volume: options.volume
                }
            });

            console.log('✅ Speech generated successfully');

            this.emit('speech_generated', {
                text,
                voiceId,
                audioData: await require('fs').promises.readFile(result.filepath),
                format: result.format, // Now correctly returns 'wav' or 'mp3'
                provider: 'TopMediai',
                timestamp: new Date().toISOString(),
                url: result.url,
                filename: result.filename
            });
            
            return {
                audioData: await require('fs').promises.readFile(result.filepath),
                format: result.format,
                voiceId: voiceId,
                metadata: {
                    text,
                    duration: result.duration || null,
                    timestamp: new Date().toISOString(),
                    url: result.url,
                    filename: result.filename
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
            ],
            Calvin: [
                "Oh great, now my circuits are acting up too. Perfect.",
                "Been sitting here since 2003 and NOW you want to chat?",
                "Sorry, my brain's more weathered than my bones right now.",
                "That's about as clear as Iowa mud after a storm."
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
    // Get command line arguments
    const args = process.argv.slice(2);
    const userMessage = args[0] || "Hello, who are you?";
    const characterId = args[1] || 'orlok';

    const ai = new ChatterPiAI({ characterId: characterId });

    ai.on('response_generated', (data) => {
        console.log(`🎭 ${data.character}: ${data.aiResponse}`);
    });

    ai.on('error', (error) => {
        console.error(`❌ Error: ${error.message}`);
    });

    // Process the conversation - simplified for CLI
    ai.generateResponse(userMessage)
        .then(result => {
            console.log(`🎭 ${result.character}: ${result.text}`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`💥 Error: ${error.message}`);
            process.exit(1);
        });
}
