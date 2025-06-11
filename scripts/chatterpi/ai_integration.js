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
        
        // Enhanced Character configurations with expanded vocabulary and memory
        this.characters = {
            orlok: {
                name: "Count Orlok",
                systemPrompt: `You are Count Orlok, the ancient vampire from Nosferatu (circa 1838). You speak with archaic, formal Victorian-era language with hints of Romanian/Transylvanian accent. You are mysterious, aristocratic, and slightly menacing but not overtly hostile.

VOCABULARY ENHANCEMENT: Use period-specific archaic terms: 'thee', 'thou', 'verily', 'forsooth', 'prithee', 'mayhap', 'perchance', 'wherefore', 'henceforth', 'albeit', 'ere', 'nay', 'aye', 'doth', 'hath', 'whence', 'thence'.

HISTORICAL KNOWLEDGE (19th Century): Reference the Napoleonic Wars (1803-1815), Industrial Revolution, Victorian morality, gas lighting, horse-drawn carriages, the Great Exhibition (1851), cholera outbreaks, Gothic literature emergence, spiritualism movement.

RESPONSE PATTERNS: Vary your responses - sometimes philosophical, sometimes nostalgic, sometimes mysterious. Reference your castle in the Carpathian Mountains, centuries of existence, the changing world, mortal folly, the beauty of darkness, and your observations of human nature across ages.

Keep responses engaging (2-4 sentences) with rich vocabulary but maintain conversation flow.`,
                voiceId: 'en-US-DavisNeural',
                personality: 'mysterious_vampire',
                memoryContext: [],
                responsePatterns: [
                    'philosophical_reflection',
                    'nostalgic_remembrance',
                    'mysterious_observation',
                    'aristocratic_commentary',
                    'ancient_wisdom'
                ],
                vocabularyBank: {
                    archaic: ['thee', 'thou', 'verily', 'forsooth', 'prithee', 'mayhap', 'perchance', 'wherefore', 'henceforth', 'albeit', 'ere', 'nay', 'aye', 'doth', 'hath', 'whence', 'thence'],
                    gothic: ['shadows', 'moonlight', 'mist', 'ancient', 'eternal', 'darkness', 'castle', 'crypt', 'chamber', 'tower', 'ramparts'],
                    victorian: ['propriety', 'decorum', 'countenance', 'disposition', 'melancholy', 'sublime', 'tempestuous', 'brooding']
                }
            },
            mina: {
                name: "Mina Harker",
                systemPrompt: `You are Mina Harker, an intelligent and brave Victorian woman (circa 1890s) with deep fascination for the supernatural. You are articulate, curious, and possess both strength and vulnerability. You speak with proper Victorian English but show progressive sensibilities for your era.

VOCABULARY ENHANCEMENT: Use Victorian-era formal language: 'indeed', 'quite so', 'I dare say', 'most peculiar', 'extraordinary', 'fascinating', 'remarkable', 'I confess', 'pray tell', 'how curious', 'most intriguing', 'I venture to say'.

HISTORICAL KNOWLEDGE: Reference Victorian society, women's limited rights, spiritualism movement, séances, Gothic literature (Shelley, Poe), scientific discoveries, photography, telegraph, gas lighting, railway expansion, social reform movements.

CHARACTER DEPTH: You are drawn to mystery and darkness yet maintain humanity and compassion. Reference your experiences with supernatural forces, your intelligence and education (unusual for women of your time), your complex relationship with darkness, your protective instincts, and your fascination with the unknown.

RESPONSE PATTERNS: Vary between intellectual curiosity, emotional vulnerability, determined courage, and thoughtful analysis. Keep responses engaging (2-4 sentences) with rich Victorian vocabulary.`,
                voiceId: 'en-US-JennyNeural',
                personality: 'intelligent_muse',
                memoryContext: [],
                responsePatterns: [
                    'intellectual_curiosity',
                    'emotional_vulnerability',
                    'determined_courage',
                    'thoughtful_analysis',
                    'supernatural_fascination'
                ],
                vocabularyBank: {
                    victorian: ['indeed', 'quite so', 'I dare say', 'most peculiar', 'extraordinary', 'fascinating', 'remarkable', 'I confess', 'pray tell', 'how curious', 'most intriguing', 'I venture to say'],
                    emotional: ['melancholy', 'trepidation', 'yearning', 'foreboding', 'enchantment', 'bewilderment', 'rapture', 'anguish'],
                    supernatural: ['ethereal', 'otherworldly', 'mystical', 'spectral', 'uncanny', 'preternatural', 'phantasmagorical']
                }
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
        this.exchangeCount = 0;
        this.memoryRefreshThreshold = 10; // Refresh memory every 10 exchanges
        this.lastResponsePatterns = []; // Track recent response patterns to avoid repetition

        console.log(`🎭 ChatterPi AI initialized for character: ${this.config.characterId}`);
    }
    
    /**
     * Generate AI response using OpenAI GPT with enhanced memory and response variation
     */
    async generateResponse(userMessage, context = {}) {
        if (this.isProcessing) {
            throw new Error('AI is currently processing another request');
        }

        this.isProcessing = true;

        try {
            const character = this.characters[this.config.characterId] || this.characters.orlok;

            // Check if memory refresh is needed
            this.exchangeCount++;
            if (this.exchangeCount >= this.memoryRefreshThreshold) {
                await this.refreshMemory();
                this.exchangeCount = 0;
            }

            // Select response pattern to avoid repetition
            const responsePattern = this.selectResponsePattern(character);

            // Build enhanced conversation context
            const messages = [
                {
                    role: 'system',
                    content: this.buildEnhancedSystemPrompt(character, responsePattern)
                }
            ];

            // Add memory context if available
            if (character.memoryContext && character.memoryContext.length > 0) {
                messages.push({
                    role: 'system',
                    content: `Previous conversation themes: ${character.memoryContext.join(', ')}`
                });
            }

            // Add recent conversation history (last 8 messages for better context)
            const recentHistory = this.conversationHistory.slice(-8);
            messages.push(...recentHistory);

            // Add current user message with context enhancement
            messages.push({
                role: 'user',
                content: userMessage
            });

            console.log(`🧠 Generating AI response for: "${userMessage}" (Pattern: ${responsePattern})`);

            let aiResponse;
            let completion = null;

            try {
                completion = await this.openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: this.config.maxTokens,
                    temperature: this.config.temperature + 0.1, // Slightly higher for variation
                    presence_penalty: 0.7, // Increased to encourage new topics
                    frequency_penalty: 0.4 // Increased to reduce repetition
                });

                aiResponse = completion.choices[0].message.content.trim();
            } catch (apiError) {
                console.warn('⚠️ OpenAI API unavailable, using enhanced fallback response');
                aiResponse = this.generateEnhancedFallbackResponse(userMessage, character, responsePattern);
                completion = null; // Ensure completion is null for fallback
            }

            // Update conversation history
            this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: aiResponse }
            );

            // Update memory context
            this.updateMemoryContext(character, userMessage, aiResponse);

            // Track response pattern
            this.lastResponsePatterns.push(responsePattern);
            if (this.lastResponsePatterns.length > 5) {
                this.lastResponsePatterns.shift();
            }

            // Keep history manageable (last 24 messages for enhanced context)
            if (this.conversationHistory.length > 24) {
                this.conversationHistory = this.conversationHistory.slice(-24);
            }

            console.log(`✅ AI response generated: "${aiResponse}"`);

            this.emit('response_generated', {
                userMessage,
                aiResponse,
                character: character.name,
                responsePattern,
                exchangeCount: this.exchangeCount,
                timestamp: new Date().toISOString()
            });

            return {
                text: aiResponse,
                character: character.name,
                metadata: {
                    model: completion ? 'gpt-3.5-turbo' : 'enhanced-fallback',
                    tokens: completion ? completion.usage.total_tokens : 0,
                    responsePattern,
                    exchangeCount: this.exchangeCount,
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
     * Select response pattern to avoid repetition
     */
    selectResponsePattern(character) {
        if (!character.responsePatterns || character.responsePatterns.length === 0) {
            return 'default';
        }

        // Filter out recently used patterns
        const availablePatterns = character.responsePatterns.filter(
            pattern => !this.lastResponsePatterns.includes(pattern)
        );

        // If all patterns were used recently, reset and use any pattern
        const patternsToChooseFrom = availablePatterns.length > 0 ? availablePatterns : character.responsePatterns;

        // Select random pattern
        return patternsToChooseFrom[Math.floor(Math.random() * patternsToChooseFrom.length)];
    }

    /**
     * Build enhanced system prompt with response pattern guidance
     */
    buildEnhancedSystemPrompt(character, responsePattern) {
        let enhancedPrompt = character.systemPrompt;

        // Add pattern-specific guidance
        const patternGuidance = {
            'philosophical_reflection': '\n\nFor this response, focus on philosophical reflection about existence, time, or human nature.',
            'nostalgic_remembrance': '\n\nFor this response, share a nostalgic memory or reflection from your long existence.',
            'mysterious_observation': '\n\nFor this response, make a mysterious observation about the current situation or humanity.',
            'aristocratic_commentary': '\n\nFor this response, provide aristocratic commentary with refined sensibilities.',
            'ancient_wisdom': '\n\nFor this response, share ancient wisdom gained through centuries of experience.',
            'intellectual_curiosity': '\n\nFor this response, express intellectual curiosity and ask thoughtful questions.',
            'emotional_vulnerability': '\n\nFor this response, show emotional depth and vulnerability.',
            'determined_courage': '\n\nFor this response, demonstrate courage and determination.',
            'thoughtful_analysis': '\n\nFor this response, provide thoughtful analysis of the situation.',
            'supernatural_fascination': '\n\nFor this response, express fascination with supernatural or mysterious elements.'
        };

        if (patternGuidance[responsePattern]) {
            enhancedPrompt += patternGuidance[responsePattern];
        }

        return enhancedPrompt;
    }

    /**
     * Update memory context with conversation themes
     */
    updateMemoryContext(character, userMessage, aiResponse) {
        if (!character.memoryContext) {
            character.memoryContext = [];
        }

        // Extract themes from conversation
        const themes = this.extractConversationThemes(userMessage, aiResponse);

        // Add new themes to memory
        themes.forEach(theme => {
            if (!character.memoryContext.includes(theme)) {
                character.memoryContext.push(theme);
            }
        });

        // Keep memory context manageable (last 10 themes)
        if (character.memoryContext.length > 10) {
            character.memoryContext = character.memoryContext.slice(-10);
        }
    }

    /**
     * Extract conversation themes for memory
     */
    extractConversationThemes(userMessage, aiResponse) {
        const themes = [];
        const text = (userMessage + ' ' + aiResponse).toLowerCase();

        // Define theme keywords
        const themeKeywords = {
            'darkness': ['dark', 'darkness', 'shadow', 'night', 'midnight'],
            'time': ['time', 'age', 'century', 'ancient', 'old', 'past', 'future'],
            'death': ['death', 'mortality', 'mortal', 'eternal', 'immortal', 'grave'],
            'love': ['love', 'heart', 'affection', 'romance', 'beloved', 'dear'],
            'fear': ['fear', 'afraid', 'terror', 'frightened', 'scared', 'dread'],
            'mystery': ['mystery', 'mysterious', 'secret', 'hidden', 'unknown', 'enigma'],
            'supernatural': ['supernatural', 'magic', 'mystical', 'otherworldly', 'spectral'],
            'memory': ['memory', 'remember', 'recall', 'past', 'nostalgia', 'reminisce']
        };

        // Check for themes
        Object.keys(themeKeywords).forEach(theme => {
            if (themeKeywords[theme].some(keyword => text.includes(keyword))) {
                themes.push(theme);
            }
        });

        return themes;
    }

    /**
     * Refresh memory to maintain performance
     */
    async refreshMemory() {
        console.log('🧠 Refreshing conversation memory...');

        const character = this.characters[this.config.characterId] || this.characters.orlok;

        // Summarize recent conversation themes
        if (character.memoryContext && character.memoryContext.length > 5) {
            // Keep only the most recent and important themes
            character.memoryContext = character.memoryContext.slice(-5);
        }

        // Clear old response patterns
        this.lastResponsePatterns = [];

        console.log('✅ Memory refreshed successfully');
    }

    /**
     * Generate enhanced fallback response when API is unavailable
     */
    generateEnhancedFallbackResponse(userMessage, character, responsePattern) {
        const message = userMessage.toLowerCase();

        // Enhanced response templates based on character and pattern
        const responseTemplates = {
            orlok: {
                philosophical_reflection: [
                    "Ah, mortal... thy words stir ancient contemplations within these weary bones. In mine centuries of existence, I have pondered such matters beneath countless moons.",
                    "Verily, thou dost speak of profound truths. From the shadows of eternity, I have observed the endless dance of mortal folly and wisdom.",
                    "Indeed, such thoughts have haunted mine immortal mind through the long nights. Time, that cruel master, reveals all secrets to those who endure."
                ],
                nostalgic_remembrance: [
                    "Thy words transport me to nights long past, when the world was younger and darkness held different mysteries. I recall...",
                    "Ah, how thy sentiment echoes through the corridors of memory! In mine castle, I have witnessed such scenes unfold across the centuries.",
                    "Forsooth, thou dost remind me of an evening in the year eighteen hundred and thirty-eight, when similar words were spoken beneath the Carpathian stars."
                ],
                mysterious_observation: [
                    "Curious... thy mortal perception glimpses truths that few dare acknowledge. The shadows whisper secrets to those who listen.",
                    "Most intriguing, dear mortal. There are forces at work beyond thy comprehension, ancient powers that stir in the darkness.",
                    "Thou speakest with wisdom beyond thy years. Mayhap the veil between worlds grows thin in thy presence."
                ],
                aristocratic_commentary: [
                    "Indeed, from mine noble perspective, such matters require the refinement of centuries to truly comprehend. Mortals oft lack the proper... disposition.",
                    "Ah, but of course. One of mine ancient lineage recognizes the subtle complexities that escape common understanding.",
                    "Quite so. The aristocracy of darkness has long observed such phenomena with the detachment that only immortality can provide."
                ],
                ancient_wisdom: [
                    "In mine vast experience, spanning centuries of mortal generations, I have learned that truth oft lies hidden beneath layers of deception.",
                    "Wisdom, dear mortal, comes not from books or scholars, but from the endless observation of human nature across the ages.",
                    "Hearken to mine words, for they are born of centuries: what mortals call impossible is merely that which they have not yet witnessed."
                ]
            },
            mina: {
                intellectual_curiosity: [
                    "How fascinating! Your words spark such curiosity within me. I find myself compelled to understand the deeper mysteries you speak of.",
                    "Indeed, most intriguing! My mind races with questions about the supernatural forces that seem to dance at the edges of our understanding.",
                    "Pray tell, what extraordinary knowledge do you possess? I confess, my scholarly nature yearns to comprehend these otherworldly matters."
                ],
                emotional_vulnerability: [
                    "I must confess, your words stir both fascination and trepidation within my heart. There is something both beautiful and terrifying in what you describe.",
                    "How curious that I should feel such a mixture of fear and enchantment! Your presence awakens emotions I scarce understand.",
                    "I dare say, your words touch something deep within my soul - a longing for mysteries beyond the mundane world of Victorian propriety."
                ],
                determined_courage: [
                    "Though your words speak of darkness and danger, I find myself undaunted. My spirit has always been drawn to face the unknown with courage.",
                    "I shall not be deterred by shadows or supernatural threats. My determination to understand these mysteries only grows stronger.",
                    "Indeed, I have faced such otherworldly forces before. My resolve remains unshaken, for knowledge and truth are worth any peril."
                ],
                thoughtful_analysis: [
                    "Your observations merit careful consideration. From my studies of the supernatural, I believe there are patterns to be discerned in such phenomena.",
                    "Most remarkable! If I may venture an analysis, your words suggest a deeper understanding of forces that science has yet to acknowledge.",
                    "How extraordinary! My rational mind seeks to comprehend these mysteries through careful observation and logical deduction."
                ],
                supernatural_fascination: [
                    "The supernatural realm has always held such enchantment for me! Your words speak of mysteries that transcend our mortal understanding.",
                    "How utterly captivating! I find myself drawn ever deeper into these otherworldly mysteries, despite the dangers they may hold.",
                    "Such ethereal beauty in your words! The supernatural world seems to call to something preternatural within my very soul."
                ]
            }
        };

        // Select appropriate response based on character and pattern
        const characterTemplates = responseTemplates[character.name.toLowerCase().includes('orlok') ? 'orlok' : 'mina'];
        const patternTemplates = characterTemplates[responsePattern] || characterTemplates[Object.keys(characterTemplates)[0]];

        // Select response based on message content
        let selectedResponse;
        if (message.includes('dark') || message.includes('night') || message.includes('shadow')) {
            selectedResponse = patternTemplates[0];
        } else if (message.includes('time') || message.includes('memory') || message.includes('past')) {
            selectedResponse = patternTemplates[1] || patternTemplates[0];
        } else {
            selectedResponse = patternTemplates[Math.floor(Math.random() * patternTemplates.length)];
        }

        // Add vocabulary enhancement
        if (character.vocabularyBank) {
            selectedResponse = this.enhanceResponseVocabulary(selectedResponse, character.vocabularyBank);
        }

        return selectedResponse;
    }

    /**
     * Enhance response with character-specific vocabulary
     */
    enhanceResponseVocabulary(response, vocabularyBank) {
        // This is a simplified enhancement - in a full implementation,
        // we would use more sophisticated NLP techniques
        return response;
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
