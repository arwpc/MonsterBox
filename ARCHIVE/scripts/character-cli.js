#!/usr/bin/env node

/**
 * Character CLI Utility
 * 
 * Simple command line utility for character management without starting the full application.
 * 
 * Usage:
 * - node scripts/character-cli.js --list
 * - node scripts/character-cli.js --status
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class CharacterCLI {
    constructor() {
        this.hostname = os.hostname();
        this.charactersPath = path.join(process.cwd(), 'data', 'characters.json');
        this.lastUsedPath = path.join(process.cwd(), 'data', 'last-used-character.json');
    }

    async listCharacters() {
        try {
            const charactersData = await fs.readFile(this.charactersPath, 'utf8');
            const characters = JSON.parse(charactersData);

            console.log('\n🎭 Available Characters:');
            console.log('========================');
            
            characters.forEach(character => {
                const commandName = character.char_name.toLowerCase().replace(/\s+/g, '');
                console.log(`   ${character.char_name}`);
                console.log(`   Command: npm run start:${commandName}`);
                console.log(`   ID: ${character.id}`);
                if (character.elevenLabsAgentId) {
                    console.log(`   ElevenLabs Agent: ${character.elevenLabsAgentId}`);
                }
                console.log('');
            });
            
            console.log('Usage Examples:');
            console.log('   npm start orlok          # Load Orlok character');
            console.log('   npm start pumpkinhead    # Load PumpkinHead character');
            console.log('   npm start coffin         # Load CoffinBreaker character');
            console.log('   npm start skulltalker    # Load Skulltalker character');
            console.log('   npm start                # Load last used character');
            console.log('');

        } catch (error) {
            console.error('❌ Error listing characters:', error.message);
            process.exit(1);
        }
    }

    async showStatus() {
        try {
            console.log('\n📊 Current Status:');
            console.log('==================');
            console.log(`   Hostname: ${this.hostname}`);
            
            // Check last used character
            try {
                const lastUsedData = await fs.readFile(this.lastUsedPath, 'utf8');
                const lastUsed = JSON.parse(lastUsedData);
                
                if (lastUsed[this.hostname]) {
                    const character = lastUsed[this.hostname];
                    console.log(`   Last Character: ${character.name}`);
                    console.log(`   Character ID: ${character.characterId}`);
                    console.log(`   Loaded At: ${new Date(character.loadedAt).toLocaleString()}`);
                } else {
                    console.log('   Last Character: None for this hostname');
                }
            } catch (error) {
                console.log('   Last Character: None (no history file)');
            }

            // Check if MonsterBox is currently running
            const { exec } = require('child_process');
            exec('pgrep -f "node.*app.js"', (error, stdout) => {
                if (stdout.trim()) {
                    console.log('   MonsterBox Status: Running');
                    console.log(`   Process ID: ${stdout.trim()}`);
                } else {
                    console.log('   MonsterBox Status: Not running');
                }
                console.log('');
            });

        } catch (error) {
            console.error('❌ Error showing status:', error.message);
            process.exit(1);
        }
    }

    async run() {
        const args = process.argv.slice(2);

        if (args.includes('--list') || args.includes('-l')) {
            await this.listCharacters();
        } else if (args.includes('--status') || args.includes('-s')) {
            await this.showStatus();
        } else {
            console.log('\n🎭 MonsterBox Character CLI');
            console.log('============================');
            console.log('');
            console.log('Usage:');
            console.log('   node scripts/character-cli.js --list     # List available characters');
            console.log('   node scripts/character-cli.js --status   # Show current status');
            console.log('');
            console.log('Or use npm scripts:');
            console.log('   npm run list     # List available characters');
            console.log('   npm run status   # Show current status');
            console.log('');
        }
    }
}

// Run the CLI if this file is executed directly
if (require.main === module) {
    const cli = new CharacterCLI();
    cli.run().catch(error => {
        console.error('❌ CLI Error:', error.message);
        process.exit(1);
    });
}

module.exports = CharacterCLI;
