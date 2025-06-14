#!/usr/bin/env node

/**
 * Migration Script: Replica Studios to TopMediai
 * 
 * This script migrates existing Replica voice configurations to TopMediai format.
 * It creates a backup of the original voices.json and updates voice IDs and settings.
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const TopMediaiAPI = require('./topMediaiAPI');

class VoiceMigration {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.backupPath = path.join(__dirname, '../data/voices-replica-backup.json');
        this.topMediaiAPI = new TopMediaiAPI();
        
        // Character-specific voice mappings for TopMediai
        // These are example mappings - you'll need to select appropriate TopMediai voices
        this.characterVoiceMappings = {
            1: { // Orlok - Dark, mysterious male voice
                name: 'Dark Male Voice',
                emotion: 'Serious',
                notes: 'Deep, mysterious voice suitable for vampire character'
            },
            2: { // Coffin Breaker - Spanish female voice
                name: 'Spanish Female Voice', 
                emotion: 'Excited',
                notes: 'Dramatic female voice with Spanish accent'
            },
            3: { // PumpkinHead - Demonic voice
                name: 'Demonic Voice',
                emotion: 'Angry',
                notes: 'Menacing voice for demon character'
            },
            4: { // Skulltalker - Skeleton voice
                name: 'Skeleton Voice',
                emotion: 'Neutral',
                notes: 'Dry, hollow voice for skeleton character'
            }
        };
    }

    async run() {
        try {
            console.log('🔄 Starting migration from Replica Studios to TopMediai...\n');

            // Step 1: Create backup
            await this.createBackup();

            // Step 2: Load available TopMediai voices
            const availableVoices = await this.loadTopMediaiVoices();

            // Step 3: Load current voice configuration
            const currentConfig = await this.loadCurrentConfig();

            // Step 4: Migrate voice configurations
            const migratedConfig = await this.migrateVoices(currentConfig, availableVoices);

            // Step 5: Save migrated configuration
            await this.saveMigratedConfig(migratedConfig);

            // Step 6: Display migration summary
            this.displayMigrationSummary(currentConfig, migratedConfig);

            console.log('\n✅ Migration completed successfully!');
            console.log('📁 Original configuration backed up to:', this.backupPath);
            console.log('🔧 Updated configuration saved to:', this.voicesPath);

        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            logger.error('Voice migration failed', { error: error.message });
            process.exit(1);
        }
    }

    async createBackup() {
        try {
            const originalData = await fs.readFile(this.voicesPath, 'utf8');
            await fs.writeFile(this.backupPath, originalData);
            console.log('✅ Created backup of original voices.json');
        } catch (error) {
            throw new Error(`Failed to create backup: ${error.message}`);
        }
    }

    async loadTopMediaiVoices() {
        try {
            console.log('🔍 Loading available TopMediai voices...');
            const voices = await this.topMediaiAPI.getVoices();
            console.log(`✅ Loaded ${voices.length} TopMediai voices`);
            return voices;
        } catch (error) {
            throw new Error(`Failed to load TopMediai voices: ${error.message}`);
        }
    }

    async loadCurrentConfig() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to load current configuration: ${error.message}`);
        }
    }

    async migrateVoices(currentConfig, availableVoices) {
        const migratedVoices = [];

        for (const voice of currentConfig.voices) {
            console.log(`\n🔄 Migrating voice for character ${voice.characterId}...`);

            // Find suitable TopMediai voice for this character
            const newVoice = this.findSuitableVoice(voice.characterId, availableVoices);
            
            if (!newVoice) {
                console.warn(`⚠️  No suitable TopMediai voice found for character ${voice.characterId}, using default`);
                // Use first available voice as fallback
                newVoice = availableVoices[0];
            }

            // Migrate voice configuration
            const migratedVoice = {
                characterId: voice.characterId,
                speaker_id: newVoice.speaker_id,
                settings: {
                    pitch: voice.settings.pitch || 0,
                    speed: voice.settings.speed || 1,
                    volume: voice.settings.volume || 0,
                    emotion: this.characterVoiceMappings[voice.characterId]?.emotion || 'Neutral',
                    sampleRate: 44100,
                    bitRate: 128,
                    outputFormat: 'mp3', // TopMediai uses MP3
                    channels: 1,
                    languageCode: voice.settings.languageCode || 'en',
                    provider: 'TopMediai'
                },
                metadata: {
                    ...voice.metadata,
                    lastModified: new Date().toISOString(),
                    migratedFrom: 'Replica',
                    migrationDate: new Date().toISOString(),
                    originalSpeakerId: voice.speaker_id,
                    voiceName: newVoice.name,
                    voiceGender: newVoice.gender,
                    voiceLanguage: newVoice.language
                },
                history: [
                    ...voice.history,
                    {
                        timestamp: new Date().toISOString(),
                        type: 'migration',
                        settings: {
                            fromProvider: 'Replica',
                            toProvider: 'TopMediai',
                            fromSpeakerId: voice.speaker_id,
                            toSpeakerId: newVoice.speaker_id,
                            voiceName: newVoice.name
                        }
                    }
                ]
            };

            migratedVoices.push(migratedVoice);
            console.log(`✅ Migrated to TopMediai voice: ${newVoice.name} (${newVoice.speaker_id})`);
        }

        return { voices: migratedVoices };
    }

    findSuitableVoice(characterId, availableVoices) {
        const mapping = this.characterVoiceMappings[characterId];
        if (!mapping) return null;

        // Try to find a voice that matches the character requirements
        let suitableVoice = availableVoices.find(voice => {
            const nameMatch = voice.name.toLowerCase().includes(mapping.name.toLowerCase().split(' ')[0]);
            const emotionMatch = voice.emotions.includes(mapping.emotion);
            return nameMatch || emotionMatch;
        });

        // If no specific match, find by gender for character 1 (Orlok - male) and 2 (Coffin Breaker - female)
        if (!suitableVoice) {
            if (characterId === 1) {
                suitableVoice = availableVoices.find(voice => voice.gender === 'male');
            } else if (characterId === 2) {
                suitableVoice = availableVoices.find(voice => voice.gender === 'female');
            }
        }

        // Fallback to first available voice
        return suitableVoice || availableVoices[0];
    }

    async saveMigratedConfig(migratedConfig) {
        try {
            await fs.writeFile(this.voicesPath, JSON.stringify(migratedConfig, null, 2));
            console.log('✅ Saved migrated configuration');
        } catch (error) {
            throw new Error(`Failed to save migrated configuration: ${error.message}`);
        }
    }

    displayMigrationSummary(originalConfig, migratedConfig) {
        console.log('\n📊 Migration Summary:');
        console.log('====================');
        console.log(`Characters migrated: ${migratedConfig.voices.length}`);
        
        migratedConfig.voices.forEach(voice => {
            const original = originalConfig.voices.find(v => v.characterId === voice.characterId);
            console.log(`\nCharacter ${voice.characterId}:`);
            console.log(`  From: ${original.speaker_id} (Replica)`);
            console.log(`  To:   ${voice.speaker_id} (TopMediai)`);
            console.log(`  Voice: ${voice.metadata.voiceName}`);
            console.log(`  Emotion: ${voice.settings.emotion}`);
        });
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new VoiceMigration();
    migration.run().catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}

module.exports = VoiceMigration;
