#!/usr/bin/env node

/**
 * Voice Migration Script: TopMedia to ElevenLabs
 * 
 * This script migrates voice data from TopMedia format to ElevenLabs format
 * by updating the voices.json file to use ElevenLabs voice IDs and settings.
 */

const fs = require('fs').promises;
const path = require('path');

class VoiceMigrator {
    constructor() {
        this.voicesPath = path.join(__dirname, '../data/voices.json');
        this.backupPath = path.join(__dirname, '../data/voices-backup-topmediai.json');
        
        // ElevenLabs voice mapping for MonsterBox characters
        this.elevenLabsVoiceMapping = {
            1: { // Orlok
                voiceId: 'pNInz6obpgDQGcFmaJgB', // Adam (deep, dramatic)
                name: 'Adam',
                description: 'Deep, dramatic voice suitable for Orlok'
            },
            2: { // Coffin Breaker  
                voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella (female, mysterious)
                name: 'Bella',
                description: 'Mysterious female voice for Coffin Breaker'
            },
            3: { // PumpkinHead
                voiceId: 'VR6AewLTigWG4xSOukaG', // Josh (energetic, spooky)
                name: 'Josh',
                description: 'Energetic, spooky voice for PumpkinHead'
            },
            4: { // Skulltalker
                voiceId: 'onwK4e9ZLuTAKqWW03F9', // Daniel (clear, authoritative)
                name: 'Daniel',
                description: 'Clear, authoritative voice for Skulltalker'
            }
        };
    }

    async migrate() {
        try {
            console.log('🔄 Starting voice migration from TopMedia to ElevenLabs...');
            
            // Read current voices data
            const voicesData = await this.readVoicesData();
            
            // Create backup
            await this.createBackup(voicesData);
            
            // Migrate voices
            const migratedVoices = await this.migrateVoices(voicesData.voices);
            
            // Save migrated data
            await this.saveVoicesData({ voices: migratedVoices });
            
            console.log('✅ Voice migration completed successfully!');
            console.log(`📁 Backup saved to: ${this.backupPath}`);
            console.log(`📝 Migrated ${migratedVoices.length} voice configurations`);
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    }

    async readVoicesData() {
        try {
            const data = await fs.readFile(this.voicesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Failed to read voices data: ${error.message}`);
        }
    }

    async createBackup(voicesData) {
        try {
            await fs.writeFile(this.backupPath, JSON.stringify(voicesData, null, 2));
            console.log('📋 Created backup of original voices data');
        } catch (error) {
            throw new Error(`Failed to create backup: ${error.message}`);
        }
    }

    async migrateVoices(voices) {
        const migratedVoices = [];
        
        for (const voice of voices) {
            const characterId = parseInt(voice.characterId);
            const elevenLabsVoice = this.elevenLabsVoiceMapping[characterId];
            
            if (!elevenLabsVoice) {
                console.log(`⚠️ No ElevenLabs mapping for character ${characterId}, skipping...`);
                continue;
            }
            
            const migratedVoice = {
                characterId: characterId,
                speaker_id: elevenLabsVoice.voiceId,
                settings: {
                    ...voice.settings,
                    provider: 'ElevenLabs',
                    // Remove TopMedia-specific settings
                    pitch: undefined,
                    emotion: undefined,
                    // Keep compatible settings
                    speed: voice.settings.speed || 1,
                    volume: voice.settings.volume || 0,
                    outputFormat: 'mp3', // ElevenLabs default
                    sampleRate: 44100,
                    bitRate: 128,
                    channels: 1,
                    languageCode: 'en'
                },
                metadata: {
                    ...voice.metadata,
                    voiceName: elevenLabsVoice.name,
                    voiceDescription: elevenLabsVoice.description,
                    migratedFrom: 'TopMediai',
                    migrationDate: new Date().toISOString(),
                    originalSpeakerId: voice.speaker_id,
                    lastModified: new Date().toISOString()
                },
                history: [
                    ...(voice.history || []),
                    {
                        timestamp: new Date().toISOString(),
                        type: 'migration',
                        settings: {
                            fromProvider: 'TopMediai',
                            toProvider: 'ElevenLabs',
                            fromSpeakerId: voice.speaker_id,
                            toSpeakerId: elevenLabsVoice.voiceId,
                            voiceName: elevenLabsVoice.name
                        }
                    }
                ]
            };
            
            // Clean up undefined values
            Object.keys(migratedVoice.settings).forEach(key => {
                if (migratedVoice.settings[key] === undefined) {
                    delete migratedVoice.settings[key];
                }
            });
            
            migratedVoices.push(migratedVoice);
            console.log(`✅ Migrated character ${characterId} to ElevenLabs voice: ${elevenLabsVoice.name}`);
        }
        
        return migratedVoices;
    }

    async saveVoicesData(voicesData) {
        try {
            await fs.writeFile(this.voicesPath, JSON.stringify(voicesData, null, 2));
            console.log('💾 Saved migrated voices data');
        } catch (error) {
            throw new Error(`Failed to save voices data: ${error.message}`);
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    const migrator = new VoiceMigrator();
    migrator.migrate()
        .then(() => {
            console.log('🎉 Migration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Migration failed:', error);
            process.exit(1);
        });
}

module.exports = VoiceMigrator;
