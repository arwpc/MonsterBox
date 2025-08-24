#!/usr/bin/env node
/**
 * ElevenLabs Agent Creator
 * Creates ElevenLabs conversational AI agents using migrated character settings
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

class ElevenLabsAgentCreator {
    constructor() {
        this.apiKey = process.env.ELEVENLABS_API_KEY;
        this.baseURL = 'https://api.elevenlabs.io/v1';
        this.headers = {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
        };
        
        this.results = {
            created: [],
            errors: [],
            summary: {}
        };

        if (!this.apiKey) {
            throw new Error('ELEVENLABS_API_KEY environment variable is required');
        }
    }

    /**
     * Create all agents from migration data
     */
    async createAllAgents() {
        console.log('🤖 Creating ElevenLabs Agents');
        console.log('=============================');

        try {
            // Load migration data
            const migrationData = await this.loadMigrationData();
            
            // Create agents for each character
            for (const character of migrationData.characters) {
                await this.createSingleAgent(character);
            }
            
            // Save results
            await this.saveResults();
            
            // Generate summary
            this.generateSummary();
            
            console.log('\n✅ Agent creation completed');
            return this.results;
            
        } catch (error) {
            console.error('❌ Agent creation failed:', error.message);
            throw error;
        }
    }

    /**
     * Load migration data
     */
    async loadMigrationData() {
        const migrationPath = path.join(__dirname, '../data/elevenlabs-migration.json');
        
        try {
            const data = await fs.readFile(migrationPath, 'utf8');
            const migrationData = JSON.parse(data);
            
            console.log(`📂 Loaded migration data for ${migrationData.totalCharacters} characters`);
            return migrationData;
            
        } catch (error) {
            throw new Error(`Failed to load migration data: ${error.message}`);
        }
    }

    /**
     * Create a single ElevenLabs agent
     */
    async createSingleAgent(character) {
        console.log(`\n🎭 Creating agent for: ${character.originalName}`);
        
        try {
            // Create the agent
            const response = await fetch(`${this.baseURL}/convai/agents/create`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(character.agentConfig)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const agent = await response.json();
            
            console.log(`   ✅ Agent created successfully`);
            console.log(`   Agent ID: ${agent.agent_id}`);
            
            // Store result
            const result = {
                originalCharacterId: character.originalCharacterId,
                originalName: character.originalName,
                agentId: agent.agent_id,
                agentConfig: character.agentConfig,
                conversationStarters: character.conversationStarters,
                originalSettings: character.originalSettings,
                hardwareConfig: character.hardwareConfig,
                createdAt: new Date().toISOString()
            };
            
            this.results.created.push(result);
            
            // Test the agent with a signed URL
            await this.testAgentConnection(agent.agent_id, character.originalName);
            
        } catch (error) {
            console.error(`   ❌ Failed to create agent for ${character.originalName}:`, error.message);
            
            this.results.errors.push({
                character: character.originalName,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Test agent connection by generating signed URL
     */
    async testAgentConnection(agentId, characterName) {
        try {
            const response = await fetch(`${this.baseURL}/convai/conversation/get-signed-url?agent_id=${agentId}`, {
                method: 'GET',
                headers: this.headers
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`   ✅ Agent connection test successful`);
                console.log(`   WebSocket URL: ${data.signed_url.substring(0, 50)}...`);
                return true;
            } else {
                console.log(`   ⚠️  Agent connection test failed: HTTP ${response.status}`);
                return false;
            }
        } catch (error) {
            console.log(`   ⚠️  Agent connection test error: ${error.message}`);
            return false;
        }
    }

    /**
     * Save creation results
     */
    async saveResults() {
        console.log('\n💾 Saving agent creation results...');
        
        const resultsData = {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            totalAgents: this.results.created.length,
            successfulCreations: this.results.created.length,
            errors: this.results.errors.length,
            agents: this.results.created,
            errors: this.results.errors
        };

        const outputPath = path.join(__dirname, '../data/elevenlabs-agents.json');
        await fs.writeFile(outputPath, JSON.stringify(resultsData, null, 2));
        
        console.log(`   ✅ Results saved to: ${outputPath}`);
        return outputPath;
    }

    /**
     * Generate summary
     */
    generateSummary() {
        const summary = {
            totalAgents: this.results.created.length,
            successfulCreations: this.results.created.length,
            errors: this.results.errors.length,
            agentDetails: {}
        };

        // Agent details
        this.results.created.forEach(agent => {
            summary.agentDetails[agent.originalName] = {
                agentId: agent.agentId,
                voiceId: agent.agentConfig.voice_id,
                conversationStarters: agent.conversationStarters.length,
                hasAnimatronic: !!agent.hardwareConfig.animatronic.enabled,
                createdAt: agent.createdAt
            };
        });

        this.results.summary = summary;

        console.log('\n📊 Agent Creation Summary');
        console.log('=========================');
        console.log(`Total Agents Created: ${summary.totalAgents}`);
        console.log(`Successful Creations: ${summary.successfulCreations}`);
        console.log(`Errors: ${summary.errors}`);
        
        if (summary.errors > 0) {
            console.log('\nErrors:');
            this.results.errors.forEach(error => {
                console.log(`  ${error.character}: ${error.error}`);
            });
        }
        
        console.log('\nAgent Details:');
        Object.entries(summary.agentDetails).forEach(([name, details]) => {
            console.log(`  ${name}:`);
            console.log(`    Agent ID: ${details.agentId}`);
            console.log(`    Voice ID: ${details.voiceId}`);
            console.log(`    Conversation Starters: ${details.conversationStarters}`);
            console.log(`    Animatronic: ${details.hasAnimatronic ? '✅' : '❌'}`);
        });
    }

    /**
     * Delete all created agents (cleanup utility)
     */
    async deleteAllAgents() {
        console.log('🗑️  Deleting all created agents...');
        
        try {
            const resultsPath = path.join(__dirname, '../data/elevenlabs-agents.json');
            const data = await fs.readFile(resultsPath, 'utf8');
            const results = JSON.parse(data);
            
            for (const agent of results.agents) {
                try {
                    const response = await fetch(`${this.baseURL}/convai/agents/${agent.agentId}`, {
                        method: 'DELETE',
                        headers: this.headers
                    });
                    
                    if (response.ok) {
                        console.log(`   ✅ Deleted agent: ${agent.originalName} (${agent.agentId})`);
                    } else {
                        console.log(`   ⚠️  Failed to delete agent: ${agent.originalName} - HTTP ${response.status}`);
                    }
                } catch (error) {
                    console.log(`   ❌ Error deleting agent ${agent.originalName}: ${error.message}`);
                }
            }
            
        } catch (error) {
            console.error('Failed to load existing agents for deletion:', error.message);
        }
    }
}

// Command line interface
if (require.main === module) {
    const creator = new ElevenLabsAgentCreator();
    
    const command = process.argv[2];
    
    if (command === 'delete') {
        creator.deleteAllAgents()
            .then(() => {
                console.log('\n🎉 Agent deletion completed!');
                process.exit(0);
            })
            .catch(error => {
                console.error('\n💥 Agent deletion failed:', error.message);
                process.exit(1);
            });
    } else {
        creator.createAllAgents()
            .then(results => {
                console.log('\n🎉 Agent creation completed successfully!');
                process.exit(0);
            })
            .catch(error => {
                console.error('\n💥 Agent creation failed:', error.message);
                process.exit(1);
            });
    }
}

module.exports = ElevenLabsAgentCreator;
