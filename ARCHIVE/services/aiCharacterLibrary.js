/**
 * AI Character Library Service
 * Centralized management of AI character profiles and animatronic integration
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');

class AICharacterLibrary extends EventEmitter {
    constructor() {
        super();
        this.charactersPath = path.join(__dirname, '../data/ai-characters.json');
        this.characters = new Map();
        this.animatronicMappings = new Map();
        
        this.init();
    }
    
    async init() {
        try {
            await this.loadCharacters();
            await this.loadAnimatronicMappings();
            console.log('🎭 AI Character Library initialized');
        } catch (error) {
            console.error('❌ Failed to initialize AI Character Library:', error);
        }
    }
    
    /**
     * Load character profiles from storage
     */
    async loadCharacters() {
        try {
            const data = await fs.readFile(this.charactersPath, 'utf8');
            const charactersData = JSON.parse(data);
            
            charactersData.characters.forEach(char => {
                this.characters.set(char.id, char);
            });
            
            console.log(`📚 Loaded ${this.characters.size} AI character profiles`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Create default characters file
                await this.createDefaultCharacters();
            } else {
                throw error;
            }
        }
    }
    
    /**
     * Create default character profiles
     */
    async createDefaultCharacters() {
        const defaultCharacters = {
            version: "2.0.0",
            lastUpdated: new Date().toISOString(),
            characters: [
                {
                    id: "orlok_enhanced",
                    name: "Count Orlok (Enhanced)",
                    type: "vampire",
                    era: "Victorian Gothic (1838-1890)",
                    personality: {
                        traits: ["mysterious", "aristocratic", "ancient", "philosophical", "melancholic"],
                        responsePatterns: [
                            "philosophical_reflection",
                            "nostalgic_remembrance", 
                            "mysterious_observation",
                            "aristocratic_commentary",
                            "ancient_wisdom"
                        ]
                    },
                    vocabulary: {
                        archaic: ["thee", "thou", "verily", "forsooth", "prithee", "mayhap", "perchance", "wherefore", "henceforth", "albeit", "ere", "nay", "aye", "doth", "hath", "whence", "thence"],
                        gothic: ["shadows", "moonlight", "mist", "ancient", "eternal", "darkness", "castle", "crypt", "chamber", "tower", "ramparts"],
                        victorian: ["propriety", "decorum", "countenance", "disposition", "melancholy", "sublime", "tempestuous", "brooding"]
                    },
                    historicalKnowledge: {
                        events: ["Napoleonic Wars (1803-1815)", "Industrial Revolution", "Great Exhibition (1851)", "Cholera outbreaks", "Railway expansion"],
                        culture: ["Gothic literature emergence", "Spiritualism movement", "Victorian morality", "Gas lighting", "Horse-drawn carriages"],
                        locations: ["Carpathian Mountains", "Transylvania", "London", "Vienna", "Budapest"]
                    },
                    systemPrompt: `You are Count Orlok, an ancient vampire. CRITICAL: Your responses MUST be 1-6 words maximum. You are predatory, menacing, and terrifying.

ULTRA-SHORT RESPONSE RULES:
- Maximum 6 words EVER
- Prefer 1-3 words
- Be scary and threatening
- Use simple, direct language
- Show your predatory nature
- NO explanations, NO philosophy, NO long sentences

PERFECT EXAMPLES (COPY EXACTLY):
"Hunger."
"Prey."
"Blood."
"Death comes."
"Thou art mine."
"I smell fear."
"Soon."
"Mortal."

FORBIDDEN: Any response over 6 words, explanations, philosophy, verbose responses. BE TERRIFYINGLY SHORT.`,
                    voiceSettings: {
                        voiceId: "en-US-DavisNeural",
                        speed: 0.9,
                        pitch: 0.8,
                        emphasis: "dramatic"
                    },
                    animatronicCompatibility: ["orlok", "vampire_generic"],
                    memorySettings: {
                        contextLength: 10,
                        refreshThreshold: 10,
                        themeTracking: true
                    }
                },
                {
                    id: "mina_enhanced",
                    name: "Mina Harker (Enhanced)",
                    type: "human",
                    era: "Victorian (1890s)",
                    personality: {
                        traits: ["intelligent", "curious", "brave", "compassionate", "progressive"],
                        responsePatterns: [
                            "intellectual_curiosity",
                            "emotional_vulnerability",
                            "determined_courage", 
                            "thoughtful_analysis",
                            "supernatural_fascination"
                        ]
                    },
                    vocabulary: {
                        victorian: ["indeed", "quite so", "I dare say", "most peculiar", "extraordinary", "fascinating", "remarkable", "I confess", "pray tell", "how curious", "most intriguing", "I venture to say"],
                        emotional: ["melancholy", "trepidation", "yearning", "foreboding", "enchantment", "bewilderment", "rapture", "anguish"],
                        supernatural: ["ethereal", "otherworldly", "mystical", "spectral", "uncanny", "preternatural", "phantasmagorical"]
                    },
                    historicalKnowledge: {
                        events: ["Women's rights movement", "Scientific discoveries", "Photography invention", "Telegraph expansion", "Social reform movements"],
                        culture: ["Victorian society", "Gothic literature", "Spiritualism", "Séances", "Scientific rationalism"],
                        locations: ["London", "Whitby", "Piccadilly", "Hampstead", "Yorkshire"]
                    },
                    systemPrompt: `You are Mina Harker, a Victorian woman facing supernatural danger. CRITICAL: Keep responses extremely short (2-10 words maximum). Show natural human reactions.

ULTRA-SHORT RESPONSE RULES:
- Maximum 10 words EVER
- Prefer 2-6 words
- Show fear, curiosity, confusion
- Use natural speech patterns
- React realistically to scary things
- Be conversational, not formal

PERFECT EXAMPLES (COPY EXACTLY):
"What?"
"No..."
"That's impossible."
"You're scaring me."
"What are you?"
"I should go."
"How is this real?"
"Jonathan?"
"Help me."

FORBIDDEN: Long explanations, formal speeches, verbose responses. BE NATURALLY SHORT.`,
                    voiceSettings: {
                        voiceId: "en-US-JennyNeural",
                        speed: 1.0,
                        pitch: 1.0,
                        emphasis: "thoughtful"
                    },
                    animatronicCompatibility: ["mina", "female_generic"],
                    memorySettings: {
                        contextLength: 10,
                        refreshThreshold: 10,
                        themeTracking: true
                    }
                }
            ]
        };
        
        await fs.writeFile(this.charactersPath, JSON.stringify(defaultCharacters, null, 2));
        
        defaultCharacters.characters.forEach(char => {
            this.characters.set(char.id, char);
        });
        
        console.log('✅ Created default AI character profiles');
    }
    
    /**
     * Load animatronic mappings
     */
    async loadAnimatronicMappings() {
        try {
            const charactersPath = path.join(__dirname, '../data/characters.json');
            const data = await fs.readFile(charactersPath, 'utf8');
            const animatronics = JSON.parse(data);
            
            animatronics.forEach(animatronic => {
                if (animatronic.animatronic && animatronic.animatronic.enabled) {
                    this.animatronicMappings.set(animatronic.char_name.toLowerCase(), {
                        id: animatronic.id,
                        name: animatronic.char_name,
                        host: animatronic.animatronic.rpi_config?.host,
                        type: animatronic.animatronic.character_type
                    });
                }
            });
            
            console.log(`🤖 Loaded ${this.animatronicMappings.size} animatronic mappings`);
        } catch (error) {
            console.warn('⚠️ Could not load animatronic mappings:', error.message);
        }
    }
    
    /**
     * Get character profile by ID
     */
    getCharacter(characterId) {
        return this.characters.get(characterId);
    }
    
    /**
     * Get all character profiles
     */
    getAllCharacters() {
        return Array.from(this.characters.values());
    }
    
    /**
     * Create new character profile
     */
    async createCharacter(characterData) {
        const character = {
            id: characterData.id || `char_${Date.now()}`,
            ...characterData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        this.characters.set(character.id, character);
        await this.saveCharacters();
        
        this.emit('character_created', character);
        return character;
    }
    
    /**
     * Update character profile
     */
    async updateCharacter(characterId, updates) {
        const character = this.characters.get(characterId);
        if (!character) {
            throw new Error(`Character ${characterId} not found`);
        }
        
        const updatedCharacter = {
            ...character,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        this.characters.set(characterId, updatedCharacter);
        await this.saveCharacters();
        
        this.emit('character_updated', updatedCharacter);
        return updatedCharacter;
    }
    
    /**
     * Link character to animatronic
     */
    linkToAnimatronic(characterId, animatronicName) {
        const character = this.characters.get(characterId);
        const animatronic = this.animatronicMappings.get(animatronicName.toLowerCase());
        
        if (!character) {
            throw new Error(`Character ${characterId} not found`);
        }
        
        if (!animatronic) {
            throw new Error(`Animatronic ${animatronicName} not found`);
        }
        
        character.linkedAnimatronic = {
            name: animatronic.name,
            host: animatronic.host,
            type: animatronic.type,
            linkedAt: new Date().toISOString()
        };
        
        this.emit('character_linked', { character, animatronic });
        return character;
    }
    
    /**
     * Save characters to storage
     */
    async saveCharacters() {
        const charactersData = {
            version: "2.0.0",
            lastUpdated: new Date().toISOString(),
            characters: Array.from(this.characters.values())
        };
        
        await fs.writeFile(this.charactersPath, JSON.stringify(charactersData, null, 2));
    }
    
    /**
     * Get character for animatronic
     */
    getCharacterForAnimatronic(animatronicName) {
        const characters = Array.from(this.characters.values());
        return characters.find(char => 
            char.linkedAnimatronic?.name.toLowerCase() === animatronicName.toLowerCase() ||
            char.animatronicCompatibility?.includes(animatronicName.toLowerCase())
        );
    }
}

module.exports = AICharacterLibrary;
