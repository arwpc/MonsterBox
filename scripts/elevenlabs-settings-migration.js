#!/usr/bin/env node
/**
 * ElevenLabs Settings Migration Utility
 * Extracts and migrates all existing AI configurations to ElevenLabs format
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

class ElevenLabsSettingsMigration {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.migrationResults = {
            characters: [],
            errors: [],
            summary: {}
        };
    }

    /**
     * Main migration process
     */
    async migrate() {
        console.log('🔄 Starting ElevenLabs Settings Migration');
        console.log('=====================================');

        try {
            // Load all configuration sources
            const sources = await this.loadAllSources();
            
            // Extract character configurations
            const characters = await this.extractCharacterConfigurations(sources);
            
            // Map to ElevenLabs format
            const elevenLabsConfigs = await this.mapToElevenLabsFormat(characters);
            
            // Save migration results
            await this.saveMigrationResults(elevenLabsConfigs);
            
            // Generate summary
            this.generateSummary();
            
            console.log('\n✅ Migration completed successfully');
            return this.migrationResults;
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            this.migrationResults.errors.push({
                type: 'migration_failure',
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Load all configuration sources
     */
    async loadAllSources() {
        console.log('\n📂 Loading configuration sources...');
        
        const sources = {};
        
        try {
            // Main character configurations
            sources.characters = JSON.parse(
                await fs.readFile(path.join(this.dataDir, 'characters.json'), 'utf8')
            );
            console.log(`   ✅ Loaded ${sources.characters.length} characters from characters.json`);

            // AI character enhancements
            sources.aiCharacters = JSON.parse(
                await fs.readFile(path.join(this.dataDir, 'ai-characters.json'), 'utf8')
            );
            console.log(`   ✅ Loaded ${sources.aiCharacters.characters.length} enhanced AI characters`);

            // Assistant configurations
            sources.assistants = JSON.parse(
                await fs.readFile(path.join(this.dataDir, 'assistants-config.json'), 'utf8')
            );
            console.log(`   ✅ Loaded ${Object.keys(sources.assistants.assistants).length} assistant configurations`);

            // AI personalities
            try {
                sources.personalities = JSON.parse(
                    await fs.readFile(path.join(this.dataDir, 'ai-personalities.json'), 'utf8')
                );
                console.log(`   ✅ Loaded ${sources.personalities.length} AI personalities`);
            } catch (error) {
                console.log('   ⚠️  ai-personalities.json not found, skipping');
                sources.personalities = [];
            }

            // Character audio configurations
            try {
                sources.audioConfig = JSON.parse(
                    await fs.readFile(path.join(this.dataDir, 'character-audio-config.json'), 'utf8')
                );
                console.log(`   ✅ Loaded audio config for ${Object.keys(sources.audioConfig.characters).length} characters`);
            } catch (error) {
                console.log('   ⚠️  character-audio-config.json not found, skipping');
                sources.audioConfig = { characters: {} };
            }

            return sources;
            
        } catch (error) {
            console.error('❌ Failed to load configuration sources:', error.message);
            throw error;
        }
    }

    /**
     * Extract character configurations from all sources
     */
    async extractCharacterConfigurations(sources) {
        console.log('\n🔍 Extracting character configurations...');
        
        const characters = [];
        
        // Process each main character
        for (const character of sources.characters) {
            console.log(`\n   Processing character: ${character.char_name} (ID: ${character.id})`);
            
            const config = {
                // Basic character info
                id: character.id,
                name: character.char_name,
                description: character.char_description,
                
                // OpenAI Assistant info
                openaiAssistantId: character.openaiAssistantId,
                lastAssistantUpdate: character.lastAssistantUpdate,
                
                // AI configuration
                aiConfig: character.aiConfig || {},
                
                // ChatterPi configuration
                chatterpiConfig: character.chatterpi_config || {},
                
                // Hardware configuration
                animatronic: character.animatronic || {},
                
                // Enhanced configurations
                enhanced: null,
                assistantConfig: null,
                audioConfig: null,
                personality: null
            };

            // Find enhanced AI character data
            const enhanced = sources.aiCharacters.characters.find(ai => 
                ai.name.toLowerCase().includes(character.char_name.toLowerCase()) ||
                ai.id.toLowerCase().includes(character.char_name.toLowerCase())
            );
            if (enhanced) {
                config.enhanced = enhanced;
                console.log(`     ✅ Found enhanced AI character data`);
            }

            // Find assistant configuration
            if (character.openaiAssistantId && sources.assistants.assistants[character.openaiAssistantId]) {
                config.assistantConfig = sources.assistants.assistants[character.openaiAssistantId];
                console.log(`     ✅ Found assistant configuration with ${config.assistantConfig.conversationStarters.length} conversation starters`);
            }

            // Find audio configuration
            if (sources.audioConfig.characters[character.id]) {
                config.audioConfig = sources.audioConfig.characters[character.id];
                console.log(`     ✅ Found audio configuration`);
            }

            // Find personality configuration
            const personality = sources.personalities.find(p => 
                p.assignedCharacter === character.id.toString()
            );
            if (personality) {
                config.personality = personality;
                console.log(`     ✅ Found personality configuration`);
            }

            characters.push(config);
        }

        console.log(`\n   📊 Extracted configurations for ${characters.length} characters`);
        return characters;
    }

    /**
     * Map character configurations to ElevenLabs format
     */
    async mapToElevenLabsFormat(characters) {
        console.log('\n🔄 Mapping to ElevenLabs format...');
        
        const elevenLabsConfigs = [];
        
        for (const character of characters) {
            console.log(`\n   Mapping character: ${character.name}`);
            
            try {
                const elevenLabsConfig = await this.mapSingleCharacter(character);
                elevenLabsConfigs.push(elevenLabsConfig);
                console.log(`     ✅ Successfully mapped ${character.name}`);
            } catch (error) {
                console.error(`     ❌ Failed to map ${character.name}:`, error.message);
                this.migrationResults.errors.push({
                    type: 'character_mapping_error',
                    character: character.name,
                    message: error.message
                });
            }
        }

        return elevenLabsConfigs;
    }

    /**
     * Map a single character to ElevenLabs format
     */
    async mapSingleCharacter(character) {
        // Build comprehensive prompt from all sources
        const prompt = this.buildComprehensivePrompt(character);
        
        // Select appropriate voice
        const voiceId = this.selectVoiceForCharacter(character);
        
        // Extract conversation starters
        const conversationStarters = this.extractConversationStarters(character);
        
        // Build ElevenLabs agent configuration
        const elevenLabsConfig = {
            // Original character info
            originalCharacterId: character.id,
            originalName: character.name,
            
            // ElevenLabs agent configuration
            agentConfig: {
                name: `${character.name} - MonsterBox`,
                prompt: prompt,
                voice_id: voiceId,
                conversation_config: {
                    turn_detection: {
                        type: 'server_vad',
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 200
                    }
                }
            },
            
            // Preserved settings
            conversationStarters: conversationStarters,
            originalSettings: {
                openaiAssistantId: character.openaiAssistantId,
                aiConfig: character.aiConfig,
                enhanced: character.enhanced,
                personality: character.personality
            },
            
            // Hardware integration
            hardwareConfig: {
                animatronic: character.animatronic,
                chatterpiConfig: character.chatterpiConfig,
                audioConfig: character.audioConfig
            }
        };

        return elevenLabsConfig;
    }

    /**
     * Build comprehensive prompt from all available sources
     */
    buildComprehensivePrompt(character) {
        const promptParts = [];
        
        // Base character description
        if (character.description) {
            promptParts.push(`CHARACTER BACKGROUND: ${character.description}`);
        }

        // Enhanced system prompt (highest priority)
        if (character.enhanced && character.enhanced.systemPrompt) {
            promptParts.push(`ENHANCED PERSONALITY: ${character.enhanced.systemPrompt}`);
        }
        
        // Personality system prompt
        if (character.personality && character.personality.systemPrompt) {
            promptParts.push(`PERSONALITY TRAITS: ${character.personality.systemPrompt}`);
        }
        
        // AI config system prompt
        if (character.aiConfig && character.aiConfig.systemPrompt) {
            promptParts.push(`AI CONFIGURATION: ${character.aiConfig.systemPrompt}`);
        }

        // Enhanced vocabulary and traits
        if (character.enhanced) {
            if (character.enhanced.vocabulary) {
                const vocabSections = Object.entries(character.enhanced.vocabulary)
                    .map(([type, words]) => `${type.toUpperCase()}: ${words.join(', ')}`)
                    .join('\n');
                promptParts.push(`VOCABULARY GUIDELINES:\n${vocabSections}`);
            }
            
            if (character.enhanced.personality && character.enhanced.personality.traits) {
                promptParts.push(`PERSONALITY TRAITS: ${character.enhanced.personality.traits.join(', ')}`);
            }
        }

        // Conversation guidelines
        promptParts.push(`CONVERSATION GUIDELINES:
- Keep responses engaging and conversational (2-4 sentences typically)
- Maintain character consistency throughout the conversation
- Use appropriate vocabulary and speech patterns for the character
- Respond naturally to user input while staying in character
- Reference your background and personality when relevant`);

        return promptParts.join('\n\n');
    }

    /**
     * Select appropriate ElevenLabs voice for character
     */
    selectVoiceForCharacter(character) {
        // Voice mapping based on character type and existing settings
        const voiceMapping = {
            'orlok': '21m00Tcm4TlvDq8ikWAM', // Rachel - mysterious, dramatic
            'coffin breaker': '2EiwWnXFnvU5JabPnv8n', // Clyde - ethereal, haunting
            'pumpkinhead': 'CwhRBWXzGAHq8TQ4Fs17', // Roger - menacing, deep
            'skulltalker': 'EXAVITQu4vr4xnSDxMaL' // Bella - clear, articulate
        };

        const characterName = character.name.toLowerCase();
        
        // Try to match by character name
        for (const [key, voiceId] of Object.entries(voiceMapping)) {
            if (characterName.includes(key)) {
                return voiceId;
            }
        }

        // Default to Rachel for unknown characters
        return '21m00Tcm4TlvDq8ikWAM';
    }

    /**
     * Extract conversation starters from assistant config
     */
    extractConversationStarters(character) {
        if (character.assistantConfig && character.assistantConfig.conversationStarters) {
            return character.assistantConfig.conversationStarters;
        }
        
        // Generate default conversation starters based on character
        return [
            `Hello, I am ${character.name}. How may I assist you?`,
            `Welcome to my domain. What brings you here?`,
            `Greetings, mortal. What would you know?`
        ];
    }

    /**
     * Save migration results
     */
    async saveMigrationResults(elevenLabsConfigs) {
        console.log('\n💾 Saving migration results...');
        
        const migrationData = {
            version: '1.0.0',
            migratedAt: new Date().toISOString(),
            totalCharacters: elevenLabsConfigs.length,
            characters: elevenLabsConfigs,
            errors: this.migrationResults.errors
        };

        const outputPath = path.join(this.dataDir, 'elevenlabs-migration.json');
        await fs.writeFile(outputPath, JSON.stringify(migrationData, null, 2));
        
        console.log(`   ✅ Migration data saved to: ${outputPath}`);
        
        this.migrationResults.characters = elevenLabsConfigs;
        return outputPath;
    }

    /**
     * Generate migration summary
     */
    generateSummary() {
        const summary = {
            totalCharacters: this.migrationResults.characters.length,
            successfulMigrations: this.migrationResults.characters.length,
            errors: this.migrationResults.errors.length,
            characterBreakdown: {}
        };

        // Character breakdown
        this.migrationResults.characters.forEach(char => {
            summary.characterBreakdown[char.originalName] = {
                hasEnhancedConfig: !!char.originalSettings.enhanced,
                hasAssistantConfig: !!char.originalSettings.openaiAssistantId,
                conversationStarters: char.conversationStarters.length,
                hasAnimatronic: !!char.hardwareConfig.animatronic.enabled
            };
        });

        this.migrationResults.summary = summary;

        console.log('\n📊 Migration Summary');
        console.log('===================');
        console.log(`Total Characters: ${summary.totalCharacters}`);
        console.log(`Successful Migrations: ${summary.successfulMigrations}`);
        console.log(`Errors: ${summary.errors}`);
        
        console.log('\nCharacter Details:');
        Object.entries(summary.characterBreakdown).forEach(([name, details]) => {
            console.log(`  ${name}:`);
            console.log(`    Enhanced Config: ${details.hasEnhancedConfig ? '✅' : '❌'}`);
            console.log(`    Assistant Config: ${details.hasAssistantConfig ? '✅' : '❌'}`);
            console.log(`    Conversation Starters: ${details.conversationStarters}`);
            console.log(`    Animatronic: ${details.hasAnimatronic ? '✅' : '❌'}`);
        });
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new ElevenLabsSettingsMigration();
    migration.migrate()
        .then(results => {
            console.log('\n🎉 Migration completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Migration failed:', error.message);
            process.exit(1);
        });
}

module.exports = ElevenLabsSettingsMigration;
